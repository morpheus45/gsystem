import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heuresDuJour as heuresDocs } from '../../docs/app/heures.js';
import { heuresJour, semaineIso, ventiler, cumulSemaines } from '../core/heures.js';
import { reglesDe } from '../core/societes.js';

const lire = (f) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url)));
const R = reglesDe({}).heures;
const jour = (date, slotMidi, observationType = '', typeMission = 'INST') => ({ date, slotMidi, observationType, typeMission });

test('équivalence Kotlin ↔ JS : mêmes heures sur tous les cas', (t) => {
  const kotlin = lire('heures-kotlin.json');
  lire('heures-cas.json').forEach((c, i) => {
    t.diagnostic(`${c.nom} : kotlin=${kotlin[i].heures} js=${heuresJour(c.entrees)}`);
    assert.equal(kotlin[i].nom, c.nom);
    assert.equal(heuresJour(c.entrees), kotlin[i].heures, c.nom);
  });
});

test('docs/app/heures.js brut diverge de Kotlin sur un espace seul (raison du nettoyage)', () => {
  const cas = lire('heures-cas.json').find((c) => c.nom === 'observation avec espace seul');
  assert.equal(heuresDocs(cas.entrees), 6);
  assert.equal(heuresJour(cas.entrees), 8);
});

test('semaine ISO, y compris en fin d\'année', () => {
  assert.equal(semaineIso('2026-01-05'), '2026-W02');
  assert.equal(semaineIso('2026-01-01'), '2026-W01');
  assert.equal(semaineIso('2027-01-01'), '2026-W53');
});

test('ventilation : normales, sup 25 %, sup 50 %', () => {
  assert.deepEqual(ventiler(30, R), { normales: 30, sup25: 0, sup50: 0 });
  assert.deepEqual(ventiler(40, R), { normales: 35, sup25: 5, sup50: 0 });
  assert.deepEqual(ventiler(48, R), { normales: 35, sup25: 8, sup50: 5 });
});

test('cumul par semaine : 5 jours pleins = 40 h, le dimanche est ignoré par défaut', () => {
  const temps = ['05', '06', '07', '08', '09', '11'].flatMap((d) =>
    [jour(`2026-01-${d}`, 'MATIN'), jour(`2026-01-${d}`, 'APREM')]);
  assert.deepEqual(cumulSemaines(temps, R), [
    { semaine: '2026-W02', travaillees: 40, absences: 0, normales: 35, sup25: 5, sup50: 0 },
  ]);
});

test('cumul : les vacances vont en absence, hors du seuil des heures sup', () => {
  const temps = [jour('2026-01-12', '', '', 'VACANCES'),
    ...['13', '14', '15', '16'].flatMap((d) => [jour(`2026-01-${d}`, 'MATIN'), jour(`2026-01-${d}`, 'APREM')])];
  assert.deepEqual(cumulSemaines(temps, R), [
    { semaine: '2026-W03', travaillees: 32, absences: 7, normales: 32, sup25: 0, sup50: 0 },
  ]);
});
