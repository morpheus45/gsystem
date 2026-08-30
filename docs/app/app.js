/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

import { GROUPES, TUILES } from './tuiles.js';

/** Numeros appeles par les tuiles - identiques a l'application Android. */
const TEL_TECHLINE = '0388398894';
const TEL_LOGISTIQUE = '0369740780';

const $ = (s) => document.querySelector(s);
let ongletActif = 'SITE';

/** Dessine les onglets et la pile de tuiles du groupe selectionne. */
function rendre() {
  $('#onglets').innerHTML = GROUPES.map((g) => `
    <button class="onglet" role="tab" data-groupe="${g.id}"
            aria-selected="${g.id === ongletActif}"
            style="${g.id === ongletActif ? 'background:' + g.barre : ''}">
      <span class="ic">${g.ic}</span><span>${g.onglet}</span>
    </button>`).join('');

  const g = GROUPES.find((x) => x.id === ongletActif);
  const liste = TUILES.filter((t) => t.groupe === ongletActif);

  $('#groupe').innerHTML = `
    <span class="barre" style="background:${g.barre}"></span>
    <span><div class="titre" style="color:${g.barre}">${g.titre}</div>
    <div class="desc">${g.desc} &middot; ${liste.length} actions</div></span>`;

  $('#tuiles').innerHTML = liste.map((t) => `
    <button class="tuile" data-ecran="${t.ecran}"
            style="background:linear-gradient(135deg,${t.debut},${t.fin})">
      <span class="num">${t.num}</span>
      <span class="rond">${t.ic}</span>
      <span class="txt"><div class="nom">${t.nom}</div>
      <div class="sous">${t.sous}</div></span>
    </button>`).join('');
}

/** Appui sur une tuile : les appels marchent deja, le reste arrive. */
function ouvrir(ecran) {
  if (ecran === 'techline') { location.href = 'tel:' + TEL_TECHLINE; return; }
  if (ecran === 'logistique') { location.href = 'tel:' + TEL_LOGISTIQUE; return; }
  const t = TUILES.find((x) => x.ecran === ecran);
  alert('\u00ab ' + t.nom + ' \u00bb n\'est pas encore disponible sur iPhone.'
      + '\n\nCet ecran arrive dans une prochaine etape.');
}

document.addEventListener('click', (e) => {
  const onglet = e.target.closest('.onglet');
  if (onglet) { ongletActif = onglet.dataset.groupe; rendre(); return; }
  const tuile = e.target.closest('.tuile');
  if (tuile) { ouvrir(tuile.dataset.ecran); return; }
  const fermer = e.target.closest('.fermer');
  if (fermer) {
    localStorage.setItem('installMasque', '1');
    const bloc = fermer.closest('.install');
    if (bloc) bloc.remove();
  }
});

// Le conseil d'installation n'a de sens que dans Safari, avant installation.
const installee = window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;
if (installee || localStorage.getItem('installMasque')) {
  const bloc = $('#install');
  if (bloc) bloc.remove();
}

/** Pastille d'etat : verte des que le telephone a du reseau. */
function majReseau() {
  const p = $('#pastille'); const e = $('#etat');
  if (!p || !e) return;
  p.classList.toggle('ok', navigator.onLine);
  e.textContent = navigator.onLine ? 'OP\u00c9RATIONNEL' : 'HORS LIGNE';
}
window.addEventListener('online', majReseau);
window.addEventListener('offline', majReseau);

majReseau();
rendre();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
