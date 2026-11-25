// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Profils métier : appliquer un profil rend ses modules disponibles (additif) ; réservé au super admin / patron.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a';
const SUP = '00000000-0000-0000-0000-0000000000c1';
const ADM = '00000000-0000-0000-0000-0000000000c2';
let db;
const lignes = async (sql) => (await db.query(sql)).rows;
const dispo = async () => (await lignes(`select code from public.module_disponible where societe_id = '${A}' order by code`)).map((x) => x.code);

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${SUP}'), ('${ADM}');
    insert into operateurs (user_id) values ('${SUP}');
    insert into public.societes (id, nom) values ('${A}', 'A fictive');
    insert into membres values ('${A}', '${ADM}', 'admin');`);
});

test('le catalogue de profils est bien semé', async () => {
  assert.ok((await lignes(`select code from public.profil_metier`)).length >= 10);
});

test('un simple admin de société ne peut pas appliquer un profil', async () => {
  await db.comme(ADM, () => assert.rejects(db.query(`select public.appliquer_profil('${A}', 'loueur_vehicules')`), /patron|reserve/));
});

test('le super admin applique un profil : les modules deviennent disponibles', async () => {
  await db.comme(SUP, () => db.query(`select public.appliquer_profil('${A}', 'loueur_vehicules')`));
  assert.deepEqual(await dispo(), ['clients', 'factures', 'location_contrats', 'reglements']);
});

test('additif : un profil ajoute sans retirer les modules déjà présents', async () => {
  await db.comme(SUP, async () => {
    await db.query(`select public.rendre_disponible('${A}', 'articles', true)`);   // module ajouté à la main
    await db.query(`select public.appliquer_profil('${A}', 'prestataire')`);        // clients, devis, factures, reglements
  });
  const d = await dispo();
  assert.ok(d.includes('articles'), 'articles conservé');
  assert.ok(d.includes('devis') && d.includes('location_contrats'), 'anciens et nouveaux présents');
});

test('un profil inconnu est refusé', async () => {
  await db.comme(SUP, () => assert.rejects(db.query(`select public.appliquer_profil('${A}', 'bidon')`), /inconnu/));
});

test('un profil sans module (sécurité) ne change rien et ne plante pas', async () => {
  await db.comme(SUP, async () => {
    const avant = await dispo();
    await db.query(`select public.appliquer_profil('${A}', 'securite_alarme')`);
    assert.deepEqual(await dispo(), avant);
  });
});
