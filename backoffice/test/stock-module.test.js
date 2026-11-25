// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Gestion de stock : gardé par le pilotage sur Bureau, stock courant calculé,
// sortie bloquée si stock insuffisant, cloisonné, masqué sans perte.
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
    for (const m of ['articles', 'stock']) {
      await db.query(`select public.rendre_disponible('${A}', '${m}', true)`);
      await db.query(`select public.allumer_module('${A}', '${m}', 'bureau', true)`);
    }
  });
  await db.comme(ADM, async () => {
    artA = (await un(`insert into public.articles (societe_id, libelle) values ('${A}', 'Gel douche') returning id`)).id;
  });
});

test('module non allumé (société B) : impossible d\'ajouter un mouvement', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.mouvement_stock (societe_id, article_id, type, quantite) values ('${B}', '${artA}', 'entree', 5)`), /row-level|violates/));
});

test('entrées et sorties : le stock courant suit', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.mouvement_stock (societe_id, article_id, type, quantite) values ('${A}', '${artA}', 'entree', 10)`);
    await db.query(`insert into public.mouvement_stock (societe_id, article_id, type, quantite) values ('${A}', '${artA}', 'sortie', 4)`);
    const [s] = await lignes(`select quantite from public.stock_courant('${A}') where article_id = '${artA}'`);
    assert.equal(s.quantite, 6);
  });
});

test('une sortie supérieure au stock est refusée', async () => {
  await db.comme(ADM, () => assert.rejects(
    db.query(`insert into public.mouvement_stock (societe_id, article_id, type, quantite) values ('${A}', '${artA}', 'sortie', 10)`), /insuffisant/));
});

test('la lecture voit les mouvements mais ne peut pas en ajouter', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select id from public.mouvement_stock where societe_id = '${A}'`)).length, 2);
    await assert.rejects(db.query(`insert into public.mouvement_stock (societe_id, article_id, type, quantite) values ('${A}', '${artA}', 'entree', 1)`), /row-level|violates/);
  });
});

test('éteindre le module masque les mouvements sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'stock', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.mouvement_stock where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.mouvement_stock where societe_id = '${A}'`)).n, 2);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'stock', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.mouvement_stock where societe_id = '${A}'`)).length, 2));
});

test('cloisonnement : B ne voit pas les mouvements de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.mouvement_stock where societe_id = '${A}'`)).length, 0));
});
