// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Archiver un technicien : il sort des actifs, ses données restent ; signé par la base.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', UG = '00000000-0000-0000-0000-0000000000a1', UX = '00000000-0000-0000-0000-0000000000a2';
const T = '00000000-0000-0000-0000-0000000000a9';
let db;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UX}');
    insert into societes (id, nom) values ('${A}', 'A fictive');
    insert into membres values ('${A}', '${UG}', 'gestion');
    insert into techniciens (id, societe_id, nom) values ('${T}', '${A}', 'Tech A');
    insert into temps (societe_id, technicien_id, cle_source, date, type_mission) values ('${A}', '${T}', 't1', '2026-11-02', 'INST');
    insert into vehicules (societe_id, plaque, libelle) values ('${A}', 'AA-123-AA', 'Clio');`);
});

test('archiver : inactif, date et auteur posés par la base, données gardées', async () => {
  await db.comme(UG, () => db.query(`update techniciens set archive_le = '2020-01-01', archive_par = '${UX}' where id = '${T}'`));
  const r = (await db.query(`select actif, archive_le = current_date as aujourdhui, archive_par from techniciens where id = '${T}'`)).rows[0];
  assert.deepEqual(r, { actif: false, aujourdhui: true, archive_par: UG });
  assert.equal((await db.query(`select count(*)::int n from temps where technicien_id = '${T}'`)).rows[0].n, 1);
});

test('restaurer : de nouveau actif, archivage effacé', async () => {
  await db.comme(UG, () => db.query(`update techniciens set archive_le = null where id = '${T}'`));
  const r = (await db.query(`select actif, archive_par from techniciens where id = '${T}'`)).rows[0];
  assert.deepEqual(r, { actif: true, archive_par: null });
});

test('véhicule : archiver avec motif, auteur et date posés par la base, jamais effacé', async () => {
  await db.comme(UG, async () => {
    // Archiver sans motif : refusé
    await assert.rejects(db.query(`update vehicules set archive_le = current_date where plaque = 'AA-123-AA'`), /motif obligatoire/);

    // Archiver avec motif : actif devient false, date et auteur posés
    await db.query(`update vehicules set archive_le = '2020-01-01', archive_par = '${UX}', motif_archive = 'Vente du véhicule' where plaque = 'AA-123-AA'`);
    const r = (await db.query(`select actif, archive_le = current_date as aujourdhui, archive_par, motif_archive from vehicules where plaque = 'AA-123-AA'`)).rows[0];
    assert.deepEqual(r, { actif: false, aujourdhui: true, archive_par: UG, motif_archive: 'Vente du véhicule' });

    // Effacement interdit
    await assert.rejects(db.query(`delete from vehicules where plaque = 'AA-123-AA'`), /effacement interdit/);

    // Restaurer : de nouveau actif, archivage effacé
    await db.query(`update vehicules set archive_le = null where plaque = 'AA-123-AA'`);
    const restaure = (await db.query(`select actif, archive_le, archive_par, motif_archive from vehicules where plaque = 'AA-123-AA'`)).rows[0];
    assert.deepEqual(restaure, { actif: true, archive_le: null, archive_par: null, motif_archive: '' });
  });
});
