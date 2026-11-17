// Isolation entre sociétés, prouvée sur un vrai Postgres (PGlite) avec le rôle
// « authenticated » : ni superutilisateur ni propriétaire des tables.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lire = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const MIG = '../supabase/migrations/';
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UA = '00000000-0000-0000-0000-0000000000a1', UB = '00000000-0000-0000-0000-0000000000b1';
const UL = '00000000-0000-0000-0000-0000000000a2', UC = '00000000-0000-0000-0000-0000000000a3';
const TA = '00000000-0000-0000-0000-0000000000a9', TB = '00000000-0000-0000-0000-0000000000b9';
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
    insert into auth.users values ('${UA}'), ('${UB}'), ('${UL}'), ('${UC}');
    insert into societes (id, nom) values ('${A}', 'Societe A fictive'), ('${B}', 'Societe B fictive');
    insert into membres values ('${A}', '${UA}', 'admin'), ('${B}', '${UB}', 'admin'),
      ('${A}', '${UL}', 'lecture'), ('${A}', '${UC}', 'comptable');
    insert into techniciens (id, societe_id, nom) values ('${TA}', '${A}', 'Tech A'), ('${TB}', '${B}', 'Tech B');
    insert into temps (societe_id, technicien_id, cle_source, date, type_mission) values
      ('${A}', '${TA}', 'a1', '2026-10-22', 'INST'), ('${B}', '${TB}', 'b1', '2026-10-22', 'INST');
    insert into vehicules (societe_id, plaque) values ('${A}', 'AA-000-AA'), ('${B}', 'BB-000-BB');`);
});

test('le rôle de test n\'est ni superutilisateur ni propriétaire', async () => {
  await comme(UA, async () => {
    const r = (await db.query(`select r.rolsuper, pg_get_userbyid(c.relowner) = current_user as proprio
      from pg_roles r, pg_class c where r.rolname = current_user and c.relname = 'temps'`)).rows[0];
    assert.deepEqual(r, { rolsuper: false, proprio: false });
  });
});

test('la RLS est activée sur TOUTES les tables publiques', async () => {
  const sans = (await db.query(`select relname from pg_class where relnamespace = 'public'::regnamespace
    and relkind = 'r' and not relrowsecurity`)).rows;
  assert.deepEqual(sans, []);
});

test('A ne lit rien de B, sur toutes les tables', async () => {
  const tables = (await db.query(`select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'societe_id'`)).rows.map((r) => r.table_name);
  await comme(UA, async () => {
    for (const t of tables) assert.equal(await nb(`select count(*) n from ${t} where societe_id = '${B}'`), 0, t);
    assert.equal(await nb(`select count(*) n from societes`), 1);
    assert.equal(await nb(`select count(*) n from temps`), 1);
  });
});

test('A n\'écrit rien chez B', async () => {
  await comme(UA, async () => {
    await assert.rejects(db.query(`insert into temps (societe_id, technicien_id, cle_source, date, type_mission)
      values ('${B}', '${TB}', 'x', '2026-10-23', 'INST')`), /row-level security/);
    assert.equal((await db.query(`update temps set ville = 'pirate' where societe_id = '${B}'`)).affectedRows, 0);
    assert.equal((await db.query(`delete from vehicules where societe_id = '${B}'`)).affectedRows, 0);
    await assert.rejects(db.query(`insert into membres values ('${B}', '${UA}', 'admin')`), /row-level security/);
  });
  assert.equal(await nb(`select count(*) n from temps where societe_id = '${B}' and ville = ''`), 1);
});

test('A ne peut pas relier sa ligne à un technicien de B', async () => {
  await comme(UA, async () => {
    await assert.rejects(db.query(`insert into temps (societe_id, technicien_id, cle_source, date, type_mission)
      values ('${A}', '${TB}', 'x2', '2026-10-23', 'INST')`), /foreign key/);
  });
});

test('le rôle lecture lit mais n\'écrit pas', async () => {
  await comme(UL, async () => {
    assert.equal(await nb(`select count(*) n from temps`), 1);
    await assert.rejects(db.query(`insert into vehicules (societe_id, plaque) values ('${A}', 'CC-000-CC')`), /row-level security/);
  });
});

test('un visiteur non connecté ne voit rien', async () => {
  await comme(null, async () => {
    await assert.rejects(db.query('select * from temps'), /permission denied/);
  });
});

test('audit : chaque écriture est journalisée, visible de sa société seulement, non effaçable', async () => {
  await comme(UA, () => db.query(`update temps set ville = 'V' where cle_source = 'a1'`));
  await comme(UA, async () => {
    assert.ok(await nb(`select count(*) n from audit where table_nom = 'temps' and action = 'UPDATE'`) >= 1);
    assert.equal(await nb(`select count(*) n from audit where societe_id = '${B}'`), 0);
    await assert.rejects(db.query('delete from audit'), /permission denied/);
    await assert.rejects(db.query(`insert into audit (societe_id, table_nom, action) values ('${A}', 'x', 'x')`), /permission denied/);
  });
});

test('période de paie : validée puis exportée, ensuite verrouillée', async () => {
  const P = '00000000-0000-0000-0000-0000000000c1';
  await comme(UC, async () => {
    await db.query(`insert into periodes_paie (id, societe_id, debut, fin) values ('${P}', '${A}', '2026-09-21', '2026-10-20')`);
    await db.query(`update periodes_paie set statut = 'validee', valide_par = '${UC}', valide_le = now() where id = '${P}'`);
    await db.query(`update periodes_paie set statut = 'exportee', exporte_le = now() where id = '${P}'`);
    await assert.rejects(db.query(`update periodes_paie set statut = 'brouillon' where id = '${P}'`), /verrouillee/);
  });
  await comme(UA, async () => {
    await assert.rejects(db.query(`insert into temps (societe_id, technicien_id, cle_source, date, type_mission)
      values ('${A}', '${TA}', 'a2', '2026-10-01', 'INST')`), /verrouillee/);
    await db.query(`insert into temps (societe_id, technicien_id, cle_source, date, type_mission)
      values ('${A}', '${TA}', 'a3', '2026-10-21', 'INST')`);
  });
});

test('réimport : la même clé source ne crée pas de doublon', async () => {
  await comme(UA, async () => {
    const sql = `insert into temps (societe_id, technicien_id, cle_source, date, type_mission)
      values ('${A}', '${TA}', 'a1', '2026-10-22', 'INST') on conflict (societe_id, cle_source) do nothing`;
    await db.query(sql); await db.query(sql);
    assert.equal(await nb(`select count(*) n from temps where cle_source = 'a1'`), 1);
  });
});

test('le validateur est toujours l\'utilisateur connecté, jamais une valeur envoyée', async () => {
  const P = '00000000-0000-0000-0000-0000000000c2';
  await comme(UA, async () => {
    await db.query(`insert into periodes_paie (id, societe_id, debut, fin) values ('${P}', '${A}', '2026-11-21', '2026-12-20')`);
    await db.query(`update periodes_paie set statut = 'validee', valide_par = '${UC}', valide_le = now() where id = '${P}'`);
    assert.equal((await db.query(`select valide_par from periodes_paie where id = '${P}'`)).rows[0].valide_par, UA);
    await db.query(`insert into regles_societe (societe_id, version, valide_par, valide_le) values ('${A}', 1, '${UC}', now())`);
    assert.equal((await db.query(`select valide_par from regles_societe where version = 1`)).rows[0].valide_par, UA);
  });
});

test('une période naît en brouillon et ne saute pas l\'étape validée', async () => {
  const P = '00000000-0000-0000-0000-0000000000c3';
  await comme(UA, async () => {
    await assert.rejects(db.query(`insert into periodes_paie (societe_id, debut, fin, statut, valide_par, valide_le, exporte_le)
      values ('${A}', '2027-01-21', '2027-02-20', 'exportee', '${UA}', now(), now())`), /brouillon/);
    await db.query(`insert into periodes_paie (id, societe_id, debut, fin) values ('${P}', '${A}', '2027-02-21', '2027-03-20')`);
    await assert.rejects(db.query(`update periodes_paie set statut = 'exportee', valide_par = '${UA}', valide_le = now(),
      exporte_le = now() where id = '${P}'`), /validee/);
  });
});

test('le dernier admin d\'une société ne peut pas être retiré', async () => {
  await comme(UA, async () => {
    await assert.rejects(db.query(`update membres set role = 'lecture' where user_id = '${UA}'`), /dernier admin/);
    await assert.rejects(db.query(`delete from membres where user_id = '${UA}'`), /dernier admin/);
  });
});

test('serveur : une société sans données réelles se supprime ; avec, c\'est refusé', async () => {
  const C = '00000000-0000-0000-0000-00000000000c';
  await db.exec(`insert into societes (id, nom) values ('${C}', 'Societe C fictive');
    insert into membres values ('${C}', '${UB}', 'admin'); delete from societes where id = '${C}'`);
  assert.equal(await nb(`select count(*) n from membres where societe_id = '${C}'`), 0);
  await assert.rejects(db.exec(`delete from temps where societe_id = '${B}'`), /effacement interdit/);
});
