/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Le cycle mensuel - miroir de util/Dates.kt.
//
// Regle fondamentale : un cycle demarre le LENDEMAIN du dernier envoi mensuel.
// Le jour de l'envoi appartient a l'ancien cycle : ni blanc, ni chevauchement.
// Tant qu'aucun envoi n'est connu, on retombe sur la fenetre fixe calee sur le
// jour de debut de cycle des reglages (21 par defaut, donc 21 -> 20).
//
// Tout est calcule en UTC a partir de chaines ISO : passer par l'heure locale
// ferait sauter d'un jour le soir, et le cycle rangerait de travers.

const JOUR = 86400000;

const versUtc = (iso) => {
  const p = String(iso).split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
};

const versIso = (ms) => new Date(ms).toISOString().slice(0, 10);

export function ajouterJours(iso, n) {
  return versIso(versUtc(iso) + n * JOUR);
}

/**
 * Ajoute des mois en gardant le meme quantieme, ramene au dernier jour du mois
 * quand il n'existe pas (31 janvier + 1 mois = 28 ou 29 fevrier), comme
 * LocalDate.plusMonths.
 */
export function ajouterMois(iso, n) {
  const p = String(iso).split('-').map(Number);
  const total = (p[0] * 12) + (p[1] - 1) + n;
  const annee = Math.floor(total / 12);
  const mois = total - annee * 12;
  const dernier = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return versIso(Date.UTC(annee, mois, Math.min(p[2], dernier)));
}

/** Fenetre fixe : le 15 mai avec un debut au 21 donne [21 avril, 20 mai]. */
export function cyclePeriode(refIso, jourDebut) {
  const jour = Math.min(28, Math.max(1, Number(jourDebut) || 21));
  const p = String(refIso).split('-').map(Number);
  const ceMois = versIso(Date.UTC(p[0], p[1] - 1, jour));
  const debut = refIso >= ceMois ? ceMois : ajouterMois(ceMois, -1);
  return [debut, ajouterJours(ajouterMois(debut, 1), -1)];
}

/**
 * Cycle courant glissant. Des le JOUR MEME de l'envoi (reference == ancre), le
 * cycle rendu est deja le suivant : sinon tout ce qui suit la cloture de
 * quelques secondes retomberait dans le cycle qu'on vient de fermer.
 */
export function cycleCourant(refIso, jourDebut, dernierEnvoiIso) {
  const ancre = String(dernierEnvoiIso || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ancre) && refIso >= ancre) {
    const debut = ajouterJours(ancre, 1);
    return [debut, ajouterJours(ajouterMois(debut, 1), -1)];
  }
  return cyclePeriode(refIso, jourDebut);
}

/** Vrai si la date ISO tombe dans [debut, fin], bornes comprises. */
export function dansPeriode(iso, debut, fin) {
  return !!iso && iso >= debut && iso <= fin;
}

/**
 * Enregistre une date d'envoi dans les reglages : dernier envoi + historique.
 * L'historique (24 envois, soit deux ans) est ce qui permettra plus tard de
 * reconstruire les cycles REELLEMENT clotures, et pas des fenetres theoriques.
 */
export function memoriserEnvoi(reglages, iso) {
  const histo = (reglages.envoiHistoryIso || []).concat([iso])
    .filter((x, i, t) => t.indexOf(x) === i)
    .sort();
  return Object.assign({}, reglages, {
    lastEnvoiDateIso: iso,
    envoiHistoryIso: histo.slice(-24),
  });
}
