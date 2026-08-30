/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Calcul des heures d'une journee - miroir de util/HoursCalculator.kt.
// La regle n'est PAS un cumul d'horaires : elle depend des demi-journees
// occupees et de celles reellement realisees (observation vide = realisee).

const JOURNEE_ENTIERE = ['VACANCES', 'FORMATION', 'FERIE'];

export function estJourneeEntiere(e) {
  return JOURNEE_ENTIERE.indexOf((e.typeMission || '').toUpperCase()) >= 0;
}

/** Un creneau vide compte comme MATIN (entrees anciennes sans creneau). */
function dansCreneau(e, creneau) {
  if (creneau === 'MATIN') return e.slotMidi === 'MATIN' || !e.slotMidi;
  if (creneau === 'APREM') return e.slotMidi === 'APREM';
  return false;
}

export function heuresDuJour(entrees) {
  if (!entrees.length) return 0;
  if (entrees.some(estJourneeEntiere)) return 7;

  const matinOccupe = entrees.some((e) => dansCreneau(e, 'MATIN'));
  const apremOccupe = entrees.some((e) => dansCreneau(e, 'APREM'));
  const matinOk = entrees.some((e) => dansCreneau(e, 'MATIN') && !e.observationType);
  const apremOk = entrees.some((e) => dansCreneau(e, 'APREM') && !e.observationType);

  const occupes = (matinOccupe ? 1 : 0) + (apremOccupe ? 1 : 0);
  const realises = (matinOk ? 1 : 0) + (apremOk ? 1 : 0);

  if (occupes === 0) return 0;
  if (occupes === 1) return 4;
  return realises === 2 ? 8 : 6;
}

export function expliquerHeures(entrees) {
  if (!entrees.length) return 'Aucune intervention \u2192 0h';
  if (entrees.some(estJourneeEntiere)) return 'Journ\u00e9e enti\u00e8re \u2192 7h';
  const h = heuresDuJour(entrees);
  if (h === 8) return 'Matin et apr\u00e8s-midi r\u00e9alis\u00e9s \u2192 8h';
  if (h === 6) return 'Matin et apr\u00e8s-midi, au moins une NR \u2192 6h';
  if (h === 4) return 'Une seule demi-journ\u00e9e \u2192 4h';
  return '0h';
}
