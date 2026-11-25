// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tiers : SIREN, SIRET, téléphone français, e-mail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliserSiren, normaliserSiret, normaliserTelFr, normaliserEmail } from '../core/tiers.js';

test('normaliserSiren : chiffres espacés et clé Luhn', () => {
  assert.equal(normaliserSiren('791 953 557'), '791953557');
  assert.equal(normaliserSiren('945168466'), '945168466');
  assert.equal(normaliserSiren('791953558'), null);   // mauvaise clé
  assert.equal(normaliserSiren('12345'), null);       // trop court
});

test('normaliserSiret : 14 chiffres et clé Luhn', () => {
  assert.equal(normaliserSiret('39168000012344'), '39168000012344');
  assert.equal(normaliserSiret('39168000012345'), null);   // mauvaise clé
  assert.equal(normaliserSiret('3916800001234'), null);     // trop court
});

test('normaliserTelFr : formats français', () => {
  assert.equal(normaliserTelFr('+33 6 12 34 56 78'), '06 12 34 56 78');
  assert.equal(normaliserTelFr('06.12.34.56.78'), '06 12 34 56 78');
  assert.equal(normaliserTelFr('12'), null);
});

test('normaliserEmail : trim, minuscules, validation', () => {
  assert.equal(normaliserEmail('  Toto@Example.COM '), 'toto@example.com');
  assert.equal(normaliserEmail('abc'), null);
});
