// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jourISO, dejaJoueAujourdhui } from '../web/ouverture.js';

test('ouverture : déjà joué aujourd’hui ?', () => {
  const aujourdhui = jourISO(new Date());
  assert.equal(dejaJoueAujourdhui(aujourdhui, aujourdhui), true);
  assert.equal(dejaJoueAujourdhui(null, aujourdhui), false);
  assert.equal(dejaJoueAujourdhui('2025-01-15', aujourdhui), false);
});

test('jourISO : date fixe new Date("2026-11-19T23:30:00Z")', () => {
  const date = new Date('2026-11-19T23:30:00Z');
  assert.equal(jourISO(date), '2026-11-20');
});