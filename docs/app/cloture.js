/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Ecran CLOTURE : listes et regles reprises de ui/TempsScreen.kt.

import { idUnique, aujourdhuiIso } from './donnees.js';

export const TYPES = ['INST', 'REPA', 'RESI', 'PILE', 'SAV', 'DECL', 'AJOU',
  'FINS', 'INTE', 'VISI', 'MIGR', 'VACANCES', 'FORMATION', 'FERIE', 'AUTRE'];

/** Journee entiere : ni client, ni ville, ni numero a saisir. */
export const TYPES_JOURNEE = ['VACANCES', 'FORMATION', 'FERIE'];

export const OBSERVATIONS = [
  ['', 'OK \u2014 r\u00e9alis\u00e9e'],
  ['NR_CLIENT', 'NR client'],
  ['NR_TECHNIQUE', 'NR technique'],
  ['NR_CLIENT_ABS', 'NR client absent'],
  ['NR_AUTRES', 'NR autres'],
  ['ANNULE', 'Annul\u00e9'],
];

export const MOTIFS_RETARD = [
  ['', 'Aucun'], ['ADRESSE', 'Probl\u00e8me adresse'],
  ['ATTENTE', 'Attente client'], ['AUTRE', 'Autre'],
];

export function entreeVide(reglages) {
  return {
    id: idUnique(),
    date: aujourdhuiIso(),
    departement: reglages.departementDefaut || '34',
    typeMission: 'INST',
    nomClient: '',
    ville: '',
    numeroIntervention: '',
    observationType: '',
    observations: '',
    motifRetard: '',
    retardTexte: '',
    slotMidi: new Date().getHours() < 13 ? 'MATIN' : 'APREM',
    heureDebut: '',
    heureFin: '',
  };
}

/** Champs obligatoires. Une journee entiere n'exige que la date et le type. */
export function manques(e) {
  const m = [];
  if (!e.date) m.push('la date');
  if (!e.typeMission) m.push('le type');
  if (TYPES_JOURNEE.indexOf(e.typeMission) < 0) {
    if (!String(e.departement).trim()) m.push('le d\u00e9partement');
    if (!e.nomClient.trim()) m.push('le client');
    if (!e.ville.trim()) m.push('la ville');
    if (!e.numeroIntervention.trim()) m.push('le num\u00e9ro');
  }
  return m;
}
