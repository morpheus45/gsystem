// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Fournisseurs : gardé par le pilotage sur Bureau, formats vérifiés, cloisonné, masqué sans perte.
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
    await db.query(`select public.rendre_disponible('${A}', 'fournisseurs', true)`);
    await db.query(`select public.allumer_module('${A}', 'fournisseurs', 'bureau', true)`);
  });
});

test('module non allumé (société B) : impossible d\'ajouter un fournisseur', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.fournisseur (societe_id, nom) values ('${B}', 'Grossiste')`), /row-level|violates/));
});

test('admin ajoute un fournisseur ; auteur posé par le serveur', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.fournisseur (societe_id, nom, siren, email) values ('${A}', 'Grossiste Beauté', '945168466', 'contact@gb.fr')`);
    const f = await un(`select nom, siren, modifie_par from public.fournisseur where societe_id = '${A}'`);
    assert.equal(f.nom, 'Grossiste Beauté');
    assert.equal(f.siren, '945168466');
    assert.equal(f.modifie_par, ADM);
  });
});

test('un SIREN mal formé est refusé', async () => {
  await db.comme(ADM, () => assert.rejects(
    db.query(`insert into public.fournisseur (societe_id, nom, siren) values ('${A}', 'X', '12345')`), /check|violates/));
});

test('la lecture voit mais ne peut pas ajouter', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select nom from public.fournisseur where societe_id = '${A}'`)).length, 1);
    await assert.rejects(db.query(`insert into public.fournisseur (societe_id, nom) values ('${A}', 'Interdit')`), /row-level|violates/);
  });
});

test('éteindre le module masque les fournisseurs sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'fournisseurs', 'bureau', false)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.fournisseur where societe_id = '${A}'`)).length, 0));
  assert.equal((await un(`select count(*)::int as n from public.fournisseur where societe_id = '${A}'`)).n, 1);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'fournisseurs', 'bureau', true)`));
  await db.comme(ADM, async () => assert.equal((await lignes(`select * from public.fournisseur where societe_id = '${A}'`)).length, 1));
});

test('cloisonnement : B ne voit pas les fournisseurs de A', async () => {
  await db.comme(ADB, async () => assert.equal((await lignes(`select * from public.fournisseur where societe_id = '${A}'`)).length, 0));
});
