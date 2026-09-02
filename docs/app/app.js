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
import {
  photo, enregistrerPhoto, supprimerPhoto, chargerPhotos, reduire, nomTicket,
  nomCompteur,
  fichierDepuisDataUrl,
} from './photos.js';
import { cycleCourant, dansPeriode, memoriserEnvoi } from './cycle.js';
import { remplirClasseur } from './xlsm.js';
import {
  lireClasseur, memoriserClasseur, oublierClasseur,
} from './classeur.js';
import { deposerEnvoi } from './backup.js';
import {
  TYPES as TYPES_GESTE, TYPES_SAV_GESTE, gesteVide, gesteValide, besoinSite,
  raisonInvalide, construireGeste, totalInstalle, totalOffert, totalCadeau,
  totalPrime, primesParType, datesInstallation,
} from './gesteco.js';
import { genererConge, nomFichierConge } from './docConge.js';
import { genererBulletin, refFormatee, eur2, FRAIS_INTERVENTION }
  from './docBulletin.js';
import { genererPv, totalPv } from './docPv.js';
import { genererRecap, nomFichierRecap } from './docRecap.js';
import { creerPad } from './signature.js';

const TEL_TECHLINE = '0388398894';
const TEL_LOGISTIQUE = '0369740780';

// Destinataire de l'envoi mensuel, fixe pour toute l'equipe (Models.kt).
const GS_TO = 'fdt@fggestion.fr';

const $ = (s) => document.querySelector(s);
const app = () => $('#app');

let ongletActif = 'SITE';
let ecran = 'accueil';
let reglages = lireReglages();
let entrees = lireEntrees();
let brouillon = null;          // intervention en cours de saisie
let ticket = null;             // ticket de frais en cours de saisie
let conge = null;              // demande de conge en cours
let pad = null;                // pad de signature (conge)
let padTech = null;            // bulletin : signature du technicien
let padClient = null;          // bulletin : signature du client
let bulletin = null;           // bulletin en cours de saisie
let pv = null;                 // PV cameras en cours
let demandeCam = null;         // demande de rappel camera
let padAb = null;              // PV : signature de l'abonne
let padPvTech = null;          // PV : signature du technicien
let envoi = null;              // envoi mensuel en preparation
let geste = null;              // GESTE CO de la cloture en cours

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

/** Vrai quand la cloture ouvre droit a un GESTE CO (installation ou SAV). */
function gesteVisible() {
  const t = String(brouillon.typeMission || '').toUpperCase();
  return t === 'INST' || TYPES_SAV_GESTE.indexOf(t) >= 0;
}

/** Vrai en mode SAV : cadeau seul, sans extension installee. */
function gesteSav() {
  return String(brouillon.typeMission || '').toUpperCase() !== 'INST';
}

/** Le bloc des totaux, redessine seul pendant la frappe. */
function totauxGeste() {
  const sav = gesteSav();
  const raison = raisonInvalide(geste, sav);
  return `
    <div class="l"><span>Install\u00e9es</span><span>${totalInstalle(geste)}</span></div>
    <div class="l"><span>Offertes</span><span>${totalOffert(geste)}</span></div>
    <div class="l"><span>Co\u00fbt client</span><span>${eur(totalCadeau(geste))}</span></div>
    <div class="l fort"><span>Prime</span><span>${eur(totalPrime(geste))}</span></div>
    ${raison ? '<div class="aide" style="color:#FF3D5A">' + ech(raison) + '</div>'
             : '<div class="aide">Plafonds respect\u00e9s.</div>'}`;
}

/** Section GESTE CO de la cloture - miroir de InstallExtrasSection. */
function sectionGeste() {
  if (!gesteVisible()) return '';
  const sav = gesteSav();
  const lignes = TYPES_GESTE.map((t) => `
    <div class="geste-l">
      <span>${t.nom}</span>
      <input inputmode="numeric" data-geste="installe" data-cle="${t.cle}"
             ${sav ? 'disabled' : ''}
             value="${ech(geste.installe[t.cle] || '')}" />
      <input inputmode="numeric" data-geste="offert" data-cle="${t.cle}"
             value="${ech(geste.offert[t.cle] || '')}" />
    </div>`).join('');

  return `
    <div class="bascule">
      <input type="checkbox" id="g_actif" ${geste.actif ? 'checked' : ''} />
      <label for="g_actif">GESTE CO ${sav
        ? '(geste commercial offert)' : '(extensions install\u00e9es ou offertes)'}</label>
    </div>
    ${!geste.actif ? '' : `
    <div class="geste">
      <div class="geste-l geste-tete">
        <span>Type</span><span>Install\u00e9</span><span>Offert</span></div>
      ${lignes}
    </div>
    <div class="total-bloc" id="g_totaux">${totauxGeste()}</div>
    ${sav ? '' : `
    <div class="bascule">
      <input type="checkbox" id="g_eps" ${geste.eps ? 'checked' : ''} />
      <label for="g_eps">D\u00e9rogation EPS accord\u00e9e</label>
    </div>`}
    <div class="champ ${besoinSite(geste) ? 'requis' : ''}" id="g_champ_site">
      <label for="f_site">N\u00b0 de site${besoinSite(geste)
        ? '' : ' (facultatif)'}</label>
      <input id="f_site" inputmode="numeric" value="${ech(geste.site || '')}" />
      <div class="aide">Obligatoire d\u00e8s qu'une extension est offerte :
        c'est la r\u00e9f\u00e9rence du mail EPS.</div>
    </div>`}`;
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
    ${sectionGeste()}

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

/** Le cycle en cours, tel que l'ecran ENVOI le proposera. */
function cycleAffiche() {
  return cycleCourant(aujourdhuiIso(), reglages.cycleStartDay,
    reglages.lastEnvoiDateIso);
}

function vueFrais() {
  // Perimetre = le cycle en cours, comme FraisScreen.periodTickets. Cumuler
  // depuis toujours ferait grossir la liste sans fin et fausserait le total a
  // rembourser des le premier envoi passe.
  const c = cycleAffiche();
  const liste = entrees.frais.filter((f) => dansPeriode(f.date, c[0], c[1]))
    .sort((a, b) => b.timestamp - a.timestamp);
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


// ============================================================= CONGE
function vueConge() {
  const c = conge;
  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#F59E0B,#3A2606)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">DEMANDE DE CONG\u00c9</span>
  </div>
  <div class="form">
    <div class="champ requis"><label for="c_nom">Nom et pr\u00e9nom</label>
      <input id="c_nom" value="${ech(c.nom)}" /></div>

    <div class="champ"><label>Type de cong\u00e9s</label>
      <div class="segment" id="c_type">
        <button type="button" data-paye="1" aria-pressed="${c.congesPayes}">
          Cong\u00e9s pay\u00e9s</button>
        <button type="button" data-paye="0" aria-pressed="${!c.congesPayes}">
          Sans solde</button>
      </div></div>

    <div class="deux">
      <div class="champ requis"><label for="c_du">Du</label>
        <input id="c_du" type="date" value="${ech(c.du)}" /></div>
      <div class="champ requis"><label for="c_au">Au</label>
        <input id="c_au" type="date" value="${ech(c.au)}" /></div>
    </div>

    <div class="bascule">
      <input type="checkbox" id="c_inclus" ${c.inclus ? 'checked' : ''} />
      <label for="c_inclus">Dernier jour inclus</label>
    </div>
    <div class="aide">D\u00e9coch\u00e9, le document porte la mention
      \u00ab dernier jour NON inclus \u00bb.</div>

    <div class="champ"><label for="c_date">Date de la demande</label>
      <input id="c_date" type="date" value="${ech(c.date)}" /></div>

    <div class="champ requis"><label>Signature</label>
      <canvas class="pad" id="c_pad"></canvas>
      <div class="pad-actions">
        <span class="aide">Signez avec le doigt.</span>
        <button type="button" id="c_effacer">Effacer</button>
      </div></div>

    <button class="btn" id="c_valider"
            style="background:linear-gradient(135deg,#F59E0B,#3A2606)">
      G\u00e9n\u00e9rer et envoyer</button>
    <div class="note">Le PDF part par la feuille de partage : choisissez votre
      application mail, puis saisissez les destinataires.</div>
  </div>`;
}


// ========================================================== BULLETIN
const PRESTATIONS = ['D\u00c9TECTEUR DE MOUVEMENT', 'D\u00c9TECTEUR OUVERTURE',
  'CLAVIER', 'SIR\u00c8NE INT\u00c9RIEURE', 'SIR\u00c8NE EXT\u00c9RIEURE', 'BOUTON ALERTE',
  'D\u00c9TECTEUR DE FUM\u00c9E', 'D\u00c9TECTEUR DE MONOXYDE', 'T\u00c9L\u00c9COMMANDE', 'CAM\u00c9RA'];

const NATURES = [['MIGR', 'Migration'], ['AJOU', 'Ajout'], ['REPA', 'R\u00e9paration'],
  ['VISI', 'Visite/Devis'], ['RESI', 'D\u00e9montage'], ['PILE', 'Remplac. piles'],
  ['CONT', 'Contr\u00f4le'], ['INTE', 'V\u00e9rification'], ['DECL', 'Demande client']];

/** Total d'une ligne ; la quantite peut etre signee (+1 / -1). */
function totalLigne(l) {
  const q = Number(String(l.qte || '').replace(',', '.')) || 0;
  const pu = Number(String(l.pu || '').replace(',', '.')) || 0;
  return q * pu;
}

function totalBulletin(b) {
  return b.lignes.reduce((acc, l) => acc + totalLigne(l), 0)
       + (b.fraisOui ? FRAIS_INTERVENTION : 0);
}

function vueBulletin() {
  const b = bulletin;
  const tot = totalBulletin(b);

  const lignes = b.lignes.map((l, i) => `
    <div class="champ">
      <label>Ligne ${i + 1}</label>
      <select data-ligne="${i}" data-champ="detail">
        <option value="">\u2014</option>
        ${PRESTATIONS.map((p) => '<option' + (l.detail === p ? ' selected' : '')
          + '>' + p + '</option>').join('')}
      </select>
      <input data-ligne="${i}" data-champ="reference" placeholder="R\u00e9f\u00e9rence (IR-C08-12)"
             value="${ech(refFormatee(l.reference))}" />
      <div class="deux">
        <input data-ligne="${i}" data-champ="qte"
               placeholder="Quantit\u00e9 (+1 / -1)" value="${ech(l.qte)}" />
        <input data-ligne="${i}" data-champ="pu" inputmode="decimal"
               placeholder="Prix unitaire" value="${ech(l.pu)}" />
      </div>
      ${totalLigne(l) ? '<div class="aide">Prix total : ' + eur2(totalLigne(l))
        + ' \u20ac</div>' : ''}
    </div>`).join('');

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#8A5CF6,#9168F0)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">BULLETIN INTER</span>
  </div>
  <div class="form">
    <div class="deux">
      <div class="champ"><label for="b_date">Date</label>
        <input id="b_date" type="date" value="${ech(b.date)}" /></div>
      <div class="champ requis"><label for="b_mission">N\u00b0 de mission</label>
        <input id="b_mission" inputmode="numeric" value="${ech(b.numMission)}" /></div>
    </div>
    <div class="champ"><label for="b_lieu">Lieu prot\u00e9g\u00e9 n\u00b0</label>
      <input id="b_lieu" inputmode="numeric" value="${ech(b.lieuProtege)}" /></div>

    <div class="champ requis"><label for="b_nom">Nom et pr\u00e9nom du client</label>
      <input id="b_nom" value="${ech(b.nom)}" /></div>
    <div class="champ"><label for="b_adresse">Adresse</label>
      <input id="b_adresse" value="${ech(b.adresse)}" /></div>
    <div class="deux">
      <div class="champ"><label for="b_cp">Code postal</label>
        <input id="b_cp" inputmode="numeric" value="${ech(b.cp)}" /></div>
      <div class="champ"><label for="b_ville">Ville</label>
        <input id="b_ville" value="${ech(b.ville)}" /></div>
    </div>

    <div class="champ"><label>Nature de l'intervention</label>
      <div class="segment" id="b_natures">
        ${NATURES.map((n) => '<button type="button" data-nature="' + n[0]
          + '" aria-pressed="' + (!!b.natures[n[0]]) + '">' + n[1]
          + '</button>').join('')}
      </div></div>

    <div class="deux">
      <div class="champ"><label for="b_marque">Marque</label>
        <input id="b_marque" value="${ech(b.marque)}" /></div>
      <div class="champ"><label for="b_type">Type</label>
        <input id="b_type" value="${ech(b.typeMat)}" /></div>
    </div>

    <div class="jour"><span class="d">PRESTATIONS</span>
      <span class="h">${b.lignes.length} ligne(s)</span></div>
    ${lignes}
    <button class="btn" id="b_ajout_ligne"
            style="background:var(--lift2);color:var(--mid)">+ Ajouter une ligne</button>

    <div class="champ"><label>Forfait d'intervention</label>
      <div class="segment" id="b_forfait">
        <button type="button" data-forfait="loc" aria-pressed="${b.forfaitLocatif}">
          Locatif</button>
        <button type="button" data-forfait="acq" aria-pressed="${b.forfaitAcquisition}">
          Acquisition</button>
      </div></div>

    <div class="bascule">
      <input type="checkbox" id="b_frais" ${b.fraisOui ? 'checked' : ''} />
      <label for="b_frais">Frais d'intervention (+ 65,00 \u20ac)</label>
    </div>
    <div class="bascule">
      <input type="checkbox" id="b_ht" ${b.totalHt ? 'checked' : ''} />
      <label for="b_ht">Tout le bulletin en H.T. (d\u00e9coch\u00e9 = T.T.C.)</label>
    </div>

    <div class="total-bloc">
      <div class="l fort"><span>TOTAL</span>
        <span>${eur2(tot)} \u20ac ${b.totalHt ? 'H.T.' : 'T.T.C.'}</span></div>
    </div>

    <div class="champ"><label>Nouvelle mensualit\u00e9</label>
      <div class="segment" id="b_signe">
        <button type="button" data-signe="+" aria-pressed="${b.mensSigne === '+'}">+</button>
        <button type="button" data-signe="-" aria-pressed="${b.mensSigne === '-'}">\u2212</button>
        <button type="button" data-signe="IDEM" aria-pressed="${b.mensIdem}">IDEM</button>
      </div>
      ${b.mensIdem ? '<div class="aide">\u00ab IDEM \u00bb sera \u00e9crit sur le bulletin.</div>'
        : '<input id="b_mens" inputmode="decimal" placeholder="Montant" value="'
          + ech(b.mensualite) + '" />'}
    </div>

    <div class="bascule">
      <input type="checkbox" id="b_alarme" ${b.testAlarme ? 'checked' : ''} />
      <label for="b_alarme">Bon fonctionnement du syst\u00e8me d'alarme</label>
    </div>
    <div class="bascule">
      <input type="checkbox" id="b_liaison" ${b.testLiaison ? 'checked' : ''} />
      <label for="b_liaison">Bon fonctionnement des moyens de liaison</label>
    </div>

    <div class="champ"><label for="b_obs">Observations du technicien</label>
      <input id="b_obs" value="${ech(b.obsTech)}" /></div>

    <div class="deux">
      <div class="champ"><label for="b_nomtech">Nom du technicien</label>
        <input id="b_nomtech" value="${ech(b.nomTech)}" /></div>
      <div class="champ"><label for="b_nomclient">Nom du client</label>
        <input id="b_nomclient" value="${ech(b.nomClient)}" /></div>
    </div>

    <div class="champ requis"><label>Signature du technicien</label>
      <canvas class="pad" id="b_pad_tech"></canvas>
      <div class="pad-actions"><span class="aide">Signez avec le doigt.</span>
        <button type="button" id="b_eff_tech">Effacer</button></div></div>

    <div class="champ requis"><label>Signature du client</label>
      <canvas class="pad" id="b_pad_client"></canvas>
      <div class="pad-actions"><span class="aide">Faites signer le client.</span>
        <button type="button" id="b_eff_client">Effacer</button></div></div>

    <button class="btn" id="b_valider"
            style="background:linear-gradient(135deg,#8A5CF6,#9168F0)">
      G\u00e9n\u00e9rer et envoyer</button>
  </div>`;
}


// =============================================================== PV
function vuePv() {
  const v = pv;
  const t = totalPv(v);
  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#9168F0,#8A5CF6)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">PV CAM\u00c9RAS</span>
  </div>
  <div class="form">
    <div class="deux">
      <div class="champ requis"><label for="p_conv">Convention n\u00b0</label>
        <input id="p_conv" inputmode="numeric" value="${ech(v.conv)}" /></div>
      <div class="champ requis"><label for="p_site">Site n\u00b0</label>
        <input id="p_site" inputmode="numeric" value="${ech(v.site)}" /></div>
    </div>
    <div class="champ"><label for="p_datesous">Date de souscription</label>
      <input id="p_datesous" type="date" value="${ech(v.dateSous)}" /></div>
    <div class="champ requis"><label for="p_nom">Nom et pr\u00e9nom</label>
      <input id="p_nom" value="${ech(v.nom)}" /></div>
    <div class="champ"><label for="p_adr">Adresse</label>
      <input id="p_adr" value="${ech(v.adr)}" /></div>

    <div class="jour"><span class="d">\u00c9QUIPEMENT</span>
      <span class="h">nombre seulement</span></div>
    <div class="champ"><label for="p_ext">HD-100 ext\u00e9rieure (179,00 \u20ac)</label>
      <input id="p_ext" inputmode="numeric" value="${ech(v.nbExt)}" /></div>
    <div class="champ"><label for="p_int">HD-100 int\u00e9rieure (149,00 \u20ac)</label>
      <input id="p_int" inputmode="numeric" value="${ech(v.nbInt)}" /></div>
    <div class="champ"><label for="p_torus">TORUS int\u00e9rieure (89,00 \u20ac)</label>
      <input id="p_torus" inputmode="numeric" value="${ech(v.nbTorus)}" /></div>

    <div class="bascule">
      <input type="checkbox" id="p_mint" ${v.miseServInt ? 'checked' : ''} />
      <label for="p_mint">Mise en service int\u00e9rieure (40,00 \u20ac)</label></div>
    <div class="bascule">
      <input type="checkbox" id="p_mext" ${v.miseServExt ? 'checked' : ''} />
      <label for="p_mext">Mise en service ext\u00e9rieure (70,00 \u20ac)</label></div>
    ${v.miseServInt && v.miseServExt
      ? '<div class="aide">Les deux ne se cumulent pas : seul le plus \u00e9lev\u00e9'
        + ' (70,00 \u20ac) est factur\u00e9.</div>' : ''}

    <div class="total-bloc">
      <div class="l"><span>\u00c9quipement</span><span>${eur2(t.equip)} \u20ac</span></div>
      <div class="l"><span>Mise en service</span><span>${eur2(t.mes)} \u20ac</span></div>
      <div class="l fort"><span>MONTANT TOTAL</span>
        <span>${eur2(t.total)} \u20ac TTC</span></div>
    </div>

    <div class="bascule">
      <input type="checkbox" id="p_antic" ${v.miseServAnticipee ? 'checked' : ''} />
      <label for="p_antic">Mise en service anticip\u00e9e</label></div>

    <div class="champ"><label for="p_obs">Observations</label>
      <input id="p_obs" value="${ech(v.observations)}" /></div>

    <div class="deux">
      <div class="champ"><label for="p_faitle">Fait le</label>
        <input id="p_faitle" type="date" value="${ech(v.faitLe)}" /></div>
      <div class="champ"><label for="p_nomtech">Nom du technicien</label>
        <input id="p_nomtech" value="${ech(v.nomTech)}" /></div>
    </div>

    <div class="champ requis"><label>Signature de l'abonn\u00e9</label>
      <canvas class="pad" id="p_pad_ab"></canvas>
      <div class="pad-actions"><span class="aide">Faites signer le client.</span>
        <button type="button" id="p_eff_ab">Effacer</button></div></div>

    <div class="champ requis"><label>Signature du technicien</label>
      <canvas class="pad" id="p_pad_tech"></canvas>
      <div class="pad-actions"><span class="aide">Signez avec le doigt.</span>
        <button type="button" id="p_eff_tech">Effacer</button></div></div>

    <button class="btn" id="p_valider"
            style="background:linear-gradient(135deg,#9168F0,#8A5CF6)">
      G\u00e9n\u00e9rer et envoyer</button>
  </div>`;
}


// ================================================== DEMANDE CAMERA
/** Destinataires EPS - identiques a data/Models.kt. */
const EPS_TO = 'epsinfotechline@eps.e-i.com';
const EPS_CC_JOHANNA = 'johanna@fggestion.fr';
const EPS_CC_SECRETARIAT = 'secretariat.gsystems@outlook.fr';

function vueDemandeCam() {
  const d = demandeCam;
  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#9168F0,#8A5CF6)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">DEMANDE CAM\u00c9RA</span>
  </div>
  <div class="form">
    <div class="note">Envoie \u00e0 EPS une demande de rappel pour installer des
      cam\u00e9ras. Johanna, votre responsable et le secr\u00e9tariat sont mis en copie.</div>
    <div class="champ requis"><label for="d_site">N\u00b0 de site</label>
      <input id="d_site" inputmode="numeric" value="${ech(d.site)}" /></div>
    <div class="champ requis"><label for="d_nb">Nombre de cam\u00e9ras souhait\u00e9es</label>
      <input id="d_nb" inputmode="numeric" value="${ech(d.nb)}" /></div>
    <div class="champ"><label for="d_prec">Pr\u00e9cisions</label>
      <input id="d_prec" value="${ech(d.precisions)}" /></div>
    <button class="btn" id="d_valider"
            style="background:linear-gradient(135deg,#9168F0,#8A5CF6)">
      Ouvrir le mail</button>
  </div>`;
}

// ============================================================ RECAP
function vueRecap() {
  // \u00ab Cumul du CYCLE \u00bb, comme l'annonce la tuile : sans ce bornage, l'ecran
  // additionnerait les cycles deja envoyes et le technicien lirait un total
  // qui ne correspond a aucun mensuel.
  const c = cycleAffiche();
  const t = entrees.temps.filter((x) => dansPeriode(x.date, c[0], c[1]));
  const f = entrees.frais.filter((x) => dansPeriode(x.date, c[0], c[1]));
  const parType = {};
  t.forEach((e) => { parType[e.typeMission] = (parType[e.typeMission] || 0) + 1; });
  const totalFrais = f.reduce((a, x) => a + (Number(x.montantEur) || 0), 0);
  const rembourse = f.reduce(
    (a, x) => a + remboursable(Number(x.montantEur) || 0, x.categorie), 0);

  // NR sur les installations, comme le bandeau de l'accueil Android.
  const inst = t.filter((e) => (e.typeMission || '').toUpperCase() === 'INST');
  const realisees = inst.filter((e) => !e.observationType
    || e.observationType === 'NR_CLIENT' || e.observationType === 'NR_TECHNIQUE');
  const nr = realisees.filter((e) => e.observationType).length;
  const taux = realisees.length ? (nr * 100 / realisees.length) : null;

  const lignes = Object.keys(parType).sort().map((k) => `
    <div class="ligne"><div class="corps">
      <div class="haut">${ech(k)}</div></div>
      <span class="etiquette ok">${parType[k]}</span></div>`).join('');

  const blocNr = taux === null
    ? '<div class="note">Aucune installation enregistr\u00e9e : le taux de NR '
      + "n'est pas calculable.</div>"
    : '<div class="total-bloc"><div class="l fort"><span>Taux de NR</span>'
      + '<span style="color:' + (taux <= 8 ? '#4ADE80' : '#FF3D5A') + '">'
      + taux.toFixed(1).replace('.', ',') + ' % ' + (taux <= 8 ? '\u2713' : '\u2717')
      + '</span></div><div class="aide">' + realisees.length
      + ' installation(s) r\u00e9alis\u00e9e(s). Seuil \u00e0 8 %.</div></div>';

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#3B82F6,#06B6D4)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">R\u00c9CAP</span>
  </div>
  <div class="form">
    <div class="total-bloc">
      <div class="l"><span>Interventions</span><span>${t.length}</span></div>
      <div class="l"><span>Tickets de frais</span><span>${f.length}</span></div>
      <div class="l"><span>Total pay\u00e9</span><span>${eur2(totalFrais)} \u20ac</span></div>
      <div class="l fort"><span>\u00c0 rembourser</span>
        <span>${eur2(rembourse)} \u20ac</span></div>
    </div>
    ${blocNr}
    <div class="jour"><span class="d">PAR TYPE</span></div>
    ${lignes || '<div class="vide">Aucune intervention.</div>'}
  </div>`;
}

// ====================================================== PRIME A VENIR
function vuePrime() {
  // Historique des primes GESTE CO, mois par mois - miroir de
  // PrimeAVenirScreen : on regroupe les GESTES par mois de pose, avec le
  // detail par type. Regrouper les interventions ne donnait aucun montant.
  const dates = datesInstallation(entrees.temps);
  const parMois = {};
  (entrees.gesteCo || []).forEach((g) => {
    const m = String(g.date || '').slice(0, 7);
    if (!m) return;
    if (!parMois[m]) parMois[m] = [];
    parMois[m].push(g);
  });
  const mois = Object.keys(parMois).sort().reverse();

  const lignes = mois.map((m) => {
    const primes = primesParType(parMois[m], dates);
    const total = primes.reduce((a, p) => a + p.total, 0);
    const versement = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) + 1, 1);
    const nomMois = versement.toLocaleDateString('fr-FR',
      { month: 'long', year: 'numeric' });
    const detail = primes.length
      ? primes.map((p) => `
        <div class="l"><span>${ech(p.type)} \u00d7${p.nb}</span>
          <span>${eur2(p.total)} \u20ac</span></div>`).join('')
      : '<div class="aide">Aucun mat\u00e9riel pos\u00e9 ce mois-ci.</div>';
    return `
      <div class="jour"><span class="d">${m.slice(5, 7)}/${m.slice(0, 4)}</span></div>
      <div class="total-bloc">
        ${detail}
        <div class="l fort"><span>TOTAL</span><span>${eur2(total)} \u20ac</span></div>
        <div class="aide">Versement attendu : ${nomMois}.</div>
      </div>`;
  }).join('');

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#10B981,#0A3025)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">PRIME \u00c0 VENIR</span>
  </div>
  <div class="form">
    <div class="note">Les primes sont vers\u00e9es \u00e0 <b>M+2</b> : le travail d'un
      mois est pay\u00e9 deux mois plus tard. Seules les cam\u00e9ras pos\u00e9es le jour
      d'une installation comptent.</div>
    ${lignes || '<div class="vide">Aucune prime enregistr\u00e9e.<br />'
      + 'Elles appara\u00eetront ici, mois par mois.</div>'}
  </div>`;
}

// ===================================================== ENVOI MENSUEL

/** Ce que le cycle affiche contient : temps, tickets, photo du compteur. */
function contenuPeriode(debut, fin) {
  const dans = (x) => dansPeriode(x.date, debut, fin);
  const parDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return {
    temps: entrees.temps.filter(dans).slice().sort(parDate),
    frais: entrees.frais.filter(dans).slice().sort(parDate),
    compteur: (entrees.compteur || []).filter(dans),
    gesteCo: (entrees.gesteCo || []).filter(dans),
  };
}

/** La photo du compteur du cycle : la plus recente si l'historique en a plusieurs. */
function compteurDuCycle(liste) {
  return liste.slice().sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}

/**
 * Date a inscrire sur une nouvelle photo : aujourd'hui s'il tombe dans le
 * cycle, sinon le dernier jour du cycle. Une photo prise apres la cloture
 * appartient au cycle qu'on est en train d'envoyer : sans ca elle sort de la
 * periode, l'envoi reste bloque et on la reprend en boucle.
 */
function dateCompteurCycle(debut, fin) {
  const today = aujourdhuiIso();
  return dansPeriode(today, debut, fin) ? today : fin;
}

function destinatairesEnvoi() {
  return [GS_TO].concat([reglages.emailMoi].filter((x) => x && x.trim()));
}

function vueEnvoi() {
  const e = envoi;
  const lot = contenuPeriode(e.debut, e.fin);
  const valide = !!(e.debut && e.fin && e.debut <= e.fin);
  const totalFrais = lot.frais.reduce((a, x) => a + (Number(x.montantEur) || 0), 0);
  const rembourse = lot.frais.reduce(
    (a, x) => a + remboursable(Number(x.montantEur) || 0, x.categorie), 0);
  const compteur = compteurDuCycle(lot.compteur);
  const img = compteur ? photo(compteur.fileName) : null;
  const primes = primesParType(lot.gesteCo, datesInstallation(entrees.temps));
  const totalPrimes = primes.reduce((a, p) => a + p.total, 0);
  const totalExt = primes.reduce((a, p) => a + p.nb, 0);
  const [cycleD, cycleF] = cycleCourant(
    aujourdhuiIso(), reglages.cycleStartDay, reglages.lastEnvoiDateIso);

  const blocCompteur = compteur
    ? '<div class="l fort"><span>Photo du compteur</span>'
      + '<span style="color:#4ADE80">\u2713 ' + dateFr(compteur.date) + '</span></div>'
    : '<div class="l fort"><span>Photo du compteur</span>'
      + '<span style="color:#FF3D5A">manquante</span></div>';

  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#22C55E,#15803D)">
    <button class="retour" data-va="accueil">\u2190</button>
    <span class="t">ENVOI MENSUEL</span>
  </div>
  <div class="form">
    <div class="jour"><span class="d">P\u00c9RIODE DU MENSUEL</span></div>
    <div class="deux">
      <div class="champ"><label for="e_du">Du</label>
        <input id="e_du" type="date" value="${ech(e.debut)}" /></div>
      <div class="champ"><label for="e_au">Au</label>
        <input id="e_au" type="date" value="${ech(e.fin)}" /></div>
    </div>
    ${valide ? '' : '<div class="note">La date de fin doit suivre celle de d\u00e9but.</div>'}
    <div class="aide">Pr\u00e9-rempli sur le cycle en cours (${dateFr(cycleD)}
      \u2192 ${dateFr(cycleF)}). Le cycle suivant d\u00e9marrera le lendemain de
      cet envoi.</div>
    ${(e.debut !== cycleD || e.fin !== cycleF)
      ? '<button class="btn" id="e_cycle" style="background:#1B2430">'
        + '\u21ba Revenir au cycle par d\u00e9faut</button>' : ''}

    <div class="jour"><span class="d">MON FICHIER TEMPS .XLSM</span></div>
    ${(e.memoire && !e.fichier) ? `
    <div class="total-bloc">
      <div class="l fort"><span>Classeur mémorisé</span>
        <span style="color:#4ADE80">✓ ${ech(e.memoire.nom)}</span></div>
      <div class="l"><span>Dernier cycle écrit</span><span>${e.memoire.debut
        ? dateFr(e.memoire.debut) + ' → ' + dateFr(e.memoire.fin)
        : '—'}</span></div>
    </div>
    <div class="aide">Rien à choisir : l'envoi repart de ce classeur et y
      ajoute le cycle en cours. C'est la même feuille de temps qui se
      complète de mois en mois.</div>
    <button class="btn" id="e_oublier" style="background:#3A1218">
      Repartir d'un autre fichier</button>` : `
    <div class="champ">
      <label for="e_xlsm">${e.nomFichier
        ? ech(e.nomFichier) : 'Aucun fichier choisi'}</label>
      <input id="e_xlsm" type="file"
             accept=".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12" />
      <div class="aide">Choisissez votre fichier TEMPS personnel (depuis Fichiers,
        OneDrive ou Drive). Il est rempli sans jamais perdre ses macros. Ce choix
        ne se fait qu'une fois : le classeur rempli est mémorisé, et les
        envois suivants repartent de lui.</div>
    </div>`}

    <div class="jour"><span class="d">R\u00c9CAP DU CYCLE</span></div>
    <div class="total-bloc">
      <div class="l"><span>Interventions</span><span>${lot.temps.length}</span></div>
      <div class="l"><span>Tickets de frais</span><span>${lot.frais.length}
        \u00b7 ${eur2(totalFrais)} \u20ac</span></div>
      <div class="l"><span>\u00c0 rembourser</span>
        <span>${eur2(rembourse)} \u20ac</span></div>
      <div class="l"><span>Primes GESTE CO</span><span>${totalExt} ext.
        \u00b7 ${eur2(totalPrimes)} \u20ac</span></div>
      ${blocCompteur}
    </div>

    <div class="jour"><span class="d">PHOTO DU COMPTEUR</span></div>
    <div class="champ requis">
      <label for="e_compteur">${compteur
        ? 'Remplacer la photo' : 'Photo du compteur'}</label>
      ${img ? '<img class="apercu-photo" src="' + img + '" alt="Compteur" />' : ''}
      <input id="e_compteur" type="file" accept="image/*" capture="environment" />
      <div class="aide">V\u00e9hicule : ${ech(reglages.plaqueVoiture
        || '<plaque non saisie dans les r\u00e9glages>')}. Le kilom\u00e9trage est
        lu directement sur la photo. Une seule photo par cycle : la nouvelle
        remplace la pr\u00e9c\u00e9dente.</div>
    </div>
    ${compteur ? '<button class="btn" id="e_suppr_compteur" '
      + 'style="background:#3A1218">Supprimer la photo</button>' : ''}

    <div class="jour"><span class="d">ENVOYER</span></div>
    <div class="note">Destinataires : <b>${ech(destinatairesEnvoi().join(', '))}</b>.
      Le partage d'iPhone ne peut pas les remplir tout seul : touchez
      \u00ab Copier les destinataires \u00bb, puis collez-les dans le champ
      \u00ab \u00c0 \u00bb de Mail.</div>
    <button class="btn" id="e_copier" style="background:#1B2430">
      Copier les destinataires</button>
    ${compteur ? '' : '<div class="note" style="color:#FF3D5A">\u26d4 Envoi bloqu\u00e9 : '
      + 'aucune photo du compteur sur la p\u00e9riode. Prenez-la ci-dessus avant '
      + 'd\'envoyer le mensuel.</div>'}
    <button class="btn" id="e_envoyer"
            ${(!valide || !compteur || e.occupe) ? 'disabled' : ''}
            style="background:linear-gradient(135deg,#22C55E,#15803D)">
      ${e.occupe ? 'Pr\u00e9paration\u2026' : 'Envoyer le mensuel'}</button>
    ${e.etat ? '<div class="aide" style="color:#4ADE80">' + ech(e.etat) + '</div>' : ''}
    <div class="aide" id="e_drive"></div>
    ${e.erreur ? '<div class="note" style="color:#FF3D5A">' + ech(e.erreur) + '</div>' : ''}
    ${(e.fichier || e.memoire) ? '' : '<div class="aide">Sans fichier Excel '
      + 'choisi, seuls les tickets et la photo du compteur partent.</div>'}
  </div>`;
}


// ================================================== DIAGNOSTIC
/**
 * La fiche EPS (386 champs, 2 pages A4) est affichee dans un cadre plutot que
 * reecrite : elle reste la SEULE source, partagee avec la version Android.
 * Meme origine que l'application, donc son localStorage fonctionne et ses
 * formulaires se conservent d'une ouverture a l'autre.
 */
function vueDiagnostic() {
  return `
  <div class="barre-titre" style="background:linear-gradient(135deg,#8A5CF6,#6366F1)">
    <button class="retour" data-va="accueil">←</button>
    <span class="t">DIAGNOSTIC SÉCURITÉ</span>
    <button class="reglage-btn" id="diag_imprimer" style="margin-left:auto"
            title="Imprimer ou enregistrer en PDF">\u{1F5A8}</button>
  </div>
  <iframe id="diag_cadre" src="diagnostic/particulier.html"
          style="width:100%;height:calc(100dvh - 62px);border:0;background:#fff">
  </iframe>`;
}

// ============================================================== RENDU
function rendre() {
  const vues = {
    reglages: vueReglages, cloture: vueCloture, formulaire: vueFormulaire,
    frais: vueFrais, ticket: vueTicket, conge: vueConge,
    bulletin: vueBulletin, pv: vuePv,
    demandecam: vueDemandeCam, recap: vueRecap, prime: vuePrime,
    diagnostic: vueDiagnostic,
    envoi: vueEnvoi,
  };
  app().innerHTML = (vues[ecran] || vueAccueil)();
  window.scrollTo(0, 0);
  // Le canvas n'existe qu'apres le rendu : le pad est recree a chaque fois.
  const toile = $('#c_pad');
  pad = toile ? creerPad(toile) : null;
  const tT = $('#b_pad_tech');
  const tC = $('#b_pad_client');
  padTech = tT ? creerPad(tT) : null;
  padClient = tC ? creerPad(tC) : null;
  const pA = $('#p_pad_ab');
  const pT = $('#p_pad_tech');
  padAb = pA ? creerPad(pA) : null;
  padPvTech = pT ? creerPad(pT) : null;
}

function aller(ou) {
  if (ou === 'nouvelle') {
    brouillon = entreeVide(reglages);
    geste = gesteVide();
    if (reglages.pendingArrivalMs > 0) {
      brouillon.heureDebut = heureDe(reglages.pendingArrivalMs);
    }
    ecran = 'formulaire';
  } else if (ou === 'demandecam') {
    demandeCam = { site: '', nb: '', precisions: '' };
    ecran = 'demandecam';
  } else if (ou === 'envoi') {
    // Safari ne sait pas garder l'acces au FICHIER choisi, mais l'app en garde
    // le CONTENU : le classeur rempli au cycle precedent sert de base au
    // suivant. Le technicien ne redesigne donc rien, et la feuille de temps
    // s'accumule de cycle en cycle comme sur Android (voir classeur.js).
    const cycle = cycleCourant(
      aujourdhuiIso(), reglages.cycleStartDay, reglages.lastEnvoiDateIso);
    envoi = {
      debut: cycle[0], fin: cycle[1], fichier: null, nomFichier: '',
      memoire: null, etat: '', erreur: '', occupe: false,
    };
    ecran = 'envoi';
    // IndexedDB ne repond qu'apres le premier rendu : on redessine a sa reponse.
    lireClasseur().then((ref) => {
      if (ecran !== 'envoi' || !envoi || envoi.fichier || !ref) return;
      envoi.memoire = ref;
      envoi.nomFichier = ref.nom;
      rendre();
    }).catch(() => {});
  } else if (ou === 'pv') {
    pv = {
      conv: '', site: '', dateSous: aujourdhuiIso(), nom: '', adr: '',
      nbExt: '', nbInt: '', nbTorus: '',
      miseServInt: false, miseServExt: false, miseServAnticipee: false,
      observations: '', faitLe: aujourdhuiIso(),
      nomTech: (reglages.nomUtilisateur || '').toUpperCase(),
    };
    ecran = 'pv';
  } else if (ou === 'bulletin') {
    bulletin = {
      date: aujourdhuiIso(), numMission: '', lieuProtege: '',
      nom: '', adresse: '', cp: '', ville: '',
      natures: {}, marque: 'BIRDIE', typeMat: 'V5',
      lignes: [{ detail: '', reference: '', qte: '', pu: '' }],
      forfaitLocatif: true, forfaitAcquisition: false,
      reglPrelevement: true, fraisOui: false, totalHt: false,
      mensualite: '', mensSigne: '', mensIdem: false,
      testAlarme: true, testLiaison: true, obsTech: '',
      nomTech: (reglages.nomUtilisateur || '').toUpperCase(), nomClient: '',
    };
    ecran = 'bulletin';
  } else if (ou === 'conge') {
    conge = {
      nom: (reglages.nomUtilisateur || '').toUpperCase(),
      congesPayes: true, du: '', au: '', inclus: true,
      date: aujourdhuiIso(),
    };
    ecran = 'conge';
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
  lireGeste();
}

/** Recopie la grille GESTE CO dans son etat, sans redessiner le formulaire. */
function lireGeste() {
  if (!geste) return;
  const a = $('#g_actif');
  geste.actif = a ? a.checked : geste.actif;
  const e = $('#g_eps');
  geste.eps = e ? e.checked : geste.eps;
  const s = $('#f_site');
  if (s) geste.site = s.value;
  document.querySelectorAll('[data-geste]').forEach((n) => {
    const ou = n.dataset.geste;
    if (!geste[ou]) geste[ou] = {};
    const val = String(n.value || '').trim();
    if (val) geste[ou][n.dataset.cle] = val;
    else delete geste[ou][n.dataset.cle];
  });
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
  if (cible === 'conge') { aller('conge'); return; }
  if (cible === 'bulletin') { aller('bulletin'); return; }
  if (cible === 'pv') { aller('pv'); return; }
  if (cible === 'demandecam') { aller('demandecam'); return; }
  if (cible === 'diagnostic') { aller('diagnostic'); return; }
  if (cible === 'recap') { aller('recap'); return; }
  if (cible === 'prime') { aller('prime'); return; }
  if (cible === 'envoi') { aller('envoi'); return; }

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

  // GESTE CO : les plafonds bloquent la cloture, comme sur Android. Le n\u00b0 de
  // site n'est exige que si quelque chose est offert, donc qu'un mail part.
  const sav = gesteSav();
  if (gesteVisible()) {
    if (!gesteValide(geste, sav)) {
      toast(raisonInvalide(geste, sav), 6000);
      return;
    }
    if (besoinSite(geste) && !String(geste.site || '').trim()) {
      toast('Indiquez le n\u00b0 de site : une extension est offerte.');
      return;
    }
  }

  brouillon.heureFin = heureDe(Date.now());
  const duJour = entrees.temps.filter((x) => x.date === brouillon.date).concat([brouillon]);
  brouillon.heures = heuresDuJour(duJour);

  entrees.temps.push(brouillon);
  if (gesteVisible()) {
    const g = construireGeste(geste, {
      id: idUnique(), tempsId: brouillon.id, date: brouillon.date,
      siteNumber: geste.site, nomClient: brouillon.nomClient,
      observations: brouillon.observations,
    }, sav);
    if (g) {
      if (!entrees.gesteCo) entrees.gesteCo = [];
      entrees.gesteCo.push(g);
    }
  }
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

async function validerTicket() {
  lireTicket();
  const montant = Number(String(ticket.montantEur).replace(',', '.'));
  if (!ticket.apercu) { toast('Photographiez le justificatif.'); return; }
  if (!montant || montant <= 0) { toast('Indiquez le montant pay\u00e9.'); return; }

  // Nom de fichier propre, numerote par categorie comme sur Android.
  const memeCat = entrees.frais.filter((f) => f.categorie === ticket.categorie).length;
  const nom = nomTicket(ticket.categorie, memeCat + 1);

  if (!await enregistrerPhoto(nom, ticket.apercu)) {
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


/** jj/mm/aaaa attendu par le document ; le champ date fournit de l'ISO. */
function versFr(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
}

function lireConge() {
  if (ecran !== 'conge' || !conge) return;
  const v = (id) => { const n = $(id); return n ? n.value : ''; };
  conge.nom = v('#c_nom');
  conge.du = v('#c_du');
  conge.au = v('#c_au');
  conge.date = v('#c_date') || conge.date;
  const i = $('#c_inclus');
  conge.inclus = i ? i.checked : true;
}

async function validerConge() {
  lireConge();
  if (!conge.nom.trim()) { toast('Indiquez votre nom.'); return; }
  if (!conge.du || !conge.au) { toast('Indiquez les dates du et au.'); return; }
  if (conge.au < conge.du) { toast('La date de fin doit suivre le d\u00e9but.'); return; }
  if (!pad || pad.vide()) { toast('Signez la demande.'); return; }

  const donnees = {
    nom: conge.nom.toUpperCase(),
    congesPayes: conge.congesPayes,
    du: versFr(conge.du), au: versFr(conge.au),
    inclus: conge.inclus, date: versFr(conge.date),
    traces: pad.traces(),
  };
  const blob = await genererConge(donnees);
  const fichier = new File([blob], nomFichierConge(donnees), { type: 'application/pdf' });

  // Partage natif avec piece jointe : c'est ainsi qu'on atteint l'app mail sur
  // iPhone. Si le partage de fichier n'est pas gere, on retombe sur un
  // telechargement plutot que de laisser le technicien sans document.
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Demande de conges' });
      toast('Demande partag\u00e9e.');
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fichier.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('PDF t\u00e9l\u00e9charg\u00e9 : joignez-le \u00e0 votre mail.', 5000);
}


/** Reference : 3 lettres puis 4 chiffres ; les tirets sont poses a l'affichage. */
function refSaisie(v) {
  let out = '';
  for (const c of String(v || '').toUpperCase()) {
    if (out.length < 3) { if (/[A-Z]/.test(c)) out += c; }
    else if (out.length < 7) { if (/[0-9]/.test(c)) out += c; }
    else break;
  }
  return out;
}

function lireBulletin() {
  if (ecran !== 'bulletin' || !bulletin) return;
  const v = (id) => { const n = $(id); return n ? n.value : ''; };
  const c = (id) => { const n = $(id); return n ? n.checked : false; };
  const b = bulletin;
  b.date = v('#b_date') || b.date;
  b.numMission = v('#b_mission'); b.lieuProtege = v('#b_lieu');
  b.nom = v('#b_nom'); b.adresse = v('#b_adresse');
  b.cp = v('#b_cp'); b.ville = v('#b_ville');
  b.marque = v('#b_marque'); b.typeMat = v('#b_type');
  b.fraisOui = c('#b_frais'); b.totalHt = c('#b_ht');
  b.testAlarme = c('#b_alarme'); b.testLiaison = c('#b_liaison');
  b.obsTech = v('#b_obs');
  b.nomTech = v('#b_nomtech'); b.nomClient = v('#b_nomclient');
  if (!b.mensIdem) b.mensualite = v('#b_mens');
  document.querySelectorAll('[data-ligne]').forEach((n) => {
    const l = b.lignes[Number(n.dataset.ligne)];
    if (!l) return;
    const ch = n.dataset.champ;
    l[ch] = ch === 'reference' ? refSaisie(n.value) : n.value;
  });
}

async function validerBulletin() {
  lireBulletin();
  const b = bulletin;
  if (!b.numMission.trim()) { toast('Indiquez le n\u00b0 de mission.'); return; }
  if (!b.nom.trim()) { toast('Indiquez le nom du client.'); return; }
  if (!padTech || padTech.vide()) { toast('Signature du technicien manquante.'); return; }
  if (!padClient || padClient.vide()) { toast('Signature du client manquante.'); return; }

  const total = totalBulletin(b);
  const donnees = {
    date: versFr(b.date), numMission: b.numMission, lieuProtege: b.lieuProtege,
    nom: b.nom, adresse: b.adresse, cp: b.cp, ville: b.ville,
    natures: b.natures, marque: b.marque, typeMat: b.typeMat,
    lignes: b.lignes.map((l) => ({
      detail: l.detail, reference: refFormatee(l.reference), qte: l.qte,
      pu: l.pu, total: totalLigne(l) ? eur2(totalLigne(l)) : '',
    })),
    forfaitLocatif: b.forfaitLocatif, forfaitAcquisition: b.forfaitAcquisition,
    reglPrelevement: b.reglPrelevement, fraisOui: b.fraisOui,
    total: total ? eur2(total) : '', totalHt: b.totalHt,
    mensualite: b.mensIdem ? 'IDEM' : (b.mensualite ? b.mensSigne + b.mensualite : ''),
    testAlarme: b.testAlarme, testLiaison: b.testLiaison,
    obsTech: b.obsTech, nomTech: b.nomTech, nomClient: b.nomClient,
    tracesTech: padTech.traces(), tracesClient: padClient.traces(),
  };

  const blob = genererBulletin(donnees);
  const nomFichier = 'BULLETIN_INTER_'
    + (b.numMission.replace(/[^A-Za-z0-9_-]/g, '_') || 'bulletin') + '.pdf';
  const fichier = new File([blob], nomFichier, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: "Bulletin d'intervention" });
      toast('Bulletin partag\u00e9.');
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('PDF t\u00e9l\u00e9charg\u00e9 : joignez-le au mail du client.', 5000);
}


function lirePv() {
  if (ecran !== 'pv' || !pv) return;
  const v = (id) => { const n = $(id); return n ? n.value : ''; };
  const c = (id) => { const n = $(id); return n ? n.checked : false; };
  pv.conv = v('#p_conv'); pv.site = v('#p_site');
  pv.dateSous = v('#p_datesous') || pv.dateSous;
  pv.nom = v('#p_nom'); pv.adr = v('#p_adr');
  pv.nbExt = v('#p_ext'); pv.nbInt = v('#p_int'); pv.nbTorus = v('#p_torus');
  pv.miseServInt = c('#p_mint'); pv.miseServExt = c('#p_mext');
  pv.miseServAnticipee = c('#p_antic');
  pv.observations = v('#p_obs');
  pv.faitLe = v('#p_faitle') || pv.faitLe;
  pv.nomTech = v('#p_nomtech');
}

async function validerPv() {
  lirePv();
  if (!pv.conv.trim() || !pv.site.trim()) {
    toast('Indiquez la convention et le site.'); return;
  }
  if (!pv.nom.trim()) { toast('Indiquez le nom du client.'); return; }
  if (!padAb || padAb.vide()) { toast("Signature de l'abonn\u00e9 manquante."); return; }
  if (!padPvTech || padPvTech.vide()) { toast('Signature du technicien manquante.'); return; }

  const donnees = Object.assign({}, pv, {
    dateSous: versFr(pv.dateSous), faitLe: versFr(pv.faitLe),
    tracesAbonne: padAb.traces(), tracesTech: padPvTech.traces(),
    tracesParapheTech: padPvTech.traces(), tracesParapheClient: padAb.traces(),
  });
  const blob = await genererPv(donnees);
  const nomFichier = 'PV_CAMERAS_'
    + (pv.site.replace(/[^A-Za-z0-9_-]/g, '_') || 'site') + '.pdf';
  const fichier = new File([blob], nomFichier, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'PV cameras' });
      toast('PV partag\u00e9.');
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('PDF t\u00e9l\u00e9charg\u00e9 : joignez-le au mail du client.', 5000);
}


/** Ouvre l'app mail avec destinataires, sujet et corps deja remplis. */
function envoyerDemandeCam() {
  const v = (id) => { const n = $(id); return n ? n.value.trim() : ''; };
  demandeCam = { site: v('#d_site'), nb: v('#d_nb'), precisions: v('#d_prec') };
  if (!demandeCam.site) { toast('Indiquez le n\u00b0 de site.'); return; }
  if (!demandeCam.nb) { toast('Indiquez le nombre de cam\u00e9ras.'); return; }

  // Sujet repris tel quel de l'Android : EPS trie ses demandes dessus.
  const sujet = 'HD-100 - ' + (reglages.siteCodeFixe || '')
              + ' - Site num\u00e9ro ' + demandeCam.site;
  let corps = 'Bonjour,\n\nDEMANDE DE RAPPEL POUR INSTALLATION CAM\u00c9RA(S).\n\n'
            + 'Site num\u00e9ro : ' + demandeCam.site + '\n'
            + 'Nombre de cam\u00e9ras souhait\u00e9es : ' + demandeCam.nb + '\n';
  if (demandeCam.precisions) corps += 'Pr\u00e9cisions : ' + demandeCam.precisions + '\n';
  corps += '\nCordialement,\n' + (reglages.nomUtilisateur || '');

  const cc = [EPS_CC_JOHANNA, reglages.emailEpsCc2, EPS_CC_SECRETARIAT]
    .filter((x) => x && x.trim()).join(',');
  location.href = 'mailto:' + EPS_TO + '?cc=' + encodeURIComponent(cc)
    + '&subject=' + encodeURIComponent(sujet)
    + '&body=' + encodeURIComponent(corps);
}

/** La photo du compteur du cycle : la nouvelle remplace toutes les anciennes. */
async function enregistrerCompteur(dataUrl) {
  const date = dateCompteurCycle(envoi.debut, envoi.fin);
  const nom = nomCompteur(reglages.plaqueVoiture, date);
  if (!await enregistrerPhoto(nom, dataUrl)) {
    toast('M\u00e9moire du navigateur pleine : envoyez le mensuel, puis reprenez.', 6000);
    return false;
  }
  // Une seule photo par cycle : les precedentes sont retirees, fichier compris,
  // ce qui nettoie au passage les doublons deja accumules.
  contenuPeriode(envoi.debut, envoi.fin).compteur.forEach((c) => {
    if (c.fileName !== nom) supprimerPhoto(c.fileName);
  });
  const autres = (entrees.compteur || []).filter(
    (c) => !dansPeriode(c.date, envoi.debut, envoi.fin));
  autres.push({ id: idUnique(), date: date, timestamp: Date.now(), fileName: nom });
  entrees.compteur = autres;
  ecrireEntrees(entrees);
  return true;
}

async function supprimerCompteur() {
  contenuPeriode(envoi.debut, envoi.fin).compteur
    .forEach((c) => supprimerPhoto(c.fileName));
  entrees.compteur = (entrees.compteur || []).filter(
    (c) => !dansPeriode(c.date, envoi.debut, envoi.fin));
  ecrireEntrees(entrees);
}

/** Feuille de partage d'iOS avec les pieces jointes ; telechargement en secours. */
async function partagerPieces(pieces, sujet, corps) {
  if (navigator.canShare && navigator.canShare({ files: pieces })) {
    try {
      await navigator.share({ files: pieces, title: sujet, text: corps });
      return 'partage';
    } catch (err) { if (err && err.name === 'AbortError') return 'annule'; }
  }
  for (const p of pieces) {
    const url = URL.createObjectURL(p);
    const a = document.createElement('a');
    a.href = url;
    a.download = p.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    await new Promise((r) => setTimeout(r, 300));
  }
  return 'telecharge';
}

async function validerEnvoi() {
  const v = envoi;
  if (!(v.debut && v.fin && v.debut <= v.fin)) {
    toast('La date de fin doit suivre celle de d\u00e9but.'); return;
  }
  const lot = contenuPeriode(v.debut, v.fin);
  if (!lot.compteur.length) {
    toast('La photo du compteur est obligatoire pour envoyer.'); return;
  }

  v.occupe = true;
  v.erreur = '';
  v.etat = '';
  rendre();

  const pieces = [];
  // Le compte-rendu du remplissage est garde a part : c'est ce que le tech
  // verifie en priorite, et le message final ne doit pas l'effacer.
  let rapportExcel = '';
  try {
    // Le classeur de depart : celui qu'on vient de choisir, sinon celui garde
    // du cycle precedent. C'est cette reprise qui fait l'accumulation.
    const source = v.fichier || (v.memoire ? v.memoire.octets : null);
    if (source) {
      v.etat = 'Remplissage du fichier Excel\u2026';
      rendre();
      const res = await remplirClasseur(source, lot.temps, lot.frais);
      const nomBase = v.nomFichier || (v.memoire ? v.memoire.nom : '') || 'TEMPS.xlsm';
      const base = nomBase.replace(/\.[^.]*$/, '')
        .replace(/[^A-Za-z0-9_.-]/g, '_') || 'TEMPS';
      pieces.push(new File([res.blob], base + '_' + v.debut + '.xlsm',
        { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' }));

      // Le classeur rempli devient la reference du prochain cycle : c'est
      // l'equivalent iOS de la reecriture sur place d'Android. Un echec de
      // memorisation (quota, stockage refuse) n'arrete pas l'envoi, il est
      // seulement signale - le tech saura qu'il devra rechoisir son fichier.
      const garde = await memoriserClasseur(nomBase, res.blob, v.debut, v.fin);
      if (garde) {
        v.memoire = garde;
        v.fichier = null;
        v.nomFichier = nomBase;
      }
      rapportExcel = 'Excel : ' + res.rapport.ecrites + ' ligne(s) \u00e9crite(s)'
        + (res.rapport.ajoutees
          ? ', ' + res.rapport.ajoutees + ' ligne(s) ajout\u00e9e(s)' : '')
        + ' sur ' + (res.rapport.feuilles.join(', ') || 'aucune feuille') + '. '
        + (garde ? 'Classeur m\u00e9moris\u00e9 pour le prochain cycle. '
                 : 'Classeur non m\u00e9moris\u00e9 : il sera \u00e0 rechoisir '
                   + 'au prochain envoi. ');
      v.etat = rapportExcel;
      if (res.rapport.avertissements.length) {
        v.erreur = res.rapport.avertissements.join(' ');
      }
    }
    // Les tickets gardent le nom qu'ils ont a la prise de vue (FRAIS-CAT-N) :
    // meme nom d'un envoi a l'autre, donc ecrasement propre cote bureau.
    lot.frais.forEach((t) => {
      const d = photo(t.fileName);
      if (d) pieces.push(fichierDepuisDataUrl(d, t.fileName));
    });
    const c = compteurDuCycle(lot.compteur);
    const dc = c ? photo(c.fileName) : null;
    if (dc) pieces.push(fichierDepuisDataUrl(dc, c.fileName));

    // Recap PDF en derniere piece, comme Android : le bureau l'ouvre sans
    // navigateur, et il porte le taux de NR du mois.
    // Primes du cycle : la regle CAM se juge sur TOUTES les interventions, pas
    // seulement celles du cycle, sinon une camera posee la veille du cycle
    // perdrait sa prime.
    const primes = primesParType(lot.gesteCo, datesInstallation(entrees.temps));
    const recap = genererRecap({
      nom: reglages.nomUtilisateur, plaque: reglages.plaqueVoiture,
      debut: v.debut, fin: v.fin,
      temps: lot.temps, frais: lot.frais, compteurs: lot.compteur,
      tempsTous: entrees.temps,
      primes: primes,
      totalPrimes: primes.reduce((a, p) => a + p.total, 0),
      totalExtensions: primes.reduce((a, p) => a + p.nb, 0),
    });
    pieces.push(new File([recap], nomFichierRecap(v.debut),
      { type: 'application/pdf' }));

    const sujet = 'FEUILLES DE TEMPS ' + dateFr(v.debut) + ' -> ' + dateFr(v.fin)
      + (reglages.plaqueVoiture ? ' - ' + reglages.plaqueVoiture : '');
    let corps = 'Bonjour,\n\nVeuillez trouver ci-joint, pour la p\u00e9riode du '
      + dateFr(v.debut) + ' au ' + dateFr(v.fin) + ' :\n\n';
    pieces.forEach((p) => { corps += '  - ' + p.name + '\n'; });
    corps += '\nCordialement,\n' + (reglages.nomUtilisateur || '');

    const resultat = await partagerPieces(pieces, sujet, corps);
    if (resultat === 'annule') {
      // Aucune DATE d'envoi n'est memorisee sur un partage annule : dater un
      // envoi qui n'a pas eu lieu ferait demarrer le cycle suivant trop tot, et
      // le cycle en cours deviendrait impossible a envoyer.
      //
      // Le classeur, lui, garde ce qui vient d'y etre ecrit - exactement comme
      // Android, qui remplit l'URI avant d'ouvrir le partage. Reenvoyer le meme
      // cycle est sans danger : les memes lignes retombent sur les memes
      // cellules, et les jours ont deja la place qu'il leur faut.
      v.etat = rapportExcel + 'Envoi annul\u00e9 : le cycle reste ouvert.';
    } else {
      // La periode reellement envoyee, avant que l'ecran ne passe au cycle
      // suivant : c'est elle qui nomme le dossier Drive.
      const debutEnvoye = v.debut;
      const finEnvoyee = v.fin;
      reglages = memoriserEnvoi(reglages, aujourdhuiIso());
      ecrireReglages(reglages);
      const suivant = cycleCourant(
        aujourdhuiIso(), reglages.cycleStartDay, reglages.lastEnvoiDateIso);
      v.debut = suivant[0];
      v.fin = suivant[1];
      // Le fichier choisi a la main a fait son office ; le classeur memorise,
      // lui, reste en place : c'est la base du cycle qui commence.
      v.fichier = null;
      v.nomFichier = v.memoire ? v.memoire.nom : '';
      v.etat = rapportExcel + pieces.length + ' pi\u00e8ce(s) '
        + (resultat === 'partage' ? 'transmises au partage' : 't\u00e9l\u00e9charg\u00e9es')
        + '. Prochain cycle : ' + dateFr(suivant[0]) + ' \u2192 ' + dateFr(suivant[1]) + '.';

      // Copie sur le Drive partage + stats du tableau de bord. Volontairement
      // non attendu : le technicien a deja son mail, et une coupure reseau ne
      // doit pas retenir l'ecran.
      deposerEnvoi(reglages, entrees, lot, debutEnvoye, finEnvoyee, pieces, corps)
        .then((n) => {
          const bloc = $('#e_drive');
          if (bloc) {
            bloc.textContent = n
              ? n + ' \u00e9l\u00e9ment(s) d\u00e9pos\u00e9s sur le Drive partag\u00e9.'
              : 'D\u00e9p\u00f4t Drive impossible pour l\'instant : il se refera '
                + 'au prochain envoi.';
          }
        })
        .catch(() => {});
    }
  } catch (err) {
    v.erreur = 'Erreur : ' + ((err && err.message) ? err.message : String(err));
  }
  v.occupe = false;
  rendre();
}

// ======================================================= INTERACTIONS
document.addEventListener('click', (e) => {
  if (e.target.closest('#e_cycle')) {
    const c = cycleCourant(
      aujourdhuiIso(), reglages.cycleStartDay, reglages.lastEnvoiDateIso);
    envoi.debut = c[0];
    envoi.fin = c[1];
    rendre(); return;
  }
  if (e.target.closest('#e_oublier')) {
    // Changement de trame (nouvelle annee, classeur reparti a neuf) : on rend
    // la main au selecteur de fichier, la reference actuelle est jetee.
    oublierClasseur().then(() => {
      envoi.memoire = null;
      envoi.nomFichier = '';
      envoi.fichier = null;
      rendre();
      toast('Classeur oublié : choisissez le fichier à reprendre.');
    }).catch(() => {});
    return;
  }
  if (e.target.closest('#e_suppr_compteur')) {
    supprimerCompteur();
    rendre(); toast('Photo du compteur supprim\u00e9e.'); return;
  }
  if (e.target.closest('#e_copier')) {
    const liste = destinatairesEnvoi().join(', ');
    navigator.clipboard.writeText(liste)
      .then(() => toast('Destinataires copi\u00e9s : collez-les dans le champ \u00ab \u00c0 \u00bb.'))
      .catch(() => toast(liste, 8000));
    return;
  }
  if (e.target.closest('#e_envoyer')) { validerEnvoi(); return; }

  if (e.target.closest('#diag_imprimer')) {
    // L'impression doit partir du CADRE, sinon c'est la coquille de
    // l'application qui s'imprime a la place de la fiche.
    const c = $('#diag_cadre');
    if (c && c.contentWindow) c.contentWindow.print();
    return;
  }
  if (e.target.closest('#d_valider')) { envoyerDemandeCam(); return; }
  if (e.target.closest('#p_eff_ab')) { if (padAb) padAb.effacer(); return; }
  if (e.target.closest('#p_eff_tech')) { if (padPvTech) padPvTech.effacer(); return; }
  if (e.target.closest('#p_valider')) { validerPv(); return; }

  const nat = e.target.closest('#b_natures button');
  if (nat) {
    lireBulletin();
    const k = nat.dataset.nature;
    bulletin.natures[k] = !bulletin.natures[k];
    rendre(); return;
  }
  const forf = e.target.closest('#b_forfait button');
  if (forf) {
    lireBulletin();
    bulletin.forfaitLocatif = forf.dataset.forfait === 'loc';
    bulletin.forfaitAcquisition = !bulletin.forfaitLocatif;
    rendre(); return;
  }
  const sg = e.target.closest('#b_signe button');
  if (sg) {
    lireBulletin();
    const val = sg.dataset.signe;
    if (val === 'IDEM') { bulletin.mensIdem = !bulletin.mensIdem; }
    else {
      bulletin.mensIdem = false;
      bulletin.mensSigne = bulletin.mensSigne === val ? '' : val;
    }
    rendre(); return;
  }
  if (e.target.closest('#b_ajout_ligne')) {
    lireBulletin();
    bulletin.lignes.push({ detail: '', reference: '', qte: '', pu: '' });
    rendre(); return;
  }
  if (e.target.closest('#b_eff_tech')) { if (padTech) padTech.effacer(); return; }
  if (e.target.closest('#b_eff_client')) { if (padClient) padClient.effacer(); return; }
  if (e.target.closest('#b_valider')) { validerBulletin(); return; }

  const typeC = e.target.closest('#c_type button');
  if (typeC) {
    lireConge(); conge.congesPayes = typeC.dataset.paye === '1'; rendre(); return;
  }
  if (e.target.closest('#c_effacer')) { if (pad) pad.effacer(); return; }
  if (e.target.closest('#c_valider')) { validerConge(); return; }

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
  if (ecran === 'envoi') {
    if (e.target.id === 'e_xlsm') {
      const f = e.target.files && e.target.files[0];
      if (f) {
        envoi.fichier = f;
        envoi.nomFichier = f.name;
        envoi.etat = '';
        envoi.erreur = '';
        rendre();
      }
      return;
    }
    if (e.target.id === 'e_compteur') {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        if (await enregistrerCompteur(await reduire(f))) {
          rendre(); toast('Photo du compteur enregistr\u00e9e.');
        }
      } catch (err) { toast('Photo illisible, reprenez-la.'); }
      return;
    }
    if (e.target.matches('#e_du, #e_au')) {
      envoi.debut = $('#e_du').value || envoi.debut;
      envoi.fin = $('#e_au').value || envoi.fin;
      rendre();
      return;
    }
    return;
  }
  if (ecran === 'pv') {
    if (e.target.matches('#p_mint, #p_mext, #p_antic')) { lirePv(); rendre(); }
    return;
  }
  if (ecran === 'bulletin') {
    if (e.target.matches('[data-champ="detail"], #b_frais, #b_ht')) {
      lireBulletin(); rendre();
    }
    return;
  }
  if (ecran !== 'formulaire') return;
  if (e.target.matches('#f_type, #f_obs, #g_actif, #g_eps')) {
    lireFormulaire(); rendre();
  }
});

// Apercu du message tenu a jour pendant la frappe.
document.addEventListener('input', (e) => {
  if (ecran === 'ticket') { lireTicket(); rendreMontants(); return; }
  if (ecran === 'pv') {
    if (e.target.matches('#p_ext, #p_int, #p_torus')) { lirePv(); rendre(); }
    return;
  }
  if (ecran !== 'formulaire') return;
  lireFormulaire();
  const a = $('#apercu');
  if (a) a.innerHTML = 'Message : <b>' + ech(messageCloture(brouillon)) + '</b>';
  // Les totaux GESTE CO seuls sont redessines : un rendu complet fermerait le
  // clavier a chaque chiffre saisi dans la grille.
  const t = $('#g_totaux');
  if (t) t.innerHTML = totauxGeste();
  // Le n\u00b0 de site devient obligatoire des la premiere extension offerte : son
  // etoile doit suivre la frappe, pas attendre le rendu suivant.
  const c = $('#g_champ_site');
  if (c) {
    const requis = besoinSite(geste);
    c.classList.toggle('requis', requis);
    const l = c.querySelector('label');
    if (l) l.textContent = 'N\u00b0 de site' + (requis ? '' : ' (facultatif)');
  }
});

window.addEventListener('online', rendre);
window.addEventListener('offline', rendre);

// Les vignettes sont lues en memoire pendant le rendu, qui est synchrone : la
// base doit etre chargee avant le premier affichage, sinon les photos
// manqueraient a l'ecran jusqu'au rendu suivant.
await chargerPhotos();

ecran = reglagesComplets(reglages) ? 'accueil' : 'reglages';
rendre();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
