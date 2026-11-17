import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';
import { alertes, kmMoyenParMois, CT_VOITURE } from '../core/vehicules.js';

const sb = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE);

let session = null;
let societes = [];
let selectedSociete = null;
let superAdmin = false;   // opérateur de la plateforme : accès à tout (vérifié par la base)
let monRole = null;       // rôle de l'utilisateur dans la société sélectionnée
let vehiculeActif = null; // véhicule ouvert dans le panneau de détail
let techniciens = [];     // cache de la société courante (pour les select)

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

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#${id}`).classList.add('active');
}

// Basculer d'onglet
function switchOnglet(tabId) {
  $$('.tab').forEach(b => {
    const actif = `panel-${b.dataset.tab}` === tabId;   // data-tab="vehicules" -> #panel-vehicules
    b.classList.toggle('active', actif);
    b.setAttribute('aria-selected', String(actif));
  });
  for (const id of ['panel-membres', 'panel-techniciens', 'panel-vehicules']) {
    $(`#${id}`).classList.toggle('hidden', id !== tabId);
  }
  fermerPanneauVehicule();
}

function fermerPanneauVehicule() {
  vehiculeActif = null;
  $('#vehicule-detail').classList.add('hidden');
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
  });
}

async function selectSociete(id) {
  selectedSociete = id;
  renderSocietes();
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
    for (const f of ['#technicien-form', '#vehicule-form', '#affectation-form', '#releve-form', '#echeance-form', '#entretien-form']) {
      $(f).classList.toggle('hidden', !peutEcrire());
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
    await Promise.all([
      loadTechniciens(societeId),
      loadVehicules(societeId)
    ]);

    $('#societe-detail').classList.remove('hidden');
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
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des techniciens');
  }
}

function renderTechniciens(list) {
  const tbody = $('#techniciens-table tbody');
  tbody.replaceChildren(...list.map(t => {
    const tr = ligne([t.nom, t.actif ? 'Oui' : 'Non']);
    const b = tr.appendChild(document.createElement('td')).appendChild(document.createElement('button'));
    b.className = t.actif ? 'danger' : 'secondary';
    b.textContent = t.actif ? 'Désactiver' : 'Activer';
    b.addEventListener('click', () => toggleTechnicien(t.id, t.actif));
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

// === VÉHICULES ===
async function loadVehicules(societeId) {
  try {
    const { data, error } = await sb.from('vehicules').select('id, plaque, libelle').eq('societe_id', societeId).order('plaque');
    if (error) throw error;
    renderVehicules(data);
  } catch (err) {
    alert(err.message || 'Erreur lors du chargement des véhicules');
  }
}

function renderVehicules(list) {
  const tbody = $('#vehicules-table tbody');
  tbody.replaceChildren(...list.map(v => {
    const tr = ligne([v.plaque, v.libelle || '']);
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => ouvrirVehicule(v));
    return tr;
  }));
}

async function ouvrirVehicule(v) {
  vehiculeActif = v;
  $('#vehicule-detail').classList.remove('hidden');
  $('#vehicule-detail-title').textContent = v.plaque;
  await Promise.all([
    loadAffectations(v.id),
    loadRelevesAndKm(v.id),
    loadEntretiens(v.id)
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
    e.date,
    e.type,
    e.km != null ? String(e.km) : '—',
    e.garage || '—',
    e.cout != null ? `${Number(e.cout).toFixed(2).replace('.', ',')} €` : '—'
  ])));
}

// Les alertes d'échéance dépendent du dernier km validé : relevés d'abord.
async function loadRelevesAndKm(vehiculeId) {
  await loadReleves(vehiculeId);
  await loadEcheances(vehiculeId);
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

// Remplir select techniciens actifs pour affectation
function renderTechniciensActifs() {
  const select = $('#aff-tech');
  const actifs = techniciens.filter(t => t.actif);
  select.replaceChildren(...actifs.map(t => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.nom;
    return o;
  }));
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