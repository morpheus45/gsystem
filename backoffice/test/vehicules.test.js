import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kmMoyenParMois, prochaineEcheance, statutPhoto, alertes, CT_VOITURE } from '../core/vehicules.js';

test('km moyen par mois : seuls les relevés validés comptent', () => {
  const releves = [
    { date: '2026-01-01', km: 10000, valide_par: 'u1' },
    { date: '2026-03-01', km: 99999 },               // non validé : ignoré
    { date: '2026-07-02', km: 16000, valide_par: 'u1' },
  ];
  assert.equal(kmMoyenParMois(releves), 1000);
});

test('km moyen : moins de 2 relevés validés → null', () => {
  assert.equal(kmMoyenParMois([{ date: '2026-01-01', km: 1, valide_par: 'u1' }]), null);
});

test('échéance en date et en km à partir de la règle saisie', () => {
  assert.deepEqual(prochaineEcheance({ tousLesMois: 12, tousLesKm: 20000 }, { date: '2026-01-31', km: 50000 }),
    { date: '2027-01-31', km: 70000 });
  assert.deepEqual(prochaineEcheance({ tousLesKm: 15000 }, { date: '2026-01-31', km: 50000 }), { date: null, km: 65000 });
});

test('aucune règle → erreur, on n\'invente pas d\'intervalle', () => {
  assert.throws(() => prochaineEcheance({}, { date: '2026-01-01', km: 0 }), /règle/);
});

test('contrôle technique : 24 mois, avec la source officielle', () => {
  assert.equal(CT_VOITURE.tousLesMois, 24);
  assert.match(CT_VOITURE.source, /service-public\.fr/);
});

test('photo périodique : reçue, manquante, en retard', () => {
  const photos = [{ periode: '2026-10' }];
  assert.equal(statutPhoto('2026-10', photos, '2026-11-17', 10), 'recue');
  assert.equal(statutPhoto('2026-11', photos, '2026-11-17', 10), 'manquante');
  assert.equal(statutPhoto('2026-09', photos, '2026-11-17', 10), 'en_retard');
});

test('alertes : échéance proche ou dépassée, en date ou en km', () => {
  const ech = [
    { type: 'CT', date: '2026-11-30' },
    { type: 'ASSURANCE', date: '2026-11-01' },
    { type: 'VIDANGE', km: 65000 },
    { type: 'PNEUS', date: '2027-06-01', km: 90000 },
  ];
  assert.deepEqual(alertes(ech, { aujourdhui: '2026-11-17', kmActuel: 64500, joursAvant: 30, kmAvant: 1000 }), [
    { type: 'CT', niveau: 'proche' },
    { type: 'ASSURANCE', niveau: 'depassee' },
    { type: 'VIDANGE', niveau: 'proche' },
  ]);
});

test('alerte « proche » comptée depuis aujourd\'hui, pas depuis le 1er du mois', () => {
  assert.deepEqual(alertes([{ type: 'CT', date: '2026-12-10' }],
    { aujourdhui: '2026-11-17', kmActuel: 0, joursAvant: 30, kmAvant: 0 }), [{ type: 'CT', niveau: 'proche' }]);
});

test('échéance au 31 : bloquée au dernier jour du mois', () => {
  assert.equal(prochaineEcheance({ tousLesMois: 1 }, { date: '2026-01-31', km: 0 }).date, '2026-02-28');
});

test('échéance en km sans kilométrage connu : signalée, pas ignorée', () => {
  assert.deepEqual(alertes([{ type: 'VIDANGE', km: 65000 }], { aujourdhui: '2026-11-17', kmActuel: null, joursAvant: 30, kmAvant: 1000 }),
    [{ type: 'VIDANGE', niveau: 'km_inconnu' }]);
});

test('sans entretien précédent : erreur claire, pas de plantage', () => {
  assert.throws(() => prochaineEcheance({ tousLesKm: 15000 }, null), /date et le km de départ/);
});

import { kmParMois, conducteurA, limiteDesignation } from '../core/vehicules.js';

test('km mois par mois : dernier relevé validé de chaque mois, écart avec le mois précédent', () => {
  const releves = [
    { date: '2026-08-03', km: 10000, valide_par: 'u' }, { date: '2026-08-28', km: 11200, valide_par: 'u' },
    { date: '2026-09-15', km: 99999 },                     // non validé : ignoré
    { date: '2026-10-30', km: 13000, valide_par: 'u' },   // septembre sans relevé validé
  ];
  assert.deepEqual(kmParMois(releves), [
    { mois: '2026-08', kmFin: 11200, parcourus: null },
    { mois: '2026-10', kmFin: 13000, parcourus: 1800 },
  ]);
});

test('conducteur à une date : affectation en cours ce jour-là, la plus récente si chevauchement', () => {
  const aff = [
    { technicien_id: 'A', debut: '2026-01-01', fin: '2026-06-30' },
    { technicien_id: 'B', debut: '2026-07-01', fin: null },
    { technicien_id: 'C', debut: '2026-09-01', fin: '2026-09-10' },
  ];
  assert.equal(conducteurA(aff, '2026-03-15'), 'A');
  assert.equal(conducteurA(aff, '2026-06-30'), 'A');
  assert.equal(conducteurA(aff, '2026-08-01'), 'B');
  assert.equal(conducteurA(aff, '2026-09-05'), 'C');
  assert.equal(conducteurA(aff, '2025-12-31'), null);
});

test('désignation du conducteur : 45 jours après la date de l\'avis (ANTAI)', () => {
  assert.equal(limiteDesignation('2026-11-01'), '2026-12-16');
});
