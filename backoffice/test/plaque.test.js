// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Lecture de la fiche publique d'une plaque (immatriculation-auto.info) : faits seulement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliserPlaque, lireFicheImmat } from '../core/plaque.js';

// Extrait au format de la page publique (données fictives).
const PAGE = `<html><head><title>AB123CD - PEUGEOT 2021</title>
<meta name="description" content="PEUGEOT 208 immatriculée en France sous le numéro de plaque d'immatriculation AB123CD en 2021. Découvrez son carburant Essence et sa Manuelle">
</head><body><astro-island props="{&quot;input&quot;:[0,&quot;AB123CD&quot;],&quot;brandModelYear&quot;:[0,{&quot;brand&quot;:[0,&quot;PEUGEOT&quot;],&quot;model&quot;:[0,&quot;208&quot;],&quot;year&quot;:[0,&quot;2021&quot;]}]}"></astro-island></body></html>`;

test('plaque : tirets et espaces retirés, format SIV exigé', () => {
  assert.equal(normaliserPlaque(' fs-687 vt '), 'FS687VT');
  assert.equal(normaliserPlaque('1234 AB 45'), null);   // ancien format FNI : non géré
  assert.equal(normaliserPlaque("AB123CD'; drop"), null);
});

test('fiche : marque, modèle, année, carburant, boîte', () => {
  assert.deepEqual(lireFicheImmat(PAGE), { marque: 'PEUGEOT', modele: '208', annee: 2021, carburant: 'Essence', boite: 'Manuelle' });
});

test('page sans véhicule (plaque inconnue) : null, rien n\'est deviné', () => {
  assert.equal(lireFicheImmat('<html><title>Recherche</title></html>'), null);
});
