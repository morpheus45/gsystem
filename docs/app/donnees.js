/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Stockage local. Les structures reprennent celles de data/Models.kt pour que
// les deux versions produisent exactement les memes donnees : dates en ISO
// (aaaa-mm-jj), heures en HH:mm, montants en nombres.

const CLE_REGLAGES = 'gsys.reglages';
const CLE_ENTREES = 'gsys.entrees';

/** Reglages du technicien - miroir de AppSettings. */
export const REGLAGES_DEFAUT = {
  nomUtilisateur: '',
  siteCodeFixe: '',
  emailEpsCc2: '',
  emailMoi: '',
  departementDefaut: '34',
  plaqueVoiture: '',
  cycleStartDay: 21,
  // Pointage d'arrivee en cours (0 = aucun), et son origine.
  pendingArrivalMs: 0,
  pendingArrivalSource: '',
};

export const ENTREES_DEFAUT = { temps: [], frais: [], compteur: [], gesteCo: [] };

function lire(cle, defaut) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? { ...defaut, ...JSON.parse(brut) } : { ...defaut };
  } catch (e) { return { ...defaut }; }
}

export function lireReglages() { return lire(CLE_REGLAGES, REGLAGES_DEFAUT); }
export function ecrireReglages(r) {
  localStorage.setItem(CLE_REGLAGES, JSON.stringify(r));
}
export function lireEntrees() { return lire(CLE_ENTREES, ENTREES_DEFAUT); }
export function ecrireEntrees(e) {
  localStorage.setItem(CLE_ENTREES, JSON.stringify(e));
}

/**
 * Les reglages indispensables au demarrage, comme AppSettings.isReady :
 * sans eux, les messages et les mails partiraient incomplets.
 */
export function reglagesComplets(r) {
  return !!(r.nomUtilisateur.trim() && r.siteCodeFixe.trim() && r.emailEpsCc2.trim());
}

export function idUnique() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** aaaa-mm-jj du jour en heure LOCALE : en UTC la date saute le soir. */
export function aujourdhuiIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** HH:mm d'un horodatage. */
export function heureDe(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}
