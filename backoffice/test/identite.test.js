// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Identité d'une société (nom, adresse, logo) : modifiable par son admin seulement.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UA = '00000000-0000-0000-0000-0000000000e1', UG = '00000000-0000-0000-0000-0000000000e2';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
let db;
const maj = (uid, sql) => db.comme(uid, () => db.query(sql));
const identite = async (id) => (await db.query(`select nom, adresse, logo from societes where id = '${id}'`)).rows[0];

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UA}'), ('${UG}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UA}', 'admin'), ('${A}', '${UG}', 'gestion'), ('${B}', '${UG}', 'admin');`);
});

test('l’admin change le nom, l’adresse et le logo de sa société', async () => {
  await maj(UA, `update societes set nom = 'A SARL', adresse = '1 rue Fictive, 45000 Orléans', logo = '${PNG}' where id = '${A}'`);
  assert.deepEqual(await identite(A), { nom: 'A SARL', adresse: '1 rue Fictive, 45000 Orléans', logo: PNG });
});

test('la gestion ne peut pas, ni l’admin d’une autre société', async () => {
  await maj(UG, `update societes set adresse = 'piratée' where id = '${A}'`);
  assert.equal((await identite(A)).adresse, '1 rue Fictive, 45000 Orléans');
});

test('logo : image PNG, JPEG ou WebP seulement (pas de SVG), et petite', async () => {
  await assert.rejects(maj(UA, `update societes set logo = 'data:image/svg+xml;base64,PHN2Zz4=' where id = '${A}'`), /check/);
  await assert.rejects(maj(UA, `update societes set logo = 'data:image/png;base64,' || repeat('A', 400000) where id = '${A}'`), /check/);
  await maj(UA, `update societes set logo = null where id = '${A}'`);
  assert.equal((await identite(A)).logo, null);
});

test('nom vide refusé', async () => {
  await assert.rejects(maj(UA, `update societes set nom = '  ' where id = '${A}'`), /check/);
});

test('SIRET : 14 chiffres, sinon refusé ; vide accepté', async () => {
  await maj(UA, `update societes set siret = '79195355700018' where id = '${A}'`);
  assert.equal((await db.query(`select siret from societes where id = '${A}'`)).rows[0].siret, '79195355700018');
  await assert.rejects(maj(UA, `update societes set siret = '7919 5355' where id = '${A}'`), /check/);
  await maj(UA, `update societes set siret = null where id = '${A}'`);
});
