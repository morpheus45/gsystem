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
// des coordonnees « ecran » (origine en haut) et on convertit a l'ecriture.

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
function versWinAnsi(s) {
  const table = {
    '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"',
    '\u2013': '-', '\u2014': '-', '\u20ac': '\u0080', '\u2026': '...',
    '\u0152': '\u008c', '\u0153': '\u009c', '\u2192': '->',
  };
  let out = '';
  for (const c of String(s == null ? '' : s)) {
    if (c.codePointAt(0) < 256) { out += c; continue; }
    out += table[c] || '?';
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
      const c = couleur || [0, 0, 0];
      ops.push('q', c.join(' ') + ' rg', 'BT',
        '/' + (gras ? 'FB' : 'FR') + ' ' + (taille || 10) + ' Tf',
        '1 0 0 1 ' + x.toFixed(2) + ' ' + (H - y).toFixed(2) + ' Tm',
        '(' + esc(versWinAnsi(s)) + ') Tj', 'ET', 'Q');
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

  ajouter('<< /Type /Catalog /Pages ' + idPages + ' 0 R >>');
  ajouter('');   // renseigne plus bas, une fois les pages numerotees
  ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica '
        + '/Encoding /WinAnsiEncoding >>');
  ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold '
        + '/Encoding /WinAnsiEncoding >>');

  const idsPages = [];
  pages.forEach((p) => {
    const flux = p.flux();
    const idFlux = ajouter('<< /Length ' + flux.length + ' >>\nstream\n'
                         + flux + '\nendstream');
    idsPages.push(ajouter('<< /Type /Page /Parent ' + idPages + ' 0 R '
      + '/MediaBox [0 0 ' + p.largeur + ' ' + p.hauteur + '] '
      + '/Resources << /Font << /FR ' + idPolice + ' 0 R /FB ' + idGras
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
