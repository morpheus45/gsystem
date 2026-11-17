import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variablesPaie, versCsv } from '../core/paie.js';
import { reglesDe } from '../core/societes.js';

const plein = (d) => [{ date: d, slotMidi: 'MATIN', observationType: '', typeMission: 'INST' },
  { date: d, slotMidi: 'APREM', observationType: '', typeMission: 'INST' }];

test('variables de paie d\'un tech sur une période', () => {
  const temps = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10'].flatMap(plein);
  const v = variablesPaie({
    tech: 'T1', periode: { debut: '2025-12-21', fin: '2026-01-20' }, temps,
    frais: [{ date: '2026-01-06', categorie: 'MOBILE', montantEur: 50 }, { date: '2026-01-25', categorie: 'DIVERS', montantEur: 9 }],
    primes: 12.5, regles: reglesDe({}),
  });
  assert.deepEqual(v, { tech: 'T1', debut: '2025-12-21', fin: '2026-01-20', heuresNormales: 35, sup25: 8, sup50: 5,
    absences: 0, fraisRemboursables: 20, primes: 12.5, reglesValidees: false });
});

test('une semaine est rattachée à la période qui contient son dimanche', () => {
  const temps = plein('2026-01-19'); // semaine du 19 au 25 : dimanche hors période
  const v = variablesPaie({ tech: 'T1', periode: { debut: '2025-12-21', fin: '2026-01-20' }, temps, frais: [], regles: reglesDe({}) });
  assert.equal(v.heuresNormales, 0);
});

test('export CSV séparé par des points-virgules', () => {
  const csv = versCsv([{ tech: 'T1', debut: 'a', fin: 'b', heuresNormales: 35, sup25: 1.5, sup50: 0,
    absences: 0, fraisRemboursables: 20, primes: 0, reglesValidees: false }]);
  assert.equal(csv, 'tech;debut;fin;heuresNormales;sup25;sup50;absences;fraisRemboursables;primes;reglesValidees\n' +
    'T1;a;b;35;1,5;0;0;20;0;non\n');
});

test('CSV : un texte avec ; ou guillemet est protégé, une formule est neutralisée', () => {
  const csv = versCsv([{ tech: 'Dupont; "Jo"', note: '=1+1' }]);
  assert.equal(csv, 'tech;note\n"Dupont; ""Jo""";"\'=1+1"\n');
});
