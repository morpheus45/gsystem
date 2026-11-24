// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Documents d'embauche : qui voit quoi, casier jamais conservé, rien ne s'efface, réglages, purge.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';
import { exigence, etatDocument, limiteDocument } from '../core/documents.js';

const H = '10000000-0000-0000-0000-0000000000f1', A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const UG = u('a1'), UC = u('a2'), UL = u('a3'), UB = u('b1'), OP = u('99'), TA = u('a9'), PARTI = u('a8');
let db;
const lignes = async (q, p) => (await db.query(q, p)).rows;
const ajouter = (type, fichier, expire = null, t = TA) => db.query(
  'insert into documents_tech (societe_id, technicien_id, type, fichier, expire_le) values ($1, $2, $3, $4, $5)', [A, t, type, fichier, expire]);
const chemin = (dossier, type, t = TA, n = 1) => `${A}/${dossier}/${t}_${type}_${n}.pdf`;

before(async () => {
  db = await ouvrirBase();
  const parti = new Date(Date.now() - 2 * 365.25 * 864e5).toISOString().slice(0, 10);
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UC}'), ('${UL}'), ('${UB}'), ('${OP}');
    insert into operateurs (user_id) values ('${OP}'); insert into holdings (id, nom) values ('${H}', 'H');
    insert into societes (id, nom, holding_id) values ('${A}', 'A', '${H}'), ('${B}', 'B', null);
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${A}', '${UL}', 'lecture'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('${TA}', '${A}', 'Tech');
    insert into techniciens (id, societe_id, nom, actif, archive_le) values ('${PARTI}', '${A}', 'Parti', false, '${parti}');`);
});

test('la gestion enregistre ; auteur et date du serveur', async () => {
  await db.comme(UG, async () => {
    await ajouter('identite', chemin('rh', 'identite'), '2030-01-01');
    await ajouter('rib', chemin('paie', 'rib'));
    await ajouter('casier', null);
  });
  assert.ok((await lignes('select cree_par from documents_tech')).every((r) => r.cree_par === UG));
});

test('casier et validité du permis : aucune copie possible ; aucun type « points »', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(ajouter('casier', chemin('rh', 'casier')), /aucune copie/);
    await assert.rejects(ajouter('permis_valide', chemin('rh', 'permis_valide')), /aucune copie/);
    await assert.rejects(ajouter('points', null), /foreign key|violates/);
  });
});

test('copie obligatoire et au bon endroit : type, technicien, dossier', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(ajouter('identite', null), /copie du document attendue/);
    await assert.rejects(ajouter('rib', chemin('rh', 'rib', TA, 2)), /dossier/);
    await assert.rejects(ajouter('rib', chemin('paie', 'contrat')), /check|violates/);
    await assert.rejects(ajouter('rib', chemin('paie', 'rib', PARTI, 3)), /check|violates/);
  });
});

test('comptable : seulement la paie ; lecture et autre société : rien', async () => {
  await db.comme(UC, async () => {
    assert.deepEqual((await lignes('select type from documents_tech')).map((r) => r.type), ['rib']);
    await assert.rejects(ajouter('rib', chemin('paie', 'rib', TA, 9)), /row-level/);
  });
  for (const x of [UL, UB]) await db.comme(x, async () => assert.equal((await lignes('select * from documents_tech')).length, 0));
});

test('rien ne s\'efface ni ne se modifie ; une erreur se met de côté', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(db.query('delete from documents_tech'), /permission|interdit/);
    await assert.rejects(db.query(`update documents_tech set expire_le = '2040-01-01' where type = 'identite'`), /seul/);
    await db.query(`update documents_tech set ecarte = true where type = 'identite'`);
  });
  await assert.rejects(db.query('delete from documents_tech'), /interdit/);
});

test('le journal ne contient pas le chemin des fichiers', async () => {
  const j = JSON.stringify(await lignes(`select avant, apres from audit where table_nom = 'documents_tech'`));
  assert.ok(j.includes('rib') && !j.includes('/paie/') && !j.includes('/rh/'));
});

test('réglages : super admin seulement ; lisibles par la société concernée', async () => {
  await db.comme(UG, () => assert.rejects(db.query('select regler_document($1, null, $2, $3)', ['dpae', A, 'facultatif']), /super admin/));
  await db.comme(OP, async () => {
    await db.query('select regler_document($1, $2, null, $3)', ['dpae', H, 'non_demande']);
    await db.query('select regler_document($1, null, $2, $3)', ['casier', A, 'obligatoire']);
    await db.query('select regler_document($1, null, $2, $3)', ['casier', A, 'facultatif']);
  });
  await db.comme(UG, async () => assert.equal((await lignes('select * from documents_regles')).length, 2));
  await db.comme(UB, async () => assert.equal((await lignes('select * from documents_regles')).length, 0));
  await db.comme(OP, async () => {
    await db.query('select regler_document($1, null, $2, null)', ['casier', A]);
    assert.equal((await lignes('select * from documents_regles')).length, 1);
  });
});

test('purge : la durée suit le type, les fichiers sont renvoyés', async () => {
  await db.comme(UG, async () => {
    await ajouter('domicile', chemin('rh', 'domicile', PARTI), null, PARTI);
    await ajouter('contrat', chemin('paie', 'contrat', PARTI), null, PARTI);
  });
  await db.comme(OP, async () => {
    assert.deepEqual(await lignes('select * from apercu_purge($1)', [A]), [{ table_nom: 'documents_tech', lignes: 1 }]);
    const r = await lignes(`select * from purger_donnees($1, 'PURGER')`, [A]);
    assert.deepEqual(r[0].fichiers, [chemin('rh', 'domicile', PARTI)]);
  });
  assert.deepEqual((await lignes('select type from documents_tech where technicien_id = $1', [PARTI])).map((x) => x.type), ['contrat']);
});

test('états affichés', () => {
  const id = { code: 'identite', exige: 'obligatoire' }, pv = { code: 'permis_valide', rappel_mois: 6 }, j = '2026-11-24';
  const r = (type, x) => ({ type, vu_le: '2026-01-31', cree_le: '2026-01-31', ecarte: false, ...x });
  const e = (t, l, ex = 'obligatoire') => etatDocument(t, ex, l, j).etat;
  assert.equal(e(id, []), 'manquant');
  assert.equal(e(id, [], 'facultatif'), 'facultatif');
  assert.equal(e(id, [r('identite', { ecarte: true })]), 'manquant');
  assert.equal(e(id, [r('identite', { expire_le: '2026-11-23' })]), 'expire');
  assert.equal(e(id, [r('identite', { expire_le: '2027-01-23' })]), 'bientot');
  assert.equal(e(id, [r('identite', { expire_le: '2027-01-24' })]), 'recu');
  assert.equal(e(id, [r('identite', { expire_le: '2026-01-01' }), r('identite', { expire_le: '2035-01-01' })]), 'recu');
  assert.equal(limiteDocument(pv, r('permis_valide', { vu_le: '2026-08-31' })), '2027-02-28');
  assert.equal(e(pv, [r('permis_valide')]), 'expire');
  const regles = [{ type: 'identite', holding_id: H, exige: 'facultatif' }, { type: 'identite', societe_id: A, exige: 'non_demande' }];
  assert.equal(exigence(id, regles, { id: A, holding_id: H }), 'non_demande');
  assert.equal(exigence(id, regles, { id: B, holding_id: H }), 'facultatif');
  assert.equal(exigence(id, regles, { id: B, holding_id: null }), 'obligatoire');
});
