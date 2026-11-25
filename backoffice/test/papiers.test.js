// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Permis et n° de sécurité sociale : formats, qui voit quoi, journal sans les numéros,
// jamais effacés à la main, purge légale après le départ.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';
import { normaliserNir, normaliserPermis, masquer, grouperNir } from '../core/papiers.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const UG = '00000000-0000-0000-0000-0000000000a1', UC = '00000000-0000-0000-0000-0000000000a2';
const UL = '00000000-0000-0000-0000-0000000000a3', UB = '00000000-0000-0000-0000-0000000000b1';
const OP = '00000000-0000-0000-0000-0000000000c1';
const TA = '00000000-0000-0000-0000-0000000000a9', PARTI = '00000000-0000-0000-0000-0000000000a8';
const NIR = '185057800608491', NIR_CORSE = '185052A00608435';
let db;
const lignes = async (sql) => (await db.query(sql)).rows;

before(async () => {
  db = await ouvrirBase();
  const deuxAns = new Date(Date.now() - 2 * 365.25 * 86400000).toISOString().slice(0, 10);
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UC}'), ('${UL}'), ('${UB}'), ('${OP}');
    insert into operateurs (user_id) values ('${OP}');
    insert into societes (id, nom) values ('${A}', 'A fictive'), ('${B}', 'B fictive');
    insert into membres values ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'),
      ('${A}', '${UL}', 'lecture'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('${TA}', '${A}', 'Tech A');
    insert into techniciens (id, societe_id, nom, actif, archive_le) values ('${PARTI}', '${A}', 'Parti', false, '${deuxAns}');`);
});

test('formats : NIR avec sa clé (Corse comprise), permis, masquage', () => {
  assert.equal(normaliserNir('1 85 05 78 006 084 91'), NIR);
  assert.equal(normaliserNir('1 85 05 2a 006 084 35'), NIR_CORSE);
  assert.equal(normaliserNir('185057800608490'), null);   // mauvaise clé
  assert.equal(normaliserNir('18505780060849'), null);    // trop court
  assert.equal(normaliserPermis('1206-7520 0123'), '120675200123');
  assert.equal(normaliserPermis('12 3'), null);
  assert.equal(masquer('120675200123'), '•••• 0123');
  assert.equal(grouperNir(NIR), '1 85 05 78 006 084 91');
});

test('la gestion enregistre permis et NIR ; saisie nettoyée, auteur posé par le serveur', async () => {
  await db.comme(UG, async () => {
    await db.query(`insert into permis_conduire (societe_id, technicien_id, numero, categories, delivre_le)
      values ('${A}', '${TA}', '1206 7520-0123', 'b; be', '2019-03-14')`);
    await db.query(`insert into secu_sociale (societe_id, technicien_id, nir, modifie_par)
      values ('${A}', '${TA}', '1 85 05 78 006 084 91', '${UB}')`);
    const [p] = await lignes(`select numero, categories, modifie_par from permis_conduire`);
    assert.deepEqual(p, { numero: '120675200123', categories: 'B,BE', modifie_par: UG });
    const [s] = await lignes(`select nir, modifie_par from secu_sociale`);
    assert.deepEqual(s, { nir: NIR, modifie_par: UG });
  });
});

test('un NIR faux ou un permis illisible n\'entrent pas', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(db.query(`update secu_sociale set nir = '185057800608490'`), /check|violates/);
    await assert.rejects(db.query(`update permis_conduire set numero = '12'`), /check|violates/);
  });
});

test('la copie du permis ne peut pointer que dans le dossier de ce technicien', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(db.query(`update permis_conduire set scan = '${A}/permis/${PARTI}_1.pdf'`), /check|violates/);
    await db.query(`update permis_conduire set scan = '${A}/permis/${TA}_1.pdf'`);
  });
});

test('qui voit quoi : comptable = NIR seulement ; lecture et autre société = rien', async () => {
  await db.comme(UC, async () => {
    assert.equal((await lignes(`select * from permis_conduire`)).length, 0);
    assert.equal((await lignes(`select * from secu_sociale`)).length, 1);
    await db.query(`update secu_sociale set nir = '${NIR_CORSE}'`);   // ne touche aucune ligne
  });
  assert.equal((await lignes(`select nir from secu_sociale`))[0].nir, NIR);
  for (const u of [UL, UB]) {
    await db.comme(u, async () => {
      assert.equal((await lignes(`select * from permis_conduire`)).length, 0);
      assert.equal((await lignes(`select * from secu_sociale`)).length, 0);
    });
  }
  await db.comme(UB, async () => {
    await assert.rejects(db.query(`insert into secu_sociale (societe_id, technicien_id, nir)
      values ('${A}', '${PARTI}', '${NIR}')`), /row-level/);
  });
});

test('le journal garde qui et quand, jamais les numéros', async () => {
  const j = await lignes(`select avant, apres from audit where table_nom in ('permis_conduire', 'secu_sociale')`);
  assert.ok(j.length >= 3);
  const texte = JSON.stringify(j);
  for (const secret of ['120675200123', NIR, '/permis/']) assert.ok(!texte.includes(secret), secret);
  assert.ok(texte.includes(UG));
});

test('ni effacement ni vidage, même pour l\'admin', async () => {
  await db.comme(UG, async () => {
    await assert.rejects(db.query(`delete from secu_sociale`), /permission|effacement interdit/);
  });
  await assert.rejects(db.query(`delete from permis_conduire`), /effacement interdit/);
});

test('purge : 1 an après le départ le permis part, le NIR reste 5 ans', async () => {
  await db.comme(UG, async () => {
    await db.query(`insert into permis_conduire (societe_id, technicien_id, numero) values ('${A}', '${PARTI}', 'AB123456')`);
    await db.query(`insert into secu_sociale (societe_id, technicien_id, nir) values ('${A}', '${PARTI}', '${NIR_CORSE}')`);
  });
  await db.comme(OP, async () => {
    const apercu = await lignes(`select table_nom, lignes from apercu_purge('${A}')`);
    assert.deepEqual(apercu, [{ table_nom: 'permis_conduire', lignes: 1 }]);
    await db.query(`select * from purger_donnees('${A}', 'PURGER')`);
  });
  assert.deepEqual(await lignes(`select technicien_id from permis_conduire order by technicien_id`), [{ technicien_id: TA }]);
  assert.equal((await lignes(`select * from secu_sociale where technicien_id = '${PARTI}'`)).length, 1);
});
