// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// node --test tests-iphone/   — la sauvegarde de l'iPhone ne perd rien.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const stock = new Map();
globalThis.localStorage = { getItem: (k) => stock.get(k) ?? null, setItem: (k, v) => stock.set(k, String(v)), removeItem: (k) => stock.delete(k) };
let drive, panne, appels;
globalThis.fetch = async (u, o) => {
  const p = JSON.parse(o.body); appels.push(p);
  if (panne) throw new Error('reseau');
  const cle = (p.month || '') + '/' + p.fileName;
  let r = { ok: true };
  if (p.action === 'photo_pull') r = drive.has(cle) ? { ok: true, dataBase64: drive.get(cle) } : { ok: false, error: 'not found' };
  else if (!p.action) drive.set(cle, p.dataBase64);
  return { ok: true, json: async () => r, text: async () => JSON.stringify(r) };
};
const S = await import('../docs/app/sauvegarde.js');
const t = (id, x = {}) => ({ id, date: '2026-11-24', ville: 'Sète', ...x });
const etat = (temps, photos = {}) => ({ tech: 'Un', entrees: { temps, frais: [], compteur: [], gesteCo: [] }, reglages: { nomUtilisateur: 'Un' }, complets: true,
  clesPhotos: Object.keys(photos), photo: (c) => photos[c] || null });
const contenu = () => JSON.parse(Buffer.from(drive.get('__root__/' + S.FICHIER), 'base64').toString());
const villes = () => contenu().entrees.temps.map((x) => x.id).sort();
beforeEach(() => { stock.clear(); drive = new Map(); panne = false; appels = []; });

test('envoie tout, accents compris ; un second passage ne renvoie rien', async () => {
  assert.equal(await S.sauvegarder(etat([t('a')], { 'frais 1': 'data:image/jpeg;base64,AAAA' })), 'ok');
  assert.equal(contenu().entrees.temps[0].ville, 'Sète');
  assert.equal(drive.get('iphone/frais_1.jpg'), 'AAAA');
  appels = [];
  assert.equal(await S.sauvegarder(etat([t('a')], { 'frais 1': 'data:image/jpeg;base64,AAAA' })), 'ok');
  assert.equal(appels.filter((p) => !p.action).length, 0);
});

test('iPhone neuf ou vidé : le Drive garde tout et propose de restaurer', async () => {
  await S.sauvegarder(etat([t('a'), t('b')]));
  stock.clear();
  assert.equal(await S.sauvegarder(etat([])), 'restaurer');
  assert.deepEqual(villes(), ['a', 'b']);
  assert.equal(await S.sauvegarder(etat([t('c')])), 'restaurer');
  assert.deepEqual(villes(), ['a', 'b', 'c']);
});

test('supprimer sur cet iPhone retire du fichier ; modifier garde la version de l\'iPhone', async () => {
  await S.sauvegarder(etat([t('a'), t('b')]));
  assert.equal(await S.sauvegarder(etat([t('a', { ville: 'Agde' })])), 'ok');
  assert.deepEqual(villes(), ['a']);
  assert.equal(contenu().entrees.temps[0].ville, 'Agde');
});

test('panne, réponse vide ou sauvegarde illisible : on n\'écrase jamais', async () => {
  await S.sauvegarder(etat([t('a')]));
  const avant = drive.get('__root__/' + S.FICHIER);
  panne = true;
  assert.equal(await S.sauvegarder(etat([t('b')])), 'attente');
  panne = false;
  for (const abime of [Buffer.from('{').toString('base64'), Buffer.from('{}').toString('base64'), '']) {
    drive.set('__root__/' + S.FICHIER, abime);
    assert.equal(await S.sauvegarder(etat([t('b')])), 'attente');
    assert.equal(drive.get('__root__/' + S.FICHIER), abime);
  }
  drive.set('__root__/' + S.FICHIER, avant);
});

test('restaurer complète sans remplacer, photos comprises', async () => {
  await S.sauvegarder(etat([t('a'), t('b')], { p1: 'data:image/png;base64,BBBB' }));
  stock.clear();
  const gardees = {};
  const r = await S.restaurer(etat([t('a', { ville: 'Local' })]), async (c, d) => { gardees[c] = d; return true; });
  assert.deepEqual(r.entrees.temps.map((x) => [x.id, x.ville]), [['a', 'Local'], ['b', 'Sète']]);
  assert.equal(r.photos, 1);
  assert.ok(gardees.p1.endsWith('BBBB'));
});

test('deux photos ne portent jamais le même nom', () => {
  const n = Object.values(S.nomsPhotos(['a b', 'a_b', 'A_B.jpg', 'a_b.jpg', '../x', '..']));
  assert.equal(new Set(n.map((x) => x.toLowerCase())).size, 6);
  for (const x of n) assert.match(x, /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|png)$/);
});

test('200 étapes au hasard avec pannes : seule une suppression volontaire retire une entrée', async () => {
  let g = 3; const alea = (n) => (g = (g * 1103515245 + 12345) % 2147483648) % n;
  let local = [], n = 0; const voulus = new Set();
  for (let i = 0; i < 200; i++) {
    const a = alea(5);
    if (a < 2) { const id = 'e' + n++; local.push(t(id)); voulus.add(id); }
    else if (a === 2 && local.length) { const x = local.splice(alea(local.length), 1)[0]; panne = false; await S.sauvegarder(etat([...local, x])); await S.sauvegarder(etat(local)); voulus.delete(x.id); }
    else if (a === 3) { panne = true; await S.sauvegarder(etat(local)); panne = false; }
    else { await S.sauvegarder(etat(local)); if (alea(4) === 0) { stock.clear(); local = (await S.restaurer(etat([]), async () => true))?.entrees.temps ?? []; } }
    if (a !== 3) await S.sauvegarder(etat(local));
  }
  await S.sauvegarder(etat(local));
  assert.deepEqual(villes(), [...voulus].sort());
});

test('reglages : le Drive ne remplit que le vide', () => {
  const r = S.completerReglages({ nomUtilisateur: 'D', plaqueVoiture: 'P', envoiHistoryIso: ['2026-09-18'], lastEnvoiDateIso: '2026-10-23' }, { nomUtilisateur: 'L', plaqueVoiture: '', envoiHistoryIso: ['2026-10-23'], lastEnvoiDateIso: '' });
  assert.deepEqual([r.nomUtilisateur, r.plaqueVoiture, r.lastEnvoiDateIso, r.envoiHistoryIso], ['L', 'P', '2026-10-23', ['2026-09-18', '2026-10-23']]);
});
