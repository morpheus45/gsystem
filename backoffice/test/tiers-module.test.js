// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module Clients / tiers : accessible seulement si le module est disponible ET allumé sur Bureau,
// l'auteur posé par le serveur, formats vérifiés, cloisonné par société, masqué sans perte si éteint.
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
  // Le super admin rend « clients » disponible et l'allume sur Bureau pour A (pas pour B).
  await db.comme(SUP, async () => {
    await db.query(`select public.rendre_disponible('${A}', 'clients', true)`);
    await db.query(`select public.allumer_module('${A}', 'clients', 'bureau', true)`);
  });
});

test('module non allumé (société B) : impossible d\'ajouter un tiers', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`insert into public.tiers (societe_id, nom) values ('${B}', 'Client B')`), /row-level|violates/));
});

test('admin ajoute un tiers quand le module est allumé ; auteur posé par le serveur', async () => {
  await db.comme(ADM, async () => {
    await db.query(`insert into public.tiers (societe_id, nom, siren, email, telephone)
      values ('${A}', 'Parfums MLG', '791953557', 'contact@mlg.fr', '06 12 34 56 78')`);
    const [t] = await lignes(`select nom, siren, email, telephone, modifie_par, actif from public.tiers where societe_id = '${A}'`);
    assert.equal(t.nom, 'Parfums MLG');
    assert.equal(t.siren, '791953557');
    assert.equal(t.modifie_par, ADM);
    assert.equal(t.actif, true);
  });
});

test('un SIREN mal formé est refusé par la base', async () => {
  await db.comme(ADM, () => assert.rejects(
    db.query(`insert into public.tiers (societe_id, nom, siren) values ('${A}', 'Mauvais', '12345')`), /check|violates/));
});

test('la lecture voit les tiers mais ne peut pas en ajouter', async () => {
  await db.comme(LEC, async () => {
    assert.equal((await lignes(`select nom from public.tiers where societe_id = '${A}'`)).length, 1);
    await assert.rejects(db.query(`insert into public.tiers (societe_id, nom) values ('${A}', 'Interdit')`), /row-level|violates/);
  });
});

test('éteindre le module masque les tiers sans les effacer', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'clients', 'bureau', false)`));
  await db.comme(ADM, async () => {
    assert.equal((await lignes(`select * from public.tiers where societe_id = '${A}'`)).length, 0);   // masqué
  });
  // Les données sont toujours là (vue hors RLS).
  assert.equal((await lignes(`select count(*)::int as n from public.tiers where societe_id = '${A}'`))[0].n, 1);
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'clients', 'bureau', true)`));
  await db.comme(ADM, async () => {
    assert.equal((await lignes(`select * from public.tiers where societe_id = '${A}'`)).length, 1);   // réapparaît
  });
});

test('cloisonnement : B ne voit pas les tiers de A', async () => {
  await db.comme(ADB, async () => {
    assert.equal((await lignes(`select * from public.tiers where societe_id = '${A}'`)).length, 0);
  });
});
