/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Bulletin d'intervention sur site, recree en vectoriel.
// Coordonnees reprises de export/BulletinPdfGenerator.kt pour que le document
// sorte identique sur Android et sur iPhone.

import { creerPage, construire } from './pdf.js';

const W = 595, H = 842, M = 22;
const TX = M + 20;
const C_REF = 300, C_QTE = 392, C_PU = 455, C_TOT = 516;
const LIGNES_PAR_PAGE = 9;

/** Forfait facture quand « Frais : Oui » est coche. */
export const FRAIS_INTERVENTION = 65.0;

const NOIR = [0, 0, 0];
const GRIS = [0.5, 0.5, 0.5];
const BLEU = [0.12, 0.31, 0.61];
const BLEU_CLAIR = [0.855, 0.894, 0.949];
const BLEU_BAND = [0.776, 0.847, 0.933];
const ROUGE = [0.784, 0.294, 0.192];

/** Largeur approchee d'un texte Helvetica, pour centrer et tronquer. */
function largeur(s, taille, gras) {
  return String(s || '').length * taille * (gras ? 0.56 : 0.5);
}

function tronquer(s, taille, gras, max) {
  let t = String(s || '');
  while (t.length > 1 && largeur(t, taille, gras) > max) t = t.slice(0, -1);
  return t;
}

export const eur2 = (n) => (Math.round((Number(n) || 0) * 100) / 100)
  .toFixed(2).replace('.', ',');

function dessinePage(p, d, lignes, noPage, nbPages, derniere) {
  const cocher = (x, y, libelle, coche, taille) => {
    const t = 7;
    p.cadre(x, y - t, x + t, y, 0.6, NOIR);
    if (coche) p.croix(x, y - t, t);
    p.texte(libelle, x + t + 3, y, taille || 7.5, false, NOIR);
    return t + 3 + largeur(libelle, taille || 7.5);
  };
  const champ = (label, valeur, x, y, xFin, taille) => {
    const s = taille || 8;
    p.texte(label, x, y, s, false, NOIR);
    const xv = x + largeur(label, s) + 3;
    p.trait(xv, y + 1.5, xFin, y + 1.5, 0.4, GRIS);
    p.texte(tronquer(valeur, s, true, xFin - xv - 4), xv + 2, y, s, true, NOIR);
  };
  const section = (n, titre, y, barre) => {
    p.rempli(M, y - 10, M + 12, y + 2, ROUGE);
    p.texte(n, M + 3.5, y, 8.5, true, [1, 1, 1]);
    p.texte(titre, M + 19, y, 12, true, ROUGE);
    p.rempli(M, y + 6, M + 12, y + barre, BLEU);
  };

  p.rempli(M, 24, W - M, 78, BLEU_BAND);
  p.texte('INTERVENTION SUR SITE', M + 8, 50, 17, true, BLEU);
  p.texte('(Exemplaire technicien-conseil)', W - M - 108, 36, 6.2, false, BLEU);
  champ('Date :', d.date, 250, 48, 420, 8.5);
  champ('N\u00b0 de mission :', d.numMission, M + 8, 70, 285, 8.5);
  champ('Lieu prot\u00e9g\u00e9 N\u00b0 :', d.lieuProtege, 310, 70, W - M - 8, 8.5);

  p.texte('Coordonn\u00e9es du client', M, 102, 12, true, BLEU);
  champ('Nom et pr\u00e9nom :', d.nom, M, 122, 288);
  champ('Adresse :', d.adresse, M, 140, 288);
  p.trait(M, 157.5, 288, 157.5, 0.4, GRIS);
  champ('Code Postal :', d.cp, M, 176, 288);
  champ('Ville :', d.ville, M, 194, 288);

  const cx = 300, k1 = cx, k2 = cx + 103, k3 = cx + 200;
  const n = d.natures || {};
  p.texte("Nature de l'intervention", cx, 102, 12, true, BLEU);
  cocher(k1, 122, 'Migration (MIGR)', !!n.MIGR);
  cocher(k2, 122, 'D\u00e9montage (RESI)', !!n.RESI);
  cocher(k3, 122, 'V\u00e9rification (INTE)', !!n.INTE);
  cocher(k1, 138, 'Ajout (AJOU)', !!n.AJOU);
  cocher(k2, 138, 'Remplac. piles (PILE)', !!n.PILE);
  cocher(k3, 138, 'Demande client (DECL)', !!n.DECL);
  cocher(k1, 154, 'R\u00e9paration (REPA)', !!n.REPA);
  cocher(k2, 154, 'Contr\u00f4le (CONT)', !!n.CONT);
  const wAutre = cocher(k3, 154, 'Autre (pr\u00e9ciser) :', !!n.AUTRE);
  cocher(k1, 170, 'Visite/Devis (VISI)', !!n.VISI);
  p.trait(k3 + wAutre + 2, 155.5, W - M, 155.5, 0.4, GRIS);
  champ('Marque du mat\u00e9riel :', d.marque, cx, 194, cx + 175);
  champ('Type :', d.typeMat, cx + 185, 194, W - M);

  section('1', 'Nature des prestations', 218, 222);
  let ty = 226;
  p.rempli(TX, ty, W - M, ty + 17, BLEU_CLAIR);
  p.cadre(TX, ty, W - M, ty + 17, 0.6, GRIS);
  [C_REF, C_QTE, C_PU, C_TOT].forEach((x) => p.trait(x, ty, x, ty + 17, 0.6, GRIS));
  p.texte('D\u00e9tail des prestations ou pi\u00e8ces fournies', TX + 5, ty + 12, 8, true);
  p.texte('R\u00e9f\u00e9rence', C_REF + 6, ty + 12, 8, true);
  p.texte('Quantit\u00e9', C_QTE + 8, ty + 12, 8, true);
  p.texte('Prix unitaire', C_PU + 3, ty + 12, 8, true);
  p.texte('Prix total', C_TOT + 10, ty + 12, 8, true);
  ty += 17;

  for (let i = 0; i < LIGNES_PAR_PAGE; i++) {
    p.cadre(TX, ty, W - M, ty + 17, 0.6, GRIS);
    [C_REF, C_QTE, C_PU, C_TOT].forEach((x) => p.trait(x, ty, x, ty + 17, 0.6, GRIS));
    const l = lignes[i];
    if (l) {
      p.texte(tronquer(l.detail, 8, true, C_REF - TX - 10), TX + 5, ty + 12, 8, true);
      p.texte(tronquer(l.reference, 8, true, C_QTE - C_REF - 12), C_REF + 6, ty + 12, 8, true);
      const wq = largeur(l.qte, 8, true);
      p.texte(l.qte, C_QTE + (C_PU - C_QTE - wq) / 2, ty + 12, 8, true);
      p.texte(l.pu, C_PU + 5, ty + 12, 8, true);
      p.texte(l.total, C_TOT + 6, ty + 12, 8, true);
    }
    p.texte('\u20ac', C_PU + 50, ty + 12, 7, false, GRIS);
    p.texte('\u20ac', W - M - 9, ty + 12, 7, false, GRIS);
    ty += 17;
  }

  p.cadre(TX, ty, W - M, ty + 18, 0.6, GRIS);
  p.trait(C_TOT, ty, C_TOT, ty + 18, 0.6, GRIS);
  p.texte("Forfait d'intervention :", TX + 5, ty + 12, 8);
  cocher(TX + 92, ty + 12, 'Locatif', !!d.forfaitLocatif);
  cocher(TX + 145, ty + 12, 'Acquisition', !!d.forfaitAcquisition);
  p.texte('Frais :', TX + 218, ty + 12, 8);
  cocher(TX + 248, ty + 12, 'Oui', !!d.fraisOui);
  cocher(TX + 285, ty + 12, 'Non', !d.fraisOui);
  if (d.fraisOui) p.texte(eur2(FRAIS_INTERVENTION), C_TOT + 8, ty + 12, 8.5, true);
  p.texte('\u20ac', W - M - 9, ty + 12, 7, false, GRIS);
  ty += 18;

  // La case TOTAL demarre a la colonne « prix unitaire » : plus etroite, les
  // cases H.T./T.T.C. sortaient de la page.
  p.cadre(TX, ty, C_PU, ty + 34, 0.6, GRIS);
  p.cadre(C_PU, ty, W - M, ty + 34, 0.6, GRIS);
  p.texte('R\u00e8glement :', TX + 5, ty + 12, 8);
  let rx = TX + 52;
  rx += cocher(rx, ty + 12, 'Pr\u00e9l\u00e8vement', !!d.reglPrelevement) + 8;
  rx += cocher(rx, ty + 12, 'Ch\u00e8que', !!d.reglCheque) + 8;
  cocher(rx, ty + 12, 'Autre :', !!d.reglAutre);
  p.texte('Si acquisition : souhaitez-vous conserver les pi\u00e8ces remplac\u00e9es ?',
          TX + 5, ty + 27, 7.5);
  cocher(TX + 228, ty + 27, 'Oui', !!d.conserverOui);
  cocher(TX + 262, ty + 27, 'Non', !!d.conserverNon);
  p.texte('TOTAL :', C_PU + 6, ty + 14, 9.5, true);
  p.texte(d.total, C_PU + 48, ty + 14, 10, true);
  p.texte('\u20ac', W - M - 9, ty + 14, 7, false, GRIS);
  cocher(C_PU + 8, ty + 29, 'H.T.', !!d.totalHt, 7);
  cocher(C_PU + 58, ty + 29, 'T.T.C.', !d.totalHt, 7);

  if (!derniere) {
    p.texte('Suite des prestations au verso \u2014 page ' + noPage + ' / ' + nbPages,
            M, H - 30, 8, true, BLEU);
    return;
  }

  let y = 468;
  section('2', 'Nouvelle mensualit\u00e9', y, 46);
  y += 8;
  p.cadre(TX, y, W - M, y + 38, 0.6, GRIS);
  p.trait(C_TOT, y, C_TOT, y + 38, 0.6, GRIS);
  p.texte("Montant total de la nouvelle mensualit\u00e9 d'abonnement", TX + 6, y + 16, 8);
  p.texte("(en cas de modification de l'\u00e9quipement) :", TX + 6, y + 29, 7.5, false, GRIS);
  p.texte(d.mensualite, C_TOT + 6, y + 18, 9.5, true);
  p.texte('\u20ac', W - M - 9, y + 16, 7, false, GRIS);
  cocher(C_TOT + 6, y + 31, 'H.T.', !!d.totalHt, 6.5);
  cocher(C_TOT + 38, y + 31, 'T.T.C.', !d.totalHt, 6.5);

  y = 536;
  section('3', "Tests du syst\u00e8me d'alarme", y, 54);
  p.texte("Le technicien-conseil a proc\u00e9d\u00e9 en pr\u00e9sence de l'abonn\u00e9 "
        + 'ou de son repr\u00e9sentant aux tests pr\u00e9vus', TX, y + 20, 8);
  p.texte('au contrat et confirme le bon fonctionnement :', TX, y + 34, 8);
  cocher(TX + 190, y + 34, "du syst\u00e8me d'alarme", !!d.testAlarme, 8);
  cocher(TX + 190, y + 48, 'et des moyens de liaison au centre de surveillance.',
         !!d.testLiaison, 8);

  y = 604;
  section('4', 'Observations du technicien-conseil', y, 62);
  let ly = y + 26;
  const obs = String(d.obsTech || '').match(/.{1,120}(\s|$)/g) || [];
  for (let i = 0; i < 4; i++) {
    p.trait(TX, ly + 1.5, W - M, ly + 1.5, 0.4, GRIS);
    if (obs[i]) p.texte(obs[i].trim(), TX + 3, ly, 8, true);
    ly += 15;
  }

  y = 688;
  section('5', 'Observations du client ou de son repr\u00e9sentant', y, 48);
  p.texte('Je reconnais avoir constat\u00e9 le bon fonctionnement du syst\u00e8me',
          TX, y + 14, 7.5, false, GRIS);
  if (nbPages > 1) {
    p.texte('Page ' + noPage + ' / ' + nbPages, W - M - 46, y, 7, false, GRIS);
  }
  ly = y + 32;
  for (let i = 0; i < 2; i++) {
    p.trait(TX, ly + 1.5, W - M, ly + 1.5, 0.4, GRIS);
    ly += 15;
  }

  const sy = 742, mid = W / 2;
  p.cadre(M, sy, mid - 6, H - 22, 0.6, GRIS);
  p.cadre(mid + 6, sy, W - M, H - 22, 0.6, GRIS);
  p.texte('Nom et signature du technicien-conseil :', M + 6, sy + 11, 8, true);
  p.texte('Nom et signature du client ou de son repr\u00e9sentant :',
          mid + 12, sy + 11, 8, true);
  p.texte(d.nomTech, M + 6, sy + 23, 8, true);
  p.texte(d.nomClient, mid + 12, sy + 23, 8, true);
  // La signature deborde volontairement sous le cadre : au-dessus il ne reste
  // que 16 pt, ce qui la rendrait minuscule.
  p.signature(d.tracesTech, M + 6, sy + 26, mid - 12, H - 10, 1.1);
  p.signature(d.tracesClient, mid + 12, sy + 26, W - M - 6, H - 10, 1.1);
}

export function genererBulletin(d) {
  const remplies = (d.lignes || []).filter(
    (l) => (l.detail || '').trim() || (l.reference || '').trim() || (l.qte || '').trim());
  const nbPaquets = Math.max(1, Math.ceil(remplies.length / LIGNES_PAR_PAGE));
  const paquets = [];
  for (let i = 0; i < nbPaquets; i++) {
    paquets.push(remplies.slice(i * LIGNES_PAR_PAGE, (i + 1) * LIGNES_PAR_PAGE));
  }
  const pages = paquets.map((chunk, i) => {
    const p = creerPage(W, H);
    dessinePage(p, d, chunk, i + 1, paquets.length, i === paquets.length - 1);
    return p;
  });
  return construire(pages);
}

/** Reference au format XX-XXX-XX : 3 lettres puis 4 chiffres. */
export function refFormatee(brut) {
  let out = '';
  String(brut || '').split('').forEach((c, i) => {
    if (i === 2 || i === 5) out += '-';
    out += c;
  });
  return out;
}
