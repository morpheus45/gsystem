// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Panne de synchro du 18/11/2026 : le pont écrit avec la clé serveur (rôle service_role), pas en
// super-utilisateur. Ces tests rejouent ses écritures avec CE rôle, comme en production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ouvrirBase } from './base.js';
import { normaliser, TABLES_PONT } from '../pont/normaliser.js';

const donnees = JSON.parse(readFileSync(new URL('../fixtures/donnees-fictif.json', import.meta.url)));
const S = '00000000-0000-0000-0000-00000000000a', T = '00000000-0000-0000-0000-0000000000a9';

async function commePont(db, fn) {
  await db.exec('set role service_role');
  try { return await fn(); } finally { await db.exec('reset role'); }
}

test('le pont (service_role) importe interventions, frais, photos et gestes malgré la purge légale', async () => {
  const db = await ouvrirBase();
  await db.exec(`insert into societes (id, nom) values ('${S}', 'Societe fictive');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T}', '${S}', 'Tech fictif', 'TECH FICTIF');`);
  const r = normaliser(donnees, { societeId: S, technicienId: T });
  await commePont(db, async () => {
    for (let i = 0; i < 2; i++) {   // 2e passage : rien ne doit casser, rien ne double
      for (const [cle, table] of Object.entries(TABLES_PONT)) {
        for (const l of r[cle]) {
          const cols = Object.keys(l);
          await db.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, k) => '$' + (k + 1)).join(', ')})
            on conflict (societe_id, cle_source) do nothing`, cols.map((c) => l[c]));
        }
      }
    }
  });
  const n = async (t) => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
  assert.deepEqual([await n('temps'), await n('frais'), await n('photos_apk'), await n('gestes_co')], [3, 2, 2, 1]);
});

test('le pont (service_role) met à jour le barème courant des primes', async () => {
  const db = await ouvrirBase();
  await db.exec(`insert into societes (id, nom) values ('${S}', 'Societe fictive');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T}', '${S}', 'Tech fictif', 'TECH FICTIF');`);
  await commePont(db, async () => {
    for (const prix of ['{"gsm": 5}', '{"gsm": 6}']) {
      await db.query(`insert into primes_tarifs (societe_id, technicien_id, mois, prix) values ('${S}', '${T}', 'courant', '${prix}')
        on conflict (societe_id, technicien_id, mois) do update set prix = excluded.prix`);
    }
  });
  assert.equal((await db.query(`select prix from primes_tarifs`)).rows[0].prix.gsm, 6);
});
