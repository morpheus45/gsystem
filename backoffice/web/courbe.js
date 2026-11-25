// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).

/**
 * Arrondit un nombre à 2 décimales.
 * @param {number} n
 * @returns {number}
 */
function r2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Construit un chemin SVG lissé (courbes cubiques monotones, méthode Fritsch-Carlson)
 * passant par tous les points donnés, sans dépassement entre deux points consécutifs.
 *
 * @param {{ x: number, y: number }[]} points - Points triés par x croissant.
 * @returns {string} Chemin SVG : '' si 0 point, 'M x y' si 1 point, courbe sinon.
 */
export function cheminLisse(points) {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${r2(points[0].x)} ${r2(points[0].y)}`;
  if (n === 2) {
    return `M ${r2(points[0].x)} ${r2(points[0].y)} L ${r2(points[1].x)} ${r2(points[1].y)}`;
  }

  // Étape 1 : pentes des cordes entre points consécutifs
  const delta = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    // dx peut être 0 si deux points ont le même x (protection division par zéro)
    delta.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }

  // Étape 2 : pentes initiales aux points (différences finies centrées)
  const m = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = (delta[i - 1] + delta[i]) / 2;
  }

  // Étape 3 : ajustement Fritsch-Carlson pour garantir la monotonie
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      // Segment plat : les pentes aux deux extrémités du segment sont nulles
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / delta[i];
    const beta  = m[i + 1] / delta[i];
    // Si le vecteur (alpha, beta) est hors du disque de rayon 3, on le ramène
    const norme = Math.sqrt(alpha * alpha + beta * beta);
    if (norme > 3) {
      const tau = 3 / norme;
      m[i]     = tau * alpha * delta[i];
      m[i + 1] = tau * beta  * delta[i];
    }
  }

  // Étape 4 : construction des points de contrôle Bézier cubiques
  // Pour chaque segment [i, i+1] de longueur dx :
  //   CP1 = (x[i] + dx/3, y[i] + m[i]*dx/3)
  //   CP2 = (x[i+1] - dx/3, y[i+1] - m[i+1]*dx/3)
  let chemin = `M ${r2(points[0].x)} ${r2(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const cp1x = r2(points[i].x + dx / 3);
    const cp1y = r2(points[i].y + m[i] * dx / 3);
    const cp2x = r2(points[i + 1].x - dx / 3);
    const cp2y = r2(points[i + 1].y - m[i + 1] * dx / 3);
    const ex   = r2(points[i + 1].x);
    const ey   = r2(points[i + 1].y);
    chemin += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${ex} ${ey}`;
  }
  return chemin;
}

/**
 * Construit un chemin SVG fermé pour remplir l'aire sous la courbe lissée.
 *
 * @param {{ x: number, y: number }[]} points - Points triés par x croissant.
 * @param {number} basY - Ordonnée de la base (axe horizontal).
 * @returns {string} Chemin SVG ou '' si moins de 2 points.
 */
export function cheminAire(points, basY) {
  if (points.length < 2) return '';
  const x0 = r2(points[0].x);
  const xn = r2(points[points.length - 1].x);
  const by = r2(basY);
  return `${cheminLisse(points)} L ${xn} ${by} L ${x0} ${by} Z`;
}

/**
 * Calcule les coordonnées pixel de chaque valeur dans un rectangle SVG.
 *
 * x réparti uniformément de `marge` à `largeur − marge`.
 * y : 0 → `hauteur − marge`, max → `marge` (axe SVG inversé).
 * max = Math.max(1, ...valeurs) pour éviter la division par zéro.
 *
 * @param {number[]} valeurs - Tableau de valeurs numériques.
 * @param {number} largeur
 * @param {number} hauteur
 * @param {number} marge
 * @returns {{ x: number, y: number }[]}
 */
export function echelle(valeurs, largeur, hauteur, marge) {
  const n = valeurs.length;
  if (n === 0) return [];
  const max = Math.max(1, ...valeurs);
  const plageX = largeur - 2 * marge;
  const plageY = hauteur - 2 * marge;
  return valeurs.map((v, i) => ({
    x: marge + (n === 1 ? plageX / 2 : plageX * i / (n - 1)),
    y: hauteur - marge - (plageY * v / max),
  }));
}

// ─── Helpers DOM protégés (Node.js ne fournit pas de DOM) ───────────────────

/**
 * Crée un élément SVG (namespace XML).
 * @param {string} tag
 * @returns {Element}
 */
function svgEl(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

/**
 * Crée un élément HTML ordinaire.
 * @param {string} tag
 * @returns {Element}
 */
function el(tag) {
  return document.createElement(tag);
}

/**
 * Construit l'élément <figure class="courbe"> contenant le SVG et la légende.
 *
 * @param {{
 *   titre: string,
 *   series: { nom: string, valeurs: number[], classe: string }[],
 *   etiquettes: string[],
 *   largeur?: number,
 *   hauteur?: number,
 * }} options
 * @returns {HTMLElement} <figure>
 */
export function courbe({ titre, series, etiquettes, largeur = 640, hauteur = 220 }) {
  const marge = 24;
  const basY  = hauteur - marge;

  // ── Aria-label ─────────────────────────────────────────────────────────────
  const ariaLabel = libelleAria(titre, series);

  // ── SVG ────────────────────────────────────────────────────────────────────
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${largeur} ${hauteur}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', ariaLabel);

  series.forEach((serie, idx) => {
    const pts    = echelle(serie.valeurs, largeur, hauteur, marge);
    const chemin = cheminLisse(pts);
    const aire   = cheminAire(pts, basY);

    if (idx === 0) {
      // Chemin d'aire (remplissage sous la courbe)
      const pAire = svgEl('path');
      pAire.setAttribute('class', 'aire');
      pAire.setAttribute('d', aire);
      pAire.style.d = `path("${aire}")`;
      svg.appendChild(pAire);
    }

    // Chemin de ligne
    const pLigne = svgEl('path');
    pLigne.setAttribute('class', `ligne ${serie.classe}`);
    pLigne.setAttribute('d', chemin);
    pLigne.style.d = `path("${chemin}")`;
    svg.appendChild(pLigne);
  });

  // ── Étiquettes sous l'axe ──────────────────────────────────────────────────
  if (etiquettes && etiquettes.length > 0 && series.length > 0) {
    const pts = echelle(series[0].valeurs, largeur, hauteur, marge);
    etiquettes.forEach((lib, i) => {
      if (i >= pts.length) return;
      const t = svgEl('text');
      t.setAttribute('class', 'etiquette');
      t.setAttribute('x', String(r2(pts[i].x)));
      t.setAttribute('y', String(r2(hauteur - 4)));
      t.setAttribute('text-anchor', 'middle');
      t.textContent = lib;
      svg.appendChild(t);
    });
  }

  // ── Figure ─────────────────────────────────────────────────────────────────
  const figure = el('figure');
  figure.setAttribute('class', 'courbe');
  figure.appendChild(svg);

  // ── Légende ────────────────────────────────────────────────────────────────
  const ul = el('ul');
  ul.setAttribute('class', 'legende');
  series.forEach(serie => {
    const li    = el('li');
    const puce  = el('span');
    puce.setAttribute('class', `puce ${serie.classe}`);
    const nom = el('span');
    nom.textContent = serie.nom;
    li.appendChild(puce);
    li.appendChild(nom);
    ul.appendChild(li);
  });
  figure.appendChild(ul);

  return figure;
}

/** Libellé lu par les lecteurs d'écran : le titre, puis la dernière valeur de chaque série. */
function libelleAria(titre, series) {
  return `${titre} : ${series.map((s) => `${s.nom} ${s.valeurs.length ? s.valeurs[s.valeurs.length - 1] : 0}`).join(', ')}`;
}

/**
 * Met à jour les chemins existants d'une figure déjà créée par `courbe`.
 * Si le nombre de points change, reconstruit les chemins sans transition CSS.
 *
 * @param {HTMLElement} figure - Élément <figure> renvoyé par `courbe`.
 * @param {{ nom: string, valeurs: number[], classe: string }[]} series
 * @param {string[]} etiquettes
 */
export function majCourbe(figure, series, etiquettes) {
  const svg = figure.querySelector('svg');
  if (!svg) return;

  const largeur = 640;
  const hauteur = 220;
  const marge   = 24;
  const basY    = hauteur - marge;

  // Lire le viewBox pour les dimensions réelles si présent
  const vb = svg.getAttribute('viewBox');
  let larg = largeur, haut = hauteur;
  if (vb) {
    const parts = vb.trim().split(/\s+/);
    if (parts.length === 4) {
      larg = parseFloat(parts[2]) || largeur;
      haut = parseFloat(parts[3]) || hauteur;
    }
  }

  // Chemins existants (ordre : aire[0], ligne[0], ligne[1], ligne[2]…)
  const pAire  = svg.querySelector('path.aire');
  const lignes = Array.from(svg.querySelectorAll('path[class^="ligne"], path[class*=" ligne"]'));

  series.forEach((serie, idx) => {
    const pts    = echelle(serie.valeurs, larg, haut, marge);
    const chemin = cheminLisse(pts);
    const aire   = cheminAire(pts, haut - marge);

    // Détecter un changement de nombre de points (transition désactivée)
    const ligne = lignes[idx];
    let rechanger = false;
    if (ligne) {
      const ancienD = ligne.getAttribute('d') || '';
      // Compte les segments M/L/C dans l'ancien chemin
      const ancienN = (ancienD.match(/[MLC]/g) || []).length;
      const nouveauN = (chemin.match(/[MLC]/g) || []).length;
      rechanger = ancienN !== nouveauN;
    }

    if (rechanger) {
      // Reconstruction sans transition : retirer et recréer les éléments
      if (pAire && idx === 0) {
        pAire.removeAttribute('style');
        pAire.setAttribute('d', aire);
        // Pas de style.d → pas de transition CSS sur « d »
      }
      if (ligne) {
        ligne.removeAttribute('style');
        ligne.setAttribute('d', chemin);
      }
    } else {
      if (pAire && idx === 0) {
        pAire.setAttribute('d', aire);
        pAire.style.d = `path("${aire}")`;
      }
      if (ligne) {
        ligne.setAttribute('d', chemin);
        ligne.style.d = `path("${chemin}")`;
      }
    }
  });

  // Le libellé suit les nouvelles valeurs (le titre, lui, ne change pas).
  svg.setAttribute('aria-label', libelleAria((svg.getAttribute('aria-label') || '').split(' : ')[0], series));

  // Mise à jour des étiquettes
  if (etiquettes && series.length > 0) {
    const textes = Array.from(svg.querySelectorAll('text.etiquette'));
    const pts = echelle(series[0].valeurs, larg, haut, marge);
    etiquettes.forEach((lib, i) => {
      if (i < textes.length) {
        textes[i].textContent = lib;
        if (i < pts.length) {
          textes[i].setAttribute('x', String(r2(pts[i].x)));
        }
      }
    });
  }
}
