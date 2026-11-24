// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Code tech : format, qui le remplit, et la liste pour le script caché.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';
import { normaliserCodeTech } from '../core/code-tech.js';

const A = '10000000-0000-0000-0000-00000000000a';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const UG = u('a1'), UC = u('a3'), T1 = u('a9'), T2 = u('a8');
let db;
const service = async (q) => { await db.exec('reset role; set role service_role'); try { return (await db.query(q)).rows; } finally { await db.exec('reset role'); } };

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UC}');
    insert into societes (id, nom) values ('${A}', 'A');
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T1}', '${A}', 'Un', 'UN'), ('${T2}', '${A}', 'Deux', '');`);
});

test('format : lettres et chiffres, mis en majuscules ; vide accepté', () => {
  assert.equal(normaliserCodeTech(' istgs54 '), 'ISTGS54');
  assert.equal(normaliserCodeTech(''), '');
  assert.equal(normaliserCodeTech('ist gs54'), 'ISTGS54');
  for (const x of ['a', 'IST-54', 'A'.repeat(21)]) assert.equal(normaliserCodeTech(x), null);
});

test('la gestion remplit le code ; le comptable ne le change pas', async () => {
  await db.comme(UG, () => db.query(`update techniciens set code_tech = 'ISTGS54' where id = '${T1}'`));
  await db.comme(UC, () => db.query(`update techniciens set code_tech = 'PIRATE' where id = '${T1}'`));   // aucune ligne touchée
  assert.equal((await db.comme(UG, () => db.query(`select code_tech from techniciens where id = '${T1}'`))).rows[0].code_tech, 'ISTGS54');
  await assert.rejects(db.comme(UG, () => db.query(`update techniciens set code_tech = 'bas de casse'`)), /check|violates/);
});

test('le script caché ne voit que les techniciens actifs avec code ET dossier', async () => {
  await db.comme(UG, () => db.query(`update techniciens set code_tech = 'ISTGS99' where id = '${T2}'`));   // T2 n'a pas de dossier
  assert.deepEqual(await service('select * from planning_a_charger()'), [{ code_tech: 'ISTGS54', dossier: 'UN' }]);
  await assert.rejects(db.comme(UG, () => db.query('select * from planning_a_charger()')), /permission denied|not exist/);
});
