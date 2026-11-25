// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Modules par société : absence de ligne = module actif ; seul le super admin active/désactive.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const S = '10000000-0000-0000-0000-000000000001';
const UA = '00000000-0000-0000-0000-0000000000e1'; // admin de S
const UG = '00000000-0000-0000-0000-0000000000e2'; // gestion de S
const UN = '00000000-0000-0000-0000-0000000000e3'; // non-membre
const SUPER = '00000000-0000-0000-0000-000000000099'; // super admin (opérateur)

const TOUS = ['interventions','heures','frais','vehicules','conges','paie','compta','facturation','messages','documents'];

const actifs = (uid) =>
  db.comme(uid, async () => (await db.query(`select module::text from public.modules_actifs('${S}')`)).rows.map((r) => r.module));

let db;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${UA}', 'admin@test.local', now()),
      ('${UG}', 'gestion@test.local', now()),
      ('${UN}', 'autre@test.local', now()),
      ('${SUPER}', 'super@test.local', now());
    insert into public.societes (id, nom) values ('${S}', 'Test SARL');
    insert into public.operateurs (user_id) values ('${SUPER}');
    insert into public.membres (societe_id, user_id, role) values
      ('${S}', '${UA}', 'admin'),
      ('${S}', '${UG}', 'gestion');
  `);
});

test('sans réglage, tous les modules sont actifs (absence de ligne = actif)', async () => {
  const modules = await actifs(UA);
  assert.deepEqual([...modules].sort(), [...TOUS].sort());
});

test('super admin désactive « paie » : modules_actifs ne le retourne plus', async () => {
  await db.comme(SUPER, () => db.query(`select public.activer_module('${S}', 'paie', false)`));
  const modules = await actifs(UA);
  assert.equal(modules.includes('paie'), false);
  assert.equal(modules.length, TOUS.length - 1);
});

test('un admin de société ne peut pas modifier les modules', async () => {
  await assert.rejects(
    db.comme(UA, () => db.query(`select public.activer_module('${S}', 'paie', true)`)),
    /super admin/,
  );
});

test('un non-membre ne lit aucun module', async () => {
  assert.deepEqual(await actifs(UN), []);
});
