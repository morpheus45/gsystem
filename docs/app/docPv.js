/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// PV d'installation cameras, recree en vectoriel.
// La version Android surimprime une trame officielle ; ici tout est redessine,
// donc rien a telecharger et le document se genere hors ligne.

import { creerPage, construire } from './pdf.js';

const W = 595, H = 842, M = 40;
const NOIR = [0, 0, 0];
const GRIS = [0.5, 0.5, 0.5];
const BLEU = [0.12, 0.31, 0.61];
const BLEU_FOND = [0.86, 0.90, 0.95];

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

function ligneEquip(p, y, libelle, prix, nb, montant) {
  p.cadre(M, y, W - M, y + 20, 0.6, GRIS);
  p.trait(390, y, 390, y + 20, 0.6, GRIS);
  p.trait(462, y, 462, y + 20, 0.6, GRIS);
  p.texte(libelle, M + 6, y + 14, 8.5, false, NOIR);
  p.texte(eur2(prix) + ' \u20ac', 300, y + 14, 8.5, false, GRIS);
  p.texte(nb || '', 420, y + 14, 9, true, NOIR);
  p.texte(montant ? eur2(montant) : '', 470, y + 14, 9, true, NOIR);
}

export function genererPv(d) {
  const p = creerPage(W, H);
  const t = totalPv(d);
  const q = (v) => Number(String(v || '').replace(',', '.')) || 0;

  p.rempli(M, 40, W - M, 92, BLEU_FOND);
  p.texte("PROC\u00c8S-VERBAL D'INSTALLATION", M + 12, 68, 15, true, BLEU);
  p.texte('CAM\u00c9RAS', M + 12, 84, 10, true, BLEU);

  p.texte('Convention n\u00b0', M, 122, 8, false, GRIS);
  p.texte(d.conv || '', M + 80, 122, 10, true, NOIR);
  p.trait(M + 76, 126, M + 230, 126, 0.5, GRIS);
  p.texte('Site n\u00b0', M + 250, 122, 8, false, GRIS);
  p.texte(d.site || '', M + 300, 122, 10, true, NOIR);
  p.trait(M + 296, 126, W - M, 126, 0.5, GRIS);

  p.texte('Date de souscription', M, 148, 8, false, GRIS);
  p.texte(d.dateSous || '', M + 110, 148, 10, true, NOIR);
  p.trait(M + 106, 152, M + 230, 152, 0.5, GRIS);

  p.texte('Nom et pr\u00e9nom', M, 174, 8, false, GRIS);
  p.texte(d.nom || '', M + 80, 174, 10, true, NOIR);
  p.trait(M + 76, 178, W - M, 178, 0.5, GRIS);

  p.texte('Adresse', M, 200, 8, false, GRIS);
  p.texte(d.adr || '', M + 52, 200, 9.5, true, NOIR);
  p.trait(M + 48, 204, W - M, 204, 0.5, GRIS);

  p.texte('\u00c9QUIPEMENT VID\u00c9O', M, 240, 11, true, BLEU);
  let y = 250;
  p.rempli(M, y, W - M, y + 18, BLEU_FOND);
  p.cadre(M, y, W - M, y + 18, 0.6, GRIS);
  p.trait(390, y, 390, y + 18, 0.6, GRIS);
  p.trait(462, y, 462, y + 18, 0.6, GRIS);
  p.texte('D\u00e9signation', M + 6, y + 13, 8.5, true);
  p.texte('Nombre', 400, y + 13, 8.5, true);
  p.texte('Total \u20ac', 470, y + 13, 8.5, true);
  y += 18;

  ligneEquip(p, y, 'HOMIRIS HD-100 ext\u00e9rieure', PRIX.EXT, d.nbExt,
             q(d.nbExt) * PRIX.EXT); y += 20;
  ligneEquip(p, y, 'HOMIRIS HD-100 int\u00e9rieure', PRIX.INT, d.nbInt,
             q(d.nbInt) * PRIX.INT); y += 20;
  ligneEquip(p, y, 'TORUS int\u00e9rieure', PRIX.TORUS, d.nbTorus,
             q(d.nbTorus) * PRIX.TORUS); y += 20;

  p.cadre(M, y, W - M, y + 20, 0.6, GRIS);
  p.trait(462, y, 462, y + 20, 0.6, GRIS);
  p.texte('TOTAL \u00c9QUIPEMENT', M + 6, y + 14, 9, true);
  p.texte(t.equip ? eur2(t.equip) : '', 470, y + 14, 9, true);
  y += 34;

  p.texte('MISE EN SERVICE', M, y, 11, true, BLEU);
  y += 12;
  p.cadre(M, y, M + 11, y + 11, 0.7, NOIR);
  if (d.miseServInt) p.croix(M, y, 11);
  p.texte('Int\u00e9rieure (' + eur2(PRIX.MES_INT) + ' \u20ac TTC)', M + 20, y + 9, 9);
  p.cadre(M + 220, y, M + 231, y + 11, 0.7, NOIR);
  if (d.miseServExt) p.croix(M + 220, y, 11);
  p.texte('Ext\u00e9rieure (' + eur2(PRIX.MES_EXT) + ' \u20ac TTC)', M + 240, y + 9, 9);
  y += 30;

  p.cadre(M, y, W - M, y + 26, 0.8, NOIR);
  p.texte('MONTANT TOTAL', M + 8, y + 17, 11, true);
  p.texte(eur2(t.total) + ' \u20ac TTC', W - M - 110, y + 17, 12, true);
  y += 44;

  p.cadre(M, y, M + 11, y + 11, 0.7, NOIR);
  if (d.miseServAnticipee) p.croix(M, y, 11);
  p.texte('Mise en service anticip\u00e9e demand\u00e9e par le client', M + 20, y + 9, 9);
  y += 30;

  p.texte('OBSERVATIONS', M, y, 10, true, BLEU);
  y += 10;
  const obs = String(d.observations || '').match(/.{1,95}(\s|$)/g) || [];
  for (let i = 0; i < 3; i++) {
    p.trait(M, y + 12, W - M, y + 12, 0.4, GRIS);
    if (obs[i]) p.texte(obs[i].trim(), M + 3, y + 10, 8.5, false, NOIR);
    y += 18;
  }

  y += 16;
  p.texte('Fait le', M, y, 9, false, GRIS);
  p.texte(d.faitLe || '', M + 40, y, 10, true, NOIR);
  p.trait(M + 36, y + 4, M + 160, y + 4, 0.5, GRIS);

  const sy = y + 24;
  const mid = W / 2;
  p.cadre(M, sy, mid - 8, sy + 100, 0.6, GRIS);
  p.cadre(mid + 8, sy, W - M, sy + 100, 0.6, GRIS);
  p.texte("Signature de l'abonn\u00e9", M + 8, sy + 14, 8.5, true);
  p.texte('Signature du technicien', mid + 16, sy + 14, 8.5, true);
  p.texte(d.nomTech || '', mid + 16, sy + 26, 8.5, true);
  p.signature(d.tracesAbonne, M + 8, sy + 30, mid - 16, sy + 94, 1.1);
  p.signature(d.tracesTech, mid + 16, sy + 34, W - M - 8, sy + 94, 1.1);

  p.texte('Paraphes :', W - M - 150, H - 34, 7.5, false, GRIS);
  p.signature(d.tracesParapheTech, M, H - 52, M + 70, H - 22, 1.0);
  p.signature(d.tracesParapheClient, W - M - 100, H - 52, W - M, H - 22, 1.0);

  return construire([p]);
}
