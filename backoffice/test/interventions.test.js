// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Liste des interventions (reprise de l'ancien tableau de bord, apps-script/Code.js : durHM, cltFilter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dureeMinutes, texteDuree, filtrer } from '../core/interventions.js';

test('durée : fin - arrivée, en minutes ; passage de minuit compté', () => {
  assert.equal(dureeMinutes('08:30', '10:05'), 95);
  assert.equal(dureeMinutes('23:50', '00:20'), 30);
  assert.equal(dureeMinutes('', '10:00'), null);
  assert.equal(dureeMinutes('8h', '10:00'), null);
});

test('durée affichée comme l’ancien tableau de bord : 1h35, 45 min, vide', () => {
  assert.equal(texteDuree(95), '1h35');
  assert.equal(texteDuree(45), '45 min');
  assert.equal(texteDuree(null), '');
});

test('filtres : technicien, type, résultat (vide = OK), texte sur n°/ville/département', () => {
  const l = [
    { technicien_id: 'a', type_mission: 'INST', observation_type: '', ville: 'Orléans', numero_intervention: '123', departement: '45', date: '2026-11-20', heure_debut: '08:30' },
    { technicien_id: 'b', type_mission: 'SAV', observation_type: 'NR client', ville: 'Blois', numero_intervention: '456', departement: '41', date: '2026-11-21', heure_debut: '14:00' },
    { technicien_id: 'dupont', type_mission: 'INST', observation_type: '', ville: 'Tours', numero_intervention: '789', departement: '145', date: '2026-11-22', heure_debut: '10:00' },
  ];
  assert.equal(filtrer(l, { tech: 'b' }).length, 1);
  assert.equal(filtrer(l, { resultat: 'OK' })[0].numero_intervention, '123');
  assert.equal(filtrer(l, { type: 'SAV', resultat: 'NR client' }).length, 1);
  assert.equal(filtrer(l, { texte: 'blo' })[0].numero_intervention, '456');
  assert.equal(filtrer(l, { texte: '45' }).length, 1);   // 2 chiffres = département 45 exact seulement (ni n° 456, ni département 145)
  assert.equal(filtrer(l, { texte: '4' }).length, 1);    // 4 dans n° 456, ne matche PAS le département 45 ou 41 car pas 2 chiffres
  assert.equal(filtrer(l, { texte: '08:30' }).length, 0); // heures non ciblées
  assert.equal(filtrer(l, { texte: '2026-11' }).length, 0); // dates non ciblées
});

test('résultat lisible, comme l’APK (StatsUploader.kt) : codes -> libellés', async () => {
  const { libelleResultat } = await import('../core/interventions.js');
  assert.deepEqual(['', 'NR_CLIENT', 'NR_TECHNIQUE', 'NR_CLIENT_ABS', 'NR_AUTRES', 'ANNULE', 'XYZ'].map(libelleResultat),
    ['OK', 'NR client', 'NR technique', 'NR client absent', 'NR autres', 'Annulé', 'XYZ']);
});
