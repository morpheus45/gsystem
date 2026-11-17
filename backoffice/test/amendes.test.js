// Amendes : rattachées à la société, conducteur de la même société, jamais effacées.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UA = '00000000-0000-0000-0000-0000000000a1', UB = '00000000-0000-0000-0000-0000000000b1';
const VA = '00000000-0000-0000-0000-0000000000a5', TA = '00000000-0000-0000-0000-0000000000a9', TB = '00000000-0000-0000-0000-0000000000b9';
let db;
const amende = (s, v, t, n) => `insert into amendes (societe_id, vehicule_id, technicien_id, numero_avis, date_avis, montant)
  values ('${s}', '${v}', ${t ? `'${t}'` : 'null'}, '${n}', '2026-11-01', 135)`;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UA}'), ('${UB}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UA}', 'gestion'), ('${B}', '${UB}', 'admin');
    insert into vehicules (id, societe_id, plaque) values ('${VA}', '${A}', 'AA-000-AA');
    insert into techniciens (id, societe_id, nom) values ('${TA}', '${A}', 'Tech A'), ('${TB}', '${B}', 'Tech B');`);
});

test('la gestion saisit une amende ; un même numéro d\'avis n\'entre pas deux fois', async () => {
  await db.comme(UA, async () => {
    await db.query(amende(A, VA, TA, 'AV-1'));
    await assert.rejects(db.query(amende(A, VA, null, 'AV-1')), /duplicate|unique/);
    assert.equal((await db.query(`select statut from amendes`)).rows[0].statut, 'a_traiter');
  });
});

test('B ne voit pas l\'amende de A et ne peut pas désigner un tech de A', async () => {
  await db.comme(UB, async () => {
    assert.equal((await db.query(`select * from amendes`)).rows.length, 0);
    await assert.rejects(db.query(amende(B, VA, TB, 'AV-2')), /foreign key|row-level/);
  });
  await db.comme(UA, async () => {
    await assert.rejects(db.query(amende(A, VA, TB, 'AV-3')), /foreign key/);
  });
});

test('une amende ne s\'efface pas', async () => {
  await db.comme(UA, async () => {
    await assert.rejects(db.query(`delete from amendes`), /effacement interdit/);
  });
});

test('statut limité aux valeurs prévues', async () => {
  await db.comme(UA, async () => {
    await assert.rejects(db.query(`update amendes set statut = 'oubliee'`), /check|violates/);
    await db.query(`update amendes set statut = 'designee', designe_le = '2026-11-10'`);
  });
});
