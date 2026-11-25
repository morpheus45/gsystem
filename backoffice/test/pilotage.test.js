// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Pilotage des modules : disponible (toi/Gilles) + allumé × support (la société) + demandes.
// Trois serrures, cloisonnement entre holdings, et rien de l'existant modifié.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const H = '00000000-0000-0000-0000-0000000000f1';   // holding de Gilles
const H2 = '00000000-0000-0000-0000-0000000000f2';  // autre holding
const A = '00000000-0000-0000-0000-00000000000a';   // société d'H
const B = '00000000-0000-0000-0000-00000000000b';   // société d'H2
const SUP = '00000000-0000-0000-0000-0000000000c1'; // super admin (moi)
const GIL = '00000000-0000-0000-0000-0000000000c2'; // Gilles, patron d'H
const ADM = '00000000-0000-0000-0000-0000000000c3'; // admin de la société A
const ADB = '00000000-0000-0000-0000-0000000000c4'; // admin de la société B
let db;
const lignes = async (sql) => (await db.query(sql)).rows;

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${SUP}'), ('${GIL}'), ('${ADM}'), ('${ADB}');
    insert into operateurs (user_id) values ('${SUP}');
    insert into public.holdings (id, nom) values ('${H}', 'Steckler'), ('${H2}', 'Autre');
    insert into public.societes (id, nom, holding_id) values ('${A}', 'A fictive', '${H}'), ('${B}', 'B fictive', '${H2}');
    insert into public.membres_holding (holding_id, user_id, role) values ('${H}', '${GIL}', 'admin');
    insert into membres values ('${A}', '${ADM}', 'admin'), ('${B}', '${ADB}', 'admin');`);
});

test('disponible : seuls le super admin et le patron de la holding peuvent ouvrir', async () => {
  await db.comme(ADM, () => assert.rejects(
    db.query(`select public.rendre_disponible('${A}', 'clients', true)`), /patron|reserve/));
  await db.comme(SUP, () => db.query(`select public.rendre_disponible('${A}', 'clients', true)`));
  await db.comme(GIL, () => db.query(`select public.rendre_disponible('${A}', 'stock', true)`));
  await db.comme(SUP, async () => {
    const d = await lignes(`select code from public.pilotage_modules('${A}') where disponible order by code`);
    assert.deepEqual(d.map((x) => x.code), ['clients', 'stock']);
  });
});

test('allumé × support : la société allume, seulement si disponible et support prévu', async () => {
  // 'devis' pas disponible => interdit
  await db.comme(ADM, () => assert.rejects(
    db.query(`select public.allumer_module('${A}', 'devis', 'bureau', true)`), /non disponible/));
  // 'clients' autorise bureau/apk, pas iphone
  await db.comme(ADM, () => assert.rejects(
    db.query(`select public.allumer_module('${A}', 'clients', 'iphone', true)`), /support non prevu/));
  await db.comme(ADM, () => db.query(`select public.allumer_module('${A}', 'clients', 'apk', true)`));
  await db.comme(ADM, async () => {
    const [c] = await lignes(`select allumes from public.pilotage_modules('${A}') where code = 'clients'`);
    assert.deepEqual(c.allumes, ['apk']);
  });
});

test('module_ouvert : vrai seulement si disponible ET allumé sur ce support', async () => {
  await db.comme(SUP, async () => {
    const [r] = await lignes(`select private.module_ouvert('${A}', 'clients', 'apk') as ok,
      private.module_ouvert('${A}', 'clients', 'bureau') as pasbureau,
      private.module_ouvert('${A}', 'stock', 'apk') as pasallume`);
    assert.equal(r.ok, true);
    assert.equal(r.pasbureau, false);   // disponible mais pas allumé sur bureau
    assert.equal(r.pasallume, false);   // disponible mais aucun allumage
  });
});

test('éteindre la disponibilité retire aussi les allumages', async () => {
  await db.comme(GIL, () => db.query(`select public.rendre_disponible('${A}', 'clients', false)`));
  assert.equal((await lignes(`select * from public.module_allume where societe_id = '${A}' and code = 'clients'`)).length, 0);
  assert.equal((await lignes(`select * from public.module_disponible where societe_id = '${A}' and code = 'clients'`)).length, 0);
});

test('demande : la société réclame, le patron accorde, le module devient disponible', async () => {
  await db.comme(ADM, () => db.query(`select public.demander_module('${A}', 'factures')`));
  await db.comme(ADM, () => assert.rejects(
    db.query(`select public.demander_module('${A}', 'factures')`), /deja en attente/));
  let id;
  await db.comme(GIL, async () => {
    [{ id }] = await lignes(`select id from public.demande_module where societe_id = '${A}' and code = 'factures' and etat = 'en_attente'`);
    await db.query(`select public.repondre_demande('${id}', true)`);
  });
  assert.equal((await lignes(`select etat from public.demande_module where id = '${id}'`))[0].etat, 'accordee');
  assert.equal((await lignes(`select * from public.module_disponible where societe_id = '${A}' and code = 'factures'`)).length, 1);
});

test('le super admin peut aussi allumer (il configure tout)', async () => {
  await db.comme(SUP, () => db.query(`select public.allumer_module('${A}', 'factures', 'bureau', true)`));
  await db.comme(SUP, async () => {
    const [f] = await lignes(`select allumes from public.pilotage_modules('${A}') where code = 'factures'`);
    assert.deepEqual(f.allumes, ['bureau']);
  });
});

test('cloisonnement : l\'admin d\'une autre holding ne pilote pas la société A', async () => {
  await db.comme(ADB, () => assert.rejects(
    db.query(`select public.rendre_disponible('${A}', 'clients', true)`), /patron|reserve/));
  await db.comme(ADB, () => assert.rejects(
    db.query(`select public.allumer_module('${A}', 'stock', 'apk', true)`), /administration de la societe/));
  await db.comme(ADB, async () => {
    assert.equal((await lignes(`select * from public.pilotage_modules('${A}')`)).length, 0);   // ne voit pas A
  });
});
