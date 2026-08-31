/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Demande de conges - miroir de export/CongePdfGenerator.kt.
//
// La trame officielle (trame-conge.pdf, la meme que assets/demande_conge.pdf
// cote Android) est reprise telle quelle et les champs sont ajoutes par-dessus,
// aux coordonnees exactes de l'Android. Le bureau recoit le formulaire qu'il
// connait, rempli aux memes endroits.
//
// Seule difference de fabrication : l'Android rasterise la trame a 180 dpi et
// dessine sur l'image ; ici la surimpression reste vectorielle, donc le
// document est plus net et bien plus leger. Voir fond.js.

import { creerPage } from './pdf.js';
import { pageDeFond, surimprimer } from './fond.js';

const NOIR = [0, 0, 0];
const TRAME = 'trame-conge.pdf';

let cache = null;

/** La trame, chargee une fois puis gardee en memoire. */
async function trame() {
  if (!cache) {
    const r = await fetch(TRAME);
    if (!r.ok) throw new Error('Trame de congés introuvable.');
    cache = new Uint8Array(await r.arrayBuffer());
  }
  return cache;
}

/**
 * Croix d'une case a cocher : deux diagonales centrees, comme cross() cote
 * Android (rayon 5 pt, trait 1,4 pt).
 */
function croix(p, cx, cy, r) {
  const t = r || 5;
  p.trait(cx - t, cy - t, cx + t, cy + t, 1.4, NOIR);
  p.trait(cx - t, cy + t, cx + t, cy - t, 1.4, NOIR);
}

/** d : { nom, congesPayes, du, au, inclus, date, traces } */
export async function genererConge(d) {
  const octets = await trame();
  const page = pageDeFond(octets, 0);
  const p = creerPage(page.largeur, page.hauteur);

  // Nom de l'employe, sur la ligne pointillee.
  p.texte(d.nom, 182, 130, 10, true, NOIR);

  // Type de conges : une seule case cochee.
  if (d.congesPayes) croix(p, 183, 184);
  else croix(p, 183, 200);

  p.texte(d.du, 112, 276, 10, false, NOIR);
  p.texte(d.au, 112, 291, 10, false, NOIR);

  // La mention « inclus. » est deja imprimee sur la trame. Si le dernier jour
  // n'est PAS inclus, on la barre et on le precise dessous.
  if (!d.inclus) {
    p.trait(350, 287, 382, 287, 1.4, NOIR);
    p.texte('→ dernier jour NON inclus', 300, 307, 8, false, NOIR);
  }

  p.signature(d.traces, 80, 395, 300, 470, 1.2);
  p.texte(d.date, 452, 407, 9, false, NOIR);

  return surimprimer(octets, page, p.flux());
}

/** Nom de la piece jointe, identique a celui de l'APK. */
export function nomFichierConge(d) {
  const sur = String(d.nom || '').replace(/[^A-Za-z0-9_-]/g, '_') || 'employe';
  return 'Demande_conges_' + sur + '.pdf';
}
