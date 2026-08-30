/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

import { GROUPES, TUILES } from './tuiles.js';
import { lireReglages, ecrireReglages, reglagesComplets, heureDe } from './donnees.js';
import { messageAttente, RAPPEL_ATTENTE, partager } from './viber.js';

/** Numeros appeles par les tuiles - identiques a l'application Android. */
const TEL_TECHLINE = '0388398894';
const TEL_LOGISTIQUE = '0369740780';

const $ = (s) => document.querySelector(s);
const app = () => $('#app');

let ongletActif = 'SITE';
let ecran = 'accueil';
let reglages = lireReglages();

const echapper = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toast(texte, duree) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duree || 3200);
}

// --------------------------------------------------------------- Accueil
function vueAccueil() {
  const enAttente = reglages.pendingArrivalMs > 0;
  const heure = enAttente ? heureDe(reglages.pendingArrivalMs) : '';

  const onglets = GROUPES.map((g) => `
    <button class="onglet" role="tab" data-groupe="${g.id}"
            aria-selected="${g.id === ongletActif}"
            style="${g.id === ongletActif ? 'background:' + g.barre : ''}">
      <span class="ic">${g.ic}</span><span>${g.onglet}</span>
    </button>`).join('');

  const g = GROUPES.find((x) => x.id === ongletActif);
  const liste = TUILES.filter((t) => t.groupe === ongletActif);

  const tuiles = liste.map((t) => {
    // Comme sur Android : une fois l'arrivee pointee, la tuile d'origine
    // devient CLOTURER et rappelle l'heure notee.
    const bascule = enAttente && t.ecran === reglages.pendingArrivalSource;
    const nom = bascule ? 'CLÔTURER' : t.nom;
    const sous = bascule
      ? 'Arrivée ' + heure + ' · ouvrir une intervention' : t.sous;
    const debut = bascule ? '#7C3AED' : t.debut;
    const fin = bascule ? '#1A0B36' : t.fin;
    const ic = bascule ? '\u{1F4CB}' : t.ic;
    return `
      <button class="tuile" data-ecran="${bascule ? 'cloture' : t.ecran}"
              style="background:linear-gradient(135deg,${debut},${fin})">
        <span class="num">${t.num}</span>
        <span class="rond">${ic}</span>
        <span class="txt"><div class="nom">${nom}</div>
        <div class="sous">${sous}</div></span>
      </button>`;
  }).join('');

  const nom = reglages.nomUtilisateur
    ? ' \u00b7 ' + echapper(reglages.nomUtilisateur) : '';

  return `
  <header class="entete">
    <div>
      <div class="marque"><span class="g">g</span>systems</div>
      <div class="sous-marque">
        <span class="pastille ${navigator.onLine ? 'ok' : ''}"></span>
        <span>${navigator.onLine ? 'OP\u00c9RATIONNEL' : 'HORS LIGNE'}${nom}</span>
      </div>
    </div>
    <button class="reglage-btn" data-va="reglages" title="R\u00e9glages">\u2699</button>
  </header>

  ${enAttente ? '<div class="bandeau-nr">ARRIV\u00c9E NOT\u00c9E \u00c0 ' + heure
      + ' \u00b7 \u00e0 cl\u00f4turer</div>' : ''}

  <nav class="onglets" role="tablist">${onglets}</nav>
  <div class="groupe">
    <span class="barre" style="background:${g.barre}"></span>
    <span><div class="titre" style="color:${g.barre}">${g.titre}</div>
    <div class="desc">${g.desc} &middot; ${liste.length} actions</div></span>
  </div>
  <main class="tuiles">${tuiles}</main>`;
}

// -------------------------------------------------------------- Reglages
function champ(id, label, valeur, aide, requis, type) {
  return `
    <div class="champ ${requis ? 'requis' : ''}">
      <label for="${id}">${label}</label>
      <input id="${id}" type="${type || 'text'}" value="${echapper(valeur)}" />
      ${aide ? '<div class="aide">' + aide + '</div>' : ''}
    </div>`;
}

function vueReglages() {
  const r = reglages;
  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#3B82F6,#06B6D4)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">R\u00c9GLAGES</span>
  </div>
  <div class="form">
    <div class="note">Ces informations partent dans les messages et les mails.
      Les champs marqu\u00e9s d'une \u00e9toile sont indispensables : sans eux,
      l'accueil reste bloqu\u00e9 ici.</div>

    ${champ('r_nom', 'Nom du technicien', r.nomUtilisateur,
            'Signature des mails, affich\u00e9 sous l\'accueil.', true)}
    ${champ('r_code', 'Code technicien', r.siteCodeFixe,
            'Pr\u00e9fixe des sujets GSM SEUL et GESTE CO.', true)}
    ${champ('r_resp', 'Email du responsable de secteur', r.emailEpsCc2,
            'En copie des envois EPS, avec Johanna et le secr\u00e9tariat.', true, 'email')}
    ${champ('r_moi', 'Votre email personnel', r.emailMoi,
            'Vous recevez une copie de l\'envoi mensuel.', false, 'email')}
    ${champ('r_dept', 'D\u00e9partement par d\u00e9faut', r.departementDefaut, '', false)}
    ${champ('r_plaque', 'Plaque du v\u00e9hicule', r.plaqueVoiture,
            'Nomme les photos du compteur.', false)}
    ${champ('r_cycle', 'Jour de d\u00e9but de cycle', r.cycleStartDay,
            '21 par d\u00e9faut.', false, 'number')}

    <button class="btn" id="enregistrer"
            style="background:linear-gradient(135deg,#3B82F6,#06B6D4)">Enregistrer</button>
  </div>`;
}

// ------------------------------------------------------------------ Rendu
function rendre() {
  app().innerHTML = ecran === 'reglages' ? vueReglages() : vueAccueil();
  window.scrollTo(0, 0);
}

function aller(ou) { ecran = ou; rendre(); }

// ---------------------------------------------------------------- Actions
/** Pointe l'heure d'arrivee, sans jamais ecraser un pointage deja en cours. */
function pointerArrivee(source) {
  if (reglages.pendingArrivalMs > 0) {
    toast('Une arriv\u00e9e est d\u00e9j\u00e0 not\u00e9e \u00e0 '
        + heureDe(reglages.pendingArrivalMs) + '.');
    return false;
  }
  reglages.pendingArrivalMs = Date.now();
  reglages.pendingArrivalSource = source;
  ecrireReglages(reglages);
  return true;
}

async function ouvrir(cible) {
  if (cible === 'techline') { location.href = 'tel:' + TEL_TECHLINE; return; }
  if (cible === 'logistique') { location.href = 'tel:' + TEL_LOGISTIQUE; return; }

  if (cible === 'arrivee') {
    const pointe = pointerArrivee('arrivee');
    rendre();
    if (pointe) {
      toast('Arriv\u00e9e not\u00e9e \u00e0 ' + heureDe(reglages.pendingArrivalMs)
          + ' \u00b7 appel de la techline\u2026');
      setTimeout(() => { location.href = 'tel:' + TEL_TECHLINE; }, 900);
    }
    return;
  }

  if (cible === 'attente') {
    // Note l'heure sans envoyer de Viber automatique, comme sur Android.
    const pointe = pointerArrivee('attente');
    rendre();
    const r = await partager(messageAttente());
    toast(r === 'copie' ? 'Message copi\u00e9. ' + RAPPEL_ATTENTE : RAPPEL_ATTENTE, 6500);
    return;
  }

  if (cible === 'courrier') {
    const r = await partager('courrier ok');
    if (r === 'copie') toast('\u00ab courrier ok \u00bb copi\u00e9 : collez-le dans Viber.');
    return;
  }

  const t = TUILES.find((x) => x.ecran === cible);
  toast('\u00ab ' + (t ? t.nom : cible) + ' \u00bb arrive dans une prochaine \u00e9tape.');
}

// ---------------------------------------------------------- Interactions
document.addEventListener('click', (e) => {
  const va = e.target.closest('[data-va]');
  if (va) { aller(va.dataset.va); return; }

  const onglet = e.target.closest('.onglet');
  if (onglet) { ongletActif = onglet.dataset.groupe; rendre(); return; }

  const tuile = e.target.closest('.tuile');
  if (tuile) { ouvrir(tuile.dataset.ecran); return; }

  if (e.target.closest('#enregistrer')) {
    reglages = Object.assign({}, reglages, {
      nomUtilisateur: $('#r_nom').value.trim(),
      siteCodeFixe: $('#r_code').value.trim(),
      emailEpsCc2: $('#r_resp').value.trim(),
      emailMoi: $('#r_moi').value.trim(),
      departementDefaut: $('#r_dept').value.trim() || '34',
      plaqueVoiture: $('#r_plaque').value.trim(),
      cycleStartDay: Number($('#r_cycle').value) || 21,
    });
    ecrireReglages(reglages);
    if (!reglagesComplets(reglages)) {
      toast('Il manque le nom, le code technicien ou l\'email du responsable.');
      return;
    }
    toast('R\u00e9glages enregistr\u00e9s.');
    aller('accueil');
  }
});

window.addEventListener('online', rendre);
window.addEventListener('offline', rendre);

// Premier lancement : on demande les reglages avant tout, comme sur Android.
ecran = reglagesComplets(reglages) ? 'accueil' : 'reglages';
rendre();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
