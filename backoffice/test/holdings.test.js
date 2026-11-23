// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tests RLS holdings : admin de holding lit/écrit dans ses sociétés ; ne voit rien des autres holdings ni des sociétés sans holding ; membre simple inchangé ; super admin voit tout.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lire = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const MIG = '../supabase/migrations/';
const HA = '00000000-0000-0000-0000-00000000000a', HB = '00000000-0000-0000-0000-00000000000b';
const SA1 = '00000000-0000-0000-0000-00000000001a', SA2 = '00000000-0000-0000-0000-00000000002a';
const SB1 = '00000000-0000-0000-0000-00000000001b', SC = '00000000-0000-0000-0000-00000000000c';
const UA = '00000000-0000-0000-0000-0000000000a1', UB = '00000000-0000-0000-0000-0000000000b1';
const UL = '00000000-0000-0000-0000-0000000000a2', UC = '00000000-0000-0000-0000-0000000000a3';
const TA = '00000000-0000-0000-0000-0000000000a9';

let db;

async function comme(uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);
    set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}

const nb = async (sql) => Number((await db.query(sql)).rows[0].n);

before(async () => {
  db = new PGlite();
  await db.exec(lire('./supabase-local.sql'));
  for (const f of readdirSync(new URL(MIG, import.meta.url)).sort()) await db.exec(lire(MIG + f));
  await db.exec(`
    insert into auth.users values ('${UA}'), ('${UB}'), ('${UL}'), ('${UC}'), ('${TA}');
    insert into holdings (id, nom) values ('${HA}', 'Holding A'), ('${HB}', 'Holding B');
    insert into membres_holding values ('${HA}', '${UA}', 'admin'), ('${HB}', '${UB}', 'admin');
    insert into operateurs values ('${TA}');
    insert into societes (id, nom, holding_id) values
      ('${SA1}', 'Societe A1', '${HA}'),
      ('${SA2}', 'Societe A2', '${HA}'),
      ('${SB1}', 'Societe B1', '${HB}'),
      ('${SC}', 'Societe C', null);
    insert into membres values
      ('${SA1}', '${UA}', 'admin'), ('${SA1}', '${UL}', 'lecture'), ('${SA1}', '${UC}', 'comptable'),
      ('${SB1}', '${UB}', 'admin');
  `);
});

test('le rôle de test n\'est ni superutilisateur ni propriétaire', async () => {
  await comme(UA, async () => {
    const r = (await db.query(`select r.rolsuper, pg_get_userbyid(c.relowner) = current_user as proprio
      from pg_roles r, pg_class c where r.rolname = current_user and c.relname = 'holdings'`)).rows[0];
    assert.deepEqual(r, { rolsuper: false, proprio: false });
  });
});

test('la RLS est activée sur toutes les tables', async () => {
  const sans = (await db.query(`select relname from pg_class where relnamespace = 'public'::regnamespace
    and relkind = 'r' and not relrowsecurity`)).rows;
  assert.deepEqual(sans, []);
});

test('holding A ne lit rien de holding B, sur toutes les tables', async () => {
  const tables = (await db.query(`select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'holding_id'`)).rows.map((r) => r.table_name);
  await comme(UA, async () => {
    for (const t of tables) assert.equal(await nb(`select count(*) n from ${t} where holding_id = '${HB}'`), 0, t);
    assert.equal(await nb(`select count(*) n from holdings`), 1);
    assert.equal(await nb(`select count(*) n from societes`), 2);
    assert.equal(await nb(`select count(*) n from membres_holding`), 1);
    assert.equal(await nb(`select count(*) n from membres`), 3);
  });
});

test('holding A n\'écrit rien chez holding B', async () => {
  await comme(UA, async () => {
    await assert.rejects(db.query(`insert into membres_holding values ('${HB}', '${UA}', 'admin')`), /row-level security/);
    await assert.rejects(db.query(`insert into holdings (nom) values ('pirate')`), /row-level security/);
    assert.equal((await db.query(`update holdings set nom = 'modif' where id = '${HB}'`)).affectedRows, 0);
    assert.equal((await db.query(`delete from membres_holding where holding_id = '${HB}'`)).affectedRows, 0);
    await assert.rejects(db.query(`insert into membres values ('${SB1}', '${UA}', 'admin')`), /row-level security/);
  });
  assert.equal(await nb(`select count(*) n from membres_holding where holding_id = '${HB}'`), 1);
});

test('admin de holding lit et écrit dans ses 2 sociétés de sa holding', async () => {
  await comme(UA, async () => {
    // UA lit sa holding A
    assert.equal(await nb(`select count(*) n from holdings where id = '${HA}'`), 1);
    // UA lit les 2 sociétés de sa holding
    assert.equal(await nb(`select count(*) n from societes where holding_id = '${HA}'`), 2);
    // UA écrit (via holding) dans SA2 où il n'est pas membre directement
    const ins = await db.query(`insert into membres values ('${SA2}', '${UC}', 'gestion') returning *`);
    assert.equal(ins.rows.length, 1);
    const dbg = await db.query(`select * from membres where societe_id = '${SA2}'`);
    assert.equal(dbg.rows.length, 1);
    assert.equal(await nb(`select count(*) n from membres where societe_id = '${SA2}'`), 1);
    // UA nettoie sa ligne de test pour ne pas polluer les tests suivants
    await db.exec(`delete from membres where societe_id = '${SA2}'`);
    // UA ne touche pas à holding B : UA est admin de HA, pas de HB, donc RLS l'en empêche
    assert.equal((await db.query(`delete from membres_holding where holding_id = '${HB}'`)).affectedRows, 0);
    assert.equal(await nb(`select count(*) n from membres_holding where holding_id = '${HB}'`), 0);
  });
});

test('admin de holding ne voit rien d\'une autre holding', async () => {
  await comme(UA, async () => {
    assert.equal(await nb(`select count(*) n from holdings where id = '${HA}'`), 1);
    assert.equal(await nb(`select count(*) n from holdings where id = '${HB}'`), 0);
  });
});

test('membre simple sans droit supplémentaire ne voit rien de plus', async () => {
  await comme(UL, async () => {
    // UL est juste membre lecture de SA1 : ne voit pas les holdings ni les autres sociétés
    assert.equal(await nb(`select count(*) n from holdings`), 0);
    assert.equal(await nb(`select count(*) n from societes`), 1);
    assert.equal(await nb(`select count(*) n from membres_holding`), 0);
  });
});

test('super admin voit tout', async () => {
  await comme(TA, async () => {
    assert.equal(await nb(`select count(*) n from holdings`), 2);
    assert.equal(await nb(`select count(*) n from societes`), 4);
    assert.equal(await nb(`select count(*) n from membres_holding`), 2);
    assert.equal(await nb(`select count(*) n from membres`), 4);
  });
});

test('société sans holding devient visible quand elle est rattachée à une holding', async () => {
  await comme(TA, async () => {
    // Super admin rattache SC (sans holding) à la holding A
    await db.exec(`update societes set holding_id = '${HA}' where id = '${SC}'`);
    assert.equal(await nb(`select count(*) n from societes where id = '${SC}'`), 1);
  });
  await comme(UA, async () => {
    // Admin de holding A voit maintenant SC
    assert.equal(await nb(`select count(*) n from societes where id = '${SC}'`), 1);
    assert.equal(await nb(`select count(*) n from societes where holding_id = '${HA}'`), 3);
  });
});