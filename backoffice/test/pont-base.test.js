// Le pont d'import produit des lignes que la VRAIE base accepte, sans doublon au réimport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ouvrirBase } from './base.js';
import { normaliser, TABLES_PONT } from '../pont/normaliser.js';

const donnees = JSON.parse(readFileSync(new URL('../fixtures/donnees-fictif.json', import.meta.url)));
const S = '00000000-0000-0000-0000-00000000000a', T = '00000000-0000-0000-0000-0000000000a9';

async function inserer(db, table, lignes) {
  for (const l of lignes) {
    const cols = Object.keys(l);
    await db.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})
      on conflict (societe_id, cle_source) do nothing`, cols.map((c) => l[c]));
  }
}

test('les lignes du pont entrent dans la base, et un 2e import ne crée aucun doublon', async () => {
  const db = await ouvrirBase();
  await db.exec(`insert into societes (id, nom) values ('${S}', 'Societe fictive');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T}', '${S}', 'Tech fictif', 'TECH FICTIF');`);
  const r = normaliser(donnees, { societeId: S, technicienId: T });
  assert.deepEqual(TABLES_PONT, { temps: 'temps', frais: 'frais', photos: 'photos_apk' });
  for (let i = 0; i < 2; i++) for (const [cle, table] of Object.entries(TABLES_PONT)) await inserer(db, table, r[cle]);
  const n = async (t) => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
  assert.deepEqual([await n('temps'), await n('frais'), await n('photos_apk')], [3, 2, 2]);
});

test('données réelles de l\'APK : personne ne peut les effacer, même le super admin', async () => {
  const db = await ouvrirBase();
  const OP = '00000000-0000-0000-0000-0000000000f1', AD = '00000000-0000-0000-0000-0000000000f2';
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${OP}', 'op@exemple.test', now()), ('${AD}', 'ad@exemple.test', now());
    insert into operateurs values ('${OP}');
    insert into societes (id, nom) values ('${S}', 'Societe fictive');
    insert into membres values ('${S}', '${AD}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T}', '${S}', 'Tech fictif', 'TECH FICTIF');`);
  const r = normaliser(donnees, { societeId: S, technicienId: T });
  for (const [cle, table] of Object.entries(TABLES_PONT)) await inserer(db, table, r[cle]);
  for (const uid of [AD, OP]) {
    await db.comme(uid, async () => {
      for (const t of ['temps', 'frais', 'photos_apk']) {
        await assert.rejects(db.query(`delete from ${t} where societe_id = '${S}'`), /effacement interdit/, `${t} par ${uid}`);
      }
      await assert.rejects(db.query(`delete from techniciens where id = '${T}'`), /effacement interdit|foreign key/);
    });
  }
  await db.comme(OP, async () => {
    await assert.rejects(db.query(`select supprimer_societe('${S}')`), /effacement interdit/);
  });
  const n = async (t) => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
  assert.deepEqual([await n('temps'), await n('frais'), await n('photos_apk'), await n('societes')], [3, 2, 2, 1]);
});
