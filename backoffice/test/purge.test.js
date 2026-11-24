// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Purge légale : seules les données dont le délai légal est dépassé s'effacent,
// seulement par le super admin, avec confirmation ; le reste reste ineffaçable.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', OP = '00000000-0000-0000-0000-0000000000b1', UG = '00000000-0000-0000-0000-0000000000b2';
const T = '00000000-0000-0000-0000-0000000000b9', PARTI = '00000000-0000-0000-0000-0000000000b8';
let db;
const n = async (sql) => (await db.query(sql)).rows[0].n;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${OP}'), ('${UG}');
    insert into operateurs (user_id) values ('${OP}');
    insert into societes (id, nom) values ('${A}', 'A fictive');
    insert into membres values ('${A}', '${UG}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('${T}', '${A}', 'Tech A');
    -- Données anciennes : posées sans déclencheurs, comme si elles dataient de l'époque.
    set session_replication_role = replica;
    insert into techniciens (id, societe_id, nom, actif, archive_le) values ('${PARTI}', '${A}', 'Parti en 2019', false, '2019-06-30');
    insert into periodes_paie (societe_id, debut, fin, statut, valide_par, valide_le, exporte_le)
      values ('${A}', '2019-01-01', '2019-12-31', 'exportee', '${UG}', now(), now());
    insert into temps (societe_id, technicien_id, cle_source, date, type_mission) values
      ('${A}', '${T}', 'vieux', '2019-03-04', 'INST'), ('${A}', '${PARTI}', 'parti', '2019-03-04', 'INST');
    insert into frais (societe_id, technicien_id, cle_source, date) values
      ('${A}', '${T}', 'f2014', '2014-05-02'), ('${A}', '${T}', 'f2019', '2019-05-02');
    insert into photos_apk (societe_id, technicien_id, cle_source, nom_local, nom_drive, stockage) values
      ('${A}', '${T}', 'p2014', 'AB-123-CD_2014-05-02_101010.jpg', 'FRAIS.jpg', '${A}/p2014.jpg'),
      ('${A}', '${T}', 'psans', 'sans-date.jpg', 'X.jpg', null);
    insert into conges (societe_id, technicien_id, debut, fin, type) values ('${A}', '${T}', '2019-07-01', '2019-07-15', 'CP');
    insert into audit (societe_id, table_nom, ligne_id, action, apres)
      select societe_id, 'temps', id::text, 'INSERT', to_jsonb(t) from temps t where cle_source = 'vieux';
    set session_replication_role = default;
    insert into temps (societe_id, technicien_id, cle_source, date, type_mission) values ('${A}', '${T}', 'recent', '2026-11-02', 'INST');`);
});

test('les délais légaux sont lisibles avec leur source', async () => {
  const r = (await db.query(`select table_nom, annees from durees_conservation order by table_nom`)).rows;
  const d = Object.fromEntries(r.map((x) => [x.table_nom, x.annees]));
  assert.deepEqual(d, { amendes: 10, conges: 5, documents_tech: 5, frais: 10, gestes_co: 5, heures_sup: 5, photos_apk: 10,
    permis_conduire: 1, primes_tarifs: 5, secu_sociale: 5, techniciens: 5, temps: 5 });
});

test('aperçu et purge réservés au super admin', async () => {
  await assert.rejects(db.comme(UG, () => db.query(`select * from apercu_purge('${A}')`)), /super admin/);
  await assert.rejects(db.comme(UG, () => db.query(`select * from purger_donnees('${A}', 'PURGER')`)), /super admin/);
});

test('effacer à la main reste interdit, même pour le super admin', async () => {
  await assert.rejects(db.comme(OP, () => db.query(`delete from temps where cle_source = 'vieux'`)), /effacement interdit|permission/);
  assert.equal(await n(`select count(*)::int n from temps where cle_source = 'vieux'`), 1);
});

test('aperçu : compte seulement ce qui a dépassé son délai', async () => {
  const r = await db.comme(OP, () => db.query(`select table_nom, lignes from apercu_purge('${A}') order by table_nom`));
  assert.deepEqual(Object.fromEntries(r.rows.map((x) => [x.table_nom, x.lignes])),
    { conges: 1, frais: 1, photos_apk: 1, techniciens: 1, temps: 2 });
});

test('sans le mot de confirmation : rien ne part', async () => {
  await assert.rejects(db.comme(OP, () => db.query(`select * from purger_donnees('${A}', 'oui')`)), /confirmation/);
  assert.equal(await n(`select count(*)::int n from temps`), 3);
});

test('purge : l’expiré part, le reste reste, fichiers à supprimer renvoyés', async () => {
  const r = await db.comme(OP, () => db.query(`select table_nom, lignes, fichiers from purger_donnees('${A}', 'PURGER')`));
  const res = Object.fromEntries(r.rows.map((x) => [x.table_nom, x]));
  assert.equal(res.temps.lignes, 2);
  assert.deepEqual(res.photos_apk.fichiers, [`${A}/p2014.jpg`]);
  assert.deepEqual((await db.query(`select cle_source from temps`)).rows.map((x) => x.cle_source), ['recent']);
  assert.deepEqual((await db.query(`select cle_source from frais`)).rows.map((x) => x.cle_source), ['f2019']);   // 10 ans : jusqu'au 31/12/2029
  assert.deepEqual((await db.query(`select cle_source from photos_apk`)).rows.map((x) => x.cle_source), ['psans']); // sans date : gardée
  assert.equal(await n(`select count(*)::int n from conges`), 0);
  assert.equal(await n(`select count(*)::int n from techniciens where id = '${PARTI}'`), 0);   // parti en 2019, plus rien à lui
  assert.equal(await n(`select count(*)::int n from techniciens where id = '${T}'`), 1);
});

test('le journal ne garde plus le contenu des lignes purgées', async () => {
  assert.equal(await n(`select count(*)::int n from audit where avant::text like '%vieux%' or apres::text like '%vieux%'`), 0);
  assert.ok(await n(`select count(*)::int n from audit where action = 'PURGE'`) > 0);
});

test('une donnée hors délai n’est pas réimportée', async () => {
  await db.query(`insert into temps (societe_id, technicien_id, cle_source, date, type_mission)
    values ('${A}', '${T}', 'vieux', '2019-03-04', 'INST') on conflict do nothing`);
  assert.equal(await n(`select count(*)::int n from temps where cle_source = 'vieux'`), 0);
});
