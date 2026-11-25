// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Règlements : gardé par le pilotage sur Bureau, cloisonné, masqué sans perte,
// et il solde automatiquement la facture reliée quand elle est entièrement réglée.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const SUP = '00000000-0000-0000-0000-0000000000c1';
const ADM = '00000000-0000-0000-0000-0000000000c2';
const LEC = '00000000-0000-0000-0000-0000000000c3';
const ADB = '00000000-0000-0000-0000-0000000000c4';
let db, factureA;
const lignes = async (sql) => (await db.query(sql)).rows;
const un = async (sql) => (await lignes(sql))[0];

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${SUP}'), ('${ADM}'), ('${LEC}'), ('${ADB}');
    insert into operateurs (user_id) values ('${SUP}');
    insert into public.societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${ADM}', 'admin'), ('${A}', '${LEC}', 'lecture'), ('${B}', '${ADB}', 'admin');`);
  await db.comme(SUP, async () => {
    for (const m of ['factures', 'reglements']) {
      await db.query(`select public.rendre_disponible('${A}', '${m}', true)`);
      await db.query(`select public.allumer_module('${A}', '${m}', 'bureau', true)`);
    }
  });
  // Une facture de 6000 centimes TTC (1 ligne : 5000 HT + 1000 TVA à 20 %).
  await db.comme(ADM, async () => {
    factureA = (await un(`insert into public.facture_vente (societe_id, client_nom) values ('${A}', 'Client') returning id`)).id;
    await db.query(`insert into public.facture_vente_ligne (facture_vente_id, libelle, quantite, prix_unitaire_centimes, taux_tva) values ('${factureA}', 'Prestation', 1, 5000, 20)`);
  });
});

test('module non allumé (société B) : impossible d\'ajouter un règlement', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.reglement (societe_id, montant_centimes) values ('${B}', 1000)`), /row-level|violates/));
});

test('un règlement partiel ne solde pas la facture', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.reglement (societe_id, facture_vente_id, montant_centimes, mode) values ('${A}', '${factureA}', 2000, 'virement')`);
    assert.equal((await un(`select statut from public.facture_vente where id = '${factureA}'`)).statut, 'brouillon');
  });
});

test('quand le total réglé atteint le TTC, la facture passe en payée', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.reglement (societe_id, facture_vente_id, montant_centimes, mode) values ('${A}', '${factureA}', 4000, 'cheque')`);
    assert.equal((await un(`select statut from public.facture_vente where id = '${factureA}'`)).statut, 'payee');
  });
});

test('retirer un règlement fait revenir la facture en émise', async () => {
  await db.comme(ADM, async () => {
    await db.query(`delete from public.reglement where facture_vente_id = '${factureA}' and montant_centimes = 4000`);
    assert.equal((await un(`select statut from public.facture_vente where id = '${factureA}'`)).statut, 'emise');
  });
});

test('la lecture voit les règlements mais ne peut pas en ajouter', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select id from public.reglement where societe_id = '${A}'`)).length, 1);
    await assert.rejects(db.query(`insert into public.reglement (societe_id, montant_centimes) values ('${A}', 500)`), /row-level|violates/);
  });
});

test('éteindre le module masque les règlements sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'reglements', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.reglement where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.reglement where societe_id = '${A}'`)).n, 1);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'reglements', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.reglement where societe_id = '${A}'`)).length, 1));
});

test('cloisonnement : B ne voit pas les règlements de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.reglement where societe_id = '${A}'`)).length, 0));
});
