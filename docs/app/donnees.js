// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
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
  // Dernier envoi mensuel : c'est lui qui fait demarrer le cycle suivant, le
  // lendemain. L'historique (24 envois) garde la trace des cycles reellement
  // clotures, pour ne pas re-ranger l'ancien selon une fenetre theorique.
  lastEnvoiDateIso: '',
  envoiHistoryIso: [],
  // Dernier envoi mensuel : c'est lui qui fait demarrer le cycle suivant, le
  // lendemain. L'historique (24 envois) garde la trace des cycles reellement
  // clotures, pour ne pas re-ranger l'ancien selon une fenetre theorique.
  lastEnvoiDateIso: '',
  // Dernier id de message chat marqué lu (côté tech). 0 = aucun.
  chatLastReadId: 0,
  // Pointage d'arrivee en cours (0 = aucun), et son origine.
  pendingArrivalMs: 0,
  pendingArrivalSource: '',
};

export const ENTREES_DEFAUT = { temps: [], frais: [], compteur: [], gesteCo: [] };

function lire(cle, defaut) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? { ...defaut, ...JSON.parse(brut) } : { ...defaut };
  } catch (e) {
    // Illisible : on garde une copie de l'original avant de repartir de l'etat d'avant.
    try {
      const abime = localStorage.getItem(cle);
      if (abime) localStorage.setItem(cle + '.illisible', abime);
      const avant = localStorage.getItem(cle + '.avant');
      if (avant) return { ...defaut, ...JSON.parse(avant) };
    } catch (e2) { /* rien a reprendre */ }
    return { ...defaut };
  }
}

export function lireReglages() { return lire(CLE_REGLAGES, REGLAGES_DEFAUT); }
export function ecrireReglages(r) {
  localStorage.setItem(CLE_REGLAGES, JSON.stringify(r));
}
export function lireEntrees() { return lire(CLE_ENTREES, ENTREES_DEFAUT); }
let apresEcriture = () => {};
/** Appele apres chaque enregistrement (sauvegarde sur le Drive). */
export function surEcriture(f) { apresEcriture = f; }
export function ecrireEntrees(e) {
  try {
    const avant = localStorage.getItem(CLE_ENTREES);
    if (avant) { JSON.parse(avant); localStorage.setItem(CLE_ENTREES + '.avant', avant); }
  } catch (err) { /* copie d'avant impossible : l'enregistrement compte davantage */ }
  localStorage.setItem(CLE_ENTREES, JSON.stringify(e));
  apresEcriture();
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
