// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Extrait comptable des notes de frais : montants, écritures équilibrées, relevé, contrôles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montantsComptables, ecritures, versCsvFec, COLONNES_FEC, controles, releve, PARAMS_DEFAUT } from '../core/compta.js';

const f = (o) => ({ id: 'f1', date: '2026-06-10', categorie: 'DIVERS', montantEur: 12, sansTva: false, tvaRecuperable: false, fichier: 'a.jpg', ...o });
const tech = { nom: 'Tech A', compteAuxiliaire: '421TECHA' };

test('TVA non récupérable (par défaut) : tout le remboursé en charge', () => {
  assert.deepEqual(montantsComptables(f()), { total: 12, tva: 0, charge: 12 });
});

test('TVA récupérable : charge HT + TVA = remboursé', () => {
  assert.deepEqual(montantsComptables(f({ tvaRecuperable: true })), { total: 12, tva: 2, charge: 10 });
});

test('mobile remboursé 20 € sur 50 € : TVA récupérable au prorata du remboursé', () => {
  assert.deepEqual(montantsComptables(f({ categorie: 'MOBILE', montantEur: 50, tvaRecuperable: true })), { total: 20, tva: 3.33, charge: 16.67 });
  assert.deepEqual(montantsComptables(f({ categorie: 'MOBILE', montantEur: 50 })), { total: 20, tva: 0, charge: 20 });
});

test('ticket sans TVA : rien en TVA même si coché', () => {
  assert.deepEqual(montantsComptables(f({ categorie: 'PARKING', montantEur: 4.5, sansTva: true, tvaRecuperable: true })), { total: 4.5, tva: 0, charge: 4.5 });
});

test('écritures : une par frais, équilibrée, comptes du plan comptable, salarié en auxiliaire', () => {
  const l = ecritures({ tech, frais: [f({ tvaRecuperable: true }), f({ id: 'f2', categorie: 'MOBILE', montantEur: 30 })], params: PARAMS_DEFAUT, valideLe: '2026-11-18' });
  assert.deepEqual(l.map((x) => [x.EcritureNum, x.CompteNum, x.Debit, x.Credit]), [
    ['1', '628', 10, 0], ['1', '44566', 2, 0], ['1', '421', 0, 12],
    ['2', '626', 15, 0], ['2', '421', 0, 15]]);
  const e = l[2];
  assert.equal(e.JournalCode, 'NDF');
  assert.equal(e.EcritureDate, '20260610');
  assert.equal(e.ValidDate, '20261118');
  assert.equal(e.CompAuxNum, '421TECHA');
  assert.equal(e.CompAuxLib, 'Tech A');
  assert.equal(e.PieceRef, 'a.jpg');
  assert.equal(l[0].CompAuxNum, '');
  for (const n of ['1', '2']) {
    const lignes = l.filter((x) => x.EcritureNum === n);
    const s = (k) => Math.round(lignes.reduce((a, x) => a + x[k], 0) * 100);
    assert.equal(s('Debit'), s('Credit'));
  }
});

test('catégorie sans compte : refus, aucun compte inventé', () => {
  assert.throws(() => ecritures({ tech, frais: [f({ categorie: 'PEAGE' })], params: PARAMS_DEFAUT, valideLe: '2026-11-18' }), /compte.*PEAGE/);
});

test('CSV : colonnes du FEC dans l’ordre, virgule décimale, textes protégés', () => {
  const l = ecritures({ tech: { nom: '=Tech;A' }, frais: [f()], params: PARAMS_DEFAUT, valideLe: '2026-11-18' });
  const [entete, premiere, seconde] = versCsvFec(l).split('\r\n');
  assert.equal(entete, COLONNES_FEC.join(';'));
  assert.equal(COLONNES_FEC.length, 18);
  assert.match(premiere, /;12,00;0,00;/);
  assert.match(seconde, /"'=Tech;A"/);
});

test('contrôles : justificatif absent, montant nul, doublon, pas encore traité', () => {
  const liste = [f({ statut: 'valide' }), f({ id: 'f2', statut: 'valide' }), f({ id: 'f3', montantEur: 0, fichier: '', statut: 'a_traiter' })];
  const c = controles(liste, new Set(['a.jpg']));
  assert.deepEqual(c.get('f1'), ['doublon possible']);
  assert.deepEqual(c.get('f3'), ['justificatif absent', 'montant nul', 'à valider']);
});

test('relevé : une ligne par frais avec ses montants comptables, et le total', () => {
  const r = releve(tech, [f({ statut: 'valide', tvaRecuperable: true }), f({ id: 'f2', statut: 'valide', date: '2026-06-11', montantEur: 6 })], new Set(['a.jpg']));
  assert.equal(r.lignes.length, 2);
  assert.deepEqual(r.lignes[0], { technicien: 'Tech A', date: '10/06/2026', categorie: 'DIVERS', ttc: 12, ht: 10, tva: 2, rembourse: 12,
    tvaRecuperee: 2, charge: 10, sansTva: 'Non', justificatif: 'a.jpg', controles: '' });
  assert.deepEqual(r.total, { ttc: 18, rembourse: 18, tvaRecuperee: 2, charge: 16 });
});
