// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Frais validés un par un avant la comptabilité, export figé, paramètres validés par le comptable.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', UG = '00000000-0000-0000-0000-0000000000c1',
  UC = '00000000-0000-0000-0000-0000000000c2', UL = '00000000-0000-0000-0000-0000000000c3';
const T = '00000000-0000-0000-0000-0000000000c9';
let db;
const un = async (sql) => (await db.query(sql)).rows[0];
const maj = (uid, sql) => db.comme(uid, () => db.query(sql));

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UC}'), ('${UL}');
    insert into societes (id, nom) values ('${A}', 'A fictive');
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${A}', '${UL}', 'lecture');
    insert into techniciens (id, societe_id, nom) values ('${T}', '${A}', 'Tech A');
    insert into frais (societe_id, technicien_id, cle_source, date, categorie, montant_eur, statut) values
      ('${A}', '${T}', 'f1', '2026-06-10', 'DIVERS', 12, 'valide'),
      ('${A}', '${T}', 'f2', '2026-06-11', 'MOBILE', 30, 'a_traiter'),
      ('${A}', '${T}', 'f0', '2026-06-12', 'DIVERS', 0, 'a_traiter');
    insert into parametres_compta (societe_id) values ('${A}');`);
});

test('un frais importé arrive toujours « à traiter », sans signature', async () => {
  assert.deepEqual(await un(`select statut, valide_par from frais where cle_source = 'f1'`), { statut: 'a_traiter', valide_par: null });
});

test('la gestion valide : signé par la base ; la lecture seule ne peut pas', async () => {
  await maj(UG, `update frais set statut = 'valide', tva_recuperable = true, valide_par = '${UL}' where cle_source = 'f1'`);
  const r = await un(`select statut, tva_recuperable, valide_par, valide_le is not null as date from frais where cle_source = 'f1'`);
  assert.deepEqual(r, { statut: 'valide', tva_recuperable: true, valide_par: UG, date: true });
  await maj(UL, `update frais set statut = 'valide' where cle_source = 'f2'`);
  assert.equal((await un(`select statut from frais where cle_source = 'f2'`)).statut, 'a_traiter');
});

test('refus sans motif, ou validation d’un montant nul : refusés', async () => {
  await assert.rejects(maj(UG, `update frais set statut = 'refuse' where cle_source = 'f0'`), /motif/);
  await assert.rejects(maj(UG, `update frais set statut = 'valide' where cle_source = 'f0'`), /montant/);
  await maj(UG, `update frais set statut = 'refuse', motif_refus = 'ticket illisible' where cle_source = 'f0'`);
});

test('frais validé : ses montants ne bougent plus ; repasser « à traiter » retire la signature', async () => {
  await assert.rejects(maj(UG, `update frais set montant_eur = 99 where cle_source = 'f1'`), /valid/);
  await maj(UG, `update frais set statut = 'a_traiter' where cle_source = 'f1'`);
  assert.deepEqual(await un(`select valide_par, valide_le from frais where cle_source = 'f1'`), { valide_par: null, valide_le: null });
  await maj(UG, `update frais set statut = 'valide', tva_recuperable = true where cle_source = 'f1'`);
});

test('export : refusé tant qu’un frais de la période reste à traiter', async () => {
  await assert.rejects(maj(UC, `select * from exporter_compta('${A}', '${T}', '2026-06-01', '2026-06-30')`), /traiter/);
});

test('export refusé tant que le comptable n’a pas validé les comptes ; validation signée', async () => {
  await maj(UG, `update frais set statut = 'valide' where cle_source = 'f2'`);
  await assert.rejects(maj(UC, `select * from exporter_compta('${A}', '${T}', '2026-06-01', '2026-06-30')`), /parametres/);
  await maj(UG, `update parametres_compta set valide_le = now()`);   // la gestion n'y touche pas
  assert.equal((await un(`select valide_le from parametres_compta`)).valide_le, null);
  await maj(UC, `update parametres_compta set valide_le = now(), valide_par = '${UL}'`);
  assert.equal((await un(`select valide_par from parametres_compta`)).valide_par, UC);
});

test('export par le comptable : seuls les validés, une seule fois, puis figés', async () => {
  const r = await maj(UC, `select * from exporter_compta('${A}', '${T}', '2026-06-01', '2026-06-30')`);
  assert.equal(r.rows[0].frais_ids.length, 2);   // f1, f2 ; f0 refusé n'y est pas
  assert.deepEqual(await un(`select par = '${UC}' as ok, parametres->>'compte_salarie' as salarie from exports_compta`), { ok: true, salarie: '421' });
  await assert.rejects(maj(UC, `select * from exporter_compta('${A}', '${T}', '2026-06-01', '2026-06-30')`), /rien/);
  await assert.rejects(maj(UG, `update frais set statut = 'a_traiter' where cle_source = 'f1'`), /export/);
  await assert.rejects(maj(UL, `select * from exporter_compta('${A}', '${T}', '2026-06-01', '2026-06-30')`), /droit/);
});

test('un export comptable ne s’efface pas', async () => {
  await assert.rejects(db.comme(UC, () => db.query(`delete from exports_compta`)), /permission/);
  assert.equal((await un(`select count(*)::int n from exports_compta`)).n, 1);
});

test('changer un compte retire la validation ; l’export déjà fait garde ses comptes', async () => {
  await maj(UC, `update parametres_compta set compte_salarie = '4211'`);
  assert.deepEqual(await un(`select valide_par, valide_le from parametres_compta`), { valide_par: null, valide_le: null });
  assert.equal((await un(`select parametres->>'compte_salarie' as c from exports_compta`)).c, '421');
});
