// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheminLisse, cheminAire, echelle } from '../web/courbe.js';

// ─── cheminLisse ─────────────────────────────────────────────────────────────

test('cheminLisse : 0 point → chaîne vide', () => {
  assert.equal(cheminLisse([]), '');
});

test('cheminLisse : 1 point → M x y', () => {
  assert.equal(cheminLisse([{ x: 10, y: 20 }]), 'M 10 20');
});

test('cheminLisse : 2 points → M … L …', () => {
  const d = cheminLisse([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
  assert.ok(d.startsWith('M 0 0'), `attendu début "M 0 0", obtenu "${d}"`);
  assert.ok(d.includes('L 100 50'), `attendu "L 100 50", obtenu "${d}"`);
});

test('cheminLisse : 4 points → commence par M et contient C', () => {
  const pts = [
    { x: 0, y: 10 },
    { x: 50, y: 30 },
    { x: 100, y: 20 },
    { x: 150, y: 40 },
  ];
  const d = cheminLisse(pts);
  assert.ok(d.startsWith('M '), `attendu début "M ", obtenu "${d}"`);
  assert.ok(d.includes(' C '), `attendu segments "C", obtenu "${d}"`);
  // Doit passer par le dernier point (arrondi 2 déc.)
  assert.ok(d.endsWith('150 40'), `attendu fin "150 40", obtenu "${d}"`);
});

test('cheminLisse : 6 points croissants en y — aucun point de contrôle hors [yMin, yMax]', () => {
  // Les y sont strictement croissants ; la méthode Fritsch-Carlson garantit que
  // les points de contrôle restent dans l'enveloppe des données.
  const pts = [
    { x: 0,   y: 10 },
    { x: 40,  y: 20 },
    { x: 80,  y: 35 },
    { x: 120, y: 50 },
    { x: 160, y: 60 },
    { x: 200, y: 80 },
  ];
  const yMin = 10;
  const yMax = 80;

  const d = cheminLisse(pts);

  // Extraire tous les nombres du chemin (sauf la commande initiale M)
  // Format : "M x0 y0 C cp1x cp1y cp2x cp2y ex ey C …"
  // On parse chaque segment "C cp1x cp1y cp2x cp2y ex ey"
  const segments = d.split(/\bC\b/).slice(1); // enlève le "M x y" initial
  segments.forEach(seg => {
    const nums = seg.trim().split(/\s+/).map(Number);
    // nums = [cp1x, cp1y, cp2x, cp2y, ex, ey]
    // Les y sont aux indices 1, 3, 5
    const yCp1 = nums[1];
    const yCp2 = nums[3];
    assert.ok(
      yCp1 >= yMin - 0.01 && yCp1 <= yMax + 0.01,
      `y du CP1 (${yCp1}) hors de [${yMin}, ${yMax}]`,
    );
    assert.ok(
      yCp2 >= yMin - 0.01 && yCp2 <= yMax + 0.01,
      `y du CP2 (${yCp2}) hors de [${yMin}, ${yMax}]`,
    );
  });
});

// ─── cheminAire ──────────────────────────────────────────────────────────────

test('cheminAire : 0 point → chaîne vide', () => {
  assert.equal(cheminAire([], 100), '');
});

test('cheminAire : 1 point → chaîne vide', () => {
  assert.equal(cheminAire([{ x: 0, y: 0 }], 100), '');
});

test('cheminAire : finit par Z', () => {
  const pts = [{ x: 0, y: 10 }, { x: 100, y: 20 }, { x: 200, y: 15 }];
  const d = cheminAire(pts, 200);
  assert.ok(d.endsWith('Z'), `attendu fin "Z", obtenu "${d}"`);
});

test('cheminAire : contient les segments de fermeture vers la base', () => {
  const pts = [{ x: 10, y: 5 }, { x: 90, y: 15 }];
  const d = cheminAire(pts, 100);
  // Doit refermer avec L xn basY L x0 basY Z
  assert.ok(d.includes('L 90 100'), `attendu "L 90 100", obtenu "${d}"`);
  assert.ok(d.includes('L 10 100'), `attendu "L 10 100", obtenu "${d}"`);
  assert.ok(d.endsWith('Z'), `attendu fin "Z", obtenu "${d}"`);
});

// ─── echelle ─────────────────────────────────────────────────────────────────

test('echelle : tableau vide → tableau vide', () => {
  assert.deepEqual(echelle([], 640, 220, 24), []);
});

test('echelle : y de la valeur 0 = hauteur − marge', () => {
  const pts = echelle([0, 50, 100], 640, 220, 24);
  // Le point x=0 a y = hauteur - marge = 220 - 24 = 196
  assert.equal(pts[0].y, 220 - 24);
});

test('echelle : y du max = marge', () => {
  const pts = echelle([0, 50, 100], 640, 220, 24);
  // Le dernier point (max = 100) doit avoir y = marge = 24
  assert.equal(pts[2].y, 24);
});

test('echelle : x du premier point = marge, x du dernier = largeur − marge', () => {
  const pts = echelle([10, 20, 30], 640, 220, 24);
  assert.equal(pts[0].x, 24);
  assert.equal(pts[2].x, 640 - 24);
});

test('echelle : max implicite à 1 si toutes les valeurs sont 0', () => {
  // max = Math.max(1, 0) = 1 ; valeur 0 → y = hauteur - marge
  const pts = echelle([0], 640, 220, 24);
  assert.equal(pts[0].y, 220 - 24);
});
