// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Inventaires : fige le stock théorique, écart = compté - théorique, et la clôture ajuste le stock.
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
    for (const m of ['articles', 'stock', 'inventaires']) {
      await db.query(`select public.rendre_disponible('${A}', '${m}', true)`);
      await db.query(`select public.allumer_module('${A}', '${m}', 'bureau', true)`);
    }
  });
  await db.comme(ADM, async () => {
    artA = (await un(`insert into public.articles (societe_id, libelle) values ('${A}', 'Gel douche') returning id`)).id;
    await db.query(`insert into public.mouvement_stock (societe_id, article_id, type, quantite) values ('${A}', '${artA}', 'entree', 10)`);
  });
});

test('la lecture ne peut pas créer d\'inventaire', async () => {
  await db.comme(LEC, () => assert.rejects(db.query(`select public.creer_inventaire('${A}')`), /reserve/));
});

test('créer un inventaire fige le stock théorique de chaque article', async () => {
  await db.comme(ADM, async () => {
    await db.query(`select public.creer_inventaire('${A}')`);
    const l = await un(`select quantite_theorique, quantite_comptee, ecart from public.inventaire_ligne il join public.inventaire i on i.id = il.inventaire_id where i.societe_id = '${A}'`);
    assert.deepEqual(l, { quantite_theorique: 10, quantite_comptee: 10, ecart: 0 });
  });
});

test('saisir le compté met à jour l\'écart', async () => {
  await db.comme(ADM, async () => {
    await db.query(`update public.inventaire_ligne set quantite_comptee = 8 where article_id = '${artA}'`);
    assert.equal((await un(`select ecart from public.inventaire_ligne where article_id = '${artA}'`)).ecart, -2);
  });
});

test('la clôture ajuste le stock selon l\'écart', async () => {
  await db.comme(ADM, async () => {
    const inv = (await un(`select id from public.inventaire where societe_id = '${A}'`)).id;
    await db.query(`select public.cloturer_inventaire('${inv}')`);
    assert.equal((await un(`select statut from public.inventaire where id = '${inv}'`)).statut, 'clos');
    assert.equal((await un(`select quantite from public.stock_courant('${A}') where article_id = '${artA}'`)).quantite, 8);
  });
});

test('un inventaire déjà clos ne se re-clôture pas', async () => {
  await db.comme(ADM, async () => {
    const inv = (await un(`select id from public.inventaire where societe_id = '${A}'`)).id;
    await assert.rejects(db.query(`select public.cloturer_inventaire('${inv}')`), /deja clos/);
  });
});

test('cloisonnement : B ne voit pas les inventaires de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.inventaire where societe_id = '${A}'`)).length, 0));
});
