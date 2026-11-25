// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Demandes de congés : saisies (bureau, plus tard l'APK), décidées par admin/gestion, jamais effacées.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UG = '00000000-0000-0000-0000-0000000000a1', UL = '00000000-0000-0000-0000-0000000000a2', UB = '00000000-0000-0000-0000-0000000000b1';
const T = '00000000-0000-0000-0000-0000000000a9', TB = '00000000-0000-0000-0000-0000000000b9';
let db;
const demande = (s, t, debut, fin, type = 'CP') =>
  `insert into conges (societe_id, technicien_id, debut, fin, type) values ('${s}', '${t}', '${debut}', '${fin}', '${type}') returning id`;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UL}'), ('${UB}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UL}', 'lecture'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('${T}', '${A}', 'Tech A'), ('${TB}', '${B}', 'Tech B');`);
});

test('une demande naît « demandee » ; valider la signe avec l\'utilisateur connecté', async () => {
  await db.comme(UG, async () => {
    const id = (await db.query(demande(A, T, '2026-12-21', '2026-12-31'))).rows[0].id;
    assert.equal((await db.query(`select statut from conges where id = '${id}'`)).rows[0].statut, 'demandee');
    await db.query(`update conges set statut = 'validee', decide_par = '${UB}' where id = '${id}'`);
    const r = (await db.query(`select statut, decide_par, decide_le is not null as le from conges where id = '${id}'`)).rows[0];
    assert.deepEqual(r, { statut: 'validee', decide_par: UG, le: true });
  });
});

test('dates à l\'envers, type inconnu, tech d\'une autre société : refusés', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(db.query(demande(A, T, '2026-12-31', '2026-12-21')), /check|violates/);
    await assert.rejects(db.query(demande(A, T, '2026-12-21', '2026-12-22', 'VACANCES_FOLLES')), /check|violates/);
    await assert.rejects(db.query(demande(A, TB, '2026-12-21', '2026-12-22')), /foreign key/);
  });
});

test('lecture seule ne décide pas ; l\'autre société ne voit rien ; rien ne s\'efface', async () => {
  await db.comme(UL, async () => {
    assert.equal((await db.query(`update conges set statut = 'refusee'`)).affectedRows, 0);
  });
  await db.comme(UB, async () => {
    assert.equal((await db.query(`select * from conges`)).rows.length, 0);
  });
  await db.comme(UG, async () => {
    await assert.rejects(db.query(`delete from conges`), /effacement interdit/);
  });
});

test('congé validé modifiable ou annulable avec motif obligatoire ; auteur et date initiaux préservés', async () => {
  await db.comme(UG, async () => {
    const id = (await db.query(demande(A, T, '2026-07-01', '2026-07-15'))).rows[0].id;
    await db.query(`update conges set statut = 'validee' where id = '${id}'`);
    const initiale = (await db.query(`select decide_par, decide_le from conges where id = '${id}'`)).rows[0];

    // Modification sans motif : refusée
    await assert.rejects(db.query(`update conges set fin = '2026-07-20' where id = '${id}'`), /motif obligatoire/);

    // Modification avec motif : acceptée, initial préservé, modifie_par et modifie_le renseignés
    await db.query(`update conges set fin = '2026-07-20', motif_modification = 'prolongation accordée' where id = '${id}'`);
    const apresModif = (await db.query(`select statut, to_char(fin, 'YYYY-MM-DD') as fin, decide_par, decide_le, modifie_par, modifie_le is not null as modifie, motif_modification from conges where id = '${id}'`)).rows[0];
    assert.equal(apresModif.statut, 'validee');
    assert.equal(apresModif.fin, '2026-07-20');
    assert.equal(apresModif.decide_par, initiale.decide_par);
    assert.equal(apresModif.decide_le.getTime(), initiale.decide_le.getTime());
    assert.equal(apresModif.modifie_par, UG);
    assert.equal(apresModif.modifie, true);
    assert.equal(apresModif.motif_modification, 'prolongation accordée');

    // Annulation sans motif : refusée
    await assert.rejects(db.query(`update conges set statut = 'annulee', motif_modification = '   ' where id = '${id}'`), /motif obligatoire/);

    // Annulation avec motif : acceptée, décision initiale préservée
    await db.query(`update conges set statut = 'annulee', motif_modification = 'changement de planning client' where id = '${id}'`);
    const apresAnnule = (await db.query(`select statut, decide_par, decide_le, modifie_par, motif_modification from conges where id = '${id}'`)).rows[0];
    assert.equal(apresAnnule.statut, 'annulee');
    assert.equal(apresAnnule.decide_par, initiale.decide_par);
    assert.equal(apresAnnule.decide_le.getTime(), initiale.decide_le.getTime());
    assert.equal(apresAnnule.modifie_par, UG);
    assert.equal(apresAnnule.motif_modification, 'changement de planning client');
  });
});
