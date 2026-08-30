/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

import { GROUPES, TUILES } from './tuiles.js';
import {
  lireReglages, ecrireReglages, reglagesComplets, heureDe,
  lireEntrees, ecrireEntrees, aujourdhuiIso, idUnique,
} from './donnees.js';
import { messageCloture, messageAttente, RAPPEL_ATTENTE, partager } from './viber.js';
import { heuresDuJour, expliquerHeures } from './heures.js';
import {
  TYPES, TYPES_JOURNEE, OBSERVATIONS, MOTIFS_RETARD, entreeVide, manques,
} from './cloture.js';
import {
  CATEGORIES, htDepuisTtc, tvaDepuisTtc, remboursable, eur,
} from './frais.js';
import { photo, enregistrerPhoto, supprimerPhoto, reduire, nomTicket }
  from './photos.js';

const TEL_TECHLINE = '0388398894';
const TEL_LOGISTIQUE = '0369740780';

const $ = (s) => document.querySelector(s);
const app = () => $('#app');

let ongletActif = 'SITE';
let ecran = 'accueil';
let reglages = lireReglages();
let entrees = lireEntrees();
let brouillon = null;          // intervention en cours de saisie
let ticket = null;             // ticket de frais en cours de saisie

const ech = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toast(texte, duree) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duree || 3200);
}

/** jj/mm/aaaa pour l'affichage ; le stockage reste en ISO. */
function dateFr(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

// =========================================================== ACCUEIL
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
    const bascule = enAttente && t.ecran === reglages.pendingArrivalSource;
    const nom = bascule ? 'CL\u00d4TURER' : t.nom;
    const sous = bascule
      ? 'Arriv\u00e9e ' + heure + ' \u00b7 ouvrir une intervention' : t.sous;
    const debut = bascule ? '#7C3AED' : t.debut;
    const fin = bascule ? '#1A0B36' : t.fin;
    const ic = bascule ? '\u{1F4CB}' : t.ic;
    return `
      <button class="tuile" data-ecran="${bascule ? 'nouvelle' : t.ecran}"
              style="background:linear-gradient(135deg,${debut},${fin})">
        <span class="num">${t.num}</span>
        <span class="rond">${ic}</span>
        <span class="txt"><div class="nom">${nom}</div>
        <div class="sous">${sous}</div></span>
      </button>`;
  }).join('');

  const nom = reglages.nomUtilisateur ? ' \u00b7 ' + ech(reglages.nomUtilisateur) : '';
  const duJour = entrees.temps.filter((e) => e.date === aujourdhuiIso());
  const bandeau = enAttente
    ? '<div class="bandeau-nr">ARRIV\u00c9E NOT\u00c9E \u00c0 ' + heure
      + ' \u00b7 \u00e0 cl\u00f4turer</div>'
    : (duJour.length
        ? '<div class="bandeau-nr">' + duJour.length
          + ' intervention(s) aujourd\'hui \u00b7 ' + heuresDuJour(duJour) + 'h</div>'
        : '');

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
  ${bandeau}
  <nav class="onglets" role="tablist">${onglets}</nav>
  <div class="groupe">
    <span class="barre" style="background:${g.barre}"></span>
    <span><div class="titre" style="color:${g.barre}">${g.titre}</div>
    <div class="desc">${g.desc} &middot; ${liste.length} actions</div></span>
  </div>
  <main class="tuiles">${tuiles}</main>`;
}

// ========================================================== REGLAGES
function champ(id, label, valeur, aide, requis, type) {
  return `
    <div class="champ ${requis ? 'requis' : ''}">
      <label for="${id}">${label}</label>
      <input id="${id}" type="${type || 'text'}" value="${ech(valeur)}" />
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

// =========================================================== CLOTURE
function etiquette(e) {
  if (!e.observationType) return '<span class="etiquette ok">OK</span>';
  if (e.observationType === 'ANNULE') return '<span class="etiquette an">ANNUL\u00c9</span>';
  const o = OBSERVATIONS.find((x) => x[0] === e.observationType);
  return '<span class="etiquette nr">' + ech(o ? o[1] : 'NR') + '</span>';
}

function vueCloture() {
  const parJour = {};
  entrees.temps.forEach((e) => { (parJour[e.date] = parJour[e.date] || []).push(e); });
  const jours = Object.keys(parJour).sort().reverse();

  const corps = jours.length ? jours.map((d) => {
    const jour = parJour[d];
    return `
      <div class="jour"><span class="d">${dateFr(d)}</span>
        <span class="h">${heuresDuJour(jour)}h \u00b7 ${ech(expliquerHeures(jour))}</span></div>
      ${jour.map((e) => `
        <div class="ligne">
          <div class="corps">
            <div class="haut">${ech(e.typeMission)} \u00b7 ${ech(e.nomClient || '\u2014')}</div>
            <div class="bas">${ech(e.ville)} ${ech(e.departement)}
              ${e.numeroIntervention ? '\u00b7 n\u00b0 ' + ech(e.numeroIntervention) : ''}
              \u00b7 ${e.slotMidi === 'APREM' ? 'apr\u00e8s-midi' : 'matin'}</div>
          </div>
          ${etiquette(e)}
        </div>`).join('')}`;
  }).join('')
    : '<div class="vide">Aucune intervention enregistr\u00e9e.<br />'
      + 'Touchez \u00ab + Nouvelle \u00bb pour cl\u00f4turer la premi\u00e8re.</div>';

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#7C3AED,#1A0B36)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">CL\u00d4TURE</span>
  </div>
  <div class="form">${corps}</div>
  <button class="fab" data-va="nouvelle">+ Nouvelle</button>`;
}

function optionsHtml(paires, valeur) {
  return paires.map((p) => {
    const v = Array.isArray(p) ? p[0] : p;
    const l = Array.isArray(p) ? p[1] : p;
    return '<option value="' + ech(v) + '"'
      + (String(v) === String(valeur) ? ' selected' : '') + '>' + ech(l) + '</option>';
  }).join('');
}

function vueFormulaire() {
  const e = brouillon;
  const journee = TYPES_JOURNEE.indexOf(e.typeMission) >= 0;
  const bloc = journee
    ? '<div class="note">Journ\u00e9e enti\u00e8re : 7h, sans client ni num\u00e9ro '
      + '\u00e0 saisir.</div>'
    : `
    <div class="deux">
      <div class="champ requis"><label for="f_dept">D\u00e9partement</label>
        <input id="f_dept" value="${ech(e.departement)}" /></div>
      <div class="champ requis"><label for="f_num">N\u00b0 intervention</label>
        <input id="f_num" inputmode="numeric" value="${ech(e.numeroIntervention)}" /></div>
    </div>
    <div class="champ requis"><label for="f_client">Client</label>
      <input id="f_client" value="${ech(e.nomClient)}" /></div>
    <div class="champ requis"><label for="f_ville">Ville</label>
      <input id="f_ville" value="${ech(e.ville)}" /></div>`;

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#7C3AED,#1A0B36)">
    <button class="retour" data-va="cloture">\u2190</button>
    <span class="t">NOUVELLE INTERVENTION</span>
  </div>
  <div class="form">
    <div class="champ"><label for="f_date">Date</label>
      <input id="f_date" type="date" value="${ech(e.date)}" /></div>

    <div class="champ"><label for="f_type">Type de mission</label>
      <select id="f_type">${optionsHtml(TYPES, e.typeMission)}</select></div>

    <div class="champ"><label>Demi-journ\u00e9e</label>
      <div class="segment" id="f_slot">
        <button type="button" data-slot="MATIN"
          aria-pressed="${e.slotMidi === 'MATIN'}">Matin</button>
        <button type="button" data-slot="APREM"
          aria-pressed="${e.slotMidi === 'APREM'}">Apr\u00e8s-midi</button>
      </div>
      <div class="aide">Sert au calcul automatique des heures.</div></div>

    ${bloc}

    <div class="champ"><label for="f_obs">Observation</label>
      <select id="f_obs">${optionsHtml(OBSERVATIONS, e.observationType)}</select></div>

    <div class="champ"><label for="f_note">Note (jointe au message si NR)</label>
      <input id="f_note" value="${ech(e.observations)}" /></div>

    <div class="champ"><label for="f_retard">Motif de retard</label>
      <select id="f_retard">${optionsHtml(MOTIFS_RETARD, e.motifRetard)}</select></div>

    <div class="note" id="apercu">Message : <b>${ech(messageCloture(e))}</b></div>

    <button class="btn" id="valider"
            style="background:linear-gradient(135deg,#7C3AED,#1A0B36)">
      Enregistrer et partager</button>
  </div>`;
}


// ============================================================= FRAIS
function totauxFrais(liste) {
  let ttc = 0, ht = 0, tva = 0, remb = 0;
  liste.forEach((t) => {
    const m = Number(t.montantEur) || 0;
    ttc += m;
    ht += htDepuisTtc(m, t.categorie, t.sansTva);
    tva += tvaDepuisTtc(m, t.categorie, t.sansTva);
    remb += remboursable(m, t.categorie);
  });
  return { ttc, ht, tva, remb };
}

function vueFrais() {
  const liste = entrees.frais.slice().sort((a, b) => b.timestamp - a.timestamp);
  const t = totauxFrais(liste);

  const lignes = liste.length ? liste.map((f) => {
    const img = photo(f.fileName);
    const plafonne = f.categorie === 'MOBILE'
      && remboursable(f.montantEur, 'MOBILE') < f.montantEur;
    return `
      <div class="ligne">
        ${img ? '<img class="vignette" src="' + img + '" alt="" />'
              : '<div class="vignette"></div>'}
        <div class="corps">
          <div class="haut">${ech(f.categorie)} \u00b7 ${eur(f.montantEur)}</div>
          <div class="bas">${dateFr(f.date)}
            ${f.sansTva ? '\u00b7 sans TVA' : ''}
            ${plafonne ? '\u00b7 rembours\u00e9 ' + eur(remboursable(f.montantEur, 'MOBILE')) : ''}
            ${f.observations ? '\u00b7 ' + ech(f.observations) : ''}</div>
        </div>
        <button class="etiquette an" data-suppr-frais="${ech(f.id)}">Suppr.</button>
      </div>`;
  }).join('') : '<div class="vide">Aucun ticket enregistr\u00e9.<br />'
    + 'Touchez \u00ab + Ticket \u00bb pour photographier le premier.</div>';

  const totaux = liste.length ? `
    <div class="total-bloc">
      <div class="l"><span>Total pay\u00e9 (TTC)</span><span>${eur(t.ttc)}</span></div>
      <div class="l"><span>Dont TVA</span><span>${eur(t.tva)}</span></div>
      <div class="l"><span>Total HT</span><span>${eur(t.ht)}</span></div>
      <div class="l fort"><span>\u00c0 rembourser</span><span>${eur(t.remb)}</span></div>
    </div>` : '';

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#06B6D4,#14B8A6)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">FRAIS</span>
  </div>
  <div class="form">${totaux}${lignes}</div>
  <button class="fab" data-va="nouveauFrais"
          style="background:linear-gradient(135deg,#06B6D4,#14B8A6)">+ Ticket</button>`;
}

function vueTicket() {
  const f = ticket;
  const img = f.apercu;
  const m = Number(String(f.montantEur).replace(',', '.')) || 0;
  const detail = m > 0 ? `
    <div class="total-bloc">
      <div class="l"><span>TVA (${f.sansTva ? '0' : '20'} %)</span>
        <span>${eur(tvaDepuisTtc(m, f.categorie, f.sansTva))}</span></div>
      <div class="l"><span>Montant HT</span>
        <span>${eur(htDepuisTtc(m, f.categorie, f.sansTva))}</span></div>
      <div class="l fort"><span>\u00c0 rembourser</span>
        <span>${eur(remboursable(m, f.categorie))}</span></div>
      ${f.categorie === 'MOBILE'
        ? '<div class="aide">Forfait t\u00e9l\u00e9phonique : 50 % plafonn\u00e9s \u00e0 20 \u20ac.</div>'
        : ''}
    </div>` : '';

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#06B6D4,#14B8A6)">
    <button class="retour" data-va="frais">\u2190</button>
    <span class="t">NOUVEAU TICKET</span>
  </div>
  <div class="form">
    <div class="champ requis"><label>Photo du justificatif</label>
      ${img ? '<img class="apercu-photo" src="' + img + '" alt="Ticket" />' : ''}
      <input id="t_photo" type="file" accept="image/*" capture="environment" />
      <div class="aide">La photo est r\u00e9duite avant d'\u00eatre gard\u00e9e :
        une photo brute saturerait la m\u00e9moire du navigateur.</div></div>

    <div class="champ"><label for="t_date">Date</label>
      <input id="t_date" type="date" value="${ech(f.date)}" /></div>

    <div class="champ"><label>Cat\u00e9gorie</label>
      <div class="segment" id="t_cat">
        ${CATEGORIES.map((c) => '<button type="button" data-cat="' + c + '" aria-pressed="'
          + (f.categorie === c) + '">' + c + '</button>').join('')}
      </div></div>

    <div class="champ requis"><label for="t_montant">Montant pay\u00e9 (TTC)</label>
      <input id="t_montant" inputmode="decimal" value="${ech(f.montantEur)}" /></div>

    ${f.categorie === 'PARKING' ? `
    <div class="bascule">
      <input type="checkbox" id="t_sanstva" ${f.sansTva ? 'checked' : ''} />
      <label for="t_sanstva">Ticket sans TVA (PayByPhone\u2026)</label>
    </div>` : ''}

    <div class="champ"><label for="t_note">Observations</label>
      <input id="t_note" value="${ech(f.observations)}" /></div>

    ${detail}

    <button class="btn" id="valider-frais"
            style="background:linear-gradient(135deg,#06B6D4,#14B8A6)">
      Enregistrer le ticket</button>
  </div>`;
}

// ============================================================== RENDU
function rendre() {
  const vues = {
    reglages: vueReglages, cloture: vueCloture, formulaire: vueFormulaire,
    frais: vueFrais, ticket: vueTicket,
  };
  app().innerHTML = (vues[ecran] || vueAccueil)();
  window.scrollTo(0, 0);
}

function aller(ou) {
  if (ou === 'nouvelle') {
    brouillon = entreeVide(reglages);
    if (reglages.pendingArrivalMs > 0) {
      brouillon.heureDebut = heureDe(reglages.pendingArrivalMs);
    }
    ecran = 'formulaire';
  } else if (ou === 'nouveauFrais') {
    ticket = {
      date: aujourdhuiIso(), categorie: 'PARKING', montantEur: '',
      observations: '', sansTva: false, apercu: null,
    };
    ecran = 'ticket';
  } else {
    ecran = ou;
  }
  rendre();
}

/** Recopie le formulaire dans le brouillon avant tout rendu ou validation. */
function lireFormulaire() {
  if (ecran !== 'formulaire' || !brouillon) return;
  const v = (id) => { const n = $(id); return n ? n.value : ''; };
  brouillon.date = v('#f_date') || brouillon.date;
  brouillon.typeMission = v('#f_type') || brouillon.typeMission;
  brouillon.observationType = v('#f_obs');
  brouillon.observations = v('#f_note');
  brouillon.motifRetard = v('#f_retard');
  if (TYPES_JOURNEE.indexOf(brouillon.typeMission) < 0) {
    brouillon.departement = v('#f_dept');
    brouillon.numeroIntervention = v('#f_num');
    brouillon.nomClient = v('#f_client');
    brouillon.ville = v('#f_ville');
  }
}

// ============================================================ ACTIONS
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
  if (cible === 'cloture' || cible === 'nouvelle') { aller(cible); return; }
  if (cible === 'frais') { aller('frais'); return; }

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
    pointerArrivee('attente');
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

/** Enregistre l'intervention puis propose le message Viber. */
async function validerCloture() {
  lireFormulaire();
  const m = manques(brouillon);
  if (m.length) { toast('Il manque : ' + m.join(', ') + '.'); return; }

  brouillon.heureFin = heureDe(Date.now());
  const duJour = entrees.temps.filter((x) => x.date === brouillon.date).concat([brouillon]);
  brouillon.heures = heuresDuJour(duJour);

  entrees.temps.push(brouillon);
  ecrireEntrees(entrees);

  // L'arrivee en attente est consommee par la cloture.
  if (reglages.pendingArrivalMs > 0) {
    reglages.pendingArrivalMs = 0;
    reglages.pendingArrivalSource = '';
    ecrireReglages(reglages);
  }

  const texte = messageCloture(brouillon);
  const journee = TYPES_JOURNEE.indexOf(brouillon.typeMission) >= 0;
  brouillon = null;
  aller('cloture');

  // Journee entiere : pas de message Viber, comme sur Android.
  if (journee) { toast('Journ\u00e9e enregistr\u00e9e.'); return; }
  const r = await partager(texte);
  toast(r === 'copie' ? 'Enregistr\u00e9. Message copi\u00e9 : ' + texte
                      : 'Intervention enregistr\u00e9e.', 5000);
}


/** Recopie le formulaire de ticket avant tout rendu ou enregistrement. */
function lireTicket() {
  if (ecran !== 'ticket' || !ticket) return;
  const v = (id) => { const n = $(id); return n ? n.value : ''; };
  ticket.date = v('#t_date') || ticket.date;
  ticket.montantEur = v('#t_montant');
  ticket.observations = v('#t_note');
  const c = $('#t_sanstva');
  ticket.sansTva = c ? c.checked : false;
}

/** Recalcule le bloc des montants sans redessiner le formulaire : un rendu
 *  complet ferait perdre le focus et refermerait le clavier a chaque chiffre. */
function rendreMontants() {
  const m = Number(String(ticket.montantEur).replace(',', '.')) || 0;
  const bloc = document.querySelector('.total-bloc');
  if (!bloc || !m) { rendre(); return; }
  const l = bloc.querySelectorAll('.l span:last-child');
  if (l.length >= 3) {
    l[0].textContent = eur(tvaDepuisTtc(m, ticket.categorie, ticket.sansTva));
    l[1].textContent = eur(htDepuisTtc(m, ticket.categorie, ticket.sansTva));
    l[2].textContent = eur(remboursable(m, ticket.categorie));
  }
}

function validerTicket() {
  lireTicket();
  const montant = Number(String(ticket.montantEur).replace(',', '.'));
  if (!ticket.apercu) { toast('Photographiez le justificatif.'); return; }
  if (!montant || montant <= 0) { toast('Indiquez le montant pay\u00e9.'); return; }

  // Nom de fichier propre, numerote par categorie comme sur Android.
  const memeCat = entrees.frais.filter((f) => f.categorie === ticket.categorie).length;
  const nom = nomTicket(ticket.categorie, memeCat + 1);

  if (!enregistrerPhoto(nom, ticket.apercu)) {
    toast('M\u00e9moire du navigateur pleine : envoyez les frais du cycle, '
        + 'puis reprenez.', 6000);
    return;
  }

  entrees.frais.push({
    id: idUnique(), date: ticket.date, timestamp: Date.now(), fileName: nom,
    categorie: ticket.categorie, montantEur: montant,
    observations: ticket.observations, sansTva: ticket.sansTva,
  });
  ecrireEntrees(entrees);
  ticket = null;
  aller('frais');
  toast('Ticket enregistr\u00e9.');
}

// ======================================================= INTERACTIONS
document.addEventListener('click', (e) => {
  const cat = e.target.closest('#t_cat button');
  if (cat) { lireTicket(); ticket.categorie = cat.dataset.cat; rendre(); return; }

  const suppr = e.target.closest('[data-suppr-frais]');
  if (suppr) {
    const id = suppr.dataset.supprFrais;
    const t = entrees.frais.find((x) => x.id === id);
    if (t) supprimerPhoto(t.fileName);
    entrees.frais = entrees.frais.filter((x) => x.id !== id);
    ecrireEntrees(entrees); rendre(); toast('Ticket supprim\u00e9.');
    return;
  }

  if (e.target.closest('#valider-frais')) { validerTicket(); return; }

  const slot = e.target.closest('#f_slot button');
  if (slot) { lireFormulaire(); brouillon.slotMidi = slot.dataset.slot; rendre(); return; }

  const va = e.target.closest('[data-va]');
  if (va) { lireFormulaire(); aller(va.dataset.va); return; }

  const onglet = e.target.closest('.onglet');
  if (onglet) { ongletActif = onglet.dataset.groupe; rendre(); return; }

  const tuile = e.target.closest('.tuile');
  if (tuile) { ouvrir(tuile.dataset.ecran); return; }

  if (e.target.closest('#valider')) { validerCloture(); return; }

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

// Le type change la forme du formulaire ; l'observation change l'apercu.
document.addEventListener('change', async (e) => {
  if (e.target.id === 't_photo' && e.target.files && e.target.files[0]) {
    lireTicket();
    try { ticket.apercu = await reduire(e.target.files[0]); rendre(); }
    catch (err) { toast('Photo illisible, reprenez-la.'); }
    return;
  }
  if (ecran !== 'formulaire') return;
  if (e.target.matches('#f_type, #f_obs')) { lireFormulaire(); rendre(); }
});

// Apercu du message tenu a jour pendant la frappe.
document.addEventListener('input', () => {
  if (ecran === 'ticket') { lireTicket(); rendreMontants(); return; }
  if (ecran !== 'formulaire') return;
  lireFormulaire();
  const a = $('#apercu');
  if (a) a.innerHTML = 'Message : <b>' + ech(messageCloture(brouillon)) + '</b>';
});

window.addEventListener('online', rendre);
window.addEventListener('offline', rendre);

ecran = reglagesComplets(reglages) ? 'accueil' : 'reglages';
rendre();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
