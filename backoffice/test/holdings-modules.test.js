// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Holdings et modules : le super admin règle tout ; un admin de holding ne voit que la sienne.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';
import { moduleActif } from '../core/organisation.js';

const A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b', C = '10000000-0000-0000-0000-00000000000c';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const OP = u('99'), UA = u('a1'), STK = u('d1'), AUT = u('d2'), NEUF = u('d3'), FAUX = u('d4');
let db, hs, ha;
const par = (x, q, p) => db.comme(x, async () => (await db.query(q, p)).rows);
const val = async (x, q, p) => Object.values((await par(x, q, p))[0])[0];
const modules = async (x, s) => (await par(x, 'select * from modules_actifs($1)', [s])).map((r) => r.module);
const noms = async (x, t) => (await par(x, `select nom from ${t} order by nom`)).map((r) => r.nom);
const TOUT = 10;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${OP}', 'op@x.test', now()), ('${UA}', 'a@x.test', now()),
      ('${STK}', 'stk@x.test', now()), ('${AUT}', 'aut@x.test', now()), ('${NEUF}', 'neuf@x.test', now()), ('${FAUX}', 'faux@x.test', null);
    insert into operateurs (user_id) values ('${OP}');
    insert into societes (id, nom) values ('${A}', 'A'), ('${B}', 'B'), ('${C}', 'C');
    insert into membres values ('${A}', '${UA}', 'admin');`);
  hs = await val(OP, 'select enregistrer_holding(null, $1)', [' Steckler ']);
  ha = await val(OP, 'select enregistrer_holding(null, $1)', ['Autre']);
  await par(OP, 'select rattacher_societe($1, $2)', [A, hs]);
  await par(OP, 'select rattacher_societe($1, $2)', [B, ha]);
});

test('créer, renommer, jamais deux fois le même nom ; super admin seulement', async () => {
  assert.deepEqual(await noms(OP, 'holdings'), ['Autre', 'Steckler']);
  await assert.rejects(par(OP, 'select enregistrer_holding(null, $1)', ['steckler']), /existe deja/);
  await assert.rejects(par(OP, 'select enregistrer_holding(null, $1)', [' ']), /2 a 120/);
  for (const q of [`select enregistrer_holding(null, 'X1')`, `select rattacher_societe('${A}', null)`, `select nommer_admin_holding('${hs}', 'a@x.test')`,
    `select retirer_admin_holding('${hs}', 'a@x.test')`, `select regler_module('paie', '${hs}', null, false)`]) await assert.rejects(par(UA, q), /super admin/);
});

test('un admin de société ne change pas sa holding, mais garde ses autres droits', async () => {
  for (const h of [`'${ha}'`, 'null']) await assert.rejects(par(UA, `update societes set holding_id = ${h} where id = '${A}'`), /super admin/);
  await par(UA, `update societes set adresse = 'Rue', holding_id = holding_id where id = '${A}'`);
  assert.equal(await val(OP, `select adresse from societes where id = '${A}'`), 'Rue');
});

test('admin existant nommé tout de suite ; nouveau : à sa connexion, email confirmé seulement', async () => {
  assert.equal(await val(OP, 'select nommer_admin_holding($1, $2)', [hs, ' STK@x.test ']), 'nomme');
  assert.equal(await val(OP, 'select nommer_admin_holding($1, $2)', [ha, 'aut@x.test']), 'nomme');
  await db.exec(`delete from auth.users where id = '${NEUF}'`);
  assert.equal(await val(OP, 'select nommer_admin_holding($1, $2)', [hs, 'neuf@x.test']), 'invite');
  assert.equal(await val(OP, 'select nommer_admin_holding($1, $2)', [hs, 'faux@x.test']), 'invite');
  assert.deepEqual((await par(OP, 'select * from admins_holding($1)', [hs])).map((r) => `${r.email}:${r.etat}`),
    ['faux@x.test:invite', 'neuf@x.test:invite', 'stk@x.test:actif']);
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${NEUF}', 'neuf@x.test', now())`);
  assert.equal(await val(NEUF, 'select accepter_invitations()'), 1);
  assert.equal(await val(FAUX, 'select accepter_invitations()'), 0);
  assert.equal(await val(NEUF, 'select accepter_invitations()'), 0);
  assert.deepEqual([await noms(NEUF, 'societes'), await noms(FAUX, 'societes')], [['A'], []]);
  for (const x of [UA, STK]) {
    assert.deepEqual(await par(x, 'select * from admins_holding($1)', [hs]), []);
    await assert.rejects(par(x, 'select * from private.invitations_holding'), /permission denied/);
  }
});

test('chacun voit sa holding et ses sociétés ; le super admin voit tout', async () => {
  const vue = async (x) => [await noms(x, 'holdings'), await noms(x, 'societes')];
  assert.deepEqual(await vue(OP), [['Autre', 'Steckler'], ['A', 'B', 'C']]);
  assert.deepEqual(await vue(STK), [['Steckler'], ['A']]);
  assert.deepEqual(await vue(AUT), [['Autre'], ['B']]);
  await par(OP, 'select rattacher_societe($1, $2)', [C, hs]);   // nouvelle société : vue aussitôt
  assert.deepEqual(await noms(STK, 'societes'), ['A', 'C']);
  await par(OP, 'select rattacher_societe($1, $2)', [C, null]);
  assert.deepEqual(await noms(STK, 'societes'), ['A']);
  await par(OP, 'select retirer_admin_holding($1, $2)', [hs, 'neuf@x.test']);
  assert.deepEqual(await vue(NEUF), [[], []]);
});

test('modules : holding puis société ; les autres holdings ne bougent pas', async () => {
  assert.equal((await modules(UA, A)).length, TOUT);
  await par(OP, `select regler_module('paie', $1, null, false)`, [hs]);
  await par(OP, `select regler_module('compta', $1, null, false)`, [hs]);
  assert.deepEqual([(await modules(STK, A)).length, (await modules(AUT, B)).length], [TOUT - 2, TOUT]);
  await par(OP, `select regler_module('paie', null, $1, true)`, [A]);
  assert.ok((await modules(UA, A)).includes('paie'));
  await par(OP, `select regler_module('conges', null, $1, false)`, [A]);
  assert.equal((await modules(UA, A)).length, TOUT - 2);
  const [ms, mh] = [await par(OP, 'select * from modules_societe'), await par(OP, 'select * from modules_holding')];
  const tous = await modules(OP, C);
  for (const [id, holding_id] of [[A, hs], [B, ha], [C, null]])   // la page calcule comme la base
    assert.deepEqual(tous.filter((m) => moduleActif(ms, mh, m, { id, holding_id })).sort(), (await modules(OP, id)).sort());
  for (const m of ['paie', 'conges']) await par(OP, `select regler_module($1, null, $2, null)`, [m, A]);
  for (const m of ['paie', 'compta']) await par(OP, `select regler_module($1, $2, null, null)`, [m, hs]);
  assert.equal((await modules(UA, A)).length, TOUT);
  assert.deepEqual(await modules(AUT, A), []);
  for (const x of [UA, STK]) assert.deepEqual(await par(x, 'select * from modules_holding'), []);
  await assert.rejects(par(STK, `insert into modules_holding values ('${hs}', 'paie', false)`), /permission denied/);
  await assert.rejects(par(STK, `select regler_module('paie', null, '${A}', false)`), /super admin/);
});

test('le patron nomme une personne par société ; elle ne voit que la sienne', async () => {
  await par(OP, 'select rattacher_societe($1, $2)', [C, hs]);
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${u('e1')}', 'pa@x.test', now()), ('${u('e2')}', 'pc@x.test', now())`);
  await par(STK, `insert into invitations (societe_id, email, role) values ('${A}', 'pa@x.test', 'admin')`);
  await par(STK, `insert into invitations (societe_id, email, role) values ('${C}', 'pc@x.test', 'admin')`);
  await assert.rejects(par(STK, `insert into invitations (societe_id, email, role) values ('${B}', 'pa@x.test', 'admin')`), /row-level/);
  for (const x of ['e1', 'e2']) await par(u(x), 'select accepter_invitations()');
  assert.deepEqual([await noms(u('e1'), 'societes'), await noms(u('e2'), 'societes'), await noms(STK, 'societes'), await noms(AUT, 'societes')], [['A'], ['C'], ['A', 'C'], ['B']]);
  for (const x of ['e1', 'e2']) assert.deepEqual(await noms(u(x), 'holdings'), []);
  assert.equal((await par(STK, 'select * from membres_de($1)', [C])).length, 1);
  await assert.rejects(par(STK, 'select * from membres_de($1)', [B]), /acces refuse/);
  await assert.rejects(par(u('e1'), 'select * from membres_de($1)', [C]), /acces refuse/);
});
