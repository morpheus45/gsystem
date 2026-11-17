import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finProposee, lendemain } from '../core/periodes.js';

test('fin de mois proposée : le samedi le plus proche du 20', () => {
  assert.equal(finProposee('2026-11-17'), '2026-11-21');   // 20/11 vendredi -> samedi 21
  assert.equal(finProposee('2026-01-05'), '2026-01-17');   // 20/01 mardi -> samedi 17
  assert.equal(finProposee('2026-12-02'), '2026-12-19');   // 20/12 dimanche -> samedi 19
});

test('fin déjà passée : on propose celle du mois suivant', () => {
  assert.equal(finProposee('2026-11-25'), '2026-12-19');
});

test('le mois suivant commence le lendemain de la clôture', () => {
  assert.equal(lendemain('2026-11-21'), '2026-11-22');
  assert.equal(lendemain('2026-12-31'), '2027-01-01');
});
