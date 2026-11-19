// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Rendu « doux » du tableau de bord (RENDU.md) : chiffres qui défilent, anneaux, barres, avatars,
// arrivée des cartes, pastille du menu, mini-courbes. Affichage seulement : aucune donnée ici.
// Mouvement (skills animate / emil-design-eng) : transform et opacité, ease-out fort, rien si
// l'utilisateur a demandé de réduire les animations ; les chiffres ne redéfilent que s'ils changent.
import { cheminLisse, echelle } from './courbe.js';

const SVG = 'http://www.w3.org/2000/svg';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

export const reduireAnimations = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Applique l'état final au cadre suivant, pour que la transition CSS parte de l'état initial.
const ensuite = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

// ---- Chiffres qui défilent (référence : compteur.js, une bande 0-9 par chiffre) ----

export function morceauxCompteur(texte) {
  const morceaux = [];
  // Espaces insécables : dans la boîte flex du compteur, un espace ordinaire en tête de morceau
  // est effacé à l'affichage (« 4,3% » au lieu de « 4,3 % »).
  for (const c of String(texte ?? '').replace(/ /g, ' ')) {
    if (c >= '0' && c <= '9') morceaux.push({ chiffre: Number(c) });
    else if (morceaux.length && 'texte' in morceaux[morceaux.length - 1]) morceaux[morceaux.length - 1].texte += c;
    else morceaux.push({ texte: c });
  }
  return morceaux;
}

export function compteur(el, texte, animer) {
  el.classList.add('compteur');
  const lu = document.createElement('span');
  lu.className = 'lecteur-seul';        // la valeur reste lisible par les lecteurs d'écran
  lu.textContent = texte;
  const bouger = animer && !reduireAnimations();
  let rang = 0;
  const morceaux = morceauxCompteur(texte).map((m) => {
    const s = document.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    if ('texte' in m) { s.textContent = m.texte; return s; }
    s.className = 'chiffre';
    const bande = s.appendChild(document.createElement('span'));
    bande.className = 'bande';
    for (let i = 0; i < 20; i++) bande.appendChild(document.createElement('span')).textContent = String(i % 10);
    const fin = `translateY(${-(10 + m.chiffre) * 5}%)`;   // 20 chiffres : un cran = 5 % de la bande
    if (bouger) {
      bande.style.transform = 'translateY(0%)';
      bande.style.transitionDelay = `${rang * 45}ms`;
      ensuite(() => { bande.style.transform = fin; });
    } else bande.style.transform = fin;
    rang++;
    return s;
  });
  el.replaceChildren(lu, ...morceaux);
}

// ---- Avatars en pastilles brillantes ----

export const PALETTE_AVATARS = [['#ff8a7a', '#e6001c'], ['#ffb27a', '#e8590c'], ['#ff9fb4', '#d6336c'],
  ['#ffd07a', '#c77d00'], ['#b9a3ff', '#7048e8'], ['#8fc4ff', '#1c7ed6'], ['#7fdcb7', '#0c8a5f']];

export function initiales(nom) {
  const mots = String(nom ?? '').trim().split(/[\s-]+/).filter(Boolean);
  if (!mots.length) return '?';
  return (mots.length === 1 ? mots[0].slice(0, 2) : mots[0][0] + mots[1][0]).toUpperCase();
}

export function avatarCouleurs(nom) {
  let somme = 0;
  for (const c of String(nom ?? '')) somme += c.codePointAt(0);
  return PALETTE_AVATARS[somme % PALETTE_AVATARS.length];
}

export function avatar(nom) {
  const a = document.createElement('span');
  a.className = 'avatar';
  a.setAttribute('aria-hidden', 'true');   // décor : le nom est écrit à côté
  const [c1, c2] = avatarCouleurs(nom);
  a.style.setProperty('--c1', c1);
  a.style.setProperty('--c2', c2);
  a.textContent = initiales(nom);
  return a;
}

// ---- Anneaux (référence : stockage.js, strokeDashoffset) ----

function cercle(classe, r, centre) {
  const c = document.createElementNS(SVG, 'circle');
  c.setAttribute('class', classe);       // className est en lecture seule sur un élément SVG
  c.setAttribute('cx', centre); c.setAttribute('cy', centre); c.setAttribute('r', r);
  return c;
}

function remplir(plein, part, r, animer) {
  const C = 2 * Math.PI * r;
  const fin = C * (1 - Math.min(1, Math.max(0, part)));
  plein.style.strokeDasharray = `${C}`;
  if (animer && !reduireAnimations()) {
    plein.style.strokeDashoffset = `${C}`;
    ensuite(() => { plein.style.strokeDashoffset = `${fin}`; });
  } else plein.style.strokeDashoffset = `${fin}`;
}

export function anneau(part, animer) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'anneau');
  svg.setAttribute('viewBox', '0 0 52 52');
  svg.setAttribute('aria-hidden', 'true');
  svg.appendChild(cercle('fond', 23, 26));
  remplir(svg.appendChild(cercle('plein', 23, 26)), part, 23, animer);
  return svg;
}

// Pastilles réparties sur un cercle, la première en haut, dans le sens des aiguilles d'une montre.
export function positionsOrbite(n, rayon) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { x: Math.round(Math.sin(a) * rayon * 100) / 100 || 0, y: Math.round(-Math.cos(a) * rayon * 100) / 100 || 0 };
  });
}

// Grand anneau du bandeau entouré des pastilles des techniciens (référence HALO : « 68 % livré »).
export function orbite(conteneur, { part, valeur, libelle, noms, animer }) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'anneau-grand');
  svg.setAttribute('viewBox', '0 0 160 160');
  svg.appendChild(cercle('fond', 70, 80));
  remplir(svg.appendChild(cercle('plein', 70, 80)), part, 70, animer);
  const centre = document.createElement('div');
  centre.className = 'centre';
  const v = centre.appendChild(document.createElement('span'));
  v.className = 'valeur';
  compteur(v, valeur, animer);
  centre.appendChild(document.createElement('span')).textContent = libelle;
  const visibles = noms.slice(0, 8);   // au-delà, l'orbite devient illisible
  const pastilles = positionsOrbite(visibles.length, 46).map((p, i) => {
    const a = avatar(visibles[i]);
    a.style.left = `calc(50% + ${p.x}% - 17px)`;
    a.style.top = `calc(50% + ${p.y}% - 17px)`;
    a.title = visibles[i];
    return a;
  });
  conteneur.replaceChildren(svg, centre, ...pastilles);
}

// ---- Évolution par rapport au mois précédent, mini-courbe des 6 derniers mois ----

export function variation(actuel, precedent) {
  if (!precedent) return null;
  const p = Math.round(((actuel - precedent) / precedent) * 100);
  if (p === 0) return { texte: '0 %', sens: 'stable' };
  return { texte: `${p > 0 ? '+' : '−'}${Math.abs(p)} %`, sens: p > 0 ? 'hausse' : 'baisse' };
}

export function miniCourbe(valeurs) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'mini-courbe');
  svg.setAttribute('viewBox', '0 0 96 32');
  svg.setAttribute('aria-hidden', 'true');
  const chemin = svg.appendChild(document.createElementNS(SVG, 'path'));
  chemin.setAttribute('d', cheminLisse(echelle(valeurs, 96, 32, 3)));
  return svg;
}

// ---- Barres arrondies (référence : barre.animate scaleY) ----

export function barres(titre, lignes, animer) {
  const fig = document.createElement('figure');
  fig.className = 'barres';
  if (!lignes.length) {
    fig.appendChild(document.createElement('p')).className = 'vide';
    fig.lastChild.textContent = 'Aucune intervention ce mois-ci.';
    return fig;
  }
  fig.setAttribute('role', 'img');
  fig.setAttribute('aria-label', `${titre} : ${lignes.map((l) => `${l.libelle} ${l.n}`).join(', ')}`);
  const max = Math.max(...lignes.map((l) => l.n));
  const colonnes = fig.appendChild(document.createElement('div'));
  colonnes.className = 'colonnes';
  lignes.forEach((l, i) => {
    const col = colonnes.appendChild(document.createElement('div'));
    col.className = l.n === max && max > 0 ? 'col fort' : 'col';
    col.style.setProperty('--i', i);
    col.title = `${l.libelle} : ${l.n} (${Math.round(l.part * 100)} %)`;
    const zone = col.appendChild(document.createElement('div'));
    zone.className = 'zone';
    zone.appendChild(document.createElement('span')).className = 'val';
    zone.lastChild.textContent = l.n;
    const barre = zone.appendChild(document.createElement('span'));
    barre.className = 'barre';
    barre.style.setProperty('--h', `${max ? Math.round((l.n / max) * 100) : 0}%`);
    col.appendChild(document.createElement('span')).className = 'lib';
    col.lastChild.textContent = l.libelle;
  });
  if (animer && !reduireAnimations()) fig.classList.add('entre');
  return fig;
}

// ---- Arrivée des cartes en cascade (référence : ui.js ; durées raccourcies, RENDU.md) ----

export function entree(elements) {
  if (reduireAnimations()) return;
  elements.forEach((el, i) => el.animate([
    { opacity: 0, transform: 'perspective(1200px) rotateX(12deg) translateY(16px)', filter: 'blur(8px)' },
    { opacity: 1, transform: 'none', filter: 'blur(0px)' },
  ], { duration: 600, delay: i * 55, easing: EASE_OUT, fill: 'backwards' }));
}

// ---- Pastille blanche du menu qui glisse (référence : rail.css, léger rebond) ----

export function placerPastille(nav) {
  const p = nav?.querySelector('.rail-pastille');
  const a = nav?.querySelector('.tab.active');
  if (!p || !a || a.offsetParent === null) return;
  p.style.setProperty('--y', `${a.offsetTop}px`);
  p.style.setProperty('--h', `${a.offsetHeight}px`);
}

export function installerPastille(nav) {
  if (!nav || nav.querySelector('.rail-pastille')) return;
  const p = document.createElement('span');
  p.className = 'rail-pastille';
  p.setAttribute('aria-hidden', 'true');
  nav.prepend(p);
  nav.classList.add('avec-pastille');
  placerPastille(nav);
  addEventListener('resize', () => placerPastille(nav));
}
