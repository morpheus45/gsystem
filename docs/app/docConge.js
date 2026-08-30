/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Demande de conges, recreee en vectoriel.
//
// La version Android surimprime sur une trame PDF embarquee dans ses assets.
// Ici le document est redessine entierement : rien a telecharger, donc il
// fonctionne hors ligne, et la page reste nette a l'impression.

import { creerPage, construire, A4 } from './pdf.js';

const NOIR = [0, 0, 0];
const GRIS = [0.45, 0.45, 0.45];
const BLEU = [0.12, 0.31, 0.61];
const BLEU_FOND = [0.86, 0.90, 0.95];
const ROUGE = [0.70, 0.15, 0.15];

/** d : { nom, congesPayes, du, au, inclus, date, traces } */
export function genererConge(d) {
  const p = creerPage(A4.l, A4.h);
  const M = 56;
  const DROITE = A4.l - M;

  p.rempli(M, 50, DROITE, 104, BLEU_FOND);
  p.texte('DEMANDE DE CONGÉS', M + 14, 84, 20, true, BLEU);

  p.texte('Nom et prénom du salarié', M, 150, 9, false, GRIS);
  p.texte(d.nom || '', M, 172, 13, true, NOIR);
  p.trait(M, 178, DROITE, 178, 0.6, GRIS);

  // Une seule case cochee, comme sur le formulaire papier.
  p.texte('Type de congés', M, 214, 9, false, GRIS);
  p.cadre(M, 224, M + 12, 236, 0.8, NOIR);
  if (d.congesPayes) p.croix(M, 224, 12);
  p.texte('Congés payés', M + 22, 234, 11, false, NOIR);

  p.cadre(M + 180, 224, M + 192, 236, 0.8, NOIR);
  if (!d.congesPayes) p.croix(M + 180, 224, 12);
  p.texte('Congés sans solde', M + 202, 234, 11, false, NOIR);

  p.texte('Période demandée', M, 282, 9, false, GRIS);
  p.texte('Du', M, 308, 11, false, NOIR);
  p.texte(d.du || '', M + 34, 308, 13, true, NOIR);
  p.trait(M + 30, 313, M + 190, 313, 0.6, GRIS);

  p.texte('au', M + 210, 308, 11, false, NOIR);
  p.texte(d.au || '', M + 244, 308, 13, true, NOIR);
  p.trait(M + 240, 313, M + 400, 313, 0.6, GRIS);

  // Mention imprimee telle quelle sur le papier : sans elle, le bureau ne sait
  // pas si le dernier jour est travaille.
  p.texte(d.inclus ? '(dernier jour inclus)' : '(dernier jour NON inclus)',
          M, 334, 10, true, d.inclus ? NOIR : ROUGE);

  p.cadre(M, 372, DROITE, 560, 0.6, GRIS);
  p.texte('Signature du salarié', M + 14, 396, 9, false, GRIS);
  p.signature(d.traces, M + 14, 406, M + 250, 500, 1.2);

  p.texte('Date de la demande', DROITE - 190, 396, 9, false, GRIS);
  p.texte(d.date || '', DROITE - 190, 420, 12, true, NOIR);
  p.trait(DROITE - 194, 426, DROITE - 14, 426, 0.6, GRIS);

  p.texte('Visa du responsable', DROITE - 190, 470, 9, false, GRIS);
  p.trait(DROITE - 194, 530, DROITE - 14, 530, 0.6, GRIS);

  p.texte("Document généré par l'application G-Systems.", M, 600, 8, false, GRIS);

  return construire([p]);
}

/** Nom de fichier lisible dans la boite mail du bureau. */
export function nomFichierConge(d) {
  const chiffres = (s) => String(s || '').replace(/[^0-9]/g, '');
  return 'Conge_' + chiffres(d.du) + '_au_' + chiffres(d.au) + '.pdf';
}
