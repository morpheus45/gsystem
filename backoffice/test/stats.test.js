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

import { tauxNr as tauxNrApk } from '../../docs/app/docRecap.js';
import { tauxNr } from '../core/stats.js';

test('taux NR : identique à l\'APK web (docs/app/docRecap.js) sur les mêmes cas', () => {
  const e = (date, typeMission, observationType = '') => ({ date, typeMission, observationType });
  const cas = [
    [],
    [e('2026-11-03', 'INST'), e('2026-11-04', 'INST', 'NR_CLIENT'), e('2026-11-05', 'inst', 'NR_TECHNIQUE')],
    [e('2026-11-03', 'INST', 'NR_CLIENT_ABS'), e('2026-11-04', 'INST', 'NR_AUTRES'), e('2026-11-05', 'SAV', 'NR_CLIENT')],
    [e('2026-10-31', 'INST', 'NR_CLIENT'), ...Array.from({ length: 12 }, (_, i) => e(`2026-11-${String(i + 1).padStart(2, '0')}`, 'INST'))],
  ];
  for (const c of cas) assert.deepEqual(tauxNr(c, '2026-11'), tauxNrApk(c, '2026-11'));
  assert.equal(Math.round(tauxNr(cas[1], '2026-11').pourcent * 100) / 100, 66.67);
});
