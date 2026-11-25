// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tuiles de l'APK cachées par holding et société ; sans réglage, rien ne change.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';
import { TUILES_APK, tuileVisible } from '../core/tuiles-apk.js';

const H = '10000000-0000-0000-0000-0000000000f1', A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const OP = u('99'), UA = u('a1'), T1 = u('a9'), TB = u('b9');
let db, ja, jb;
const service = async (q, p) => { await db.exec('reset role; set role service_role'); try { return (await db.query(q, p)).rows; } finally { await db.exec('reset role'); } };
const cachees = async (j) => (await service('select telephone_tuiles($1) as r', [j]))[0]?.r ?? null;
const regler = (t, h, s, v, x = OP) => db.comme(x, () => db.query('select regler_tuile($1, $2, $3, $4)', [t, h, s, v]));
const brancher = async (mail) => {
  const [d] = await service('select * from telephone_demander_code($1)', [mail]);
  return (await service('select * from telephone_connecter($1, $2, $3, true)', [mail, d.code, 'Tel']))[0].jeton;
};

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${OP}'), ('${UA}');
    insert into operateurs (user_id) values ('${OP}');
    insert into holdings (id, nom) values ('${H}', 'H');
    insert into societes (id, nom, holding_id) values ('${A}', 'A', '${H}'), ('${B}', 'B', null);
    insert into membres values ('${A}', '${UA}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T1}', '${A}', 'Un', 'UN'), ('${TB}', '${B}', 'B', 'BB');
    insert into techniciens_mail values ('${T1}', '${A}', 'un@exemple.test'), ('${TB}', '${B}', 'b@exemple.test');`);
  [ja, jb] = [await brancher('un@exemple.test'), await brancher('b@exemple.test')];
});

test('sans réglage tout est visible ; jeton faux : pas de réponse', async () => {
  assert.deepEqual([await cachees(ja), await cachees(jb)], [[], []]);
  for (const j of ['faux', null]) assert.equal(await cachees(j), null);
});

test('la holding d\'abord, la société l\'emporte, les autres ne changent pas', async () => {
  await regler('pv_cameras', H, null, false);
  await regler('frais', H, null, false);
  assert.deepEqual([await cachees(ja), await cachees(jb)], [['frais', 'pv_cameras'], []]);
  await regler('frais', null, A, true);
  await regler('conge', null, A, false);
  assert.deepEqual(await cachees(ja), ['conge', 'pv_cameras']);
  await regler('frais', null, A, null);
  assert.deepEqual(await cachees(ja), ['conge', 'frais', 'pv_cameras']);
});

test('clôture et envoi mensuel ne se cachent jamais ; super admin seulement', async () => {
  for (const t of ['cloture', 'envoi_mensuel', 'feuille', '']) await assert.rejects(regler(t, H, null, false), /check|violates/);
  await assert.rejects(regler('frais', null, A, false, UA), /super admin/);
  await assert.rejects(regler('frais', H, A, false), /holding OU/);
  await assert.rejects(db.comme(UA, () => db.query(`insert into tuiles_reglages (tuile, societe_id, visible) values ('frais', '${A}', false)`)), /permission denied/);
  assert.ok((await db.query(`select 1 from audit where table_nom = 'tuiles_reglages'`)).rows.length >= 5);
});

test('la page et la base ont la même liste ; la page calcule comme la base', async () => {
  const c = (await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'tuiles_reglages'::regclass and pg_get_constraintdef(oid) like '%pv_cameras%'`)).rows[0].d;
  assert.deepEqual([...c.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort(), TUILES_APK.map(([t]) => t).sort());
  const r = (await db.query('select * from tuiles_reglages')).rows;
  const vues = (s) => TUILES_APK.map(([t]) => t).filter((t) => !tuileVisible(r, t, s)).sort();
  assert.deepEqual(vues({ id: A, holding_id: H }), await cachees(ja));
  assert.deepEqual(vues({ id: B, holding_id: null }), []);
});
