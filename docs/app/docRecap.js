/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Recap mensuel joint a l'envoi - miroir de PdfExporter.exportMonthlyRecap.
//
// Le document doit sortir IDENTIQUE a celui de l'APK : meme enchainement de
// sections, memes ecarts verticaux, memes abscisses de colonnes, meme
// camembert. Le petit constructeur ci-dessous reprend donc PdfBuilder tel
// quel - y compris sa regle de saut de page - au lieu d'approcher sa mise en
// page.

import { creerPage, construire } from './pdf.js';
import { htDepuisTtc, tvaDepuisTtc, remboursable } from './frais.js';

const PAGE_L = 595;
const PAGE_H = 842;
const MARGE = 40;

const NOIR = [0, 0, 0];
const GRIS_TEXTE = [0.376, 0.376, 0.416];     // #60606A
const GRIS_TRAIT = [0.816, 0.816, 0.847];     // #D0D0D8
const VERT = [0.086, 0.639, 0.290];           // #16A34A
const ROUGE = [0.863, 0.149, 0.149];          // #DC2626
const ROUGE_MARQUE = [0.933, 0.137, 0.133];   // #EE2322

const PALETTE = [
  [0.145, 0.388, 0.922], [0.063, 0.725, 0.506], [0.937, 0.267, 0.267],
  [0.961, 0.620, 0.043], [0.486, 0.227, 0.929], [0.133, 0.773, 0.369],
  [0.024, 0.714, 0.831], [0.859, 0.153, 0.467],
];

const style = (couleur, taille, gras) => ({ couleur, taille, gras: !!gras });

/** "%.2f €" avec la virgule francaise, comme PdfExporter.eur. */
const eur = (v) => (Math.round((Number(v) || 0) * 100) / 100)
  .toFixed(2).replace('.', ',') + ' €';

/** jj/mm/aaaa, comme DateUtil.fr. */
function fr(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
}

/** Dernier jour du mois d'une date ISO. */
function finDeMois(iso) {
  const p = String(iso).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10);
}

/**
 * Taux de NR du perimetre technicien : NR client + NR technique rapportes aux
 * installations REALISEES du mois civil de fin de cycle. Les annulations et les
 * autres motifs ne comptent ni au numerateur ni au denominateur.
 */
export function tauxNr(temps, moisIso) {
  const inst = temps.filter((e) =>
    String(e.typeMission || '').toUpperCase() === 'INST'
    && String(e.date || '').slice(0, 7) === moisIso);
  const realisees = inst.filter((e) => !e.observationType
    || e.observationType === 'NR_CLIENT' || e.observationType === 'NR_TECHNIQUE');
  const nr = realisees.filter((e) => e.observationType).length;
  return {
    base: realisees.length,
    pourcent: realisees.length ? (nr * 100 / realisees.length) : null,
  };
}

/** Reprise fidele de PdfBuilder : meme flux vertical, meme saut de page. */
function constructeur() {
  const pages = [];
  let page = null;
  let y = MARGE;

  const nouvelle = () => {
    page = creerPage(PAGE_L, PAGE_H);
    pages.push(page);
    y = MARGE;
  };
  nouvelle();

  const b = {
    assure(besoin) { if (y + besoin > PAGE_H - MARGE) nouvelle(); },

    texte(s, p, x, avant) {
      y += avant || 0;
      b.assure(p.taille + 4);
      y += p.taille;
      page.texte(s, x == null ? MARGE : x, y, p.taille, p.gras, p.couleur);
      return b;
    },

    ligne(cellules, xs, p, avant) {
      y += avant || 0;
      b.assure(p.taille + 4);
      y += p.taille;
      cellules.forEach((c, i) => page.texte(c, xs[i], y, p.taille, p.gras, p.couleur));
      return b;
    },

    /** Wordmark bicolore : `a` puis `b` colles, sur la meme ligne de base. */
    marque(a, pa, texteB, pb, avant) {
      y += avant || 0;
      const h = Math.max(pa.taille, pb.taille);
      b.assure(h + 4);
      y += h;
      page.suite([
        { t: a, taille: pa.taille, gras: pa.gras, couleur: pa.couleur },
        { t: texteB, taille: pb.taille, gras: pb.gras, couleur: pb.couleur },
      ], MARGE, y);
      return b;
    },

    /**
     * Camembert + legende. `donnees` = [{ libelle, valeur, couleur }].
     * Disque a gauche, legende « libelle  nb (pct%) » a droite.
     */
    camembert(donnees, total, pLegende, avant) {
      if (total <= 0 || !donnees.length) return b;
      const cote = 132;
      y += avant || 0;
      const hLegende = donnees.length * (pLegende.taille + 7);
      b.assure(Math.max(cote, hLegende) + 6);
      const haut = y;
      const gauche = MARGE + 6;
      const cx = gauche + cote / 2;
      const cy = haut + cote / 2;
      let depart = -90;
      donnees.forEach((d) => {
        const balayage = 360 * d.valeur / total;
        page.secteur(cx, cy, cote / 2, depart, balayage, d.couleur);
        depart += balayage;
      });
      const lx = gauche + cote + 26;
      let ly = haut + pLegende.taille + 2;
      donnees.forEach((d) => {
        page.rempli(lx, ly - pLegende.taille + 2, lx + 11, ly + 1, d.couleur);
        const pct = 100 * d.valeur / total;
        page.texte(d.libelle + '   ' + d.valeur + ' (' + Math.round(pct) + '%)',
          lx + 17, ly, pLegende.taille, pLegende.gras, pLegende.couleur);
        ly += pLegende.taille + 7;
      });
      y = Math.max(haut + cote, ly) + 2;
      return b;
    },

    filet() {
      y += 3;
      b.assure(2);
      page.trait(MARGE, y, PAGE_L - MARGE, y, 0.7, GRIS_TRAIT);
      y += 1;
      return b;
    },

    espace(h) { y += h; return b; },
    pages() { return pages; },
  };
  return b;
}

/**
 * d : { nom, plaque, debut, fin, temps, frais, compteurs, tempsTous,
 *       primes, totalPrimes, totalExtensions }
 *
 * `temps` / `frais` / `compteurs` sont ceux du cycle ; `tempsTous` sert au taux
 * de NR, calcule sur le MOIS CIVIL de fin de cycle et non sur le cycle.
 * `primes` = [{ type, nb, tarif, total }] ; vide tant que la saisie GESTE CO
 * n'existe pas sur iPhone, ce qui donne exactement la meme page que l'APK sur
 * un cycle sans extension installee.
 */
export function genererRecap(d) {
  const b = constructeur();
  const mois = String(d.fin).slice(0, 7);
  const nr = tauxNr(d.tempsTous || d.temps, mois);

  const pMarqueG = style(ROUGE_MARQUE, 22, true);
  const pMarque = style(NOIR, 22, true);
  const pSous = style(GRIS_TEXTE, 10);
  const pSection = style(VERT, 13, true);
  const pEntete = style(GRIS_TEXTE, 9, true);
  const pCase = style(NOIR, 10);
  const pCaseG = style(NOIR, 11, true);

  // En-tete
  b.marque('g', pMarqueG, 'systems', pMarque, 6);
  b.texte('Récap mensuel — ' + fr(d.debut) + ' → ' + fr(d.fin), pSous, null, 6);
  if (d.nom) b.texte(d.nom, pSous, null, 1);
  b.espace(12);

  // TAUX DE NR en tete : c'est le chiffre qu'on vient chercher en premier, et
  // il est TOUJOURS ecrit - sans installation sur le mois, la ligne
  // disparaissait entierement du recap.
  const conforme = nr.pourcent !== null && nr.pourcent <= 8;
  const couleurNr = nr.pourcent === null ? GRIS_TEXTE : (conforme ? VERT : ROUGE);
  const libelleMois = fr(mois + '-01') + ' → ' + fr(finDeMois(d.fin));
  b.texte('TAUX DE NR', pSection, null, 2);
  b.texte(nr.pourcent === null
    ? 'Aucune installation sur ' + libelleMois + ' — taux non calculable.'
    : nr.pourcent.toFixed(1).replace('.', ',') + ' %   '
      + (conforme ? '✓ conforme (≤ 8 %)' : '✗ hors seuil (> 8 %)'),
  style(couleurNr, 16, true), null, 5);
  b.texte('Périmètre technicien (' + libelleMois + ') : NR client + NR technique '
    + 'sur ' + nr.base + ' installation(s) réalisée(s).', pSous, null, 3);
  b.espace(14);

  // Synthese
  const totalFrais = d.frais.reduce((a, x) => a + (Number(x.montantEur) || 0), 0);
  b.texte('RÉCAP', pSection, null, 2);
  b.texte('• Feuille TEMPS : ' + d.temps.length + ' interventions', pCase, null, 4);
  b.texte('• Tickets de frais : ' + d.frais.length + '  (' + eur(totalFrais) + ')',
    pCase, null, 2);
  b.texte('• Photos compteur : ' + (d.compteurs || []).length, pCase, null, 2);
  if (d.plaque) b.texte('• Véhicule : ' + d.plaque, pCase, null, 2);
  b.espace(14);

  // Repartition TEMPS : camembert + legende, comme l'ecran RECAP.
  const parType = {};
  d.temps.forEach((e) => {
    const k = String(e.typeMission || '').trim() || '—';
    parType[k] = (parType[k] || 0) + 1;
  });
  const types = Object.keys(parType).sort((a, x) => parType[x] - parType[a]);
  if (types.length) {
    b.texte('RÉPARTITION TEMPS (' + d.temps.length + ' interv.)', pSection, null, 2);
    b.camembert(types.map((t, i) => ({
      libelle: t, valeur: parType[t], couleur: PALETTE[i % PALETTE.length],
    })), d.temps.length, pCase, 8);
    b.espace(14);
  }

  // Frais (TTC / HT / TVA / a rembourser)
  if (d.frais.length) {
    b.texte('FRAIS (TVA calculée auto)', pSection, null, 2);
    const cX = [MARGE, 115, 240, 320, 400, 480];
    b.ligne(['Date', 'Type', 'TTC', 'HT', 'TVA', 'Remb.'], cX, pEntete, 6);
    b.filet();
    let ht = 0;
    let tva = 0;
    let remb = 0;
    d.frais.forEach((t) => {
      const m = Number(t.montantEur) || 0;
      const cat = String(t.categorie || '').trim() || 'DIVERS';
      ht += htDepuisTtc(m, cat, t.sansTva);
      tva += tvaDepuisTtc(m, cat, t.sansTva);
      remb += remboursable(m, cat);
      // La date reste en ISO : c'est ce qu'ecrit l'APK dans ce tableau.
      b.ligne([t.date, cat + (t.sansTva ? ' (sans TVA)' : ''), eur(m),
        eur(htDepuisTtc(m, cat, t.sansTva)), eur(tvaDepuisTtc(m, cat, t.sansTva)),
        eur(remboursable(m, cat))], cX, pCase, 4);
    });
    b.filet();
    b.ligne(['TOTAL', '', eur(totalFrais), eur(ht), eur(tva), eur(remb)],
      cX, pCaseG, 4);
    b.texte('À REMBOURSER : ' + eur(remb)
      + '   (forfait MOBILE : 50 %, plafond 20 €)', style(VERT, 12, true), null, 6);
    b.espace(14);
  }

  // Primes GESTE CO
  const primes = d.primes || [];
  b.texte('PRIMES GESTE CO', pSection, null, 2);
  if (!primes.length) {
    b.texte('Aucune extension installée sur la période.', pSous, null, 4);
  } else {
    const cX = [MARGE, 260, 365, 470];
    b.ligne(['Type', 'Nb', 'Tarif', 'Total'], cX, pEntete, 6);
    b.filet();
    primes.forEach((p) => {
      b.ligne([p.type, String(p.nb), eur(p.tarif), eur(p.total)], cX, pCase, 4);
    });
    b.filet();
    b.ligne(['TOTAL PRIMES (' + (d.totalExtensions || 0) + ' ext.)', '', '',
      eur(d.totalPrimes || 0)], cX, pCaseG, 4);
  }
  b.espace(16);
  b.texte('Cordialement, ' + (d.nom || ''), pSous, null, 2);

  return construire(b.pages());
}

export function nomFichierRecap(debut) {
  return 'Recap-mensuel_' + debut + '.pdf';
}
