// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliser, filtrerPalette } from '../web/recherche.js';

// --- normaliser ---

test('normaliser : retire les accents', () => {
  assert.equal(normaliser('Cédric'), 'cedric');
  assert.equal(normaliser('éàùîôê'), 'eauioe');
  assert.equal(normaliser('Ça été génial'), 'ca ete genial');
});

test('normaliser : passe en minuscules', () => {
  assert.equal(normaliser('BONJOUR'), 'bonjour');
  assert.equal(normaliser('Hello World'), 'hello world');
});

test('normaliser : réduit les espaces multiples et retire les bords', () => {
  assert.equal(normaliser('  un   deux  '), 'un deux');
  assert.equal(normaliser('\t\n espace \t'), 'espace');
  assert.equal(normaliser(''), '');
});

// --- filtrerPalette (nom distinct du filtrer des interventions : la page assemblée partage un seul espace de noms) ---

const ELEMENTS = [
  { titre: 'Cédric LAGO', sousTitre: 'Gérant', motsCles: 'admin', action: () => {} },
  { titre: 'Jean DUPONT', sousTitre: 'Technicien', motsCles: 'fibre SAV', action: () => {} },
  { titre: 'Marie CURIE', sousTitre: 'Technicienne', motsCles: 'expert', action: () => {} },
  { titre: 'Véhicule AB-123-CD', sousTitre: 'Renault Trafic', motsCles: 'fourgon', action: () => {} },
  { titre: 'Ajouter un technicien', sousTitre: '', motsCles: 'ajout création', action: () => {} },
];

test('filtrerPalette : les accents sont ignorés (« cedric » trouve « Cédric »)', () => {
  const r = filtrerPalette(ELEMENTS, 'cedric');
  assert.equal(r.length, 1);
  assert.equal(r[0].titre, 'Cédric LAGO');
});

test('filtrerPalette : plusieurs mots doivent tous être présents', () => {
  const r = filtrerPalette(ELEMENTS, 'jean fibre');
  assert.equal(r.length, 1);
  assert.equal(r[0].titre, 'Jean DUPONT');
});

test('filtrerPalette : pas de correspondance', () => {
  const r = filtrerPalette(ELEMENTS, 'zzz');
  assert.equal(r.length, 0);
});

test('filtrerPalette : ordre « commence par » d\'abord', () => {
  // « ajouter » correspond en titre au 5e élément, mais « technicien » aussi au 2e (sousTitre)
  // Les deux matchent « technicien ». Celui dont le titre commence par la requête passe en premier.
  const elements = [
    { titre: 'Un technicien formidable', sousTitre: '', motsCles: '', action: () => {} },
    { titre: 'technicien Jean', sousTitre: '', motsCles: '', action: () => {} },
  ];
  const r = filtrerPalette(elements, 'technicien');
  assert.equal(r[0].titre, 'technicien Jean');
  assert.equal(r[1].titre, 'Un technicien formidable');
});

test('filtrerPalette : max respecté', () => {
  const r = filtrerPalette(ELEMENTS, '', 2);
  assert.equal(r.length, 2);
  assert.equal(r[0].titre, 'Cédric LAGO');
  assert.equal(r[1].titre, 'Jean DUPONT');
});

test('filtrerPalette : requête vide renvoie les max premiers éléments', () => {
  const r = filtrerPalette(ELEMENTS, '');
  assert.equal(r.length, 5);
  assert.equal(r[0].titre, 'Cédric LAGO');

  const r2 = filtrerPalette(ELEMENTS, '   ');
  assert.equal(r2.length, 5);
});

test('filtrerPalette : max par défaut = 8', () => {
  // Créer plus de 8 éléments
  const beaucoup = Array.from({ length: 12 }, (_, i) => ({
    titre: 'Élément ' + i,
    sousTitre: 'commun',
    motsCles: '',
    action: () => {},
  }));
  const r = filtrerPalette(beaucoup, 'commun');
  assert.equal(r.length, 8);
});
