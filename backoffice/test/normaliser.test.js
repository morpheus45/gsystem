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
