'use strict';
// Vérifie les comptes de Backup.gs hors de Google : node apps-script/test-comptes.js
// Les services Apps Script sont simulés au plus juste (octets signés comme Java).
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const signe = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const octets = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map((b) => b & 255)));

const proprietes = {};
const cache = {};
const feuilles = {};
function feuille(nom) {
  const lignes = [];
  const sh = {
    nom, lignes,
    setName(n) { sh.nom = n; },
    setFrozenRows() {},
    getDataRange: () => ({ getValues: () => lignes.map((l) => l.slice()) }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues(v) { v.forEach((l, i) => l.forEach((x, j) => { (lignes[r - 1 + i] ||= [])[c - 1 + j] = x; })); return this; },
      setValue(x) { (lignes[r - 1] ||= [])[c - 1] = x; return this; },
      setFontWeight() { return this; },
    }),
  };
  return sh;
}

const globaux = {
  Logger: { log: () => {} },
  // Le propriétaire, dans l'éditeur : les fonctions de maintenance l'exigent.
  Session: {
    getActiveUser: () => ({ getEmail: () => 'proprietaire@exemple.fr' }),
    getEffectiveUser: () => ({ getEmail: () => 'proprietaire@exemple.fr' }),
    getScriptTimeZone: () => 'Europe/Paris',
  },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (k in proprietes ? proprietes[k] : null),
    setProperty: (k, v) => { proprietes[k] = String(v); },
  }) },
  CacheService: { getScriptCache: () => ({
    get: (k) => (k in cache ? cache[k] : null),
    put: (k, v) => { cache[k] = String(v); },
    remove: (k) => { delete cache[k]; },
  }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: {
    create(nom) {
      const id = 'feuille-' + Object.keys(feuilles).length;
      const sh = feuille(nom);
      feuilles[id] = sh;
      return { getSheets: () => [sh], getId: () => id };
    },
    openById: (id) => ({ getSheetByName: () => feuilles[id] }),
  },
  ContentService: {
    createTextOutput: (t) => ({ setMimeType: () => t }),
    MimeType: { JSON: 'json' },
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    newBlob: (v) => ({ getBytes: () => signe(octets(v)), getDataAsString: () => octets(v).toString('utf8') }),
    computeDigest: (alg, v) => signe(crypto.createHash('sha256').update(octets(v)).digest()),
    computeHmacSha256Signature: (v, k) => signe(crypto.createHmac('sha256', octets(k)).update(octets(v)).digest()),
    base64Encode: (b) => octets(b).toString('base64'),
    base64Decode: (s) => signe(Buffer.from(s, 'base64')),
    base64EncodeWebSafe: (v) => octets(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => signe(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  },
};
const contexte = vm.createContext(globaux);
const source = fs.readFileSync(path.join(__dirname, 'Backup.gs'), 'utf8');
vm.runInContext(source + '\n;globalThis.__html = DASHBOARD_HTML;', contexte);
const g = contexte;
const poster = (corps) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(corps) } }));

// 1. PBKDF2 identique à la référence Node.
const sel = crypto.randomBytes(16).toString('base64');
assert.strictEqual(g.pbkdf2_('mot de passe é', sel, 1000),
  crypto.pbkdf2Sync(Buffer.from('mot de passe é'), Buffer.from(sel, 'base64'), 1000, 32, 'sha256').toString('base64'));

// 2. Installation + comptes : un tech, un bureau, un tech coupé.
g.installerComptes();
const sh = Object.values(feuilles)[0];
const col = Object.fromEntries(sh.lignes[0].map((h, i) => [h, i]));
const ajouter = (email, nom, role, actif, mdp) => {
  const l = []; l[col.email] = email; l[col.nom] = nom; l[col.role] = role; l[col.actif] = actif;
  l[col.mot_de_passe_provisoire] = mdp; sh.lignes.push(l);
};
ajouter('julien@exemple.fr', 'Julien MARTIN', 'tech', 'OUI', 'Secret-1');
ajouter('bureau@exemple.fr', 'Bureau', 'bureau', 'OUI', 'Bureau-1');
ajouter('parti@exemple.fr', 'Ancien TECH', 'tech', 'NON', 'Parti-1');

// 3. Connexion : mauvais puis bon mot de passe ; le provisoire est haché et effacé.
assert.strictEqual(poster({ action: 'auth_connexion', email: 'julien@exemple.fr', motDePasse: 'faux' }).error, 'identifiants');
const r = poster({ action: 'auth_connexion', email: ' Julien@Exemple.fr ', motDePasse: 'Secret-1' });
assert.ok(r.ok && r.jeton && r.nom === 'Julien MARTIN' && r.role === 'tech', JSON.stringify(r));
assert.strictEqual(sh.lignes[1][col.mot_de_passe_provisoire], '');
assert.ok(String(sh.lignes[1][col.hachage]).startsWith('pbkdf2$'));
assert.strictEqual(poster({ action: 'auth_connexion', email: 'personne@exemple.fr', motDePasse: 'x' }).error, 'identifiants');
assert.strictEqual(poster({ action: 'auth_connexion', email: 'parti@exemple.fr', motDePasse: 'Parti-1' }).error, 'inactif');

// 4. Session : jeton valide, falsifié, absent ; renouvellement.
assert.strictEqual(g.session_(r.jeton).nom, 'Julien MARTIN');
const [charge, signature] = r.jeton.split('.');
assert.strictEqual(g.session_(charge + 'x.' + signature), null);
assert.strictEqual(g.session_(charge + '.' + signature.slice(1) + 'A'), null);
assert.strictEqual(poster({ action: 'chat_fetch', token: 'gsys-backup-ancien' }).error, 'session');
assert.strictEqual(poster({ action: 'chat_fetch' }).error, 'session');
const renouvele = poster({ action: 'auth_renouveler', token: r.jeton });
assert.ok(renouvele.ok && g.session_(renouvele.jeton));

// 5. Jeton expiré refusé.
const DateScript = vm.runInContext('Date', contexte);
const dateReelle = DateScript.now;
DateScript.now = () => dateReelle() + 91 * 24 * 3600 * 1000;
assert.strictEqual(g.session_(r.jeton), null);
DateScript.now = dateReelle;

// 6. Rôles : un tech n'ouvre pas le tableau de bord, le bureau oui.
assert.throws(() => g.requireCode_(r.jeton), /refuse/);
assert.throws(() => g.requireCode_(''), /refuse/);
const b = poster({ action: 'auth_connexion', email: 'bureau@exemple.fr', motDePasse: 'Bureau-1' });
g.requireCode_(b.jeton);
assert.strictEqual(g.boConnexion('julien@exemple.fr', 'Secret-1').error, 'role');
assert.ok(g.boConnexion('bureau@exemple.fr', 'Bureau-1').ok);

// 7. Blocage après 5 échecs, même avec le bon mot de passe.
for (let i = 0; i < 5; i++) poster({ action: 'auth_connexion', email: 'bureau@exemple.fr', motDePasse: 'faux' });
assert.strictEqual(poster({ action: 'auth_connexion', email: 'bureau@exemple.fr', motDePasse: 'Bureau-1' }).error, 'bloque');

// 8. Réinitialisation : nouveau mot de passe provisoire = anciennes sessions coupées.
sh.lignes[1][col.mot_de_passe_provisoire] = 'Secret-2';
g.hacherMotsDePasseProvisoires();
assert.strictEqual(g.session_(renouvele.jeton), null);
assert.ok(poster({ action: 'auth_connexion', email: 'julien@exemple.fr', motDePasse: 'Secret-2' }).ok);

// 9. Coupure d'accès : « actif » = NON, effet dès que le cache expire.
const j2 = poster({ action: 'auth_connexion', email: 'julien@exemple.fr', motDePasse: 'Secret-2' }).jeton;
sh.lignes[1][col.actif] = 'NON';
delete cache.comptes;
assert.strictEqual(g.session_(j2), null);

// 10. Le JavaScript de la page du tableau de bord reste valide.
for (const [, code] of g.__html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);

console.log('Comptes : 10 vérifications OK');
