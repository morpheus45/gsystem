// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Commandes fournisseurs : gardé par le pilotage sur Bureau, numéro CMF automatique,
// totaux recalculés par la base, cloisonné, masqué sans perte.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const SUP = '00000000-0000-0000-0000-0000000000c1';
const ADM = '00000000-0000-0000-0000-0000000000c2';
const LEC = '00000000-0000-0000-0000-0000000000c3';
const ADB = '00000000-0000-0000-0000-0000000000c4';
let db;
const lignes = async (sql) => (await db.query(sql)).rows;
const un = async (sql) => (await lignes(sql))[0];

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${SUP}'), ('${ADM}'), ('${LEC}'), ('${ADB}');
    insert into operateurs (user_id) values ('${SUP}');
    insert into public.societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${ADM}', 'admin'), ('${A}', '${LEC}', 'lecture'), ('${B}', '${ADB}', 'admin');`);
  await db.comme(SUP, async () => {
    await db.query(`select public.rendre_disponible('${A}', 'achats', true)`);
    await db.query(`select public.allumer_module('${A}', 'achats', 'bureau', true)`);
  });
});

test('module non allumé (société B) : impossible de créer une commande', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.commande_fournisseur (societe_id, fournisseur_nom) values ('${B}', 'Grossiste')`), /row-level|violates/));
});

test('création : numéro CMF-AAAA-00001, totaux recalculés', async () => {
  await db.comme(ADM, async () => {
    const id = (await un(`insert into public.commande_fournisseur (societe_id, fournisseur_nom, date_commande) values ('${A}', 'Grossiste Beauté', '2026-05-10') returning id`)).id;
    await db.query(`insert into public.commande_fournisseur_ligne (commande_fournisseur_id, libelle, quantite, prix_unitaire_centimes, remise_pct, taux_tva)
      values ('${id}', 'Carton gel', 3, 1000, 0, 20), ('${id}', 'Carton parfum', 2, 1000, 10, 20)`);
    const c = await un(`select numero, total_ht_centimes, total_tva_centimes, total_ttc_centimes, modifie_par from public.commande_fournisseur where societe_id = '${A}'`);
    assert.equal(c.numero, 'CMF-2026-00001');
    assert.equal(c.total_ht_centimes, 4800);
    assert.equal(c.total_tva_centimes, 960);
    assert.equal(c.total_ttc_centimes, 5760);
    assert.equal(c.modifie_par, ADM);
  });
});

test('le deuxième bon prend le numéro suivant', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.commande_fournisseur (societe_id, fournisseur_nom, date_commande) values ('${A}', 'Autre', '2026-07-01')`);
    const nums = (await lignes(`select numero from public.commande_fournisseur where societe_id = '${A}' order by numero`)).map((x) => x.numero);
    assert.deepEqual(nums, ['CMF-2026-00001', 'CMF-2026-00002']);
  });
});

test('la lecture voit mais ne peut pas créer', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select numero from public.commande_fournisseur where societe_id = '${A}'`)).length, 2);
    await assert.rejects(db.query(`insert into public.commande_fournisseur (societe_id, fournisseur_nom) values ('${A}', 'X')`), /row-level|violates/);
  });
});

test('éteindre le module masque les commandes sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'achats', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.commande_fournisseur where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.commande_fournisseur where societe_id = '${A}'`)).n, 2);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'achats', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.commande_fournisseur where societe_id = '${A}'`)).length, 2));
});

test('cloisonnement : B ne voit pas les commandes de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.commande_fournisseur where societe_id = '${A}'`)).length, 0));
});
