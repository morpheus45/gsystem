// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Modules personnalisés : qui crée, qui voit, holding et société, et rien ne se perd.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';
import { cleChamp, defautModule, enService } from '../core/modules-perso.js';

const H = '10000000-0000-0000-0000-0000000000f1';
const A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b', C = '10000000-0000-0000-0000-00000000000c';
const OP = '00000000-0000-0000-0000-000000000099', UA = '00000000-0000-0000-0000-0000000000a1';
const UC = '00000000-0000-0000-0000-0000000000c1', UH = '00000000-0000-0000-0000-0000000000d1';
const CHAMPS = [{ cle: 'etat', libelle: 'État', type: 'liste', obligatoire: true, choix: ['Bon', 'À changer'] },
  { cle: 'photo', libelle: 'Photo', type: 'photo', obligatoire: false }];
let db, m;
const enreg = async (id, champs, nom = 'Contrôle outillage') => (await db.query(
  'select enregistrer_module_perso($1, $2, $3, $4, $5, $6, $7) as id',
  [id, nom, 'outil', '#E6001C', 'Suivre l\'état des outils confiés', 24, JSON.stringify(champs)])).rows[0].id;
const attribuer = (h, s, actif) => db.comme(OP, () => db.query('select attribuer_module_perso($1, $2, $3, $4)', [m, h, s, actif]));
const vus = (u, s) => db.comme(u, async () => (await db.query('select nom, version from modules_perso_de($1)', [s])).rows);

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${OP}'), ('${UA}'), ('${UC}'), ('${UH}');
    insert into operateurs (user_id) values ('${OP}');
    insert into holdings (id, nom) values ('${H}', 'Holding fictive');
    insert into societes (id, nom, holding_id) values ('${A}', 'A', '${H}'), ('${B}', 'B', '${H}'), ('${C}', 'C', null);
    insert into membres values ('${A}', '${UA}', 'admin'), ('${C}', '${UC}', 'admin');
    insert into membres_holding values ('${H}', '${UH}', 'admin');`);
});

test('seul le super admin crée, active ou attribue', async () => {
  for (const u of [UA, UH]) await db.comme(u, async () => {
    await assert.rejects(enreg(null, CHAMPS), /super admin/);
    await assert.rejects(db.query(`insert into modules_perso (nom, icone, couleur, finalite, conservation_mois)
      values ('Pirate', 'outil', '#000000', 'contourner la fonction', 1)`), /permission denied/);
    await assert.rejects(db.query('select attribuer_module_perso($1, $2, null, true)', [A, H]), /super admin/);
    await assert.rejects(db.query('select activer_module_perso($1, true)', [A]), /super admin/);
  });
  m = await db.comme(OP, () => enreg(null, CHAMPS));
  assert.ok(m);
});

test('non attribué : personne ne le voit', async () => {
  assert.deepEqual(await vus(UA, A), []);
});

test('attribué à la holding : toutes ses sociétés, aucune autre', async () => {
  await attribuer(H, null, true);
  assert.equal((await vus(UA, A)).length, 1);
  assert.equal((await vus(UH, B)).length, 1);
  assert.equal((await vus(UC, C)).length, 0);
  assert.equal((await vus(UC, A)).length, 0);   // société dont on n'est pas membre
});

test('une société peut le couper, puis suivre de nouveau sa holding', async () => {
  await attribuer(null, A, false);
  assert.equal((await vus(UA, A)).length, 0);
  assert.equal((await vus(UH, B)).length, 1);
  await attribuer(null, A, null);
  assert.equal((await vus(UA, A)).length, 1);
  await attribuer(null, C, true);
  assert.equal((await vus(UC, C)).length, 1);
});

test('changer les champs crée une version ; l\'ancienne reste intacte', async () => {
  await db.comme(OP, () => enreg(m, CHAMPS));   // identique : pas de nouvelle version
  assert.equal((await vus(UA, A))[0].version, 1);
  await db.comme(OP, () => enreg(m, [CHAMPS[0]]));
  assert.equal((await vus(UA, A))[0].version, 2);
  const v1 = (await db.query('select champs from modules_perso_versions where module_id = $1 and version = 1', [m])).rows[0].champs;
  assert.deepEqual(v1, CHAMPS);
});

test('un champ ne change jamais de type, même retiré puis remis', async () => {
  await db.comme(OP, async () => {
    await assert.rejects(enreg(m, [CHAMPS[0], { cle: 'photo', libelle: 'Photo', type: 'texte', obligatoire: false }]), /changer de type/);
  });
});

test('rien ne s\'efface, aucune version ne se modifie', async () => {
  await assert.rejects(db.query('delete from modules_perso'), /interdit/);
  await assert.rejects(db.query('delete from modules_perso_versions'), /interdit/);
  await assert.rejects(db.query(`update modules_perso_versions set champs = '[]'`), /interdit/);
  await assert.rejects(db.query('truncate modules_perso_versions'), /interdit/);
});

test('désactivé partout : invisible, mais conservé et réactivable', async () => {
  await db.comme(OP, () => db.query('select activer_module_perso($1, false)', [m]));
  assert.equal((await vus(UA, A)).length, 0);
  await db.comme(OP, () => db.query('select activer_module_perso($1, true)', [m]));
  assert.equal((await vus(UA, A)).length, 1);
});

test('champs invalides refusés par la base', async () => {
  const x = { cle: 'a', libelle: 'A', type: 'texte', obligatoire: false };
  for (const mauvais of [[], {}, null, [{ ...x, type: 'script' }], [x, x], [{ ...x, cle: 'A b' }], [{ ...x, libelle: ' ' }],
    [{ ...x, obligatoire: 'oui' }], [{ ...x, type: 'liste' }], [{ ...x, type: 'liste', choix: ['seul'] }], [{ ...x, choix: ['a', 'b'] }]])
    await db.comme(OP, () => assert.rejects(enreg(null, mauvais), /invalides/, JSON.stringify(mauvais)));
});

test('les tables de l\'APK ne sont pas touchées : aucune référence', async () => {
  const r = await db.query(`select conrelid::regclass::text t, confrelid::regclass::text f from pg_constraint
    where contype = 'f' and (conrelid::regclass::text like 'modules_perso%' or confrelid::regclass::text like 'modules_perso%')`);
  for (const { f } of r.rows) assert.ok(['modules_perso', 'holdings', 'societes'].includes(f), f);
});

test('aides de saisie : clé stable, défauts en clair, portée', () => {
  assert.equal(cleChamp('État du matériel'), 'etat_du_materiel');
  assert.equal(cleChamp('2 photos', []), 'photos');
  assert.equal(cleChamp('Photo', ['photo']), 'photo_2');
  assert.equal(cleChamp('***'), 'champ');
  const ok = { nom: 'Test', finalite: 'Suivre les outils', conservation: 12, champs: [{ libelle: 'A', type: 'texte' }] };
  assert.equal(defautModule(ok), null);
  assert.match(defautModule({ ...ok, finalite: '' }), /à quoi servent/);
  assert.match(defautModule({ ...ok, champs: [{ libelle: 'L', type: 'liste', choix: ['x'] }] }), /2 à 30 choix/);
  const p = [{ holding_id: H, actif: true }, { societe_id: A, actif: false }];
  assert.equal(enService(p, { id: A, holding_id: H }), false);
  assert.equal(enService(p, { id: B, holding_id: H }), true);
  assert.equal(enService(p, { id: C, holding_id: null }), false);
});
