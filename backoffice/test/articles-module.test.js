// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Articles & tarifs : accessible seulement si allumé sur Bureau, formats et TVA vérifiés,
// référence unique par société, cloisonné, masqué sans perte si éteint.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const SUP = '00000000-0000-0000-0000-0000000000c1';  // super admin
const ADM = '00000000-0000-0000-0000-0000000000c2';  // admin de A
const LEC = '00000000-0000-0000-0000-0000000000c3';  // lecture de A
const ADB = '00000000-0000-0000-0000-0000000000c4';  // admin de B
let db;
const lignes = async (sql) => (await db.query(sql)).rows;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${SUP}'), ('${ADM}'), ('${LEC}'), ('${ADB}');
    insert into operateurs (user_id) values ('${SUP}');
    insert into public.societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${ADM}', 'admin'), ('${A}', '${LEC}', 'lecture'), ('${B}', '${ADB}', 'admin');`);
  await db.comme(SUP, async () => {
    await db.query(`select public.rendre_disponible('${A}', 'articles', true)`);
    await db.query(`select public.allumer_module('${A}', 'articles', 'bureau', true)`);
  });
});

test('module non allumé (société B) : impossible d\'ajouter un article', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.articles (societe_id, libelle) values ('${B}', 'Gel douche')`), /row-level|violates/));
});

test('admin ajoute un article ; auteur posé par le serveur', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.articles (societe_id, reference, libelle, ean13, prix_ht_centimes, taux_tva)
      values ('${A}', 'REF1', 'Gel douche', '4006381333931', 1250, 5.5)`);
    const [a] = await lignes(`select reference, libelle, ean13, prix_ht_centimes, taux_tva::text as tva, modifie_par, actif from public.articles where societe_id = '${A}'`);
    assert.equal(a.reference, 'REF1');
    assert.equal(a.prix_ht_centimes, 1250);
    assert.equal(a.tva, '5.5');
    assert.equal(a.modifie_par, ADM);
    assert.equal(a.actif, true);
  });
});

test('un EAN-13 mal formé (base : format) et une TVA hors barème sont refusés', async () => {
  await db.comme(ADM, async () => {
    // La base vérifie le format (13 chiffres) ; la clé de Luhn est contrôlée côté client (core/articles).
    await assert.rejects(db.query(`insert into public.articles (societe_id, libelle, ean13) values ('${A}', 'X', '123')`), /check|violates/);
    await assert.rejects(db.query(`insert into public.articles (societe_id, libelle, taux_tva) values ('${A}', 'X', 7)`), /check|violates/);
  });
});

test('une référence ne se répète pas dans une société', async () => {
  await db.comme(ADM, () => assert.rejects(
    db.query(`insert into public.articles (societe_id, reference, libelle) values ('${A}', 'REF1', 'Doublon')`), /duplicate|unique|violates/));
});

test('la lecture voit les articles mais ne peut pas en ajouter', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select libelle from public.articles where societe_id = '${A}'`)).length, 1);
    await assert.rejects(db.query(`insert into public.articles (societe_id, libelle) values ('${A}', 'Interdit')`), /row-level|violates/);
  });
});

test('éteindre le module masque les articles sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'articles', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.articles where societe_id = '${A}'`)).length, 0));
  assert.equal((await lignes(`select count(*)::int as n from public.articles where societe_id = '${A}'`))[0].n, 1);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'articles', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.articles where societe_id = '${A}'`)).length, 1));
});

test('cloisonnement : B ne voit pas les articles de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.articles where societe_id = '${A}'`)).length, 0));
});
