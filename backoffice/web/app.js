import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE);

let session = null;
let societes = [];
let selectedSociete = null;

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
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
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
    await loadSocietes();
    await checkOperator();
  } catch (err) {
    alert(err.message || 'Erreur d\'initialisation');
  }
}

async function checkOperator() {
  try {
    const { data, error } = await sb.from('operateurs').select('user_id');
    if (error) throw error;
    if (data.length > 0) {
      $('#operator-section').classList.remove('hidden');
    }
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
  if (societes.length === 0) {
    const li = ul.appendChild(document.createElement('li'));
    li.className = 'empty';
    li.textContent = "Vous n'êtes membre d'aucune société pour l'instant.";
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
    renderMembers(members);
    const myRole = members.find(m => m.user_id === session.user.id);
    if (myRole?.role === 'admin') {
      $('#admin-tools').classList.remove('hidden');
      await loadInvitations(societeId);
    } else {
      $('#admin-tools').classList.add('hidden');
    }
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