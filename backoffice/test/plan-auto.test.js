// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Un véhicule qui entre dans la flotte reprend tout seul les échéances d'un véhicule
// identique (même marque, modèle, carburant), avec la source d'origine.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UA = '00000000-0000-0000-0000-0000000000a1';
const V1 = '00000000-0000-0000-0000-0000000000c1';
let db;
const comme = (sql) => db.comme(UA, () => db.query(sql));
const regles = async (plaque) => (await db.query(`select r.type, r.tous_les_km km, r.tous_les_mois mois, r.source
  from entretien_regles r join vehicules v on v.id = r.vehicule_id where v.plaque = '${plaque}' order by r.type`)).rows;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UA}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UA}', 'gestion');
    insert into vehicules (id, societe_id, plaque, marque, modele, carburant) values ('${V1}', '${A}', 'AA-111-AA', 'RENAULT', 'CLIO V', 'Gazole');
    insert into entretien_regles (societe_id, vehicule_id, type, tous_les_km, tous_les_mois, source) values
      ('${A}', '${V1}', 'REVISION', 30000, 12, 'auto-doc.fr'), ('${A}', '${V1}', 'DISTRIBUTION', 160000, 60, 'feuvert.fr');
    insert into vehicules (societe_id, plaque, marque, modele, carburant) values ('${B}', 'BB-999-BB', 'RENAULT', 'CLIO V', 'Gazole');`);
});

test('nouvelle Clio V diesel : les échéances de la Clio V diesel déjà connue sont reprises, source citée', async () => {
  await comme(`insert into vehicules (societe_id, plaque, marque, modele, carburant) values ('${A}', 'CC-222-CC', 'Renault', 'Clio V', 'GAZOLE')`);
  assert.deepEqual(await regles('CC-222-CC'), [
    { type: 'DISTRIBUTION', km: 160000, mois: 60, source: 'Repris de AA-111-AA : feuvert.fr' },
    { type: 'REVISION', km: 30000, mois: 12, source: 'Repris de AA-111-AA : auto-doc.fr' },
  ]);
});

test('identité remplie après coup (plaque d\'abord) : reprise au moment où le modèle arrive', async () => {
  await comme(`insert into vehicules (societe_id, plaque) values ('${A}', 'DD-333-DD')`);
  assert.deepEqual(await regles('DD-333-DD'), []);
  await comme(`update vehicules set marque = 'RENAULT', modele = 'CLIO V', carburant = 'Gazole' where plaque = 'DD-333-DD'`);
  assert.equal((await regles('DD-333-DD')).length, 2);
});

test('autre carburant, ou véhicule qui a déjà ses règles : rien n\'est touché', async () => {
  await comme(`insert into vehicules (societe_id, plaque, marque, modele, carburant) values ('${A}', 'EE-444-EE', 'RENAULT', 'CLIO V', 'Essence')`);
  assert.deepEqual(await regles('EE-444-EE'), []);
  await comme(`update vehicules set modele = 'CLIO V ' where plaque = 'AA-111-AA'`);
  assert.equal((await regles('AA-111-AA')).length, 2);
});

test('jamais de reprise depuis une autre société', async () => {
  assert.deepEqual(await regles('BB-999-BB'), []);
});
