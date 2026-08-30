/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Frais : TVA et remboursement - miroir de util/FraisTva.kt.
// Une divergence ici changerait les montants rembourses : la regle est reprise
// telle quelle, y compris le plafond du forfait telephonique.

export const CATEGORIES = ['PARKING', 'DIVERS', 'MOBILE'];

const TAUX = { PARKING: 0.20, DIVERS: 0.20, MOBILE: 0.20, AUTRE: 0.20 };
const TAUX_DEFAUT = 0.20;

/** L'entreprise rembourse 50 % du forfait telephonique, plafonnes a 20 EUR. */
export const MOBILE_PART = 0.50;
export const MOBILE_PLAFOND = 20.0;

export function tauxDe(categorie) {
  const c = String(categorie || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(TAUX, c) ? TAUX[c] : TAUX_DEFAUT;
}

/**
 * Un ticket « sans TVA » (parking PayByPhone et assimiles) n'a pas de TVA
 * recuperable : TVA nulle et HT egal au TTC.
 */
export function htDepuisTtc(ttc, categorie, sansTva) {
  return sansTva ? ttc : ttc / (1 + tauxDe(categorie));
}

export function tvaDepuisTtc(ttc, categorie, sansTva) {
  return sansTva ? 0 : ttc - htDepuisTtc(ttc, categorie, false);
}

export function remboursable(ttc, categorie) {
  return String(categorie || '').trim().toUpperCase() === 'MOBILE'
    ? Math.min(ttc * MOBILE_PART, MOBILE_PLAFOND)
    : ttc;
}

export const eur = (n) => (Math.round((Number(n) || 0) * 100) / 100)
  .toFixed(2).replace('.', ',') + ' \u20ac';
