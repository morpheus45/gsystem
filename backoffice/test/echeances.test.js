// Échéance « faite » : signée par la base, gardée en historique (jamais effacée une fois faite).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', UG = '00000000-0000-0000-0000-0000000000a1', UX = '00000000-0000-0000-0000-0000000000a2';
const V = '00000000-0000-0000-0000-0000000000a5';
let db, E;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UX}');
    insert into societes (id, nom) values ('${A}', 'A fictive');
    insert into membres values ('${A}', '${UG}', 'gestion');
    insert into vehicules (id, societe_id, plaque) values ('${V}', '${A}', 'AA-000-AA');`);
  E = (await db.query(`insert into echeances (societe_id, vehicule_id, type, date) values ('${A}', '${V}', 'CT', '2026-12-01') returning id`)).rows[0].id;
});

test('marquer « fait » : date, km et signataire posés par la base', async () => {
  await db.comme(UG, () => db.query(`update echeances set fait_le = '2026-11-20', fait_km = 64000, fait_par = '${UX}' where id = '${E}'`));
  const r = (await db.query(`select fait_le::text, fait_km, fait_par from echeances where id = '${E}'`)).rows[0];
  assert.deepEqual(r, { fait_le: '2026-11-20', fait_km: 64000, fait_par: UG });
});

test('une échéance faite ne s\'efface plus (historique) ; une échéance à faire, si', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(db.query(`delete from echeances where id = '${E}'`), /historique/);
    const n = (await db.query(`insert into echeances (societe_id, vehicule_id, type, date) values ('${A}', '${V}', 'ASSURANCE', '2027-01-01') returning id`)).rows[0].id;
    await db.query(`delete from echeances where id = '${n}'`);
  });
});
