// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Rendu « doux » du tableau de bord (RENDU.md) : parties calculées, sans écran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { morceauxCompteur, initiales, avatarCouleurs, PALETTE_AVATARS, positionsOrbite, variation } from '../web/rendu.js';

test('compteur : chaque chiffre est une bande, le reste reste fixe', () => {
  assert.deepEqual(morceauxCompteur('83,50 €'), [{ chiffre: 8 }, { chiffre: 3 }, { texte: ',' }, { chiffre: 5 }, { chiffre: 0 }, { texte: '\u00a0€' }]);
  assert.deepEqual(morceauxCompteur('78 h'), [{ chiffre: 7 }, { chiffre: 8 }, { texte: '\u00a0h' }]);
  assert.deepEqual(morceauxCompteur('—'), [{ texte: '—' }]);
  assert.deepEqual(morceauxCompteur(''), []);
});

// Le compteur est une boîte flex : un espace ordinaire en tête de morceau y est effacé (« 4,3% », « 276h »).
test('compteur : l\'espace avant l\'unité devient insécable et reste affiché', () => {
  assert.deepEqual(morceauxCompteur('4,3 %'), [{ chiffre: 4 }, { texte: ',' }, { chiffre: 3 }, { texte: '\u00a0%' }]);
  assert.ok(morceauxCompteur('276 h').every((m) => !('texte' in m) || !m.texte.includes(' ')));
});

test('initiales : deux lettres, mots séparés par espace ou tiret', () => {
  assert.equal(initiales('Cédric LAGO-GOMEZ'), 'CL');
  assert.equal(initiales('TECH'), 'TE');
  assert.equal(initiales('  '), '?');
  assert.equal(initiales('jean-paul'), 'JP');
});

test('avatar : toujours la même couleur pour un même nom, prise dans la palette', () => {
  assert.deepEqual(avatarCouleurs('Lucas Martin'), avatarCouleurs('Lucas Martin'));
  assert.ok(PALETTE_AVATARS.some((c) => c[0] === avatarCouleurs('Inès Dubois')[0]));
  const couleurs = new Set(['Lucas Martin', 'Inès Dubois', 'Karim Benali', 'Tech Essai', 'Cédric'].map((n) => avatarCouleurs(n)[0]));
  assert.ok(couleurs.size >= 2);
});

test('orbite : les pastilles sont réparties sur un cercle, la première en haut', () => {
  const p = positionsOrbite(4, 100);
  assert.equal(p.length, 4);
  assert.deepEqual(p[0], { x: 0, y: -100 });
  assert.deepEqual(p[1], { x: 100, y: 0 });
  assert.deepEqual(p[2], { x: 0, y: 100 });
  assert.deepEqual(positionsOrbite(0, 100), []);
});

test('évolution par rapport au mois précédent : signe, arrondi, pas de division par zéro', () => {
  assert.deepEqual(variation(110, 100), { texte: '+10 %', sens: 'hausse' });
  assert.deepEqual(variation(45, 60), { texte: '−25 %', sens: 'baisse' });
  assert.deepEqual(variation(5, 0), null);
  assert.deepEqual(variation(100, 100), { texte: '0 %', sens: 'stable' });
});
