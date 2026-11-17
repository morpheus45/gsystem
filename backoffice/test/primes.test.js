// Primes GesteCo : même règle que l'APK (data/Models.kt totalPrime, PrimeAVenirScreen.kt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIX_DEFAUT, prixDuMois, primesDuMois, moisDesPrimes } from '../core/primes.js';

test('prix par défaut = valeurs de GesteCoPrices (Models.kt)', () => {
  assert.deepEqual(PRIX_DEFAUT, { gsm: 3, co: 2, dmp: 2, se: 4, tc: 1.5, si: 3, cam: 4, dacco: 3, ba: 1, cl: 3, df: 1.5, sondeIn: 1.5 });
});

test('barème : figé pour le mois s\'il existe, sinon courant ; clés absentes = défaut', () => {
  const reglages = { prices: { gsm: 5 }, primeTarifsParMois: { '2026-01': { co: 9 } } };
  assert.equal(prixDuMois(reglages, '2026-01').co, 9);
  assert.equal(prixDuMois(reglages, '2026-01').gsm, 3);   // figé : clé absente -> défaut Kotlin
  assert.equal(prixDuMois(reglages, '2026-02').gsm, 5);
  assert.equal(prixDuMois(null, '2026-02').se, 4);
});

test('prime du mois : installés × prix ; CAM seulement un jour avec une INST', () => {
  const gestes = [
    { date: '2026-01-10', installes: { gsm: 2, cam: 1 } },   // jour INST : CAM comptée
    { date: '2026-01-11', installes: { co: 1, cam: 2 } },    // pas d'INST : CAM ignorée
    { date: '2026-02-01', installes: { gsm: 5 } },           // autre mois
  ];
  const temps = [{ date: '2026-01-10', typeMission: 'inst' }, { date: '2026-01-11', typeMission: 'SAV' }];
  const r = primesDuMois(gestes, temps, { prices: {} }, '2026-01');
  assert.equal(r.total, 2 * 3 + 1 * 4 + 1 * 2);
  assert.deepEqual(r.detail, [{ type: 'GSM', qte: 2, montant: 6 }, { type: 'CO', qte: 1, montant: 2 }, { type: 'CAM', qte: 1, montant: 4 }]);
});

test('mois des primes versées avec la paie qui finit le 20/03 : janvier (M+2)', () => {
  assert.equal(moisDesPrimes('2026-03-20'), '2026-01');
  assert.equal(moisDesPrimes('2026-02-20'), '2025-12');
});
