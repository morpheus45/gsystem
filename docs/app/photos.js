/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Photos des tickets. Elles sont redimensionnees AVANT stockage : une photo
// d'iPhone pese 3 a 5 Mo, et le stockage local du navigateur est limite a
// quelques mega-octets. 1600 px de cote suffisent largement a relire un
// ticket, pour un poids divise par dix.

// Elles vivent dans IndexedDB, pas dans localStorage : Safari plafonne
// localStorage a environ 5 Mo par site, soit une douzaine de photos a peine -
// un cycle charge en tickets aurait bute dessus en pleine intervention.
// IndexedDB n'a pas ce plafond.
//
// Un cache memoire double la base : les vues affichent les vignettes pendant
// leur rendu, qui est synchrone, alors qu'IndexedDB ne repond que plus tard.
// La memoire est donc la source de lecture, la base la source de verite.

const CLE_ANCIENNE = 'gsys.photos';
const BASE = 'gsys';
const MAGASIN = 'photos';
const COTE_MAX = 1600;
const QUALITE = 0.72;

const memoire = new Map();
let base = null;

function ouvrirBase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('sans IndexedDB')); return; }
    const d = indexedDB.open(BASE, 1);
    d.onupgradeneeded = () => {
      if (!d.result.objectStoreNames.contains(MAGASIN)) d.result.createObjectStore(MAGASIN);
    };
    d.onsuccess = () => resolve(d.result);
    d.onerror = () => reject(d.error);
  });
}

function transaction(mode, action) {
  return new Promise((resolve, reject) => {
    if (!base) { reject(new Error('base indisponible')); return; }
    const t = base.transaction(MAGASIN, mode);
    const r = action(t.objectStore(MAGASIN));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction interrompue'));
  });
}

/**
 * Charge toutes les photos en memoire au demarrage, et rapatrie au passage
 * celles restees dans l'ancien localStorage. A appeler avant le premier rendu.
 */
export async function chargerPhotos() {
  try { base = await ouvrirBase(); } catch (e) { base = null; }

  if (base) {
    try {
      const noms = await transaction('readonly', (m) => m.getAllKeys());
      const valeurs = await transaction('readonly', (m) => m.getAll());
      (noms || []).forEach((n, i) => memoire.set(n, valeurs[i]));
    } catch (e) { /* base illisible : on repart d'une memoire vide */ }
  }

  // Migration : ce qui dort encore dans localStorage rejoint la base, puis la
  // cle est liberee - c'est elle qui bloquait le quota.
  let anciennes = null;
  try { anciennes = JSON.parse(localStorage.getItem(CLE_ANCIENNE) || 'null'); }
  catch (e) { anciennes = null; }
  if (anciennes && Object.keys(anciennes).length) {
    for (const nom of Object.keys(anciennes)) {
      memoire.set(nom, anciennes[nom]);
      if (base) {
        try { await transaction('readwrite', (m) => m.put(anciennes[nom], nom)); }
        catch (e) { /* on garde au moins la copie memoire */ }
      }
    }
    if (base) { try { localStorage.removeItem(CLE_ANCIENNE); } catch (e) { /* ignore */ } }
  }
  return memoire.size;
}

export function photo(nom) { return memoire.get(nom) || null; }

/** Rend false si la photo n'a pas pu etre gardee durablement. */
export async function enregistrerPhoto(nom, dataUrl) {
  memoire.set(nom, dataUrl);
  if (!base) return false;
  try { await transaction('readwrite', (m) => m.put(dataUrl, nom)); return true; }
  catch (e) { return false; }
}

export async function supprimerPhoto(nom) {
  memoire.delete(nom);
  if (!base) return;
  try { await transaction('readwrite', (m) => m.delete(nom)); } catch (e) { /* ignore */ }
}

/** Redimensionne et compresse une photo prise par l'appareil. */
export function reduire(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('lecture impossible'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image illisible'));
      img.onload = () => {
        const ratio = Math.min(1, COTE_MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * ratio);
        c.height = Math.round(img.height * ratio);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', QUALITE));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

/** Nom de fichier propre, comme PhotoStorage.fraisAttachmentName. */
export function nomTicket(categorie, index) {
  const cat = String(categorie || 'DIVERS').toUpperCase().replace(/[^A-Z0-9-]/g, '_');
  return 'FRAIS-' + cat + (index > 1 ? '-' + index : '') + '.jpg';
}

/**
 * Photo du compteur : <PLAQUE>-<MM>-<AAAA>.jpg, comme
 * PhotoStorage.compteurAttachmentName. Le nom ne depend que de la plaque et du
 * mois : reprendre la photo ecrase la precedente au lieu de s'ajouter a elle.
 */
export function nomCompteur(plaque, dateIso) {
  const p = String(plaque || '').trim().replace(/[^A-Za-z0-9-]/g, '_') || 'VOITURE';
  const parts = String(dateIso || '').split('-');
  return p + '-' + (parts[1] || '') + '-' + (parts[0] || '') + '.jpg';
}

/** Un dataURL "data:image/jpeg;base64,..." en fichier joignable a un mail. */
export function fichierDepuisDataUrl(dataUrl, nom) {
  const brut = String(dataUrl);
  const type = (brut.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg';
  const binaire = atob(brut.slice(brut.indexOf(',') + 1));
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return new File([octets], nom, { type: type });
}
