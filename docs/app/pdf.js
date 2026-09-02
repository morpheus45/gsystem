/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Generateur PDF minimal, ecrit a la main.
//
// Pourquoi pas une bibliotheque : l'application doit fonctionner HORS LIGNE
// (sous-sol, zone blanche). Charger un script depuis un CDN casserait ca, et
// embarquer une bibliotheque complete pese des centaines de kilo-octets pour
// des documents qui n'utilisent que du texte, des traits et des rectangles.
//
// Repere PDF : origine en BAS a gauche, l'inverse de l'ecran. On expose donc
// des coordonnees \u00ab ecran \u00bb (origine en haut) et on convertit a l'ecriture.

export const A4 = { l: 595, h: 842 };

/** Echappe les caracteres speciaux d'une chaine PDF. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Les polices standard du PDF utilisent WinAnsi : les accents francais y sont,
 * mais a des positions differentes de l'UTF-16 du navigateur. Sans conversion,
 * les caracteres hors Latin-1 sortiraient faux.
 */
const WINANSI = {
  '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"',
  '\u2013': '\u0096', '\u2014': '\u0097', '\u20ac': '\u0080',
  '\u2026': '\u0085', '\u0152': '\u008c', '\u0153': '\u009c',
  '\u2022': '\u0095', '\u00a0': ' ',
};

/**
 * Glyphes absents de WinAnsi mais presents dans les polices standard Symbol et
 * ZapfDingbats, que tout lecteur PDF possede : rien a embarquer. La position du
 * texte avance toute seule apres chaque Tj, donc changer de police en cours de
 * ligne ne demande aucune mesure de largeur.
 *
 * Le code envoye est arbitraire : c'est /Differences qui le relie a un nom de
 * glyphe (voir construire), ce qui evite de dependre de l'encodage natif.
 */
const SPECIAUX = {
  '\u2264': ['FS', 'A'],   // <=
  '\u2265': ['FS', 'B'],   // >=
  '\u2192': ['FS', 'C'],   // ->
  '\u2713': ['FD', 'A'],   // coche
  '\u2717': ['FD', 'B'],   // croix
};

/** Un caractere, tel qu'il doit etre ecrit dans la police courante. */
function unWinAnsi(c) {
  if (c.codePointAt(0) < 256) return c;
  return WINANSI[c] || '?';
}

/**
 * Decoupe une chaine en segments homogenes : une police par segment, la police
 * par defaut (null) etant Helvetica.
 */
function segments(s) {
  const out = [];
  let courant = null;
  for (const c of String(s == null ? '' : s)) {
    const spe = SPECIAUX[c];
    const police = spe ? spe[0] : null;
    if (!courant || courant.police !== police) {
      courant = { police, t: '' };
      out.push(courant);
    }
    courant.t += spe ? spe[1] : unWinAnsi(c);
  }
  return out;
}

export function creerPage(largeur, hauteur) {
  const ops = [];
  const H = hauteur;

  const api = {
    largeur, hauteur,

    /** Texte. y est la LIGNE DE BASE, comptee depuis le HAUT de la page. */
    texte(s, x, y, taille, gras, couleur) {
      if (s === undefined || s === null || String(s).trim() === '') return api;
      return api.suite([{ t: s, taille, gras, couleur }], x, y);
    },

    /**
     * Plusieurs morceaux a la suite sur une meme ligne de base, chacun avec sa
     * taille, sa graisse et sa couleur. Comme la position avance toute seule
     * apres chaque Tj, les morceaux se collent exactement comme le ferait un
     * drawText decale de measureText cote Android : aucune largeur a mesurer.
     */
    suite(morceaux, x, y) {
      const utiles = morceaux.filter(
        (m) => m && m.t !== undefined && m.t !== null && String(m.t) !== '');
      if (!utiles.length) return api;
      const lignes = ['q', 'BT',
        '1 0 0 1 ' + x.toFixed(2) + ' ' + (H - y).toFixed(2) + ' Tm'];
      let policeCourante = null;
      let couleurCourante = null;
      utiles.forEach((m) => {
        const taille = m.taille || 10;
        const c = (m.couleur || [0, 0, 0]).join(' ');
        if (c !== couleurCourante) { lignes.push(c + ' rg'); couleurCourante = c; }
        segments(m.t).forEach((seg) => {
          const nom = seg.police || (m.gras ? 'FB' : 'FR');
          const cle = nom + ' ' + taille;
          if (cle !== policeCourante) {
            lignes.push('/' + nom + ' ' + taille + ' Tf');
            policeCourante = cle;
          }
          lignes.push('(' + esc(seg.t) + ') Tj');
        });
      });
      lignes.push('ET', 'Q');
      ops.push(...lignes);
      return api;
    },

    /**
     * Part de camembert : un secteur plein, angles en degres, 0 = est et sens
     * horaire, comme Canvas.drawArc cote Android. L'arc est approche par des
     * courbes de Bezier de 90 degres au plus, l'erreur y est indecelable.
     */
    secteur(cx, cy, rayon, debut, balayage, couleur) {
      if (!balayage) return api;
      const c = couleur || [0, 0, 0];
      const rad = (a) => a * Math.PI / 180;
      const px = (a) => cx + rayon * Math.cos(rad(a));
      const py = (a) => H - (cy + rayon * Math.sin(rad(a)));
      const morceaux = Math.max(1, Math.ceil(Math.abs(balayage) / 90));
      const pas = balayage / morceaux;
      const k = 4 / 3 * Math.tan(rad(pas) / 4);

      const l = ['q', c.join(' ') + ' rg',
        cx.toFixed(2) + ' ' + (H - cy).toFixed(2) + ' m',
        px(debut).toFixed(2) + ' ' + py(debut).toFixed(2) + ' l'];
      let a = debut;
      for (let i = 0; i < morceaux; i++) {
        const b = a + pas;
        // Tangentes aux extremites, mises a l'echelle du facteur de Bezier.
        const c1x = px(a) - k * rayon * Math.sin(rad(a));
        const c1y = py(a) - k * rayon * Math.cos(rad(a));
        const c2x = px(b) + k * rayon * Math.sin(rad(b));
        const c2y = py(b) + k * rayon * Math.cos(rad(b));
        l.push(c1x.toFixed(2) + ' ' + c1y.toFixed(2) + ' '
             + c2x.toFixed(2) + ' ' + c2y.toFixed(2) + ' '
             + px(b).toFixed(2) + ' ' + py(b).toFixed(2) + ' c');
        a = b;
      }
      l.push('h', 'f', 'Q');
      ops.push(...l);
      return api;
    },

    trait(x0, y0, x1, y1, epaisseur, couleur) {
      const c = couleur || [0, 0, 0];
      ops.push('q', c.join(' ') + ' RG', (epaisseur || 0.6) + ' w',
        x0.toFixed(2) + ' ' + (H - y0).toFixed(2) + ' m',
        x1.toFixed(2) + ' ' + (H - y1).toFixed(2) + ' l', 'S', 'Q');
      return api;
    },

    cadre(x0, y0, x1, y1, epaisseur, couleur) {
      const c = couleur || [0, 0, 0];
      ops.push('q', c.join(' ') + ' RG', (epaisseur || 0.6) + ' w',
        x0.toFixed(2) + ' ' + (H - y1).toFixed(2) + ' '
        + (x1 - x0).toFixed(2) + ' ' + (y1 - y0).toFixed(2) + ' re', 'S', 'Q');
      return api;
    },

    rempli(x0, y0, x1, y1, couleur) {
      const c = couleur || [0, 0, 0];
      ops.push('q', c.join(' ') + ' rg',
        x0.toFixed(2) + ' ' + (H - y1).toFixed(2) + ' '
        + (x1 - x0).toFixed(2) + ' ' + (y1 - y0).toFixed(2) + ' re', 'f', 'Q');
      return api;
    },

    /** Croix d'une case a cocher. */
    croix(x, y, cote) {
      const t = cote || 7;
      api.trait(x + 1, y + 1, x + t - 1, y + t - 1, 1.1);
      api.trait(x + 1, y + t - 1, x + t - 1, y + 1, 1.1);
      return api;
    },

    /**
     * Signature : traces etires dans la case en conservant leurs proportions,
     * comme drawFit cote Android.
     */
    signature(traces, x0, y0, x1, y1, epaisseur) {
      if (!traces || !traces.length) return api;
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      traces.forEach((t) => t.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }));
      const li = Math.max(1e-6, maxX - minX);
      const ha = Math.max(1e-6, maxY - minY);
      const ech = Math.min((x1 - x0) / li, (y1 - y0) / ha);
      const dx = x0 + ((x1 - x0) - li * ech) / 2;
      const dy = y0 + ((y1 - y0) - ha * ech) / 2;

      ops.push('q', '0 0 0 RG', (epaisseur || 1.1) + ' w', '1 J', '1 j');
      traces.forEach((t) => {
        if (!t.length) return;
        t.forEach((p, i) => {
          const X = dx + (p.x - minX) * ech;
          const Y = H - (dy + (p.y - minY) * ech);
          ops.push(X.toFixed(2) + ' ' + Y.toFixed(2) + ' ' + (i ? 'l' : 'm'));
        });
        ops.push('S');
      });
      ops.push('Q');
      return api;
    },

    flux() { return ops.join('\n'); },
  };
  return api;
}

/** Assemble les pages en un fichier PDF complet. */
export function construire(pages) {
  const objets = [];
  const ajouter = (contenu) => { objets.push(contenu); return objets.length; };

  const idPages = 2;
  const idPolice = 3;
  const idGras = 4;
  const idSymbole = 5;
  const idPicto = 6;

  ajouter('<< /Type /Catalog /Pages ' + idPages + ' 0 R >>');
  ajouter('');   // renseigne plus bas, une fois les pages numerotees
  ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica '
        + '/Encoding /WinAnsiEncoding >>');
  ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold '
        + '/Encoding /WinAnsiEncoding >>');
  // Symbol et ZapfDingbats font partie des 14 polices que tout lecteur PDF
  // possede : les glyphes hors WinAnsi passent par elles, sans rien embarquer.
  // Les codes A/B/C sont relies au glyphe par /Differences, donc l'encodage
  // natif de ces polices n'entre pas en jeu.
  ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Symbol /Encoding '
        + '<< /Type /Encoding /Differences [65 /lessequal /greaterequal '
        + '/arrowright] >> >>');
  // a19 et a23 sont les glyphes d'Unicode 2713 et 2717, ceux qu'affiche
  // l'Android ; a20 et a24 en sont les variantes grasses (verifie a l'ecran).
  ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats /Encoding '
        + '<< /Type /Encoding /Differences [65 /a19 /a23] >> >>');

  const idsPages = [];
  pages.forEach((p) => {
    const flux = p.flux();
    const idFlux = ajouter('<< /Length ' + flux.length + ' >>\nstream\n'
                         + flux + '\nendstream');
    idsPages.push(ajouter('<< /Type /Page /Parent ' + idPages + ' 0 R '
      + '/MediaBox [0 0 ' + p.largeur + ' ' + p.hauteur + '] '
      + '/Resources << /Font << /FR ' + idPolice + ' 0 R /FB ' + idGras
      + ' 0 R /FS ' + idSymbole + ' 0 R /FD ' + idPicto
      + ' 0 R >> >> /Contents ' + idFlux + ' 0 R >>'));
  });

  objets[idPages - 1] = '<< /Type /Pages /Count ' + pages.length + ' /Kids ['
    + idsPages.map((i) => i + ' 0 R').join(' ') + '] >>';

  let pdf = '%PDF-1.4\n';
  const decalages = [];
  objets.forEach((o, i) => {
    decalages.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
  });
  const debutXref = pdf.length;
  pdf += 'xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n';
  decalages.forEach((d) => { pdf += String(d).padStart(10, '0') + ' 00000 n \n'; });
  pdf += 'trailer\n<< /Size ' + (objets.length + 1) + ' /Root 1 0 R >>\n'
       + 'startxref\n' + debutXref + '\n%%EOF';

  // Octets ecrits tels quels : un encodage UTF-8 decalerait les positions
  // notees dans la table xref et le fichier deviendrait illisible.
  const octets = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) octets[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([octets], { type: 'application/pdf' });
}
