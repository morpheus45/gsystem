// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Saisies des modules : qui envoie, qui lit, aucun doublon, rien ne se perd ni ne s'efface.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const H = '10000000-0000-0000-0000-0000000000f1', A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const OP = u('99'), UA = u('a1'), UG = u('a2'), UC = u('a3'), UB = u('b1'), T1 = u('a9'), T2 = u('a8'), TB = u('b9');
const CHAMPS = [{ cle: 'etat', libelle: 'État', type: 'liste', obligatoire: true, choix: ['Bon', 'À changer'] },
  { cle: 'km', libelle: 'Km', type: 'nombre', obligatoire: false }, { cle: 'vu', libelle: 'Vu', type: 'case', obligatoire: false },
  { cle: 'le', libelle: 'Le', type: 'date', obligatoire: false }, { cle: 'note', libelle: 'Note', type: 'texte', obligatoire: false },
  { cle: 'photo', libelle: 'Photo', type: 'photo', obligatoire: false }];
const auj = (j = 0) => new Date(Date.now() + j * 86400000).toISOString().slice(0, 10);
const id = (n) => `20000000-0000-0000-0000-0000000000${n}`;
let db, m, j1, j2, jb;
const service = async (q, p) => { await db.exec('reset role; set role service_role'); try { return (await db.query(q, p)).rows; } finally { await db.exec('reset role'); } };
const modules = (j) => service('select * from telephone_modules($1)', [j]);
const saisir = async (j, i, v = { etat: 'Bon' }, { mod = m, version = 1, date = auj() } = {}) => (await service(
  'select telephone_saisie($1, $2, $3, $4, $5, $6) as r', [j, i, mod, version, date, JSON.stringify(v)]))[0].r;
const op = (q, p) => db.comme(OP, () => db.query(q, p));
const nombre = async () => Number((await db.query('select count(*) n from saisies_modules')).rows[0].n);
const brancher = async (mail) => {
  const [d] = await service('select * from telephone_demander_code($1)', [mail]);
  return (await service('select * from telephone_connecter($1, $2, $3, true)', [mail, d.code, 'Tel']))[0].jeton;
};

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${OP}'), ('${UA}'), ('${UG}'), ('${UC}'), ('${UB}');
    insert into operateurs (user_id) values ('${OP}');
    insert into holdings (id, nom) values ('${H}', 'H');
    insert into societes (id, nom, holding_id) values ('${A}', 'A', '${H}'), ('${B}', 'B', null);
    insert into membres values ('${A}', '${UA}', 'admin'), ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T1}', '${A}', 'Un', 'UN'), ('${T2}', '${A}', 'Deux', 'DEUX'), ('${TB}', '${B}', 'B', 'BB');
    insert into techniciens_mail values ('${T1}', '${A}', 'un@exemple.test'), ('${T2}', '${A}', 'deux@exemple.test'), ('${TB}', '${B}', 'b@exemple.test');`);
  m = (await op('select enregistrer_module_perso(null, $1, $2, $3, $4, 24, $5) as id',
    ['Contrôle outillage', 'outil', '#e6001c', 'Suivre l\'état des outils confiés', JSON.stringify(CHAMPS)])).rows[0].id;
  await op('select attribuer_module_perso($1, $2, null, true)', [m, H]);
  [j1, j2, jb] = [await brancher('un@exemple.test'), await brancher('deux@exemple.test'), await brancher('b@exemple.test')];
});

test('le téléphone ne voit que les modules de sa société', async () => {
  assert.deepEqual((await modules(j1)).map((x) => [x.nom, x.version, x.champs.length]), [['Contrôle outillage', 1, 6]]);
  assert.deepEqual(await modules(jb), []);
  for (const j of ['faux', null, '']) assert.deepEqual(await modules(j), []);
});

test('une saisie entre une seule fois, au nom du technicien du jeton', async () => {
  const v = { etat: 'Bon', km: 12.5, vu: true, le: '2026-11-24', note: 'ok', photo: 'MOD_2026.jpg' };
  assert.equal(await saisir(j1, id('01'), v), 'ok');
  assert.equal(await saisir(j1, id('01'), v), 'deja');
  assert.equal(await saisir(j1, id('01'), { etat: 'À changer' }), 'conflit');
  assert.equal(await saisir(j2, id('01'), v), 'conflit');
  const l = (await db.query('select technicien_id, societe_id, valeurs from saisies_modules')).rows;
  assert.deepEqual(l, [{ technicien_id: T1, societe_id: A, valeurs: v }]);
});

test('jeton, module ou contenu faux : rien n\'entre', async () => {
  const n = await nombre();
  assert.equal(await saisir('faux', id('02')), 'jeton');
  assert.equal(await saisir(jb, id('02')), 'module');
  assert.equal(await saisir(j1, id('02'), undefined, { version: 9 }), 'module');
  assert.equal(await saisir(j1, id('02'), undefined, { mod: H }), 'module');
  assert.equal(await saisir(j1, null), 'contenu');
  for (const v of [null, [], 'x', {}, { etat: '' }, { etat: null }, { etat: 'Autre' }, { etat: 'Bon', pirate: 1 }, { etat: 'Bon', km: '12' },
    { etat: 'Bon', vu: 'oui' }, { etat: 'Bon', le: '2026-02-31' }, { etat: 'Bon', le: 'hier' }, { etat: 'Bon', note: 'x'.repeat(2001) },
    { etat: 'Bon', photo: '../DEUX/donnees.json' }, { etat: 'Bon', photo: '..' }]) assert.equal(await saisir(j1, id('02'), v), 'contenu', JSON.stringify(v));
  for (const date of [auj(3), auj(-500), null]) assert.equal(await saisir(j1, id('02'), undefined, { date }), 'contenu');
  assert.equal(await nombre(), n);
});

test('saisie hors réseau : acceptée après désactivation ou changement de version', async () => {
  await op('select enregistrer_module_perso($1, $2, $3, $4, $5, 24, $6)',
    [m, 'Contrôle outillage', 'outil', '#e6001c', 'Suivre l\'état des outils confiés', JSON.stringify(CHAMPS.slice(0, 2))]);
  assert.equal((await modules(j1))[0].version, 2);
  assert.equal(await saisir(j1, id('03'), { etat: 'Bon', note: 'ancienne version' }), 'ok');
  assert.equal(await saisir(j1, id('04'), { etat: 'Bon', note: 'plus dans la v2' }, { version: 2 }), 'contenu');
  await op('select activer_module_perso($1, false)', [m]);
  assert.deepEqual(await modules(j1), []);
  assert.equal(await saisir(j1, id('05')), 'ok');
  await op('select activer_module_perso($1, true)', [m]);
  await op('select attribuer_module_perso($1, null, $2, false)', [m, A]);
  assert.deepEqual(await modules(j1), []);
  assert.equal(await saisir(j1, id('06')), 'ok');
});

test('téléphone coupé ou technicien parti : refus', async () => {
  const neuf = j2;
  await db.comme(UA, () => db.query('select telephone_couper($1)', [T2]));
  assert.equal(await saisir(neuf, id('07')), 'jeton');
  assert.deepEqual(await modules(neuf), []);
});

test('qui lit : admin et gestion de la société ; ni comptable, ni autre société ; personne n\'écrit', async () => {
  const vus = (x) => db.comme(x, async () => (await db.query('select id from saisies_modules')).rows.length);
  assert.deepEqual([await vus(UA), await vus(UG), await vus(UC), await vus(UB)], [4, 4, 0, 0]);
  await db.comme(UA, async () => {
    for (const q of [`update saisies_modules set date = date`, `delete from saisies_modules`,
      `insert into saisies_modules values ('${id('0f')}', '${A}', '${T1}', '${m}', 1, current_date, '{"etat":"Bon"}')`,
      `select telephone_modules('x')`, `select telephone_saisie('x', null, null, 1, null, '{}')`])
      await assert.rejects(db.query(q), /permission denied/);
  });
  await assert.rejects(db.query(`update saisies_modules set date = date - 1`), /modification interdite/);
  await assert.rejects(db.query(`delete from saisies_modules`), /effacement interdit/);
  await assert.rejects(db.query(`truncate saisies_modules`), /effacement interdit/);
});

test('le journal garde qui et quand, jamais le contenu', async () => {
  const t = JSON.stringify((await db.query(`select avant, apres from audit where table_nom = 'saisies_modules'`)).rows);
  assert.ok(t.includes(id('01')) && !t.includes('etat') && !t.includes('MOD_2026'));
});

test('purge : seules les saisies plus vieilles que la durée du module partent', async () => {
  await db.exec(`set session_replication_role = replica; update saisies_modules set date = current_date - interval '25 months' where id = '${id('03')}'; set session_replication_role = origin`);
  const apercu = await db.comme(OP, async () => (await db.query(`select table_nom, lignes from apercu_purge('${A}')`)).rows);
  assert.deepEqual(apercu, [{ table_nom: 'saisies_modules', lignes: 1 }]);
  await op(`select * from purger_donnees('${A}', 'PURGER')`);
  assert.equal(await nombre(), 3);
});
