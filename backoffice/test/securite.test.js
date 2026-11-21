// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Audit de sécurité du 18/11/2026 : un test par faille corrigée (numéros de SECURITE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { texteCsv } from '../core/paie.js';
import { zipStocke, nomDansZip } from '../core/zip.js';
import { nomDeFichierSur } from '../pont/normaliser.js';
import { lireFicheImmat } from '../core/plaque.js';

test('S2 : une cellule CSV ne lance jamais de formule, même après tabulation ou retour chariot', () => {
  for (const piege of ['=1+1', '+33', '-2', '@SOMME(A1)', '\t=1+1', '\r=1+1']) {
    assert.ok(texteCsv(piege).replace(/^"/, '').startsWith("'"), JSON.stringify(piege));
  }
  assert.equal(texteCsv('Orléans'), 'Orléans');
});

test('S4 : un nom de fichier du ZIP ne sort jamais du dossier où on l\'extrait', () => {
  assert.equal(nomDansZip('../../Windows/evil.csv'), 'Windows/evil.csv');
  assert.equal(nomDansZip('/etc/passwd'), 'etc/passwd');
  assert.equal(nomDansZip('C:\\temp\\x.csv'), 'C_/temp/x.csv');
  assert.equal(nomDansZip('Jean Dupont/releve.csv'), 'Jean Dupont/releve.csv');
  assert.equal(nomDansZip('a/./b\u0000c.pdf'), 'a/bc.pdf');
  const zip = zipStocke([{ nom: '../x.csv', donnees: new Uint8Array([1]) }]);
  assert.ok(!new TextDecoder().decode(zip).includes('../'));
});

test('S5 : le pont refuse un nom de photo qui changerait de dossier dans le stockage', () => {
  for (const mauvais of ['..', '.', '../x.jpg', 'a/b.jpg', 'a\\b.jpg', '', 'x\u0000.jpg']) assert.equal(nomDeFichierSur(mauvais), false, JSON.stringify(mauvais));
  for (const bon of ['IMG_20261118_101500.jpg', 'compteur 2026-11.jpg', 'ticket-péage.pdf']) assert.equal(nomDeFichierSur(bon), true, bon);
});

test('S6 : identité lue sur un site extérieur nettoyée et bornée', () => {
  const page = `<meta name="description" content="X immatriculée en France sous le numéro de plaque AA111AA en 2020. Découvrez son carburant Gazole<script> et sa Manuelle">
    <i props="{&quot;brand&quot;:[0,&quot;<img src=x onerror=alert(1)>${'B'.repeat(80)}&quot;],&quot;model&quot;:[0,&quot;CLIO\u0007 V&quot;],&quot;year&quot;:[0,&quot;2020&quot;]}">`;
  const f = lireFicheImmat(page);
  assert.ok(!/[<>\u0000-\u001f]/.test(f.marque + f.modele + f.carburant + f.boite), JSON.stringify(f));
  assert.ok(f.marque.length <= 60 && f.carburant.length <= 30);
  assert.equal(f.modele, 'CLIO V');
});
