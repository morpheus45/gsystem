// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Saisies : lecture en clair et libellés réservés à l'admin et à la gestion.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';
import { texteReponse, reponses, lireSaisie } from '../core/saisies.js';

const A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const OP = u('99'), UG = u('a2'), UC = u('a3'), UB = u('b1'), T1 = u('a9');
const V1 = [{ cle: 'etat', libelle: 'État', type: 'texte', obligatoire: true }];
const V2 = [...V1, { cle: 'km', libelle: 'Km', type: 'nombre', obligatoire: false }];
let db, m;
const op = (q, p) => db.comme(OP, () => db.query(q, p));
const enreg = (id, champs) => op('select enregistrer_module_perso($1, $2, $3, $4, $5, 24, $6) as id',
  [id, 'Outillage', 'outil', '#e6001c', 'Suivre l\'état des outils', JSON.stringify(champs)]);
const vus = (x, s = A) => db.comme(x, async () => (await db.query('select * from modules_saisis($1)', [s])).rows);

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${OP}'), ('${UG}'), ('${UC}'), ('${UB}');
    insert into operateurs (user_id) values ('${OP}');
    insert into societes (id, nom) values ('${A}', 'A'), ('${B}', 'B');
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('${T1}', '${A}', 'Un');`);
  m = (await enreg(null, V1)).rows[0].id;
  await enreg(m, V2);
  await op('select attribuer_module_perso($1, null, $2, true)', [m, A]);
});

test('les modules en service, avec toutes leurs versions ; ni comptable ni autre société', async () => {
  const [r] = await vus(UG);
  assert.deepEqual([r.nom, r.conservation_mois, Object.keys(r.versions), r.versions[2].length], ['Outillage', 24, ['1', '2'], 2]);
  assert.deepEqual([await vus(UC), await vus(UB), await vus(UB, B)], [[], [], []]);
});

test('un module désactivé reste lisible s\'il a des saisies, pas sinon', async () => {
  await op('select activer_module_perso($1, false)', [m]);
  assert.deepEqual(await vus(UG), []);
  await db.query(`insert into saisies_modules (id, societe_id, technicien_id, module_id, version, date, valeurs)
    values ('${u('0a')}', '${A}', '${T1}', '${m}', 1, '2026-11-24', '{"etat":"Bon"}')`);
  assert.equal((await vus(UG)).length, 1);
  assert.deepEqual(await vus(UB, B), []);
});

test('réponses en clair : zéro et Non ne sont pas des vides ; rien ne se cache', () => {
  assert.equal(texteReponse({ type: 'case' }, false), 'Non');
  assert.equal(texteReponse({ type: 'nombre' }, 0), '0');
  assert.equal(texteReponse({ type: 'date' }, '2026-11-24'), '24/11/2026');
  assert.equal(texteReponse({ type: 'photo' }, 'a.jpg'), 'Photo dans le Drive (a.jpg)');
  for (const v of [undefined, null, '']) assert.equal(texteReponse({ type: 'texte' }, v), null);
  assert.deepEqual(reponses(V2, { km: 12.5, inconnu: 'x' }), [{ libelle: 'État', texte: null }, { libelle: 'Km', texte: '12,5' }, { libelle: 'inconnu', texte: 'x' }]);
  assert.deepEqual(reponses(undefined, { etat: 'Bon' }), [{ libelle: 'etat', texte: 'Bon' }]);
});

test('formulaire du bureau : mêmes règles que la base', () => {
  const c = (type, obligatoire = false) => [{ cle: 'x', libelle: 'X', type, obligatoire, choix: ['Bon'] }];
  for (const [t, v] of [['12,5', 12.5], ['1 234', 1234], ['0', 0], ['-3', -3]]) assert.deepEqual(lireSaisie(c('nombre'), { x: t }), { valeurs: { x: v } });
  for (const t of ['abc', '1,2,3', 'NaN', '1e5']) assert.match(lireSaisie(c('nombre'), { x: t }).defaut, /nombre invalide/);
  assert.deepEqual(lireSaisie(c('case', true), { x: 'non' }), { valeurs: { x: false } });
  assert.match(lireSaisie(c('texte', true), { x: '  ' }).defaut, /à remplir/);
  assert.deepEqual(lireSaisie(c('photo', true), { x: 'a.jpg' }), { valeurs: {} });
  assert.deepEqual(lireSaisie(c('texte'), {}), { valeurs: {} });
});
