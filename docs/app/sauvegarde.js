// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Sauvegarde des donnees de l'iPhone sur le Drive, et restauration.
// Fichier a part (iphone-donnees.json, dossier « iphone » pour les photos) : il ne
// touche jamais aux donnees.json de l'APK.
// Regle : on envoie toujours l'UNION du Drive et de l'iPhone. Seule une entree que
// CET iPhone a eue puis supprimee peut sortir du fichier ; rien d'autre ne s'ecrase.

import { poster } from './connexion.js';

export const FICHIER = 'iphone-donnees.json';
const DOSSIER_PHOTOS = 'iphone';
const CLE_VUS = 'gsys.sauvegarde.vus';
const CLE_PHOTOS = 'gsys.sauvegarde.photos';
export const TYPES = ['temps', 'frais', 'compteur', 'gesteCo', 'modules'];

const lireJson = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) || defaut; } catch (e) { return defaut; } };
const ecrireJson = (cle, v) => { localStorage.setItem(cle, JSON.stringify(v)); };
const liste = (e, t) => (e && Array.isArray(e[t]) ? e[t] : []);

/** Identifiants « type/id » ; une entree sans id est reperee par son contenu. */
export const cleEntree = (t, x) => t + '/' + (x.id || JSON.stringify(x));
export function ids(entrees) {
  return TYPES.flatMap((t) => liste(entrees, t).map((x) => cleEntree(t, x)));
}

/** Ce que contiendra le Drive : l'iPhone d'abord, puis ce qu'il n'a jamais eu. */
export function fusion(distant, local, vus) {
  const sortie = {};
  const deja = new Set(vus);
  for (const t of TYPES) {
    const miens = liste(local, t);
    const cles = new Set(miens.map((x) => cleEntree(t, x)));
    sortie[t] = miens.concat(liste(distant, t).filter((x) => !cles.has(cleEntree(t, x)) && !deja.has(cleEntree(t, x))));
  }
  return sortie;
}

/** Restauration : ajoute a l'iPhone ce qui lui manque, sans rien remplacer. */
export function ajouterManquants(distant, local) {
  const sortie = { ...local };
  let n = 0;
  for (const t of TYPES) {
    const miens = liste(local, t);
    const cles = new Set(miens.map((x) => cleEntree(t, x)));
    const plus = liste(distant, t).filter((x) => !cles.has(cleEntree(t, x)));
    n += plus.length;
    sortie[t] = miens.concat(plus);
  }
  return { entrees: sortie, n };
}

/** Reglages : le Drive ne remplit que ce qui est vide ; les envois passes s'ajoutent. */
export function completerReglages(distant, local) {
  const r = { ...local };
  for (const k of Object.keys(distant || {})) {
    if (r[k] === undefined || r[k] === '' || r[k] === null) r[k] = distant[k];
  }
  const h = (x) => (x && Array.isArray(x.envoiHistoryIso) ? x.envoiHistoryIso : []);
  r.envoiHistoryIso = [...new Set(h(local).concat(h(distant)))].sort().slice(-24);
  r.lastEnvoiDateIso = [String(local.lastEnvoiDateIso || ''), String((distant && distant.lastEnvoiDateIso) || '')].sort().pop();
  return r;
}

/** Nom sur le Drive de chaque photo : simple, et jamais le meme pour deux photos. */
export function nomsPhotos(cles) {
  const pris = new Set(); const noms = {};
  for (const c of [...cles].sort()) {
    const base = (String(c).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._]+/, '') || 'photo').slice(0, 90);
    let nom = /\.(jpe?g|png)$/i.test(base) ? base : base + '.jpg';
    for (let i = 2; pris.has(nom.toLowerCase()); i++) nom = i + '-' + base + (/\.(jpe?g|png)$/i.test(base) ? '' : '.jpg');
    pris.add(nom.toLowerCase());
    noms[c] = nom;
  }
  return noms;
}

const empreinte = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return s.length + '-' + h; };
const versBase64 = (texte) => { const o = new TextEncoder().encode(texte); let s = ''; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000)); return btoa(s); };
const depuisBase64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

/** Contenu du Drive ; null s'il n'y en a pas encore. Leve une erreur dans le doute. */
async function lireDistant(tech) {
  const r = await poster({ action: 'photo_pull', user: tech, month: '__root__', fileName: FICHIER });
  if (r && r.ok === false && r.error === 'not found') return null;
  if (!r || !r.ok || !r.dataBase64) throw new Error('Drive injoignable');
  const d = JSON.parse(depuisBase64(r.dataBase64));
  if (!d || d.v !== 1 || !d.entrees) throw new Error('sauvegarde illisible');
  return d;
}

async function deposer(tech, mois, nom, mime, dataBase64) {
  const r = await poster({ user: tech, month: mois, fileName: nom, mimeType: mime, dataBase64 });
  return !!(r && r.ok === true);
}

let enCours = null;

/**
 * Envoie tout. Rend 'ok', 'restaurer' (le Drive a des donnees que cet iPhone n'a
 * pas : rien n'est perdu, elles y restent) ou 'attente'. [etat] : { tech, entrees,
 * reglages, complets, clesPhotos, photo }.
 */
export function sauvegarder(etat) {
  if (!enCours) enCours = faire(etat).catch(() => 'attente').finally(() => { enCours = null; });
  return enCours;
}

async function faire(etat) {
  const tech = String(etat.tech || '').trim();
  if (!tech) return 'attente';
  const distant = await lireDistant(tech);
  const vus = lireJson(CLE_VUS, []);
  const entrees = fusion(distant && distant.entrees, etat.entrees, vus);
  const noms = { ...((distant && distant.photos) || {}) };
  const libres = nomsPhotos(Object.keys(noms).concat(etat.clesPhotos));
  for (const c of etat.clesPhotos) if (!noms[c]) noms[c] = Object.values(noms).includes(libres[c]) ? Date.now() + '-' + libres[c] : libres[c];
  const sauve = { v: 1, entrees, photos: noms,
    reglages: etat.complets || !distant ? etat.reglages : distant.reglages };
  const texte = JSON.stringify(sauve);
  if (!distant || JSON.stringify(distant) !== texte) {
    if (!ids(entrees).length && !distant) return 'ok';
    if (!await deposer(tech, '__root__', FICHIER, 'application/json', versBase64(texte))) return 'attente';
  }
  ecrireJson(CLE_VUS, [...new Set(vus.concat(ids(etat.entrees)))]);
  // Photos ensuite, notees une par une : une coupure reprend ou elle en etait.
  const envoyees = lireJson(CLE_PHOTOS, {});
  for (const c of etat.clesPhotos) {
    const d = etat.photo(c);
    if (!d) continue;
    const e = noms[c] + '|' + empreinte(d);
    if (envoyees[c] === e) continue;
    const mime = (d.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg';
    if (!await deposer(tech, DOSSIER_PHOTOS, noms[c], mime, d.slice(d.indexOf(',') + 1))) return 'attente';
    envoyees[c] = e;
    ecrireJson(CLE_PHOTOS, envoyees);
  }
  await poster({ action: 'envoi_complet', user: tech }).catch(() => null);
  const miens = new Set(ids(etat.entrees));
  return ids(entrees).some((i) => !miens.has(i)) ? 'restaurer' : 'ok';
}

/** Restaure. [garder] enregistre une photo. Rend { entrees, reglages, n, photos, manquantes } ou null. */
export async function restaurer(etat, garder) {
  const tech = String(etat.tech || '').trim();
  const d = await lireDistant(tech);
  if (!d) return null;
  let photos = 0; let manquantes = 0;
  for (const c of Object.keys(d.photos || {})) {
    if (etat.photo(c)) continue;
    const r = await poster({ action: 'photo_pull', user: tech, month: DOSSIER_PHOTOS, fileName: d.photos[c] });
    const mime = /\.png$/i.test(d.photos[c]) ? 'image/png' : 'image/jpeg';
    if (r && r.ok && r.dataBase64 && await garder(c, 'data:' + mime + ';base64,' + r.dataBase64)) photos++; else manquantes++;
  }
  const a = ajouterManquants(d.entrees, etat.entrees);
  return { entrees: a.entrees, n: a.n, reglages: completerReglages(d.reglages, etat.reglages), photos, manquantes };
}
