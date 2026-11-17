import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repartition } from '../core/stats.js';

test('répartition : parts triées (égalité = ordre d\'apparition), au-delà de 5 regroupées en « Autres »', () => {
  const v = ['INST', 'INST', 'INST', 'SAV', 'SAV', 'MAINT', 'A', 'B', 'C'];
  assert.deepEqual(repartition(v), [
    { libelle: 'INST', n: 3, part: 3 / 9 }, { libelle: 'SAV', n: 2, part: 2 / 9 },
    { libelle: 'MAINT', n: 1, part: 1 / 9 }, { libelle: 'A', n: 1, part: 1 / 9 },
    { libelle: 'Autres', n: 2, part: 2 / 9 },
  ]);
});

test('répartition : vide -> liste vide ; 5 catégories ou moins -> pas d\'« Autres »', () => {
  assert.deepEqual(repartition([]), []);
  assert.deepEqual(repartition(['OK', 'OK', 'NR_CLIENT']).map((x) => x.libelle), ['OK', 'NR_CLIENT']);
});
