// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Où sert un module : téléphone, iPhone, bureau ; holding puis société. Saisie au bureau.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const H = '10000000-0000-0000-0000-0000000000f1', A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const OP = u('99'), UA = u('a1'), UG = u('a2'), UC = u('a3'), UB = u('b1'), T1 = u('a9'), TB = u('b9');
const CHAMPS = [{ cle: 'etat', libelle: 'État', type: 'texte', obligatoire: true }, { cle: 'ph', libelle: 'Photo', type: 'photo', obligatoire: true }];
const auj = new Date().toISOString().slice(0, 10);
let db, m, jeton;
const service = async (q, p) => { await db.exec('reset role; set role service_role'); try { return (await db.query(q, p)).rows; } finally { await db.exec('reset role'); } };
const op = (q, p) => db.comme(OP, () => db.query(q, p));
const attribuer = (h, s, actif, sup) => op('select attribuer_module_perso($1, $2, $3, $4, $5)', [m, h, s, actif, sup]);
const tel = async (sup) => (await service('select * from telephone_modules($1, $2)', [jeton, sup])).length;
const bureau = (x, s = A) => db.comme(x, async () => (await db.query('select * from modules_bureau($1)', [s])).rows.length);
const ou = async () => [await tel('apk'), await tel('iphone'), await bureau(UG)];
const saisir = (x, id, { s = A, t = T1, v = { etat: 'Bon' }, date = auj, version = 1 } = {}) => db.comme(x, async () => (await db.query(
  'select saisir_module_bureau($1, $2, $3, $4, $5, $6, $7) as r', [id, s, t, m, version, date, JSON.stringify(v)])).rows[0].r);

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${OP}'), ('${UA}'), ('${UG}'), ('${UC}'), ('${UB}');
    insert into operateurs (user_id) values ('${OP}');
    insert into holdings (id, nom) values ('${H}', 'H');
    insert into societes (id, nom, holding_id) values ('${A}', 'A', '${H}'), ('${B}', 'B', null);
    insert into membres values ('${A}', '${UA}', 'admin'), ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T1}', '${A}', 'Un', 'UN'), ('${TB}', '${B}', 'B', 'BB');
    insert into techniciens_mail values ('${T1}', '${A}', 'un@exemple.test');`);
  m = (await op('select enregistrer_module_perso(null, $1, $2, $3, $4, 24, $5) as id',
    ['Outillage', 'outil', '#e6001c', 'Suivre l\'état des outils', JSON.stringify(CHAMPS)])).rows[0].id;
  const [d] = await service('select * from telephone_demander_code($1)', ['un@exemple.test']);
  jeton = (await service('select * from telephone_connecter($1, $2, $3, true)', ['un@exemple.test', d.code, 'Tel']))[0].jeton;
});

test('chaque support s\'allume séparément, par holding puis par société', async () => {
  assert.deepEqual(await ou(), [0, 0, 0]);
  await op('select attribuer_module_perso($1, $2, null, true)', [m, H]);   // ancien appel de la page : les téléphones, comme avant
  assert.deepEqual(await ou(), [1, 1, 0]);
  await attribuer(H, null, true, ['iphone']);
  assert.deepEqual(await ou(), [0, 1, 0]);
  await attribuer(null, A, true, ['bureau', 'apk']);                        // la société l'emporte
  assert.deepEqual(await ou(), [1, 0, 1]);
  await attribuer(null, A, false, null);                                     // coupé pour elle, réglage gardé
  assert.deepEqual(await ou(), [0, 0, 0]);
  await attribuer(null, A, true, null);
  assert.deepEqual(await ou(), [1, 0, 1]);
  await attribuer(null, A, null, null);                                      // suit de nouveau sa holding
  assert.deepEqual(await ou(), [0, 1, 0]);
  assert.equal(await tel('bureau'), 0);
  assert.equal(await tel('x'), 0);
});

test('supports faux ou vides refusés ; super admin seulement', async () => {
  for (const s of [['tv'], ['apk', 'tv']]) await assert.rejects(attribuer(H, null, true, s), /check|violates/);
  await attribuer(H, null, true, ['apk']);
  await attribuer(H, null, true, []);   // liste vide : le réglage ne change pas
  assert.deepEqual(await ou(), [1, 0, 0]);
  await assert.rejects(db.comme(UA, () => db.query('select attribuer_module_perso($1, null, $2, true, $3)', [m, A, ['apk']])), /super admin/);
});

test('saisie au bureau : seulement si allumée, par admin ou gestion, pour un technicien de la société', async () => {
  assert.equal(await saisir(UG, u('01')), 'module');
  await attribuer(null, A, true, ['bureau']);
  assert.equal(await saisir(UG, u('01')), 'ok');
  assert.equal(await saisir(UG, u('01')), 'deja');
  assert.equal(await saisir(UA, u('01'), { v: { etat: 'Autre' } }), 'conflit');
  assert.equal(await saisir(UA, u('02')), 'ok');
  for (const x of [UC, UB]) await assert.rejects(saisir(x, u('03')), /reserve/);
  await assert.rejects(saisir(UG, u('03'), { t: TB }), /technicien inconnu/);
  for (const o of [{ v: {} }, { v: null }, { v: [] }, { v: { etat: 'Bon', ph: 'a.jpg' } }, { v: { etat: 'Bon', x: 1 } }, { date: '2000-01-01' }]) assert.equal(await saisir(UG, u('03'), o), 'contenu');
  assert.equal(await saisir(UG, u('03'), { version: 9 }), 'module');
  assert.deepEqual((await db.query('select saisie_par from saisies_modules order by id')).rows.map((r) => r.saisie_par), [UG, UA]);
  assert.deepEqual([await bureau(UC), await bureau(UB)], [0, 0]);
});

test('le bureau ne peut pas occuper l\'identifiant d\'une saisie d\'une autre société', async () => {
  await attribuer(null, B, true, ['bureau']);
  assert.equal(await saisir(UB, u('01'), { s: B, t: TB }), 'conflit');
  await assert.rejects(db.query(`update saisies_modules set saisie_par = null`), /modification interdite/);
});
