// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
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
  assert.deepEqual(TABLES_PONT, { temps: 'temps', frais: 'frais', photos: 'photos_apk', gestes: 'gestes_co' });
  for (let i = 0; i < 2; i++) for (const [cle, table] of Object.entries(TABLES_PONT)) await inserer(db, table, r[cle]);
  const n = async (t) => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
  assert.deepEqual([await n('temps'), await n('frais'), await n('photos_apk'), await n('gestes_co')], [3, 2, 2, 1]);
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
        await assert.rejects(db.query(`delete from ${t} where societe_id = '${S}'`), /effacement interdit|permission denied/, `${t} par ${uid}`);
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

test('photos APK : emplacement de stockage notable par le pont, pas par un utilisateur', async () => {
  const db = await ouvrirBase();
  const U = '00000000-0000-0000-0000-0000000000a1';
  await db.exec(`insert into auth.users (id) values ('${U}');
    insert into societes (id, nom) values ('${S}', 'Societe fictive');
    insert into membres values ('${S}', '${U}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T}', '${S}', 'Tech fictif', 'TECH FICTIF');`);
  const r = normaliser(donnees, { societeId: S, technicienId: T });
  await inserer(db, 'photos_apk', r.photos);
  const chemin = `${S}/apk/${T}/2026-11/ZZ-999-ZZ-11-2026.jpg`;
  await db.query(`update photos_apk set stockage = $1 where cle_source = $2`, [chemin, r.photos[1].cle_source]);   // le pont (clé serveur)
  assert.equal((await db.query(`select stockage from photos_apk where cle_source = $1`, [r.photos[1].cle_source])).rows[0].stockage, chemin);
  await db.comme(U, async () => {
    await assert.rejects(db.query(`update photos_apk set stockage = 'autre' where cle_source = $1`, [r.photos[0].cle_source]), /permission denied/);
  });
});

test('barèmes de primes : lisibles par la société, écrits seulement par le pont', async () => {
  const db = await ouvrirBase();
  const U = '00000000-0000-0000-0000-0000000000a1';
  await db.exec(`insert into auth.users (id) values ('${U}');
    insert into societes (id, nom) values ('${S}', 'Societe fictive');
    insert into membres values ('${S}', '${U}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T}', '${S}', 'Tech fictif', 'TECH FICTIF');
    insert into primes_tarifs (societe_id, technicien_id, mois, prix) values ('${S}', '${T}', 'courant', '{"gsm": 5}');`);
  await db.comme(U, async () => {
    assert.equal((await db.query(`select prix from primes_tarifs`)).rows[0].prix.gsm, 5);
    await assert.rejects(db.query(`update primes_tarifs set prix = '{}'`), /permission denied/);
    await assert.rejects(db.query(`delete from gestes_co`), /permission denied|effacement interdit/);
  });
});
