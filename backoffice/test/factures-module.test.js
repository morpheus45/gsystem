// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Factures : gardé par le pilotage sur Bureau, numéro FAC automatique, totaux par la base,
// échéance et statut de paiement, cloisonné, masqué sans perte.
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
    await db.query(`select public.rendre_disponible('${A}', 'factures', true)`);
    await db.query(`select public.allumer_module('${A}', 'factures', 'bureau', true)`);
  });
});

test('module non allumé (société B) : impossible de créer une facture', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.facture_vente (societe_id, client_nom) values ('${B}', 'Client B')`), /row-level|violates/));
});

test('création : numéro FAC-AAAA-00001, échéance et statut', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.facture_vente (societe_id, client_nom, date_facture, date_echeance)
      values ('${A}', 'Parfums MLG', '2026-05-10', '2026-06-09')`);
    const f = await un(`select numero, statut, date_echeance::text as ech, modifie_par from public.facture_vente where societe_id = '${A}'`);
    assert.equal(f.numero, 'FAC-2026-00001');
    assert.equal(f.statut, 'brouillon');
    assert.equal(f.ech, '2026-06-09');
    assert.equal(f.modifie_par, ADM);
  });
});

test('lignes et totaux recalculés par la base', async () => {
  await db.comme(ADM, async () => {
    const id = (await un(`select id from public.facture_vente where societe_id = '${A}'`)).id;
    await db.query(`insert into public.facture_vente_ligne (facture_vente_id, libelle, quantite, prix_unitaire_centimes, remise_pct, taux_tva)
      values ('${id}', 'Article 1', 3, 1000, 0, 20), ('${id}', 'Article 2', 2, 1000, 10, 20)`);
    const t = await un(`select total_ht_centimes, total_tva_centimes, total_ttc_centimes from public.facture_vente where societe_id = '${A}'`);
    assert.deepEqual(t, { total_ht_centimes: 4800, total_tva_centimes: 960, total_ttc_centimes: 5760 });
  });
});

test('passage en payée, puis deuxième facture numérotée à la suite', async () => {
  await db.comme(ADM, async () => {
    await db.query(`update public.facture_vente set statut = 'payee' where societe_id = '${A}'`);
    await db.query(`insert into public.facture_vente (societe_id, client_nom, date_facture) values ('${A}', 'Autre', '2026-08-01')`);
    const nums = (await lignes(`select numero from public.facture_vente where societe_id = '${A}' order by numero`)).map((x) => x.numero);
    assert.deepEqual(nums, ['FAC-2026-00001', 'FAC-2026-00002']);
    assert.equal((await un(`select statut from public.facture_vente where numero = 'FAC-2026-00001'`)).statut, 'payee');
  });
});

test('la lecture voit les factures mais ne peut pas en créer', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select numero from public.facture_vente where societe_id = '${A}'`)).length, 2);
    await assert.rejects(db.query(`insert into public.facture_vente (societe_id, client_nom) values ('${A}', 'X')`), /row-level|violates/);
  });
});

test('éteindre le module masque les factures sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'factures', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.facture_vente where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.facture_vente where societe_id = '${A}'`)).n, 2);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'factures', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.facture_vente where societe_id = '${A}'`)).length, 2));
});

test('cloisonnement : B ne voit pas les factures de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.facture_vente where societe_id = '${A}'`)).length, 0));
});
