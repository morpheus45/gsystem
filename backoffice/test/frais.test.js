import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligneFrais, totauxFrais } from '../core/frais.js';

test('parking sans TVA : HT = TTC, TVA 0', () => {
  assert.deepEqual(ligneFrais({ categorie: 'PARKING', montantEur: 4.5, sansTva: true }),
    { ttc: 4.5, ht: 4.5, tva: 0, remboursable: 4.5 });
});

test('mobile : TVA 20 %, remboursé 50 % plafonné à 20 €', () => {
  assert.deepEqual(ligneFrais({ categorie: 'MOBILE', montantEur: 50 }),
    { ttc: 50, ht: 41.67, tva: 8.33, remboursable: 20 });
});

test('totaux au centime', () => {
  const t = totauxFrais([{ categorie: 'DIVERS', montantEur: 12 }, { categorie: 'MOBILE', montantEur: 30 }]);
  assert.deepEqual(t, { ttc: 42, ht: 35, tva: 7, remboursable: 27 });
});
