import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recapFacturation } from '../core/facturation.js';

const e = (typeMission, observationType = '') => ({ typeMission, observationType });

test('récap de facturation : interventions par type et résultat, équipements installés', () => {
  const temps = [e('INST'), e('INST'), e('inst', 'NR_CLIENT'), e('INST', 'NR_TECHNIQUE'), e('SAV'), e('SAV', 'NR_CLIENT_ABS'), e('VACANCES'), e('PLANNING VIDE')];
  const gestes = [{ installes: { gsm: 2, cam: 1 } }, { installes: { gsm: 1, sondeIn: 3 } }];
  assert.deepEqual(recapFacturation(temps, gestes), {
    interventions: [
      { type: 'INST', ok: 2, nrClient: 1, nrTechnique: 1, nrAutres: 0, total: 4 },
      { type: 'SAV', ok: 1, nrClient: 0, nrTechnique: 0, nrAutres: 1, total: 2 },
    ],
    equipements: [{ type: 'GSM', qte: 3 }, { type: 'CAM', qte: 1 }, { type: 'SONDE IN', qte: 3 }],
  });
});

import { montantsFacture, lignesManquantes } from '../core/facturation.js';

const recap = {
  interventions: [{ type: 'INST', ok: 10, nrClient: 2, nrTechnique: 1, nrAutres: 1, total: 14 }, { type: 'SAV', ok: 3, nrClient: 1, nrTechnique: 0, nrAutres: 0, total: 4 }],
  equipements: [{ type: 'GSM', qte: 5 }, { type: 'CAM', qte: 2 }],
};

test('montants : quantité selon la base de la ligne × prix HT ; ligne sans prix = à compléter', () => {
  const tarifs = [
    { categorie: 'intervention', code: 'INST', libelle: 'Installation', base: 'ok_nrclient', prix_ht: 50 },
    { categorie: 'intervention', code: 'SAV', libelle: 'SAV', base: 'ok', prix_ht: null },
    { categorie: 'equipement', code: 'GSM', libelle: 'Module GSM', base: 'ok', prix_ht: 12.5 },
  ];
  assert.deepEqual(montantsFacture(recap, tarifs), {
    lignes: [
      { libelle: 'Installation', qte: 12, prix_ht: 50, montant_ht: 600 },
      { libelle: 'SAV', qte: 3, prix_ht: null, montant_ht: null },
      { libelle: 'Module GSM', qte: 5, prix_ht: 12.5, montant_ht: 62.5 },
    ],
    totalHt: 662.5,
    sansPrix: 1,
  });
});

test('lignes manquantes : une par type rencontré qui n\'a pas encore de tarif', () => {
  const existants = [{ categorie: 'intervention', code: 'INST' }];
  assert.deepEqual(lignesManquantes(recap, existants), [
    { categorie: 'intervention', code: 'SAV', libelle: 'SAV' },
    { categorie: 'equipement', code: 'GSM', libelle: 'GSM' },
    { categorie: 'equipement', code: 'CAM', libelle: 'CAM' },
  ]);
});
