// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// node --test tests-iphone/modulesRegles.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../docs/app/modulesRegles.js';

const T = (type, cle, libelle, obligatoire, choix) => ({ type, cle, libelle, obligatoire, choix });
const texte = (cle, libelle, obligatoire) => T('texte', cle, libelle, obligatoire);
const nombre = (cle, libelle, obligatoire) => T('nombre', cle, libelle, obligatoire);
const date = (cle, libelle, obligatoire) => T('date', cle, libelle, obligatoire);
const caseC = (cle, libelle, obligatoire) => T('case', cle, libelle, obligatoire);
const liste = (cle, libelle, obligatoire, choix) => T('liste', cle, libelle, obligatoire, choix);
const photo = (cle, libelle, obligatoire) => T('photo', cle, libelle, obligatoire);
const signature = (cle, libelle, obligatoire) => T('signature', cle, libelle, obligatoire);

test('valeurSaisie : texte — trim, vide -> null, sinon texte trimé', () => {
  const c = texte('c', 'Champ', false);
  assert.equal(R.valeurSaisie(c, '  hello  '), 'hello');
  assert.equal(R.valeurSaisie(c, ''), null);
  assert.equal(R.valeurSaisie(c, '   '), null);
  assert.equal(R.valeurSaisie(c, 'a'), 'a');
  assert.equal(R.valeurSaisie(c, null), null);
  assert.equal(R.valeurSaisie(c, undefined), null);
});

test('valeurSaisie : nombre — retire tous espaces, virgule -> point, bornes, invalides -> null', () => {
  const c = nombre('n', 'Nombre', false);
  assert.equal(R.valeurSaisie(c, '12'), 12);
  assert.equal(R.valeurSaisie(c, '12.5'), 12.5);
  assert.equal(R.valeurSaisie(c, '12,5'), 12.5);
  assert.equal(R.valeurSaisie(c, '-3,14'), -3.14);
  assert.equal(R.valeurSaisie(c, '1 234,56'), 1234.56);
  assert.equal(R.valeurSaisie(c, '  1 2 3  '), 123);
  // insécable (U+00A0) et autres espaces
  assert.equal(R.valeurSaisie(c, '1\u00A0234'), 1234);
  // bornes : 12 entiers max, 6 décimales max
  assert.equal(R.valeurSaisie(c, '123456789012'), 123456789012);
  assert.equal(R.valeurSaisie(c, '1234567890123'), null); // 13 entiers
  assert.equal(R.valeurSaisie(c, '1,234567'), 1.234567);
  assert.equal(R.valeurSaisie(c, '1,2345678'), null); // 7 décimales
  // invalides
  assert.equal(R.valeurSaisie(c, 'abc'), null);
  assert.equal(R.valeurSaisie(c, ''), null);
  assert.equal(R.valeurSaisie(c, '12,34,56'), null);
  assert.equal(R.valeurSaisie(c, '12.'), null);
  assert.equal(R.valeurSaisie(c, '.5'), null);
  assert.equal(R.valeurSaisie(c, '+5'), null);
});

test('valeurSaisie : case — oui/non seulement', () => {
  const c = caseC('c', 'Case', false);
  assert.equal(R.valeurSaisie(c, 'oui'), true);
  assert.equal(R.valeurSaisie(c, 'non'), false);
  assert.equal(R.valeurSaisie(c, 'OUI'), null);
  assert.equal(R.valeurSaisie(c, 'oui '), true); // trim -> 'oui'
  assert.equal(R.valeurSaisie(c, ' oui '), true);
  assert.equal(R.valeurSaisie(c, ''), null);
  assert.equal(R.valeurSaisie(c, 'peut-être'), null);
});

test('valeurSaisie : date, liste, photo, signature — texte trimé', () => {
  const cDate = date('d', 'Date', false);
  assert.equal(R.valeurSaisie(cDate, '2026-11-24'), '2026-11-24');
  assert.equal(R.valeurSaisie(cDate, '  2026-11-24  '), '2026-11-24');
  assert.equal(R.valeurSaisie(cDate, ''), null);

  const cListe = liste('l', 'Liste', false, ['a', 'b']);
  assert.equal(R.valeurSaisie(cListe, 'a'), 'a');
  assert.equal(R.valeurSaisie(cListe, '  b  '), 'b');

  const cPhoto = photo('p', 'Photo', false);
  assert.equal(R.valeurSaisie(cPhoto, 'fichier.jpg'), 'fichier.jpg');
  assert.equal(R.valeurSaisie(cPhoto, ''), null);

  const cSig = signature('s', 'Signature', false);
  assert.equal(R.valeurSaisie(cSig, 'sig.png'), 'sig.png');
});

test('defautSaisie : vide obligatoire -> "X est à remplir"', () => {
  const champs = [texte('a', 'Champ A', true), nombre('b', 'Nombre B', true)];
  assert.equal(R.defautSaisie(champs, { a: '', b: '' }), '« Champ A » est à remplir.');
  assert.equal(R.defautSaisie(champs, { a: 'ok', b: '' }), '« Nombre B » est à remplir.');
  assert.equal(R.defautSaisie(champs, { a: '  ', b: '12' }), '« Champ A » est à remplir.');
});

test('defautSaisie : vide facultatif -> ok', () => {
  const champs = [texte('a', 'Champ A', false), nombre('b', 'Nombre B', false)];
  assert.equal(R.defautSaisie(champs, { a: '', b: '' }), null);
  assert.equal(R.defautSaisie(champs, { a: 'x', b: '' }), null);
});

test('defautSaisie : nombre invalide', () => {
  const champs = [nombre('n', 'Montant', true)];
  assert.equal(R.defautSaisie(champs, { n: 'abc' }), '« Montant » : nombre invalide.');
  assert.equal(R.defautSaisie(champs, { n: '12,34,56' }), '« Montant » : nombre invalide.');
  assert.equal(R.defautSaisie(champs, { n: '1234567890123' }), '« Montant » : nombre invalide.');
  assert.equal(R.defautSaisie(champs, { n: '12.' }), '« Montant » : nombre invalide.');
});

test('defautSaisie : date invalide (format et calendrier)', () => {
  const champs = [date('d', 'Date', true)];
  assert.equal(R.defautSaisie(champs, { d: '2026-11-24' }), null);
  assert.equal(R.defautSaisie(champs, { d: '2026-02-31' }), '« Date » : date invalide.');
  assert.equal(R.defautSaisie(champs, { d: '2026-13-01' }), '« Date » : date invalide.');
  assert.equal(R.defautSaisie(champs, { d: '2026-00-10' }), '« Date » : date invalide.');
  assert.equal(R.defautSaisie(champs, { d: '31/12/2026' }), '« Date » : date invalide.');
  assert.equal(R.defautSaisie(champs, { d: '2026-1-1' }), '« Date » : date invalide.');
});

test('defautSaisie : case choix invalide', () => {
  const champs = [caseC('c', 'Validation', true)];
  assert.equal(R.defautSaisie(champs, { c: 'oui' }), null);
  assert.equal(R.defautSaisie(champs, { c: 'non' }), null);
  assert.equal(R.defautSaisie(champs, { c: 'OUI' }), '« Validation » : choix invalide.');
  assert.equal(R.defautSaisie(champs, { c: 'peut-être' }), '« Validation » : choix invalide.');
});

test('defautSaisie : liste choix invalide', () => {
  const champs = [liste('l', 'Couleur', true, ['rouge', 'bleu'])];
  assert.equal(R.defautSaisie(champs, { l: 'rouge' }), null);
  assert.equal(R.defautSaisie(champs, { l: 'vert' }), '« Couleur » : choix invalide.');
  assert.equal(R.defautSaisie(champs, { l: '' }), '« Couleur » est à remplir.');
});

test('defautSaisie : photo et signature fichier invalide', () => {
  const champs = [photo('p', 'Photo', true), signature('s', 'Sig', true)];
  const s = 'sig.png';
  assert.equal(R.defautSaisie(champs, { p: 'photo.jpg', s }), null);
  assert.equal(R.defautSaisie(champs, { p: '-photo.jpg', s }), '« Photo » : fichier invalide.');
  assert.equal(R.defautSaisie(champs, { p: 'a'.repeat(121), s }), '« Photo » : fichier invalide.');
  assert.equal(R.defautSaisie(champs, { p: '', s }), '« Photo » est à remplir.');
  assert.equal(R.defautSaisie(champs, { p: 'fichier@.jpg', s }), '« Photo » : fichier invalide.');
  // longueur max 120
  assert.equal(R.defautSaisie(champs, { p: 'a'.repeat(120), s }), null);
  // signature invalide
  assert.equal(R.defautSaisie(champs, { p: 'photo.jpg', s: '-sig.png' }), '« Sig » : fichier invalide.');
});

test('defautSaisie : texte 2000 caractères au plus', () => {
  const champs = [texte('t', 'Commentaire', true)];
  assert.equal(R.defautSaisie(champs, { t: 'a'.repeat(2000) }), null);
  assert.equal(R.defautSaisie(champs, { t: 'a'.repeat(2001) }), '« Commentaire » : 2000 caractères au plus.');
});

test('defautSaisie : ordre des champs — première erreur seulement', () => {
  const champs = [texte('a', 'Premier', true), texte('b', 'Second', true)];
  assert.equal(R.defautSaisie(champs, { a: '', b: '' }), '« Premier » est à remplir.');
  assert.equal(R.defautSaisie(champs, { a: 'x', b: '' }), '« Second » est à remplir.');
});

test('valeursSaisie : seulement champs remplis, zéro et false gardés', () => {
  const champs = [
    texte('a', 'A', false),
    nombre('n', 'N', false),
    caseC('c', 'C', false),
    liste('l', 'L', false, ['x', 'y'])
  ];
  assert.deepEqual(R.valeursSaisie(champs, { a: '', n: '0', c: 'non', l: 'x' }), { n: 0, c: false, l: 'x' });
  assert.deepEqual(R.valeursSaisie(champs, { a: 'ok', n: '12,5', c: 'oui', l: '' }), { a: 'ok', n: 12.5, c: true });
  assert.deepEqual(R.valeursSaisie(champs, {}), {});
  assert.deepEqual(R.valeursSaisie(champs, { a: '  ', n: '', c: '', l: '' }), {});
  // champs inconnus ignorés
  assert.deepEqual(R.valeursSaisie(champs, { a: 'x', inconnu: 'y' }), { a: 'x' });
});

test('texteValeur : Non rempli pour undefined/null/""', () => {
  const c = texte('t', 'Texte', false);
  assert.equal(R.texteValeur(c, undefined), 'Non rempli');
  assert.equal(R.texteValeur(c, null), 'Non rempli');
  assert.equal(R.texteValeur(c, ''), 'Non rempli');
});

test('texteValeur : case -> Oui/Non', () => {
  const c = caseC('c', 'Case', false);
  assert.equal(R.texteValeur(c, true), 'Oui');
  assert.equal(R.texteValeur(c, false), 'Non');
});

test('texteValeur : nombre -> virgule décimale', () => {
  const c = nombre('n', 'Nombre', false);
  assert.equal(R.texteValeur(c, 12.5), '12,5');
  assert.equal(R.texteValeur(c, 12), '12');
  assert.equal(R.texteValeur(c, 0), '0');
  assert.equal(R.texteValeur(c, -3.14), '-3,14');
});

test('texteValeur : date -> JJ/MM/AAAA', () => {
  const c = date('d', 'Date', false);
  assert.equal(R.texteValeur(c, '2026-11-24'), '24/11/2026');
  // chaîne non conforme -> String(v)
  assert.equal(R.texteValeur(c, '31/12/2026'), '31/12/2026');
  // objet Date
  assert.equal(R.texteValeur(c, new Date(2026, 10, 24)), '24/11/2026');
});

test('texteValeur : photo -> Photo, signature -> Signature', () => {
  assert.equal(R.texteValeur(photo('p', 'P', false), 'fichier.jpg'), 'Photo');
  assert.equal(R.texteValeur(signature('s', 'S', false), 'sig.png'), 'Signature');
});

test('texteValeur : défaut -> String(v)', () => {
  const c = texte('t', 'T', false);
  assert.equal(R.texteValeur(c, 'hello'), 'hello');
  assert.equal(R.texteValeur(c, 42), '42');
  // sans champ
  assert.equal(R.texteValeur(null, 'x'), 'x');
  assert.equal(R.texteValeur({ type: 'inconnu' }, 1), '1');
});