// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Passerelle des téléphones : rien ne s'efface, chacun son dossier, refus sans détail.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traiter, nomSur, dossierEcriture } from '../passerelle/logique.js';

const b64 = (t) => Buffer.from(t).toString('base64');
let journal, panne;
// Faux Drive : comme le vrai, deux fichiers peuvent porter le même nom.
function dossier(nom) {
  const d = { nom, fs: [], ds: [] };
  d.dossiers = () => d.ds;
  d.fichiers = () => [...d.fs];
  d.dossier = (n, creer) => d.ds.find((x) => x.nom === n) ?? (creer ? (d.ds.push(dossier(n)), d.ds.at(-1)) : null);
  d.creer = (n, _m, c) => { if (panne === 'creer') throw new Error('quota'); journal.push(`creer ${n}`); d.poser(n, c); };
  d.poser = (n, c, date = 1) => {
    const f = { nom: n, c, date, base64: () => f.c, texte: () => Buffer.from(f.c, 'base64').toString(), reecrire: (x) => { f.c = x; },
      ranger: (dest, nn) => { journal.push(`ranger ${f.nom}`); d.fs = d.fs.filter((x) => x !== f); f.nom = nn; dest.fs.push(f); } };
    d.fs.push(f);
    return f;
  };
  return d;
}
const JU = 'a'.repeat(64), JD = 'b'.repeat(64);
let un, deux, mails, relais, env;
const contenus = (d) => [...d.fs.map((f) => f.c), ...d.ds.flatMap(contenus)];
beforeEach(() => {
  journal = []; panne = null; mails = []; relais = [];
  un = dossier('UN'); deux = dossier('DEUX');
  const m = un.dossier('2026-10', true);
  m.poser('donnees.json', b64('v1')); m.poser('FRAIS.jpg', b64('photo')); m.poser('x.xlsm', b64('excel')); m.poser('_stats.json', b64('s1'));
  deux.dossier('2026-10', true).poser('donnees.json', b64('secret de DEUX'));
  env = { maintenant: () => Date.UTC(2026, 10, 24), mail: (...a) => mails.push(a), relais: (p) => (relais.push(p), { ok: true }),
    drive: (n) => ({ UN: un, DEUX: deux })[n],
    base: { verifier: (j) => ({ [JU]: { dossier: 'UN' }, [JD]: { dossier: 'DEUX' } })[j] ?? null,
      demanderCode: (x) => (x === 'un@exemple.test' ? { mail: x, nom: 'Un', code: '123456' } : null),
      connecter: (x, c, a, ok) => (c !== '123456' ? { etat: 'refus' } : ok ? { etat: 'ok', jeton: JU, ancien: 'Vieux', mail: x, nom: 'Un' } : { etat: 'remplace', ancien: 'Vieux' }) } };
});
const go = (p) => traiter({ jeton: JU, ...p }, env);

test('sans jeton valable : refus, rien de lu ni d\'écrit', () => {
  for (const j of [undefined, null, '', 'x', 'c'.repeat(64), { $ne: 1 }, 'A'.repeat(64)])
    for (const action of ['upload', 'restore_list', 'photo_pull', 'cycle_prune', 'ordres_pull', 'chat_fetch', 'inconnu'])
      assert.deepEqual(traiter({ jeton: j, action, token: 'ancien' }, env), { ok: false, error: 'token' });
  assert.deepEqual(traiter(null, env), { ok: false, error: 'token' });
  assert.deepEqual([journal, relais], [[], []]);
});

test('le nom écrit par le téléphone ne compte pas : chacun son dossier', () => {
  assert.equal(go({ action: 'restore_list', user: 'DEUX' }).cycles[0].donnees, 'v1');
  go({ user: 'DEUX', month: '2026-10', fileName: 'donnees.json', dataBase64: b64('pirate') });
  assert.equal(deux.dossier('2026-10').fs[0].c, b64('secret de DEUX'));
  go({ action: 'chat_send', tech: 'DEUX', text: 'salut' });
  assert.equal(relais[0].tech, 'UN');
});

test('remplacer : le nouveau d\'abord, l\'ancien gardé dans l\'historique', () => {
  assert.ok(go({ month: '2026-10', fileName: 'donnees.json', dataBase64: b64('v2') }).ok);
  assert.deepEqual(journal, ['creer donnees.json', 'ranger donnees.json']);
  assert.equal(un.dossier('2026-10').fs.filter((f) => f.nom === 'donnees.json').length, 1);
  assert.equal(go({ action: 'restore_list' }).cycles[0].donnees, 'v2');
  assert.equal(un.dossier('_historique').dossier('2026-10').fs[0].c, b64('v1'));
});

test('panne pendant l\'écriture : l\'ancien fichier est toujours là', () => {
  panne = 'creer';
  assert.throws(() => go({ month: '2026-10', fileName: 'donnees.json', dataBase64: b64('v2') }));
  assert.equal(go({ action: 'restore_list' }).cycles[0].donnees, 'v1');
});

test('contenu identique : rien ne bouge', () => {
  assert.ok(go({ month: '2026-10', fileName: 'donnees.json', dataBase64: b64('v1') }).identique);
  assert.deepEqual(journal, []);
});

test('ranger un mois : rien n\'est effacé, les livrables ne bougent pas', () => {
  const avant = contenus(un).sort();
  assert.deepEqual(go({ action: 'cycle_prune', month: '2026-10', keep: ['donnees.json'] }), { ok: true, trashed: 1 });
  assert.deepEqual(contenus(un).sort(), avant);
  assert.deepEqual(un.dossier('2026-10').fs.map((f) => f.nom).sort(), ['_stats.json', 'donnees.json', 'x.xlsm']);
});

test('une liste vide, absente ou fausse ne vide pas le mois', () => {
  for (const keep of [undefined, null, [], 'donnees.json', {}, ['FRAIS.jpg']])
    assert.equal(go({ action: 'cycle_prune', month: '2026-10', keep }).ok, false);
  for (const month of ['', '__root__', '_historique', '_secours', 'ordres', '..', undefined])
    assert.equal(go({ action: 'cycle_prune', month, keep: ['donnees.json'] }).ok, false);
  assert.deepEqual(journal, []);
});

test('500 ordres au hasard, même avec un jeton volé : aucun contenu ne disparaît', () => {
  let g = 7;
  const alea = (n) => (g = (g * 1103515245 + 12345) % 2147483648) % n;
  const vus = new Set(contenus(un)), noms = ['donnees.json', 'FRAIS.jpg', 'x.xlsm', 'a.json', '_stats.json', '../x', ''];
  const mois = ['2026-10', '2026-11', '__root__', '_secours', '_historique', 'ordres', '..', null];
  for (let i = 0; i < 500; i++) {
    const month = mois[alea(mois.length)], fileName = noms[alea(noms.length)], c = b64(`c${i}`);
    if (alea(3)) { const r = go({ month, fileName, dataBase64: c }); if (r.ok && fileName !== '_stats.json') vus.add(c); } else go({ action: 'cycle_prune', month, keep: alea(2) ? ['donnees.json'] : [] });
  }
  vus.delete(b64('s1'));
  const la = new Set(contenus(un));
  assert.deepEqual([...vus].filter((x) => !la.has(x)), []);
  assert.deepEqual(contenus(deux), [b64('secret de DEUX')]);
});

test('noms et dossiers interdits ; les ordres du bureau ne sont pas modifiables', () => {
  for (const n of ['', '..', 'a/b', 'a\\b', ' a', 'a\n', 'x'.repeat(121), 5, null]) assert.equal(nomSur(n), false);
  for (const d of ['ordres', 'Ordres', '_historique', '..', 'a/b']) assert.equal(dossierEcriture(d), null);
  assert.equal(go({ month: 'ordres', fileName: 'x.pdf', dataBase64: b64('x') }).ok, false);
  assert.equal(go({ action: 'photo_pull', month: '_historique', fileName: 'x' }).ok, false);
  go({ month: '_secours', fileName: 's.json', dataBase64: b64('1') });
  assert.equal(go({ month: '_secours', fileName: 's.json', dataBase64: b64('2') }).error, 'existe');
});

test('la conversation ne peut pas être supprimée par la passerelle', () => {
  assert.equal(go({ action: 'chat_delete' }).ok, false);
  assert.deepEqual(relais, []);
});

test('connexion : même réponse pour un mail inconnu, alerte au changement, mail en panne sans blocage', () => {
  const f = (p) => traiter(p, env);
  assert.deepEqual(f({ action: 'code_demander', mail: 'un@exemple.test' }), f({ action: 'code_demander', mail: 'x@exemple.test' }));
  assert.equal(mails.length, 1);
  const q = { action: 'connecter', mail: 'un@exemple.test', code: '123456', appareil: 'Neuf' };
  assert.deepEqual(f({ ...q, code: '1' }), { ok: false, error: 'refus' });
  assert.equal(f(q).etat, 'remplace');
  assert.equal(f({ ...q, confirme: 'true' }).jeton, undefined);   // seul le vrai « oui » compte
  env.mail = () => { throw new Error('quota'); };
  assert.equal(f({ ...q, confirme: true }).jeton, JU);
});

test('le script Google ne contient aucun appel d\'effacement ni de partage', () => {
  const code = readFileSync(new URL('../passerelle/apps-script.js', import.meta.url), 'utf8') + readFileSync(new URL('../passerelle/logique.js', import.meta.url), 'utf8');
  for (const mot of ['setTrashed', 'removeFile', 'removeFolder', 'Drive.Files', 'deleteRow', 'setSharing', 'addViewer', 'addEditor', 'clearContent']) assert.ok(!code.includes(mot), mot);
});

test('modules : la liste et la saisie passent par le jeton ; seuls ok et deja valent reçu', () => {
  const id = '20000000-0000-0000-0000-000000000001', module = '20000000-0000-0000-0000-0000000000aa';
  const recus = [];
  let rep = 'ok';
  env.base.modules = (j) => [{ nom: 'Outillage ' + (j === JU) }];
  env.base.tuiles = () => null;
  env.base.saisie = (x) => (recus.push(x), rep);
  assert.deepEqual(go({ action: 'modules_liste' }), { ok: true, modules: [{ nom: 'Outillage true' }] });
  env.base.tuiles = () => ['frais'];
  assert.deepEqual(go({ action: 'modules_liste' }).cachees, ['frais']);
  const bonne = { action: 'module_saisie', id, module, version: 1, date: '2026-11-24', valeurs: { etat: 'Bon' } };
  assert.deepEqual(go(bonne), { ok: true, etat: 'ok' });
  assert.deepEqual(recus, [{ p_jeton: JU, p_id: id, p_module: module, p_version: 1, p_date: '2026-11-24', p_valeurs: { etat: 'Bon' } }]);
  for (const [r, attendu] of [['deja', { ok: true, etat: 'deja' }], ['conflit', { ok: false, error: 'conflit' }],
    ['module', { ok: false, error: 'module' }], ['jeton', { ok: false, error: 'token' }], [undefined, { ok: false, error: 'serveur' }]]) {
    rep = r;
    assert.deepEqual(go(bonne), attendu);
  }
  recus.length = 0;
  for (const faux of [{ id: 'x' }, { id: null }, { module: '../x' }, { version: '1' }, { version: 0 }, { date: '2026-02-31' }, { date: 'x' },
    { valeurs: null }, { valeurs: [] }, { valeurs: 'x' }]) assert.deepEqual(go({ ...bonne, ...faux }), { ok: false, error: 'contenu' });
  for (const action of ['modules_liste', 'module_saisie']) assert.deepEqual(traiter({ ...bonne, action, jeton: 'c'.repeat(64) }, env), { ok: false, error: 'token' });
  assert.deepEqual(recus, []);
  assert.deepEqual(journal, []);   // rien dans le Drive
});

test('la photo d\'un module se dépose à part et n\'est jamais rangée par le nettoyage', () => {
  assert.ok(go({ month: 'modules', fileName: 'MOD_1.jpg', dataBase64: b64('p') }).ok);
  go({ action: 'cycle_prune', month: '2026-10', keep: ['donnees.json'] });
  assert.equal(go({ action: 'cycle_prune', month: 'modules', keep: ['donnees.json'] }).error, 'liste');
  assert.equal(un.dossier('modules').fs[0].nom, 'MOD_1.jpg');
  assert.deepEqual(go({ action: 'restore_list' }).cycles.map((c) => c.month), ['2026-10']);
});
