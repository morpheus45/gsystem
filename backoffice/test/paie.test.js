// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
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
  assert.deepEqual(v, { tech: 'T1', debut: '2025-12-21', fin: '2026-01-20', heuresNormales: 35, sup1: 8, sup2: 5,
    absences: 0, fraisRemboursables: 20, primes: 12.5, taux1: 0.25, taux2: 0.5, reglesValidees: false });
});

test('une semaine est rattachée à la période qui contient son samedi', () => {
  const temps = plein('2026-01-19'); // semaine du 19 au 25 : samedi 24 hors période
  const v = variablesPaie({ tech: 'T1', periode: { debut: '2025-12-21', fin: '2026-01-20' }, temps, frais: [], regles: reglesDe({}) });
  assert.equal(v.heuresNormales, 0);
});

test('export CSV séparé par des points-virgules', () => {
  const csv = versCsv([{ tech: 'T1', debut: 'a', fin: 'b', heuresNormales: 35, sup1: 1.5, sup2: 0,
    absences: 0, fraisRemboursables: 20, primes: 0, taux1: 0.25, taux2: 0.5, reglesValidees: false }]);
  assert.equal(csv, 'tech;debut;fin;heuresNormales;sup1;sup2;absences;fraisRemboursables;primes;taux1;taux2;reglesValidees\n' +
    'T1;a;b;35;1,5;0;0;20;0;0,25;0,5;non\n');
});

test('CSV : un texte avec ; ou guillemet est protégé, une formule est neutralisée', () => {
  const csv = versCsv([{ tech: 'Dupont; "Jo"', note: '=1+1' }]);
  assert.equal(csv, 'tech;note\n"Dupont; ""Jo""";"\'=1+1"\n');
});

test('le taux réel de la société est exporté avec les heures sup', () => {
  const v = variablesPaie({ tech: 'T1', periode: { debut: '2025-12-21', fin: '2026-01-20' }, temps: [], frais: [],
    regles: reglesDe({ regles: { heures: { taux1: 0.1 } } }) });
  assert.equal(v.taux1, 0.1);
});

test('paie avec validations : seules les semaines validées paient des heures sup', () => {
  const temps = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10',
    '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16', '2026-01-17'].flatMap(plein);
  const base = { tech: 'T1', periode: { debut: '2025-12-21', fin: '2026-01-20' }, temps, frais: [], regles: reglesDe({}) };
  const v = variablesPaie({ ...base, validations: [{ semaine: '2026-W02', valide: true }, { semaine: '2026-W03', refusee: true }] });
  assert.deepEqual([v.sup1, v.sup2, v.supRefusees, v.semainesATraiter], [8, 5, 13, 0]);
  const w = variablesPaie({ ...base, validations: [{ semaine: '2026-W02', valide: true }] });
  assert.deepEqual([w.sup1, w.sup2, w.supRefusees, w.semainesATraiter], [8, 5, 0, 1]);
});

test('période close un samedi : la semaine qui finit ce samedi est dedans (pas la suivante)', () => {
  const temps = [...plein('2026-01-12'), ...plein('2026-01-19')];   // semaines 3 et 4
  const v = variablesPaie({ tech: 'T1', periode: { debut: '2025-12-21', fin: '2026-01-17' }, temps, frais: [], regles: reglesDe({}) });
  assert.equal(v.heuresNormales, 8);
});
