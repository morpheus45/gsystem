// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliser } from '../pont/normaliser.js';

const donnees = JSON.parse(readFileSync(new URL('../fixtures/donnees-fictif.json', import.meta.url)));
const opts = { societeId: 'soc-A', technicienId: 'tech-1' };

test('la société est obligatoire, jamais devinée', () => {
  assert.throws(() => normaliser(donnees, { technicienId: 'tech-1' }), /societeId/);
});

test('temps : numeroClient → numero_intervention, nomClient jamais importé', () => {
  const { temps } = normaliser(donnees, opts);
  assert.equal(temps.length, 3);
  assert.equal(temps[0].numero_intervention, '10000001');
  assert.equal(temps[0].societe_id, 'soc-A');
  assert.ok(temps.every((l) => !('nomClient' in l) && !('nom_client' in l)));
  assert.ok(!JSON.stringify(normaliser(donnees, opts)).includes('CLIENT FICTIF'));
});

test('les valeurs par défaut Kotlin absentes du JSON sont remises', () => {
  const { temps, compteur } = normaliser(donnees, opts);
  assert.equal(temps[0].observation_type, '');
  assert.equal(temps[2].slot_midi, '');
  assert.equal(compteur[0].kilometres, 0);
});

test('identifiants stables : deux imports donnent les mêmes clés', () => {
  const a = normaliser(donnees, opts), b = normaliser(structuredClone(donnees), opts);
  assert.deepEqual(a.temps.map((l) => l.cle_source), b.temps.map((l) => l.cle_source));
  assert.equal(a.temps[0].cle_source, 'tech-1/temps/t1');
});

test('frais et photos', () => {
  const { frais, photos } = normaliser(donnees, opts);
  assert.deepEqual(frais.map((f) => [f.categorie, f.montant_eur, f.sans_tva]), [['PARKING', 4.5, true], ['MOBILE', 50, false]]);
  assert.deepEqual(photos[1], { societe_id: 'soc-A', technicien_id: 'tech-1', cle_source: 'tech-1/photo/c1.jpg',
    nom_local: 'c1.jpg', nom_drive: 'ZZ-999-ZZ-11-2026.jpg' });
});

test('clés inconnues tolérées et signalées', () => {
  const d = structuredClone(donnees);
  d.entries.temps[0].champFutur = 1; d.nouveauBloc = {};
  const r = normaliser(d, opts);
  assert.equal(r.temps.length, 3);
  assert.deepEqual(r.clesInconnues.sort(), ['nouveauBloc', 'temps.champFutur']);
});

test('frais, compteur : rattachés à la société et au tech, avec une clé stable', () => {
  const { frais, compteur } = normaliser(donnees, opts);
  for (const l of [...frais, ...compteur]) {
    assert.equal(l.societe_id, 'soc-A');
    assert.equal(l.technicien_id, 'tech-1');
  }
  assert.equal(frais[0].cle_source, 'tech-1/frais/f1');
  assert.equal(compteur[0].cle_source, 'tech-1/compteur/c1');
});

test('un kilométrage saisi est gardé', () => {
  const d = structuredClone(donnees);
  d.entries.compteur[0].kilometres = 12345;
  assert.equal(normaliser(d, opts).compteur[0].kilometres, 12345);
});

test('blocs absents tolérés, clé inconnue dans entries signalée', () => {
  const r = normaliser({ entries: { temps: [], blocFutur: [] } }, opts);
  assert.deepEqual([r.frais, r.compteur, r.photos], [[], [], []]);
  assert.deepEqual(r.clesInconnues, ['entries.blocFutur']);
});

test('fichier vide ou entrée sans id : erreur claire, rien d\'importé en silence', () => {
  assert.throws(() => normaliser(null, opts), /invalide/);
  assert.throws(() => normaliser({ entries: { temps: [{ date: '2026-01-01' }] } }, opts), /sans id/);
});

import { vehiculeDepuisApk, planAffectation } from '../pont/normaliser.js';

test('APK : plaque des réglages + photos du compteur rangées par mois', () => {
  const photos = { 'c1.jpg': 'ZZ-999-ZZ-11-2026.jpg', 'c2.jpg': 'ZZ-999-ZZ-10-2026-2.jpg',
    'f1.jpg': 'FRAIS-PARKING.jpg', 'c3.jpg': 'AA-000-AA-09-2026.jpg' };
  assert.deepEqual(vehiculeDepuisApk({ plaqueVoiture: ' zz-999-zz ' }, photos), {
    plaque: 'ZZ-999-ZZ',
    photosCompteur: [{ nom_drive: 'ZZ-999-ZZ-11-2026.jpg', periode: '2026-11' },
      { nom_drive: 'ZZ-999-ZZ-10-2026-2.jpg', periode: '2026-10' }],
  });
  assert.deepEqual(vehiculeDepuisApk({ plaqueVoiture: '' }, photos), { plaque: null, photosCompteur: [] });
  assert.deepEqual(vehiculeDepuisApk(null, photos), { plaque: null, photosCompteur: [] });
});

test('affectation depuis l\'APK : rien si déjà en cours, sinon on ferme l\'ancienne et on ouvre', () => {
  assert.deepEqual(planAffectation([{ id: 'a1', vehicule_id: 'V1', debut: '2026-01-01' }], 'V1', '2026-11-17', '2026-05-25'),
    { fermer: [], ouvrir: null });
  assert.deepEqual(planAffectation([], 'V1', '2026-11-17', '2026-05-25'),
    { fermer: [], ouvrir: { vehicule_id: 'V1', debut: '2026-05-25' } });
  assert.deepEqual(planAffectation([{ id: 'a1', vehicule_id: 'V0', debut: '2026-01-01' }], 'V1', '2026-11-17', '2026-05-25'),
    { fermer: [{ id: 'a1', fin: '2026-11-16' }], ouvrir: { vehicule_id: 'V1', debut: '2026-11-17' } });
  assert.deepEqual(planAffectation([{ id: 'a1', vehicule_id: 'V0', debut: '2026-11-17' }], 'V1', '2026-11-17', null),
    { fermer: [{ id: 'a1', fin: '2026-11-17' }], ouvrir: { vehicule_id: 'V1', debut: '2026-11-17' } });
});

test('gesteCo : équipements installés regroupés, nom du client jamais importé', () => {
  const { gestes } = normaliser(donnees, opts);
  assert.deepEqual(gestes, [{ societe_id: 'soc-A', technicien_id: 'tech-1', cle_source: 'tech-1/gesteCo/g1',
    date: '2026-10-22', numero_site: '10000001', installes: { gsm: 1 } }]);
});

import { relevesKmDepuisCompteurs } from '../pont/normaliser.js';

test('relevés km : km > 0, date valide, photo existante du compteur du même mois', () => {
  const compteurs = [
    { date: '2026-11-19', kilometres: 12345, fileName: 'c1.jpg' },
    { date: '2026-11-20', kilometres: 12400, fileName: 'c2.jpg' },
  ];
  const photos = [
    { id: 'photo-1', vehicule_id: 'v1', periode: '2026-11' },
    { id: 'photo-2', vehicule_id: 'v2', periode: '2026-10' },
  ];
  const releves = relevesKmDepuisCompteurs(compteurs, photos, 'soc-A', 'tech-1');
  assert.equal(releves.length, 2);
  assert.deepEqual(releves[0], {
    societe_id: 'soc-A', vehicule_id: 'v1', date: '2026-11-19', km: 12345, source: 'saisie', photo_id: 'photo-1',
  });
  assert.deepEqual(releves[1], {
    societe_id: 'soc-A', vehicule_id: 'v1', date: '2026-11-20', km: 12400, source: 'saisie', photo_id: 'photo-1',
  });
});

test('relevés km : filtre km <= 0', () => {
  const compteurs = [
    { date: '2026-11-19', kilometres: 0, fileName: 'c1.jpg' },
    { date: '2026-11-20', kilometres: -100, fileName: 'c2.jpg' },
  ];
  const photos = [{ id: 'photo-1', vehicule_id: 'v1', periode: '2026-11' }];
  const releves = relevesKmDepuisCompteurs(compteurs, photos, 'soc-A', 'tech-1');
  assert.equal(releves.length, 0);
});

test('relevés km : filtre date invalide', () => {
  const compteurs = [
    { date: '2026-13-01', kilometres: 100, fileName: 'c1.jpg' },
    { date: '2026-02-30', kilometres: 100, fileName: 'c2.jpg' },
    { date: 'pas-une-date', kilometres: 100, fileName: 'c3.jpg' },
    { date: '', kilometres: 100, fileName: 'c4.jpg' },
  ];
  const photos = [{ id: 'photo-1', vehicule_id: 'v1', periode: '2026-11' }];
  const releves = relevesKmDepuisCompteurs(compteurs, photos, 'soc-A', 'tech-1');
  assert.equal(releves.length, 0);
});

test('relevés km : pas de photo du compteur pour le mois → rejeté', () => {
  const compteurs = [{ date: '2026-11-19', kilometres: 12345, fileName: 'c1.jpg' }];
  const photos = [{ id: 'photo-1', vehicule_id: 'v1', periode: '2026-10' }];
  const releves = relevesKmDepuisCompteurs(compteurs, photos, 'soc-A', 'tech-1');
  assert.equal(releves.length, 0);
});

test('relevés km : societeId ou technicienId manquants', () => {
  const compteurs = [{ date: '2026-11-19', kilometres: 12345, fileName: 'c1.jpg' }];
  const photos = [{ id: 'photo-1', vehicule_id: 'v1', periode: '2026-11' }];
  assert.throws(() => relevesKmDepuisCompteurs(compteurs, photos, null, 'tech-1'), /obligatoires/);
  assert.throws(() => relevesKmDepuisCompteurs(compteurs, photos, 'soc-A', null), /obligatoires/);
});
