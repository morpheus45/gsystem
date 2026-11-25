// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Devis : gardé par le pilotage sur Bureau, numéro automatique par société/année,
// totaux recalculés par la base (mêmes montants que core/montants), cloisonné, masqué sans perte.
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
    await db.query(`select public.rendre_disponible('${A}', 'devis', true)`);
    await db.query(`select public.allumer_module('${A}', 'devis', 'bureau', true)`);
  });
});

test('module non allumé (société B) : impossible de créer un devis', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.devis (societe_id, client_nom) values ('${B}', 'Client B')`), /row-level|violates/));
});

test('création : numéro automatique DEV-AAAA-00001, auteur posé par le serveur', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.devis (societe_id, client_nom, date_devis) values ('${A}', 'Parfums MLG', '2026-05-10')`);
    const d = await un(`select numero, modifie_par, total_ttc_centimes from public.devis where societe_id = '${A}'`);
    assert.equal(d.numero, 'DEV-2026-00001');
    assert.equal(d.modifie_par, ADM);
    assert.equal(d.total_ttc_centimes, 0);
  });
});

test('lignes : montants et totaux recalculés par la base (comme core/montants)', async () => {
  await db.comme(ADM, async () => {
    const id = (await un(`select id from public.devis where societe_id = '${A}'`)).id;
    await db.query(`insert into public.devis_ligne (devis_id, libelle, quantite, prix_unitaire_centimes, remise_pct, taux_tva)
      values ('${id}', 'Article 1', 3, 1000, 0, 20), ('${id}', 'Article 2', 2, 1000, 10, 20)`);
    const l = await lignes(`select ht_centimes, tva_centimes, ttc_centimes from public.devis_ligne dl join public.devis d on d.id = dl.devis_id where d.societe_id = '${A}' order by libelle`);
    assert.deepEqual(l[0], { ht_centimes: 3000, tva_centimes: 600, ttc_centimes: 3600 });
    assert.deepEqual(l[1], { ht_centimes: 1800, tva_centimes: 360, ttc_centimes: 2160 });
    const d = await un(`select total_ht_centimes, total_tva_centimes, total_ttc_centimes from public.devis where societe_id = '${A}'`);
    assert.deepEqual(d, { total_ht_centimes: 4800, total_tva_centimes: 960, total_ttc_centimes: 5760 });
  });
});

test('supprimer une ligne met les totaux à jour', async () => {
  await db.comme(ADM, async () => {
    await db.query(`delete from public.devis_ligne dl using public.devis d where dl.devis_id = d.id and d.societe_id = '${A}' and dl.libelle = 'Article 2'`);
    const d = await un(`select total_ttc_centimes from public.devis where societe_id = '${A}'`);
    assert.equal(d.total_ttc_centimes, 3600);
  });
});

test('le deuxième devis prend le numéro suivant', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.devis (societe_id, client_nom, date_devis) values ('${A}', 'Autre', '2026-07-01')`);
    const nums = (await lignes(`select numero from public.devis where societe_id = '${A}' order by numero`)).map((x) => x.numero);
    assert.deepEqual(nums, ['DEV-2026-00001', 'DEV-2026-00002']);
  });
});

test('la lecture voit les devis mais ne peut pas en créer', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select numero from public.devis where societe_id = '${A}'`)).length, 2);
    await assert.rejects(db.query(`insert into public.devis (societe_id, client_nom) values ('${A}', 'X')`), /row-level|violates/);
  });
});

test('éteindre le module masque les devis sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'devis', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.devis where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.devis where societe_id = '${A}'`)).n, 2);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'devis', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.devis where societe_id = '${A}'`)).length, 2));
});

test('cloisonnement : B ne voit pas les devis de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.devis where societe_id = '${A}'`)).length, 0));
});
