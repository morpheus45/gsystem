import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLES_DEFAUT, reglesDe } from '../core/societes.js';

test('sans réglage, la société reçoit les repères légaux, non validés', () => {
  const r = reglesDe({ id: 'A' });
  assert.equal(r.heures.seuilHebdo, 35);
  assert.equal(r.heures.tranche25, 8);
  assert.equal(r.heures.taux1, 0.25);
  assert.equal(r.heures.taux2, 0.5);
  assert.equal(r.valide, false);
  assert.ok(REGLES_DEFAUT.sources.majoration.startsWith('https://'));
});

test('un réglage de la société remplace le défaut, le reste est gardé', () => {
  const r = reglesDe({ id: 'A', regles: { heures: { taux1: 0.1 } } });
  assert.equal(r.heures.taux1, 0.1);
  assert.equal(r.heures.seuilHebdo, 35);
});

test('les règles ne sont validées qu\'avec valide_par ET valide_le', () => {
  assert.equal(reglesDe({ regles_valide_par: 'u1' }).valide, false);
  assert.equal(reglesDe({ regles_valide_par: 'u1', regles_valide_le: '2026-11-17' }).valide, true);
});

test('un taux de majoration sous 10 % est refusé', () => {
  assert.throws(() => reglesDe({ regles: { heures: { taux1: 0.05 } } }), /10 %/);
});
