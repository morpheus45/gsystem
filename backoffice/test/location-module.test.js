// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Contrats de location (générique : véhicule, immobilier, matériel…) :
// gardé par le pilotage sur Bureau, dates cohérentes, cloisonné, masqué sans perte.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const SUP = '00000000-0000-0000-0000-0000000000c1';
const ADM = '00000000-0000-0000-0000-0000000000c2';
const LEC = '00000000-0000-0000-0000-0000000000c3';
const ADB = '00000000-0000-0000-0000-0000000000c4';
let db, bienA;
const lignes = async (sql) => (await db.query(sql)).rows;
const un = async (sql) => (await lignes(sql))[0];

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${SUP}'), ('${ADM}'), ('${LEC}'), ('${ADB}');
    insert into operateurs (user_id) values ('${SUP}');
    insert into public.societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${ADM}', 'admin'), ('${A}', '${LEC}', 'lecture'), ('${B}', '${ADB}', 'admin');`);
  await db.comme(SUP, async () => {
    await db.query(`select public.rendre_disponible('${A}', 'location_contrats', true)`);
    await db.query(`select public.allumer_module('${A}', 'location_contrats', 'bureau', true)`);
  });
});

test('module non allumé (société B) : impossible d\'ajouter un bien', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.bien_location (societe_id, libelle) values ('${B}', 'Clio')`), /row-level|violates/));
});

test('admin crée un bien (type libre) et un contrat', async () => {
  await db.comme(ADM, async () => {
    bienA = (await un(`insert into public.bien_location (societe_id, libelle, type) values ('${A}', 'Appartement T2', 'immobilier') returning id`)).id;
    await db.query(`insert into public.contrat_location (societe_id, bien_id, bien_libelle, client_nom, date_debut, date_fin, loyer_centimes, periode)
      values ('${A}', '${bienA}', 'Appartement T2', 'M. Dupont', '2026-01-01', '2026-12-31', 75000, 'mois')`);
    const c = await un(`select bien_libelle, client_nom, loyer_centimes, periode, statut, modifie_par from public.contrat_location where societe_id = '${A}'`);
    assert.equal(c.bien_libelle, 'Appartement T2');
    assert.equal(c.loyer_centimes, 75000);
    assert.equal(c.periode, 'mois');
    assert.equal(c.statut, 'en_cours');
    assert.equal(c.modifie_par, ADM);
  });
});

test('une fin avant le début est refusée', async () => {
  await db.comme(ADM, () => assert.rejects(
    db.query(`insert into public.contrat_location (societe_id, bien_libelle, client_nom, date_debut, date_fin) values ('${A}', 'X', 'Y', '2026-05-10', '2026-05-01')`), /check|violates/));
});

test('la lecture voit mais ne peut pas créer de contrat', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select id from public.contrat_location where societe_id = '${A}'`)).length, 1);
    await assert.rejects(db.query(`insert into public.contrat_location (societe_id, bien_libelle, client_nom, date_debut) values ('${A}', 'X', 'Y', '2026-01-01')`), /row-level|violates/);
  });
});

test('éteindre le module masque biens et contrats sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'location_contrats', 'bureau', false)`));
  await db.comme(ADM, async () => {
    assert.equal((await lignes(`select * from public.bien_location where societe_id = '${A}'`)).length, 0);
    assert.equal((await lignes(`select * from public.contrat_location where societe_id = '${A}'`)).length, 0);
  });
  assert.equal((await un(`select count(*)::int as n from public.contrat_location where societe_id = '${A}'`)).n, 1);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'location_contrats', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.contrat_location where societe_id = '${A}'`)).length, 1));
});

test('cloisonnement : B ne voit pas les contrats de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.contrat_location where societe_id = '${A}'`)).length, 0));
});
