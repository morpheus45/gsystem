// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';
import { alertes, kmMoyenParMois, CT_VOITURE, prochaineEcheance, kmParMois, conducteurA, limiteDesignation, ANTAI, statutPhoto, planEntretien, detecterDoublonsCompteur } from '../core/vehicules.js';
import { heuresJour, cumulSemaines, semaineIso } from '../core/heures.js';
import { ligneFrais, totauxFrais } from '../core/frais.js';
import { reglesDe } from '../core/societes.js';
import { repartition, tauxNr } from '../core/stats.js';
import { primesDuMois, moisDesPrimes, primePayee } from '../core/primes.js';
import { dureeMinutes, texteDuree, filtrer, libelleResultat } from '../core/interventions.js';
import { zipStocke } from '../core/zip.js';
import { finProposee, lendemain } from '../core/periodes.js';
import { TYPES_CHAMP, cleChamp, defautModule, enService } from '../core/modules-perso.js';
import { moduleActif } from '../core/organisation.js';
import { TUILES_APK, tuileVisible } from '../core/tuiles-apk.js';
import { reponses, lireSaisie } from '../core/saisies.js';
import { exigence, etatDocument, limiteDocument } from '../core/documents.js';
import { normaliserNir, normaliserPermis, masquer, grouperNir } from '../core/papiers.js';
import { normaliserSiren, normaliserSiret, normaliserTelFr, normaliserEmail } from '../core/tiers.js';
import { normaliserReference, normaliserEan13, normaliserLibelle } from '../core/articles.js';
import { joursAvantPeremption, statutPeremption } from '../core/peremption.js';
import { dureeJours, enCours } from '../core/location.js';
import { normaliserCodeTech } from '../core/code-tech.js';
import { recapFacturation, montantsFacture, lignesManquantes } from '../core/facturation.js';
import { variablesPaie, versCsv, texteCsv } from '../core/paie.js';
import { controles, releve, ecritures, versCsvFec, PARAMS_DEFAUT } from '../core/compta.js';
import { regrouper, proposerLots } from '../core/signalements.js';
import { OBJETS_3D } from './objets3d.js';
import { compteur, anneau, barres, avatar, entree, installerPastille, placerPastille, orbite, variation, miniCourbe, pastille, pilulesDepuisSelect } from './rendu.js';
import { courbe, majCourbe } from './courbe.js';
import { ouvrirPalette, installerRaccourci } from './recherche.js';
import { ouverture } from './ouverture.js';

const sb = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE);

let session = null;
let societes = [];
let holdings = [];
let modulesSaisis = [];   // modules personnalisés remplis ou en service dans la société (admin, gestion)
let selectedSociete = null;
let superAdmin = false;   // opérateur de la plateforme : accès à tout (vérifié par la base)
// Responsable de secteur : ses cases (domaine -> peut modifier). null = autre rôle. La base refuse de toute façon le reste.
let responsable = null;
let ongletOuvert = 'bord', pageRestauree = false;
const DOMAINE_ONGLET = { interventions: 'interventions', conges: 'conges', messages: 'messages', vehicules: 'vehicules', paie: 'paie',
  compta: 'compta', facturation: 'facturation', saisies: 'saisies', techniciens: 'frais' };
const ongletDuResponsable = (o) => o === 'techniciens' || responsable.droits.has(DOMAINE_ONGLET[o]);
let monRole = null;       // rôle de l'utilisateur dans la société sélectionnée
let modulesFinsOuverts = new Set();   // modules fins (catalogue) allumés sur Bureau pour la société
let modulesActifs = null; // modules actifs de la société sélectionnée (absence d'un module = actif)
const MODULES_LISTE = ['interventions','heures','frais','vehicules','conges','paie','compta','facturation','messages','documents'];
const LIBELLE_MODULE = {
  interventions: 'Interventions', heures: 'Heures', frais: 'Frais', vehicules: 'Véhicules',
  conges: 'Congés', paie: 'Paie', compta: 'Compta', facturation: 'Facturation', messages: 'Messages', documents: 'Documents'
};
let vehiculeActif = null; // véhicule ouvert dans le panneau de détail
let techniciens = [];     // cache de la société courante (pour les select)
let ficheTechnicien = null; // technicien ouvert dans la fiche (null = fermée)
let messages = [], chatTech = null, relanceChat = null;
let listeVehicules = [];   // véhicules de la société (plan d'entretien : même modèle)
let listeAffectations = []; // affectations de la société courante

// Peut-on écrire dans la société courante ? La base refuse de toute façon le reste.
function peutEcrire() {
  // Responsable de secteur : selon la case « modifier » de l'écran ouvert.
  if (responsable) return responsable.droits.get(DOMAINE_ONGLET[ongletOuvert]) === true;
  return superAdmin || ['admin', 'gestion'].includes(monRole);
}
const peutCompta = () => superAdmin || ['admin', 'comptable'].includes(monRole);   // comptes et leur validation

const $ = (sel) => document.querySelector(sel);

// La base rend 1 000 lignes au plus par requête : au-delà, on lit page par page
// (sinon une paie de 30 techniciens serait calculée sur des données tronquées, sans erreur).
async function toutLire(requete) {
  const q = requete.order('id');   // ordre stable d'une page à l'autre
  const tout = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q.range(de, de + 999);
    if (error) throw error;
    tout.push(...data);
    if (data.length < 1000) return tout;
  }
}
const $$ = (sel) => document.querySelectorAll(sel);

// Ligne de tableau construite en textContent : un nom ou un email piégé reste du texte.
function ligne(valeurs) {
  const tr = document.createElement('tr');
  for (const v of valeurs) tr.appendChild(document.createElement('td')).textContent = v;
  return tr;
}

// Téléphone : chaque cellule porte le titre de sa colonne ; le CSS affiche alors
// chaque ligne comme une fiche « Titre : valeur » (aucun défilement de côté).
function etiqueterTableaux() {
  for (const table of document.querySelectorAll('table')) {
    const titres = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    for (const tr of table.querySelectorAll('tbody tr')) {
      [...tr.children].forEach((td, i) => { td.dataset.label = titres[i] ?? ''; });
    }
  }
}
let etiquetage = 0;
new MutationObserver(() => { cancelAnimationFrame(etiquetage); etiquetage = requestAnimationFrame(etiqueterTableaux); })
  .observe(document.body, { childList: true, subtree: true });

// Point rouge « à traiter » ; le texte (invisible à l'œil) est lu par les lecteurs d'écran.
function marquer(el, actif) {
  if (!el) return;
  el.querySelector(':scope > .point')?.remove();
  if (actif) el.appendChild(document.createElement('span')).className = 'point';
  if (actif) el.lastChild.textContent = ' (à traiter)';
}
const sousOnglet = (cible) => $(`.sous-onglets button[data-cible="${cible}"]`);
const dansJours = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Ce qui attend une action dans une société : congés à répondre ; échéances dépassées ou
// à moins de 30 jours ; amendes à désigner sous 7 jours ; mois de paie terminés non clôturés.
async function tachesSociete(sid) {
  const compte = (table) => sb.from(table).select('id', { count: 'exact', head: true }).eq('societe_id', sid);
  const [c, e, a, p] = await Promise.all([
    compte('conges').eq('statut', 'demandee'),
    compte('echeances').is('fait_le', null).not('date', 'is', null).lte('date', dansJours(30)),
    sb.from('amendes').select('date_avis').eq('societe_id', sid).eq('statut', 'a_traiter'),
    compte('periodes_paie').neq('statut', 'exportee').lt('fin', dansJours(0)),
  ]);
  const amendes = (a.data || []).filter((x) => limiteDesignation(x.date_avis) <= dansJours(7)).length;
  return { conges: c.count || 0, vehicules: (e.count || 0) + amendes, paie: p.count || 0 };
}

async function majPoints() {
  if (!selectedSociete) return;
  const t = await tachesSociete(selectedSociete);
  for (const onglet of ['conges', 'vehicules', 'paie']) marquer($(`.tab[data-tab="${onglet}"]`), t[onglet] > 0);
}

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#${id}`).classList.add('active');
}

function afficherSousOnglet(conteneur, cible) {
  const section = $(`#${cible}`);
  if (!section || !conteneur.contains(section)) return;
  [...conteneur.querySelectorAll(':scope > .sous-section')].forEach(s => s.classList.toggle('hidden', s !== section));
  conteneur.querySelectorAll(':scope > .sous-onglets button').forEach(b => b.classList.toggle('active', b.dataset.cible === cible));
  // Fiche technicien : le contenu suit les onglets ; résumé avec les interventions, pas de mois pour les papiers.
  conteneur.querySelector(':scope > .tech-resume-carte')?.classList.toggle('hidden', cible !== 'tech-section-interventions');
  conteneur.querySelector(':scope > .tech-barre')?.classList.toggle('hidden', ['tech-section-papiers', 'tech-section-telephone'].includes(cible));
}

function initialiserSousOnglets(conteneur) {
  const premier = conteneur.querySelector(':scope > .sous-onglets button');
  if (premier) afficherSousOnglet(conteneur, premier.dataset.cible);
}

function plaqueLogo(logo, alt) {
  const plaque = document.createElement('span');
  plaque.className = 'logo-plaque';
  const img = plaque.appendChild(document.createElement('img'));
  img.src = logo;
  img.alt = alt;
  return plaque;
}

// En-tête de la société ouverte : « logo + Back-office » si elle a un logo (il dit déjà son nom),
// sinon « Back-office Société C ». Hors société : « Back-office ».
function afficherMarque() {
  const s = societes.find((x) => x.id === selectedSociete);
  $('#marque-titre').textContent = s && !s.logo ? `Back-office ${s.nom}` : 'Back-office';
  document.title = s ? `Back-office ${s.nom}` : 'Back-office';
  $('#marque-plaque').classList.toggle('hidden', !s?.logo);
  if (s?.logo) { $('#marque-logo').src = s.logo; $('#marque-logo').alt = `Logo ${s.nom}`; }
}

function mettreAJourFil() {
  afficherMarque();
  // Dans une fiche, un seul retour : « ← Techniciens » / « ← Véhicules » (le fil d'Ariane fait le reste).
  noterPage();
  $('#retour-societes').classList.toggle('hidden', !!(vehiculeActif || ficheTechnicien));
  const fil = $('#fil');
  fil.replaceChildren();
  const societesBtn = document.createElement('button');
  societesBtn.type = 'button';
  societesBtn.textContent = 'Sociétés';
  societesBtn.addEventListener('click', retournerSocietes);
  fil.appendChild(societesBtn);
  if (!selectedSociete) { fil.style.display = 'none'; return; }
  fil.appendChild(document.createTextNode(' › '));
  const societe = societes.find(s => s.id === selectedSociete);
  const societeNom = societe?.nom || 'Société';
  if (!vehiculeActif && !ficheTechnicien) {   // niveau société : son nom est le dernier élément
    const dernier = document.createElement('span');
    dernier.className = 'cle';
    dernier.textContent = societeNom;
    fil.appendChild(dernier);
    fil.style.display = 'flex';
    return;
  }
  const societeBtn = document.createElement('button');
  societeBtn.type = 'button';
  societeBtn.textContent = societeNom;
  societeBtn.addEventListener('click', () => { fermerPanneauVehicule(); fermerFicheTechnicien(); });
  fil.appendChild(societeBtn);
  fil.appendChild(document.createTextNode(' › '));
  if (vehiculeActif) {
    const vehiculesBtn = document.createElement('button');
    vehiculesBtn.type = 'button';
    vehiculesBtn.textContent = 'Véhicules';
    vehiculesBtn.addEventListener('click', fermerPanneauVehicule);
    fil.appendChild(vehiculesBtn);
    fil.appendChild(document.createTextNode(' › '));
    const dernier = document.createElement('span');
    dernier.className = 'cle';
    dernier.textContent = vehiculeActif.plaque;
    fil.appendChild(dernier);
  } else {
    const techniciensBtn = document.createElement('button');
    techniciensBtn.type = 'button';
    techniciensBtn.textContent = 'Techniciens';
    techniciensBtn.addEventListener('click', fermerFicheTechnicien);
    fil.appendChild(techniciensBtn);
    fil.appendChild(document.createTextNode(' › '));
    const dernier = document.createElement('span');
    dernier.className = 'cle';
    dernier.textContent = ficheTechnicien.nom;
    fil.appendChild(dernier);
  }
  fil.style.display = 'flex';
}

function retournerSocietes() {
  fermerPanneauVehicule();
  fermerFicheTechnicien();
  selectedSociete = null;
  monRole = null;
  responsable = null;
  $('#societe-detail').classList.add('hidden');
  $('#niveau-societes').classList.remove('hidden');
  renderSocietes();
  mettreAJourFil();
}

// Onglets liés à un module de la société (les autres — tableau de bord, techniciens, membres… — restent visibles).
const ONGLETS_MODULES = ['interventions', 'conges', 'messages', 'vehicules', 'paie', 'compta', 'facturation'];

// Basculer d'onglet
function switchOnglet(tabId, calculer = true) {
  cacherApercu();   // une bulle photo ne survit jamais à un changement d'écran

  // Module désactivé pour la société : on ne l'ouvre pas, on repart au tableau de bord.
  const onglet = tabId.replace('panel-', '');
  if (modulesActifs && ONGLETS_MODULES.includes(onglet) && !modulesActifs.has(onglet)) {
    tabId = 'panel-bord';
  }
  if (responsable && !ongletDuResponsable(tabId.replace('panel-', ''))) tabId = 'panel-techniciens';
  ongletOuvert = tabId.replace('panel-', '');

  $$('.tab').forEach(b => {
    const actif = `panel-${b.dataset.tab}` === tabId;   // data-tab="vehicules" -> #panel-vehicules
    // Onglet d'un module désactivé : masqué (le module ne se charge pas)
    // ou réservé à un rôle : les remontrer ici annulerait ce masquage.
    const masque = (modulesActifs && ONGLETS_MODULES.includes(b.dataset.tab) && !modulesActifs.has(b.dataset.tab))
      || (['signalements', 'modules'].includes(b.dataset.tab) && !superAdmin)
      || (responsable ? !ongletDuResponsable(b.dataset.tab) : b.dataset.tab === 'messages' && !peutEcrire())
      || (b.dataset.tab === 'saisies' && !modulesSaisis.length)
      || (b.dataset.tab === 'clients' && !modulesFinsOuverts.has('clients'))
      || (b.dataset.tab === 'articles' && !modulesFinsOuverts.has('articles'))
      || (b.dataset.tab === 'devis' && !modulesFinsOuverts.has('devis'))
      || (b.dataset.tab === 'factures' && !modulesFinsOuverts.has('factures'))
      || (b.dataset.tab === 'reglements' && !modulesFinsOuverts.has('reglements'))
      || (b.dataset.tab === 'stock' && !modulesFinsOuverts.has('stock'))
      || (b.dataset.tab === 'inventaires' && !modulesFinsOuverts.has('inventaires'))
      || (b.dataset.tab === 'peremption' && !modulesFinsOuverts.has('peremption'))
      || (b.dataset.tab === 'location_contrats' && !modulesFinsOuverts.has('location_contrats'))
      || (b.dataset.tab === 'fournisseurs' && !modulesFinsOuverts.has('fournisseurs'));
    b.classList.toggle('hidden', !!masque);
    b.classList.toggle('active', actif && !masque);
    if (actif && !masque) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');   // section ouverte du menu
  });
  // Barres de catégorie : visibles seulement si au moins un de leurs modules est allumé.
  $('#groupe-commerce').classList.toggle('hidden', !['clients', 'articles', 'devis', 'factures', 'reglements'].some((c) => modulesFinsOuverts.has(c)));
  $('#groupe-stock').classList.toggle('hidden', !['stock', 'inventaires', 'peremption'].some((c) => modulesFinsOuverts.has(c)));
  $('#groupe-location').classList.toggle('hidden', !['location_contrats', 'etats_lieux'].some((c) => modulesFinsOuverts.has(c)));
  $('#groupe-achats').classList.toggle('hidden', !['fournisseurs', 'achats', 'receptions'].some((c) => modulesFinsOuverts.has(c)));
  if (responsable) reglerEcriture();
  placerPastille($('.tabs'));   // la pastille blanche glisse vers la section ouverte
  for (const id of ['panel-bord', 'panel-membres', 'panel-techniciens', 'panel-vehicules', 'panel-paie', 'panel-facturation', 'panel-compta', 'panel-conges', 'panel-interventions', 'panel-messages', 'panel-saisies', 'panel-signalements', 'panel-modules', 'panel-clients', 'panel-articles', 'panel-devis', 'panel-factures', 'panel-reglements', 'panel-stock', 'panel-inventaires', 'panel-peremption', 'panel-location_contrats', 'panel-fournisseurs']) {
    $(`#${id}`).classList.toggle('hidden', id !== tabId);
  }
  fermerPanneauVehicule();
  fermerFicheTechnicien();
  if (tabId === 'panel-paie') chargerPaie();
  if (tabId === 'panel-conges') chargerConges();
  if (tabId === 'panel-bord' && calculer) chargerBord();
  if (tabId === 'panel-facturation') chargerFacturation();
  if (tabId === 'panel-compta') chargerCompta();
  if (tabId === 'panel-interventions') chargerInterventions();
  if (tabId === 'panel-signalements') chargerSignalements();
  if (tabId === 'panel-modules') chargerModules();
  if (tabId === 'panel-clients') chargerClients();
  if (tabId === 'panel-articles') chargerArticles();
  if (tabId === 'panel-devis') chargerDevis();
  if (tabId === 'panel-factures') chargerFactures();
  if (tabId === 'panel-reglements') chargerReglements();
  if (tabId === 'panel-stock') chargerStock();
  if (tabId === 'panel-inventaires') chargerInventaires();
  if (tabId === 'panel-peremption') chargerPeremption();
  if (tabId === 'panel-location_contrats') chargerLocation();
  if (tabId === 'panel-fournisseurs') chargerFournisseurs();
  if (tabId === 'panel-saisies') chargerSaisies();
  if (tabId === 'panel-membres') renderResponsables();
  noterPage();
  clearInterval(relanceChat);
  if (tabId === 'panel-messages') { chargerMessages(); relanceChat = setInterval(chargerMessages, 5000); }
}

function fermerPanneauVehicule() {
  vehiculeActif = null;
  $('#vehicule-detail').classList.add('hidden');
  $('#vehicules-liste').classList.remove('hidden');
  mettreAJourFil();
}

function fermerFicheTechnicien() {
  ficheTechnicien = null;
  $('#tech-fiche').classList.add('hidden');
  $('#tech-liste').classList.remove('hidden');
  mettreAJourFil();
}

function alert(message, type = 'error') {
  const el = $('#alert');
  el.textContent = message;
  el.className = `alert ${type} show`;
  setTimeout(() => { el.classList.remove('show'); }, 5000);
}

function clearAlert() {
  $('#alert').classList.remove('show');
}

async function login(email, password) {
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;   // la suite est faite par onAuthStateChange
  } catch (err) {
    alert(err.message || 'Erreur de connexion');
  }
}

async function signup(email, password) {
  try {
    const { data, error } = await sb.auth.signUp({ email, password });   // retour : « Site URL » de Supabase
    if (error) throw error;
    if (!data.session) {
      alert('Un email de confirmation vous a été envoyé. Cliquez sur le lien, puis connectez-vous.', 'success');
      showScreen('login-screen');
    }
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'inscription');
  }
}

async function logout() {
  try {
    await sb.auth.signOut();
    session = null;
    societes = [];
    selectedSociete = null;
    superAdmin = false;
    responsable = null;
    pageRestauree = false;
    try { localStorage.removeItem(CLE_PAGE); } catch (e) { /* rien */ }
    for (const id of ['#operator-section', '#admin-tools', '#societe-detail']) $(id).classList.add('hidden');
    $('#niveau-societes').classList.remove('hidden');
    $('#fil').style.display = 'none';
    showScreen('login-screen');
  } catch (err) {
    alert(err.message || 'Erreur lors de la déconnexion');
  }
}

async function init() {
  try {
    const { data: accepted, error: rpcErr } = await sb.rpc('accepter_invitations');
    if (rpcErr) throw rpcErr;
    if (accepted > 0) {
      alert(`Vous avez rejoint ${accepted} société(s).`, 'success');
    }
    await checkOperator();
    await loadSocietes();
    signatureDroits = superAdmin ? null : await lireSignature();   // point de départ de la surveillance
    await restaurerPage();
  } catch (err) {
    alert(err.message || 'Erreur d\'initialisation');
  }
}

async function checkOperator() {
  try {
    const { data, error } = await sb.from('operateurs').select('user_id');
    if (error) throw error;
    superAdmin = data.length > 0;
    $('#operator-section').classList.toggle('hidden', !superAdmin);
    mettreAJourVisibiliteSignalements();
  } catch (err) {
    console.error(err);
  }
}

async function loadSocietes() {
  try {
    const [socData, holdData] = await Promise.all([
      sb.from('societes').select('id, nom, adresse, siret, logo, holding_id').order('nom'),
      sb.from('holdings').select('id, nom').order('nom'),
    ]);
    if (socData.error) throw socData.error;
    if (holdData.error) throw holdData.error;
    societes = socData.data;
    holdings = holdData.data;
    renderSocietes();
    chargerOrganisation();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des sociétés');
  }
}

function renderSocietes() {
  const ul = $('#societes-list');
  ul.replaceChildren();
  $('#titre-societes').textContent = superAdmin ? 'Toutes les sociétés' : 'Mes sociétés';
  if (societes.length === 0) {
    const li = ul.appendChild(document.createElement('li'));
    li.className = 'empty';
    li.textContent = superAdmin ? "Aucune société pour l'instant." : "Vous n'êtes membre d'aucune société pour l'instant.";
    return;
  }
  const sansHolding = [];
  for (const s of societes) {
    // Une personne d'une seule société ne lit pas la holding : pas de titre.
    if (holdings.some((h) => h.id === s.holding_id)) {
      let group = ul.querySelector(`[data-holding-id="${s.holding_id}"]`);
      if (!group) {
        const h = holdings.find((x) => x.id === s.holding_id);
        group = document.createElement('li');
        group.className = 'holding-group';
        group.dataset.holdingId = s.holding_id;
        const titre = group.appendChild(document.createElement('h4'));
        titre.className = 'holding-titre';
        titre.textContent = h ? `Holding ${h.nom}` : 'Holding';
        ul.appendChild(group);
      }
      appendSocieteItem(group, s);
    } else {
      sansHolding.push(s);
    }
  }
  for (const s of sansHolding) appendSocieteItem(ul, s);
}

function appendSocieteItem(container, s) {
  const li = document.createElement('li');
  li.className = 'societe-item';
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'button');
  if (selectedSociete === s.id) li.classList.add('selected');
  if (s.logo) li.appendChild(plaqueLogo(s.logo, ''));
  else li.prepend(avatar(s.nom));
  const nom = li.appendChild(document.createElement('div'));
  nom.textContent = s.nom;
  nom.className = 'societe-name';
  const ouvrir = () => selectSociete(s.id);
  li.addEventListener('click', ouvrir);
  li.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      ouvrir();
    }
  });
  container.appendChild(li);
  tachesSociete(s.id).then((t) => marquer(li, t.conges + t.vehicules + t.paie > 0));
}

// === ORGANISATION (super admin) : holdings, patrons, sociétés et tous les modules au même endroit ===
let reglagesHolding = [], reglagesSociete = [], admins = {}, orgCible = null, lectureOrg = 0;

async function chargerOrganisation() {
  $('#organisation').classList.toggle('hidden', !superAdmin);
  if (!superAdmin) return;
  const tour = ++lectureOrg;
  const [mh, ms, m, v, p, t, ...listes] = await Promise.all([
    sb.from('modules_holding').select('holding_id, module, actif'),
    sb.from('modules_societe').select('societe_id, module, actif'),
    sb.from('modules_perso').select('id, nom, icone, couleur, finalite, version, actif').order('nom'),
    sb.from('modules_perso_versions').select('module_id, version, champs'),
    sb.from('modules_perso_portee').select('module_id, holding_id, societe_id, actif, supports'),
    sb.from('tuiles_reglages').select('tuile, holding_id, societe_id, visible'),
    ...holdings.map((h) => sb.rpc('admins_holding', { h: h.id })),
  ]);
  if (tour !== lectureOrg) return;
  const erreur = [mh, ms, m, v, p, t, ...listes].find((x) => x.error)?.error;
  $('#org-contenu').classList.toggle('hidden', !!erreur);
  $('#org-erreur').textContent = erreur ? `Lecture impossible : ${erreur.message}` : '';
  if (erreur) return;
  [reglagesHolding, reglagesSociete, portees, tuilesReglages] = [mh.data, ms.data, p.data, t.data];
  modulesPerso = m.data.map((x) => ({ ...x, champs: v.data.find((y) => y.module_id === x.id && y.version === x.version)?.champs || [],
    cles: v.data.filter((y) => y.module_id === x.id).flatMap((y) => y.champs.map((c) => c.cle)) }));
  admins = Object.fromEntries(holdings.map((h, i) => [h.id, listes[i].data]));
  renderOrganisation();
}

async function orgAction(rpc, args, texte) {
  const { data, error } = await sb.rpc(rpc, args);
  if (error) { alert(error.message); return null; }
  if (texte) alert(typeof texte === 'function' ? texte(data) : texte, 'success');
  await loadSocietes();
  return data ?? true;
}

function renderOrganisation() {
  const carte = (titre, sous, enfants) => {
    const c = elt('article', 'org-holding');
    const tete = elt('div', 'org-tete');
    tete.append(elt('strong', null, titre), elt('span', 'aide', sous));
    c.append(tete, ...enfants);
    return c;
  };
  const boutonCible = (cible, texte) => {
    const b = boutonModule(texte, 'secondary', () => { orgCible = cible; renderOrganisation(); $('#org-modules').scrollIntoView({ block: 'start' }); });
    b.setAttribute('aria-pressed', String(orgCible?.h === cible.h && orgCible?.s === cible.s));
    return b;
  };
  const ligneSociete = (soc) => {
    const l = elt('div', 'org-ligne'), choix = elt('select');
    choix.setAttribute('aria-label', `Holding de ${soc.nom}`);
    choix.add(new Option('Sans holding', ''));
    for (const h of holdings) choix.add(new Option(h.nom, h.id));
    choix.value = soc.holding_id || '';
    choix.addEventListener('change', async () => {
      const h = holdings.find((x) => x.id === choix.value);
      if (!confirm(h ? `Mettre « ${soc.nom} » dans la holding « ${h.nom} » ? Son patron la verra et la gérera.` : `Sortir « ${soc.nom} » de sa holding ? Le patron de la holding ne la verra plus.`)) { choix.value = soc.holding_id || ''; return; }
      if (!await orgAction('rattacher_societe', { s: soc.id, h: choix.value || null })) choix.value = soc.holding_id || '';
    });
    const actions = elt('div', 'org-actions');
    actions.append(choix, boutonCible({ h: null, s: soc.id }, 'Modules'), boutonModule('Ouvrir', 'secondary', () => selectSociete(soc.id)));
    l.append(elt('span', 'org-nom', soc.nom), actions);
    return l;
  };
  const cartes = holdings.map((h) => {
    const siennes = societes.filter((x) => x.holding_id === h.id), patrons = admins[h.id] || [];
    const boutons = elt('div', 'org-actions');
    boutons.append(boutonCible({ h: h.id, s: null }, 'Modules de la holding'), boutonModule('Renommer', 'secondary', () => {
      const nom = prompt('Nom de la holding :', h.nom);
      if (nom && nom.trim() !== h.nom) orgAction('enregistrer_holding', { h: h.id, p_nom: nom });
    }));
    const liste = elt('div', 'org-patrons');
    liste.append(...patrons.map((a) => {
      const l = elt('div', 'org-ligne');
      const retirer = boutonModule('Retirer', 'danger', () => {
        if (confirm(`Retirer ${a.email} ? Cette personne ne verra plus la holding « ${h.nom} ».`)) orgAction('retirer_admin_holding', { h: h.id, p_email: a.email });
      });
      l.append(elt('span', 'org-nom', a.email), pastille(a.etat === 'actif' ? 'Patron' : 'Invité', a.etat === 'actif' ? 'ok' : 'neutre'), retirer);
      return l;
    }));
    if (!patrons.length) liste.append(elt('p', 'aide', 'Aucun patron nommé : toi seul vois cette holding.'));
    const f = elt('form', 'org-form'), e = elt('input'), id = `org-patron-${h.id}`;
    const lab = elt('label', 'lecteur-seul', `Email du patron de ${h.nom}`);
    e.type = 'email'; e.required = true; e.id = id; e.placeholder = 'Email du patron'; lab.htmlFor = id;
    f.append(lab, e, elt('button', 'secondary', 'Nommer'));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!confirm(`Nommer ${e.value.trim()} patron de « ${h.nom} » ? Cette personne verra et gérera toutes ses sociétés.`)) return;
      await orgAction('nommer_admin_holding', { h: h.id, p_email: e.value }, (d) => (d === 'nomme' ? 'Patron nommé.'
        : 'Invitation enregistrée : prévenez la personne de créer son compte avec cet email (aucun email n’est envoyé).'));
    });
    return carte(h.nom, `${siennes.length} société${siennes.length > 1 ? 's' : ''}`, [boutons, elt('h4', null, 'Patron'), liste, f, elt('h4', null, 'Sociétés'),
      ...(siennes.length ? siennes.map(ligneSociete) : [elt('p', 'aide', 'Aucune société pour l’instant.')])]);
  });
  const seules = societes.filter((x) => !x.holding_id);
  if (seules.length) cartes.push(carte('Sans holding', 'Toi seul, et les membres de chaque société', seules.map(ligneSociete)));
  $('#org-holdings').replaceChildren(...cartes);
  renderOrgModules();
}

// Tous les réglages d'une holding ou d'une société. Vide = suit la holding, ou la valeur d'origine.
function renderOrgModules() {
  const zone = $('#org-modules'), { h, s } = orgCible || {};
  const holding = holdings.find((x) => x.id === h), societe = societes.find((x) => x.id === s);
  zone.classList.toggle('hidden', !holding && !societe);
  if (!holding && !societe) return;
  $('#org-modules-titre').textContent = `Modules de ${holding ? `la holding ${holding.nom}` : societe.nom}`;
  const suit = !!societe?.holding_id;
  $('#org-modules-aide').textContent = holding ? 'S’applique à toutes ses sociétés, sauf celles qui ont leur propre réglage.'
    : suit ? `« Comme la holding » suit ${holdings.find((x) => x.id === societe.holding_id)?.nom || 'sa holding'}.` : 'Cette société n’est dans aucune holding.';
  const ligneOrg = (nom, sien, herite, mots, envoyer) => {
    const l = elt('label', 'module-portee-ligne'), sel = elt('select');
    sel.add(new Option(suit ? `Comme la holding (${herite ? mots[0] : mots[1]})` : `D’origine (${herite ? mots[0] : mots[1]})`, ''));
    sel.add(new Option(mots[0], 'oui'));
    sel.add(new Option(mots[1], 'non'));
    sel.value = sien === undefined ? '' : sien ? 'oui' : 'non';
    sel.addEventListener('change', () => envoyer(sel.value === '' ? null : sel.value === 'oui'));
    l.append(elt('span', null, nom), sel);
    return l;
  };
  const bloc = (titre, aide, lignes) => {
    const d = elt('div', 'org-bloc'), g = elt('div', 'tuiles-apk');
    g.append(...lignes);
    d.append(elt('h4', null, titre), elt('p', 'aide', aide), g);
    return d;
  };
  const base = { id: null, holding_id: societe?.holding_id || null };
  const bo = MODULES_LISTE.map((mod) => {
    const sien = holding ? reglagesHolding.find((x) => x.holding_id === h && x.module === mod) : reglagesSociete.find((x) => x.societe_id === s && x.module === mod);
    return ligneOrg(LIBELLE_MODULE[mod] || mod, sien?.actif, moduleActif([], holding ? [] : reglagesHolding, mod, base), ['Actif', 'Désactivé'],
      (v) => orgAction('regler_module', { p_module: mod, p_holding: h, p_societe: s, p_actif: v }));
  });
  const tuiles = TUILES_APK.map(([tuile, nom]) => {
    const sien = tuilesReglages.find((x) => x.tuile === tuile && (holding ? x.holding_id === h : x.societe_id === s));
    return ligneOrg(nom, sien?.visible, tuileVisible(tuilesReglages, tuile, holding ? { id: null, holding_id: null } : base), ['Visible', 'Cachée'],
      (v) => orgAction('regler_tuile', { p_tuile: tuile, p_holding: h, p_societe: s, p_visible: v }));
  });
  const perso = modulesPerso.filter((m) => m.actif).map((m) => {
    const siennes = portees.filter((x) => x.module_id === m.id), sien = siennes.find((x) => (holding ? x.holding_id === h : x.societe_id === s));
    const l = ligneOrg(m.nom, sien?.actif, holding ? false : enService(siennes, base), ['Activé', 'Coupé'],
      (v) => orgAction('attribuer_module_perso', { id_module: m.id, p_holding: h, p_societe: s, p_actif: v, p_supports: null }));
    if (!sien?.actif) return l;
    const boite = elt('div'), f = elt('fieldset', 'module-supports');
    f.setAttribute('aria-label', `Où sert ce module : ${m.nom}`);
    for (const [cle, nom] of SUPPORTS) {
      const lab = elt('label'), c = elt('input');
      c.type = 'checkbox';
      c.checked = sien.supports.includes(cle);
      c.addEventListener('change', () => {
        const choisis = [...f.querySelectorAll('input')].flatMap((x, i) => (x.checked ? [SUPPORTS[i][0]] : []));
        if (!choisis.length) { c.checked = true; alert('Gardez au moins un endroit, ou coupez le module.'); return; }
        orgAction('attribuer_module_perso', { id_module: m.id, p_holding: h, p_societe: s, p_actif: true, p_supports: choisis });
      });
      lab.append(c, document.createTextNode(nom));
      f.append(lab);
    }
    boite.append(l, f);
    return boite;
  });
  $('#org-modules-contenu').replaceChildren(
    bloc('Back-office', 'Un module désactivé disparaît du menu ; ses données restent.', bo),
    bloc('Tuiles des téléphones (APK et iPhone)', 'Cacher une tuile n’efface rien. Clôture et Envoi mensuel restent toujours visibles.', tuiles),
    bloc('Modules que tu as créés', perso.length ? 'Choisis où chacun sert.' : 'Aucun module créé pour l’instant : onglet Modules d’une société → Créer un module.', perso));
}

$('#org-creer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const champ = $('#org-nom');
  if (await orgAction('enregistrer_holding', { h: null, p_nom: champ.value }, 'Holding créée.')) champ.value = '';
});
$('#org-fermer').addEventListener('click', () => { orgCible = null; renderOrganisation(); });

async function selectSociete(id) {
  selectedSociete = id;
  chatTech = null;   // une conversation ne passe pas d'une société à l'autre
  $('#chat-titre').textContent = 'Choisissez un technicien';
  $('#chat-messages').classList.add('hidden');
  $('#chat-form').classList.add('hidden');
  renderSocietes();
  fermerFicheTechnicien();
  await loadSocieteDetail(id);
}

async function loadSocieteDetail(societeId) {
  try {
    const [resp, cases] = await Promise.all([
      sb.from('responsables').select('societe_id').eq('societe_id', societeId).eq('user_id', session.user.id),
      sb.from('responsables_droits').select('domaine, modifier').eq('societe_id', societeId).eq('user_id', session.user.id)]);
    responsable = null;
    const { data, error } = await sb.rpc('membres_de', { s: societeId });
    if (error && !resp.data?.length) throw error;
    const members = data || [];
    if (error) responsable = { droits: new Map((cases.data || []).map((d) => [d.domaine, d.modifier])) };
    // Modules de la société : absence d'une ligne = module actif (caché si désactivé).
    const { data: mods, error: modsErr } = await sb.rpc('modules_actifs', { s: societeId });
    // En cas d'erreur (base pas encore à jour…), on n'éteint rien : tous les onglets restent visibles.
    modulesActifs = modsErr ? null : new Set((mods || []).map((m) => (typeof m === 'string' ? m : m.module)));   // la base renvoie [{ module }]
    if (modsErr) console.error(modsErr);
    // Modules fins allumés sur Bureau : pilotent l'apparition de leurs onglets (Clients…).
    const { data: fins } = await sb.from('module_allume').select('code').eq('societe_id', societeId).eq('support', 'bureau');
    modulesFinsOuverts = new Set((fins || []).map((x) => x.code));

    const societe = societes.find(s => s.id === societeId);
    $('#societe-detail-title').textContent = societe?.nom || 'Société';
    $('.nav-nom').textContent = societe?.nom || 'Société';
    $('#nav-logo').src = societe?.logo || OBJETS_3D.noeud;
    $('#nav-email').textContent = session.user.email || '';
    $('#nav-avatar').replaceWith(Object.assign(avatar(session.user.email || '?'), { id: 'nav-avatar' }));

    // Le patron d'une holding est admin de toutes ses sociétés ; la base ne lui montre que SA holding.
    monRole = holdings.some((h) => h.id === societe?.holding_id) ? 'admin'
      : members.find(m => m.user_id === session.user.id)?.role || null;
    await chargerModulesSaisis(societeId);
    // Un seul panneau visible : on repart sur Membres à chaque société.
    switchOnglet('panel-bord', false);

    renderMembers(members);
    reglerEcriture();
    await chargerResponsables();
    if (superAdmin || monRole === 'admin') {
      $('#admin-tools').classList.remove('hidden');
      await loadInvitations(societeId);
    } else {
      $('#admin-tools').classList.add('hidden');
    }
    remplirIdentite(societe);
    $('#purge-section').classList.toggle('hidden', !superAdmin);
    if (superAdmin) await chargerDurees();

    // Charger les données des onglets Techniciens et Véhicules (elles resteront masquées)
    // Techniciens d'abord : la liste des véhicules affiche le nom du conducteur.
    await loadTechniciens(societeId);
    compterCongesAValider();
    compterMessagesNonLus();
    if (!responsable) $('#onglet-messages').classList.toggle('hidden', !peutEcrire() || !!(modulesActifs && !modulesActifs.has('messages')));   // admin et gestion seulement
    await loadVehicules(societeId);
    if (responsable) switchOnglet('panel-techniciens');
    else chargerBord();   // le tableau de bord a besoin de la liste des techniciens

    $('#niveau-societes').classList.add('hidden');
    $('#societe-detail').classList.remove('hidden');
    requestAnimationFrame(() => placerPastille($('.tabs')));   // positions connues une fois affiché
    ouverture($('#societe-detail'));   // « la pièce s'allume » : une fois par jour, rien si animations réduites
    verifierSynchro({ rafraichir: false });   // bouton et voyant de la synchro (société reliée au pont) ; les données viennent d'être lues
    mettreAJourFil();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement');
  }
}

// Formulaires et boutons selon le rôle ; pour un responsable, selon la case de l'écran ouvert.
function reglerEcriture() {
  const oui = peutEcrire();
  for (const f of ['#technicien-form', '#vehicule-form', '#affectation-form', '#releve-form', '#echeance-form', '#entretien-form', '#amende-form', '#conge-form']) {
    const form = $(f);
    const permis = oui && !(responsable && ['#technicien-form', '#vehicule-form', '#affectation-form', '#amende-form'].includes(f));
    (form.closest('details') || form).classList.toggle('hidden', !permis);
  }
  // Lecture seule : les boutons d'action des tableaux sont masqués (CSS).
  document.body.classList.toggle('lecture-seule', !oui);
}

// === RESPONSABLES DE SECTEUR (admin de la société, patron de la holding, super admin) ===
const DOMAINES = [['interventions', 'Interventions'], ['conges', 'Congés', true], ['frais', 'Frais', true], ['vehicules', 'Véhicules', true],
  ['messages', 'Messages', true], ['saisies', 'Saisies des modules'], ['primes', 'Primes'], ['paie', 'Paie'], ['compta', 'Compta'], ['facturation', 'Facturation']];
const DOMAINES_SOCIETE = ['paie', 'compta', 'facturation'];
let responsables = [];

async function chargerResponsables() {
  const admin = superAdmin || monRole === 'admin';
  $('#responsables-section').classList.toggle('hidden', !admin);
  responsables = [];
  if (!admin) return;
  const { data, error } = await sb.rpc('responsables_de', { s: selectedSociete });
  if (error) { console.error(error); $('#responsables-section').classList.add('hidden'); return; }   // base pas encore à jour
  responsables = data;
}

function renderResponsables() {
  $('#responsables-liste').replaceChildren(...(responsables.length ? responsables.map(carteResponsable)
    : [elt('p', 'aide', 'Aucun responsable pour l’instant.')]));
}

function carteResponsable(x) {
  const carte = elt('article', 'org-holding'), tete = elt('div', 'org-ligne');
  tete.append(elt('strong', 'org-nom', x.email), pastille(x.etat === 'actif' ? 'Actif' : 'Invité', x.etat === 'actif' ? 'ok' : 'neutre'),
    boutonModule('Retirer', 'danger', async () => {
      if (!confirm(`Retirer ${x.email} ? Son accès se ferme tout de suite.`)) return;
      const { error } = await sb.rpc('retirer_responsable', { s: selectedSociete, p_email: x.email });
      if (error) alert(error.message);
      await chargerResponsables();
      renderResponsables();
    }));
  carte.append(tete);
  if (x.etat !== 'actif') { carte.append(elt('p', 'aide', 'Doit créer son compte avec cet email. Ses cases se règlent ensuite.')); return carte; }
  const etat = elt('p', 'aide', 'Chaque case s’enregistre et agit tout de suite, même si la personne est connectée.');
  etat.setAttribute('aria-live', 'polite');
  // Une seule écriture à la fois, toujours avec l'état affiché le plus récent.
  let enCours = false, encore = false;
  const enregistrer = async () => {
    if (enCours) { encore = true; return; }
    enCours = true;
    etat.textContent = 'Enregistrement…';
    const { error } = await sb.rpc('regler_responsable', { s: selectedSociete, u: x.user_id, droits: x.droits, techs: x.techniciens });
    enCours = false;
    if (encore) { encore = false; await enregistrer(); return; }
    if (error) { alert(error.message); await chargerResponsables(); renderResponsables(); } else etat.textContent = 'Enregistré.';
  };
  const caseACocher = (nom, coche, action) => {
    const c = elt('input');
    c.type = 'checkbox';
    c.checked = coche;
    c.setAttribute('aria-label', nom);
    c.addEventListener('change', () => { action(c.checked); enregistrer(); });
    return c;
  };
  const table = elt('div', 'resp-cases');
  table.append(elt('span', 'aide', ''), elt('span', 'aide', 'Voir'), elt('span', 'aide', 'Modifier'));
  for (const [cle, nom, modifiable] of DOMAINES) {
    const voir = caseACocher(`${nom} : voir`, cle in x.droits, (oui) => {
      if (oui) x.droits[cle] = false; else { delete x.droits[cle]; if (modif) modif.checked = false; }
    });
    const modif = modifiable ? caseACocher(`${nom} : modifier`, x.droits[cle] === true, (oui) => { x.droits[cle] = oui; voir.checked = true; }) : null;
    const lib = elt('span', null, nom);
    if (DOMAINES_SOCIETE.includes(cle)) lib.append(elt('small', 'aide', ' (toute la société)'));
    table.append(lib, voir, modif || elt('span', 'aide', '—'));
  }
  const techs = elt('fieldset', 'module-supports');
  techs.append(elt('legend', null, 'Ses techniciens'));
  for (const t of techniciens.filter((y) => y.actif || x.techniciens.includes(y.id))) {
    const l = elt('label');
    l.append(caseACocher(t.nom, x.techniciens.includes(t.id), (oui) => {
      x.techniciens = oui ? [...x.techniciens, t.id] : x.techniciens.filter((y) => y !== t.id);
    }), document.createTextNode(t.nom));
    techs.append(l);
  }
  carte.append(table, techs, etat);
  return carte;
}

$('#responsable-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const champ = $('#responsable-email');
  const { data, error } = await sb.rpc('nommer_responsable', { s: selectedSociete, p_email: champ.value });
  if (error) return alert(error.message);
  alert(data === 'nomme' ? 'Responsable nommé : cochez ce qu’il peut voir.' : 'Invitation enregistrée : la personne doit créer son compte avec cet email (aucun email n’est envoyé).', 'success');
  champ.value = '';
  await chargerResponsables();
  renderResponsables();
});

// === SURVEILLANCE : un droit retiré ferme l'écran tout de suite, même page ouverte ===
let signatureDroits = null, verifEnCours = false;

async function lireSignature() {
  const [s, h, d, t, m] = await Promise.all([
    sb.from('societes').select('id').order('id'), sb.from('holdings').select('id').order('id'),
    sb.from('responsables_droits').select('societe_id, domaine, modifier').eq('user_id', session.user.id).order('societe_id').order('domaine'),
    sb.from('responsables_techniciens').select('societe_id, technicien_id').eq('user_id', session.user.id).order('technicien_id'),
    sb.from('membres').select('societe_id, role').eq('user_id', session.user.id).order('societe_id')]);
  if ([s, h, d, t, m].some((x) => x.error)) return null;   // réseau : on ne conclut rien
  return JSON.stringify([s.data, h.data, d.data, t.data, m.data]);
}

async function surveillerDroits() {
  if (!session || superAdmin || verifEnCours || document.hidden) return;
  verifEnCours = true;
  try {
    const neuve = await lireSignature();
    if (!neuve) return;
    const avant = signatureDroits;
    signatureDroits = neuve;
    if (avant === null || avant === neuve) return;
    const garde = selectedSociete, onglet = ongletOuvert;
    await loadSocietes();
    if (!garde) return;
    if (!societes.some((x) => x.id === garde)) { retournerSocietes(); alert('Votre accès à cette société a été retiré.'); return; }
    await selectSociete(garde);
    switchOnglet(`panel-${onglet}`);
    alert('Vos accès ont été modifiés.', 'success');
  } finally { verifEnCours = false; }
}
setInterval(surveillerDroits, 20000);
document.addEventListener('visibilitychange', surveillerDroits);

// === RESTER SUR LA PAGE quand on actualise ===
const CLE_PAGE = 'gsys.page';

function noterPage() {
  if (!pageRestauree || !session) return;
  try {
    localStorage.setItem(CLE_PAGE, JSON.stringify({ u: session.user.id, s: selectedSociete, o: ongletOuvert, t: ficheTechnicien?.id || null, v: vehiculeActif?.id || vehiculeActif || null }));
  } catch (e) { /* sans mémoire : on repart de l'accueil */ }
}

async function restaurerPage() {
  if (pageRestauree) return;   // l'app se reconnecte seule au retour sur l'onglet : ne rien fermer
  try {
    const p = JSON.parse(localStorage.getItem(CLE_PAGE) || 'null');
    if (!p || p.u !== session.user.id || !societes.some((x) => x.id === p.s)) return;
    await selectSociete(p.s);
    const b = document.querySelector(`.tab[data-tab="${CSS.escape(String(p.o))}"]`);
    if (b && !b.classList.contains('hidden')) switchOnglet(`panel-${p.o}`);
    const t = p.o === 'techniciens' && techniciens.find((x) => x.id === p.t);
    if (t) ouvrirFicheTechnicien(t);
  } catch (e) { console.error(e); } finally { pageRestauree = true; }
}

const ROLES = { admin: 'Admin', gestion: 'Gestion', comptable: 'Comptable', lecture: 'Lecture seule' };

// Admin (ou super admin) : changer le rôle d'un membre ou le retirer. La base refuse de
// retirer le dernier admin de la société (trigger garder_un_admin).
function renderMembers(members) {
  const admin = superAdmin || monRole === 'admin';
  $('#membres-table tbody').replaceChildren(...members.map((m) => {
    const tr = ligne([m.email, ROLES[m.role] || m.role, m.user_id === session.user.id ? '✓' : '']);
    const cellule = tr.children[0];
    cellule.replaceChildren();
    cellule.appendChild(avatar(m.email));
    cellule.appendChild(document.createTextNode(m.email));
    const td = tr.appendChild(document.createElement('td'));
    if (!admin) { td.textContent = '—'; return tr; }
    const role = td.appendChild(document.createElement('select'));
    role.setAttribute('aria-label', `Rôle de ${m.email}`);
    for (const [v, l] of Object.entries(ROLES)) {
      const o = role.appendChild(document.createElement('option'));
      o.value = v;
      o.textContent = l;
    }
    role.value = m.role;
    role.addEventListener('change', async () => {
      const { error } = await sb.from('membres').update({ role: role.value }).eq('societe_id', selectedSociete).eq('user_id', m.user_id);
      if (error) { role.value = m.role; alert(error.message); return; }
      await loadSocieteDetail(selectedSociete);
    });
    const retirer = td.appendChild(document.createElement('button'));
    retirer.className = 'danger';
    retirer.textContent = 'Retirer';
    retirer.addEventListener('click', async () => {
      if (!doubleValidation(`Retirer ${m.email} de la société ? Ses accès seront coupés (son historique est gardé).`, 'RETIRER')) return;
      const { error } = await sb.from('membres').delete().eq('societe_id', selectedSociete).eq('user_id', m.user_id);
      if (error) { alert(error.message); return; }
      await loadSocieteDetail(selectedSociete);
    });
    return tr;
  }));
}

async function changerModule(mod, actif) {
  try {
    const { error } = await sb.rpc('activer_module', { s: selectedSociete, mod, actif });
    if (error) throw error;
    await loadSocieteDetail(selectedSociete);
    switchOnglet('panel-modules');   // on reste sur les modules
  } catch (err) {
    alert(err.message || 'Erreur lors de la modification du module');
  }
}

async function loadInvitations(societeId) {
  try {
    const { data, error } = await sb.from('invitations').select('id, email, role, cree_le').eq('societe_id', societeId).is('accepte_le', null);
    if (error) throw error;
    renderInvitations(data);
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des invitations');
  }
}

function renderInvitations(invitations) {
  const tbody = $('#invitations-table tbody');
  tbody.replaceChildren(...invitations.map(inv => {
    const tr = ligne([inv.email, inv.role, new Date(inv.cree_le).toLocaleDateString('fr-FR')]);
    const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
    b.className = 'danger';
    b.textContent = 'Annuler';
    b.addEventListener('click', () => cancelInvitation(inv.id));
    return tr;
  }));
}

async function cancelInvitation(id) {
  try {
    const { error } = await sb.from('invitations').delete().eq('id', id);
    if (error) throw error;
    await loadInvitations(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'annulation');
  }
}

// === TECHNICIENS ===
async function loadTechniciens(societeId) {
  try {
    const { data, error } = await sb.from('techniciens').select('id, nom, nom_apk, actif, archive_le, compte_auxiliaire, code_tech').eq('societe_id', societeId).order('nom');
    if (error) throw error;
    techniciens = data;
    renderTechniciens(data);
    renderTechniciensActifs();
    renderTechniciensAmende();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des techniciens');
  }
}

// Conservation légale (super admin) : délais, aperçu, puis purge confirmée.
const NOMS_DONNEES = { temps: 'Interventions et heures', heures_sup: 'Heures sup validées', gestes_co: 'Équipements posés (primes)',
  primes_tarifs: 'Barèmes de primes', conges: 'Congés', frais: 'Notes de frais', photos_apk: 'Photos et justificatifs',
  amendes: 'Amendes', techniciens: 'Techniciens partis', permis_conduire: 'Permis de conduire', secu_sociale: 'N° de sécurité sociale', documents_tech: 'Documents d\'embauche' };

async function chargerDurees() {
  const { data, error } = await sb.from('durees_conservation').select('table_nom, annees, source').order('annees');
  if (error) return alert(error.message);
  $('#durees-table tbody').replaceChildren(...data.map((d) => ligne([NOMS_DONNEES[d.table_nom] || d.table_nom, `${d.annees} ans`, d.source])));
  $('#purge-resultat').textContent = '';
  $('#purge-lancer').classList.add('hidden');
}

const resumePurge = (lignes) => lignes.map((l) => `${NOMS_DONNEES[l.table_nom] || l.table_nom} : ${l.lignes}`).join(' — ');

$('#purge-apercu').addEventListener('click', async () => {
  const { data, error } = await sb.rpc('apercu_purge', { s: selectedSociete });
  if (error) return alert(error.message);
  $('#purge-resultat').textContent = data.length ? `Délai légal dépassé — ${resumePurge(data)}.` : 'Rien à purger : toutes les données sont encore dans leur délai légal.';
  $('#purge-lancer').classList.toggle('hidden', !data.length);
});

$('#purge-lancer').addEventListener('click', async () => {
  if (!doubleValidation('Purger définitivement les données dont le délai légal est dépassé ? Elles ne pourront PAS être récupérées.', 'PURGER')) return;
  const { data, error } = await sb.rpc('purger_donnees', { s: selectedSociete, confirmation: 'PURGER' });
  if (error) return alert(error.message);
  // Les fichiers suivent (la base n'autorise que ceux dont la ligne vient d'être purgée).
  const seaux = { photos_apk: 'photos', amendes: 'scans', permis_conduire: 'identite', documents_tech: 'identite' };
  const echecs = [];
  for (const l of data) {
    if (!seaux[l.table_nom] || !l.fichiers.length) continue;
    const { error: e } = await sb.storage.from(seaux[l.table_nom]).remove(l.fichiers);
    if (e) echecs.push(e.message);
  }
  $('#purge-resultat').textContent = (data.length ? `Purgé — ${resumePurge(data)}.` : 'Rien n\'a été purgé.')
    + (echecs.length ? ` Fichiers non supprimés : ${echecs.join(', ')}` : '');
  $('#purge-lancer').classList.add('hidden');
});

// Double validation : une confirmation, puis le mot à taper (évite les clics par erreur).
function doubleValidation(question, mot) {
  return confirm(question) && (prompt(`Pour confirmer, tapez ${mot} :`) || '').trim().toUpperCase() === mot;
}

$('#tech-filtre').addEventListener('change', () => renderTechniciens(techniciens));
pilulesDepuisSelect($('#tech-filtre'), 'Techniciens affichés');

function renderTechniciens(list) {
  const archives = $('#tech-filtre').value === 'archives';
  const tbody = $('#techniciens-table tbody');
  tbody.replaceChildren(...list.filter((t) => !!t.archive_le === archives).map(t => {
    const tr = ligne([t.nom, archives ? `Archivé le ${formaterDate(t.archive_le)}` : t.actif ? 'Oui' : 'Non']);
    tr.cells[0].prepend(avatar(t.nom));
    tr.classList.add('ligne-cliquable');
    tr.addEventListener('click', () => ouvrirFicheTechnicien(t));
    const td = tr.appendChild(document.createElement('td'));
    const b = td.appendChild(document.createElement('button'));
    if (archives) {
      b.className = 'secondary';
      b.textContent = 'Restaurer';
      b.addEventListener('click', (e) => { e.stopPropagation(); archiverTechnicien(t, false); });
    } else {
      b.className = t.actif ? 'danger' : 'secondary';
      b.textContent = t.actif ? 'Désactiver' : 'Activer';
      b.addEventListener('click', (e) => { e.stopPropagation(); toggleTechnicien(t.id, t.actif); });
      const a = td.appendChild(document.createElement('button'));
      a.className = 'danger';
      a.textContent = 'Archiver';
      a.addEventListener('click', (e) => { e.stopPropagation(); archiverTechnicien(t, true); });
    }
    const fleche = tr.appendChild(document.createElement('td'));
    fleche.className = 'fleche';
    fleche.setAttribute('aria-hidden', 'true');
    fleche.textContent = '›';
    return tr;
  }));
}

// Archiver = « supprimer » de l'appli : sort des actifs, toutes ses données restent.
async function archiverTechnicien(t, archiver) {
  if (archiver && !doubleValidation(`Archiver ${t.nom} ? Il n'apparaîtra plus dans les actifs (paie, listes, tableau de bord). Ses données sont conservées et il peut être restauré.`, 'ARCHIVER')) return;
  const { error } = await sb.from('techniciens').update({ archive_le: archiver ? new Date().toISOString().slice(0, 10) : null }).eq('id', t.id);
  if (error) { alert(error.message); return; }
  await loadTechniciens(selectedSociete);
}

async function toggleTechnicien(id, actif) {
  try {
    const { error } = await sb.from('techniciens').update({ actif: !actif }).eq('id', id);
    if (error) throw error;
    await loadTechniciens(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de la mise à jour');
  }
}

function ouvrirFicheTechnicien(t) {
  ficheTechnicien = t;
  fermerPanneauVehicule();
  $('#tech-liste').classList.add('hidden');
  $('#tech-fiche').classList.remove('hidden');
  const titre = $('#tech-fiche-titre');
  titre.replaceChildren(avatar(t.nom));
  titre.querySelector('.avatar').classList.add('grand');
  titre.appendChild(document.createTextNode(t.nom));
  initialiserSousOnglets($('#tech-fiche'));
  mettreAJourFil();
  // Charger les données de la fiche
  $('#tech-code-form').classList.toggle('hidden', !peutEcrire());
  $('#tech-code-edit').value = t.code_tech || '';
  $('#tech-code-etat').textContent = '';
  chargerFicheTechnicien(t);
  chargerPapiers(t);
  chargerTelephones(t);
}

// === VÉHICULES ===
async function loadVehicules(societeId) {
  try {
    const { data: vehicules, error } = await sb.from('vehicules').select('id, plaque, libelle, marque, modele, carburant, motorisation, mise_en_circulation, actif, archive_le, archive_par, motif_archive').eq('societe_id', societeId).order('plaque');
    if (error) throw error;
    listeVehicules = vehicules;
    // Charger les affectations de cette société
    const { data: affectations, error: affectErr } = await sb.from('affectations').select('vehicule_id, technicien_id, debut, fin').eq('societe_id', societeId).order('debut', { ascending: false });
    if (affectErr) throw affectErr;
    listeAffectations = affectations;
    renderVehicules(vehicules, affectations);
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des véhicules');
  }
}

function renderVehicules(list, affectations) {
  const tbody = $('#vehicules-table tbody');
  const filtre = $('#veh-filtre').value;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const filtrees = list.filter(v => {
    if (filtre === 'actuels') return v.actif !== false;
    if (filtre === 'archives') return v.actif === false;
    return true;
  });
  tbody.replaceChildren(...filtrees.map(v => {
    const affectationsV = affectations.filter(a => a.vehicule_id === v.id);
    const techId = conducteurA(affectationsV, aujourdhui);
    const tech = techniciens.find(t => t.id === techId);
    const nomTech = tech ? tech.nom : '—';
    const debut = affectationsV.find(a => a.debut <= aujourdhui && (!a.fin || a.fin >= aujourdhui))?.debut || '—';
    const tr = ligne(['', v.libelle || '', '', debut]);
    const plaque = tr.children[0].appendChild(document.createElement('span'));
    plaque.className = 'plaque';
    plaque.textContent = v.plaque;
    const conducteur = tr.children[2];
    if (tech) conducteur.append(avatar(nomTech), document.createTextNode(nomTech));
    else conducteur.textContent = nomTech;
    tr.classList.add('ligne-cliquable');
    tr.addEventListener('click', () => ouvrirVehicule(v));
    const fleche = tr.appendChild(document.createElement('td'));
    fleche.className = 'fleche';
    fleche.setAttribute('aria-hidden', 'true');
    fleche.textContent = '›';
    return tr;
  }));
}

async function ouvrirVehicule(v) {
  vehiculeActif = v;
  fermerFicheTechnicien();
  $('#vehicules-liste').classList.add('hidden');
  $('#vehicule-detail').classList.remove('hidden');
  const titre = $('#vehicule-detail-title');
  titre.replaceChildren();
  const plaque = titre.appendChild(document.createElement('span'));
  plaque.className = 'plaque';
  plaque.textContent = v.plaque;
  const archive = v.actif === false;
  $('#vehicule-archiver').classList.toggle('hidden', archive);
  $('#vehicule-restaurer').classList.toggle('hidden', !archive);
  initialiserSousOnglets($('#vehicule-detail'));
  mettreAJourFil();
  await Promise.all([
    loadAffectations(v.id),
    loadRelevesAndKm(v.id),
    loadEntretiens(v.id),
    loadPhotosCompteur(v.id),
    loadAmendes(v.id)
  ]);
}

// 1. Affectations
async function loadAffectations(vehiculeId) {
  try {
    const { data, error } = await sb.from('affectations').select('id, debut, fin, techniciens(nom)').eq('vehicule_id', vehiculeId).order('debut', { ascending: false });
    if (error) throw error;
    renderAffectations(data);
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des affectations');
  }
}

function renderAffectations(list) {
  const tbody = $('#affectations-table tbody');
  tbody.replaceChildren(...list.map(a => {
    const t = a.techniciens;
    const nomTech = Array.isArray(t) ? (t[0]?.nom || '—') : (t?.nom || '—');
    const tr = ligne([nomTech || '—', a.debut, a.fin || 'en cours']);
    if (!a.fin) {
      const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
      b.className = 'danger';
      b.textContent = 'Terminer';
      b.addEventListener('click', () => terminerAffectation(a.id));
    } else {
      tr.appendChild(document.createElement('td'));
    }
    return tr;
  }));
}

async function terminerAffectation(id) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  try {
    const { error } = await sb.from('affectations').update({ fin: aujourdhui }).eq('id', id);
    if (error) throw error;
    await loadAffectations(vehiculeActif.id);
    await loadVehicules(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de la fin d\'affectation');
  }
}

// 2. Kilométrage
async function loadReleves(vehiculeId) {
  try {
    const { data, error } = await sb.from('releves_km').select('id, date, km, source, valide_par, photo_id').eq('vehicule_id', vehiculeId).order('date');
    if (error) throw error;
    // Toutes les photos du compteur du véhicule : un relevé sans photo liée montre celle de son mois.
    const { data: photos, error: e2 } = await sb.from('vehicules_photos').select('id, emplacement, periode')
      .eq('vehicule_id', vehiculeId).eq('type', 'compteur').order('emplacement');
    if (e2) throw e2;
    const noms = (photos || []).map((p) => (p.emplacement || '').replace(/^drive:/, ''));
    const { data: copies, error: e3 } = noms.length
      ? await sb.from('photos_apk').select('nom_drive, stockage').eq('societe_id', selectedSociete).in('nom_drive', noms)
      : { data: [] };
    if (e3) throw e3;
    const stockageParNom = new Map((copies || []).map((c) => [c.nom_drive, c.stockage]));
    const stockageParPhoto = new Map((photos || []).map((p) => [p.id, stockageParNom.get((p.emplacement || '').replace(/^drive:/, ''))]));
    const { data: corrections, error: e4 } = await sb.from('corrections_km').select('releve_id, nouveau_km, motif, cree_le').eq('vehicule_id', vehiculeId).order('cree_le');
    if (e4) throw e4;
    const corrigeParReleve = new Map();
    for (const c of corrections || []) corrigeParReleve.set(c.releve_id, c);
    const photoDuMois = new Map();
    for (const p of photos || []) if (!photoDuMois.has(p.periode) && stockageParPhoto.get(p.id)) photoDuMois.set(p.periode, stockageParPhoto.get(p.id));
    const enrichis = data.map((r) => ({ ...r, stockage: stockageParPhoto.get(r.photo_id) || photoDuMois.get(String(r.date).slice(0, 7)) || null,
      correction: corrigeParReleve.get(r.id) || null }));
    renderReleves(enrichis);
    const valides = enrichis.filter(r => r.valide_par);   // triés par date
    kmActuelGlobal = valides.length ? valides[valides.length - 1].km : null;
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des relevés');
  }
}

function renderReleves(list) {
  const tbody = $('#releves-table tbody');
  tbody.replaceChildren(...list.map(r => {
    const tr = ligne([r.date, String(r.km), r.source || '—', r.valide_par ? 'Oui' : 'Non']);
    const actions = tr.appendChild(document.createElement('td'));
    if (!r.valide_par) {
      const b = actions.appendChild(document.createElement('button'));
      b.className = 'secondary';
      b.textContent = 'Valider';
      b.addEventListener('click', () => validerReleve(r.id));
    } else if (peutEcrire()) {
      const b = actions.appendChild(document.createElement('button'));
      b.className = 'secondary';
      b.textContent = 'Corriger';
      b.addEventListener('click', () => ouvrirCorrection(r));
    }
    if (r.correction) {
      const note = actions.appendChild(document.createElement('small'));
      note.textContent = `Corrigé le ${formaterDate(r.correction.cree_le.slice(0, 10))} : ${r.correction.motif}`;
    }
    return tr;
  }));
  const moy = kmMoyenParMois(list);
  const el = $('#km-moyen');
  if (moy !== null) {
    el.textContent = `Moyenne : ${moy} km/mois (relevés validés)`;
  } else {
    el.textContent = 'Moyenne : pas assez de relevés validés';
  }
  renderKmMois(list);
}

let releveACorriger = null;

function ouvrirCorrection(r) {
  releveACorriger = r;
  $('#corr-ancien-km').value = r.km;
  $('#corr-nouveau-km').value = '';
  $('#corr-motif').value = '';
  $('#dialog-correction-km').showModal();
}

function renderKmMois(list) {
  const tbody = $('#km-mois-table tbody');
  const data = kmParMois(list);
  tbody.replaceChildren(...data.map(row => {
    const [y, m] = row.mois.split('-');
    const mois = `${m}/${y}`;
    const kmFin = row.kmFin != null ? Number(row.kmFin).toLocaleString('fr-FR') : '—';
    const parcourus = row.parcourus != null ? Number(row.parcourus).toLocaleString('fr-FR') : '—';
    return ligne([mois, kmFin, parcourus]);
  }));
}

async function validerReleve(id) {
  try {
    const { error } = await sb.from('releves_km').update({ valide_par: session.user.id, valide_le: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await loadRelevesAndKm(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de la validation');
  }
}

// 3. Échéances
let kmActuelGlobal = null;

async function loadEcheances(vehiculeId) {
  try {
    const { data, error } = await sb.from('echeances').select('id, type, date, km, fait_le, fait_km').eq('vehicule_id', vehiculeId).order('date');
    if (error) throw error;
    renderEcheances(data.filter((e) => !e.fait_le));
    // Historique : échéances faites, la plus récente d'abord.
    $('#echeances-historique tbody').replaceChildren(...data.filter((e) => e.fait_le)
      .sort((a, b) => (a.fait_le < b.fait_le ? 1 : -1))
      .map((e) => ligne([e.type, e.date ? formaterDate(e.date) : '—', formaterDate(e.fait_le), e.fait_km ?? '—'])));
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des échéances');
  }
}

function renderEcheances(list) {
  const tbody = $('#echeances-table tbody');
  tbody.replaceChildren(...list.map(e => {
    const al = alertes([e], { aujourdhui: new Date().toISOString().slice(0, 10), kmActuel: kmActuelGlobal, joursAvant: 30, kmAvant: 1000 });
    const niveau = al[0]?.niveau;
    let label = 'À jour';
    let classe = '';
    if (niveau === 'depassee') { label = 'Dépassée'; classe = 'alerte-depassee'; }
    else if (niveau === 'proche') { label = 'Proche'; classe = 'alerte-proche'; }
    else if (niveau === 'km_inconnu') { label = 'Km inconnu'; }
    const tr = ligne([e.type, e.date ? formaterDate(e.date) : '—', e.km != null ? String(e.km) : '—', '']);
    const alertTd = tr.children[3];
    if (classe) alertTd.classList.add(classe);
    alertTd.appendChild(pastille(label, classe === 'alerte-depassee' ? 'danger' : classe === 'alerte-proche' || niveau === 'km_inconnu' ? 'alerte' : 'ok'));
    const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
    b.className = 'danger';
    b.textContent = 'Supprimer';
    b.addEventListener('click', () => deleteEcheance(e.id));
    const f = b.parentElement.insertBefore(document.createElement('button'), b);
    f.textContent = 'Fait';
    f.addEventListener('click', () => ouvrirFait(e));
    return tr;
  }));
  marquer(sousOnglet('vehicule-section-echeances'), !!document.querySelector('#echeances-table .alerte-depassee, #echeances-table .alerte-proche'));
  majPoints();
  // Aide CT
  const aide = $('#ct-aide');
  aide.replaceChildren();
  const span = document.createElement('span');
  span.textContent = 'Contrôle technique : tous les 2 ans après un contrôle favorable. ';
  aide.appendChild(span);
  const a = document.createElement('a');
  a.href = CT_VOITURE.source;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'service-public.fr';
  a.className = 'link';
  aide.appendChild(a);
}

// « Fait » : on note la réalisation et on propose la suivante. Contrôle technique : 2 ans
// après (CT_VOITURE, service-public.fr). Autres types : aucun intervalle inventé, à saisir.
let echeanceFaite = null;
function ouvrirFait(e) {
  echeanceFaite = e;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  $('#fait-le').value = aujourdhui;
  $('#fait-km').value = kmActuelGlobal ?? '';
  const ct = e.type === 'CT';
  $('#fait-aide').textContent = ct
    ? 'Contrôle technique : prochain dans 2 ans (si le contrôle est favorable).'
    : 'Indiquez la prochaine échéance si elle est connue (sinon laissez vide).';
  $('#prochaine-date').value = ct ? prochaineEcheance(CT_VOITURE, { date: aujourdhui, km: 0 }).date : '';
  $('#prochaine-km').value = '';
  $('#dialog-fait').showModal();
}
$('#fait-le').addEventListener('change', () => {
  if (echeanceFaite?.type === 'CT' && $('#fait-le').value) $('#prochaine-date').value = prochaineEcheance(CT_VOITURE, { date: $('#fait-le').value, km: 0 }).date;
});
$('#fait-annuler').addEventListener('click', () => $('#dialog-fait').close());
$('#corr-annuler').addEventListener('click', () => $('#dialog-correction-km').close());
$('#corr-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!releveACorriger) return;
  const ancien = Number($('#corr-ancien-km').value);
  const nouveau = Number($('#corr-nouveau-km').value);
  const motif = $('#corr-motif').value.trim();
  if (nouveau === ancien) { alert('Le nouveau km doit différer de l\'ancien'); return; }
  if (!motif) { alert('Le motif est obligatoire'); return; }
  try {
    const { error: e1 } = await sb.from('corrections_km').insert({
      societe_id: selectedSociete,
      vehicule_id: vehiculeActif.id,
      releve_id: releveACorriger.id,
      ancien_km: ancien,
      nouveau_km: nouveau,
      motif: motif,
      auteur: session.user.id
    });
    if (e1) throw e1;
    const { error: e2 } = await sb.from('releves_km').update({ km: nouveau }).eq('id', releveACorriger.id);
    if (e2) throw e2;
    $('#dialog-correction-km').close();
    releveACorriger = null;
    await loadRelevesAndKm(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de la correction');
  }
});
$('#fait-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const e = echeanceFaite, km = $('#fait-km').value, pDate = $('#prochaine-date').value, pKm = $('#prochaine-km').value;
  const { error } = await sb.from('echeances').update({ fait_le: $('#fait-le').value, fait_km: km ? Number(km) : null }).eq('id', e.id);
  if (error) { alert(error.message); return; }
  if (pDate || pKm) {
    const { error: e2 } = await sb.from('echeances').insert({ societe_id: selectedSociete, vehicule_id: vehiculeActif.id,
      type: e.type, date: pDate || null, km: pKm ? Number(pKm) : null });
    if (e2) alert(e2.message);
  }
  $('#dialog-fait').close();
  await loadEcheances(vehiculeActif.id);
});

async function deleteEcheance(id) {
  try {
    const { error } = await sb.from('echeances').delete().eq('id', id);
    if (error) throw error;
    await loadEcheances(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de la suppression');
  }
}

// 4. Entretiens
async function loadEntretiens(vehiculeId) {
  try {
    const lire = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
    const [data, regles, releves] = await Promise.all([
      lire(sb.from('entretiens').select('id, date, type, km, garage, cout').eq('vehicule_id', vehiculeId).order('date', { ascending: false })),
      lire(sb.from('entretien_regles').select('id, type, tous_les_km, tous_les_mois, source').eq('vehicule_id', vehiculeId).order('type')),
      lire(sb.from('releves_km').select('date, km, valide_par').eq('vehicule_id', vehiculeId).order('date')),
    ]);
    renderEntretiens(data);
    afficherPlan(data, regles, releves);
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des entretiens');
  }
}

function renderEntretiens(list) {
  const tbody = $('#entretiens-table tbody');
  tbody.replaceChildren(...list.map(e => ligne([
    formaterDate(e.date),
    libEntretien(e.type),
    e.km != null ? String(e.km) : '—',
    e.garage || '—',
    e.cout != null ? `${Number(e.cout).toFixed(2).replace('.', ',')} €` : '—'
  ])));

  // Dernière fois par type
  const parType = {};
  for (const e of list) {
    if (!parType[e.type] || parType[e.type].date < e.date) parType[e.type] = e;
  }
  const lastUl = $('#entretiens-last');
  lastUl.replaceChildren(...Object.values(parType).map(e => {
    const li = document.createElement('li');
    li.textContent = `${libEntretien(e.type)} : ${formaterDate(e.date)}${e.km != null ? ` (${Number(e.km).toLocaleString('fr-FR')} km)` : ''}`;
    return li;
  }));

  // Coût total (non vide)
  const total = list.filter(e => e.cout != null && e.cout !== '').reduce((s, e) => s + Number(e.cout), 0);
  const totalEl = $('#entretiens-total');
  let tuiles = $('#entretiens-tuiles');
  if (!tuiles) {
    tuiles = document.createElement('div');
    tuiles.id = 'entretiens-tuiles';
    tuiles.className = 'tuiles';
    totalEl.parentElement.insertBefore(tuiles, totalEl);
  }
  tuiles.replaceChildren(
    tuileChiffre('Entretiens', list.length, null, { ico: 'interventions', cle: 'veh-entretiens-nombre' }),
    tuileChiffre('Coût total', `${total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, null, { ico: 'frais', cle: 'veh-entretiens-cout' })
  );
  totalEl.hidden = true;
}

const LIB_ENTRETIEN = {
  DISTRIBUTION: 'Distribution', PNEUS: 'Pneus', FREINS: 'Freins', VIDANGE: 'Vidange', FILTRES: 'Filtres',
  LIQUIDE_FREINS: 'Liquide de frein', REVISION: 'Révision', REPARATION: 'Réparation diverse', AUTRE: 'Autre'
};

// Plan d'entretien : préconisations du véhicule suivies au fil des km (core/vehicules.js : planEntretien).
const ETATS_PLAN = { ok: ['À jour', ''], proche: ['Bientôt', 'alerte-proche'], depasse: ['À faire', 'alerte-depassee'], inconnu: ['Dernier entretien non saisi', 'alerte-proche'] };
const nombreFr = (n) => Number(n).toLocaleString('fr-FR');
let reglesVehicule = [];

function afficherPlan(entretiensListe, regles, releves) {
  reglesVehicule = regles;
  const v = vehiculeActif;
  const kmActuel = releves.length ? Math.max(...releves.map((r) => Number(r.km))) : null;
  const kmMoyen = kmMoyenParMois(releves);
  const plan = planEntretien({ regles: regles.map((r) => ({ type: r.type, tousLesKm: r.tous_les_km, tousLesMois: r.tous_les_mois })),
    entretiens: entretiensListe, kmActuel, kmMoyenMois: kmMoyen, aujourdhui: iso(new Date()) });
  const identite = [v.marque, v.modele, v.motorisation].filter(Boolean).join(' ');
  $('#plan-resume').textContent = (identite ? `${identite} — ` : 'Modèle non renseigné (Identité du véhicule) — ')
    + `${kmActuel != null ? nombreFr(kmActuel) + ' km' : 'km inconnu'}` + (kmMoyen ? ` — ${nombreFr(kmMoyen)} km par mois en moyenne` : '')
    + (regles.length ? '' : ' — aucune préconisation : ajoutez celles du constructeur.');
  $('#plan-table tbody').replaceChildren(...plan.map((l, i) => {
    const pre = [l.tousLesKm && `${nombreFr(l.tousLesKm)} km`, l.tousLesMois && `${l.tousLesMois} mois`].filter(Boolean).join(' ou ');
    const dernier = l.dernier ? `${formaterDate(l.dernier.date)}${l.dernier.km != null ? ' — ' + nombreFr(l.dernier.km) + ' km' : ''}` : '—';
    const prochain = l.prochain ? [l.prochain.km != null && `${nombreFr(l.prochain.km)} km`, l.prochain.date && formaterDate(l.prochain.date)].filter(Boolean).join(' ou le ') : '—';
    const [etat, classe] = ETATS_PLAN[l.etat];
    const tr = ligne([libEntretien(l.type), `Tous les ${pre}`, dernier, prochain, l.estimation ? `vers le ${formaterDate(l.estimation)}` : '—', '', regles[i].source || '—']);
    const etatTd = tr.children[5];
    etatTd.className = classe;
    etatTd.appendChild(pastille(etat, classe === 'alerte-depassee' ? 'danger' : classe === 'alerte-proche' ? 'alerte' : 'ok'));
    const td = tr.appendChild(document.createElement('td'));
    const b = td.appendChild(document.createElement('button'));
    b.type = 'button'; b.className = 'danger'; b.textContent = 'Supprimer';
    b.addEventListener('click', async () => {
      if (!confirm(`Supprimer la préconisation « ${libEntretien(l.type)} » ?`)) return;
      const { error } = await sb.from('entretien_regles').delete().eq('id', regles[i].id);
      if (error) { alert(error.message); return; }
      await loadEntretiens(v.id);
    });
    return tr;
  }));
  for (const [id, champ] of [['#vi-marque', 'marque'], ['#vi-modele', 'modele'], ['#vi-carburant', 'carburant'], ['#vi-motorisation', 'motorisation'], ['#vi-mec', 'mise_en_circulation']]) $(id).value = v[champ] || '';
  $('#vi-lire').hidden = !window.google?.script?.run;
}

$('#regle-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const km = Number($('#regle-km').value) || null, mois = Number($('#regle-mois').value) || null;
  if (!km && !mois) { alert('Indiquez un intervalle en km, en mois, ou les deux.'); return; }
  const { error } = await sb.from('entretien_regles').insert({ societe_id: selectedSociete, vehicule_id: vehiculeActif.id, type: $('#regle-type').value,
    tous_les_km: km, tous_les_mois: mois, source: $('#regle-source').value.trim() });
  if (error) { alert(error.message); return; }
  $('#regle-form').reset();
  await loadEntretiens(vehiculeActif.id);
});

$('#vehicule-identite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const champs = { marque: $('#vi-marque').value.trim(), modele: $('#vi-modele').value.trim(), carburant: $('#vi-carburant').value.trim(),
    motorisation: $('#vi-motorisation').value.trim(), mise_en_circulation: $('#vi-mec').value || null };
  const { error } = await sb.from('vehicules').update(champs).eq('id', vehiculeActif.id);
  if (error) { alert(error.message); return; }
  majIdentite(champs);
});

function majIdentite(champs) {
  Object.assign(vehiculeActif, champs);
  const dansListe = listeVehicules.find((x) => x.id === vehiculeActif.id);
  if (dansListe) Object.assign(dansListe, champs);
  for (const [id, champ] of [['#vi-marque', 'marque'], ['#vi-modele', 'modele'], ['#vi-carburant', 'carburant'], ['#vi-motorisation', 'motorisation']]) $(id).value = vehiculeActif[champ] || '';
  return loadEntretiens(vehiculeActif.id);
}

$('#vi-lire').addEventListener('click', async () => {
  const b = $('#vi-lire');
  b.disabled = true; b.textContent = 'Lecture…';
  const champs = await identiteDepuisPlaque(vehiculeActif.id, vehiculeActif.plaque);
  b.disabled = false; b.textContent = 'Lire la plaque';
  if (!champs) { alert('Plaque introuvable sur la fiche publique : remplissez l\'identité à la main.'); return; }
  await majIdentite(champs);
});

// Même modèle = même marque, modèle et motorisation : le plan est copié là où le type manque.
$('#plan-copier').addEventListener('click', async () => {
  const v = vehiculeActif;
  if (!v.marque || !v.modele || !v.motorisation) { alert("Renseignez d'abord la marque, le modèle et la motorisation (Identité du véhicule)."); return; }
  if (!reglesVehicule.length) { alert('Ce véhicule n\'a pas encore de préconisation à copier.'); return; }
  const memes = listeVehicules.filter((x) => x.id !== v.id && x.marque === v.marque && x.modele === v.modele && x.motorisation === v.motorisation);
  if (!memes.length) { alert('Aucun autre véhicule de ce modèle.'); return; }
  const { data: existantes, error: e1 } = await sb.from('entretien_regles').select('vehicule_id, type').in('vehicule_id', memes.map((x) => x.id));
  if (e1) { alert(e1.message); return; }
  const lignes = memes.flatMap((x) => reglesVehicule.filter((r) => !existantes.some((ex) => ex.vehicule_id === x.id && ex.type === r.type))
    .map((r) => ({ societe_id: selectedSociete, vehicule_id: x.id, type: r.type, tous_les_km: r.tous_les_km, tous_les_mois: r.tous_les_mois, source: r.source })));
  if (!lignes.length) { alert('Les véhicules de ce modèle ont déjà ces préconisations.'); return; }
  if (!confirm(`Copier ${lignes.length} préconisation(s) sur ${memes.length} véhicule(s) du même modèle ?`)) return;
  const { error } = await sb.from('entretien_regles').insert(lignes);
  if (error) { alert(error.message); return; }
  alert(`${lignes.length} préconisation(s) copiée(s).`);
});
function libEntretien(type) { return LIB_ENTRETIEN[type] || type; }

function formaterDate(date) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

// Les alertes d'échéance dépendent du dernier km validé : relevés d'abord.
async function loadRelevesAndKm(vehiculeId) {
  await loadReleves(vehiculeId);
  await loadEcheances(vehiculeId);
}

async function loadPhotosCompteur(vehiculeId) {
  try {
    const { data: photos, error } = await sb.from('vehicules_photos')
      .select('id, periode, emplacement')
      .eq('vehicule_id', vehiculeId)
      .eq('type', 'compteur')
      .order('periode', { ascending: false });
    if (error) throw error;
    // Emplacement de chaque photo de compteur dans le stockage privé (copiée par le pont).
    const noms = photos.map((p) => (p.emplacement || '').replace(/^drive:/, ''));
    const { data: copies, error: e2 } = noms.length
      ? await sb.from('photos_apk').select('nom_drive, stockage').eq('societe_id', selectedSociete).in('nom_drive', noms)
      : { data: [] };
    if (e2) throw e2;
    const doublons = detecterDoublonsCompteur(photos);
    renderPhotosCompteur(photos, new Map(copies.map((c) => [c.nom_drive, c.stockage])), doublons);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const moisCourant = aujourdhui.slice(0, 7);
    const moisPrecedent = moisPrecedentDe(moisCourant);
    const statutPrecedent = statutPhoto(moisPrecedent, photos, aujourdhui, 10);
    const statutCourant = statutPhoto(moisCourant, photos, aujourdhui, 10);
    const p = $('#photo-statut');
    p.textContent = `Mois précédent : ${libelleStatut(statutPrecedent)} — Mois courant : ${libelleStatut(statutCourant)}`;
    p.classList.toggle('alerte-depassee', statutPrecedent === 'en_retard' || statutCourant === 'en_retard');
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des photos');
  }
}

function moisPrecedentDe(periode) {
  let [y, m] = periode.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function libelleStatut(s) {
  return s === 'recue' ? 'reçue' : s === 'manquante' ? 'manquante' : 'en retard';
}

function renderPhotosCompteur(photos, stockages, doublons = new Set()) {
  const tbody = $('#photos-compteur-table tbody');
  tbody.replaceChildren(...photos.map(p => {
    const [y, m] = p.periode.split('-');
    const fichier = (p.emplacement || '').replace(/^drive:/, '');
    const tr = ligne([`${m}/${y}`, fichier]);
    const tdPhoto = tr.appendChild(boutonPhoto(stockages.get(fichier)));
    const voir = tdPhoto.querySelector('button');
    if (voir) {   // bulle au survol du bouton « Voir » (souris seulement), retirée dès que la souris le quitte
      voir.addEventListener('mouseenter', (ev) => montrerApercu(ev, stockages.get(fichier)));
      voir.addEventListener('mouseleave', cacherApercu);
    }
    if (superAdmin && doublons.has(p.id)) {
      const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
      b.className = 'danger';
      b.textContent = 'Supprimer';
      b.addEventListener('click', () => ouvrirSuppressionPhoto(p));
    } else {
      tr.appendChild(document.createElement('td'));
    }
    return tr;
  }));
}

let photoASupprimer = null;

function ouvrirSuppressionPhoto(p) {
  photoASupprimer = p;
  $('#suppr-message').textContent = `Supprimer la photo du compteur de ${p.periode} ? Cette action est irréversible.`;
  $('#dialog-supprimer-photo').showModal();
}

$('#suppr-annuler').addEventListener('click', () => $('#dialog-supprimer-photo').close());
$('#supprimer-photo-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!photoASupprimer) return;
  try {
    const { error } = await sb.from('vehicules_photos').delete().eq('id', photoASupprimer.id);
    if (error) throw error;
    $('#dialog-supprimer-photo').close();
    photoASupprimer = null;
    await loadPhotosCompteur(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de la suppression');
  }
});


async function loadAmendes(vehiculeId) {
  try {
    const { data, error } = await sb.from('amendes')
      .select('id, numero_avis, date_avis, date_infraction, heure_infraction, lieu, motif, montant, statut, technicien_id, scan')
      .eq('vehicule_id', vehiculeId)
      .order('date_avis', { ascending: false });
    if (error) throw error;
    permisConducteurs = new Map();
    const conducteurs = [...new Set(data.map((a) => a.technicien_id).filter(Boolean))];
    if (voitPermis() && conducteurs.length) {
      const { data: permis, error: e } = await sb.from('permis_conduire').select('technicien_id, numero').in('technicien_id', conducteurs);
      if (e) throw e;
      permisConducteurs = new Map(permis.map((p) => [p.technicien_id, p.numero]));
    }
    renderAmendes(data);
    renderLiensANTAI();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des amendes');
  }
}

function renderLiensANTAI() {
  const container = $('#amendes-liens');
  container.replaceChildren();
  const a1 = document.createElement('a');
  a1.href = ANTAI.designation;
  a1.target = '_blank';
  a1.rel = 'noopener';
  a1.className = 'link';
  a1.textContent = "Désigner le conducteur sur le site de l'État (ANTAI)";
  const a2 = document.createElement('a');
  a2.href = ANTAI.contestation;
  a2.target = '_blank';
  a2.rel = 'noopener';
  a2.className = 'link';
  a2.textContent = "Contester sur le site de l'État (ANTAI)";
  container.append(a1, a2);
}

function renderAmendes(list) {
  const tbody = $('#amendes-table tbody');
  tbody.replaceChildren(...list.map(a => {
    const tech = techniciens.find(t => t.id === a.technicien_id);
    const nomTech = tech ? tech.nom : '—';
    const limite = a.date_avis ? limiteDesignation(a.date_avis) : '';
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const limiteLabel = limite ? formaterDate(limite) : '—';
    let classeLimite = '';
    if (a.statut === 'a_traiter' && limite) {
      if (limite < aujourdhui) classeLimite = 'alerte-depassee';
      else {
        const diff = (Date.parse(limite + 'T00:00:00Z') - Date.parse(aujourdhui + 'T00:00:00Z')) / 86400000;
        if (diff <= 7) classeLimite = 'alerte-proche';
      }
    }
    const tr = ligne([
      a.numero_avis || '—',
      a.date_avis ? formaterDate(a.date_avis) : '—',
      (a.date_infraction ? formaterDate(a.date_infraction) : '—') + (a.heure_infraction ? ` ${a.heure_infraction}` : ''),
      a.lieu || '—',
      a.montant != null ? `${Number(a.montant).toFixed(2).replace('.', ',')} €` : '—',
      nomTech,
      '',
      '',
      ''
    ]);
    if (a.technicien_id && voitPermis()) {
      const numero = permisConducteurs.get(a.technicien_id);
      const b = boutonCopier(numero || '', 'Copier n° permis');
      b.title = numero ? 'N° de permis du conducteur, à coller sur le site de l\'ANTAI' : 'Aucun permis enregistré dans la fiche du technicien (onglet Papiers)';
      if (!numero) b.addEventListener('click', () => alert('Aucun permis enregistré : ajoutez-le dans la fiche du technicien, onglet Papiers.'), { capture: true });
      tr.children[5].append(' ', b);
    }
    const limiteTd = tr.children[6];
    if (classeLimite) limiteTd.classList.add(classeLimite);
    if (limite) limiteTd.appendChild(pastille(limiteLabel, classeLimite === 'alerte-depassee' ? 'danger' : classeLimite === 'alerte-proche' ? 'alerte' : 'ok'));
    else limiteTd.textContent = limiteLabel;
    const statutTd = tr.children[7];
    if (peutEcrire()) {
      const sel = document.createElement('select');
      const options = [
        ['a_traiter', 'À traiter'],
        ['designee', 'Conducteur désigné'],
        ['contestee', 'Contestée'],
        ['payee', 'Payée']
      ];
      for (const [val, label] of options) {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = label;
        if (a.statut === val) o.selected = true;
        sel.appendChild(o);
      }
      statutTd.appendChild(sel);
      sel.addEventListener('change', async () => {
        const newStatut = sel.value;
        const updates = { statut: newStatut };
        if (newStatut === 'designee') updates.designe_le = new Date().toISOString().slice(0, 10);
        const { error } = await sb.from('amendes').update(updates).eq('id', a.id);
        if (error) { alert(error.message); return; }
        await loadAmendes(vehiculeActif.id);
      });
    } else {
      const labels = { a_traiter: 'À traiter', designee: 'Conducteur désigné', contestee: 'Contestée', payee: 'Payée' };
      statutTd.textContent = labels[a.statut] || a.statut || '—';
    }
    const scanTd = tr.children[8];
    if (a.scan) {
      const btn = document.createElement('button');
      btn.className = 'secondary voir';   // reste visible en lecture seule
      btn.textContent = 'Voir';
      btn.addEventListener('click', async () => {
        const { data, error } = await sb.storage.from('scans').createSignedUrl(a.scan, 300);
        if (error) { alert(error.message); return; }
        window.open(data.signedUrl, '_blank', 'noopener');
      });
      scanTd.appendChild(btn);
    } else if (peutEcrire()) {
      // Amende sans scan (oubli ou envoi raté) : on peut l'ajouter ensuite.
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.hidden = true;
      input.addEventListener('change', async () => {
        const f = input.files[0];
        if (!f) return;
        if (!extensionScan(f)) { alert('Scan accepté : photo JPEG ou PNG, ou PDF.'); return; }
        await envoyerScan(a.id, f);
        await loadAmendes(vehiculeActif.id);
      });
      const btn = document.createElement('button');
      btn.className = 'secondary';
      btn.textContent = 'Ajouter le scan';
      btn.addEventListener('click', () => input.click());
      scanTd.append(btn, input);
    } else {
      scanTd.textContent = '—';
    }
    return tr;
  }));
  marquer(sousOnglet('vehicule-section-amendes'), !!document.querySelector('#amendes-table .alerte-depassee, #amendes-table .alerte-proche'));
  majPoints();
}

async function createSociete(nom, emailAdmin) {
  try {
    const { error } = await sb.rpc('creer_societe', { nom, email_admin: emailAdmin });
    if (error) throw error;
    alert(`Société créée. Invitation enregistrée pour ${emailAdmin} : prévenez la personne de créer son compte avec cet email (aucun email n'est encore envoyé automatiquement).`, 'success');
    $('#creer-societe-form').reset();
    await loadSocietes();
  } catch (err) {
    alert(err.message || 'Erreur lors de la création');
  }
}

async function inviteMember(email, role) {
  try {
    const { error } = await sb.from('invitations').insert({ societe_id: selectedSociete, email, role });
    if (error) throw error;
    $('#inviter-form').reset();
    await loadInvitations(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'invitation');
  }
}

// Événements
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearAlert();
  const email = $('#email').value;
  const password = $('#password').value;
  login(email, password);
});

$('#signup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearAlert();
  const email = $('#signup-email').value;
  const password = $('#signup-password').value;
  signup(email, password);
});

$('#signup-link').addEventListener('click', () => showScreen('signup-screen'));
$('#login-link').addEventListener('click', () => showScreen('login-screen'));
$('#logout-btn').addEventListener('click', logout);
$('#nav-deconnexion').addEventListener('click', logout);   // même action, en bas du menu de la société

$('#creer-societe-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearAlert();
  const nom = $('#societe-nom').value;
  const emailAdmin = $('#societe-email').value;
  createSociete(nom, emailAdmin);
});

$('#inviter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearAlert();
  const email = $('#invite-email').value;
  const role = $('#invite-role').value;
  inviteMember(email, role);
});

// Événements des onglets
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchOnglet(`panel-${tab.dataset.tab}`);
  });
});

$$('.sous-onglets button').forEach(button => {
  button.addEventListener('click', () => afficherSousOnglet(button.closest('#vehicule-detail, #tech-fiche'), button.dataset.cible));
});

$('#retour-societes').addEventListener('click', retournerSocietes);

// Formulaires Techniciens
$('#tech-code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = ficheTechnicien;
  if (!t || !peutEcrire()) return;
  const code = normaliserCodeTech($('#tech-code-edit').value);
  if (code === null) { $('#tech-code-etat').textContent = 'Lettres et chiffres seulement.'; return; }
  const { error } = await sb.from('techniciens').update({ code_tech: code || null }).eq('id', t.id);
  if (error) { $('#tech-code-etat').textContent = error.message; return; }
  t.code_tech = code || null;
  const dans = techniciens.find((x) => x.id === t.id); if (dans) dans.code_tech = t.code_tech;
  $('#tech-code-etat').textContent = 'Code enregistré.';
});

$('#technicien-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire()) return;
  const nom = $('#tech-nom').value.trim();
  if (!nom) return;
  const code = normaliserCodeTech($('#tech-code').value);
  if (code === null) { alert('Code tech : lettres et chiffres seulement (ex. ISTGS54).'); return; }
  try {
    const { error } = await sb.from('techniciens').insert({ societe_id: selectedSociete, nom, code_tech: code || null });
    if (error) throw error;
    $('#technicien-form').reset();
    await loadTechniciens(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Identité lue depuis la plaque (page en ligne seulement, via l'Apps Script). La base reprend
// ensuite toute seule le plan d'entretien d'un véhicule identique (migration plan_auto).
function lirePlaque(plaque) {
  return new Promise((ok) => {
    if (!window.google?.script?.run) { ok(null); return; }
    sb.auth.getSession().then(({ data }) => google.script.run.withSuccessHandler(ok).withFailureHandler(() => ok(null))
      .ficheVehicule(plaque, data.session?.access_token || ''));
  });
}
async function identiteDepuisPlaque(id, plaque) {
  const f = await lirePlaque(plaque);
  if (!f) return null;
  const champs = { marque: f.marque, modele: f.modele, carburant: f.carburant,
    motorisation: [f.carburant, f.boite && `boîte ${f.boite.toLowerCase()}`, f.annee && `modèle ${f.annee}`].filter(Boolean).join(', ') };
  const { error } = await sb.from('vehicules').update(champs).eq('id', id);
  return error ? null : champs;
}

// Formulaire Véhicules
$('#vehicule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire()) return;
  const plaque = $('#veh-plaque').value.trim().toUpperCase();
  const libelle = $('#veh-libelle').value.trim();
  if (!plaque) return;
  try {
    const { data: cree, error } = await sb.from('vehicules').insert({ societe_id: selectedSociete, plaque, libelle }).select('id').single();
    if (error) throw error;
    $('#vehicule-form').reset();
    await identiteDepuisPlaque(cree.id, plaque);
    await loadVehicules(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Filtre véhicules
$('#veh-filtre').addEventListener('change', () => {
  renderVehicules(listeVehicules, listeAffectations);
});

// Gestionnaire pour archiver/restaurer un véhicule
async function gererArchiveVehicule(archiver) {
  if (!peutEcrire() || !vehiculeActif) return;
  if (archiver) {
    const dialog = $('#dialog-vehicule-archive');
    $('#vehicule-archive-motif').value = '';
    dialog.showModal();
    const motif = await new Promise((resolve) => {
      $('#vehicule-archive-form').onsubmit = (e) => {
        e.preventDefault();
        const m = $('#vehicule-archive-motif').value.trim();
        dialog.close();
        resolve(m);
      };
    });
    if (!motif) return;
    const { error } = await sb.from('vehicules').update({ archive_le: new Date().toISOString().slice(0, 10), motif_archive: motif }).eq('id', vehiculeActif.id);
    if (error) { alert(error.message); return; }
  } else {
    const { error } = await sb.from('vehicules').update({ archive_le: null, motif_archive: '' }).eq('id', vehiculeActif.id);
    if (error) { alert(error.message); return; }
  }
  await loadVehicules(selectedSociete);
  fermerPanneauVehicule();
}

// Fermeture panneau véhicule
$('#vehicule-detail-close').addEventListener('click', fermerPanneauVehicule);
$('#vehicule-archiver').addEventListener('click', () => gererArchiveVehicule(true));
$('#vehicule-restaurer').addEventListener('click', () => gererArchiveVehicule(false));

// Fermeture fiche technicien
$('#tech-fiche-close').addEventListener('click', fermerFicheTechnicien);

const euros = (n) => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
// Lignes de la base -> format des règles testées (core/heures.js, core/frais.js).
const versHeures = (e) => ({ date: e.date, typeMission: e.type_mission, slotMidi: e.slot_midi, observationType: e.observation_type });
const versFrais = (f) => ({ categorie: f.categorie, montantEur: Number(f.montant_eur), sansTva: f.sans_tva });
const versCompta = (f) => ({ ...versFrais(f), id: f.id, date: f.date, fichier: f.fichier, statut: f.statut, tvaRecuperable: f.tva_recuperable });
const STATUTS_FRAIS = { a_traiter: 'À traiter', valide: 'Validé', refuse: 'Refusé' };
let fiche = null;   // données du tech ouvert, chargées une fois : { t, interventions, frais, photos, regles, validations }

async function chargerFicheTechnicien(t) {
  try {
    $('#tech-info').textContent = "Données envoyées par l'APK, mises à jour automatiquement toutes les heures.";
    const lire = async (requete) => { const { data, error, count } = await requete; if (error) throw error; return count ?? data; };
    const [aff, interventions, frais, photos, regles, validations, listePhotos, gestes, periodesPaie, tarifs] = await Promise.all([
      lire(sb.from('affectations').select('debut, vehicules(plaque)').eq('technicien_id', t.id).is('fin', null).order('debut', { ascending: false }).limit(1)),
      toutLire(sb.from('temps').select('date, slot_midi, type_mission, observation_type, ville, departement, numero_intervention, heure_debut, heure_fin').eq('technicien_id', t.id).order('date')),
      toutLire(sb.from('frais').select('id, date, categorie, montant_eur, sans_tva, observations, fichier, statut, tva_recuperable, motif_refus').eq('technicien_id', t.id).order('date')),
      lire(sb.from('photos_apk').select('id', { count: 'exact', head: true }).eq('technicien_id', t.id)),
      lire(sb.from('regles_societe').select('regles, valide_par, valide_le').eq('societe_id', selectedSociete).order('version', { ascending: false }).limit(1)),
      toutLire(sb.from('heures_sup').select('semaine, valide, refusee').eq('technicien_id', t.id)),
      toutLire(sb.from('photos_apk').select('nom_local, nom_drive, stockage').eq('technicien_id', t.id)),
      toutLire(sb.from('gestes_co').select('date, installes').eq('technicien_id', t.id)),
      lire(sb.from('periodes_paie').select('fin, statut').eq('societe_id', selectedSociete)),
      lire(sb.from('primes_tarifs').select('technicien_id, mois, prix').eq('technicien_id', t.id)),
    ]);
    const v = aff[0];
    const plaque = v && (Array.isArray(v.vehicules) ? v.vehicules[0]?.plaque : v.vehicules?.plaque);
    $('#tech-vehicule').textContent = plaque ? `Véhicule : ${plaque} depuis le ${formaterDate(v.debut)}` : 'Véhicule : aucun';
    fiche = { t, interventions, frais, photos: photos || 0, regles: reglesDe(regles[0] || {}),
      validations: new Map(validations.map((x) => [x.semaine, x.valide ? 'validee' : x.refusee ? 'refusee' : 'a_traiter'])),
      photosParNom: new Map(listePhotos.map((p) => [p.nom_local, p])), listePhotos, gestes, periodesPaie, baremes: baremes(tarifs) };
    const mois = [...new Set([...interventions, ...frais].map((e) => e.date.slice(0, 7)))].sort().reverse();
    $('#tech-mois').replaceChildren(...mois.map((m) => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = `${m.slice(5)}/${m.slice(0, 4)}`;
      return o;
    }));
    afficherMoisFiche();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement de la fiche');
  }
}

$('#tech-mois').addEventListener('change', afficherMoisFiche);

function afficherMoisFiche() {
  if (!fiche) return;
  const m = $('#tech-mois').value;
  const duMois = fiche.interventions.filter((e) => e.date.startsWith(m));
  const fraisMois = fiche.frais.filter((f) => f.date.startsWith(m));

  // Heures par jour : règle de l'APK (heuresJour), jour par jour.
  const dates = [...new Set(duMois.map((e) => e.date))];
  const jours = dates.map((d) => [d, heuresJour(duMois.filter((e) => e.date === d).map(versHeures))]);
  const totalHeures = jours.reduce((s, [, h]) => s + h, 0);
  const totaux = totauxFrais(fraisMois.map(versFrais));
  const valides = totauxFrais(fraisMois.filter((f) => f.statut === 'valide').map(versFrais));
  const nr = duMois.filter((e) => /^NR/.test(e.observation_type)).length;   // une annulation n'est pas un NR
  const primes = primesDuMois(fiche.gestes, fiche.interventions.map(versHeures), fiche.baremes, m);
  afficherPrimes(primes, m);
  const resume = $('#tech-resume');
  resume.replaceChildren();
  const resumeTuiles = document.createElement('div');
  resumeTuiles.className = 'tuiles';
  resumeTuiles.append(
    tuileChiffre('Prime', euros(primes.total), null, { ico: 'primes', cle: 'fiche-prime' }),
    tuileChiffre('Interventions', duMois.length, null, { ico: 'interventions', cle: 'fiche-interventions' }),
    tuileChiffre('OK', duMois.filter((e) => !e.observation_type).length, null, { ico: 'ok', cle: 'fiche-ok' }),
    tuileChiffre('NR', nr, null, { ico: 'nr', cle: 'fiche-nr' }),
    tuileChiffre('Heures', `${totalHeures} h`, null, { ico: 'heures', cle: 'fiche-heures' }),
    tuileChiffre('Frais validés', euros(valides.remboursable), null, { ico: 'frais', cle: 'fiche-frais-valides' }),
    tuileChiffre('Photos (total)', fiche.photos, null, { ico: 'photos', cle: 'fiche-photos' })
  );
  resume.appendChild(resumeTuiles);

  const creneau = { MATIN: 'Matin', APREM: 'Après-midi' };
  $('#tech-interventions-table tbody').replaceChildren(...duMois.map((e) => ligne([formaterDate(e.date),
    creneau[e.slot_midi] || '—', e.type_mission || '—', e.ville || '—', e.departement || '—',
    e.numero_intervention || '—', libelleResultat(e.observation_type), e.heure_debut || '—', e.heure_fin || '—'])));
  $('#tech-jours-table tbody').replaceChildren(...jours.map(([d, h]) => ligne([formaterDate(d), `${h} h`])));
  $('#tech-jours-total').textContent = `Total du mois : ${totalHeures} h`;

  // Heures par semaine (toutes les données, pour des semaines complètes) ; case « Validées ».
  const r = fiche.regles.heures;
  const th = $$('#tech-semaines-table thead th');
  th[4].textContent = `Sup. 1re tranche (+${Math.round(r.taux1 * 100)} %)`;
  th[5].textContent = `Sup. 2e tranche (+${Math.round(r.taux2 * 100)} %)`;
  const semainesDuMois = new Set(dates.map(semaineIso));
  const semaines = cumulSemaines(fiche.interventions.map(versHeures), r).filter((s) => semainesDuMois.has(s.semaine));
  $('#tech-semaines-table tbody').replaceChildren(...semaines.map((s) => {
    const tr = ligne([s.semaine, s.travaillees, s.absences, s.normales, s.sup1, s.sup2]);
    const td = tr.appendChild(document.createElement('td'));
    if (s.sup1 + s.sup2 === 0) { td.textContent = '—'; return tr; }
    const statutSemaine = fiche.validations.get(s.semaine) || 'a_traiter';
    const libelleStatut = statutSemaine === 'validee' ? 'Validées' : statutSemaine === 'refusee' ? 'Refusées' : 'À traiter';
    td.appendChild(pastille(libelleStatut, statutSemaine === 'validee' ? 'ok' : statutSemaine === 'refusee' ? 'danger' : 'alerte'));
    if (!peutEcrire()) return tr;
    const c = td.appendChild(document.createElement('select'));
    for (const [v, l] of [['a_traiter', 'À traiter'], ['validee', 'Validées'], ['refusee', 'Refusées']]) {
      const o = c.appendChild(document.createElement('option'));
      o.value = v;
      o.textContent = l;
    }
    c.value = statutSemaine;
    c.disabled = !peutEcrire();
    c.setAttribute('aria-label', `Heures sup, semaine ${s.semaine}`);
    c.addEventListener('change', () => validerHeuresSup(s, c));
    return tr;
  }));
  pointHeures();

  const justifs = new Set(fiche.listePhotos.filter((p) => p.stockage).map((p) => p.nom_local));
  const ctrl = controles(fiche.frais.map(versCompta), justifs);
  $('#tech-frais-table tbody').replaceChildren(...fraisMois.map((f) => {
    const l = ligneFrais(versFrais(f));
    const tr = ligne([formaterDate(f.date), f.categorie || '—', euros(l.ttc), euros(l.ht), euros(l.tva),
      euros(l.remboursable), f.sans_tva ? 'Oui' : 'Non', f.observations || '—']);
    tr.appendChild(boutonPhoto(fiche.photosParNom.get(f.fichier)?.stockage));
    const alertesFrais = ctrl.get(f.id).filter((a) => a !== 'à valider' && a !== 'refusé');
    const td = tr.appendChild(document.createElement('td'));
    td.textContent = [...alertesFrais, f.statut === 'refuse' && `refusé : ${f.motif_refus}`].filter(Boolean).join(', ') || '—';
    if (alertesFrais.length) td.className = 'alerte-proche';
    const etat = tr.appendChild(document.createElement('td')).appendChild(document.createElement('select'));
    etat.append(...Object.entries(STATUTS_FRAIS).map(([v, libelle]) => new Option(libelle, v, false, v === f.statut)));
    etat.disabled = !peutEcrire();
    etat.setAttribute('aria-label', `État du frais du ${formaterDate(f.date)}`);
    etat.addEventListener('change', () => changerFrais(f, { statut: etat.value }));
    const tva = tr.appendChild(document.createElement('td')).appendChild(document.createElement('input'));
    tva.type = 'checkbox';
    tva.checked = f.tva_recuperable;
    tva.disabled = !peutEcrire() || f.statut !== 'valide' || f.sans_tva;
    tva.setAttribute('aria-label', `TVA récupérable, frais du ${formaterDate(f.date)}`);
    tva.addEventListener('change', () => changerFrais(f, { tva_recuperable: tva.checked }));
    return tr;
  }));
  marquer(sousOnglet('tech-section-frais'), fraisMois.some((f) => f.statut === 'a_traiter'));
  afficherGalerie(m);
  $('#tech-camemberts').replaceChildren(
    barres('Types de mission', repartition(duMois.map((e) => e.type_mission || '—')), false),
    barres('Résultats', repartition(duMois.map((e) => libelleResultat(e.observation_type))), false));
  const fraisTuiles = document.createElement('div');
  fraisTuiles.className = 'tuiles';
  fraisTuiles.append(
    tuileChiffre('TTC', euros(totaux.ttc), null, { ico: 'frais', cle: 'fiche-frais-ttc' }),
    tuileChiffre('HT', euros(totaux.ht), null, { ico: 'frais', cle: 'fiche-frais-ht' }),
    tuileChiffre('TVA', euros(totaux.tva), null, { ico: 'frais', cle: 'fiche-frais-tva' }),
    tuileChiffre('Remboursable', euros(totaux.remboursable), null, { ico: 'frais', cle: 'fiche-frais-remboursable' }),
    tuileChiffre('Validé (remboursé)', euros(valides.remboursable), null, { ico: 'ok', cle: 'fiche-frais-valide' })
  );
  $('#tech-frais-totaux').replaceChildren(fraisTuiles);
}

// Photo du stockage privé : lien signé valable 10 minutes, ouvert dans un nouvel onglet.
async function ouvrirPhoto(chemin) {
  const { data, error } = await sb.storage.from('photos').createSignedUrl(chemin, 600);
  if (error) { alert(error.message); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

// Cellule « Voir » (visible aussi en lecture seule) ou « — » si la photo n'est pas encore copiée.
function boutonPhoto(chemin) {
  const td = document.createElement('td');
  if (!chemin) { td.textContent = '—'; return td; }
  const b = td.appendChild(document.createElement('button'));
  b.className = 'secondary voir';
  b.textContent = 'Voir';
  b.addEventListener('click', () => ouvrirPhoto(chemin));
  return td;
}

// Galerie du mois : photos copiées dont le dossier de cycle est ce mois (…/<AAAA-MM>/<nom>).
async function afficherGalerie(m) {
  const copiees = fiche.listePhotos.filter((p) => p.stockage && p.stockage.split('/').at(-2) === m);
  const enAttente = fiche.listePhotos.filter((p) => !p.stockage).length;
  $('#tech-photos-info').textContent = `${copiees.length} photo(s) ce mois-ci.` +
    (enAttente ? ` ${enAttente} photo(s) en cours de copie depuis l'APK (toutes les heures).` : '');
  const galerie = $('#tech-photos');
  galerie.replaceChildren();
  if (!copiees.length) return;
  const { data, error } = await sb.storage.from('photos').createSignedUrls(copiees.map((p) => p.stockage), 600);
  if (error) { alert(error.message); return; }
  if ($('#tech-mois').value !== m) return;   // mois changé pendant le chargement
  galerie.replaceChildren(...data.map((d, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Ouvrir la photo ${copiees[i].nom_drive}`);
    const fig = b.appendChild(document.createElement('figure'));
    fig.style.margin = '0';
    if (/\.pdf$/i.test(copiees[i].stockage)) {   // justificatif PDF : vignette texte, ouvert d'un clic
      fig.appendChild(document.createElement('div')).className = 'vignette-pdf';
      fig.firstChild.textContent = 'PDF';
    } else {
      const img = fig.appendChild(document.createElement('img'));
      img.src = d.signedUrl;
      img.alt = copiees[i].nom_drive;
      img.loading = 'lazy';
    }
    fig.appendChild(document.createElement('figcaption')).textContent = copiees[i].nom_drive;
    b.addEventListener('click', () => window.open(d.signedUrl, '_blank', 'noopener'));
    return b;
  }));
}

// ===== Paie : tous les techniciens d'une période (cycle du 21 au 20) =====
const iso = (d) => d.toISOString().slice(0, 10);
const decaler = (date, jours) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + jours * 86400000));

const STATUT_PERIODE = { brouillon: 'En cours', validee: 'Validé', exportee: 'Clôturé' };
let periodes = [];
const periodeChoisie = () => periodes.find((p) => p.id === $('#paie-periode').value);
const peutPayer = () => superAdmin || ['admin', 'gestion', 'comptable'].includes(monRole);

$('#paie-periode').addEventListener('change', chargerPaie);
let lignesPaie = [];

// Mois de paie de la société (periodes_paie) : un cycle qui se clôture en fin de semaine.
async function chargerPaie() {
  const { data, error } = await sb.from('periodes_paie').select('id, debut, fin, statut, exporte_le')
    .eq('societe_id', selectedSociete).order('debut', { ascending: false });
  if (error) { alert(error.message); return; }
  periodes = data;
  const sel = $('#paie-periode'), avant = sel.value;
  sel.replaceChildren(...periodes.map((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${formaterDate(p.debut)} → ${formaterDate(p.fin)} — ${STATUT_PERIODE[p.statut]}`;
    return o;
  }));
  if (periodes.some((p) => p.id === avant)) sel.value = avant;
  // Nouveau mois : lendemain de la dernière clôture, fin = samedi le plus proche du 20.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const debut = periodes[0] ? lendemain(periodes[0].fin) : lendemain(finProposee(plusMois(aujourdhui.slice(0, 7), -1) + '-01'));
  $('#periode-debut').value = debut;
  $('#periode-fin').value = finProposee(debut > aujourdhui ? debut : aujourdhui);
  $('#periode-form').closest('details').classList.toggle('hidden', !peutPayer());
  const p = periodeChoisie();
  afficherEtatPeriode(p);
  // Aucun mois encore : pas de liste vide, le formulaire de création est ouvert.
  sel.closest('.field').classList.toggle('hidden', !periodes.length);
  $('#paie-table').closest('.table-wrapper').classList.toggle('hidden', !p);
  if (!periodes.length) $('#periode-form').closest('details').open = true;
  majPoints();
  if (!p) {
    lignesPaie = [];
    $('#paie-table tbody').replaceChildren();
    $('#paie-resume').textContent = 'Aucun mois de paie : créez le premier avec « Nouveau mois de paie ».';
    $('#paie-totaux').textContent = '';
    return;
  }
  await calculerPaie(p.debut, p.fin);
}

function afficherEtatPeriode(p) {
  const valider = $('#periode-valider'), exporter = $('#paie-export');
  valider.classList.toggle('hidden', !p || p.statut !== 'brouillon' || !peutPayer());
  exporter.classList.toggle('hidden', !p || p.statut === 'brouillon' || !peutPayer());
  exporter.textContent = p?.statut === 'exportee' ? 'Télécharger à nouveau' : 'Exporter et clôturer';
  $('#paie-statut').textContent = !p ? '' : {
    brouillon: 'Mois en cours : vérifiez et traitez les heures sup et les congés, puis « Valider le mois ».',
    validee: 'Mois validé : « Exporter et clôturer » télécharge le fichier de paie et verrouille le mois.',
    exportee: `Mois clôturé le ${formaterDate(String(p.exporte_le).slice(0, 10))} : heures, frais et validations sont verrouillés.`,
  }[p.statut];
}

$('#periode-valider').addEventListener('click', async () => {
  const p = periodeChoisie();
  if (lignesPaie.some((l) => l.v.semainesATraiter || l.conges)
    && !confirm('Des éléments ne sont pas traités : les heures sup non validées ne seront pas payées. Valider le mois quand même ?')) return;
  const { error } = await sb.from('periodes_paie').update({ statut: 'validee' }).eq('id', p.id);
  if (error) { alert(error.message); return; }
  await chargerPaie();
});

$('#periode-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  const debut = $('#periode-debut').value, fin = $('#periode-fin').value;
  if (fin < debut) { alert('La date de fin est avant la date de début.'); return; }
  const { error } = await sb.from('periodes_paie').insert({ societe_id: selectedSociete, debut, fin });
  if (error) { alert(error.message); return; }
  $('#paie-periode').replaceChildren();   // le nouveau mois (le plus récent) sera choisi
  await chargerPaie();
});

async function calculerPaie(debut, fin) {
  try {
    const lire = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
    // ±6 jours : les semaines à cheval sur la période sont complètes (rattachées par leur samedi).
    const [temps, frais, validations, conges, regles] = await Promise.all([
      toutLire(sb.from('temps').select('technicien_id, date, slot_midi, type_mission, observation_type').eq('societe_id', selectedSociete).gte('date', decaler(debut, -6)).lte('date', decaler(fin, 6))),
      toutLire(sb.from('frais').select('technicien_id, date, categorie, montant_eur, sans_tva, statut').eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin)),
      toutLire(sb.from('heures_sup').select('technicien_id, semaine, valide, refusee').eq('societe_id', selectedSociete)),
      lire(sb.from('conges').select('technicien_id').eq('societe_id', selectedSociete).eq('statut', 'demandee')),
      lire(sb.from('regles_societe').select('regles, valide_par, valide_le').eq('societe_id', selectedSociete).order('version', { ascending: false }).limit(1)),
    ]);
    const r = reglesDe(regles[0] || {});
    const de = (liste, t) => liste.filter((x) => x.technicien_id === t.id);
    // Primes versées avec cette paie : celles du mois - 2 (règle de l'APK).
    const mp = moisDesPrimes(fin), finMp = decaler(plusMois(mp, 1) + '-01', -1);
    const [gestes, tarifs, jours] = await Promise.all([
      toutLire(sb.from('gestes_co').select('technicien_id, date, installes').eq('societe_id', selectedSociete).gte('date', mp + '-01').lte('date', finMp)),
      lire(sb.from('primes_tarifs').select('technicien_id, mois, prix').eq('societe_id', selectedSociete)),
      toutLire(sb.from('temps').select('technicien_id, date, type_mission').eq('societe_id', selectedSociete).gte('date', mp + '-01').lte('date', finMp)),
    ]);
    $('#paie-primes-info').textContent = `Primes : celles de ${libelleMois(mp)}, versées avec cette paie.`;
    lignesPaie = techniciens.filter((t) => t.actif).map((t) => ({ t,
      v: variablesPaie({ tech: t.nom, periode: { debut, fin }, temps: de(temps, t).map(versHeures),
        frais: de(frais, t).filter((f) => f.statut === 'valide').map((f) => ({ date: f.date, ...versFrais(f) })),
        primes: primesDuMois(de(gestes, t), de(jours, t).map(versHeures), baremes(de(tarifs, t)), mp).total, regles: r, validations: de(validations, t) }),
      conges: de(conges, t).length, fraisATraiter: de(frais, t).filter((f) => f.statut === 'a_traiter').length }));
    afficherPaie();
  } catch (err) {
    alert(err.message || 'Erreur lors du calcul de la paie');
  }
}

function afficherPaie() {
  const h = (n) => `${Math.round(n * 100) / 100} h`;
  let aTraiter = 0;
  $('#paie-table tbody').replaceChildren(...lignesPaie.map(({ t, v, conges, fraisATraiter }) => {
    const reste = [v.semainesATraiter && `${v.semainesATraiter} semaine(s) d'heures sup`, conges && `${conges} congé(s) en attente`,
      fraisATraiter && `${fraisATraiter} frais à valider`].filter(Boolean);
    if (reste.length) aTraiter++;
    const tr = ligne([t.nom, h(v.heuresNormales), h(v.sup1), h(v.sup2), h(v.absences), euros(v.fraisRemboursables), euros(v.primes),
      h(v.supRefusees), reste.join(', ') || '—', reste.length ? 'À traiter' : 'Prêt']);
    tr.children[9].className = reste.length ? 'alerte-proche' : 'etat-pret';
    tr.children[0].prepend(avatar(t.nom));
    tr.children[9].replaceChildren(pastille(reste.length ? 'À traiter' : 'Prêt', reste.length ? 'alerte' : 'ok'));
    tr.classList.add('ligne-cliquable');
    const fleche = tr.appendChild(document.createElement('td'));
    fleche.className = 'fleche';
    fleche.setAttribute('aria-hidden', 'true');
    fleche.textContent = '›';
    tr.addEventListener('click', () => { switchOnglet('panel-techniciens'); ouvrirFicheTechnicien(t); });
    return tr;
  }));
  const somme = (k) => lignesPaie.reduce((s, l) => s + l.v[k], 0);
  const sup1 = somme('sup1'), sup2 = somme('sup2');
  $('#paie-resume').replaceChildren(
    tuileChiffre('Techniciens', lignesPaie.length, `${lignesPaie.length - aTraiter} prêt(s)`, { ico: 'interventions', cle: 'paie-techniciens' }),
    tuileChiffre('À traiter', aTraiter, null, { ico: 'heures', cle: 'paie-a-traiter' }),
    tuileChiffre('Heures normales', h(somme('heuresNormales')), null, { ico: 'heures', cle: 'paie-heures' }),
    tuileChiffre('Heures supplémentaires', h(sup1 + sup2), `validées : ${h(sup1)} + ${h(sup2)}`, { ico: 'heures', cle: 'paie-heures-sup' }),
    tuileChiffre('Frais remboursables', euros(somme('fraisRemboursables')), null, { ico: 'frais', cle: 'paie-frais' }),
    tuileChiffre('Primes', euros(somme('primes')), null, { ico: 'primes', cle: 'paie-primes' }),
  );
  $('#paie-totaux').textContent = '';
}

$('#paie-export').addEventListener('click', async () => {
  const p = periodeChoisie();
  if (!p || !lignesPaie.length) return;
  if (p.statut === 'validee' && !confirm('Exporter et clôturer : après la clôture, plus aucune modification des heures, frais et validations de ce mois. Continuer ?')) return;
  const csv = versCsv(lignesPaie.map(({ v }) => {
    const { supRefusees, semainesATraiter, ...exportees } = v;
    return exportees;
  }));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `paie-${p.debut}-au-${p.fin}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  if (p.statut !== 'validee') return;
  const { error } = await sb.from('periodes_paie').update({ statut: 'exportee' }).eq('id', p.id);
  if (error) { alert(error.message); return; }
  await chargerPaie();
});

// ===== Congés : demandes à valider (saisies au bureau ; l'APK plus tard) =====
const TYPES_CONGE = { CP: 'Congés payés', RTT: 'RTT', SANS_SOLDE: 'Sans solde', AUTRE: 'Autre' };
const STATUTS_CONGE = { demandee: 'À valider', validee: 'Validé', refusee: 'Refusé' };

async function compterCongesAValider() {
  const { count, error } = await sb.from('conges').select('id', { count: 'exact', head: true })
    .eq('societe_id', selectedSociete).eq('statut', 'demandee');
  $('#onglet-conges').textContent = !error && count ? `Congés (${count})` : 'Congés';
  majPoints();
}

$('#conges-filtre').addEventListener('change', chargerConges);
pilulesDepuisSelect($('#conges-filtre'), 'Demandes affichées');

async function chargerConges() {
  let q = sb.from('conges').select('id, technicien_id, debut, fin, type, motif, statut, decide_par, decide_le, modifie_par, modifie_le, motif_modification').eq('societe_id', selectedSociete).order('debut');
  if ($('#conges-filtre').value) q = q.eq('statut', $('#conges-filtre').value);
  const { data, error } = await q;
  if (error) { alert(error.message); return; }
  const nom = (id) => techniciens.find((t) => t.id === id)?.nom || '—';
  const nomUtilisateur = (id) => id ? (techniciens.find((t) => t.id === id)?.nom || `Utilisateur ${id.slice(0, 8)}`) : '—';
  $('#conges-table tbody').replaceChildren(...data.map((c) => {
    const jours = (Date.parse(c.fin) - Date.parse(c.debut)) / 86400000 + 1;
    const tr = ligne([nom(c.technicien_id), formaterDate(c.debut), formaterDate(c.fin), jours,
      TYPES_CONGE[c.type] || c.type, c.motif || '—', '']);
    const statut = STATUTS_CONGE[c.statut] || c.statut;
    let couleur = c.statut === 'demandee' ? 'alerte' : c.statut === 'validee' ? 'ok' : c.statut === 'refusee' ? 'danger' : c.statut === 'annulee' ? 'neutre' : 'neutre';
    tr.children[6].replaceChildren(pastille(statut, couleur));
    const td = tr.appendChild(document.createElement('td'));
    if (!peutEcrire()) { td.textContent = '—'; return tr; }
    if (c.statut === 'demandee') {
      for (const [s, libelle, classe] of [['validee', 'Valider', ''], ['refusee', 'Refuser', 'danger']]) {
        const b = td.appendChild(document.createElement('button'));
        b.textContent = libelle;
        if (classe) b.className = classe;
        b.addEventListener('click', async () => {
          const { error: e } = await sb.from('conges').update({ statut: s }).eq('id', c.id);
          if (e) { alert(e.message); return; }
          await chargerConges();
          compterCongesAValider();
        });
      }
    } else if (c.statut === 'validee') {
      const b = td.appendChild(document.createElement('button'));
      b.textContent = 'Annuler';
      b.className = 'danger';
      b.addEventListener('click', async () => {
        const dialog = $('#dialog-conge-modif');
        $('#conge-modif-motif').value = '';
        dialog.showModal();
        const formData = await new Promise((resolve) => {
          $('#conge-modif-form').onsubmit = () => false;
          $('#conge-modif-form').onchange = () => {};
          const handler = (e) => {
            e.preventDefault();
            const action = e.submitter?.value;
            $('#conge-modif-form').removeEventListener('submit', handler);
            resolve({ action });
          };
          $('#conge-modif-form').addEventListener('submit', handler);
        });
        dialog.close();
        if (formData.action === 'annuler') {
          const motif = $('#conge-modif-motif').value.trim();
          if (!motif) { alert('Motif obligatoire'); return; }
          const { error: e } = await sb.from('conges').update({ statut: 'annulee', motif_modification: motif }).eq('id', c.id);
          if (e) { alert(e.message); return; }
          await chargerConges();
          compterCongesAValider();
        }
      });
    }
    return tr;
  }));
}

$('#conge-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  const debut = $('#conge-debut').value, fin = $('#conge-fin').value;
  if (fin < debut) { alert('La date de fin est avant la date de début.'); return; }
  const { error } = await sb.from('conges').insert({ societe_id: selectedSociete, technicien_id: $('#conge-tech').value,
    debut, fin, type: $('#conge-type').value, motif: $('#conge-motif').value.trim() });
  if (error) { alert(error.message); return; }
  $('#conge-form').reset();
  await chargerConges();
  compterCongesAValider();
});

// Point sur « Heures » tant qu'une semaine d'heures sup du mois est « À traiter ».
function pointHeures() {
  marquer(sousOnglet('tech-section-heures'), [...document.querySelectorAll('#tech-semaines-table select')].some((c) => c.value === 'a_traiter'));
}

// Barèmes des réglages APK (lignes primes_tarifs) -> même forme que reglages.json.
function baremes(lignes) {
  return { prices: lignes.find((l) => l.mois === 'courant')?.prix,
    primeTarifsParMois: Object.fromEntries(lignes.filter((l) => l.mois !== 'courant').map((l) => [l.mois, l.prix])) };
}
const libelleMois = (m) => `${m.slice(5)}/${m.slice(0, 4)}`;
const plusMois = (m, n) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);

function afficherPrimes(primes, m) {
  const payee = primePayee(m, fiche.periodesPaie);
  $('#tech-primes-info').textContent = `Prime de ${libelleMois(m)} : ${euros(primes.total)} — ${payee ? 'payée' : 'à payer'} sur le salaire de ${libelleMois(plusMois(m, 2))}${payee ? ' (paie clôturée)' : ''}.`;
  $('#tech-primes-table tbody').replaceChildren(...primes.detail.map((d) => ligne([d.type, d.qte, euros(d.montant)])));
}

// ===== Tableau de bord de la société : chiffres du mois et tâches à faire =====
$('#bord-mois').addEventListener('change', chargerBord);

// Rendu « doux » (RENDU.md) : forme 3D, pastille du menu, recherche ⌘K, bouton du bandeau.
$('#forme-connexion').src = OBJETS_3D.noeud;
installerPastille($('.tabs'));
$('#bord-voir-interventions').addEventListener('click', () => switchOnglet('panel-interventions'));
const SECTIONS = [['bord', 'Tableau de bord'], ['techniciens', 'Techniciens'], ['interventions', 'Interventions'], ['conges', 'Congés'],
  ['messages', 'Messages'], ['vehicules', 'Véhicules'], ['paie', 'Paie'], ['compta', 'Compta'], ['facturation', 'Facturation'], ['membres', 'Membres']];
function ouvrirRecherche() {
  if (!selectedSociete || $('#societe-detail').classList.contains('hidden')) return;
  const elements = [
    ...SECTIONS.filter(([t]) => !$(`.tab[data-tab="${t}"]`)?.classList.contains('hidden'))
      .map(([t, nom]) => ({ titre: nom, sousTitre: 'Aller à la section', motsCles: t, action: () => switchOnglet(`panel-${t}`) })),
    ...techniciens.map((t) => ({ titre: t.nom, sousTitre: t.actif === false ? 'Technicien archivé' : 'Technicien', motsCles: t.nom_apk || '',
      action: () => { switchOnglet('panel-techniciens'); ouvrirFicheTechnicien(t); } })),
    ...listeVehicules.map((v) => ({ titre: v.plaque, sousTitre: ['Véhicule', v.marque, v.modele].filter(Boolean).join(' · '), motsCles: v.libelle || '',
      action: () => { switchOnglet('panel-vehicules'); ouvrirVehicule(v); } })),
  ];
  ouvrirPalette({ elements, onChoisir: (e) => e.action() });
}
installerRaccourci(ouvrirRecherche);
$('#ouvrir-recherche').addEventListener('click', ouvrirRecherche);
// Le raccourci affiché suit la machine : ⌘K sur Mac, Ctrl K ailleurs (les deux marchent partout).
$('#ouvrir-recherche kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
let entreeFaite = false;              // arrivée des cartes : une seule fois par ouverture de la page
const derniersChiffres = new Map();   // un chiffre ne redéfile que s'il a changé
let activite = null;                  // { mois12, parMois } : interventions des 12 derniers mois (courbe)

// ---- Synchro des téléphones : petit bouton du menu et voyant vérifié en continu (pont Apps Script) ----
// Le pont vérifie le jeton et le rôle ; il renvoie seulement des compteurs et des erreurs.
const PONT = { url: typeof URL_PONT === 'string' ? URL_PONT : '', societe: typeof SOCIETE_PONT === 'string' ? SOCIETE_PONT : '' };
const estSocietePont = () => Boolean(PONT.url) && selectedSociete === PONT.societe;
const boutonSynchro = $('#synchro-forcee');
let dernierBilan = null, erreurEtat = '';   // dernier import connu (horaire ou forcé), tel que le pont l'a gardé
async function appelPont(action, corps = {}) {
  const { data } = await sb.auth.getSession();
  // Corps en texte brut : requête « simple », sans pré-vérification CORS ; le pont suit la double redirection.
  const r = await fetch(PONT.url, { method: 'POST', body: JSON.stringify({ jeton: data.session?.access_token || '', action, ...corps }) });
  // Une page d'erreur Google (quota, panne) n'est pas du JSON : message clair plutôt qu'une erreur technique.
  const res = await r.json().catch(() => { throw new Error('le pont ne répond pas normalement, réessayez plus tard'); });
  if (res.erreur) throw new Error(res.erreur);
  return res;
}
const synchroVisible = () => Boolean(PONT.url && session) && selectedSociete === PONT.societe && peutEcrire();
const resumeBilan = (b) => `${b.fichiers} fichier(s), ${b.photos} photo(s)` + (b.erreurs?.length ? ` — ${b.erreurs.length} alerte(s)` : ' — sans erreur');
// Voyant : vert = import de moins de 75 min sans erreur ; orange = alertes ; rouge = plus d'import depuis 75 min
// (le pont passe toutes les heures : au-delà, il est en panne, comme les 18 et 19/11/2026).
function etatSynchro(b) {
  if (!b) return { etat: 'inconnu', court: '—', long: erreurEtat ? `État de la synchro indisponible : ${erreurEtat}` : 'Aucune synchro enregistrée pour l\'instant.' };
  const min = Math.max(0, Math.round((Date.now() - Date.parse(b.le)) / 60000));
  const court = min < 1 ? 'à l\'instant' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h`;
  const long = `Dernière synchro ${min < 1 ? 'à l\'instant' : `il y a ${court}`} : ${resumeBilan(b)}.`;
  if (min > 75) return { etat: 'retard', court: 'en retard', long: `${long} L'import automatique (toutes les heures) ne passe plus.` };
  if (b.erreurs?.length) return { etat: 'alerte', court: 'alerte', long: `${long} ${b.erreurs.join(' ; ')}` };
  return { etat: 'ok', court, long };
}
function peindreSynchro() {
  boutonSynchro.classList.toggle('hidden', !synchroVisible());
  if (boutonSynchro.getAttribute('aria-busy') === 'true') return;
  const e = etatSynchro(dernierBilan);
  boutonSynchro.dataset.etat = e.etat;
  boutonSynchro.title = e.long;
  boutonSynchro.querySelector('.temps').textContent = e.court;
  $('#synchro-etat').textContent = e.long;
}
// Demande au pont l'état du dernier import. Un nouvel import (horaire, ou lancé par un collègue) met à jour
// le tableau de bord tout seul ; les autres écrans ne bougent pas sous les yeux de l'utilisateur.
async function verifierSynchro({ rafraichir = true } = {}) {
  if (!synchroVisible()) { peindreSynchro(); return; }
  const avant = dernierBilan?.le;
  try {
    dernierBilan = (await appelPont('etat')).dernier;
    erreurEtat = '';
  } catch (err) {
    dernierBilan = null;
    erreurEtat = err.message;
  }
  peindreSynchro();
  if (rafraichir && avant && dernierBilan?.le && dernierBilan.le !== avant && $('.tab.active')?.dataset.tab === 'bord') chargerBord();
}
setInterval(peindreSynchro, 30 * 1000);   // « 4 min » avance sans appel réseau
setInterval(() => { if (document.visibilityState === 'visible') verifierSynchro(); }, 2 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifierSynchro(); });
boutonSynchro.addEventListener('click', async () => {
  if (boutonSynchro.getAttribute('aria-busy') === 'true') return;
  boutonSynchro.setAttribute('aria-busy', 'true');
  boutonSynchro.querySelector('.libelle').textContent = 'Synchronisation…';
  boutonSynchro.querySelector('.temps').textContent = '';
  try {
    const { bilan } = await appelPont('synchroniser');
    dernierBilan = { ...bilan, le: new Date().toISOString() };
    const ouvert = $('.tab.active')?.dataset.tab;
    await loadSocieteDetail(selectedSociete);   // données à jour à l'écran
    if (ouvert && ouvert !== 'bord') switchOnglet(`panel-${ouvert}`);   // on reste sur l'écran ouvert
    $('#synchro-annonce').textContent = `Synchronisation terminée : ${resumeBilan(bilan)}.`;
  } catch (err) {
    $('#synchro-annonce').textContent = `Échec de la synchro : ${err.message}`;
    alert(`Échec de la synchro : ${err.message}`);
  } finally {
    boutonSynchro.removeAttribute('aria-busy');
    boutonSynchro.querySelector('.libelle').textContent = 'Synchroniser';
    peindreSynchro();
  }
});

// Tuile chiffrée (tableau de bord et autres écrans) : icône, évolution, valeur qui défile, note, mini-courbe.
// `cle` distingue deux tuiles de même libellé sur deux écrans (le chiffre ne redéfile que s'il a changé).
function tuileChiffre(libelle, valeur, note, { ico, delta, serie, forte, cle = libelle } = {}) {
  const d = document.createElement('div');
  d.className = forte ? 'tuile forte' : 'tuile';
  const entete = d.appendChild(document.createElement('div'));
  entete.className = 'entete';
  const icone = entete.appendChild(document.createElement('span'));
  icone.className = 'icone';
  icone.dataset.ico = ico || '';
  icone.setAttribute('aria-hidden', 'true');
  if (delta) {
    const b = entete.appendChild(document.createElement('span'));
    b.className = `delta ${delta.sens}`;
    b.textContent = delta.texte;
    b.title = 'Par rapport au mois précédent';
  }
  d.appendChild(document.createElement('span')).className = 'libelle';
  d.lastChild.textContent = libelle;
  const v = d.appendChild(document.createElement('span'));
  v.className = 'valeur';
  const texte = String(valeur);
  compteur(v, texte, derniersChiffres.get(cle) !== texte);   // ne redéfile que si la valeur change
  derniersChiffres.set(cle, texte);
  if (note) { d.appendChild(document.createElement('span')).className = 'note'; d.lastChild.textContent = note; }
  if (serie) d.appendChild(miniCourbe(serie));
  return d;
}

async function chargerBord() {
  const sel = $('#bord-mois');
  if (!sel.options.length) {
    const m0 = new Date().toISOString().slice(0, 7);
    sel.replaceChildren(...Array.from({ length: 12 }, (_, i) => plusMois(m0, -i)).map((m) => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = libelleMois(m);
      return o;
    }));
  }
  const m = sel.value, debut = m + '-01', fin = decaler(plusMois(m, 1) + '-01', -1);
  $('#bord-surtitre').textContent = `${$('#societe-detail-title').textContent} · ${libelleMois(m)}`;
  try {
    const lire = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
    const [temps, frais, gestes, tarifs, validations, regles, echeances, amendes, conges, aCloturer] = await Promise.all([
      toutLire(sb.from('temps').select('technicien_id, date, slot_midi, type_mission, observation_type').eq('societe_id', selectedSociete).gte('date', decaler(debut, -6)).lte('date', decaler(fin, 6))),
      toutLire(sb.from('frais').select('technicien_id, date, categorie, montant_eur, sans_tva').eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin)),
      toutLire(sb.from('gestes_co').select('technicien_id, date, installes').eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin)),
      lire(sb.from('primes_tarifs').select('technicien_id, mois, prix').eq('societe_id', selectedSociete)),
      toutLire(sb.from('heures_sup').select('technicien_id, semaine, valide, refusee').eq('societe_id', selectedSociete)),
      lire(sb.from('regles_societe').select('regles, valide_par, valide_le').eq('societe_id', selectedSociete).order('version', { ascending: false }).limit(1)),
      lire(sb.from('echeances').select('type, date, vehicules(id, plaque)').eq('societe_id', selectedSociete).is('fait_le', null).not('date', 'is', null).lte('date', dansJours(30)).order('date')),
      lire(sb.from('amendes').select('numero_avis, date_avis, vehicules(id, plaque)').eq('societe_id', selectedSociete).eq('statut', 'a_traiter')),
      lire(sb.from('conges').select('id').eq('societe_id', selectedSociete).eq('statut', 'demandee')),
      lire(sb.from('periodes_paie').select('debut, fin').eq('societe_id', selectedSociete).neq('statut', 'exportee').lt('fin', dansJours(0))),
    ]);
    const r = reglesDe(regles[0] || {});
    const mois12 = Array.from({ length: 12 }, (_, i) => plusMois(m, i - 11));
    const parMois = await Promise.all(mois12.map(async (mm) => {
      const { count, error } = await sb.from('temps').select('id', { count: 'exact', head: true }).eq('societe_id', selectedSociete)
        .gte('date', mm + '-01').lte('date', decaler(plusMois(mm, 1) + '-01', -1));
      if (error) throw error;
      return count || 0;
    }));
    activite = { mois12, parMois };
    const duMois = temps.filter((e) => e.date >= debut && e.date <= fin);
    const de = (liste, t) => liste.filter((x) => x.technicien_id === t.id);
    const heuresDe = (liste) => [...new Set(liste.map((e) => e.date))]
      .reduce((h, d) => h + heuresJour(liste.filter((e) => e.date === d).map(versHeures)), 0);

    // Par technicien (actifs, ou ayant travaillé ce mois-ci).
    const lignes = techniciens.filter((t) => t.actif || de(duMois, t).length).map((t) => {
      const ti = de(duMois, t);
      const v = variablesPaie({ tech: t.nom, periode: { debut, fin }, temps: de(temps, t).map(versHeures), frais: [], regles: r, validations: de(validations, t) });
      return { t, interventions: ti.length, nr: tauxNr(ti.map(versHeuresNr), m), heures: heuresDe(ti),
        frais: totauxFrais(de(frais, t).map(versFrais)).remboursable,
        primes: primesDuMois(de(gestes, t), de(temps, t).map(versHeures), baremes(de(tarifs, t)), m).total,
        semainesATraiter: v.semainesATraiter };
    });
    const somme = (k) => lignes.reduce((x, l) => x + l[k], 0);
    const nrSociete = tauxNr(duMois.map(versHeuresNr), m);

    const pc = (x) => (x.pourcent == null ? '—' : `${x.pourcent.toFixed(1).replace('.', ',')} %`);
    // Objectif NR : vert jusqu'à 8 %, rouge au-dessus (icône + texte, pas la couleur seule).
    const tuileNr = () => {
      const p = nrSociete.pourcent;
      const t = tuileChiffre('Taux NR (installations)', pc(nrSociete),
        p == null ? 'Aucune installation' : p <= 8 ? '✓ Objectif atteint (≤ 8 %)' : '⚠ Au-dessus de l\'objectif (8 %)', { ico: 'nr' });
      if (p != null) {
        t.classList.add(p <= 8 ? 'objectif-ok' : 'objectif-ko');
        t.appendChild(anneau(1 - p / 100, derniersChiffres.get('anneau') !== String(p)));   // part d'installations réussies
        derniersChiffres.set('anneau', String(p));
      }
      return t;
    };
    $('#bord-chiffres').replaceChildren(
      tuileChiffre('Interventions', duMois.length, null,
        { ico: 'interventions', forte: true, delta: variation(parMois[11], parMois[10]), serie: parMois.slice(-6) }),
      tuileNr(),
      tuileChiffre('Heures', `${somme('heures')} h`, null, { ico: 'heures' }),
      tuileChiffre('Frais remboursables', euros(somme('frais')), null, { ico: 'frais' }),
      tuileChiffre('Primes du mois', euros(somme('primes')), `versées sur le salaire de ${libelleMois(plusMois(m, 2))}`, { ico: 'primes' }));

    // Bandeau : 3 chiffres clés et anneau des installations réussies, entouré des techniciens actifs.
    const reussite = nrSociete.pourcent == null ? null : 100 - nrSociete.pourcent;
    const actifs = lignes.filter((l) => l.interventions > 0);
    $('#bord-chiffres-cles')?.replaceChildren(...[[duMois.length, 'interventions'], [actifs.length, 'techniciens actifs'],
      [reussite == null ? '—' : `${Math.round(reussite)} %`, 'installations réussies']].map(([v, lib]) => {
      const d = document.createElement('div');
      d.appendChild(document.createElement('span')).className = 'valeur';
      d.lastChild.textContent = v;
      d.appendChild(document.createElement('span')).textContent = lib;
      return d;
    }));
    if ($('#bord-orbite')) {
      orbite($('#bord-orbite'), { part: reussite == null ? 0 : reussite / 100, valeur: reussite == null ? '—' : `${Math.round(reussite)} %`,
        libelle: 'réussies', noms: actifs.map((l) => l.t.nom), animer: derniersChiffres.get('orbite') !== m });
      derniersChiffres.set('orbite', m);
    }

    // À faire : chaque ligne mène à l'endroit où agir.
    const plaque = (x) => (Array.isArray(x.vehicules) ? x.vehicules[0] : x.vehicules) || {};
    const taches = [
      ...(conges.length ? [[`${conges.length} demande(s) de congés à valider`, () => switchOnglet('panel-conges'), '#7048e8']] : []),
      ...lignes.filter((l) => l.semainesATraiter).map((l) => [`${l.t.nom} : ${l.semainesATraiter} semaine(s) d'heures sup à traiter (${libelleMois(m)})`, () => { switchOnglet('panel-techniciens'); ouvrirFicheTechnicien(l.t); }, '#c77d00']),
      ...echeances.map((e) => [`${plaque(e).plaque} — ${e.type} ${e.date < dansJours(0) ? 'dépassée depuis le' : 'prévue le'} ${formaterDate(e.date)}`, () => { switchOnglet('panel-vehicules'); ouvrirVehicule(plaque(e)); }, '#1c7ed6']),
      ...amendes.filter((a) => limiteDesignation(a.date_avis) <= dansJours(7)).map((a) => [`${plaque(a).plaque} — amende n° ${a.numero_avis} : désigner le conducteur avant le ${formaterDate(limiteDesignation(a.date_avis))}`, () => { switchOnglet('panel-vehicules'); ouvrirVehicule(plaque(a)); }, '#e6001c']),
      ...aCloturer.map((p) => [`Mois de paie du ${formaterDate(p.debut)} au ${formaterDate(p.fin)} terminé : à valider et clôturer`, () => switchOnglet('panel-paie'), '#0c8a5f']),
    ];
    $('#bord-taches').replaceChildren(...(taches.length ? taches.map(([texte, aller, couleur]) => {
      const li = document.createElement('li');
      const b = li.appendChild(document.createElement('button'));
      b.type = 'button';
      const puce = b.appendChild(document.createElement('span'));
      puce.className = 'puce';
      puce.style.setProperty('--c', couleur);
      b.appendChild(document.createElement('span')).textContent = texte;
      b.appendChild(document.createElement('span')).className = 'ouvrir';
      b.lastChild.textContent = 'Ouvrir';
      b.addEventListener('click', aller);
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'vide', textContent: 'Rien à faire pour l\'instant.' })]));

    const animerBarres = derniersChiffres.get('barres') !== m;
    derniersChiffres.set('barres', m);
    $('#bord-types').replaceChildren(barres('Types de mission', repartition(duMois.map((e) => e.type_mission || '—')), animerBarres));
    $('#bord-resultats').replaceChildren(barres('Résultats', repartition(duMois.map((e) => libelleResultat(e.observation_type))), animerBarres));
    dessinerCourbe();

    $('#bord-techs tbody').replaceChildren(...lignes.map((l) => {
      const tr = ligne([l.t.nom, l.interventions, pc(l.nr), `${l.heures} h`, euros(l.frais), euros(l.primes)]);
      tr.cells[0].prepend(avatar(l.t.nom));
      tr.classList.add('ligne-cliquable');
      const fl = tr.appendChild(document.createElement('td'));
      fl.className = 'fleche';
      fl.setAttribute('aria-hidden', 'true');
      fl.textContent = '›';
      tr.addEventListener('click', () => { switchOnglet('panel-techniciens'); ouvrirFicheTechnicien(l.t); });
      return tr;
    }));
    if (!entreeFaite) {   // arrivée des cartes en cascade : une seule fois par ouverture de la page
      entreeFaite = true;
      entree([...$$('#panel-bord .bandeau, #panel-bord .tuile, #panel-bord .carte')]);
    }
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement du tableau de bord');
  }
}
const versHeuresNr = (e) => ({ date: e.date, typeMission: e.type_mission, observationType: e.observation_type });

function dessinerCourbe() {
  const zone = $('#bord-courbe');
  if (!zone || !activite) return;
  const n = Number($('#bord-periodes button.active')?.dataset.mois || 6);
  const etiquettes = activite.mois12.slice(-n).map((mm) => `${mm.slice(5)}/${mm.slice(2, 4)}`);
  const series = [{ nom: 'Interventions', valeurs: activite.parMois.slice(-n), classe: 'principale' }];
  const fig = zone.querySelector('figure.courbe');
  // Même nombre de mois (autre mois choisi, autre société) : le tracé se transforme (transition CSS sur « d »).
  if (fig && fig.querySelectorAll('text.etiquette').length === n) { majCourbe(fig, series, etiquettes); return; }
  // Sinon on redessine, à la largeur réelle de la carte : 1 unité = 1 pixel, textes à leur vraie taille.
  zone.replaceChildren(courbe({ titre: 'Interventions par mois', etiquettes, series, largeur: Math.round(zone.clientWidth) || 640 }));
}
$('#bord-periodes')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mois]');
  if (!b) return;
  $$('#bord-periodes button').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  dessinerCourbe();
});

// ===== Facturation : récap des quantités pour le donneur d'ordre (EPS...) =====
let recap = null;
$('#fact-form').addEventListener('submit', (e) => { e.preventDefault(); chargerFacturation(); });

async function chargerFacturation() {
  if (!$('#fact-debut').value) {   // par défaut : le mois civil en cours
    const m = new Date().toISOString().slice(0, 7);
    $('#fact-debut').value = m + '-01';
    $('#fact-fin').value = decaler(plusMois(m, 1) + '-01', -1);
  }
  const debut = $('#fact-debut').value, fin = $('#fact-fin').value;
  if (fin < debut) { alert('La date de fin est avant la date de début.'); return; }
  const lire = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
  try {
    const [temps, gestes] = await Promise.all([
      toutLire(sb.from('temps').select('type_mission, observation_type').eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin)),
      toutLire(sb.from('gestes_co').select('installes').eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin)),
    ]);
    recap = { debut, fin, ...recapFacturation(temps.map((e) => ({ typeMission: e.type_mission, observationType: e.observation_type })), gestes) };
    const total = recap.interventions.reduce((t, l) => ({ ok: t.ok + l.ok, nrClient: t.nrClient + l.nrClient, nrTechnique: t.nrTechnique + l.nrTechnique, nrAutres: t.nrAutres + l.nrAutres, total: t.total + l.total }),
      { ok: 0, nrClient: 0, nrTechnique: 0, nrAutres: 0, total: 0 });
    $('#fact-interventions tbody').replaceChildren(...[...recap.interventions, { type: 'TOTAL', ...total }]
      .map((l) => ligne([l.type, l.ok, l.nrClient, l.nrTechnique, l.nrAutres, l.total])));
    $('#fact-interventions tbody').lastChild.style.fontWeight = '700';
    $('#fact-equipements tbody').replaceChildren(...(recap.equipements.length
      ? recap.equipements.map((e) => ligne([e.type, e.qte])) : [ligne(['Aucun équipement installé sur la période', ''])]));
    $('#fact-resume').replaceChildren(
      tuileChiffre('Lignes d’intervention', recap.interventions.length, null, { ico: 'interventions', cle: 'fact-interventions' }),
      tuileChiffre('Lignes d’équipement', recap.equipements.length, null, { ico: 'interventions', cle: 'fact-equipements' }),
    );
    await chargerTarifs();
  } catch (err) {
    alert(err.message || 'Erreur lors du récapitulatif');
  }
}

// Grille de tarifs du client : lignes réutilisables, prix HT remplis plus tard.
let tarifs = [], facture = null;
const BASES = { ok: 'OK seulement', ok_nrclient: 'OK + NR client', total: 'Toutes' };

async function chargerTarifs() {
  const { data, error } = await sb.from('tarifs_facturation').select('id, categorie, code, libelle, base, prix_ht')
    .eq('societe_id', selectedSociete).eq('client', $('#fact-client').value.trim()).order('categorie').order('code');
  if (error) { alert(error.message); return; }
  tarifs = data;
  facture = montantsFacture(recap, tarifs);
  $('#fact-montants tbody').replaceChildren(...facture.lignes.map((l) => ligne([l.libelle, l.qte,
    l.prix_ht == null ? 'à renseigner' : euros(l.prix_ht), l.montant_ht == null ? '—' : euros(l.montant_ht)])));
  $('#fact-montants-info').textContent = `Total HT : ${euros(facture.totalHt)}` +
    (facture.sansPrix ? ` — ${facture.sansPrix} ligne(s) sans prix (à renseigner dans la grille de tarifs).` : '') +
    (lignesManquantes(recap, tarifs).length ? ' Des types de la période n\'ont pas encore de ligne de tarif.' : '');
  const modifiable = peutPayer();
  $('#tarifs-creer').classList.toggle('hidden', !modifiable);
  $('#tarifs-table tbody').replaceChildren(...tarifs.map((t) => {
    const tr = document.createElement('tr');
    const champ = (el) => { tr.appendChild(document.createElement('td')).appendChild(el); el.disabled = !modifiable; return el; };
    const lib = champ(Object.assign(document.createElement('input'), { value: t.libelle }));
    lib.setAttribute('aria-label', `Libellé ${t.code}`);
    tr.appendChild(document.createElement('td')).textContent = t.categorie === 'intervention' ? 'Intervention' : 'Équipement';
    tr.appendChild(document.createElement('td')).textContent = t.code;
    let base = null;
    if (t.categorie === 'intervention') {
      base = champ(document.createElement('select'));
      base.setAttribute('aria-label', `Base ${t.code}`);
      for (const [v, l] of Object.entries(BASES)) base.appendChild(Object.assign(document.createElement('option'), { value: v, textContent: l }));
      base.value = t.base;
    } else tr.appendChild(document.createElement('td')).textContent = '—';
    const prix = champ(Object.assign(document.createElement('input'), { type: 'number', min: '0', step: '0.01', value: t.prix_ht ?? '' }));
    if (t.prix_ht == null) prix.parentElement.classList.add('prix-vide');
    prix.setAttribute('aria-label', `Prix HT ${t.code}`);
    prix.placeholder = 'à renseigner';
    const td = tr.appendChild(document.createElement('td'));
    if (modifiable) {
      const b = td.appendChild(document.createElement('button'));
      b.textContent = 'Enregistrer';
      b.addEventListener('click', async () => {
        const { error: e } = await sb.from('tarifs_facturation').update({ libelle: lib.value.trim() || t.code,
          base: base ? base.value : 'ok', prix_ht: prix.value === '' ? null : Number(prix.value) }).eq('id', t.id);
        if (e) { alert(e.message); return; }
        await chargerTarifs();
      });
    } else td.textContent = '—';
    return tr;
  }));
}

$('#tarifs-creer').addEventListener('click', async () => {
  if (!recap) return;
  const nouvelles = lignesManquantes(recap, tarifs).map((t) => ({ ...t, societe_id: selectedSociete, client: $('#fact-client').value.trim() }));
  if (!nouvelles.length) { alert('Toutes les lignes existent déjà.'); return; }
  const { error } = await sb.from('tarifs_facturation').insert(nouvelles);
  if (error) { alert(error.message); return; }
  await chargerTarifs();
});

$('#fact-export').addEventListener('click', () => {
  if (!recap) return;
  const csv = `Client;${texteCsv($('#fact-client').value.trim())}\nPériode;${recap.debut};${recap.fin}\n\n` + versCsv(recap.interventions) + '\n' + versCsv(recap.equipements)
    + (facture?.lignes.length ? '\n' + versCsv(facture.lignes) + `Total HT;${String(facture.totalHt).replace('.', ',')}\n` : '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `facturation-${recap.debut}-au-${recap.fin}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ===== Interventions : toutes celles de la société sur une période (ancien tableau de bord : clôtures) =====
let listeInterventions = [];
const CRENEAUX = { MATIN: 'Matin', APREM: 'Après-midi' };
const nomTech = (id) => techniciens.find((t) => t.id === id)?.nom || '—';

function options(select, valeurs, tous) {
  const avant = select.value;
  select.replaceChildren(new Option(tous, ''), ...valeurs.map(([v, libelle]) => new Option(libelle, v)));
  select.value = valeurs.some(([v]) => v === avant) ? avant : '';
}

async function chargerInterventions() {
  if (!$('#int-debut').value) {   // par défaut : le mois en cours
    const m = iso(new Date()).slice(0, 7);
    $('#int-debut').value = m + '-01';
    $('#int-fin').value = decaler(plusMois(m, 1) + '-01', -1);
  }
  try {
    listeInterventions = await toutLire(sb.from('temps').select('id, technicien_id, date, slot_midi, type_mission, observation_type, ville, departement, numero_intervention, heure_debut, heure_fin')
      .eq('societe_id', selectedSociete).gte('date', $('#int-debut').value).lte('date', $('#int-fin').value).order('date', { ascending: false }));
    const distincts = (cle) => [...new Set(listeInterventions.map(cle))].sort().map((v) => [v, v]);
    options($('#int-tech'), techniciens.filter((t) => listeInterventions.some((e) => e.technicien_id === t.id)).map((t) => [t.id, t.nom]), 'Tous');
    options($('#int-type'), distincts((e) => e.type_mission || '—'), 'Tous');
    options($('#int-resultat'), [...new Set(listeInterventions.map((e) => e.observation_type || 'OK'))].sort().map((c) => [c, libelleResultat(c === 'OK' ? '' : c)]), 'Tous');
    afficherInterventions();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des interventions');
  }
}

const interventionsFiltrees = () => filtrer(listeInterventions, { tech: $('#int-tech').value, type: $('#int-type').value,
  resultat: $('#int-resultat').value, texte: $('#int-texte').value });

function afficherInterventions() {
  const l = interventionsFiltrees();
  const nr = l.filter((e) => /^NR/.test(e.observation_type)).length;
  const ok = l.filter((e) => !e.observation_type).length;
  const resume = $('#int-resume');
  resume.replaceChildren(
    tuileChiffre('Interventions', l.length, l.length > 300 ? '300 affichées, toutes dans l’export' : null, { ico: 'interventions', cle: 'int-total' }),
    tuileChiffre('OK', ok, null, { ico: 'interventions', cle: 'int-ok' }),
    tuileChiffre('NR', nr, null, { ico: 'nr', cle: 'int-nr' }));
  resume.className = 'tuiles';
  $('#int-table tbody').replaceChildren(...l.slice(0, 300).map((e) => {
    const tr = ligne([formaterDate(e.date), nomTech(e.technicien_id),
      CRENEAUX[e.slot_midi] || '—', e.type_mission || '—', e.ville || '—', e.departement || '—', e.numero_intervention || '—',
      '', e.heure_debut || '—', e.heure_fin || '—', texteDuree(dureeMinutes(e.heure_debut, e.heure_fin)) || '—']);
    const ton = !e.observation_type ? 'ok' : /^NR/.test(e.observation_type) ? 'danger' : 'neutre';
    tr.children[7].replaceChildren(pastille(libelleResultat(e.observation_type), ton));
    return tr;
  }));
}

$('#int-form').addEventListener('submit', (e) => { e.preventDefault(); chargerInterventions(); });
for (const id of ['#int-tech', '#int-type', '#int-resultat']) $(id).addEventListener('change', afficherInterventions);
$('#int-texte').addEventListener('input', afficherInterventions);
$('#int-export').addEventListener('click', () => {
  const l = interventionsFiltrees();
  if (!l.length) { alert('Aucune intervention à exporter.'); return; }
  telecharger(`interventions-${$('#int-debut').value}-au-${$('#int-fin').value}.csv`, versCsv(l.map((e) => ({
    Date: formaterDate(e.date), Technicien: nomTech(e.technicien_id), Créneau: CRENEAUX[e.slot_midi] || '', Type: e.type_mission,
    Ville: e.ville, Département: e.departement, 'N° intervention': e.numero_intervention, Résultat: libelleResultat(e.observation_type),
    Arrivée: e.heure_debut, Fin: e.heure_fin, Durée: texteDuree(dureeMinutes(e.heure_debut, e.heure_fin)) }))));
});

// ZIP de la période (ancien tableau de bord : makeZip) : photos copiées des techniciens actifs
// (ou du technicien choisi), rangées <technicien>/<AAAA-MM>/, plus le relevé des frais de chacun.
$('#int-zip').addEventListener('click', async () => {
  const debut = $('#int-debut').value, fin = $('#int-fin').value, choisi = $('#int-tech').value;
  const techs = techniciens.filter((t) => (choisi ? t.id === choisi : t.actif));
  const bouton = $('#int-zip');
  try {
    const [photos, frais] = await Promise.all([
      toutLire(sb.from('photos_apk').select('id, technicien_id, nom_drive, stockage').eq('societe_id', selectedSociete).not('stockage', 'is', null)),
      toutLire(sb.from('frais').select('id, technicien_id, date, categorie, montant_eur, sans_tva, fichier, statut, tva_recuperable')
        .eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin)),
    ]);
    const duMois = (p) => { const m = p.stockage.split('/').at(-2); return m >= debut.slice(0, 7) && m <= fin.slice(0, 7); };
    const choix = photos.filter((p) => techs.some((t) => t.id === p.technicien_id) && duMois(p));
    if (!choix.length && !frais.length) { alert('Aucune photo ni aucun frais sur la période.'); return; }
    if (!confirm(`Préparer un ZIP de ${choix.length} photo(s) et des relevés de frais ? Cela peut prendre un moment.`)) return;
    bouton.disabled = true;
    const fichiers = [], pris = new Set();
    for (let i = 0; i < choix.length; i += 100) {   // liens signés par paquets de 100, valables 10 minutes
      bouton.textContent = `Photos ${i}/${choix.length}…`;
      const paquet = choix.slice(i, i + 100);
      const { data, error } = await sb.storage.from('photos').createSignedUrls(paquet.map((p) => p.stockage), 600);
      if (error) throw error;
      for (const [k, p] of paquet.entries()) {
        const rep = await fetch(data[k].signedUrl);
        if (!rep.ok) throw new Error(`Photo ${p.nom_drive} : ${rep.status}`);
        const base = `${nomTech(p.technicien_id)}/${p.stockage.split('/').at(-2)}/${p.nom_drive}`;
        let nom = base;
        for (let n = 2; pris.has(nom); n++) nom = base.replace(/(\.[^./]+)?$/, `-${n}$1`);
        pris.add(nom);
        fichiers.push({ nom, donnees: new Uint8Array(await rep.arrayBuffer()) });
      }
    }
    const justifs = await justificatifsDe(frais);
    for (const t of techs) {
      const siens = frais.filter((f) => f.technicien_id === t.id).map(versCompta);
      if (siens.length) fichiers.push({ nom: `${t.nom}/releve-frais-${debut}-au-${fin}.csv`,
        donnees: new TextEncoder().encode('\uFEFF' + texteReleve(t, siens, justifs, debut, fin)) });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zipStocke(fichiers)], { type: 'application/zip' }));
    a.download = `photos-frais-${debut}-au-${fin}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(err.message || 'Erreur pendant la préparation du ZIP');
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Photos et frais (ZIP)';
  }
});

// ===== Messages : chat bureau ↔ technicien (côté technicien branché plus tard) =====
const nonLus = (id) => messages.filter((m) => m.technicien_id === id && m.de === 'technicien' && !m.lu_le).length;
const heureMessage = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Feuille `_gsystem_chat` -> objet message au même format que la base `messages`
// (l'id et la clé d'auteur de la feuille ne sont pas ceux de la base : on retrouve
// le technicien par son nom_apk, et on repère le bureau par son adresse de session).
function pontVersMessage(m) {
  const t = techniciens.find((x) => x.nom_apk === m.tech);
  return {
    id: m.id,
    technicien_id: t ? t.id : null,
    de: m.from === 'tech' ? 'technicien' : 'bureau',
    texte: m.text,
    cree_le: new Date(m.ts).toISOString(),
    lu_le: m.lu ? new Date(m.ts).toISOString() : null,
    auteur: m.from === 'bureau' ? (session?.user?.id || null) : null,
    ts: m.ts
  };
}

async function compterMessagesNonLus() {
  if (estSocietePont()) {
    const n = messages.filter((m) => m.de === 'technicien' && !m.lu_le).length;
    $('#onglet-messages').textContent = n ? `Messages (${n})` : 'Messages';
    return;
  }
  const { count, error } = await sb.from('messages').select('id', { count: 'exact', head: true })
    .eq('societe_id', selectedSociete).eq('de', 'technicien').is('lu_le', null);
  $('#onglet-messages').textContent = !error && count ? `Messages (${count})` : 'Messages';
}

async function chargerMessages() {
  try {
    if (estSocietePont()) {
      if (messages.some((m) => m.ts === undefined)) messages = [];   // messages d'une autre société (base) : on repart de zéro
      const depuis = messages.length ? Math.max(...messages.map((m) => Number(m.ts))) : 0;
      const res = await appelPont('chat_lire', { depuis });
      const recus = (res.messages || []).map(pontVersMessage);
      // dédup par id + de
      const deja = new Set(messages.map((m) => `${m.id}|${m.de}`));
      messages.push(...recus.filter((m) => !deja.has(`${m.id}|${m.de}`)));
      // Conversation ouverte : un message du technicien arrivé pendant qu'on la lit est lu aussitôt.
      if (chatTech && nonLus(chatTech.id) && !$('#chat-messages').classList.contains('hidden')) {
        const t = chatTech, jusqua = Math.max(...messages.filter((m) => m.technicien_id === t.id).map((m) => Number(m.id) || 0));
        appelPont('chat_lu', { technicien: t.nom_apk, jusqua }).catch((e) => console.error(e));
        messages.forEach((m) => { if (m.technicien_id === t.id && m.de === 'technicien') m.lu_le = new Date().toISOString(); });
        compterMessagesNonLus();
      }
    } else {
      messages = await toutLire(sb.from('messages').select('id, technicien_id, de, texte, auteur, cree_le, lu_le, modifie_le').eq('societe_id', selectedSociete).order('cree_le'));
    }
    afficherChat();
  } catch (err) {
    clearInterval(relanceChat);
    alert(err.message || 'Erreur lors du chargement des messages');
  }
}

function afficherChat() {
  $('#chat-alerte-apk').classList.toggle('hidden', estSocietePont());
  const avecMessages = new Set(messages.map((m) => m.technicien_id));
  $('#chat-liste').replaceChildren(...techniciens.filter((t) => t.actif || avecMessages.has(t.id)).map((t) => {
    const li = document.createElement('li');
    li.className = 'conversation';
    li.classList.toggle('active', chatTech?.id === t.id);
    li.appendChild(avatar(t.nom));
    const b = li.appendChild(document.createElement('button'));
    b.type = 'button';
    b.className = 'secondary';
    b.setAttribute('aria-current', String(chatTech?.id === t.id));
    const n = nonLus(t.id);
    b.append(t.nom, Object.assign(document.createElement('span'), { textContent: n ? `${n} non lu(s)` : '' }));
    marquer(b, n > 0);
    b.addEventListener('click', () => ouvrirConversation(t));
    return li;
  }));
  const coches = new Set([...$$('#chat-destinataires input:checked')].map((c) => c.value));
  $('#chat-destinataires').replaceChildren(Object.assign(document.createElement('legend'), { textContent: 'Destinataires' }),
    ...techniciens.filter((t) => t.actif).map((t) => {
      const l = document.createElement('label');
      const c = l.appendChild(document.createElement('input'));
      c.type = 'checkbox';
      c.value = t.id;
      c.checked = coches.has(t.id);   // la relance toutes les 30 s ne décoche rien
      c.setAttribute('aria-label', `Écrire à ${t.nom}`);
      l.append(t.nom);
      return l;
    }));
  if (chatTech) afficherFil();
  compterMessagesNonLus();
}

function afficherFil() {
  const zone = $('#chat-messages');
  const enBas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 40;
  const fil = messages.filter((m) => m.technicien_id === chatTech.id);
  zone.replaceChildren(...(fil.length ? fil.map((m) => {
    const d = document.createElement('div');
    d.className = `bulle ${m.de}`;
    d.textContent = m.texte;
    d.appendChild(document.createElement('small')).textContent = `${m.de === 'bureau' ? 'Bureau' : chatTech.nom} — ${heureMessage(m.cree_le)}`
      + (m.modifie_le ? ' — modifié' : '') + (m.de === 'bureau' && m.lu_le ? ' — lu' : '');
    if (m.de === 'bureau' && !estSocietePont() && (m.auteur === session.user.id || superAdmin)) {   // la base vérifie de toute façon ; via le pont, seul le bureau écrit (via chat_ecrire)
      const actions = d.appendChild(document.createElement('div'));
      actions.className = 'bulle-actions';
      const bouton = (texte, action) => Object.assign(actions.appendChild(document.createElement('button')),
        { type: 'button', className: 'secondary', textContent: texte, onclick: action });
      bouton('Modifier', () => modifierMessage(m));
      if (!m.lu_le) bouton('Supprimer', () => supprimerMessage(m));
    }
    return d;
  }) : [Object.assign(document.createElement('p'), { textContent: 'Aucun message pour l’instant.' })]));
  if (enBas) zone.scrollTop = zone.scrollHeight;
}

async function ouvrirConversation(t) {
  chatTech = t;
  $('#chat-titre').textContent = t.nom;
  $('#chat-messages').classList.remove('hidden');
  $('#chat-form').classList.remove('hidden');
  afficherChat();
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  if (estSocietePont() && nonLus(t.id)) {   // même règle via le pont : la feuille de chat garde « lu par le bureau »
    const jusqua = Math.max(...messages.filter((m) => m.technicien_id === t.id).map((m) => Number(m.id) || 0));
    try {
      await appelPont('chat_lu', { technicien: t.nom_apk, jusqua });
      messages.forEach((m) => { if (m.technicien_id === t.id && m.de === 'technicien') m.lu_le = new Date().toISOString(); });
      afficherChat(); compterMessagesNonLus();
    } catch (err) { console.error(err); }
  }
  if (!estSocietePont() && nonLus(t.id)) {   // conversation ouverte = messages du technicien lus par le bureau
    const { error } = await sb.from('messages').update({ lu_le: new Date().toISOString() })
      .eq('technicien_id', t.id).eq('de', 'technicien').is('lu_le', null);
    if (!error) await chargerMessages();
  }
}

async function modifierMessage(m) {
  const texte = (prompt('Corriger le message :', m.texte) || '').trim();
  if (!texte || texte === m.texte) return;
  const { data, error } = await sb.from('messages').update({ texte }).eq('id', m.id).select('id');
  if (error || !data.length) { alert(error?.message || 'Modification refusée.'); return; }
  await chargerMessages();
}

// Effaçable tant que le destinataire ne l'a pas lu (la base refuse sinon).
async function supprimerMessage(m) {
  if (!confirm('Supprimer ce message ? Il ne sera pas récupérable.')) return;
  const { data, error } = await sb.from('messages').delete().eq('id', m.id).select('id');
  if (error) { alert(error.message); return; }
  if (!data.length) alert('Trop tard : le message a déjà été lu.');
  await chargerMessages();
}

async function envoyerMessages(ids, texte) {
  if (estSocietePont()) {
    // La feuille garde le nom de l'APK du technicien (techniciens[].nom_apk).
    try {
      for (const id of ids) {
        const t = techniciens.find((x) => x.id === id);
        await appelPont('chat_ecrire', { technicien: t ? t.nom_apk : '', texte });
      }
    } catch (err) {
      alert(err.message || 'Envoi impossible par le pont');
      return false;
    }
    await chargerMessages();
    return true;
  }
  const { error } = await sb.from('messages').insert(ids.map((technicien_id) => ({ societe_id: selectedSociete, technicien_id, de: 'bureau', texte })));
  if (error) { alert(error.message); return false; }
  await chargerMessages();
  return true;
}

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bouton = $('#chat-form button[type="submit"]');
  if (bouton.disabled) return;   // l'envoi par le pont prend quelques secondes : un 2e appui n'envoie pas deux fois
  const texte = $('#chat-texte').value.trim();
  if (!texte || !chatTech) return;
  const libelle = bouton.textContent;
  bouton.disabled = true; bouton.textContent = 'Envoi…';
  $('#chat-texte').value = '';
  try {
    if (await envoyerMessages([chatTech.id], texte)) $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
    else $('#chat-texte').value = texte;   // échec : le texte revient pour réessayer
  } finally { bouton.disabled = false; bouton.textContent = libelle; }
});

$('#chat-diffusion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ids = [...$$('#chat-destinataires input:checked')].map((c) => c.value);
  const texte = $('#chat-diffusion-texte').value.trim();
  if (!ids.length) { alert('Cochez au moins un technicien.'); return; }
  const bouton = $('#chat-diffusion button[type="submit"]');
  if (!texte || bouton.disabled) return;
  bouton.disabled = true;
  try { if (await envoyerMessages(ids, texte)) $('#chat-diffusion').reset(); } finally { bouton.disabled = false; }
});

// ===== Compta : extrait des notes de frais par technicien (core/compta.js) =====
let compta = null;   // { params, frais, exportes, justifs, debut, fin }
const versParams = (p) => p ? { journal: p.journal, journalLib: p.journal_lib, compteTva: p.compte_tva, compteSalarie: p.compte_salarie, comptes: p.comptes } : PARAMS_DEFAUT;
const nomFichier = (t) => t.nom.normalize('NFD').replace(/[^\w-]+/g, '-');
const deuxDecimales = (n) => n.toFixed(2).replace('.', ',');
const jourParis = (horodatage) => new Date(horodatage).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });   // AAAA-MM-JJ

// Le relevé s'ouvre dans Excel (BOM UTF-8) ; les écritures vont au logiciel comptable (sans BOM).
function telecharger(nom, texte, bom = true) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([(bom ? '﻿' : '') + texte], { type: 'text/csv;charset=utf-8' }));
  a.download = nom;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function justificatifsDe(frais) {
  const noms = [...new Set(frais.map((f) => f.fichier).filter(Boolean))];
  if (!noms.length) return new Set();
  const { data, error } = await sb.from('photos_apk').select('nom_local').eq('societe_id', selectedSociete).in('nom_local', noms).not('stockage', 'is', null);
  if (error) throw error;
  return new Set(data.map((p) => p.nom_local));
}

async function chargerCompta() {
  if (!$('#compta-debut').value) {   // par défaut : le mois précédent
    const m = plusMois(iso(new Date()).slice(0, 7), -1);
    $('#compta-debut').value = m + '-01';
    $('#compta-fin').value = decaler(plusMois(m, 1) + '-01', -1);
  }
  const debut = $('#compta-debut').value, fin = $('#compta-fin').value;
  try {
    const lire = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
    const [params, frais, exports] = await Promise.all([
      lire(sb.from('parametres_compta').select('*').eq('societe_id', selectedSociete).maybeSingle()),
      toutLire(sb.from('frais').select('id, technicien_id, date, categorie, montant_eur, sans_tva, fichier, statut, tva_recuperable, motif_refus').eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin).order('date')),
      lire(sb.from('exports_compta').select('id, technicien_id, debut, fin, frais_ids, parametres, le').eq('societe_id', selectedSociete).order('le', { ascending: false })),
    ]);
    compta = { params, frais, exports, exportes: new Set(exports.flatMap((e) => e.frais_ids)), justifs: await justificatifsDe(frais), debut, fin };
    afficherCompta();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement de la comptabilité');
  }
}

function afficherCompta() {
  const { params, frais, exportes } = compta, p = versParams(params);
  $('#compta-params-etat').textContent = !params ? 'Comptes proposés par défaut, pas encore validés par le comptable : export bloqué.'
    : params.valide_le ? `Comptes validés par le comptable le ${formaterDate(jourParis(params.valide_le))}.`
    : 'Comptes non validés par le comptable : export bloqué.';
  $('#compta-params-etat').classList.toggle('alerte-proche', !params?.valide_le);
  for (const [id, v] of [['#cp-journal', p.journal], ['#cp-journal-lib', p.journalLib], ['#cp-tva', p.compteTva], ['#cp-salarie', p.compteSalarie],
    ['#cp-parking', p.comptes.PARKING], ['#cp-divers', p.comptes.DIVERS], ['#cp-mobile', p.comptes.MOBILE]]) {
    $(id).value = v || '';
    $(id).disabled = !peutCompta();
  }
  $$('#compta-params-form button').forEach((b) => b.classList.toggle('hidden', !peutCompta()));

  const avecFrais = new Set(frais.map((f) => f.technicien_id));
  $('#compta-table tbody').replaceChildren(...techniciens.filter((t) => t.actif || avecFrais.has(t.id)).map((t) => {
    const siens = frais.filter((f) => f.technicien_id === t.id);
    const n = (statut) => siens.filter((f) => f.statut === statut).length;
    const aExporter = siens.filter((f) => f.statut === 'valide' && !exportes.has(f.id));
    const total = aExporter.reduce((x, f) => x + releve(t, [versCompta(f)], compta.justifs).total.rembourse, 0);
    const tr = ligne([t.nom]);
    tr.children[0].prepend(avatar(t.nom));
    const aux = tr.appendChild(document.createElement('td')).appendChild(document.createElement('input'));
    aux.value = t.compte_auxiliaire || '';
    aux.maxLength = 20;
    aux.disabled = !peutEcrire();
    aux.setAttribute('aria-label', `Compte auxiliaire de ${t.nom}`);
    aux.addEventListener('change', async () => {
      const { error } = await sb.from('techniciens').update({ compte_auxiliaire: aux.value.trim() }).eq('id', t.id);
      if (error) { aux.value = t.compte_auxiliaire || ''; alert(error.message); } else t.compte_auxiliaire = aux.value.trim();
    });
    for (const v of [n('valide'), n('a_traiter'), n('refuse'), `${aExporter.length} (${euros(total)})`, siens.filter((f) => exportes.has(f.id)).length]) {
      tr.appendChild(document.createElement('td')).textContent = v;
    }
    if (n('a_traiter')) {
      tr.children[3].className = 'alerte-proche';
      tr.children[3].replaceChildren(pastille(String(n('a_traiter')), 'alerte'));
    }
    const actions = tr.appendChild(document.createElement('td'));
    const bouton = (texte, action) => { const b = actions.appendChild(document.createElement('button')); b.type = 'button';
      b.className = 'secondary voir'; b.textContent = texte; b.addEventListener('click', action); return b; };
    bouton('Relevé', () => telechargerReleve(t, siens, compta.debut, compta.fin));
    if (peutEcrire() || peutCompta()) {
      const b = bouton('Exporter', () => exporterCompta(t, aExporter.length));
      b.disabled = !aExporter.length || n('a_traiter') > 0 || !params?.valide_le;
      b.title = n('a_traiter') ? 'Des frais restent à valider (fiche technicien, onglet Frais)' : !params?.valide_le ? 'Comptes à faire valider par le comptable' : '';
    }
    return tr;
  }));

  $('#compta-exports tbody').replaceChildren(...compta.exports.map((e) => {
    const t = techniciens.find((x) => x.id === e.technicien_id) || { nom: '—' };
    const tr = ligne([formaterDate(jourParis(e.le)), t.nom, `${formaterDate(e.debut)} → ${formaterDate(e.fin)}`, String(e.frais_ids.length), '…']);
    const td = tr.appendChild(document.createElement('td'));
    for (const [texte, fichier] of [['Écritures', 'ecritures'], ['Relevé', 'releve']]) {
      const b = td.appendChild(document.createElement('button'));
      b.type = 'button'; b.className = 'secondary voir'; b.textContent = texte;
      b.addEventListener('click', () => telechargerExport(e, fichier));
    }
    fraisDeLExport(e).then((liste) => { tr.children[4].textContent = euros(releve(t, liste, new Set()).total.rembourse); }).catch(() => {});
    return tr;
  }));
}

const ENTETES_RELEVE = { technicien: 'Technicien', date: 'Date', categorie: 'Catégorie', ttc: 'TTC', ht: 'HT', tva: 'TVA', rembourse: 'Remboursé',
  tvaRecuperee: 'TVA récupérée', charge: 'Charge', sansTva: 'Sans TVA', justificatif: 'Justificatif', controles: 'Contrôles' };

function texteReleve(t, liste, justifs, debut, fin) {
  const r = releve(t, liste, justifs);
  const enClair = r.lignes.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) =>
    [ENTETES_RELEVE[k], typeof v === 'number' ? deuxDecimales(v) : v])));
  const soc = societes.find((x) => x.id === selectedSociete) || {};
  return `Société;${texteCsv(soc.nom)};${texteCsv((soc.adresse || '').replace(/\s*\n\s*/g, ', '))};SIRET ${soc.siret || 'non renseigné'}\nTechnicien;${texteCsv(t.nom)}\nPériode;${formaterDate(debut)};${formaterDate(fin)}\n\n` + versCsv(enClair)
    + `Total;;;${deuxDecimales(r.total.ttc)};;;${deuxDecimales(r.total.rembourse)};${deuxDecimales(r.total.tvaRecuperee)};${deuxDecimales(r.total.charge)}\n`;
}

function telechargerReleve(t, siens, debut, fin) {
  if (!siens.length) { alert('Aucun frais sur cette période.'); return; }
  telecharger(`releve-frais-${nomFichier(t)}-${debut}-au-${fin}.csv`, texteReleve(t, siens.map(versCompta), compta.justifs, debut, fin));
}

async function fraisDeLExport(e) {
  const { data, error } = await sb.from('frais').select('id, date, categorie, montant_eur, sans_tva, fichier, statut, tva_recuperable').in('id', e.frais_ids).order('date');
  if (error) throw error;
  return data.map(versCompta);
}

// Fichiers d'un export : refaits à l'identique (mêmes frais figés, comptes du jour de l'export).
async function telechargerExport(e, quoi) {
  try {
    const t = techniciens.find((x) => x.id === e.technicien_id);
    const liste = await fraisDeLExport(e);
    const base = `${nomFichier(t)}-${e.debut}-au-${e.fin}.csv`;
    if (quoi === 'releve') { telecharger(`releve-frais-${base}`, texteReleve(t, liste, await justificatifsDe(liste), e.debut, e.fin)); return; }
    const lignes = ecritures({ tech: { nom: t.nom, compteAuxiliaire: t.compte_auxiliaire }, frais: liste, params: versParams(e.parametres), valideLe: jourParis(e.le) });
    telecharger(`ecritures-${base}`, versCsvFec(lignes), false);
  } catch (err) {
    alert(err.message);
  }
}

async function exporterCompta(t, n) {
  const { debut, fin } = compta;
  const sansCompte = t.compte_auxiliaire ? '' : '\n\nAttention : pas de compte auxiliaire pour ce technicien (colonne vide dans les écritures).';
  if (!confirm(`Exporter ${n} frais validé(s) de ${t.nom} du ${formaterDate(debut)} au ${formaterDate(fin)} ? Ils ne pourront plus être modifiés.${sansCompte}`)) return;
  const { data, error } = await sb.rpc('exporter_compta', { s: selectedSociete, tech: t.id, du: debut, au: fin });
  if (error) { alert(error.message); return; }
  await chargerCompta();
  const e = compta.exports.find((x) => x.id === data[0].export_id);
  if (e) { await telechargerExport(e, 'ecritures'); await telechargerExport(e, 'releve'); }
}

$('#compta-form').addEventListener('submit', (e) => { e.preventDefault(); chargerCompta(); });

async function enregistrerParams() {
  const v = (id) => $(id).value.trim();
  const { error } = await sb.from('parametres_compta').upsert({ societe_id: selectedSociete, journal: v('#cp-journal'), journal_lib: v('#cp-journal-lib'),
    compte_tva: v('#cp-tva'), compte_salarie: v('#cp-salarie'), comptes: { PARKING: v('#cp-parking'), DIVERS: v('#cp-divers'), MOBILE: v('#cp-mobile') } });
  if (error) throw error;
}

$('#compta-params-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await enregistrerParams(); await chargerCompta(); } catch (err) { alert(err.message); }
});

$('#cp-valider').addEventListener('click', async () => {
  if (!$('#compta-params-form').reportValidity()) return;
  if (!confirm('Valider ces comptes en tant que comptable ? Les exports utiliseront ces comptes.')) return;
  try {
    await enregistrerParams();
    const { error } = await sb.from('parametres_compta').update({ valide_le: new Date().toISOString() }).eq('societe_id', selectedSociete);
    if (error) throw error;
    await chargerCompta();
  } catch (err) { alert(err.message); }
});

// ===== Identité de la société : nom, adresse, logo (admin) =====
let logoChoisi;   // undefined : inchangé ; null : retiré ; texte : nouvelle image

function remplirIdentite(s) {
  logoChoisi = undefined;
  $('#identite-form').reset();
  $('#id-nom').value = s?.nom || '';
  $('#id-adresse').value = s?.adresse || '';
  $('#id-siret').value = s?.siret || '';
  apercuLogo(s?.logo);
}

function apercuLogo(logo) {
  $('#id-logo-plaque').classList.toggle('hidden', !logo);
  if (logo) $('#id-logo-apercu').src = logo;
}

// Réduit l'image (480 × 160 au plus) et la garde en PNG : petite, et la transparence reste.
async function reduireLogo(fichier) {
  const img = await createImageBitmap(fichier);
  const r = Math.min(1, 480 / img.width, 160 / img.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * r));
  c.height = Math.max(1, Math.round(img.height * r));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

$('#id-logo').addEventListener('change', async () => {
  const f = $('#id-logo').files[0];
  if (!f) return;
  try {
    // Déjà assez léger : gardé tel quel (un WebP animé reste animé) ; sinon réduit en PNG fixe.
    logoChoisi = f.size <= 220000 ? await new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = ko;
      r.readAsDataURL(f);
    }) : await reduireLogo(f);
    if (logoChoisi.length > 300000) { logoChoisi = undefined; alert('Logo trop détaillé : essayez une image plus simple.'); return; }
    apercuLogo(logoChoisi);
  } catch {
    alert("Image illisible : choisissez un fichier PNG, JPEG ou WebP.");
  }
});

$('#id-logo-retirer').addEventListener('click', () => { logoChoisi = null; $('#id-logo').value = ''; apercuLogo(null); });

$('#identite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const siret = $('#id-siret').value.replace(/\s/g, '');
  if (siret && !/^\d{14}$/.test(siret)) { alert('Le SIRET compte 14 chiffres.'); return; }
  const champs = { nom: $('#id-nom').value.trim(), adresse: $('#id-adresse').value.trim(), siret: siret || null };
  if (logoChoisi !== undefined) champs.logo = logoChoisi;
  const { data, error } = await sb.from('societes').update(champs).eq('id', selectedSociete).select('id, nom, adresse, siret, logo');
  if (error) { alert(error.message); return; }
  if (!data.length) { alert("Modification refusée : réservée à l'admin de la société."); return; }
  Object.assign(societes.find((x) => x.id === selectedSociete), data[0]);
  remplirIdentite(data[0]);
  $('#societe-detail-title').textContent = data[0].nom;
  mettreAJourFil();
  $('#identite').open = false;
});

// État d'un frais : la base signe, exige un motif de refus et fige un frais exporté.
async function changerFrais(f, champs) {
  if (champs.statut === 'refuse') {
    const motif = (prompt('Motif du refus (visible du comptable) :') || '').trim();
    if (!motif) { afficherMoisFiche(); return; }
    champs.motif_refus = motif;
  }
  const { data, error } = await sb.from('frais').update(champs).eq('id', f.id).select('statut, tva_recuperable, motif_refus').single();
  if (error) alert(error.message);
  else Object.assign(f, data);
  afficherMoisFiche();
}

// Case « Validées » : la base signe avec l'utilisateur connecté et refuse après export de la paie.
async function validerHeuresSup(s, choix) {
  const [annee, n] = s.semaine.split('-W').map(Number);
  const j4 = Date.UTC(annee, 0, 4);
  const lundi = new Date(j4 - ((new Date(j4).getUTCDay() + 6) % 7) * 86400000 + (n - 1) * 7 * 86400000).toISOString().slice(0, 10);
  const { error } = await sb.from('heures_sup').upsert({ societe_id: selectedSociete, technicien_id: fiche.t.id,
    semaine: s.semaine, date: lundi, sup1: s.sup1, sup2: s.sup2, valide: choix.value === 'validee', refusee: choix.value === 'refusee' },
  { onConflict: 'societe_id,technicien_id,semaine' });
  if (error) { choix.value = fiche.validations.get(s.semaine) || 'a_traiter'; alert(error.message); return; }
  fiche.validations.set(s.semaine, choix.value);
  pointHeures();
}

// Formulaire Affectation
$('#affectation-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire() || !vehiculeActif) return;
  const technicien_id = $('#aff-tech').value;
  const debut = $('#aff-debut').value;
  if (!technicien_id || !debut) return;
  try {
    const { error } = await sb.from('affectations').insert({ societe_id: selectedSociete, vehicule_id: vehiculeActif.id, technicien_id, debut });
    if (error) throw error;
    $('#affectation-form').reset();
    await loadAffectations(vehiculeActif.id);
    await loadVehicules(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Formulaire Relevé km
$('#releve-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire() || !vehiculeActif) return;
  const date = $('#rel-date').value;
  const km = $('#rel-km').value;
  if (!date || !km) return;
  try {
    const { error } = await sb.from('releves_km').insert({ societe_id: selectedSociete, vehicule_id: vehiculeActif.id, date, km: Number(km), source: 'saisie' });
    if (error) throw error;
    $('#releve-form').reset();
    await loadRelevesAndKm(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Formulaire Échéance
$('#echeance-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire() || !vehiculeActif) return;
  const type = $('#ech-type').value;
  const date = $('#ech-date').value;
  const km = $('#ech-km').value;
  if (!date && !km) {
    alert('Indiquez une date ou un kilométrage.');
    return;
  }
  try {
    const { error } = await sb.from('echeances').insert({ societe_id: selectedSociete, vehicule_id: vehiculeActif.id, type, date: date || null, km: km ? Number(km) : null });
    if (error) throw error;
    $('#echeance-form').reset();
    await loadEcheances(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Formulaire Entretien
$('#entretien-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire() || !vehiculeActif) return;
  const date = $('#ent-date').value;
  // Un passage au garage = une ligne par type coché (révision + filtres le même jour…).
  const types = [...document.querySelectorAll('input[name="ent-type"]:checked')].map((c) => c.value);
  const km = $('#ent-km').value;
  const garage = $('#ent-garage').value;
  const cout = $('#ent-cout').value;
  if (!date) return;
  if (!types.length) { alert('Cochez au moins un entretien fait.'); return; }
  try {
    // Le coût est la facture du passage : posé une seule fois, sur la 1re ligne.
    const { error } = await sb.from('entretiens').insert(types.map((type, i) => ({
      societe_id: selectedSociete,
      vehicule_id: vehiculeActif.id,
      date,
      type,
      km: km ? Number(km) : null,
      garage,
      cout: cout && i === 0 ? Number(cout.replace(',', '.')) : null
    })));
    if (error) throw error;
    $('#entretien-form').reset();
    await loadEntretiens(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Formulaire Amende
$('#amende-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire() || !vehiculeActif) return;
  const numeroAvis = $('#amende-numero').value.trim();
  const dateAvis = $('#amende-date-avis').value;
  const dateInfraction = $('#amende-date-infraction').value;
  const heureInfraction = $('#amende-heure').value;
  const lieu = $('#amende-lieu').value.trim();
  const motif = $('#amende-motif').value.trim();
  const montantInput = $('#amende-montant').value.replace(',', '.');
  const montant = montantInput ? Number(montantInput) : null;
  const technicienId = $('#amende-conducteur').value || null;
  const fichier = $('#amende-scan').files[0];
  if (!numeroAvis || !dateAvis) { alert('Numéro d\'avis et date de l\'avis requis.'); return; }
  if (fichier && !extensionScan(fichier)) { alert('Scan accepté : photo JPEG ou PNG, ou PDF.'); return; }
  try {
    // L'amende d'abord (la base refuse tout scan qui n'est pas celui d'une amende existante).
    const { data: cree, error } = await sb.from('amendes').insert({
      societe_id: selectedSociete,
      vehicule_id: vehiculeActif.id,
      numero_avis: numeroAvis,
      date_avis: dateAvis,
      date_infraction: dateInfraction || null,
      heure_infraction: heureInfraction || '',
      lieu: lieu || '',
      motif: motif || '',
      montant: montant,
      technicien_id: technicienId
    }).select('id').single();
    if (error) throw error;
    $('#amende-form').reset();
    if (fichier) await envoyerScan(cree.id, fichier);
    await loadAmendes(vehiculeActif.id);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout d\'amende');
  }
});

const extensionScan = (f) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' })[f.type];

// Scan d'une amende DÉJÀ enregistrée : <société>/amendes/<id de l'amende>.<ext>
async function envoyerScan(amendeId, fichier) {
  const chemin = `${selectedSociete}/amendes/${amendeId}.${extensionScan(fichier)}`;
  const { error } = await sb.storage.from('scans').upload(chemin, fichier, { contentType: fichier.type });
  if (error) { alert(`Amende enregistrée, mais le scan n'a pas été envoyé : ${error.message}. Utilisez « Ajouter le scan ».`); return; }
  const { error: e2 } = await sb.from('amendes').update({ scan: chemin }).eq('id', amendeId);
  if (e2) alert(e2.message);
}

// Mise à jour du conducteur suggéré selon la date d'infraction
$('#amende-date-infraction').addEventListener('change', async () => {
  if (!vehiculeActif) return;
  const date = $('#amende-date-infraction').value;
  if (!date) return;
  const { data: affs, error } = await sb.from('affectations')
    .select('technicien_id, debut, fin')
    .eq('vehicule_id', vehiculeActif.id)
    .eq('societe_id', selectedSociete);
  if (error) { alert(error.message); return; }
  const techId = conducteurA(affs, date);
  if (techId) {
    $('#amende-conducteur').value = techId;
  }
});

// Remplir select techniciens actifs pour affectation
function renderTechniciensActifs() {
  const actifs = techniciens.filter(t => t.actif);
  for (const id of ['#aff-tech', '#conge-tech']) {   // affectation et demande de congés
    $(id).replaceChildren(...actifs.map(t => {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.nom;
      return o;
    }));
  }
}

function renderTechniciensAmende() {
  const select = $('#amende-conducteur');
  select.replaceChildren();
  const vide = document.createElement('option');
  vide.value = '';
  vide.textContent = '—';
  select.appendChild(vide);
  for (const t of techniciens) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.nom;
    select.appendChild(o);
  }
}

// Aperçu des photos de compteur au survol (non tactile)
let apercu = null, apercuJeton = 0;
// Bulle d'aperçu de la photo du compteur : photo entière (km lisible en bas), une seule à la fois.
async function montrerApercu(ev, stockage) {
  if (ev.pointerType === 'touch' || !matchMedia('(hover: hover)').matches) return;   // rien au toucher
  cacherApercu();
  const jeton = ++apercuJeton;
  const bouton = ev.currentTarget;
  const { data, error } = await sb.storage.from('photos').createSignedUrl(stockage, 600);
  // La souris est partie pendant le chargement, ou un autre aperçu a été demandé : on n'affiche rien.
  if (error || jeton !== apercuJeton || !bouton.matches(':hover')) return;
  const el = document.body.appendChild(document.createElement('div'));
  el.className = 'apercu-compteur';
  const img = el.appendChild(document.createElement('img'));
  img.alt = 'Aperçu de la photo du compteur';
  img.src = data.signedUrl;
  const r = bouton.getBoundingClientRect();
  el.style.right = `${Math.max(8, window.innerWidth - r.left + 12)}px`;   // à gauche du bouton
  el.style.top = `${Math.max(8, Math.min(r.top - 120, window.innerHeight - 420))}px`;
  apercu = { el };
}

function cacherApercu() {
  apercuJeton++;
  document.querySelectorAll('.apercu-compteur').forEach((e) => e.remove());
  apercu = null;
}

// --- SIGNALEMENTS ---

let capturePourSignalement = [];

function obtenirEcranCourant() {
  for (const tab of $$('.tab')) {
    if (tab.classList.contains('active')) {
      const libelle = tab.textContent.trim();
      return libelle || 'Inconnu';
    }
  }
  return 'Accueil';
}

function obtenirVersion() {
  return '1.0.0'; // À adapter à la vraie version
}

function ouvrirDialogSignaler() {
  $('#signaler-ecran').value = obtenirEcranCourant();
  $('#signaler-version').value = obtenirVersion();
  capturePourSignalement = [];
  afficherCapturesPourSignalement();
  $('#dialog-signaler').classList.add('show');
  $('#signaler-explication').focus();
}

function fermerDialogSignaler() {
  $('#dialog-signaler').classList.remove('show');
  $('#signaler-gravite').value = '';
  $('#signaler-explication').value = '';
  capturePourSignalement = [];
}

function afficherCapturesPourSignalement() {
  const liste = $('#captures-liste');
  liste.innerHTML = '';
  for (let i = 0; i < capturePourSignalement.length; i++) {
    const item = document.createElement('div');
    item.className = 'capture-item';
    const nom = document.createElement('span');
    nom.textContent = `Capture ${i + 1}`;
    item.appendChild(nom);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'capture-supprimer';
    btn.textContent = '×';
    btn.onclick = () => {
      capturePourSignalement.splice(i, 1);
      afficherCapturesPourSignalement();
    };
    item.appendChild(btn);
    liste.appendChild(item);
  }
}

function ajouterCaptureSignalement() {
  if (capturePourSignalement.length >= 5) {
    alert('Maximum 5 captures');
    return;
  }
  $('#signaler-captures-input').click();
}

$('#signaler-captures-input').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    if (capturePourSignalement.length >= 5) break;
    const data = await file.arrayBuffer();
    capturePourSignalement.push({ nom: file.name, donnees: new Uint8Array(data) });
  }
  afficherCapturesPourSignalement();
});

async function envoyerSignalement() {
  const gravite = $('#signaler-gravite').value;
  const explication = $('#signaler-explication').value.trim();
  if (!gravite) { alert('Choisir une gravité'); return; }
  if (!explication) { alert('Écrire une explication'); return; }

  $('#signaler-envoyer').disabled = true;
  try {
    // Créer le signalement
    const { data: sig, error: err1 } = await sb.from('signalements').insert({
      societe_id: selectedSociete || null,
      ecran: $('#signaler-ecran').value,
      version: $('#signaler-version').value,
      gravite,
      explication,
    }).select().single();
    if (err1) throw err1;

    // Uploader les captures
    for (const capture of capturePourSignalement) {
      const chemin = `${sig.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: err2 } = await sb.storage.from('signalements').upload(chemin, capture.donnees, {
        contentType: 'image/jpeg',
        cacheControl: '0',
      });
      if (err2) console.error('Erreur upload capture:', err2);
      else {
        await sb.from('signalements_captures').insert({ signalement_id: sig.id, chemin });
      }
    }

    alert('Signalement envoyé avec succès', 'success');
    fermerDialogSignaler();
  } catch (err) {
    alert('Erreur : ' + (err?.message || 'inconnue'), 'error');
  } finally {
    $('#signaler-envoyer').disabled = false;
  }
}

// Tri automatique des signalements : proposition de lots par écran, triés par gravité.
function afficherPropositionTri(data) {
  const lots = proposerLots(regrouper(data));
  if (lots.length === 0) return;
  const conteneur = $('#signalements-liste');
  const section = document.createElement('div');
  section.className = 'signalements-tri';
  const titre = document.createElement('h3');
  titre.textContent = 'Proposition de tri';
  section.appendChild(titre);
  for (const lot of lots) {
    const bloc = document.createElement('div');
    bloc.className = 'signalement-tri-lot';
    const libelle = document.createElement('h4');
    const nSignalements = lot.groupes.reduce((n, g) => n + g.nombre, 0);
    libelle.textContent = `${lot.ecran} — ${lot.gravité.replace('_', ' ')} (${nSignalements} signalement${nSignalements > 1 ? 's' : ''})`;
    bloc.appendChild(libelle);
    for (const g of lot.groupes) {
      const ligne = document.createElement('div');
      ligne.className = 'signalement-tri-groupe';
      const texte = document.createElement('span');
      const explication = g.exemple.explication;
      texte.textContent = `${g.nombre} signalement${g.nombre > 1 ? 's' : ''} : ${explication.substring(0, 60)}${explication.length > 60 ? '…' : ''}`;
      ligne.appendChild(texte);
      if (g.nombre < 2) { bloc.appendChild(ligne); continue; }   // rien à fusionner
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = 'Marquer les autres comme doublons';
      bouton.addEventListener('click', async () => {
        const autres = g.ids.filter((id) => id !== g.exemple.id);
        if (autres.length === 0) return;
        if (!confirm(`Marquer ${autres.length} autre(s) signalement comme doublon de « ${g.exemple.ecran} » ?`)) return;
        for (const id of autres) {
          const { error } = await sb.from('signalements').update({ doublon_de: g.exemple.id, statut: 'doublon' }).eq('id', id);
          if (error) { alert('Erreur : ' + error.message, 'error'); return; }
        }
        alert(`${autres.length} signalement${autres.length > 1 ? 's' : ''} marqué${autres.length > 1 ? 's' : ''} comme doublon(s)`, 'success');
        chargerSignalements();
      });
      ligne.appendChild(bouton);
      bloc.appendChild(ligne);
    }
    section.appendChild(bloc);
  }
  conteneur.insertBefore(section, conteneur.firstChild);
}

const LIB_GRAVITE = { critique: 'Critique', urgent: 'Urgent', non_urgent: 'Non urgent' };
const LIB_STATUT_SIG = { nouveau: 'Nouveau', a_valider: 'À valider', planifie: 'Planifié', en_cours: 'En cours', corrige: 'Corrigé', refuse: 'Refusé', doublon: 'Doublon' };
const elt = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte != null) e.textContent = texte; return e; };

// === PAPIERS DU TECHNICIEN : permis de conduire, n° de sécurité sociale ===
// Permis : admin et gestion (désigner un conducteur). NIR : en plus le comptable (paie).
// La base applique les mêmes droits ; ici on n'affiche que ce que le rôle peut lire.
const voitPermis = () => superAdmin || ['admin', 'gestion'].includes(monRole);
const voitSecu = () => voitPermis() || monRole === 'comptable';
let permisActuel = null, permisConducteurs = new Map();

// Copie au presse-papiers ; repli pour la page Apps Script, dont le cadre peut bloquer l'API.
function copierTexte(texte) {
  const zone = document.body.appendChild(document.createElement('textarea'));
  zone.value = texte;
  zone.setAttribute('readonly', '');
  zone.style.position = 'absolute';
  zone.style.left = '-9999px';
  zone.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  zone.remove();
  if (!ok && navigator.clipboard) return navigator.clipboard.writeText(texte).then(() => true, () => false);
  return Promise.resolve(ok);
}

function boutonCopier(texte, libelle = 'Copier') {
  const b = elt('button', 'secondary', libelle);
  b.type = 'button';
  b.addEventListener('click', async () => {
    if (!texte) return;
    if (await copierTexte(texte)) {
      b.textContent = 'Copié';
      setTimeout(() => { b.textContent = libelle; }, 1500);
    } else alert('Copie impossible ici : affichez le numéro et recopiez-le.');
  });
  return b;
}

// Numéro masqué (4 derniers caractères), « Afficher » le montre en entier, « Copier » le copie.
function numeroMasque(numero, lisible) {
  const span = elt('span', 'numero', masquer(numero));
  const voir = elt('button', 'secondary', 'Afficher');
  voir.type = 'button';
  voir.addEventListener('click', () => {
    const montrer = voir.textContent === 'Afficher';
    span.textContent = montrer ? lisible : masquer(numero);
    voir.textContent = montrer ? 'Masquer' : 'Afficher';
  });
  return [span, voir, boutonCopier(numero)];
}

function valeurPapier(dl, titre, contenu) {
  dl.append(elt('dt', null, titre));
  dl.appendChild(elt('dd')).append(...contenu);
}

async function chargerPapiers(t) {
  $('#tech-onglet-papiers').classList.toggle('hidden', !voitSecu());
  $('#papiers-permis').classList.toggle('hidden', !voitPermis());
  $('#permis-form').classList.toggle('hidden', !peutEcrire());
  $('#secu-form').classList.toggle('hidden', !peutEcrire());
  permisActuel = null;
  $('#permis-valeurs').replaceChildren();
  $('#secu-valeurs').replaceChildren();
  if (!voitSecu()) return;
  chargerDocuments(t);
  const [permis, secu] = await Promise.all([
    voitPermis() ? sb.from('permis_conduire').select('numero, categories, delivre_le, scan, modifie_le').eq('technicien_id', t.id).maybeSingle() : { data: null },
    sb.from('secu_sociale').select('nir, modifie_le').eq('technicien_id', t.id).maybeSingle(),
  ]);
  if (permis.error || secu.error) return alert((permis.error || secu.error).message);
  if (ficheTechnicien !== t) return;   // une autre fiche a été ouverte entre-temps
  afficherPermis(permis.data);
  afficherSecu(secu.data);
}

function afficherPermis(p) {
  permisActuel = p;
  const dl = $('#permis-valeurs');
  dl.replaceChildren();
  $('#permis-numero').value = '';
  $('#permis-numero').placeholder = p ? 'Inchangé si vide' : '120675200123';
  if (!p) return valeurPapier(dl, 'Permis', [document.createTextNode('non enregistré')]);
  valeurPapier(dl, 'Numéro', numeroMasque(p.numero, p.numero));
  valeurPapier(dl, 'Catégories', [document.createTextNode(p.categories.replace(/,/g, ', '))]);
  valeurPapier(dl, 'Délivré le', [document.createTextNode(p.delivre_le ? formaterDate(p.delivre_le) : '—')]);
  if (p.scan) {
    const voir = elt('button', 'secondary voir', 'Ouvrir la copie');
    voir.type = 'button';
    voir.addEventListener('click', async () => {
      const { data, error } = await sb.storage.from('identite').createSignedUrl(p.scan, 120);
      if (error) return alert(error.message);
      window.open(data.signedUrl, '_blank', 'noopener');
    });
    valeurPapier(dl, 'Copie', [voir]);
  } else valeurPapier(dl, 'Copie', [document.createTextNode('aucune')]);
  valeurPapier(dl, 'Mis à jour le', [document.createTextNode(formaterDate(p.modifie_le.slice(0, 10)))]);
  $('#permis-categories').value = p.categories;
  $('#permis-delivre').value = p.delivre_le || '';
}

function afficherSecu(s) {
  const dl = $('#secu-valeurs');
  dl.replaceChildren();
  $('#secu-nir').value = '';
  if (!s) return valeurPapier(dl, 'N°', [document.createTextNode('non enregistré')]);
  valeurPapier(dl, 'N°', numeroMasque(s.nir, grouperNir(s.nir)));
  valeurPapier(dl, 'Mis à jour le', [document.createTextNode(formaterDate(s.modifie_le.slice(0, 10)))]);
}

$('#permis-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = ficheTechnicien;
  if (!t) return;
  const saisi = $('#permis-numero').value.trim();
  const numero = saisi ? normaliserPermis(saisi) : permisActuel?.numero;
  if (!numero) return alert(saisi ? 'N° de permis illisible : 6 à 20 lettres ou chiffres.' : 'Saisissez le n° de permis.');
  const fichier = $('#permis-fichier').files[0];
  if (fichier && !extensionScan(fichier)) return alert('Copie acceptée : PDF, JPEG ou PNG.');
  const { error } = await sb.from('permis_conduire').upsert({
    societe_id: selectedSociete, technicien_id: t.id, numero,
    categories: $('#permis-categories').value.trim() || 'B', delivre_le: $('#permis-delivre').value || null,
  }, { onConflict: 'societe_id,technicien_id' });
  if (error) return alert(error.message);
  if (fichier) {
    // Nouveau fichier à chaque envoi : l'ancienne copie n'est plus liée et part à la purge.
    const chemin = `${selectedSociete}/permis/${t.id}_${Date.now()}.${extensionScan(fichier)}`;
    const { error: e1 } = await sb.storage.from('identite').upload(chemin, fichier, { contentType: fichier.type });
    if (e1) alert(`Permis enregistré, mais la copie n'a pas été envoyée : ${e1.message}`);
    else {
      const { error: e2 } = await sb.from('permis_conduire').update({ scan: chemin }).eq('societe_id', selectedSociete).eq('technicien_id', t.id);
      if (e2) alert(e2.message);
    }
  }
  $('#permis-fichier').value = '';
  await chargerPapiers(t);
});

$('#secu-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = ficheTechnicien;
  if (!t) return;
  const nir = normaliserNir($('#secu-nir').value);
  if (!nir) return alert('N° de sécurité sociale invalide : 15 caractères, et la clé (2 derniers chiffres) doit correspondre.');
  const { error } = await sb.from('secu_sociale').upsert({ societe_id: selectedSociete, technicien_id: t.id, nir },
    { onConflict: 'societe_id,technicien_id' });
  if (error) return alert(error.message);
  await chargerPapiers(t);
});

// Liste des signalements (super admin) : textes des utilisateurs toujours posés par textContent.
async function chargerSignalements() {
  if (!superAdmin) return;
  const gravite = $('#signalements-gravite').value;
  const statut = $('#signalements-statut').value;
  let q = sb.from('signalements').select('id, societe_id, auteur, cree_le, ecran, version, gravite, explication, statut, planifie_le, doublon_de, decision')
    .order('cree_le', { ascending: false });
  if (gravite) q = q.eq('gravite', gravite);
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) { alert(`Signalements : ${error.message}`); return; }
  $('#signalements-liste').replaceChildren(...data.map((sig) => {
    const carte = elt('button', 'signalement-carte');
    carte.type = 'button';
    const entete = carte.appendChild(elt('div', 'signalement-entete'));
    entete.append(elt('h4', 'signalement-titre', `${sig.ecran} (v${sig.version})`),
      pastille(LIB_GRAVITE[sig.gravite] || sig.gravite, sig.gravite === 'critique' ? 'danger' : sig.gravite === 'urgent' ? 'alerte' : 'neutre'));
    const meta = carte.appendChild(elt('div', 'signalement-meta'));
    meta.append(elt('strong', 'signalement-meta-item', sig.explication.length > 80 ? `${sig.explication.slice(0, 80)}…` : sig.explication),
      pastille(LIB_STATUT_SIG[sig.statut] || sig.statut, sig.statut === 'corrige' ? 'ok' : sig.statut === 'refuse' || sig.statut === 'doublon' ? 'neutre' : 'info'),
      elt('span', 'signalement-meta-item', formaterDate(String(sig.cree_le).slice(0, 10))));
    carte.addEventListener('click', () => afficherDetailSignalement(sig, data));
    return carte;
  }));
  afficherPropositionTri(data);   // en tête de la liste, après son remplissage
}

async function afficherDetailSignalement(sig, tous) {
  const detail = $('#signalements-detail');
  detail.classList.remove('hidden');
  const section = elt('div', 'signalement-detail-section');
  section.append(elt('h3', 'signalement-detail-titre', `${sig.ecran} — version ${sig.version}`),
    elt('p', 'signalement-meta', `Signalé le ${formaterDate(String(sig.cree_le).slice(0, 10))} · ${LIB_GRAVITE[sig.gravite] || sig.gravite} · ${LIB_STATUT_SIG[sig.statut] || sig.statut}`),
    elt('h4', 'signalement-detail-titre', 'Explication'), elt('p', 'signalement-explication', sig.explication));
  const { data: captures } = await sb.from('signalements_captures').select('chemin').eq('signalement_id', sig.id);
  if (captures?.length) {
    section.append(elt('h4', 'signalement-detail-titre', 'Captures'));
    const zone = section.appendChild(elt('div', 'signalement-captures'));
    for (const c of captures) {
      const { data: url } = await sb.storage.from('signalements').createSignedUrl(c.chemin, 3600);
      if (!url?.signedUrl) continue;
      const img = zone.appendChild(elt('img', 'signalement-capture-image'));
      img.src = url.signedUrl; img.alt = 'Capture d\'écran jointe';
    }
  }
  // Décision (super admin seulement)
  const decision = section.appendChild(elt('div', 'signalement-decision'));
  decision.append(elt('h4', 'signalement-detail-titre', 'Décision'));
  const champ = (libelle, controle) => { const f = elt('div', 'field'); const l = elt('label', '', libelle); controle.id = `detail-${libelle.toLowerCase().replace(/[^a-z]/g, '')}`; l.htmlFor = controle.id; f.append(l, controle); decision.append(f); return controle; };
  const selStatut = champ('Statut', elt('select'));
  for (const [v, l] of Object.entries(LIB_STATUT_SIG)) { const o = selStatut.appendChild(elt('option', '', l)); o.value = v; }
  selStatut.value = sig.statut;
  const datePlan = champ('Planifié le', elt('input')); datePlan.type = 'date'; datePlan.value = sig.planifie_le || '';
  const selDoublon = champ('Doublon de', elt('select'));
  selDoublon.appendChild(elt('option', '', 'Aucun')).value = '';
  for (const s of tous.filter((x) => x.id !== sig.id)) { const o = selDoublon.appendChild(elt('option', '', `${s.ecran} — ${s.explication.slice(0, 50)}`)); o.value = s.id; }
  selDoublon.value = sig.doublon_de || '';
  const texte = champ('Décision', elt('textarea')); texte.maxLength = 2000; texte.value = sig.decision || '';
  const bouton = decision.appendChild(elt('button', '', 'Enregistrer'));
  bouton.type = 'button';
  bouton.addEventListener('click', async () => {
    const { error } = await sb.from('signalements').update({ statut: selStatut.value, planifie_le: datePlan.value || null,
      doublon_de: selDoublon.value || null, decision: texte.value || null }).eq('id', sig.id);
    if (error) alert(`Signalement : ${error.message}`); else { alert('Signalement mis à jour', 'success'); chargerSignalements(); }
  });
  detail.replaceChildren(section);
}

$('#signaler-bug').addEventListener('click', ouvrirDialogSignaler);
$('#signaler-fermer').addEventListener('click', fermerDialogSignaler);
$('#signaler-annuler').addEventListener('click', fermerDialogSignaler);
$('#signaler-envoyer').addEventListener('click', envoyerSignalement);
$('#signaler-ajouter-capture').addEventListener('click', ajouterCaptureSignalement);
$('#signalements-gravite').addEventListener('change', chargerSignalements);
$('#signalements-statut').addEventListener('change', chargerSignalements);

// === SAISIES DES MODULES (admin, gestion) ===
const PAGE_SAISIES = 50;
let saisiesLues = 0, lectureSaisies = 0;

// Onglet absent tant qu'aucun module n'est en service ni rempli (ou base pas encore à jour).
async function chargerModulesSaisis(s) {
  const { data, error } = await sb.rpc('modules_saisis', { s });
  if (error) console.error(error);
  modulesSaisis = error ? [] : data;
}

async function chargerSaisies() {
  fermerSaisieBureau();
  options($('#saisies-module'), modulesSaisis.map((m) => [m.id, m.nom]), 'Tous');
  options($('#saisies-tech'), techniciens.map((t) => [t.id, t.nom]), 'Tous');
  lirePageSaisies(true);
  const { data, error } = await sb.rpc('modules_bureau', { s: selectedSociete });
  modulesBureau = error ? [] : data;
  options($('#saisie-module'), modulesBureau.map((m) => [m.id, m.nom]), 'Choisir…');
  options($('#saisie-tech'), techniciens.filter((t) => t.actif).map((t) => [t.id, t.nom]), 'Choisir…');
  $('#saisie-nouvelle').classList.toggle('hidden', !modulesBureau.length);
}

// --- Saisie faite au bureau pour un technicien (modules réglés sur « Back-office ») ---
let modulesBureau = [], saisieId = null;

function fermerSaisieBureau() {
  $('#saisie-form').classList.add('hidden');
  $('#saisie-form').reset();
  $('#saisie-champs').replaceChildren();
  $('#saisie-erreur').textContent = '';
  saisieId = null;
}

function ouvrirSaisieBureau() {
  fermerSaisieBureau();
  saisieId = crypto.randomUUID();   // le même à chaque essai : jamais deux saisies pour un formulaire
  $('#saisie-date').value = iso(new Date());
  $('#saisie-form').classList.remove('hidden');
  $('#saisie-module').focus();
}

function champsSaisieBureau() {
  const m = modulesBureau.find((x) => x.id === $('#saisie-module').value);
  $('#saisie-champs').replaceChildren(...(m?.champs || []).map((c) => {
    if (['photo', 'signature'].includes(c.type)) return elt('p', 'aide', `${c.libelle} : au téléphone seulement.`);
    const f = elt('div', 'field'), l = elt('label', null, c.libelle + (c.obligatoire ? ' *' : ''));
    const e = elt(c.type === 'texte' ? 'textarea' : ['liste', 'case'].includes(c.type) ? 'select' : 'input');
    e.id = `saisie-champ-${c.cle}`;
    l.htmlFor = e.id;
    if (c.type === 'texte') { e.rows = 2; e.maxLength = 2000; }
    if (c.type === 'nombre') e.inputMode = 'decimal';
    if (c.type === 'date') e.type = 'date';
    if (c.type === 'liste') options(e, c.choix.map((x) => [x, x]), '—');
    if (c.type === 'case') options(e, [['oui', 'Oui'], ['non', 'Non']], '—');
    f.append(l, e);
    return f;
  }));
}

$('#saisie-nouvelle').addEventListener('click', ouvrirSaisieBureau);
$('#saisie-annuler').addEventListener('click', fermerSaisieBureau);
$('#saisie-module').addEventListener('change', champsSaisieBureau);
$('#saisie-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const m = modulesBureau.find((x) => x.id === $('#saisie-module').value), tech = $('#saisie-tech').value;
  const erreur = $('#saisie-erreur'), bouton = $('#saisie-enregistrer');
  if (!m || !tech || !$('#saisie-date').value) { erreur.textContent = 'Choisissez le module, le technicien et la date.'; return; }
  const textes = Object.fromEntries(m.champs.map((c) => [c.cle, $(`#saisie-champ-${c.cle}`)?.value ?? '']));
  const { defaut, valeurs } = lireSaisie(m.champs, textes);
  erreur.textContent = defaut || '';
  if (defaut) return;
  bouton.disabled = true;
  const { data, error } = await sb.rpc('saisir_module_bureau', { p_id: saisieId, s: selectedSociete, tech, p_module: m.id,
    p_version: m.version, p_date: $('#saisie-date').value, p_valeurs: valeurs });
  bouton.disabled = false;
  if (error || !['ok', 'deja'].includes(data)) {
    erreur.textContent = error ? `Enregistrement impossible : ${error.message}` : data === 'module' ? 'Ce module n’est plus en service ici. Rechargez la page.'
      : 'La base a refusé cette saisie. Vérifiez la date et les champs.';
    return;
  }
  chargerSaisies();
});

async function lirePageSaisies(debut) {
  const tour = ++lectureSaisies, s = selectedSociete;   // une réponse dépassée (filtre, société changés) est ignorée
  if (debut) saisiesLues = 0;
  $('#saisies-etat').textContent = 'Chargement…';
  $('#saisies-plus').disabled = true;
  let q = sb.from('saisies_modules').select('id, technicien_id, module_id, version, date, valeurs, recu_le, saisie_par', { count: 'exact' }).eq('societe_id', s);
  if ($('#saisies-module').value) q = q.eq('module_id', $('#saisies-module').value);
  if ($('#saisies-tech').value) q = q.eq('technicien_id', $('#saisies-tech').value);
  const { data, error, count } = await q.order('date', { ascending: false }).order('recu_le', { ascending: false }).order('id')
    .range(saisiesLues, saisiesLues + PAGE_SAISIES - 1);
  if (tour !== lectureSaisies || s !== selectedSociete) return;
  $('#saisies-plus').disabled = false;
  if (error) { $('#saisies-etat').textContent = `Lecture impossible : ${error.message}`; return; }
  if (debut) $('#saisies-liste').replaceChildren();
  $('#saisies-liste').append(...data.map(carteSaisie));
  saisiesLues += data.length;
  $('#saisies-etat').textContent = !count ? 'Aucune saisie pour l’instant.'
    : `${count} saisie${count > 1 ? 's' : ''}${saisiesLues < count ? ` · ${saisiesLues} affichées` : ''}`;
  $('#saisies-plus').classList.toggle('hidden', saisiesLues >= count || !data.length);
}

function carteSaisie(x) {
  const m = modulesSaisis.find((y) => y.id === x.module_id) || { nom: 'Module', icone: 'liste', couleur: '#5b6472', versions: {} };
  const carte = elt('article', 'saisie-carte'), tete = elt('div', 'saisie-tete'), qui = elt('div', 'saisie-qui');
  qui.append(elt('strong', null, m.nom), elt('span', 'aide', `${nomTech(x.technicien_id)} · ${formaterDate(x.date)}`));
  tete.append(iconeModule(m), qui);
  const dl = elt('dl', 'saisie-reponses');
  for (const r of reponses(m.versions?.[x.version], x.valeurs)) {
    const bloc = elt('div');
    bloc.append(elt('dt', null, r.libelle), elt('dd', r.texte === null ? 'vide' : null, r.texte ?? 'Non rempli'));
    dl.append(bloc);
  }
  carte.append(tete, dl, elt('p', 'saisie-recu', `${x.saisie_par ? 'Saisie au bureau le' : 'Reçue le'} ${new Date(x.recu_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`));
  return carte;
}

for (const id of ['#saisies-module', '#saisies-tech']) $(id).addEventListener('change', () => lirePageSaisies(true));
$('#saisies-plus').addEventListener('click', () => lirePageSaisies(false));

// Afficher/masquer l'onglet Signalements si super admin
function mettreAJourVisibiliteSignalements() {
  const onglet = $('#onglet-signalements');
  if (onglet) onglet.classList.toggle('hidden', !superAdmin);
}

// Charger les signalements quand on accède à l'onglet
document.addEventListener('click', (e) => {
  if (e.target.dataset?.tab === 'signalements') {
    setTimeout(() => chargerSignalements(), 0);
  }
});

// Init : vérifier si session existe déjà
sb.auth.onAuthStateChange((event, newSession) => {
  if (newSession) {
    session = newSession;
    if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
    $('#user-email').textContent = session.user.email;
    showScreen('main-screen');
    setTimeout(init, 0);
  } else {
    session = null;
    showScreen('login-screen');
  }
});

// === MODULES (super admin) ===
// Ceux du back-office (un interrupteur par société) et les modules personnalisés.
let modulesPerso = [], portees = [], moduleEdite = null, champsEdites = [];
const ICONES_MODULE = { outil: 'Outil', liste: 'Liste', photo: 'Photo', vehicule: 'Véhicule', alerte: 'Alerte', document: 'Document' };

function boutonModule(texte, classe, action) {
  const b = elt('button', classe, texte);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}

async function chargerModules() {
  if (!superAdmin) return;
  renderModulesSociete();
  chargerPilotage();
  fermerEditeurModule();
  chargerReglesDocuments();
  chargerTuilesApk();
  const [m, v, p] = await Promise.all([
    sb.from('modules_perso').select('id, nom, icone, couleur, finalite, conservation_mois, version, actif').order('nom'),
    sb.from('modules_perso_versions').select('module_id, version, champs'),
    sb.from('modules_perso_portee').select('module_id, holding_id, societe_id, actif, supports'),
  ]);
  const erreur = m.error || v.error || p.error;
  if (erreur) return alert(erreur.message);
  portees = p.data;
  modulesPerso = m.data.map((x) => ({ ...x,
    champs: v.data.find((y) => y.module_id === x.id && y.version === x.version)?.champs || [],
    cles: v.data.filter((y) => y.module_id === x.id).flatMap((y) => y.champs.map((c) => c.cle)) }));   // toutes versions : jamais réutilisées
  renderModulesPerso();
}

function renderModulesSociete() {
  const nom = societes.find((s) => s.id === selectedSociete)?.nom || 'la société';
  $('#modules-societe-titre').textContent = `Modules de ${nom}`;
  $('#modules-societe').replaceChildren(...MODULES_LISTE.map((mod) => {
    const actif = !modulesActifs || modulesActifs.has(mod);
    const l = elt('div', 'module-ligne');
    l.append(elt('span', 'module-nom', LIBELLE_MODULE[mod] || mod), pastille(actif ? 'Actif' : 'Désactivé', actif ? 'ok' : 'alerte'),
      actif ? boutonModule('Désactiver', 'danger', () => {
        if (doubleValidation(`Désactiver le module « ${LIBELLE_MODULE[mod] || mod} » pour ${nom} ? L'onglet disparaîtra du menu ; les données restent.`, 'DÉSACTIVER')) changerModule(mod, false);
      }) : boutonModule('Réactiver', 'secondary', () => changerModule(mod, true)));
    return l;
  }));
}

function renderModulesPerso() {
  $('#modules-perso-liste').replaceChildren(...(modulesPerso.length ? modulesPerso.map(carteModulePerso)
    : [elt('p', 'aide', 'Aucun module personnalisé pour l’instant.')]));
}

// === PILOTAGE DES MODULES FINS : disponible (toi/Gilles) + allumé × support (la société) + demandes ===
const NOM_SUPPORT = { bureau: 'Bureau', apk: 'APK', iphone: 'iPhone' };

async function chargerPilotage() {
  if (!selectedSociete) return;
  const [p, d] = await Promise.all([
    sb.rpc('pilotage_modules', { s: selectedSociete }),
    sb.from('demande_module').select('id, code').eq('societe_id', selectedSociete).eq('etat', 'en_attente'),
  ]);
  if (p.error) { $('#pilotage-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${p.error.message}`)); return; }
  renderPilotage(p.data || [], d.data || []);
}

async function reglerPilotage(rpc, args) {
  const { error } = await sb.rpc(rpc, args);
  if (error) { alert(error.message); }
  await chargerPilotage();
}

function lignePilotage(m) {
  const boite = elt('div', 'pilotage-module'), tete = elt('div', 'org-ligne');
  const dispo = elt('label', 'pilotage-dispo'), cd = elt('input');
  cd.type = 'checkbox'; cd.checked = m.disponible;
  cd.addEventListener('change', () => reglerPilotage('rendre_disponible', { p_societe: selectedSociete, p_code: m.code, p_actif: cd.checked }));
  dispo.append(cd, document.createTextNode(' Disponible'));
  tete.append(elt('span', 'org-nom', m.libelle), dispo);
  boite.append(tete);
  if (m.disponible) {
    const f = elt('fieldset', 'module-supports');
    f.setAttribute('aria-label', `Où allumer : ${m.libelle}`);
    for (const sup of m.supports) {
      const lab = elt('label'), c = elt('input');
      c.type = 'checkbox'; c.checked = m.allumes.includes(sup);
      c.addEventListener('change', () => reglerPilotage('allumer_module', { p_societe: selectedSociete, p_code: m.code, p_support: sup, p_actif: c.checked }));
      lab.append(c, document.createTextNode(NOM_SUPPORT[sup] || sup));
      f.append(lab);
    }
    boite.append(f);
  }
  return boite;
}

function renderPilotage(modules, demandes) {
  const zoneD = $('#pilotage-demandes');
  if (demandes.length) {
    const libelle = (code) => modules.find((m) => m.code === code)?.libelle || code;
    const lignes = demandes.map((x) => {
      const l = elt('div', 'org-ligne'), actions = elt('div', 'org-actions');
      actions.append(boutonModule('Accorder', 'secondary', () => reglerPilotage('repondre_demande', { p_id: x.id, p_accord: true })),
        boutonModule('Refuser', 'danger', () => reglerPilotage('repondre_demande', { p_id: x.id, p_accord: false })));
      l.append(elt('span', 'org-nom', `Demande : ${libelle(x.code)}`), actions);
      return l;
    });
    zoneD.replaceChildren(elt('h4', null, 'Demandes en attente'), ...lignes);
  } else zoneD.replaceChildren();
  const parFamille = {};
  for (const m of modules) (parFamille[m.famille] ||= []).push(m);
  $('#pilotage-liste').replaceChildren(...Object.entries(parFamille).map(([famille, mods]) => {
    const d = elt('div', 'org-bloc');
    d.append(elt('h4', null, famille), ...mods.map(lignePilotage));
    return d;
  }));
}

// === MODULE CLIENTS / TIERS (module fin, gardé par le pilotage sur Bureau) ===
let clients = [], clientEnEdition = null;
const champOuNull = (v) => { const s = (v || '').trim(); return s === '' ? null : s; };

async function chargerClients() {
  if (!selectedSociete) return;
  const { data, error } = await sb.from('tiers')
    .select('id, nom, est_client, est_fournisseur, siren, siret, email, telephone, adresse, code_postal, ville, notes, actif')
    .eq('societe_id', selectedSociete).order('nom');
  if (error) { $('#clients-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${error.message}`)); return; }
  clients = data || [];
  renderClients();
}

function renderClients() {
  const peut = superAdmin || ['admin', 'gestion'].includes(monRole);
  $('#client-nouveau').classList.toggle('hidden', !peut);
  const carte = (c) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    const roles = [c.est_client && 'Client', c.est_fournisseur && 'Fournisseur'].filter(Boolean).join(' · ');
    tete.append(elt('strong', null, c.nom), elt('span', 'aide', roles || 'Tiers'));
    art.append(tete);
    const infos = [[c.code_postal, c.ville].filter(Boolean).join(' '), c.telephone, c.email, c.siren && `SIREN ${c.siren}`].filter(Boolean);
    if (infos.length) art.append(elt('p', 'client-infos', infos.join(' — ')));
    if (peut) {
      const actions = elt('div', 'org-actions');
      actions.append(boutonModule('Modifier', 'secondary', () => ouvrirFormClient(c)),
        c.actif ? boutonModule('Désactiver', 'danger', () => majClient(c, { actif: false }))
                : boutonModule('Réactiver', 'secondary', () => majClient(c, { actif: true })));
      art.append(actions);
    }
    return art;
  };
  const actifs = clients.filter((c) => c.actif), inactifs = clients.filter((c) => !c.actif);
  const enfants = actifs.length ? actifs.map(carte) : [elt('p', 'aide', 'Aucun tiers pour l’instant.')];
  if (inactifs.length) enfants.push(elt('h4', null, 'Désactivés'), ...inactifs.map(carte));
  $('#clients-liste').replaceChildren(...enfants);
}

function ouvrirFormClient(c) {
  clientEnEdition = c || null;
  const f = $('#client-form');
  f.reset();
  $('#client-form-titre').textContent = c ? 'Modifier le tiers' : 'Nouveau tiers';
  $('#client-estclient').checked = c ? c.est_client : true;
  $('#client-estfourn').checked = !!c?.est_fournisseur;
  for (const [id, cle] of [['client-nom', 'nom'], ['client-siren', 'siren'], ['client-siret', 'siret'], ['client-email', 'email'],
    ['client-tel', 'telephone'], ['client-adresse', 'adresse'], ['client-cp', 'code_postal'], ['client-ville', 'ville'], ['client-notes', 'notes']]) {
    $(`#${id}`).value = c?.[cle] || '';
  }
  f.classList.remove('hidden');
  $('#client-nom').focus();
}

function fermerFormClient() { clientEnEdition = null; $('#client-form').classList.add('hidden'); }

async function majClient(c, champs) {
  const { error } = await sb.from('tiers').update(champs).eq('id', c.id);
  if (error) { alert(error.message); return; }
  await chargerClients();
}

async function soumettreClient(ev) {
  ev.preventDefault();
  const nom = $('#client-nom').value.trim();
  if (!nom) { alert('Le nom est obligatoire.'); return; }
  // Normalisation + contrôle par le cœur testé : un champ rempli mais invalide est refusé.
  const controles = [
    ['SIREN', $('#client-siren').value, normaliserSiren],
    ['SIRET', $('#client-siret').value, normaliserSiret],
    ['e-mail', $('#client-email').value, normaliserEmail],
    ['téléphone', $('#client-tel').value, normaliserTelFr],
  ];
  const valeurs = {};
  for (const [nomChamp, brut, normaliser] of controles) {
    if (!champOuNull(brut)) { valeurs[nomChamp] = null; continue; }
    const v = normaliser(brut);
    if (v === null) { alert(`${nomChamp} invalide.`); return; }
    valeurs[nomChamp] = v;
  }
  const row = {
    societe_id: selectedSociete, nom,
    est_client: $('#client-estclient').checked, est_fournisseur: $('#client-estfourn').checked,
    siren: valeurs.SIREN, siret: valeurs.SIRET, email: valeurs['e-mail'], telephone: valeurs['téléphone'],
    adresse: champOuNull($('#client-adresse').value), code_postal: champOuNull($('#client-cp').value),
    ville: champOuNull($('#client-ville').value), notes: champOuNull($('#client-notes').value),
  };
  const { error } = clientEnEdition
    ? await sb.from('tiers').update(row).eq('id', clientEnEdition.id)
    : await sb.from('tiers').insert(row);
  if (error) { alert(error.message); return; }
  fermerFormClient();
  await chargerClients();
}

$('#client-nouveau').addEventListener('click', () => ouvrirFormClient(null));
$('#client-form').addEventListener('submit', soumettreClient);
$('#client-annuler').addEventListener('click', fermerFormClient);

// === MODULE ARTICLES & TARIFS (module fin, gardé par le pilotage sur Bureau) ===
let articles = [], articleEnEdition = null;

const eurosEnCentimes = (txt) => {
  const s = String(txt || '').trim().replace(',', '.');
  if (s === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
};
const centimesEnEuros = (c) => (Number(c || 0) / 100).toFixed(2).replace('.', ',') + ' €';

async function chargerArticles() {
  if (!selectedSociete) return;
  const { data, error } = await sb.from('articles')
    .select('id, reference, libelle, ean13, prix_ht_centimes, taux_tva, unite, actif')
    .eq('societe_id', selectedSociete).order('libelle');
  if (error) { $('#articles-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${error.message}`)); return; }
  articles = data || [];
  renderArticles();
}

function renderArticles() {
  const peut = superAdmin || ['admin', 'gestion'].includes(monRole);
  $('#article-nouveau').classList.toggle('hidden', !peut);
  const carte = (a) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, a.libelle), elt('span', 'aide', a.reference || ''));
    art.append(tete);
    const infos = [`${centimesEnEuros(a.prix_ht_centimes)} HT`, `TVA ${String(a.taux_tva).replace('.', ',')} %`, a.unite, a.ean13 && `EAN ${a.ean13}`].filter(Boolean);
    art.append(elt('p', 'client-infos', infos.join(' — ')));
    if (peut) {
      const actions = elt('div', 'org-actions');
      actions.append(boutonModule('Modifier', 'secondary', () => ouvrirFormArticle(a)),
        a.actif ? boutonModule('Désactiver', 'danger', () => majArticle(a, { actif: false }))
                : boutonModule('Réactiver', 'secondary', () => majArticle(a, { actif: true })));
      art.append(actions);
    }
    return art;
  };
  const actifs = articles.filter((a) => a.actif), inactifs = articles.filter((a) => !a.actif);
  const enfants = actifs.length ? actifs.map(carte) : [elt('p', 'aide', 'Aucun article pour l’instant.')];
  if (inactifs.length) enfants.push(elt('h4', null, 'Désactivés'), ...inactifs.map(carte));
  $('#articles-liste').replaceChildren(...enfants);
}

function ouvrirFormArticle(a) {
  articleEnEdition = a || null;
  const f = $('#article-form');
  f.reset();
  $('#article-form-titre').textContent = a ? 'Modifier l’article' : 'Nouvel article';
  $('#article-ref').value = a?.reference || '';
  $('#article-libelle').value = a?.libelle || '';
  $('#article-ean').value = a?.ean13 || '';
  $('#article-prix').value = a ? (a.prix_ht_centimes / 100).toFixed(2).replace('.', ',') : '';
  $('#article-tva').value = a ? String(a.taux_tva) : '20';
  $('#article-unite').value = a?.unite || '';
  f.classList.remove('hidden');
  $('#article-libelle').focus();
}

function fermerFormArticle() { articleEnEdition = null; $('#article-form').classList.add('hidden'); }

async function majArticle(a, champs) {
  const { error } = await sb.from('articles').update(champs).eq('id', a.id);
  if (error) { alert(error.message); return; }
  await chargerArticles();
}

async function soumettreArticle(ev) {
  ev.preventDefault();
  const libelle = normaliserLibelle($('#article-libelle').value);
  if (!libelle) { alert('Le libellé est obligatoire.'); return; }
  let reference = null, ean13 = null;
  if (champOuNull($('#article-ref').value)) {
    reference = normaliserReference($('#article-ref').value);
    if (!reference) { alert('Référence invalide (lettres, chiffres, - et _).'); return; }
  }
  if (champOuNull($('#article-ean').value)) {
    ean13 = normaliserEan13($('#article-ean').value);
    if (!ean13) { alert('Code-barres EAN-13 invalide.'); return; }
  }
  const prix = eurosEnCentimes($('#article-prix').value);
  if (prix === null) { alert('Prix invalide (ex. 12,50).'); return; }
  const row = {
    societe_id: selectedSociete, reference, libelle, ean13,
    prix_ht_centimes: prix, taux_tva: Number($('#article-tva').value), unite: champOuNull($('#article-unite').value),
  };
  const { error } = articleEnEdition
    ? await sb.from('articles').update(row).eq('id', articleEnEdition.id)
    : await sb.from('articles').insert(row);
  if (error) { alert(error.message); return; }
  fermerFormArticle();
  await chargerArticles();
}

$('#article-nouveau').addEventListener('click', () => ouvrirFormArticle(null));
$('#article-form').addEventListener('submit', soumettreArticle);
$('#article-annuler').addEventListener('click', fermerFormArticle);

// === MODULE DEVIS (en-tête client + lignes d'articles + totaux calculés par la base) ===
const LIBELLE_STATUT_DEVIS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé' };
let devisListe = [], devisTiers = [], devisArticles = [], devisOuvert = null, devisLignes = [];
const peutDevis = () => superAdmin || ['admin', 'gestion'].includes(monRole);
const champField = (texte, champ) => { const d = elt('div', 'field'); d.append(elt('label', null, texte), champ); return d; };

async function chargerDevis() {
  if (!selectedSociete) return;
  const [dv, ti, ar] = await Promise.all([
    sb.from('devis').select('id, numero, client_nom, date_devis, statut, total_ht_centimes, total_tva_centimes, total_ttc_centimes, tiers_id').eq('societe_id', selectedSociete).order('date_devis', { ascending: false }),
    sb.from('tiers').select('id, nom').eq('societe_id', selectedSociete).eq('actif', true).order('nom'),
    sb.from('articles').select('id, libelle, prix_ht_centimes, taux_tva').eq('societe_id', selectedSociete).eq('actif', true).order('libelle'),
  ]);
  if (dv.error) { $('#devis-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${dv.error.message}`)); return; }
  devisListe = dv.data || []; devisTiers = ti.data || []; devisArticles = ar.data || [];
  const d = devisOuvert && devisListe.find((x) => x.id === devisOuvert);
  if (d) {
    const { data } = await sb.from('devis_ligne').select('id, article_id, libelle, quantite, prix_unitaire_centimes, remise_pct, taux_tva, ht_centimes, rang').eq('devis_id', devisOuvert).order('rang');
    devisLignes = data || [];
    renderDevisEditeur(d);
  } else { devisOuvert = null; renderDevisListe(); }
}

function renderDevisListe() {
  $('#devis-editeur').classList.add('hidden');
  $('#devis-liste').classList.remove('hidden');
  $('#devis-nouveau').classList.toggle('hidden', !peutDevis());
  const carte = (d) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, d.numero || '(brouillon)'), elt('span', 'aide', d.client_nom));
    art.append(tete, elt('p', 'client-infos', [d.date_devis, LIBELLE_STATUT_DEVIS[d.statut], `${centimesEnEuros(d.total_ttc_centimes)} TTC`].join(' — ')));
    const actions = elt('div', 'org-actions');
    actions.append(boutonModule('Ouvrir', 'secondary', () => { devisOuvert = d.id; chargerDevis(); }));
    if (peutDevis()) actions.append(boutonModule('Supprimer', 'danger', () => supprimerDevis(d)));
    art.append(actions);
    return art;
  };
  $('#devis-liste').replaceChildren(...(devisListe.length ? devisListe.map(carte) : [elt('p', 'aide', 'Aucun devis pour l’instant.')]));
}

async function nouveauDevis() {
  const row = { societe_id: selectedSociete, client_nom: 'Nouveau client', date_devis: new Date().toISOString().slice(0, 10) };
  const { data, error } = await sb.from('devis').insert(row).select('id').single();
  if (error) { alert(error.message); return; }
  devisOuvert = data.id; await chargerDevis();
}

async function supprimerDevis(d) {
  if (!confirm(`Supprimer le devis ${d.numero || ''} ? Ses lignes partent avec.`)) return;
  const { error } = await sb.from('devis').delete().eq('id', d.id);
  if (error) { alert(error.message); return; }
  devisOuvert = null; await chargerDevis();
}

const majDevis = (champs) => sb.from('devis').update(champs).eq('id', devisOuvert).then(({ error }) => { if (error) alert(error.message); return chargerDevis(); });
const majLigne = (id, champs) => sb.from('devis_ligne').update(champs).eq('id', id).then(({ error }) => { if (error) alert(error.message); return chargerDevis(); });

function ligneDevisRow(l, ro) {
  const row = elt('div', 'devis-ligne');
  if (devisArticles.length && !ro) {
    const sel = elt('select');
    sel.add(new Option('— article —', ''));
    for (const a of devisArticles) sel.add(new Option(a.libelle, a.id));
    sel.value = l.article_id || '';
    sel.addEventListener('change', () => {
      const a = devisArticles.find((x) => x.id === sel.value);
      if (a) majLigne(l.id, { article_id: a.id, libelle: a.libelle, prix_unitaire_centimes: a.prix_ht_centimes, taux_tva: a.taux_tva });
    });
    row.append(sel);
  }
  const lib = elt('input'); lib.value = l.libelle; lib.placeholder = 'Libellé'; lib.disabled = ro;
  lib.addEventListener('change', () => majLigne(l.id, { libelle: lib.value.trim() || 'Ligne' }));
  const qte = elt('input'); qte.type = 'number'; qte.min = 1; qte.value = l.quantite; qte.disabled = ro; qte.className = 'devis-qte';
  qte.addEventListener('change', () => majLigne(l.id, { quantite: Math.max(1, Math.round(Number(qte.value) || 1)) }));
  const pu = elt('input'); pu.inputMode = 'decimal'; pu.value = (l.prix_unitaire_centimes / 100).toFixed(2).replace('.', ','); pu.disabled = ro; pu.className = 'devis-pu';
  pu.addEventListener('change', () => { const c = eurosEnCentimes(pu.value); if (c === null) { alert('Prix invalide.'); return; } majLigne(l.id, { prix_unitaire_centimes: c }); });
  const rem = elt('input'); rem.type = 'number'; rem.min = 0; rem.max = 100; rem.value = l.remise_pct; rem.disabled = ro; rem.className = 'devis-rem'; rem.title = 'Remise %';
  rem.addEventListener('change', () => majLigne(l.id, { remise_pct: Math.min(100, Math.max(0, Number(rem.value) || 0)) }));
  const tva = elt('select'); tva.disabled = ro;
  for (const t of [20, 10, 5.5, 2.1, 0]) tva.add(new Option(`${String(t).replace('.', ',')} %`, String(t)));
  tva.value = String(l.taux_tva); tva.addEventListener('change', () => majLigne(l.id, { taux_tva: Number(tva.value) }));
  row.append(lib, qte, pu, rem, tva, elt('span', 'devis-ligne-ht', `${centimesEnEuros(l.ht_centimes)} HT`));
  if (!ro) row.append(boutonModule('✕', 'danger', () => sb.from('devis_ligne').delete().eq('id', l.id).then(() => chargerDevis())));
  return row;
}

async function ajouterLigneDevis() {
  const { error } = await sb.from('devis_ligne').insert({ devis_id: devisOuvert, libelle: 'Nouvelle ligne', quantite: 1, prix_unitaire_centimes: 0, taux_tva: 20, rang: devisLignes.length });
  if (error) { alert(error.message); return; }
  await chargerDevis();
}

function renderDevisEditeur(d) {
  $('#devis-liste').classList.add('hidden');
  const z = $('#devis-editeur'); z.classList.remove('hidden'); z.replaceChildren();
  const ro = !peutDevis();
  const entete = elt('div', 'devis-entete');
  entete.append(elt('h3', null, d.numero || 'Nouveau devis'));
  if (devisTiers.length && !ro) {
    const sel = elt('select');
    sel.add(new Option('— choisir un client —', ''));
    for (const t of devisTiers) sel.add(new Option(t.nom, t.id));
    sel.value = d.tiers_id || '';
    sel.addEventListener('change', () => { const t = devisTiers.find((x) => x.id === sel.value); if (t) majDevis({ tiers_id: t.id, client_nom: t.nom }); });
    entete.append(champField('Client (module Clients)', sel));
  }
  const nom = elt('input'); nom.value = d.client_nom; nom.maxLength = 200; nom.disabled = ro;
  nom.addEventListener('change', () => majDevis({ client_nom: nom.value.trim() || 'Client', tiers_id: null }));
  const date = elt('input'); date.type = 'date'; date.value = d.date_devis; date.disabled = ro;
  date.addEventListener('change', () => majDevis({ date_devis: date.value }));
  const statut = elt('select'); statut.disabled = ro;
  for (const [v, lab] of Object.entries(LIBELLE_STATUT_DEVIS)) statut.add(new Option(lab, v));
  statut.value = d.statut; statut.addEventListener('change', () => majDevis({ statut: statut.value }));
  entete.append(champField('Nom du client', nom), champField('Date', date), champField('Statut', statut));
  z.append(entete);
  const zl = elt('div', 'devis-lignes');
  zl.append(elt('h4', null, 'Lignes'));
  for (const l of devisLignes) zl.append(ligneDevisRow(l, ro));
  if (!devisLignes.length) zl.append(elt('p', 'aide', 'Aucune ligne.'));
  if (!ro) zl.append(boutonModule('Ajouter une ligne', 'secondary', ajouterLigneDevis));
  z.append(zl);
  const tot = elt('div', 'devis-totaux');
  tot.append(elt('p', null, `Total HT : ${centimesEnEuros(d.total_ht_centimes)}`),
    elt('p', null, `TVA : ${centimesEnEuros(d.total_tva_centimes)}`),
    elt('p', 'devis-ttc', `Total TTC : ${centimesEnEuros(d.total_ttc_centimes)}`));
  z.append(tot);
  const actions = elt('div', 'org-actions');
  actions.append(boutonModule('Fermer', 'secondary', () => { devisOuvert = null; chargerDevis(); }));
  z.append(actions);
}

$('#devis-nouveau').addEventListener('click', nouveauDevis);

// === MODULE FACTURES (jumeau de Devis : tables facture_vente / facture_vente_ligne) ===
const LIBELLE_STATUT_FACTURE = { brouillon: 'Brouillon', emise: 'Émise', payee: 'Payée', annulee: 'Annulée' };
let facturesListe = [], facturesTiers = [], facturesArticles = [], factureOuverte = null, factureLignes = [];

async function chargerFactures() {
  if (!selectedSociete) return;
  const [fv, ti, ar] = await Promise.all([
    sb.from('facture_vente').select('id, numero, client_nom, date_facture, date_echeance, statut, total_ht_centimes, total_tva_centimes, total_ttc_centimes, tiers_id').eq('societe_id', selectedSociete).order('date_facture', { ascending: false }),
    sb.from('tiers').select('id, nom').eq('societe_id', selectedSociete).eq('actif', true).order('nom'),
    sb.from('articles').select('id, libelle, prix_ht_centimes, taux_tva').eq('societe_id', selectedSociete).eq('actif', true).order('libelle'),
  ]);
  if (fv.error) { $('#factures-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${fv.error.message}`)); return; }
  facturesListe = fv.data || []; facturesTiers = ti.data || []; facturesArticles = ar.data || [];
  const f = factureOuverte && facturesListe.find((x) => x.id === factureOuverte);
  if (f) {
    const { data } = await sb.from('facture_vente_ligne').select('id, article_id, libelle, quantite, prix_unitaire_centimes, remise_pct, taux_tva, ht_centimes, rang').eq('facture_vente_id', factureOuverte).order('rang');
    factureLignes = data || [];
    renderFactureEditeur(f);
  } else { factureOuverte = null; renderFacturesListe(); }
}

function renderFacturesListe() {
  $('#facture-editeur').classList.add('hidden');
  $('#factures-liste').classList.remove('hidden');
  $('#facture-nouvelle').classList.toggle('hidden', !peutDevis());
  const carte = (f) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, f.numero || '(brouillon)'), elt('span', 'aide', f.client_nom));
    art.append(tete, elt('p', 'client-infos', [f.date_facture, LIBELLE_STATUT_FACTURE[f.statut], `${centimesEnEuros(f.total_ttc_centimes)} TTC`].filter(Boolean).join(' — ')));
    const actions = elt('div', 'org-actions');
    actions.append(boutonModule('Ouvrir', 'secondary', () => { factureOuverte = f.id; chargerFactures(); }));
    if (peutDevis()) actions.append(boutonModule('Supprimer', 'danger', () => supprimerFacture(f)));
    art.append(actions);
    return art;
  };
  $('#factures-liste').replaceChildren(...(facturesListe.length ? facturesListe.map(carte) : [elt('p', 'aide', 'Aucune facture pour l’instant.')]));
}

async function nouvelleFacture() {
  const { data, error } = await sb.from('facture_vente').insert({ societe_id: selectedSociete, client_nom: 'Nouveau client', date_facture: new Date().toISOString().slice(0, 10) }).select('id').single();
  if (error) { alert(error.message); return; }
  factureOuverte = data.id; await chargerFactures();
}

async function supprimerFacture(f) {
  if (!confirm(`Supprimer la facture ${f.numero || ''} ? Ses lignes partent avec.`)) return;
  const { error } = await sb.from('facture_vente').delete().eq('id', f.id);
  if (error) { alert(error.message); return; }
  factureOuverte = null; await chargerFactures();
}

const majFacture = (champs) => sb.from('facture_vente').update(champs).eq('id', factureOuverte).then(({ error }) => { if (error) alert(error.message); return chargerFactures(); });
const majLigneFacture = (id, champs) => sb.from('facture_vente_ligne').update(champs).eq('id', id).then(({ error }) => { if (error) alert(error.message); return chargerFactures(); });

function ligneFactureRow(l, ro) {
  const row = elt('div', 'devis-ligne');
  if (facturesArticles.length && !ro) {
    const sel = elt('select');
    sel.add(new Option('— article —', ''));
    for (const a of facturesArticles) sel.add(new Option(a.libelle, a.id));
    sel.value = l.article_id || '';
    sel.addEventListener('change', () => { const a = facturesArticles.find((x) => x.id === sel.value); if (a) majLigneFacture(l.id, { article_id: a.id, libelle: a.libelle, prix_unitaire_centimes: a.prix_ht_centimes, taux_tva: a.taux_tva }); });
    row.append(sel);
  }
  const lib = elt('input'); lib.value = l.libelle; lib.placeholder = 'Libellé'; lib.disabled = ro;
  lib.addEventListener('change', () => majLigneFacture(l.id, { libelle: lib.value.trim() || 'Ligne' }));
  const qte = elt('input'); qte.type = 'number'; qte.min = 1; qte.value = l.quantite; qte.disabled = ro; qte.className = 'devis-qte';
  qte.addEventListener('change', () => majLigneFacture(l.id, { quantite: Math.max(1, Math.round(Number(qte.value) || 1)) }));
  const pu = elt('input'); pu.inputMode = 'decimal'; pu.value = (l.prix_unitaire_centimes / 100).toFixed(2).replace('.', ','); pu.disabled = ro; pu.className = 'devis-pu';
  pu.addEventListener('change', () => { const c = eurosEnCentimes(pu.value); if (c === null) { alert('Prix invalide.'); return; } majLigneFacture(l.id, { prix_unitaire_centimes: c }); });
  const rem = elt('input'); rem.type = 'number'; rem.min = 0; rem.max = 100; rem.value = l.remise_pct; rem.disabled = ro; rem.className = 'devis-rem'; rem.title = 'Remise %';
  rem.addEventListener('change', () => majLigneFacture(l.id, { remise_pct: Math.min(100, Math.max(0, Number(rem.value) || 0)) }));
  const tva = elt('select'); tva.disabled = ro;
  for (const t of [20, 10, 5.5, 2.1, 0]) tva.add(new Option(`${String(t).replace('.', ',')} %`, String(t)));
  tva.value = String(l.taux_tva); tva.addEventListener('change', () => majLigneFacture(l.id, { taux_tva: Number(tva.value) }));
  row.append(lib, qte, pu, rem, tva, elt('span', 'devis-ligne-ht', `${centimesEnEuros(l.ht_centimes)} HT`));
  if (!ro) row.append(boutonModule('✕', 'danger', () => sb.from('facture_vente_ligne').delete().eq('id', l.id).then(() => chargerFactures())));
  return row;
}

async function ajouterLigneFacture() {
  const { error } = await sb.from('facture_vente_ligne').insert({ facture_vente_id: factureOuverte, libelle: 'Nouvelle ligne', quantite: 1, prix_unitaire_centimes: 0, taux_tva: 20, rang: factureLignes.length });
  if (error) { alert(error.message); return; }
  await chargerFactures();
}

function renderFactureEditeur(f) {
  $('#factures-liste').classList.add('hidden');
  const z = $('#facture-editeur'); z.classList.remove('hidden'); z.replaceChildren();
  const ro = !peutDevis();
  const entete = elt('div', 'devis-entete');
  entete.append(elt('h3', null, f.numero || 'Nouvelle facture'));
  if (facturesTiers.length && !ro) {
    const sel = elt('select');
    sel.add(new Option('— choisir un client —', ''));
    for (const t of facturesTiers) sel.add(new Option(t.nom, t.id));
    sel.value = f.tiers_id || '';
    sel.addEventListener('change', () => { const t = facturesTiers.find((x) => x.id === sel.value); if (t) majFacture({ tiers_id: t.id, client_nom: t.nom }); });
    entete.append(champField('Client (module Clients)', sel));
  }
  const nom = elt('input'); nom.value = f.client_nom; nom.maxLength = 200; nom.disabled = ro;
  nom.addEventListener('change', () => majFacture({ client_nom: nom.value.trim() || 'Client', tiers_id: null }));
  const date = elt('input'); date.type = 'date'; date.value = f.date_facture; date.disabled = ro;
  date.addEventListener('change', () => majFacture({ date_facture: date.value }));
  const ech = elt('input'); ech.type = 'date'; ech.value = f.date_echeance || ''; ech.disabled = ro;
  ech.addEventListener('change', () => majFacture({ date_echeance: ech.value || null }));
  const statut = elt('select'); statut.disabled = ro;
  for (const [v, lab] of Object.entries(LIBELLE_STATUT_FACTURE)) statut.add(new Option(lab, v));
  statut.value = f.statut; statut.addEventListener('change', () => majFacture({ statut: statut.value }));
  entete.append(champField('Nom du client', nom), champField('Date', date), champField('Échéance', ech), champField('Statut', statut));
  z.append(entete);
  const zl = elt('div', 'devis-lignes');
  zl.append(elt('h4', null, 'Lignes'));
  for (const l of factureLignes) zl.append(ligneFactureRow(l, ro));
  if (!factureLignes.length) zl.append(elt('p', 'aide', 'Aucune ligne.'));
  if (!ro) zl.append(boutonModule('Ajouter une ligne', 'secondary', ajouterLigneFacture));
  z.append(zl);
  const tot = elt('div', 'devis-totaux');
  tot.append(elt('p', null, `Total HT : ${centimesEnEuros(f.total_ht_centimes)}`),
    elt('p', null, `TVA : ${centimesEnEuros(f.total_tva_centimes)}`),
    elt('p', 'devis-ttc', `Total TTC : ${centimesEnEuros(f.total_ttc_centimes)}`));
  z.append(tot);
  const actions = elt('div', 'org-actions');
  actions.append(boutonModule('Fermer', 'secondary', () => { factureOuverte = null; chargerFactures(); }));
  z.append(actions);
}

$('#facture-nouvelle').addEventListener('click', nouvelleFacture);

// === MODULE RÈGLEMENTS (encaissements qui soldent les factures clients) ===
const MODES_REGLEMENT = { virement: 'Virement', cheque: 'Chèque', especes: 'Espèces', cb: 'Carte', autre: 'Autre' };
let reglementsListe = [], reglementsFactures = [];

async function chargerReglements() {
  if (!selectedSociete) return;
  const [rg, fv] = await Promise.all([
    sb.from('reglement').select('id, facture_vente_id, date_reglement, montant_centimes, mode, reference').eq('societe_id', selectedSociete).order('date_reglement', { ascending: false }),
    sb.from('facture_vente').select('id, numero, client_nom, total_ttc_centimes').eq('societe_id', selectedSociete).order('date_facture', { ascending: false }),
  ]);
  if (rg.error) { $('#reglements-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${rg.error.message}`)); return; }
  reglementsListe = rg.data || []; reglementsFactures = fv.data || [];
  renderReglements();
}

const resteFacture = (f) => f.total_ttc_centimes - reglementsListe.filter((r) => r.facture_vente_id === f.id).reduce((s, r) => s + r.montant_centimes, 0);

function renderReglements() {
  $('#reglement-nouveau').classList.toggle('hidden', !peutDevis());
  const numFact = (id) => reglementsFactures.find((f) => f.id === id)?.numero || '—';
  const carte = (r) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, centimesEnEuros(r.montant_centimes)), elt('span', 'aide', MODES_REGLEMENT[r.mode]));
    art.append(tete, elt('p', 'client-infos', [r.date_reglement, r.facture_vente_id ? `Facture ${numFact(r.facture_vente_id)}` : 'Sans facture', r.reference].filter(Boolean).join(' — ')));
    if (peutDevis()) { const a = elt('div', 'org-actions'); a.append(boutonModule('Supprimer', 'danger', () => supprimerReglement(r))); art.append(a); }
    return art;
  };
  $('#reglements-liste').replaceChildren(...(reglementsListe.length ? reglementsListe.map(carte) : [elt('p', 'aide', 'Aucun règlement pour l’instant.')]));
}

async function supprimerReglement(r) {
  if (!confirm('Supprimer ce règlement ? Si la facture était payée, elle redeviendra « émise ».')) return;
  const { error } = await sb.from('reglement').delete().eq('id', r.id);
  if (error) { alert(error.message); return; }
  await chargerReglements();
}

function ouvrirFormReglement() {
  const f = $('#reglement-form'); f.reset(); f.classList.remove('hidden');
  const sel = $('#reglement-facture');
  sel.replaceChildren(new Option('— sans facture —', ''));
  for (const fa of reglementsFactures) sel.add(new Option(`${fa.numero || '(brouillon)'} — ${fa.client_nom} — reste ${centimesEnEuros(Math.max(0, resteFacture(fa)))}`, fa.id));
  sel.onchange = () => { const fa = reglementsFactures.find((x) => x.id === sel.value); if (fa) $('#reglement-montant').value = (Math.max(0, resteFacture(fa)) / 100).toFixed(2).replace('.', ','); };
  $('#reglement-date').value = new Date().toISOString().slice(0, 10);
  $('#reglement-facture').focus();
}

function fermerFormReglement() { $('#reglement-form').classList.add('hidden'); }

async function soumettreReglement(ev) {
  ev.preventDefault();
  const montant = eurosEnCentimes($('#reglement-montant').value);
  if (!montant) { alert('Montant invalide (ex. 120,00).'); return; }
  const row = {
    societe_id: selectedSociete,
    facture_vente_id: $('#reglement-facture').value || null,
    date_reglement: $('#reglement-date').value,
    montant_centimes: montant,
    mode: $('#reglement-mode').value,
    reference: champOuNull($('#reglement-reference').value),
  };
  const { error } = await sb.from('reglement').insert(row);
  if (error) { alert(error.message); return; }
  fermerFormReglement();
  await chargerReglements();
}

$('#reglement-nouveau').addEventListener('click', ouvrirFormReglement);
$('#reglement-form').addEventListener('submit', soumettreReglement);
$('#reglement-annuler').addEventListener('click', fermerFormReglement);

// === MODULE GESTION DE STOCK (mouvements d'entrée/sortie, stock courant) ===
let stockCourant = [], stockArticles = [];

async function chargerStock() {
  if (!selectedSociete) return;
  const [sc, ar] = await Promise.all([
    sb.rpc('stock_courant', { s: selectedSociete }),
    sb.from('articles').select('id, libelle').eq('societe_id', selectedSociete).eq('actif', true).order('libelle'),
  ]);
  if (sc.error) { $('#stock-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${sc.error.message}`)); return; }
  stockCourant = sc.data || []; stockArticles = ar.data || [];
  renderStock();
}

function renderStock() {
  const peut = superAdmin || ['admin', 'gestion'].includes(monRole);
  $('#stock-nouveau').classList.toggle('hidden', !peut || !stockArticles.length);
  if (!stockArticles.length) {
    $('#stock-liste').replaceChildren(elt('p', 'aide', 'Ajoute d’abord des articles (module Articles) : le stock porte sur eux.'));
    return;
  }
  const carte = (a) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, a.libelle), pastille(`${a.quantite} en stock`, a.quantite <= 0 ? 'alerte' : 'ok'));
    art.append(tete);
    return art;
  };
  $('#stock-liste').replaceChildren(...(stockCourant.length ? stockCourant.map(carte) : [elt('p', 'aide', 'Aucun article.')]));
}

function ouvrirFormStock() {
  const f = $('#stock-form'); f.reset(); f.classList.remove('hidden');
  const sel = $('#stock-article'); sel.replaceChildren();
  for (const a of stockArticles) sel.add(new Option(a.libelle, a.id));
  $('#stock-date').value = new Date().toISOString().slice(0, 10);
  $('#stock-quantite').value = '1';
  $('#stock-article').focus();
}

function fermerFormStock() { $('#stock-form').classList.add('hidden'); }

async function soumettreStock(ev) {
  ev.preventDefault();
  const quantite = Math.round(Number($('#stock-quantite').value));
  if (!(quantite > 0)) { alert('Quantité invalide.'); return; }
  const row = {
    societe_id: selectedSociete, article_id: $('#stock-article').value,
    type: $('#stock-type').value, quantite, date_mouvement: $('#stock-date').value,
    motif: champOuNull($('#stock-motif').value),
  };
  const { error } = await sb.from('mouvement_stock').insert(row);
  if (error) { alert(error.message); return; }   // ex. « stock insuffisant pour cette sortie »
  fermerFormStock();
  await chargerStock();
}

$('#stock-nouveau').addEventListener('click', ouvrirFormStock);
$('#stock-form').addEventListener('submit', soumettreStock);
$('#stock-annuler').addEventListener('click', fermerFormStock);

// === MODULE INVENTAIRES (comptage + écart + clôture qui ajuste le stock) ===
let inventairesListe = [], inventaireOuvert = null, inventaireLignes = [];

async function chargerInventaires() {
  if (!selectedSociete) return;
  const inv = await sb.from('inventaire').select('id, date_inventaire, statut').eq('societe_id', selectedSociete).order('date_inventaire', { ascending: false });
  if (inv.error) { $('#inventaires-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${inv.error.message}`)); return; }
  inventairesListe = inv.data || [];
  const o = inventaireOuvert && inventairesListe.find((x) => x.id === inventaireOuvert);
  if (o) {
    const { data } = await sb.from('inventaire_ligne').select('id, libelle, quantite_theorique, quantite_comptee, ecart, rang').eq('inventaire_id', inventaireOuvert).order('rang');
    inventaireLignes = data || [];
    renderInventaireEditeur(o);
  } else { inventaireOuvert = null; renderInventairesListe(); }
}

function renderInventairesListe() {
  $('#inventaire-editeur').classList.add('hidden');
  $('#inventaires-liste').classList.remove('hidden');
  $('#inventaire-nouveau').classList.toggle('hidden', !peutDevis());
  const carte = (i) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, `Inventaire du ${i.date_inventaire}`), pastille(i.statut === 'clos' ? 'Clos' : 'En cours', i.statut === 'clos' ? 'ok' : 'alerte'));
    art.append(tete);
    const a = elt('div', 'org-actions'); a.append(boutonModule('Ouvrir', 'secondary', () => { inventaireOuvert = i.id; chargerInventaires(); }));
    art.append(a);
    return art;
  };
  $('#inventaires-liste').replaceChildren(...(inventairesListe.length ? inventairesListe.map(carte) : [elt('p', 'aide', 'Aucun inventaire. « Nouvel inventaire » fige le stock actuel.')]));
}

async function nouvelInventaire() {
  const { data, error } = await sb.rpc('creer_inventaire', { s: selectedSociete });
  if (error) { alert(error.message); return; }
  inventaireOuvert = data; await chargerInventaires();
}

async function cloturerInventaire(id) {
  if (!confirm('Clôturer cet inventaire ? Le stock sera ajusté selon les écarts, sans retour en arrière.')) return;
  const { error } = await sb.rpc('cloturer_inventaire', { p_id: id });
  if (error) { alert(error.message); return; }
  await chargerInventaires();
}

function renderInventaireEditeur(inv) {
  $('#inventaires-liste').classList.add('hidden');
  const z = $('#inventaire-editeur'); z.classList.remove('hidden'); z.replaceChildren();
  const clos = inv.statut === 'clos';
  const ro = clos || !peutDevis();
  z.append(elt('h3', null, `Inventaire du ${inv.date_inventaire}${clos ? ' — clos' : ''}`));
  const tbl = elt('div', 'devis-lignes');
  tbl.append(elt('h4', null, 'Articles'));
  for (const l of inventaireLignes) {
    const row = elt('div', 'devis-ligne');
    const c = elt('input'); c.type = 'number'; c.min = 0; c.value = l.quantite_comptee; c.disabled = ro; c.className = 'devis-qte';
    c.addEventListener('change', () => sb.from('inventaire_ligne').update({ quantite_comptee: Math.max(0, Math.round(Number(c.value) || 0)) }).eq('id', l.id).then(({ error }) => { if (error) alert(error.message); return chargerInventaires(); }));
    row.append(elt('span', 'inv-libelle', l.libelle), elt('span', 'aide', `théo. ${l.quantite_theorique}`), elt('span', 'aide', 'compté'), c,
      elt('span', 'devis-ligne-ht', `écart ${l.ecart > 0 ? '+' : ''}${l.ecart}`));
    tbl.append(row);
  }
  if (!inventaireLignes.length) tbl.append(elt('p', 'aide', 'Aucun article à compter — ajoute des articles d’abord.'));
  z.append(tbl);
  const actions = elt('div', 'org-actions');
  actions.append(boutonModule('Fermer', 'secondary', () => { inventaireOuvert = null; chargerInventaires(); }));
  if (!clos && peutDevis()) actions.append(boutonModule('Clôturer et ajuster le stock', 'danger', () => cloturerInventaire(inv.id)));
  z.append(actions);
}

$('#inventaire-nouveau').addEventListener('click', nouvelInventaire);

// === MODULE LOTS & PÉREMPTION (DLUO + alerte de péremption) ===
const SEUIL_PEREMPTION = 30;   // jours avant la DLUO où l'on alerte
const STATUT_PEREMPTION = { perime: ['Périmé', 'alerte'], proche: ['Bientôt', 'alerte'], bon: ['Bon', 'ok'] };
let lotsListe = [], lotsArticles = [], lotEnEdition = null;

async function chargerPeremption() {
  if (!selectedSociete) return;
  const [lo, ar] = await Promise.all([
    sb.from('lot').select('id, article_id, numero_lot, dluo, quantite').eq('societe_id', selectedSociete).order('dluo'),
    sb.from('articles').select('id, libelle').eq('societe_id', selectedSociete).eq('actif', true).order('libelle'),
  ]);
  if (lo.error) { $('#peremption-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${lo.error.message}`)); return; }
  lotsListe = lo.data || []; lotsArticles = ar.data || [];
  renderPeremption();
}

function renderPeremption() {
  const peut = superAdmin || ['admin', 'gestion'].includes(monRole);
  $('#lot-nouveau').classList.toggle('hidden', !peut || !lotsArticles.length);
  if (!lotsArticles.length) { $('#peremption-liste').replaceChildren(elt('p', 'aide', 'Ajoute d’abord des articles (module Articles) : les lots portent sur eux.')); return; }
  const nomArt = (id) => lotsArticles.find((a) => a.id === id)?.libelle || '—';
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const carte = (l) => {
    const art = elt('article', 'client-carte');
    const [lab, cls] = STATUT_PEREMPTION[statutPeremption(l.dluo, aujourdhui, SEUIL_PEREMPTION)] || ['—', 'ok'];
    const j = joursAvantPeremption(l.dluo, aujourdhui);
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, nomArt(l.article_id)), pastille(lab, cls));
    const reste = j === null ? '' : (j < 0 ? `périmé depuis ${-j} j` : `${j} j restants`);
    art.append(tete, elt('p', 'client-infos', [`DLUO ${l.dluo}`, reste, l.numero_lot && `lot ${l.numero_lot}`, `${l.quantite} u.`].filter(Boolean).join(' — ')));
    if (peut) { const a = elt('div', 'org-actions'); a.append(boutonModule('Modifier', 'secondary', () => ouvrirFormLot(l)), boutonModule('Supprimer', 'danger', () => supprimerLot(l))); art.append(a); }
    return art;
  };
  $('#peremption-liste').replaceChildren(...(lotsListe.length ? lotsListe.map(carte) : [elt('p', 'aide', 'Aucun lot pour l’instant.')]));
}

function ouvrirFormLot(l) {
  lotEnEdition = l || null;
  const f = $('#lot-form'); f.reset(); f.classList.remove('hidden');
  const sel = $('#lot-article'); sel.replaceChildren();
  for (const a of lotsArticles) sel.add(new Option(a.libelle, a.id));
  $('#lot-form-titre').textContent = l ? 'Modifier le lot' : 'Nouveau lot';
  if (l) { sel.value = l.article_id; $('#lot-numero').value = l.numero_lot || ''; $('#lot-dluo').value = l.dluo; $('#lot-quantite').value = l.quantite; }
  else { $('#lot-quantite').value = '0'; }
  sel.focus();
}

function fermerFormLot() { lotEnEdition = null; $('#lot-form').classList.add('hidden'); }

async function supprimerLot(l) {
  if (!confirm('Supprimer ce lot ?')) return;
  const { error } = await sb.from('lot').delete().eq('id', l.id);
  if (error) { alert(error.message); return; }
  await chargerPeremption();
}

async function soumettreLot(ev) {
  ev.preventDefault();
  if (!$('#lot-dluo').value) { alert('La date de péremption (DLUO) est obligatoire.'); return; }
  const row = {
    societe_id: selectedSociete, article_id: $('#lot-article').value,
    numero_lot: champOuNull($('#lot-numero').value), dluo: $('#lot-dluo').value,
    quantite: Math.max(0, Math.round(Number($('#lot-quantite').value) || 0)),
  };
  const { error } = lotEnEdition ? await sb.from('lot').update(row).eq('id', lotEnEdition.id) : await sb.from('lot').insert(row);
  if (error) { alert(error.message); return; }
  fermerFormLot(); await chargerPeremption();
}

$('#lot-nouveau').addEventListener('click', () => ouvrirFormLot(null));
$('#lot-form').addEventListener('submit', soumettreLot);
$('#lot-annuler').addEventListener('click', fermerFormLot);

// === MODULE CONTRATS DE LOCATION (générique : biens + contrats) ===
const TYPE_BIEN = { vehicule: 'Véhicule', immobilier: 'Immobilier', materiel: 'Matériel', autre: 'Autre' };
const STATUT_CONTRAT = { en_cours: ['En cours', 'ok'], termine: ['Terminé', 'neutre'], annule: ['Annulé', 'alerte'] };
let biensListe = [], contratsListe = [], bienEnEdition = null, contratEnEdition = null;

async function chargerLocation() {
  if (!selectedSociete) return;
  const [bi, co, ti] = await Promise.all([
    sb.from('bien_location').select('id, libelle, type, reference, actif').eq('societe_id', selectedSociete).order('libelle'),
    sb.from('contrat_location').select('id, bien_id, bien_libelle, client_nom, tiers_id, date_debut, date_fin, loyer_centimes, periode, statut').eq('societe_id', selectedSociete).order('date_debut', { ascending: false }),
    sb.from('tiers').select('id, nom').eq('societe_id', selectedSociete).eq('actif', true).order('nom'),
  ]);
  if (bi.error) { $('#location-contrats').replaceChildren(elt('p', 'aide', `Lecture impossible : ${bi.error.message}`)); return; }
  biensListe = bi.data || []; contratsListe = co.data || []; locationTiers = ti.data || [];
  renderLocation();
}

let locationTiers = [];
const peutLocation = () => superAdmin || ['admin', 'gestion'].includes(monRole);

function renderLocation() {
  const peut = peutLocation();
  $('#bien-nouveau').classList.toggle('hidden', !peut);
  $('#contrat-nouveau').classList.toggle('hidden', !peut);
  // Biens
  const carteBien = (b) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, b.libelle), elt('span', 'aide', `${TYPE_BIEN[b.type]}${b.reference ? ' · ' + b.reference : ''}`));
    art.append(tete);
    if (peut) { const a = elt('div', 'org-actions'); a.append(boutonModule('Modifier', 'secondary', () => ouvrirFormBien(b)), boutonModule('Supprimer', 'danger', () => supprimerBien(b))); art.append(a); }
    return art;
  };
  $('#location-biens').replaceChildren(...(biensListe.length ? biensListe.map(carteBien) : [elt('p', 'aide', 'Aucun bien à louer. Ajoute une voiture, une maison, du matériel…')]));
  // Contrats
  const carteContrat = (c) => {
    const art = elt('article', 'client-carte');
    const [lab, cls] = STATUT_CONTRAT[c.statut] || ['—', 'neutre'];
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, c.bien_libelle), pastille(lab, cls));
    const periode = c.date_fin ? `du ${c.date_debut} au ${c.date_fin}` : `depuis le ${c.date_debut}`;
    art.append(tete, elt('p', 'client-infos', [c.client_nom, periode, `${centimesEnEuros(c.loyer_centimes)} / ${c.periode}`].join(' — ')));
    if (peut) { const a = elt('div', 'org-actions'); a.append(boutonModule('Modifier', 'secondary', () => ouvrirFormContrat(c)), boutonModule('Supprimer', 'danger', () => supprimerContrat(c))); art.append(a); }
    return art;
  };
  $('#location-contrats').replaceChildren(...(contratsListe.length ? contratsListe.map(carteContrat) : [elt('p', 'aide', 'Aucun contrat pour l’instant.')]));
}

// --- Biens ---
function ouvrirFormBien(b) {
  bienEnEdition = b || null;
  const f = $('#bien-form'); f.reset(); f.classList.remove('hidden');
  $('#bien-form-titre').textContent = b ? 'Modifier le bien' : 'Nouveau bien';
  $('#bien-libelle').value = b?.libelle || ''; $('#bien-type').value = b?.type || 'vehicule'; $('#bien-reference').value = b?.reference || '';
  $('#bien-libelle').focus();
}
function fermerFormBien() { bienEnEdition = null; $('#bien-form').classList.add('hidden'); }
async function supprimerBien(b) {
  if (!confirm('Supprimer ce bien ? Les contrats liés gardent son nom.')) return;
  const { error } = await sb.from('bien_location').delete().eq('id', b.id);
  if (error) { alert(error.message); return; } await chargerLocation();
}
async function soumettreBien(ev) {
  ev.preventDefault();
  const libelle = $('#bien-libelle').value.trim();
  if (!libelle) { alert('Le libellé est obligatoire.'); return; }
  const row = { societe_id: selectedSociete, libelle, type: $('#bien-type').value, reference: champOuNull($('#bien-reference').value) };
  const { error } = bienEnEdition ? await sb.from('bien_location').update(row).eq('id', bienEnEdition.id) : await sb.from('bien_location').insert(row);
  if (error) { alert(error.message); return; }
  fermerFormBien(); await chargerLocation();
}

// --- Contrats ---
function ouvrirFormContrat(c) {
  contratEnEdition = c || null;
  const f = $('#contrat-form'); f.reset(); f.classList.remove('hidden');
  $('#contrat-form-titre').textContent = c ? 'Modifier le contrat' : 'Nouveau contrat';
  const selB = $('#contrat-bien'); selB.replaceChildren(new Option('— saisir à la main —', ''));
  for (const b of biensListe) selB.add(new Option(`${b.libelle} (${TYPE_BIEN[b.type]})`, b.id));
  selB.value = c?.bien_id || '';
  selB.onchange = () => { const b = biensListe.find((x) => x.id === selB.value); if (b) $('#contrat-bien-libelle').value = b.libelle; };
  const selC = $('#contrat-client'); selC.replaceChildren(new Option('— saisir à la main —', ''));
  for (const t of locationTiers) selC.add(new Option(t.nom, t.id));
  selC.value = c?.tiers_id || '';
  selC.onchange = () => { const t = locationTiers.find((x) => x.id === selC.value); if (t) $('#contrat-client-nom').value = t.nom; };
  $('#contrat-bien-libelle').value = c?.bien_libelle || '';
  $('#contrat-client-nom').value = c?.client_nom || '';
  $('#contrat-debut').value = c?.date_debut || new Date().toISOString().slice(0, 10);
  $('#contrat-fin').value = c?.date_fin || '';
  $('#contrat-loyer').value = c ? (c.loyer_centimes / 100).toFixed(2).replace('.', ',') : '';
  $('#contrat-periode').value = c?.periode || 'mois';
  $('#contrat-statut').value = c?.statut || 'en_cours';
  $('#contrat-bien').focus();
}
function fermerFormContrat() { contratEnEdition = null; $('#contrat-form').classList.add('hidden'); }
async function supprimerContrat(c) {
  if (!confirm('Supprimer ce contrat ?')) return;
  const { error } = await sb.from('contrat_location').delete().eq('id', c.id);
  if (error) { alert(error.message); return; } await chargerLocation();
}
async function soumettreContrat(ev) {
  ev.preventDefault();
  const bienLib = $('#contrat-bien-libelle').value.trim(), clientNom = $('#contrat-client-nom').value.trim();
  if (!bienLib || !clientNom) { alert('Le bien et le client sont obligatoires.'); return; }
  if (!$('#contrat-debut').value) { alert('La date de début est obligatoire.'); return; }
  const loyer = eurosEnCentimes($('#contrat-loyer').value);
  if (loyer === null) { alert('Loyer invalide (ex. 750,00).'); return; }
  const row = {
    societe_id: selectedSociete, bien_id: $('#contrat-bien').value || null, bien_libelle: bienLib,
    tiers_id: $('#contrat-client').value || null, client_nom: clientNom,
    date_debut: $('#contrat-debut').value, date_fin: $('#contrat-fin').value || null,
    loyer_centimes: loyer, periode: $('#contrat-periode').value, statut: $('#contrat-statut').value,
  };
  const { error } = contratEnEdition ? await sb.from('contrat_location').update(row).eq('id', contratEnEdition.id) : await sb.from('contrat_location').insert(row);
  if (error) { alert(error.message); return; }   // ex. fin avant début
  fermerFormContrat(); await chargerLocation();
}

$('#bien-nouveau').addEventListener('click', () => ouvrirFormBien(null));
$('#bien-form').addEventListener('submit', soumettreBien);
$('#bien-annuler').addEventListener('click', fermerFormBien);
$('#contrat-nouveau').addEventListener('click', () => ouvrirFormContrat(null));
$('#contrat-form').addEventListener('submit', soumettreContrat);
$('#contrat-annuler').addEventListener('click', fermerFormContrat);

// === MODULE FOURNISSEURS (catégorie Achats) ===
let fournisseurs = [], fournisseurEnEdition = null;

async function chargerFournisseurs() {
  if (!selectedSociete) return;
  const { data, error } = await sb.from('fournisseur')
    .select('id, nom, siren, siret, email, telephone, adresse, code_postal, ville, notes, actif')
    .eq('societe_id', selectedSociete).order('nom');
  if (error) { $('#fournisseurs-liste').replaceChildren(elt('p', 'aide', `Lecture impossible : ${error.message}`)); return; }
  fournisseurs = data || [];
  renderFournisseurs();
}

function renderFournisseurs() {
  const peut = superAdmin || ['admin', 'gestion'].includes(monRole);
  $('#fournisseur-nouveau').classList.toggle('hidden', !peut);
  const carte = (c) => {
    const art = elt('article', 'client-carte');
    const tete = elt('div', 'client-tete');
    tete.append(elt('strong', null, c.nom), elt('span', 'aide', c.siren ? `SIREN ${c.siren}` : ''));
    art.append(tete);
    const infos = [[c.code_postal, c.ville].filter(Boolean).join(' '), c.telephone, c.email].filter(Boolean);
    if (infos.length) art.append(elt('p', 'client-infos', infos.join(' — ')));
    if (peut) {
      const actions = elt('div', 'org-actions');
      actions.append(boutonModule('Modifier', 'secondary', () => ouvrirFormFournisseur(c)),
        c.actif ? boutonModule('Désactiver', 'danger', () => majFournisseur(c, { actif: false }))
                : boutonModule('Réactiver', 'secondary', () => majFournisseur(c, { actif: true })));
      art.append(actions);
    }
    return art;
  };
  const actifs = fournisseurs.filter((c) => c.actif), inactifs = fournisseurs.filter((c) => !c.actif);
  const enfants = actifs.length ? actifs.map(carte) : [elt('p', 'aide', 'Aucun fournisseur pour l’instant.')];
  if (inactifs.length) enfants.push(elt('h4', null, 'Désactivés'), ...inactifs.map(carte));
  $('#fournisseurs-liste').replaceChildren(...enfants);
}

function ouvrirFormFournisseur(c) {
  fournisseurEnEdition = c || null;
  const f = $('#fournisseur-form'); f.reset();
  $('#fournisseur-form-titre').textContent = c ? 'Modifier le fournisseur' : 'Nouveau fournisseur';
  for (const [id, cle] of [['fournisseur-nom', 'nom'], ['fournisseur-siren', 'siren'], ['fournisseur-siret', 'siret'], ['fournisseur-email', 'email'],
    ['fournisseur-tel', 'telephone'], ['fournisseur-adresse', 'adresse'], ['fournisseur-cp', 'code_postal'], ['fournisseur-ville', 'ville'], ['fournisseur-notes', 'notes']]) {
    $(`#${id}`).value = c?.[cle] || '';
  }
  f.classList.remove('hidden');
  $('#fournisseur-nom').focus();
}

function fermerFormFournisseur() { fournisseurEnEdition = null; $('#fournisseur-form').classList.add('hidden'); }

async function majFournisseur(c, champs) {
  const { error } = await sb.from('fournisseur').update(champs).eq('id', c.id);
  if (error) { alert(error.message); return; }
  await chargerFournisseurs();
}

async function soumettreFournisseur(ev) {
  ev.preventDefault();
  const nom = $('#fournisseur-nom').value.trim();
  if (!nom) { alert('Le nom est obligatoire.'); return; }
  const controles = [
    ['SIREN', $('#fournisseur-siren').value, normaliserSiren],
    ['SIRET', $('#fournisseur-siret').value, normaliserSiret],
    ['e-mail', $('#fournisseur-email').value, normaliserEmail],
    ['téléphone', $('#fournisseur-tel').value, normaliserTelFr],
  ];
  const v = {};
  for (const [nomChamp, brut, normaliser] of controles) {
    if (!champOuNull(brut)) { v[nomChamp] = null; continue; }
    const r = normaliser(brut);
    if (r === null) { alert(`${nomChamp} invalide.`); return; }
    v[nomChamp] = r;
  }
  const row = {
    societe_id: selectedSociete, nom,
    siren: v.SIREN, siret: v.SIRET, email: v['e-mail'], telephone: v['téléphone'],
    adresse: champOuNull($('#fournisseur-adresse').value), code_postal: champOuNull($('#fournisseur-cp').value),
    ville: champOuNull($('#fournisseur-ville').value), notes: champOuNull($('#fournisseur-notes').value),
  };
  const { error } = fournisseurEnEdition
    ? await sb.from('fournisseur').update(row).eq('id', fournisseurEnEdition.id)
    : await sb.from('fournisseur').insert(row);
  if (error) { alert(error.message); return; }
  fermerFormFournisseur();
  await chargerFournisseurs();
}

$('#fournisseur-nouveau').addEventListener('click', () => ouvrirFormFournisseur(null));
$('#fournisseur-form').addEventListener('submit', soumettreFournisseur);
$('#fournisseur-annuler').addEventListener('click', fermerFormFournisseur);

function carteModulePerso(m) {
  const carte = elt('article', 'module-carte');
  const siennes = portees.filter((p) => p.module_id === m.id);
  const nb = m.actif ? societes.filter((s) => enService(siennes, s)).length : 0;
  const tete = elt('div', 'module-tete');
  tete.append(iconeModule(m), elt('strong', null, m.nom),
    pastille(!m.actif ? 'Désactivé' : nb ? `${nb} société${nb > 1 ? 's' : ''}` : 'Non attribué', m.actif && nb ? 'ok' : 'alerte'));
  const actions = elt('div', 'module-actions');
  actions.append(boutonModule('Modifier', 'secondary', () => ouvrirEditeurModule(m)),
    m.actif ? boutonModule('Désactiver', 'danger', () => activerModulePerso(m, false))
      : boutonModule('Réactiver', 'secondary', () => activerModulePerso(m, true)));
  const details = elt('details');
  details.append(elt('summary', null, 'Attribuer aux holdings et sociétés'), porteeModule(m, siennes));
  carte.append(tete, elt('p', 'aide', `${m.champs.length} champ${m.champs.length > 1 ? 's' : ''} · version ${m.version} · ${m.finalite}`), actions, details);
  return carte;
}

function iconeModule(m) {
  const i = elt('span', 'module-icone');
  i.dataset.ico = m.icone;
  i.style.setProperty('--teinte', m.couleur);
  i.setAttribute('aria-hidden', 'true');
  return i;
}

// Holding : oui / non. Société : suit sa holding, ou son propre réglage.
function porteeModule(m, siennes) {
  const boite = elt('div', 'module-portee');
  const choix = (nom, options, valeur, envoyer) => {
    const l = elt('label', 'module-portee-ligne');
    const sel = elt('select');
    for (const [v, texte] of options) sel.add(new Option(texte, v, false, v === valeur));
    sel.addEventListener('change', () => envoyer(sel.value === '' ? null : sel.value === 'oui'));
    l.append(elt('span', null, nom), sel);
    return l;
  };
  // Où le module sert : seulement quand la ligne est activée.
  const supports = (p, holding, societe, titre) => {
    const f = elt('fieldset', 'module-supports');
    f.setAttribute('aria-label', `Où sert ce module : ${titre}`);
    for (const [cle, nom] of SUPPORTS) {
      const l = elt('label'), c = elt('input');
      c.type = 'checkbox';
      c.checked = p.supports.includes(cle);
      c.addEventListener('change', () => {
        const choisis = [...f.querySelectorAll('input')].flatMap((x, i) => (x.checked ? [SUPPORTS[i][0]] : []));
        if (!choisis.length) { c.checked = true; return alert('Gardez au moins un endroit, ou coupez le module.'); }
        attribuerModule(m, holding, societe, true, choisis);
      });
      l.append(c, document.createTextNode(nom));
      f.append(l);
    }
    boite.append(f);
  };
  const lire = (p) => (p ? (p.actif ? 'oui' : 'non') : '');
  const groupe = (titre, liste, holdingId) => {
    if (titre) boite.append(choix(titre, [['', 'Non attribué'], ['oui', 'Toute la holding']],
      siennes.some((p) => p.holding_id === holdingId && p.actif) ? 'oui' : '', (actif) => attribuerModule(m, holdingId, null, actif)));
    const deHolding = titre && siennes.find((p) => p.holding_id === holdingId && p.actif);
    if (deHolding) supports(deHolding, holdingId, null, titre);
    for (const s of liste) {
      const l = choix(s.nom, [['', titre ? 'Comme la holding' : 'Non attribué'], ['oui', 'Activé'], ...(titre ? [['non', 'Coupé']] : [])],
        lire(siennes.find((p) => p.societe_id === s.id && (titre || p.actif))), (actif) => attribuerModule(m, null, s.id, actif));
      if (titre) l.classList.add('sous-holding');
      boite.append(l);
      const sienne = siennes.find((p) => p.societe_id === s.id && p.actif);
      if (sienne) supports(sienne, null, s.id, s.nom);
    }
  };
  for (const h of holdings) groupe(`${h.nom} (holding)`, societes.filter((s) => s.holding_id === h.id), h.id);
  groupe(null, societes.filter((s) => !s.holding_id));
  return boite;
}

const SUPPORTS = [['apk', 'APK Android'], ['iphone', 'iPhone'], ['bureau', 'Back-office']];

// --- Tuiles d'origine de l'APK : visibles ou cachées, par holding puis société ---
let tuilesReglages = [];

async function chargerTuilesApk() {
  const { data, error } = await sb.from('tuiles_reglages').select('tuile, holding_id, societe_id, visible');
  $('#tuiles-section').classList.toggle('hidden', !!error);   // base pas encore à jour
  if (error) return console.error(error);
  tuilesReglages = data;
  const cible = $('#tuiles-cible'), avant = cible.value;
  cible.replaceChildren(...holdings.map((h) => new Option(`${h.nom} (holding)`, `h:${h.id}`)), ...societes.map((s) => new Option(s.nom, `s:${s.id}`)));
  cible.value = avant || `s:${selectedSociete}`;
  if (!cible.value) cible.selectedIndex = 0;
  renderTuilesApk();
}

function renderTuilesApk() {
  const [genre, id] = [$('#tuiles-cible').value.slice(0, 1), $('#tuiles-cible').value.slice(2)];
  const h = genre === 'h' ? id : null, s = genre === 's' ? id : null;
  const societe = s ? societes.find((x) => x.id === s) : { id: null, holding_id: h };
  $('#tuiles-liste').replaceChildren(...TUILES_APK.map(([tuile, nom]) => {
    const l = elt('label', 'module-portee-ligne'), sel = elt('select');
    const sien = tuilesReglages.find((r) => r.tuile === tuile && (s ? r.societe_id === s : r.holding_id === h));
    const commun = tuileVisible(tuilesReglages.filter((r) => !s || r.societe_id !== s), tuile, s ? societe : { id: null });
    sel.add(new Option(s && societe?.holding_id ? `Comme la holding (${commun ? 'visible' : 'cachée'})` : 'Visible (par défaut)', ''));
    sel.add(new Option('Visible', 'oui'));
    sel.add(new Option('Cachée', 'non'));
    sel.value = sien ? (sien.visible ? 'oui' : 'non') : '';
    sel.addEventListener('change', async () => {
      const { error } = await sb.rpc('regler_tuile', { p_tuile: tuile, p_holding: h, p_societe: s, p_visible: sel.value === '' ? null : sel.value === 'oui' });
      if (error) alert(error.message);
      chargerTuilesApk();
    });
    l.append(elt('span', null, nom), sel);
    return l;
  }));
}
$('#tuiles-cible').addEventListener('change', renderTuilesApk);

async function attribuerModule(m, holding, societe, actif, supports = null) {
  const { error } = await sb.rpc('attribuer_module_perso', { id_module: m.id, p_holding: holding, p_societe: societe, p_actif: actif, p_supports: supports });
  if (error) alert(error.message);
  await chargerModules();
}

async function activerModulePerso(m, actif) {
  if (!actif && !doubleValidation(`Désactiver « ${m.nom} » partout ? Rien n'est effacé, il pourra être réactivé.`, 'DÉSACTIVER')) return;
  const { error } = await sb.rpc('activer_module_perso', { id_module: m.id, p_actif: actif });
  if (error) return alert(error.message);
  await chargerModules();
}

function fermerEditeurModule() {
  moduleEdite = null;
  $('#module-editeur').classList.add('hidden');
  $('#modules-vue').classList.remove('hidden');
}

function ouvrirEditeurModule(m) {
  moduleEdite = m;
  champsEdites = m ? m.champs.map((c) => ({ ...c, choix: [...(c.choix || [])] })) : [];
  $('#module-editeur-titre').textContent = m ? `Modifier « ${m.nom} »` : 'Nouveau module';
  $('#module-nom').value = m?.nom || '';
  $('#module-icone').value = m?.icone || 'outil';
  $('#module-couleur').value = m?.couleur || '#e6001c';
  $('#module-finalite').value = m?.finalite || '';
  $('#module-conservation').value = m?.conservation_mois || 24;
  $('#modules-vue').classList.add('hidden');
  $('#module-editeur').classList.remove('hidden');
  renderChampsModule();
}

function renderChampsModule() {
  $('#module-champs').replaceChildren(...champsEdites.map((c, i) => {
    const li = elt('li', 'module-champ');
    const nom = elt('input');
    nom.value = c.libelle;
    nom.maxLength = 60;
    nom.placeholder = 'Nom du champ';
    nom.setAttribute('aria-label', `Nom du champ ${i + 1}`);
    nom.addEventListener('input', () => { c.libelle = nom.value; apercuModule(); });
    const type = elt('select');
    type.setAttribute('aria-label', `Type du champ ${i + 1}`);
    for (const [v, texte] of Object.entries(TYPES_CHAMP)) type.add(new Option(texte, v, false, v === c.type));
    type.disabled = !!c.cle;   // déjà enregistré : son type ne change plus, sinon les saisies deviendraient illisibles
    if (c.cle) type.title = 'Le type d\'un champ enregistré ne change plus : créez un nouveau champ.';
    type.addEventListener('change', () => { c.type = type.value; renderChampsModule(); });
    const obl = elt('label', 'module-obligatoire');
    const coche = elt('input');
    coche.type = 'checkbox';
    coche.checked = c.obligatoire;
    coche.addEventListener('change', () => { c.obligatoire = coche.checked; apercuModule(); });
    obl.append(coche, 'Obligatoire');
    const bouger = (d) => { [champsEdites[i], champsEdites[i + d]] = [champsEdites[i + d], champsEdites[i]]; renderChampsModule(); };
    const haut = boutonModule('↑', 'secondary', () => bouger(-1)), bas = boutonModule('↓', 'secondary', () => bouger(1));
    haut.disabled = i === 0;
    bas.disabled = i === champsEdites.length - 1;
    haut.setAttribute('aria-label', `Monter le champ ${i + 1}`);
    bas.setAttribute('aria-label', `Descendre le champ ${i + 1}`);
    const retirer = boutonModule('Retirer', 'danger', () => { champsEdites.splice(i, 1); renderChampsModule(); });
    const outils = elt('div', 'module-champ-outils');
    outils.append(obl, haut, bas, retirer);
    li.append(nom, type, outils);
    if (c.type === 'liste') {
      const choix = elt('textarea');
      choix.rows = 3;
      choix.value = c.choix.join('\n');
      choix.placeholder = 'Un choix par ligne';
      choix.setAttribute('aria-label', `Choix du champ ${i + 1}, un par ligne`);
      choix.addEventListener('input', () => { c.choix = choix.value.split('\n').map((x) => x.trim()).filter(Boolean); apercuModule(); });
      li.append(choix);
    }
    return li;
  }));
  apercuModule();
}

// Aperçu : l'écran tel que l'APK l'affichera (aucun téléphone ne le reçoit à ce stade).
function apercuModule() {
  const ecran = $('#module-apercu');
  const tete = elt('div', 'apercu-tete');
  tete.append(iconeModule({ icone: $('#module-icone').value, couleur: $('#module-couleur').value }), elt('span', null, $('#module-nom').value || 'Nom du module'));
  ecran.style.setProperty('--teinte', $('#module-couleur').value);
  const indice = { texte: 'Saisir…', nombre: '0', date: 'jj/mm/aaaa', photo: 'Prendre une photo', signature: 'Signer ici' };
  ecran.replaceChildren(tete, ...champsEdites.map((c) => {
    const d = elt('div', `apercu-champ ${c.type}`);
    d.append(elt('span', 'apercu-libelle', `${c.libelle || 'Champ sans nom'}${c.obligatoire ? ' *' : ''}`));
    if (c.type === 'liste') d.append(...(c.choix.length ? c.choix : ['Choix']).map((x) => elt('span', 'apercu-choix', x)));
    else d.append(elt('span', 'apercu-zone', indice[c.type] || ''));
    return d;
  }), elt('span', 'apercu-bouton', 'Enregistrer'));
}

$('#module-nouveau').addEventListener('click', () => ouvrirEditeurModule(null));
$('#module-annuler').addEventListener('click', fermerEditeurModule);
$('#module-champ-ajouter').addEventListener('click', () => {
  champsEdites.push({ cle: null, libelle: '', type: 'texte', obligatoire: false, choix: [] });
  renderChampsModule();
  $('#module-champs li:last-child input').focus();
});
for (const id of ['#module-nom', '#module-icone', '#module-couleur']) $(id).addEventListener('input', apercuModule);
for (const [v, texte] of Object.entries(ICONES_MODULE)) $('#module-icone').add(new Option(texte, v));

$('#module-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saisie = { nom: $('#module-nom').value, finalite: $('#module-finalite').value, conservation: Number($('#module-conservation').value), champs: champsEdites };
  const defaut = defautModule(saisie);
  if (defaut) return alert(defaut);
  const prises = [...(moduleEdite?.cles || [])];
  const champs = champsEdites.map((c) => {
    const cle = c.cle || cleChamp(c.libelle, prises);
    prises.push(cle);
    return { cle, libelle: c.libelle.trim(), type: c.type, obligatoire: c.obligatoire, ...(c.type === 'liste' ? { choix: c.choix } : {}) };
  });
  const { error } = await sb.rpc('enregistrer_module_perso', { id_module: moduleEdite?.id ?? null, p_nom: saisie.nom,
    p_icone: $('#module-icone').value, p_couleur: $('#module-couleur').value, p_finalite: saisie.finalite, p_conservation: saisie.conservation, p_champs: champs });
  if (error) return alert(error.message);
  await chargerModules();
});

// === DOCUMENTS D'EMBAUCHE (onglet Papiers) ===
const ETATS_DOCUMENT = { recu: ['Reçu', 'ok'], bientot: ['Expire bientôt', 'alerte'], expire: ['Expiré', 'danger'],
  manquant: ['Manquant', 'danger'], facultatif: ['Facultatif', 'neutre'] };

async function chargerDocuments(t) {
  $('#documents-liste').replaceChildren();
  $('#documents-bilan').textContent = '';
  const [types, regles, remises] = await Promise.all([
    sb.from('documents_types').select('code, libelle, aide, acces, copie, expire, rappel_mois, exige').order('ordre'),
    sb.from('documents_regles').select('type, holding_id, societe_id, exige'),
    sb.from('documents_tech').select('id, type, vu_le, expire_le, fichier, ecarte, cree_le').eq('technicien_id', t.id),
  ]);
  const erreur = types.error || regles.error || remises.error;
  if (erreur) return alert(erreur.message);
  if (ficheTechnicien !== t) return;
  const societe = societes.find((s) => s.id === selectedSociete) || { id: selectedSociete };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const vus = types.data.filter((k) => k.acces === 'paie' || voitPermis())
    .map((k) => ({ k, ...etatDocument(k, exigence(k, regles.data, societe), remises.data, aujourdhui), exige: exigence(k, regles.data, societe) }))
    .filter((x) => x.exige !== 'non_demande' || x.remise);
  const obligatoires = vus.filter((x) => x.exige === 'obligatoire');
  const bons = obligatoires.filter((x) => ['recu', 'bientot'].includes(x.etat)).length;
  $('#documents-bilan').textContent = `${bons} sur ${obligatoires.length} documents obligatoires à jour.`;
  $('#documents-liste').replaceChildren(...vus.map((x) => ligneDocument(t, x)));
}

function ligneDocument(t, { k, etat, remise }) {
  const li = elt('li', 'document-ligne');
  const nom = elt('div', 'document-nom');
  nom.append(elt('strong', null, k.libelle));
  if (k.aide) nom.append(elt('span', 'aide', k.aide));
  if (remise) {
    const limite = limiteDocument(k, remise);
    nom.append(elt('span', 'aide', `${k.copie ? 'Reçu' : 'Vu'} le ${formaterDate(remise.vu_le)}${limite ? ` · ${k.rappel_mois ? 'à revérifier' : 'expire'} le ${formaterDate(limite)}` : ''}`));
  }
  const actions = elt('div', 'document-actions');
  if (remise?.fichier) {
    const voir = boutonModule('Ouvrir', 'secondary voir', async () => {
      const { data, error } = await sb.storage.from('identite').createSignedUrl(remise.fichier, 120);
      if (error) return alert(error.message);
      window.open(data.signedUrl, '_blank', 'noopener');
    });
    actions.append(voir);
  }
  if (peutEcrire()) {
    actions.append(boutonModule(k.copie ? (remise ? 'Renouveler' : 'Ajouter') : 'Vu aujourd’hui', 'secondary', () => ajouterDocument(t, k, li)));
    if (remise) actions.append(boutonModule('Écarter', 'danger', () => ecarterDocument(t, k, remise)));
  }
  const [texte, ton] = ETATS_DOCUMENT[etat];
  li.append(nom, pastille(etat === 'recu' && !k.copie ? 'Vu' : texte, ton), actions);
  return li;
}

async function ecarterDocument(t, k, remise) {
  if (!confirm(`Écarter « ${k.libelle} » ? Il sera masqué, pas effacé. À utiliser pour une erreur.`)) return;
  const { error } = await sb.from('documents_tech').update({ ecarte: true }).eq('id', remise.id);
  if (error) return alert(error.message);
  await chargerDocuments(t);
}

// Document sans copie : une date suffit. Sinon photo ou PDF, et l'expiration si le document en a une.
function ajouterDocument(t, k, li) {
  li.querySelector('form')?.remove();
  const form = elt('form', 'document-form');
  const champ = (libelle, type) => {
    const l = elt('label', 'field', libelle), i = elt('input');
    i.type = type;
    l.append(i);
    form.append(l);
    return i;
  };
  const vu = champ(k.copie ? 'Reçu le' : 'Vu le', 'date');
  vu.value = new Date().toISOString().slice(0, 10);
  vu.required = true;
  const fichier = k.copie ? champ('Photo ou PDF', 'file') : null;
  if (fichier) { fichier.accept = 'application/pdf,image/jpeg,image/png'; fichier.required = true; }
  const expire = k.expire ? champ('Expire le', 'date') : null;
  const envoyer = elt('button', null, 'Enregistrer');
  form.append(envoyer, boutonModule('Annuler', 'secondary', () => form.remove()));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = fichier?.files[0];
    if (f && !extensionScan(f)) return alert('Copie acceptée : PDF, JPEG ou PNG.');
    if (f && f.size > 10 * 1024 * 1024) return alert('Fichier trop lourd : 10 Mo au plus.');
    envoyer.disabled = true;
    try {
      let chemin = null;
      if (f) {
        chemin = `${selectedSociete}/${k.acces}/${t.id}_${k.code}_${Date.now()}.${extensionScan(f)}`;
        const { error } = await sb.storage.from('identite').upload(chemin, f, { contentType: f.type });
        if (error) throw error;
      }
      const { error } = await sb.from('documents_tech').insert({ societe_id: selectedSociete, technicien_id: t.id, type: k.code,
        vu_le: vu.value, expire_le: expire?.value || null, fichier: chemin });
      if (error) throw error;
      await chargerDocuments(t);
    } catch (err) {
      alert(err.message || 'Erreur lors de l\'enregistrement du document');
      envoyer.disabled = false;
    }
  });
  li.append(form);
}

// Réglage (onglet Modules, super admin) : ce qui est demandé, par holding ou par société.
async function chargerReglesDocuments() {
  const societe = societes.find((s) => s.id === selectedSociete);
  const holding = holdings.find((h) => h.id === societe?.holding_id);
  const cible = $('#documents-cible'), garde = cible.value;
  cible.replaceChildren(new Option(societe?.nom || 'La société', 'societe'), ...(holding ? [new Option(`${holding.nom} (holding)`, 'holding')] : []));
  if (garde === 'holding' && holding) cible.value = garde;
  const [types, regles] = await Promise.all([
    sb.from('documents_types').select('code, libelle, exige').order('ordre'),
    sb.from('documents_regles').select('type, holding_id, societe_id, exige'),
  ]);
  if (types.error || regles.error) return alert((types.error || regles.error).message);
  const surHolding = cible.value === 'holding';
  const MOTS = { obligatoire: 'Obligatoire', facultatif: 'Facultatif', non_demande: 'Non demandé' };
  $('#documents-regles').replaceChildren(...types.data.map((k) => {
    const sien = regles.data.find((r) => r.type === k.code && (surHolding ? r.holding_id === holding.id : r.societe_id === selectedSociete));
    const sans = exigence(k, regles.data.filter((r) => r !== sien), { id: null, holding_id: surHolding ? null : holding?.id });
    const l = elt('label', 'module-portee-ligne');
    const sel = elt('select');
    sel.add(new Option(`Par défaut (${MOTS[sans].toLowerCase()})`, '', false, !sien));
    for (const [v, texte] of Object.entries(MOTS)) sel.add(new Option(texte, v, false, sien?.exige === v));
    sel.addEventListener('change', async () => {
      const { error } = await sb.rpc('regler_document', { p_type: k.code, p_holding: surHolding ? holding.id : null,
        p_societe: surHolding ? null : selectedSociete, p_exige: sel.value || null });
      if (error) alert(error.message);
      await chargerReglesDocuments();
    });
    l.append(elt('span', null, k.libelle), sel);
    return l;
  }));
}
$('#documents-cible').addEventListener('change', chargerReglesDocuments);

// === TÉLÉPHONE DU TECHNICIEN ===
// Mail et code de secours : admin. Couper : admin et gestion. La base refuse le reste.
const gereMail = () => superAdmin || monRole === 'admin';
const instant = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais');

async function chargerTelephones(t) {
  $('#tech-onglet-telephone').classList.toggle('hidden', !voitPermis());
  $('#telephone-code').textContent = '';
  $('#telephone-liste').replaceChildren();
  if (!voitPermis()) return;
  $('#telephone-mail-form').classList.toggle('hidden', !gereMail());
  const [mail, tels] = await Promise.all([
    sb.from('techniciens_mail').select('mail').eq('technicien_id', t.id).maybeSingle(),
    sb.from('telephones').select('id, appareil, cree_le, vu_le, envoi_le, coupe_le, coupe_motif').eq('technicien_id', t.id).order('cree_le', { ascending: false }),
  ]);
  if (ficheTechnicien !== t) return;
  if (mail.error || tels.error) return alert((mail.error || tels.error).message);
  const adresse = mail.data?.mail || '';
  $('#telephone-mail-affiche').textContent = adresse || 'non enregistrée';
  $('#telephone-mail').value = adresse;
  const actif = tels.data.find((x) => !x.coupe_le);
  $('#telephone-couper').classList.toggle('hidden', !actif || !peutEcrire());
  $('#telephone-secours').classList.toggle('hidden', !adresse || !gereMail());
  $('#telephone-liste').replaceChildren(...(tels.data.length ? tels.data.map((x) => {
    const li = elt('li', 'document-ligne'), nom = elt('div', 'document-nom');
    nom.append(elt('strong', null, x.appareil || 'Téléphone'), elt('span', 'aide', x.coupe_le
      ? `Connecté le ${instant(x.cree_le)} · coupé le ${instant(x.coupe_le)} (${x.coupe_motif === 'remplace' ? 'remplacé par un autre' : 'par le bureau'})`
      : `Connecté le ${instant(x.cree_le)} · vu le ${instant(x.vu_le)} · dernier envoi complet : ${instant(x.envoi_le)}`));
    li.append(nom, pastille(x.coupe_le ? 'Déconnecté' : 'Actif', x.coupe_le ? 'neutre' : 'ok'));
    return li;
  }) : [elt('li', 'aide', 'Aucun téléphone connecté pour l’instant.')]));
}

$('#telephone-mail-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = ficheTechnicien;
  if (!t) return;
  const { error } = await sb.rpc('telephone_regler_mail', { tech: t.id, p_mail: $('#telephone-mail').value });
  if (error) return alert(/unique|duplicate/.test(error.message) ? 'Cette adresse est déjà celle d\'un autre technicien.' : error.message);
  await chargerTelephones(t);
});

$('#telephone-couper').addEventListener('click', async () => {
  const t = ficheTechnicien;
  if (!t || !doubleValidation(`Couper l'accès du téléphone de ${t.nom} ? Ses données restent ; seules les saisies pas encore envoyées manqueront tant qu'il n'est pas reconnecté.`, 'COUPER')) return;
  const { error } = await sb.rpc('telephone_couper', { tech: t.id });
  if (error) return alert(error.message);
  await chargerTelephones(t);
});

$('#telephone-secours').addEventListener('click', async () => {
  const t = ficheTechnicien;
  if (!t || !confirm(`Créer un code de secours pour ${t.nom} ? Vérifiez d'abord que c'est bien la bonne personne.`)) return;
  const { data, error } = await sb.rpc('telephone_code_bureau', { tech: t.id });
  if (error) return alert(error.message);
  if (ficheTechnicien !== t) return;
  $('#telephone-code').textContent = `Code : ${data.slice(0, 4)} ${data.slice(4)} — valable 15 minutes, une seule fois. À utiliser avec son adresse mail.`;
});
