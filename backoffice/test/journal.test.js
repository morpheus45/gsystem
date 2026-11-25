// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Journal : une vraie modification est notée, une réécriture à l'identique (import toutes les heures) ne l'est pas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', UG = '00000000-0000-0000-0000-0000000000a1';
const TA = '00000000-0000-0000-0000-0000000000a9';
let db;
const actions = async (table = 'techniciens') => (await db.query(
  `select action from audit where table_nom = '${table}' order by id`)).rows.map((l) => l.action);

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}');
    insert into societes (id, nom) values ('${A}', 'A fictive');
    insert into membres values ('${A}', '${UG}', 'gestion');
    insert into techniciens (id, societe_id, nom) values ('${TA}', '${A}', 'Tech A');`);
});

test('réécrire à l\'identique n\'ajoute rien au journal', async () => {
  await db.query(`update techniciens set nom = nom`);
  await db.query(`insert into techniciens (id, societe_id, nom) values ('${TA}', '${A}', 'Tech A')
    on conflict (id) do update set nom = excluded.nom`);
  assert.deepEqual(await actions(), ['INSERT']);
});

test('une vraie modification garde l\'avant et l\'après, y compris passer à vide ou en sortir', async () => {
  await db.query(`update techniciens set nom = 'Tech B'`);
  await db.query(`update techniciens set archive_le = '2026-11-01'`);
  await db.query(`update techniciens set archive_le = null`);
  assert.deepEqual(await actions(), ['INSERT', 'UPDATE', 'UPDATE', 'UPDATE']);
  const [l] = (await db.query(`select avant->>'nom' as avant, apres->>'nom' as apres from audit
    where table_nom = 'techniciens' and action = 'UPDATE' order by id limit 1`)).rows;
  assert.deepEqual(l, { avant: 'Tech A', apres: 'Tech B' });
});

test('le journal masqué note toujours un numéro changé, même si l\'avant et l\'après masqués se ressemblent', async () => {
  await db.comme(UG, async () => {
    await db.query(`insert into permis_conduire (societe_id, technicien_id, numero) values ('${A}', '${TA}', 'AB123456')`);
    await db.query(`update permis_conduire set numero = 'AB123457'`);
  });
  assert.deepEqual(await actions('permis_conduire'), ['INSERT', 'UPDATE']);
});

test('créations et effacements restent toujours notés', async () => {
  await db.query(`update membres set role = 'lecture'`);
  await db.query(`delete from membres`);
  assert.deepEqual(await actions('membres'), ['INSERT', 'UPDATE', 'DELETE']);
});
