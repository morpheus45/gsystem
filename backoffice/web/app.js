import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';
import { alertes, kmMoyenParMois, CT_VOITURE, kmParMois, conducteurA, limiteDesignation, ANTAI, statutPhoto } from '../core/vehicules.js';
import { heuresJour, cumulSemaines, semaineIso } from '../core/heures.js';
import { ligneFrais, totauxFrais } from '../core/frais.js';
import { reglesDe } from '../core/societes.js';
import { repartition } from '../core/stats.js';
import { primesDuMois, moisDesPrimes } from '../core/primes.js';
import { finProposee, lendemain } from '../core/periodes.js';
import { variablesPaie, versCsv } from '../core/paie.js';

const sb = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE);

let session = null;
let societes = [];
let selectedSociete = null;
let superAdmin = false;   // opérateur de la plateforme : accès à tout (vérifié par la base)
let monRole = null;       // rôle de l'utilisateur dans la société sélectionnée
let vehiculeActif = null; // véhicule ouvert dans le panneau de détail
let techniciens = [];     // cache de la société courante (pour les select)
let ficheTechnicien = null; // technicien ouvert dans la fiche (null = fermée)

// Peut-on écrire dans la société courante ? La base refuse de toute façon le reste.
function peutEcrire() {
  return superAdmin || ['admin', 'gestion'].includes(monRole);
}

const $ = (sel) => document.querySelector(sel);
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
    compte('echeances').not('date', 'is', null).lte('date', dansJours(30)),
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
}

function initialiserSousOnglets(conteneur) {
  const premier = conteneur.querySelector(':scope > .sous-onglets button');
  if (premier) afficherSousOnglet(conteneur, premier.dataset.cible);
}

function mettreAJourFil() {
  // Dans une fiche, un seul retour : « ← Techniciens » / « ← Véhicules » (le fil d'Ariane fait le reste).
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
  $('#societe-detail').classList.add('hidden');
  $('#niveau-societes').classList.remove('hidden');
  renderSocietes();
  mettreAJourFil();
}

// Basculer d'onglet
function switchOnglet(tabId) {
  $$('.tab').forEach(b => {
    const actif = `panel-${b.dataset.tab}` === tabId;   // data-tab="vehicules" -> #panel-vehicules
    b.classList.toggle('active', actif);
    b.setAttribute('aria-selected', String(actif));
  });
  for (const id of ['panel-membres', 'panel-techniciens', 'panel-vehicules', 'panel-paie', 'panel-conges']) {
    $(`#${id}`).classList.toggle('hidden', id !== tabId);
  }
  fermerPanneauVehicule();
  fermerFicheTechnicien();
  if (tabId === 'panel-paie') chargerPaie();
  if (tabId === 'panel-conges') chargerConges();
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
  } catch (err) {
    console.error(err);
  }
}

async function loadSocietes() {
  try {
    const { data, error } = await sb.from('societes').select('id, nom').order('nom');
    if (error) throw error;
    societes = data;
    renderSocietes();
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
  societes.forEach(s => {
    const li = document.createElement('li');
    li.className = 'societe-item';
    if (selectedSociete === s.id) li.classList.add('selected');
    li.appendChild(document.createElement('div')).textContent = s.nom;
    li.firstChild.className = 'societe-name';
    li.addEventListener('click', () => selectSociete(s.id));
    ul.appendChild(li);
    tachesSociete(s.id).then((t) => marquer(li, t.conges + t.vehicules + t.paie > 0));
  });
}

async function selectSociete(id) {
  selectedSociete = id;
  renderSocietes();
  fermerFicheTechnicien();
  await loadSocieteDetail(id);
}

async function loadSocieteDetail(societeId) {
  try {
    const { data: members, error } = await sb.rpc('membres_de', { s: societeId });
    if (error) throw error;
    const societe = societes.find(s => s.id === societeId);
    $('#societe-detail-title').textContent = societe?.nom || 'Société';

    // Un seul panneau visible : on repart sur Membres à chaque société.
    switchOnglet('panel-membres');

    renderMembers(members);
    monRole = members.find(m => m.user_id === session.user.id)?.role || null;
    for (const f of ['#technicien-form', '#vehicule-form', '#affectation-form', '#releve-form', '#echeance-form', '#entretien-form', '#amende-form', '#conge-form']) {
      const form = $(f);
      (form.closest('details') || form).classList.toggle('hidden', !peutEcrire());
    }
    // Lecture seule : les boutons d'action des tableaux sont masqués (CSS).
    document.body.classList.toggle('lecture-seule', !peutEcrire());
    if (superAdmin || monRole === 'admin') {
      $('#admin-tools').classList.remove('hidden');
      await loadInvitations(societeId);
    } else {
      $('#admin-tools').classList.add('hidden');
    }

    // Charger les données des onglets Techniciens et Véhicules (elles resteront masquées)
    // Techniciens d'abord : la liste des véhicules affiche le nom du conducteur.
    await loadTechniciens(societeId);
    compterCongesAValider();
    await loadVehicules(societeId);

    $('#niveau-societes').classList.add('hidden');
    $('#societe-detail').classList.remove('hidden');
    mettreAJourFil();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement');
  }
}

function renderMembers(members) {
  const tbody = $('#membres-table tbody');
  tbody.replaceChildren(...members.map(m => ligne([m.email, m.role, m.user_id === session.user.id ? '✓' : ''])));
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
    const { data, error } = await sb.from('techniciens').select('id, nom, actif').eq('societe_id', societeId).order('nom');
    if (error) throw error;
    techniciens = data;
    renderTechniciens(data);
    renderTechniciensActifs();
    renderTechniciensAmende();
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des techniciens');
  }
}

function renderTechniciens(list) {
  const tbody = $('#techniciens-table tbody');
  tbody.replaceChildren(...list.map(t => {
    const tr = ligne([t.nom, t.actif ? 'Oui' : 'Non']);
    tr.classList.add('ligne-cliquable');
    tr.addEventListener('click', () => ouvrirFicheTechnicien(t));
    const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
    b.className = t.actif ? 'danger' : 'secondary';
    b.textContent = t.actif ? 'Désactiver' : 'Activer';
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleTechnicien(t.id, t.actif); });
    const fleche = tr.appendChild(document.createElement('td'));
    fleche.className = 'fleche';
    fleche.setAttribute('aria-hidden', 'true');
    fleche.textContent = '›';
    return tr;
  }));
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
  $('#tech-fiche-titre').textContent = t.nom;
  initialiserSousOnglets($('#tech-fiche'));
  mettreAJourFil();
  // Charger les données de la fiche
  chargerFicheTechnicien(t);
}

// === VÉHICULES ===
async function loadVehicules(societeId) {
  try {
    const { data: vehicules, error } = await sb.from('vehicules').select('id, plaque, libelle').eq('societe_id', societeId).order('plaque');
    if (error) throw error;
    // Charger les affectations de cette société
    const { data: affectations, error: affectErr } = await sb.from('affectations').select('vehicule_id, technicien_id, debut, fin').eq('societe_id', societeId).order('debut', { ascending: false });
    if (affectErr) throw affectErr;
    renderVehicules(vehicules, affectations);
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des véhicules');
  }
}

function renderVehicules(list, affectations) {
  const tbody = $('#vehicules-table tbody');
  const aujourdhui = new Date().toISOString().slice(0, 10);
  tbody.replaceChildren(...list.map(v => {
    const affectationsV = affectations.filter(a => a.vehicule_id === v.id);
    const techId = conducteurA(affectationsV, aujourdhui);
    const tech = techniciens.find(t => t.id === techId);
    const nomTech = tech ? tech.nom : '—';
    const debut = affectationsV.find(a => a.debut <= aujourdhui && (!a.fin || a.fin >= aujourdhui))?.debut || '—';
    const tr = ligne([v.plaque, v.libelle || '', nomTech, debut]);
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
  $('#vehicule-detail-title').textContent = v.plaque;
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
    const { data, error } = await sb.from('releves_km').select('id, date, km, source, valide_par').eq('vehicule_id', vehiculeId).order('date');
    if (error) throw error;
    renderReleves(data);
    const valides = data.filter(r => r.valide_par);   // triés par date
    kmActuelGlobal = valides.length ? valides[valides.length - 1].km : null;
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des relevés');
  }
}

function renderReleves(list) {
  const tbody = $('#releves-table tbody');
  tbody.replaceChildren(...list.map(r => {
    const tr = ligne([r.date, String(r.km), r.source || '—', r.valide_par ? 'Oui' : 'Non']);
    if (!r.valide_par) {
      const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
      b.className = 'secondary';
      b.textContent = 'Valider';
      b.addEventListener('click', () => validerReleve(r.id));
    } else {
      tr.appendChild(document.createElement('td'));
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
    const { data, error } = await sb.from('echeances').select('id, type, date, km').eq('vehicule_id', vehiculeId).order('date');
    if (error) throw error;
    renderEcheances(data);
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des échéances');
  }
}

function renderEcheances(list) {
  const tbody = $('#echeances-table tbody');
  tbody.replaceChildren(...list.map(e => {
    const al = alertes([e], { aujourdhui: new Date().toISOString().slice(0, 10), kmActuel: kmActuelGlobal, joursAvant: 30, kmAvant: 1000 });
    const niveau = al[0]?.niveau;
    let label = '';
    let classe = '';
    if (niveau === 'depassee') { label = 'Dépassée'; classe = 'alerte-depassee'; }
    else if (niveau === 'proche') { label = 'Proche'; classe = 'alerte-proche'; }
    else if (niveau === 'km_inconnu') { label = 'Km inconnu'; }
    const tr = ligne([e.type, e.date || '—', e.km != null ? String(e.km) : '—', label]);
    const alertTd = tr.children[3];
    if (classe) alertTd.classList.add(classe);
    const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
    b.className = 'danger';
    b.textContent = 'Supprimer';
    b.addEventListener('click', () => deleteEcheance(e.id));
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
    const { data, error } = await sb.from('entretiens').select('id, date, type, km, garage, cout').eq('vehicule_id', vehiculeId).order('date', { ascending: false });
    if (error) throw error;
    renderEntretiens(data);
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
  totalEl.textContent = `Coût total : ${total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

const LIB_ENTRETIEN = {
  DISTRIBUTION: 'Distribution', PNEUS: 'Pneus', FREINS: 'Freins',
  VIDANGE: 'Vidange', REVISION: 'Révision', REPARATION: 'Réparation diverse', AUTRE: 'Autre'
};
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
      .select('periode, emplacement')
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
    renderPhotosCompteur(photos, new Map(copies.map((c) => [c.nom_drive, c.stockage])));
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

function renderPhotosCompteur(photos, stockages) {
  const tbody = $('#photos-compteur-table tbody');
  tbody.replaceChildren(...photos.map(p => {
    const [y, m] = p.periode.split('-');
    const fichier = (p.emplacement || '').replace(/^drive:/, '');
    const tr = ligne([`${m}/${y}`, fichier]);
    tr.appendChild(boutonPhoto(stockages.get(fichier)));
    return tr;
  }));
}

async function loadAmendes(vehiculeId) {
  try {
    const { data, error } = await sb.from('amendes')
      .select('id, numero_avis, date_avis, date_infraction, heure_infraction, lieu, motif, montant, statut, technicien_id, scan')
      .eq('vehicule_id', vehiculeId)
      .order('date_avis', { ascending: false });
    if (error) throw error;
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
    let limiteLabel = limite ? formaterDate(limite) : '—';
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
      limiteLabel,
      '',
      ''
    ]);
    if (classeLimite) tr.children[6].classList.add(classeLimite);
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
      sel.addEventListener('change', async () => {
        const newStatut = sel.value;
        const updates = { statut: newStatut };
        if (newStatut === 'designee') updates.designe_le = new Date().toISOString().slice(0, 10);
        const { error } = await sb.from('amendes').update(updates).eq('id', a.id);
        if (error) { alert(error.message); return; }
        await loadAmendes(vehiculeActif.id);
      });
      statutTd.appendChild(sel);
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
$('#technicien-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire()) return;
  const nom = $('#tech-nom').value.trim();
  if (!nom) return;
  try {
    const { error } = await sb.from('techniciens').insert({ societe_id: selectedSociete, nom });
    if (error) throw error;
    $('#technicien-form').reset();
    await loadTechniciens(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Formulaire Véhicules
$('#vehicule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  if (!peutEcrire()) return;
  const plaque = $('#veh-plaque').value.trim().toUpperCase();
  const libelle = $('#veh-libelle').value.trim();
  if (!plaque) return;
  try {
    const { error } = await sb.from('vehicules').insert({ societe_id: selectedSociete, plaque, libelle });
    if (error) throw error;
    $('#vehicule-form').reset();
    await loadVehicules(selectedSociete);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'ajout');
  }
});

// Fermeture panneau véhicule
$('#vehicule-detail-close').addEventListener('click', fermerPanneauVehicule);

// Fermeture fiche technicien
$('#tech-fiche-close').addEventListener('click', fermerFicheTechnicien);

const euros = (n) => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
// Lignes de la base -> format des règles testées (core/heures.js, core/frais.js).
const versHeures = (e) => ({ date: e.date, typeMission: e.type_mission, slotMidi: e.slot_midi, observationType: e.observation_type });
const versFrais = (f) => ({ categorie: f.categorie, montantEur: Number(f.montant_eur), sansTva: f.sans_tva });
let fiche = null;   // données du tech ouvert, chargées une fois : { t, interventions, frais, photos, regles, validations }

async function chargerFicheTechnicien(t) {
  try {
    $('#tech-info').textContent = "Données envoyées par l'APK, mises à jour automatiquement toutes les heures.";
    const lire = async (requete) => { const { data, error, count } = await requete; if (error) throw error; return count ?? data; };
    const [aff, interventions, frais, photos, regles, validations, listePhotos, gestes, tarifs] = await Promise.all([
      lire(sb.from('affectations').select('debut, vehicules(plaque)').eq('technicien_id', t.id).is('fin', null).order('debut', { ascending: false }).limit(1)),
      lire(sb.from('temps').select('date, slot_midi, type_mission, observation_type, ville, departement, numero_intervention, heure_debut, heure_fin').eq('technicien_id', t.id).order('date')),
      lire(sb.from('frais').select('date, categorie, montant_eur, sans_tva, observations, fichier').eq('technicien_id', t.id).order('date')),
      lire(sb.from('photos_apk').select('id', { count: 'exact', head: true }).eq('technicien_id', t.id)),
      lire(sb.from('regles_societe').select('regles, valide_par, valide_le').eq('societe_id', selectedSociete).order('version', { ascending: false }).limit(1)),
      lire(sb.from('heures_sup').select('semaine, valide, refusee').eq('technicien_id', t.id)),
      lire(sb.from('photos_apk').select('nom_local, nom_drive, stockage').eq('technicien_id', t.id)),
      lire(sb.from('gestes_co').select('date, installes').eq('technicien_id', t.id)),
      lire(sb.from('primes_tarifs').select('technicien_id, mois, prix').eq('technicien_id', t.id)),
    ]);
    const v = aff[0];
    const plaque = v && (Array.isArray(v.vehicules) ? v.vehicules[0]?.plaque : v.vehicules?.plaque);
    $('#tech-vehicule').textContent = plaque ? `Véhicule : ${plaque} depuis le ${formaterDate(v.debut)}` : 'Véhicule : aucun';
    fiche = { t, interventions, frais, photos: photos || 0, regles: reglesDe(regles[0] || {}),
      validations: new Map(validations.map((x) => [x.semaine, x.valide ? 'validee' : x.refusee ? 'refusee' : 'a_traiter'])),
      photosParNom: new Map(listePhotos.map((p) => [p.nom_local, p])), listePhotos, gestes, baremes: baremes(tarifs) };
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
  const nr = duMois.filter((e) => e.observation_type).length;
  const primes = primesDuMois(fiche.gestes, fiche.interventions.map(versHeures), fiche.baremes, m);
  afficherPrimes(primes, m);
  $('#tech-resume').textContent = `Prime : ${euros(primes.total)} — ${duMois.length} interventions — OK : ${duMois.length - nr} — NR : ${nr} — Heures : ${totalHeures} h — Frais remboursables : ${euros(totaux.remboursable)} — Photos (total) : ${fiche.photos}`;

  const creneau = { MATIN: 'Matin', APREM: 'Après-midi' };
  $('#tech-interventions-table tbody').replaceChildren(...duMois.map((e) => ligne([formaterDate(e.date),
    creneau[e.slot_midi] || '—', e.type_mission || '—', e.ville || '—', e.departement || '—',
    e.numero_intervention || '—', e.observation_type || 'OK', e.heure_debut || '—', e.heure_fin || '—'])));
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
    const c = td.appendChild(document.createElement('select'));
    for (const [v, l] of [['a_traiter', 'À traiter'], ['validee', 'Validées'], ['refusee', 'Refusées']]) {
      const o = c.appendChild(document.createElement('option'));
      o.value = v;
      o.textContent = l;
    }
    c.value = fiche.validations.get(s.semaine) || 'a_traiter';
    c.disabled = !peutEcrire();
    c.setAttribute('aria-label', `Heures sup, semaine ${s.semaine}`);
    c.addEventListener('change', () => validerHeuresSup(s, c));
    return tr;
  }));
  pointHeures();

  $('#tech-frais-table tbody').replaceChildren(...fraisMois.map((f) => {
    const l = ligneFrais(versFrais(f));
    const tr = ligne([formaterDate(f.date), f.categorie || '—', euros(l.ttc), euros(l.ht), euros(l.tva),
      euros(l.remboursable), f.sans_tva ? 'Oui' : 'Non', f.observations || '—']);
    tr.appendChild(boutonPhoto(fiche.photosParNom.get(f.fichier)?.stockage));
    return tr;
  }));
  afficherGalerie(m);
  $('#tech-camemberts').replaceChildren(
    camembert('Types de mission', repartition(duMois.map((e) => e.type_mission || '—'))),
    camembert('Résultats', repartition(duMois.map((e) => e.observation_type || 'OK'))));
  $('#tech-frais-totaux').textContent = `TTC : ${euros(totaux.ttc)} | HT : ${euros(totaux.ht)} | TVA : ${euros(totaux.tva)} | Remboursable : ${euros(totaux.remboursable)}`;
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

// Camembert en anneau (part d'un tout, 5 parts max) + légende chiffrée : la couleur
// n'est jamais seule (libellé, nombre et % à côté ; détail au survol).
function camembert(titre, lignes) {
  const fig = document.createElement('figure');
  fig.className = 'camembert';
  fig.appendChild(document.createElement('figcaption')).textContent = titre;
  if (!lignes.length) { fig.appendChild(document.createElement('p')).textContent = 'Aucune intervention ce mois-ci.'; return fig; }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 160 160');
  svg.setAttribute('role', 'img');
  const total = lignes.reduce((t, l) => t + l.n, 0);
  svg.setAttribute('aria-label', `${titre} : ` + lignes.map((l) => `${l.libelle} ${l.n}`).join(', '));
  const couleur = (l, i) => (l.libelle === 'Autres' ? 'var(--serie-autres)' : `var(--serie-${i + 1})`);
  const point = (r, a) => [80 + r * Math.sin(a), 80 - r * Math.cos(a)].map((x) => x.toFixed(2)).join(' ');
  let angle = 0;
  lignes.forEach((l, i) => {
    const fin = angle + Math.min(l.part, 0.9999) * 2 * Math.PI;   // 100 % : presque un tour (un arc ne peut pas boucler)
    const grand = fin - angle > Math.PI ? 1 : 0;
    const path = svg.appendChild(document.createElementNS(NS, 'path'));
    path.setAttribute('d', l.part >= 1   // une seule part : anneau complet (deux demi-cercles, sans fente)
      ? `M 80 10 A 70 70 0 1 1 80 150 A 70 70 0 1 1 80 10 Z M 80 36 A 44 44 0 1 0 80 124 A 44 44 0 1 0 80 36 Z`
      : `M ${point(70, angle)} A 70 70 0 ${grand} 1 ${point(70, fin)} L ${point(44, fin)} A 44 44 0 ${grand} 0 ${point(44, angle)} Z`);
    if (l.part >= 1) path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('fill', couleur(l, i));
    path.setAttribute('stroke', 'var(--card)');
    path.setAttribute('stroke-width', '2');
    path.appendChild(document.createElementNS(NS, 'title')).textContent = `${l.libelle} : ${l.n} (${Math.round(l.part * 100)} %)`;
    angle = fin;
  });
  const centre = svg.appendChild(document.createElementNS(NS, 'text'));
  centre.setAttribute('x', '80');
  centre.setAttribute('y', '86');
  centre.setAttribute('text-anchor', 'middle');
  centre.setAttribute('fill', 'var(--text)');
  centre.setAttribute('font-size', '20');
  centre.setAttribute('font-weight', '600');
  centre.textContent = total;
  fig.appendChild(svg);
  const ul = fig.appendChild(document.createElement('ul'));
  lignes.forEach((l, i) => {
    const li = ul.appendChild(document.createElement('li'));
    const p = li.appendChild(document.createElement('span'));
    p.className = 'pastille';
    p.style.background = couleur(l, i);
    li.appendChild(document.createElement('span')).textContent = `${l.libelle} — ${l.n} (${Math.round(l.part * 100)} %)`;
  });
  return fig;
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
      lire(sb.from('temps').select('technicien_id, date, slot_midi, type_mission, observation_type').eq('societe_id', selectedSociete).gte('date', decaler(debut, -6)).lte('date', decaler(fin, 6))),
      lire(sb.from('frais').select('technicien_id, date, categorie, montant_eur, sans_tva').eq('societe_id', selectedSociete).gte('date', debut).lte('date', fin)),
      lire(sb.from('heures_sup').select('technicien_id, semaine, valide, refusee').eq('societe_id', selectedSociete)),
      lire(sb.from('conges').select('technicien_id').eq('societe_id', selectedSociete).eq('statut', 'demandee')),
      lire(sb.from('regles_societe').select('regles, valide_par, valide_le').eq('societe_id', selectedSociete).order('version', { ascending: false }).limit(1)),
    ]);
    const r = reglesDe(regles[0] || {});
    const de = (liste, t) => liste.filter((x) => x.technicien_id === t.id);
    // Primes versées avec cette paie : celles du mois - 2 (règle de l'APK).
    const mp = moisDesPrimes(fin), finMp = decaler(plusMois(mp, 1) + '-01', -1);
    const [gestes, tarifs, jours] = await Promise.all([
      lire(sb.from('gestes_co').select('technicien_id, date, installes').eq('societe_id', selectedSociete).gte('date', mp + '-01').lte('date', finMp)),
      lire(sb.from('primes_tarifs').select('technicien_id, mois, prix').eq('societe_id', selectedSociete)),
      lire(sb.from('temps').select('technicien_id, date, type_mission').eq('societe_id', selectedSociete).gte('date', mp + '-01').lte('date', finMp)),
    ]);
    $('#paie-primes-info').textContent = `Primes : celles de ${libelleMois(mp)}, versées avec cette paie.`;
    lignesPaie = techniciens.filter((t) => t.actif).map((t) => ({ t,
      v: variablesPaie({ tech: t.nom, periode: { debut, fin }, temps: de(temps, t).map(versHeures),
        frais: de(frais, t).map((f) => ({ date: f.date, ...versFrais(f) })),
        primes: primesDuMois(de(gestes, t), de(jours, t).map(versHeures), baremes(de(tarifs, t)), mp).total, regles: r, validations: de(validations, t) }),
      conges: de(conges, t).length }));
    afficherPaie();
  } catch (err) {
    alert(err.message || 'Erreur lors du calcul de la paie');
  }
}

function afficherPaie() {
  const h = (n) => `${Math.round(n * 100) / 100} h`;
  let aTraiter = 0;
  $('#paie-table tbody').replaceChildren(...lignesPaie.map(({ t, v, conges }) => {
    const reste = [v.semainesATraiter && `${v.semainesATraiter} semaine(s) d'heures sup`, conges && `${conges} congé(s) en attente`].filter(Boolean);
    if (reste.length) aTraiter++;
    const tr = ligne([t.nom, h(v.heuresNormales), h(v.sup1), h(v.sup2), h(v.absences), euros(v.fraisRemboursables), euros(v.primes),
      h(v.supRefusees), reste.join(', ') || '—', reste.length ? 'À traiter' : 'Prêt']);
    tr.children[9].className = reste.length ? 'alerte-proche' : 'etat-pret';
    tr.classList.add('ligne-cliquable');
    const fleche = tr.appendChild(document.createElement('td'));
    fleche.className = 'fleche';
    fleche.setAttribute('aria-hidden', 'true');
    fleche.textContent = '›';
    tr.addEventListener('click', () => { switchOnglet('panel-techniciens'); ouvrirFicheTechnicien(t); });
    return tr;
  }));
  const somme = (k) => lignesPaie.reduce((s, l) => s + l.v[k], 0);
  $('#paie-resume').textContent = `${lignesPaie.length} technicien(s) — ${aTraiter} à traiter — ${lignesPaie.length - aTraiter} prêt(s)`;
  $('#paie-totaux').textContent = `Totaux : ${h(somme('heuresNormales'))} normales, ${h(somme('sup1'))} + ${h(somme('sup2'))} sup validées, ${euros(somme('fraisRemboursables'))} de frais, ${euros(somme('primes'))} de primes.`;
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

async function chargerConges() {
  let q = sb.from('conges').select('id, technicien_id, debut, fin, type, motif, statut').eq('societe_id', selectedSociete).order('debut');
  if ($('#conges-filtre').value) q = q.eq('statut', $('#conges-filtre').value);
  const { data, error } = await q;
  if (error) { alert(error.message); return; }
  const nom = (id) => techniciens.find((t) => t.id === id)?.nom || '—';
  $('#conges-table tbody').replaceChildren(...data.map((c) => {
    const jours = (Date.parse(c.fin) - Date.parse(c.debut)) / 86400000 + 1;
    const tr = ligne([nom(c.technicien_id), formaterDate(c.debut), formaterDate(c.fin), jours,
      TYPES_CONGE[c.type] || c.type, c.motif || '—', STATUTS_CONGE[c.statut] || c.statut]);
    const td = tr.appendChild(document.createElement('td'));
    if (c.statut !== 'demandee' || !peutEcrire()) { td.textContent = '—'; return tr; }
    for (const [statut, libelle, classe] of [['validee', 'Valider', ''], ['refusee', 'Refuser', 'danger']]) {
      const b = td.appendChild(document.createElement('button'));
      b.textContent = libelle;
      if (classe) b.className = classe;
      b.addEventListener('click', async () => {
        const { error: e } = await sb.from('conges').update({ statut }).eq('id', c.id);
        if (e) { alert(e.message); return; }
        await chargerConges();
        compterCongesAValider();
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
  $('#tech-primes-info').textContent = `Prime de ${libelleMois(m)} : ${euros(primes.total)} — versée sur le salaire de ${libelleMois(plusMois(m, 2))}.`;
  $('#tech-primes-table tbody').replaceChildren(...primes.detail.map((d) => ligne([d.type, d.qte, euros(d.montant)])));
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
  const type = $('#ent-type').value;
  const km = $('#ent-km').value;
  const garage = $('#ent-garage').value;
  const cout = $('#ent-cout').value;
  if (!date || !type) return;
  try {
    const { error } = await sb.from('entretiens').insert({
      societe_id: selectedSociete,
      vehicule_id: vehiculeActif.id,
      date,
      type,
      km: km ? Number(km) : null,
      garage,
      cout: cout ? Number(cout.replace(',', '.')) : null
    });
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