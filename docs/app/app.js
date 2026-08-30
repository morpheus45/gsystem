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
import { genererConge, nomFichierConge } from './docConge.js';
import { genererBulletin, refFormatee, eur2, FRAIS_INTERVENTION }
  from './docBulletin.js';
import { creerPad } from './signature.js';

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
let conge = null;              // demande de conge en cours
let pad = null;                // pad de signature (conge)
let padTech = null;            // bulletin : signature du technicien
let padClient = null;          // bulletin : signature du client
let bulletin = null;           // bulletin en cours de saisie

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

// ============================================================== RENDU
function rendre() {
  const vues = {
    reglages: vueReglages, cloture: vueCloture, formulaire: vueFormulaire,
    frais: vueFrais, ticket: vueTicket, conge: vueConge,
    bulletin: vueBulletin,
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
}

function aller(ou) {
  if (ou === 'nouvelle') {
    brouillon = entreeVide(reglages);
    if (reglages.pendingArrivalMs > 0) {
      brouillon.heureDebut = heureDe(reglages.pendingArrivalMs);
    }
    ecran = 'formulaire';
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
  const blob = genererConge(donnees);
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

// ======================================================= INTERACTIONS
document.addEventListener('click', (e) => {
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
  if (ecran === 'bulletin') {
    if (e.target.matches('[data-champ="detail"], #b_frais, #b_ht')) {
      lireBulletin(); rendre();
    }
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
