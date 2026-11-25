// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tests du tri automatique des signalements.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normaliserTexte, similarite, regrouper, proposerLots } from '../core/signalements.js';

test('normaliserTexte : minuscules, sans accents, mots <3 lettres retirés', () => {
  const r = normaliserTexte('Le KM ne REMont PAS !');
  assert.ok(r.has('remont'));
  assert.ok(r.has('pas'));
  assert.equal(r.has('le'), false);
  assert.equal(r.has('ne'), false);
  assert.equal(r.has('km'), false);
});

test('normaliserTexte : chaîne vide ou invalide', () => {
  assert.equal(normaliserTexte('').size, 0);
  assert.equal(normaliserTexte(null).size, 0);
  assert.equal(normaliserTexte(undefined).size, 0);
});

test('similarite : textes identiques → 1', () => {
  assert.equal(similarite('le km ne remonte pas', 'le km ne remonte pas'), 1);
});

test('similarite : textes différents → 0', () => {
  assert.equal(similarite('le km ne remonte pas', 'le moteur fume'), 0);
});

test('similarite : 3 signalements même écran → 1 groupe', () => {
  const sigs = [
    { id: 'a', ecran: 'Véhicules', gravite: 'non_urgent', statut: 'nouveau', explication: 'le km ne remonte pas' },
    { id: 'b', ecran: 'Véhicules', gravite: 'urgent', statut: 'nouveau', explication: 'le kilometre ne remonte pas aussi' },
    { id: 'c', ecran: 'Véhicules', gravite: 'critique', statut: 'nouveau', explication: 'km ne remonte pas du tout' },
  ];
  const groupes = regrouper(sigs, 0.3);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].nombre, 3);
  assert.equal(groupes[0].gravité, 'critique');
  assert.equal(groupes[0].ecran, 'Véhicules');
  assert.deepEqual(groupes[0].ids.sort(), ['a', 'b', 'c']);
  assert.equal(groupes[0].premier, 'a');
  assert.equal(groupes[0].exemple.id, 'a');
});

test('regrouper : textes différents sur même écran → 2 groupes', () => {
  const sigs = [
    { id: 'a', ecran: 'Véhicules', gravite: 'non_urgent', statut: 'nouveau', explication: 'le km ne remonte pas' },
    { id: 'b', ecran: 'Véhicules', gravite: 'non_urgent', statut: 'nouveau', explication: 'le moteur fume beaucoup' },
  ];
  const groupes = regrouper(sigs, 0.5);
  assert.equal(groupes.length, 2);
  assert.equal(groupes[0].nombre, 1);
  assert.equal(groupes[1].nombre, 1);
});

test('regrouper : ignore statut corrige', () => {
  const sigs = [
    { id: 'a', ecran: 'Véhicules', gravite: 'non_urgent', statut: 'corrige', explication: 'le km ne remonte pas' },
    { id: 'b', ecran: 'Véhicules', gravite: 'urgent', statut: 'nouveau', explication: 'le km ne remonte plus' },
  ];
  const groupes = regrouper(sigs, 0.3);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].nombre, 1);
  assert.deepEqual(groupes[0].ids, ['b']);
});

test('regrouper : ignore statut refuse', () => {
  const sigs = [
    { id: 'a', ecran: 'Véhicules', gravite: 'non_urgent', statut: 'refuse', explication: 'le km ne remonte pas' },
    { id: 'b', ecran: 'Véhicules', gravite: 'urgent', statut: 'nouveau', explication: 'le km ne remonte plus' },
  ];
  const groupes = regrouper(sigs, 0.3);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].nombre, 1);
});

test('regrouper : ignore statut doublon', () => {
  const sigs = [
    { id: 'a', ecran: 'Véhicules', gravite: 'non_urgent', statut: 'doublon', explication: 'le km ne remonte pas' },
    { id: 'b', ecran: 'Véhicules', gravite: 'urgent', statut: 'nouveau', explication: 'le km ne remonte plus' },
  ];
  const groupes = regrouper(sigs, 0.3);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].nombre, 1);
});

test('regrouper : tri critique avant urgent avant non_urgent', () => {
  const sigs = [
    { id: 'a', ecran: 'A', gravite: 'non_urgent', statut: 'nouveau', explication: 'un bug mineur' },
    { id: 'b', ecran: 'B', gravite: 'urgent', statut: 'nouveau', explication: 'un bug urgent' },
    { id: 'c', ecran: 'C', gravite: 'critique', statut: 'nouveau', explication: 'un bug critique' },
  ];
  const groupes = regrouper(sigs, 0.5);
  assert.equal(groupes[0].gravité, 'critique');
  assert.equal(groupes[1].gravité, 'urgent');
  assert.equal(groupes[2].gravité, 'non_urgent');
});

test('regrouper : même gravité → tri par nombre décroissant', () => {
  const sigs = [
    { id: 'a', ecran: 'A', gravite: 'urgent', statut: 'nouveau', explication: 'bug urgent 1' },
    { id: 'b', ecran: 'B', gravite: 'urgent', statut: 'nouveau', explication: 'bug urgent 2' },
    { id: 'c', ecran: 'B', gravite: 'urgent', statut: 'nouveau', explication: 'bug urgent 2 bis' },
  ];
  const groupes = regrouper(sigs, 0.5);
  // B a 2 signalements (id b et c) → vient avant A qui en a 1
  assert.equal(groupes[0].ecran, 'B');
  assert.equal(groupes[0].nombre, 2);
  assert.equal(groupes[1].ecran, 'A');
  assert.equal(groupes[1].nombre, 1);
});

test('proposerLots : lots par écran triés par gravité max', () => {
  const groupes = regrouper([
    { id: 'a', ecran: 'A', gravite: 'critique', statut: 'nouveau', explication: 'bug critique' },
    { id: 'b', ecran: 'B', gravite: 'non_urgent', statut: 'nouveau', explication: 'bug mineur' },
    { id: 'c', ecran: 'C', gravite: 'urgent', statut: 'nouveau', explication: 'bug urgent' },
  ], 0.5);
  const lots = proposerLots(groupes);
  assert.equal(lots.length, 3);
  assert.equal(lots[0].ecran, 'A');
  assert.equal(lots[0].gravité, 'critique');
  assert.equal(lots[1].ecran, 'C');
  assert.equal(lots[1].gravité, 'urgent');
  assert.equal(lots[2].ecran, 'B');
  assert.equal(lots[2].gravité, 'non_urgent');
});

test('proposerLots : regroupe plusieurs groupes du même écran', () => {
  const groupes = regrouper([
    { id: 'a', ecran: 'A', gravite: 'urgent', statut: 'nouveau', explication: 'bug urgent 1' },
    { id: 'b', ecran: 'A', gravite: 'non_urgent', statut: 'nouveau', explication: 'bug mineur 1' },
    { id: 'c', ecran: 'B', gravite: 'critique', statut: 'nouveau', explication: 'bug critique' },
  ], 0.5);
  const lots = proposerLots(groupes);
  assert.equal(lots.length, 2);
  // A a 2 groupes, B a 1 groupe
  const lotA = lots.find((l) => l.ecran === 'A');
  const lotB = lots.find((l) => l.ecran === 'B');
  assert.equal(lotA.groupes.length, 2);
  assert.equal(lotB.groupes.length, 1);
  // gravité max de A = urgent, B = critique → B vient avant A
  assert.equal(lots[0].ecran, 'B');
  assert.equal(lots[1].ecran, 'A');
});

test('regrouper : écrans différents jamais dans le même groupe', () => {
  const sigs = [
    { id: 'a', ecran: 'A', gravite: 'non_urgent', statut: 'nouveau', explication: 'le km ne remonte pas' },
    { id: 'b', ecran: 'B', gravite: 'non_urgent', statut: 'nouveau', explication: 'le km ne remonte pas' },
  ];
  const groupes = regrouper(sigs, 0.9);
  assert.equal(groupes.length, 2);
});