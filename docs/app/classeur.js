/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Le classeur de reference, garde d'un cycle sur l'autre - miroir de
// excelFileUri (ui/EnvoiMensuelScreen.kt) et de l'ecriture sur place
// d'ExcelFiller.kt.
//
// Android designe le fichier UNE fois, prend une permission durable sur son URI
// et reecrit dedans a chaque envoi : le meme classeur se remplit semaine apres
// semaine, cycle apres cycle.
//
// iOS ne sait pas garder l'acces a un FICHIER choisi. Mais rien n'empeche de
// garder son CONTENU : le classeur rempli est remis en base a la fin de chaque
// envoi, et le cycle suivant repart de LUI, pas de la trame vierge. Le
// technicien ne redesigne donc plus rien, et la feuille de temps s'accumule
// exactement comme sur Android.
//
// Base separee de celle des photos (gsys) : chacune a sa version, et faire
// evoluer l'une ne bloquera jamais l'ouverture de l'autre.

const BASE = 'gsys-classeur';
const MAGASIN = 'classeur';
const CLE = 'reference';
const TYPE = 'application/vnd.ms-excel.sheet.macroEnabled.12';

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

async function avoirBase() {
  if (!base) {
    try { base = await ouvrirBase(); } catch (e) { base = null; }
  }
  return base;
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
 * Le classeur memorise, ou null s'il n'y en a pas encore (ou si la base est
 * inaccessible - navigation privee, stockage refuse). Jamais d'exception :
 * l'ecran d'envoi doit rester utilisable avec un fichier choisi a la main.
 *
 * Rend { nom, octets, majMs, debut, fin } : `octets` est l'ArrayBuffer du
 * classeur, `debut`/`fin` le dernier cycle qui y a ete ecrit.
 */
export async function lireClasseur() {
  if (!(await avoirBase())) return null;
  try {
    const fiche = await transaction('readonly', (m) => m.get(CLE));
    return (fiche && fiche.octets) ? fiche : null;
  } catch (e) { return null; }
}

/**
 * Remplace la reference par le classeur qu'on vient de remplir. Rend la fiche
 * enregistree, ou null si le navigateur n'a pas pu la garder (quota depasse,
 * stockage indisponible) : l'envoi, lui, est deja parti et ne doit pas echouer
 * pour autant.
 */
export async function memoriserClasseur(nom, blob, debut, fin) {
  if (!(await avoirBase())) return null;
  try {
    const fiche = {
      nom: String(nom || 'TEMPS.xlsm'),
      octets: await blob.arrayBuffer(),
      majMs: Date.now(),
      debut: debut || '',
      fin: fin || '',
    };
    await transaction('readwrite', (m) => m.put(fiche, CLE));
    return fiche;
  } catch (e) { return null; }
}

/** Oublie la reference : le prochain envoi repartira du fichier choisi. */
export async function oublierClasseur() {
  if (!(await avoirBase())) return;
  try { await transaction('readwrite', (m) => m.delete(CLE)); } catch (e) { /* ignore */ }
}

/** La reference en fichier joignable, sous le nom voulu. */
export function fichierClasseur(fiche, nom) {
  return new File([fiche.octets], nom, { type: TYPE });
}
