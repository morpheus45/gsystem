// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// node --test tests-iphone/   — modules du bureau : hors ligne, envoi unique, tuiles, brouillon.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Copie avec une passerelle d'essai : le vrai fichier garde PASSERELLE vide (verifie plus bas).
const vrai = new URL('../docs/app/', import.meta.url).pathname;
const D = mkdtempSync(join(tmpdir(), 'iph-'));
for (const f of readdirSync(vrai).filter((x) => x.endsWith('.js'))) cpSync(join(vrai, f), join(D, f));
writeFileSync(join(D, 'package.json'), '{"type":"module"}');
writeFileSync(join(D, 'connexion.js'), readFileSync(join(D, 'connexion.js'), 'utf8').replace("PASSERELLE = ''", "PASSERELLE = 'https://essai.test'"));
const stock = new Map();
globalThis.localStorage = { getItem: (k) => stock.get(k) ?? null, setItem: (k, v) => stock.set(k, String(v)), removeItem: (k) => stock.delete(k) };
let appels, reponse;
globalThis.fetch = async (u, o) => { const p = JSON.parse(o.body); appels.push(p); const r = reponse(p); if (r === null) throw new Error('reseau'); return { ok: true, json: async () => r, text: async () => JSON.stringify(r) }; };
const M = await import(join(D, 'modules.js'));
const V = await import(join(D, 'modulesVue.js'));
const ID = '20000000-0000-4000-8000-000000000001', MOD = '30000000-0000-4000-8000-000000000001';
const champs = [{ cle: 'etat', libelle: 'État', type: 'texte', obligatoire: true }, { cle: 'ph', libelle: 'Photo', type: 'photo' }];
const module = (x = {}) => ({ id: MOD, nom: 'Outillage', couleur: '#e6001c', icone: 'outil', finalite: 'Suivre', conservation_mois: 24, version: 1, champs, ...x });
const saisie = (x = {}) => ({ id: ID, module: MOD, version: 1, date: '2026-11-24', valeurs: { etat: 'Bon', ph: 'MOD_1.jpg' }, nomModule: 'Outillage', champs, creeLe: 5, envoyee: false, refus: '', ...x });
let liste;
const outils = { saisies: () => liste, marquer: (id, e) => { liste = liste.map((s) => (s.id === id && !s.envoyee ? { ...s, ...e } : s)); }, photo: (n) => (n === 'MOD_1.jpg' ? 'data:image/jpeg;base64,AAAA' : null) };
const oui = (p) => (p.action === 'modules_liste' ? { ok: true, modules: [module()], cachees: ['frais', 'cloture'] } : { ok: true, etat: 'ok' });
beforeEach(() => { stock.clear(); stock.set('gsys.connexion', 'a'.repeat(64)); appels = []; reponse = oui; liste = [saisie()]; });

test('la photo puis la saisie, une seule fois, pour l\'iPhone', async () => {
  assert.equal(await M.echanger(outils), true);
  assert.deepEqual(appels.map((p) => p.action || p.month), ['modules_liste', 'modules', 'module_saisie']);
  assert.equal(appels[0].support, 'iphone');
  assert.deepEqual([liste[0].envoyee, liste[0].refus, appels[2].valeurs], [true, '', saisie().valeurs]);
  appels = [];
  assert.equal(await M.echanger(outils), false);
  assert.deepEqual(appels.map((p) => p.action), ['modules_liste']);
});

test('réseau coupé, pièce ou refus : tout reste sur l\'iPhone et repart ensuite', async () => {
  reponse = () => null; await M.echanger(outils);
  assert.deepEqual(liste, [saisie()]);
  reponse = (p) => (p.action === 'module_saisie' ? null : oui(p)); await M.echanger(outils);
  assert.equal(liste[0].envoyee, false);
  for (const r of ['module', 'contenu', 'conflit']) {
    reponse = (p) => (p.action === 'module_saisie' ? { ok: false, error: r } : oui(p)); await M.echanger(outils);
    assert.deepEqual([liste[0].envoyee, liste[0].refus], [false, r]);
  }
  reponse = (p) => (p.action === 'module_saisie' ? { ok: false, error: 'serveur' } : oui(p)); await M.echanger(outils);
  assert.equal(liste[0].envoyee, false);
  reponse = oui; await M.echanger(outils);
  assert.deepEqual([liste[0].envoyee, liste[0].refus], [true, '']);
  liste = [saisie({ valeurs: { etat: 'Bon', ph: 'perdue.jpg' } })]; appels = []; await M.echanger(outils);
  assert.equal(liste[0].refus, 'piece');
  assert.ok(!appels.some((p) => p.action === 'module_saisie'));
});

test('iPhone coupé ou pas connecté : rien ne part', async () => {
  for (const v of [null, 'coupe']) { if (v) stock.set('gsys.connexion', v); else stock.delete('gsys.connexion'); assert.equal(await M.echanger(outils), false); }
  assert.deepEqual([appels, liste], [[], [saisie()]]);
  stock.set('gsys.connexion', 'a'.repeat(64)); reponse = () => ({ ok: false, error: 'token' }); await M.echanger(outils);
  assert.deepEqual([stock.get('gsys.connexion'), liste], ['coupe', [saisie()]]);
});

test('tuiles : clôture, envoi et messages jamais cachés ; arrivée en cours non plus', async () => {
  await M.echanger(outils);
  const c = M.tuilesCachees();
  assert.deepEqual([...c], ['frais']);
  const toutes = new Set(Object.values(M.MASQUABLES));
  for (const e of ['cloture', 'envoi', 'chat']) assert.equal(M.tuileVisible(e, toutes, ''), true);
  assert.equal(M.tuileVisible('frais', c, ''), false);
  assert.equal(M.tuileVisible('pv', new Set(['pv_cameras']), ''), false);
  assert.deepEqual([M.tuileVisible('arrivee', toutes, ''), M.tuileVisible('arrivee', toutes, 'arrivee')], [false, true]);
  reponse = (p) => (p.action === 'modules_liste' ? { ok: true, modules: [module()] } : { ok: true }); await M.echanger(outils);
  assert.deepEqual([...M.tuilesCachees()], ['frais']);   // pas de réponse sur les tuiles : rien ne change
  stock.set('gsys.modules.cachees', '<html>'); assert.equal(M.tuilesCachees().size, 0);
});

test('liste illisible ou module malformé : ignorés, l\'ancienne liste reste', async () => {
  await M.echanger(outils);
  reponse = () => ({ ok: true, modules: 'x' }); await M.echanger(outils);
  assert.equal(M.listeModules().length, 1);
  stock.set('gsys.modules.liste', JSON.stringify([module(), null, module({ id: '"><script>' }), module({ champs: [{ cle: '../x', libelle: 'x' }] }), module({ version: 'x' })]));
  assert.equal(M.listeModules().length, 1);
});

test('brouillon gardé, illisible ignoré', () => {
  const b = { module: module(), id: ID, textes: { etat: 'Bon' } };
  assert.equal(M.garderBrouillon(b), true);
  assert.deepEqual(M.lireBrouillon(MOD), b);
  stock.set('gsys.modules.brouillon.' + MOD, '{'); assert.equal(M.lireBrouillon(MOD), null);
  M.effacerBrouillon(MOD); assert.equal(M.lireBrouillon(MOD), null);
});

test('rien de ce qui vient du bureau ou du technicien ne devient du code dans la page', () => {
  const ech = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const p = '"><img src=x onerror=alert(1)>';
  const ch = ['texte', 'nombre', 'date', 'case', 'liste', 'photo', 'signature'].map((type, i) => ({ cle: 'c' + i, libelle: p, type, choix: [p], obligatoire: true }));
  const m = module({ nom: p, finalite: p, couleur: 'red;' + p, icone: p, conservation_mois: p, champs: ch });
  const textes = Object.fromEntries(ch.map((c) => [c.cle, p]));
  const html = V.tuilesModules([m], [saisie()], ech) + V.vueModule({ module: m, id: ID, textes }, p, () => null, ech)
    + V.vueSaisies([saisie({ nomModule: p, champs: ch, valeurs: textes })], (x) => x, ech);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('red;'));
});

test('identifiants : uuid valables et noms de fichiers acceptés', () => {
  for (let i = 0; i < 50; i++) assert.match(M.nouvelId(), /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.match(M.nomPiece({ cle: 'a'.repeat(40), type: 'signature' }), /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
});

test('version publiée : passerelle éteinte, donc aucun module ni tuile cachée', async () => {
  const R = await import('../docs/app/modules.js');
  stock.set('gsys.modules.liste', JSON.stringify([module()])); stock.set('gsys.modules.cachees', '["frais"]');
  assert.deepEqual([R.listeModules(), R.tuilesCachees().size, await R.echanger(outils), appels], [[], 0, false, []]);
});
