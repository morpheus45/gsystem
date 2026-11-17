// Validation des heures sup : case cochée par admin/gestion, signée par la base, verrouillée après export.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UG = '00000000-0000-0000-0000-0000000000a1', UL = '00000000-0000-0000-0000-0000000000a2';
const UC = '00000000-0000-0000-0000-0000000000a3', UB = '00000000-0000-0000-0000-0000000000b1';
const T = '00000000-0000-0000-0000-0000000000a9';
let db;
const valider = (semaine, lundi, valide = true) => `insert into heures_sup (societe_id, technicien_id, semaine, date, sup1, sup2, valide, valide_par)
  values ('${A}', '${T}', '${semaine}', '${lundi}', 5, 0, ${valide}, '${UB}')
  on conflict (societe_id, technicien_id, semaine) do update set valide = excluded.valide`;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UL}'), ('${UC}'), ('${UB}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UL}', 'lecture'), ('${A}', '${UC}', 'comptable'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('${T}', '${A}', 'Tech A');`);
});

test('la gestion coche : la base signe avec l\'utilisateur connecté, pas la valeur envoyée', async () => {
  await db.comme(UG, () => db.query(valider('2026-W45', '2026-11-02')));
  const r = (await db.query(`select valide, valide_par, valide_le is not null as date from heures_sup`)).rows[0];
  assert.deepEqual(r, { valide: true, valide_par: UG, date: true });
});

test('décocher garde la ligne (historique) et efface la signature', async () => {
  await db.comme(UG, () => db.query(valider('2026-W45', '2026-11-02', false)));
  const r = (await db.query(`select valide, valide_par from heures_sup`)).rows[0];
  assert.deepEqual(r, { valide: false, valide_par: null });
  assert.ok((await db.query(`select count(*)::int n from audit where table_nom = 'heures_sup'`)).rows[0].n >= 2);
});

test('lecture seule et comptable ne valident pas ; l\'autre société ne voit rien', async () => {
  for (const u of [UL, UC]) {
    await db.comme(u, async () => {
      await assert.rejects(db.query(valider('2026-W46', '2026-11-09')), /row-level security/);
    });
  }
  await db.comme(UB, async () => {
    assert.equal((await db.query(`select * from heures_sup`)).rows.length, 0);
  });
});

test('une validation ne s\'efface pas, et se fige quand la paie est exportée', async () => {
  await db.comme(UG, async () => {
    await db.query(valider('2026-W45', '2026-11-02', true));
    await assert.rejects(db.query(`delete from heures_sup`), /effacement interdit/);
  });
  await db.exec(`insert into membres values ('${A}', '00000000-0000-0000-0000-0000000000b1', 'admin')`);
  const P = '00000000-0000-0000-0000-0000000000c1';
  await db.comme(UB, async () => {
    await db.query(`insert into periodes_paie (id, societe_id, debut, fin) values ('${P}', '${A}', '2026-10-21', '2026-11-20')`);
    await db.query(`update periodes_paie set statut = 'validee' where id = '${P}'`);
    await db.query(`update periodes_paie set statut = 'exportee' where id = '${P}'`);
  });
  await db.comme(UG, async () => {
    await assert.rejects(db.query(valider('2026-W45', '2026-11-02', false)), /verrouillee/);
  });
});
