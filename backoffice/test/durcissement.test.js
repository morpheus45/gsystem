// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Audit de sécurité du 18/11/2026 (SECURITE.md) : deux barrières plutôt qu'une.
// La RLS protège déjà chaque ligne ; les droits de table retirent en plus ce qui ne sert pas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

let db;
const tables = async () => (await db.query(`select tablename t from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.t);
const droit = async (role, t, d) => (await db.query(`select has_table_privilege('${role}', 'public.${t}', '${d}') ok`)).rows[0].ok;

before(async () => { db = await ouvrirBase(); });

test('S1 : le visiteur non connecté (anon) n\'a aucun droit sur aucune table', async () => {
  const ouvertes = [];
  for (const t of await tables()) {
    for (const d of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) if (await droit('anon', t, d)) ouvertes.push(`${t}:${d}`);
  }
  assert.deepEqual(ouvertes, []);
});

test('S1 : personne ne vide une table d\'un coup (TRUNCATE passe outre la RLS)', async () => {
  const ouvertes = [];
  for (const t of await tables()) if (await droit('authenticated', t, 'TRUNCATE')) ouvertes.push(t);
  assert.deepEqual(ouvertes, []);
});

test('S1 : une table créée plus tard n\'est pas ouverte à anon par défaut', async () => {
  await db.exec('create table public.essai_futur (id int)');
  assert.equal(await droit('anon', 'essai_futur', 'SELECT'), false);
  assert.equal(await droit('authenticated', 'essai_futur', 'TRUNCATE'), false);
  await db.exec('drop table public.essai_futur');
});

test('S6 : identité d\'un véhicule bornée (données venues d\'un site extérieur)', async () => {
  await db.exec(`insert into societes (id, nom) values ('00000000-0000-0000-0000-00000000000a', 'A');
    insert into vehicules (societe_id, plaque) values ('00000000-0000-0000-0000-00000000000a', 'AA-111-AA')`);
  await assert.rejects(db.query(`update vehicules set marque = repeat('x', 61)`), /check/);
  await assert.rejects(db.query(`update vehicules set motorisation = repeat('x', 121)`), /check/);
  await db.query(`update vehicules set marque = 'RENAULT', modele = 'CLIO V', carburant = 'Gazole', motorisation = 'Gazole, boîte manuelle'`);
});
