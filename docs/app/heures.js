// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Calcul des heures d'une journee - miroir de util/HoursCalculator.kt.
// La regle n'est PAS un cumul d'horaires : elle depend de chaque demi-journee
// (INST non realisee = 2h, tout le reste = 4h ; Cedric, 24/11/2026).

const JOURNEE_ENTIERE = ['VACANCES', 'FORMATION', 'FERIE'];

export function estJourneeEntiere(e) {
  return JOURNEE_ENTIERE.indexOf((e.typeMission || '').toUpperCase()) >= 0;
}

/** PLANNING VIDE : journee sans mission -> 0h (ni 7h ni comptee par creneau). */
export function estPlanningVide(e) {
  return (e.typeMission || '').toUpperCase() === 'PLANNING VIDE';
}

/** Un creneau vide compte comme MATIN (entrees anciennes sans creneau). */
function dansCreneau(e, creneau) {
  if (creneau === 'MATIN') return e.slotMidi === 'MATIN' || !e.slotMidi;
  if (creneau === 'APREM') return e.slotMidi === 'APREM';
  return false;
}

export function heuresDuJour(entrees) {
  if (!entrees.length) return 0;
  if (entrees.some(estPlanningVide)) return 0;   // journee sans mission
  if (entrees.some(estJourneeEntiere)) return 7;

  return heuresDuCreneau(entrees, 'MATIN') + heuresDuCreneau(entrees, 'APREM');
}

/** 0h sans intervention ; 2h si seulement des INST NR ou annulees ; 4h pour tout le reste. */
export function heuresDuCreneau(entrees, creneau) {
  const l = entrees.filter((e) => dansCreneau(e, creneau));
  if (!l.length) return 0;
  return l.every((e) => String(e.typeMission || '').trim().toUpperCase() === 'INST' && e.observationType) ? 2 : 4;
}

export function expliquerHeures(entrees) {
  if (!entrees.length) return 'Aucune intervention \u2192 0h';
  if (entrees.some(estPlanningVide)) return 'Planning vide \u2192 0h';
  if (entrees.some(estJourneeEntiere)) return 'Journ\u00e9e enti\u00e8re \u2192 7h';
  const m = heuresDuCreneau(entrees, 'MATIN');
  const a = heuresDuCreneau(entrees, 'APREM');
  return 'Matin ' + m + 'h + apr\u00e8s-midi ' + a + 'h \u2192 ' + (m + a) + 'h';
}
