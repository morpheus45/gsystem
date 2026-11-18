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
    { technicien_id: 'a', type_mission: 'INST', observation_type: '', ville: 'Orléans', numero_intervention: '123', departement: '45' },
    { technicien_id: 'b', type_mission: 'SAV', observation_type: 'NR client', ville: 'Blois', numero_intervention: '456', departement: '41' },
  ];
  assert.equal(filtrer(l, { tech: 'b' }).length, 1);
  assert.equal(filtrer(l, { resultat: 'OK' })[0].numero_intervention, '123');
  assert.equal(filtrer(l, { type: 'SAV', resultat: 'NR client' }).length, 1);
  assert.equal(filtrer(l, { texte: 'blo' })[0].numero_intervention, '456');
  assert.equal(filtrer(l, { texte: '45' }).length, 2);   // département 45 et n° 456
});

test('résultat lisible, comme l’APK (StatsUploader.kt) : codes -> libellés', async () => {
  const { libelleResultat } = await import('../core/interventions.js');
  assert.deepEqual(['', 'NR_CLIENT', 'NR_TECHNIQUE', 'NR_CLIENT_ABS', 'NR_AUTRES', 'ANNULE', 'XYZ'].map(libelleResultat),
    ['OK', 'NR client', 'NR technique', 'NR client absent', 'NR autres', 'Annulé', 'XYZ']);
});
