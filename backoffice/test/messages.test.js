// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Chat bureau ↔ technicien (côté technicien branché plus tard sur l'APK).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UG2 = '00000000-0000-0000-0000-0000000000f4', UG = '00000000-0000-0000-0000-0000000000f1', UC = '00000000-0000-0000-0000-0000000000f2', UB = '00000000-0000-0000-0000-0000000000f3';
const T = '00000000-0000-0000-0000-0000000000f9';
let db;
const comme = (uid, sql) => db.comme(uid, () => db.query(sql));

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG2}'), ('${UG}'), ('${UC}'), ('${UB}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UG2}', 'gestion'), ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('${T}', '${A}', 'Tech A');
    -- message d'un technicien (plus tard : déposé par le pont avec la clé serveur)
    insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T}', 'technicien', 'Bonjour le bureau');`);
});

test('la gestion écrit au technicien : auteur et heure posés par la base', async () => {
  await comme(UG, `insert into messages (societe_id, technicien_id, de, texte, auteur, cree_le)
    values ('${A}', '${T}', 'bureau', 'Bonjour Tech A', '${UC}', '2000-01-01')`);
  const r = (await db.query(`select auteur, cree_le > now() - interval '1 minute' as recent from messages where de = 'bureau'`)).rows[0];
  assert.deepEqual(r, { auteur: UG, recent: true });
});

test('personne ne parle à la place du technicien depuis le bureau', async () => {
  await assert.rejects(comme(UG, `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T}', 'technicien', 'faux')`), /row-level|violates/);
});

test('ni le comptable, ni une autre société ne lisent la conversation', async () => {
  assert.equal((await comme(UC, `select count(*)::int n from messages`)).rows[0].n, 0);
  assert.equal((await comme(UB, `select count(*)::int n from messages`)).rows[0].n, 0);
  assert.equal((await comme(UG, `select count(*)::int n from messages`)).rows[0].n, 2);
});

test('le bureau marque lu un message du technicien, sans pouvoir en changer le texte', async () => {
  await comme(UG, `update messages set lu_le = now() where de = 'technicien'`);
  assert.equal((await db.query(`select lu_le is not null as lu from messages where de = 'technicien'`)).rows[0].lu, true);
  await assert.rejects(comme(UG, `update messages set texte = 'changé' where de = 'technicien'`), /auteur/);
});

test('faute de frappe : l’auteur corrige son message, marqué « modifié » ; un collègue ne peut pas', async () => {
  await comme(UG, `update messages set texte = 'Bonjour Tech A !' where de = 'bureau'`);
  const r = (await db.query(`select texte, modifie_le is not null as modifie from messages where de = 'bureau'`)).rows[0];
  assert.deepEqual(r, { texte: 'Bonjour Tech A !', modifie: true });
  await assert.rejects(comme(UG2, `update messages set texte = 'pas à moi' where de = 'bureau'`), /auteur/);
});

test('effacer : par son auteur, tant que le destinataire ne l’a pas lu', async () => {
  await comme(UG, `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T}', 'bureau', 'erreur'), ('${A}', '${T}', 'bureau', 'déjà lu')`);
  await db.query(`update messages set lu_le = now() where texte = 'déjà lu'`);   // lu par le technicien (plus tard : le pont)
  await comme(UG2, `delete from messages where texte = 'erreur'`);              // pas l'auteur : rien
  await comme(UG, `delete from messages where texte in ('erreur', 'déjà lu')`);
  assert.deepEqual((await db.query(`select texte from messages where de = 'bureau' order by texte`)).rows.map((x) => x.texte), ['Bonjour Tech A !', 'déjà lu']);
});

test('message vide ou trop long refusé', async () => {
  await assert.rejects(comme(UG, `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T}', 'bureau', '   ')`), /check/);
  await assert.rejects(comme(UG, `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T}', 'bureau', repeat('x', 2001))`), /check/);
});
