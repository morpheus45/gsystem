/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// PV d'installation cameras - miroir de export/PvPdfGenerator.kt.
//
// Le PV officiel (trame-pv.pdf, la meme que assets/pv_cameras.pdf cote Android)
// est repris tel quel, sur ses DEUX pages, et les champs sont ajoutes par-dessus
// aux coordonnees exactes de l'Android. Le client signe le document qu'il
// connait, et l'abonnement y figure aux memes lignes.
//
// L'Android rasterise la trame a 180 dpi avant de dessiner ; ici la
// surimpression reste vectorielle. Voir fond.js.

import { creerPage } from './pdf.js';
import { pageDeFond, surimprimerPages } from './fond.js';

const NOIR = [0, 0, 0];
const BLANC = [1, 1, 1];
const TRAME = 'trame-pv.pdf';

/** Tarifs - repris de ui/PvCameraScreen.kt. */
export const PRIX = { EXT: 179.0, INT: 149.0, TORUS: 89.0, MES_INT: 40.0, MES_EXT: 70.0 };

export const eur2 = (n) => (Math.round((Number(n) || 0) * 100) / 100)
  .toFixed(2).replace('.', ',');

/**
 * Frais de mise en service : si l'interieure ET l'exterieure sont cochees,
 * seul le plus eleve s'applique - ils ne se cumulent pas.
 */
export function fraisMiseEnService(interieure, exterieure) {
  if (exterieure) return PRIX.MES_EXT;
  if (interieure) return PRIX.MES_INT;
  return 0;
}

export function totalPv(d) {
  const q = (v) => Number(String(v || '').replace(',', '.')) || 0;
  const equip = q(d.nbExt) * PRIX.EXT + q(d.nbInt) * PRIX.INT + q(d.nbTorus) * PRIX.TORUS;
  const mes = fraisMiseEnService(d.miseServInt, d.miseServExt);
  return { equip: equip, mes: mes, total: equip + mes };
}

let cache = null;

async function trame() {
  if (!cache) {
    const r = await fetch(TRAME);
    if (!r.ok) throw new Error('Trame du PV introuvable.');
    cache = new Uint8Array(await r.arrayBuffer());
  }
  return cache;
}

/** Croix d'une case a cocher, rayon 4,5 pt et trait 1,4 pt comme l'Android. */
function croix(p, cx, cy) {
  const r = 4.5;
  p.trait(cx - r, cy - r, cx + r, cy + r, 1.4, NOIR);
  p.trait(cx - r, cy + r, cx + r, cy - r, 1.4, NOIR);
}

/**
 * Decoupe les observations comme wrapObs : la 1re ligne demarre a droite du
 * libelle imprime (92 caracteres), les suivantes occupent toute la largeur.
 */
function couperObservations(s) {
  const texte = String(s || '').trim();
  if (!texte) return [];
  const out = [];
  let courant = '';
  let limite = 92;
  texte.split(/\s+/).forEach((mot) => {
    const essai = courant ? courant + ' ' + mot : mot;
    if (essai.length <= limite) {
      courant = essai;
    } else {
      out.push(courant);
      courant = mot;
      limite = 150;
    }
  });
  if (courant) out.push(courant);
  return out;
}

/**
 * d : { conv, site, dateSous, nom, adr, nbExt, nbInt, nbTorus,
 *       miseServInt, miseServExt, miseServAnticipee, observations, faitLe,
 *       nomTech, tracesAbonne, tracesTech, tracesParapheTech,
 *       tracesParapheClient }
 * Les dates arrivent deja en jj/mm/aaaa.
 */
export async function genererPv(d) {
  const octets = await trame();
  const t = totalPv(d);
  const q = (v) => Number(String(v || '').replace(',', '.')) || 0;
  const montant = (nb, prix) => (q(nb) ? eur2(q(nb) * prix) + ' €' : '');

  const couches = [];
  for (let i = 0; i < 2; i++) {
    const page = pageDeFond(octets, i);
    const p = creerPage(page.largeur, page.hauteur);

    // En-tete, repete sur les deux pages comme sur la trame.
    p.texte(d.conv, 78, 45, 9.5, true, NOIR);
    p.texte(d.site, 210, 45, 9.5, true, NOIR);
    p.texte(d.dateSous, 392, 45, 9.5, true, NOIR);
    p.texte(d.nom, 144, 66, 9.5, true, NOIR);
    p.texte(d.adr, 126, 92, 9, true, NOIR);

    if (i === 0) {
      p.texte(d.nbExt, 481, 372, 10, true, NOIR);
      p.texte(montant(d.nbExt, PRIX.EXT), 512, 372, 10, true, NOIR);
      p.texte(d.nbInt, 481, 392, 10, true, NOIR);
      p.texte(montant(d.nbInt, PRIX.INT), 512, 392, 10, true, NOIR);
      p.texte(d.nbTorus, 481, 410, 10, true, NOIR);
      p.texte(montant(d.nbTorus, PRIX.TORUS), 512, 410, 10, true, NOIR);
      p.texte(t.equip ? eur2(t.equip) + ' €' : '', 512, 427, 10, true, NOIR);

      if (d.miseServInt) croix(p, 14, 508);
      if (d.miseServExt) croix(p, 14, 519);
      p.texte(t.total ? eur2(t.total) + ' €' : '', 512, 565, 10, true, NOIR);

      let oy = 578;
      couperObservations(d.observations).slice(0, 4).forEach((ligne, idx) => {
        p.texte(ligne, idx === 0 ? 200 : 10, oy, 9, false, NOIR);
        oy += 13;
      });

      p.signature(d.tracesParapheClient, 513, 805, 593, 839, 1.2);
      p.signature(d.tracesParapheTech, 5, 805, 106, 839, 1.2);
    }

    if (i === 1) {
      if (d.miseServAnticipee) croix(p, 16, 342);
      // La trame porte deja une date imprimee a cet endroit : on la couvre
      // avant d'ecrire la notre, exactement comme le mask() de l'Android.
      p.rempli(33, 437, 110, 450, BLANC);
      p.texte(d.faitLe, 36, 447, 9.5, true, NOIR);
      p.texte(d.nomTech, 452, 467, 8.5, true, NOIR);
      p.texte(d.site, 533, 751, 8.5, true, NOIR);
      p.signature(d.tracesAbonne, 92, 457, 304, 505.5, 1.2);
      p.signature(d.tracesTech, 308, 468, 548, 505.5, 1.2);
    }

    couches.push({ page: page, flux: p.flux() });
  }

  return surimprimerPages(octets, couches);
}

/** Nom de la piece jointe, identique a celui de l'APK. */
export function nomFichierPv(site) {
  const sur = String(site || '').replace(/[^A-Za-z0-9_-]/g, '_') || 'cameras';
  return 'PV_CAMERAS_' + sur + '.pdf';
}
