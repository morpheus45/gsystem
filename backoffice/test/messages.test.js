// Chat bureau ↔ technicien (côté technicien branché plus tard sur l'APK).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UG = '00000000-0000-0000-0000-0000000000f1', UC = '00000000-0000-0000-0000-0000000000f2', UB = '00000000-0000-0000-0000-0000000000f3';
const T = '00000000-0000-0000-0000-0000000000f9';
let db;
const comme = (uid, sql) => db.comme(uid, () => db.query(sql));

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UC}'), ('${UB}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${B}', '${UB}', 'admin');
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

test('le bureau marque lu un message du technicien ; le texte ne change jamais', async () => {
  await comme(UG, `update messages set lu_le = now() where de = 'technicien'`);
  assert.equal((await db.query(`select lu_le is not null as lu from messages where de = 'technicien'`)).rows[0].lu, true);
  await assert.rejects(comme(UG, `update messages set texte = 'modifié' where de = 'technicien'`), /modifi/);
});

test('message vide ou trop long refusé ; un message ne s’efface pas', async () => {
  await assert.rejects(comme(UG, `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T}', 'bureau', '   ')`), /check/);
  await assert.rejects(comme(UG, `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T}', 'bureau', repeat('x', 2001))`), /check/);
  await assert.rejects(comme(UG, `delete from messages`), /permission/);
});
