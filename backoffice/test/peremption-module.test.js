// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Lots & péremption : gardé par le pilotage sur Bureau, cloisonné, masqué sans perte.
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
    for (const m of ['articles', 'peremption']) {
      await db.query(`select public.rendre_disponible('${A}', '${m}', true)`);
      await db.query(`select public.allumer_module('${A}', '${m}', 'bureau', true)`);
    }
  });
  await db.comme(ADM, async () => {
    artA = (await un(`insert into public.articles (societe_id, libelle) values ('${A}', 'Parfum') returning id`)).id;
  });
});

test('module non allumé (société B) : impossible d\'ajouter un lot', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.lot (societe_id, article_id, dluo) values ('${B}', '${artA}', '2027-01-01')`), /row-level|violates/));
});

test('admin ajoute un lot ; auteur posé par le serveur', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.lot (societe_id, article_id, numero_lot, dluo, quantite) values ('${A}', '${artA}', 'L2026-07', '2027-03-01', 50)`);
    const l = await un(`select numero_lot, dluo::text as dluo, quantite, modifie_par from public.lot where societe_id = '${A}'`);
    assert.equal(l.numero_lot, 'L2026-07');
    assert.equal(l.dluo, '2027-03-01');
    assert.equal(l.quantite, 50);
    assert.equal(l.modifie_par, ADM);
  });
});

test('une DLUO est obligatoire', async () => {
  await db.comme(ADM, () => assert.rejects(
    db.query(`insert into public.lot (societe_id, article_id) values ('${A}', '${artA}')`), /null|not-null|violates/));
});

test('la lecture voit les lots mais ne peut pas en ajouter', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select id from public.lot where societe_id = '${A}'`)).length, 1);
    await assert.rejects(db.query(`insert into public.lot (societe_id, article_id, dluo) values ('${A}', '${artA}', '2027-01-01')`), /row-level|violates/);
  });
});

test('éteindre le module masque les lots sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'peremption', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.lot where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.lot where societe_id = '${A}'`)).n, 1);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'peremption', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.lot where societe_id = '${A}'`)).length, 1));
});

test('cloisonnement : B ne voit pas les lots de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.lot where societe_id = '${A}'`)).length, 0));
});
