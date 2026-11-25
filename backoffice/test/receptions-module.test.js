// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Réceptions : gardé par le pilotage sur Bureau ; une réception avec article crée une entrée de stock.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const SUP = '00000000-0000-0000-0000-0000000000c1';
const ADM = '00000000-0000-0000-0000-0000000000c2';
const LEC = '00000000-0000-0000-0000-0000000000c3';
const ADB = '00000000-0000-0000-0000-0000000000c4';
let db, artA;
const lignes = async (sql) => (await db.query(sql)).rows;
const un = async (sql) => (await lignes(sql))[0];

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${SUP}'), ('${ADM}'), ('${LEC}'), ('${ADB}');
    insert into operateurs (user_id) values ('${SUP}');
    insert into public.societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${ADM}', 'admin'), ('${A}', '${LEC}', 'lecture'), ('${B}', '${ADB}', 'admin');`);
  await db.comme(SUP, async () => {
    for (const m of ['articles', 'stock', 'receptions']) {
      await db.query(`select public.rendre_disponible('${A}', '${m}', true)`);
      await db.query(`select public.allumer_module('${A}', '${m}', 'bureau', true)`);
    }
  });
  await db.comme(ADM, async () => {
    artA = (await un(`insert into public.articles (societe_id, libelle) values ('${A}', 'Gel douche') returning id`)).id;
  });
});

test('module non allumé (société B) : impossible d\'ajouter une réception', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.reception (societe_id, article_libelle, quantite) values ('${B}', 'X', 5)`), /row-level|violates/));
});

test('une réception avec article crée une entrée de stock', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.reception (societe_id, article_id, article_libelle, quantite, fournisseur_nom)
      values ('${A}', '${artA}', 'Gel douche', 20, 'Grossiste')`);
    assert.equal((await un(`select quantite from public.stock_courant('${A}') where article_id = '${artA}'`)).quantite, 20);
    const m = await un(`select type, quantite from public.mouvement_stock where societe_id = '${A}' and article_id = '${artA}'`);
    assert.deepEqual(m, { type: 'entree', quantite: 20 });
  });
});

test('la lecture voit mais ne peut pas ajouter', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select id from public.reception where societe_id = '${A}'`)).length, 1);
    await assert.rejects(db.query(`insert into public.reception (societe_id, article_libelle, quantite) values ('${A}', 'X', 1)`), /row-level|violates/);
  });
});

test('éteindre le module masque les réceptions sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'receptions', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.reception where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.reception where societe_id = '${A}'`)).n, 1);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'receptions', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.reception where societe_id = '${A}'`)).length, 1));
});

test('cloisonnement : B ne voit pas les réceptions de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.reception where societe_id = '${A}'`)).length, 0));
});
