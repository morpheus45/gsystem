'use strict';

// ─── Service Worker ───
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ─── Form ID (support multiple forms later) ───
let currentFormId = 'diag_' + Date.now();
let formList = JSON.parse(localStorage.getItem('eps_form_list') || '[]');

// ─── Collect all form data ───
function collectData() {
  const data = {};
  document.querySelectorAll('[data-field]').forEach(el => {
    if (el.type === 'checkbox') {
      data[el.dataset.field] = el.checked;
    } else {
      data[el.dataset.field] = el.value;
    }
  });
  return data;
}

// ─── Restore form data ───
function restoreData(data) {
  document.querySelectorAll('[data-field]').forEach(el => {
    const val = data[el.dataset.field];
    if (val === undefined) return;
    if (el.type === 'checkbox') {
      el.checked = !!val;
    } else {
      el.value = val;
    }
  });
}

// ─── Save ───
function saveForm() {
  const data = collectData();
  data.__savedAt = new Date().toISOString();
  data.__id = currentFormId;

  // Store main data
  localStorage.setItem('eps_form_' + currentFormId, JSON.stringify(data));

  // Update list
  if (!formList.find(f => f.id === currentFormId)) {
    const label = data['raison_sociale'] || 'Sans nom';
    formList.push({ id: currentFormId, label, savedAt: data.__savedAt });
    localStorage.setItem('eps_form_list', JSON.stringify(formList));
    rebuildFormSelect();
  } else {
    const entry = formList.find(f => f.id === currentFormId);
    entry.label = data['raison_sociale'] || entry.label;
    entry.savedAt = data.__savedAt;
    localStorage.setItem('eps_form_list', JSON.stringify(formList));
    rebuildFormSelect();
  }

  const badge = document.getElementById('saved-badge');
  badge.classList.add('show');
  setTimeout(() => badge.classList.remove('show'), 2000);
}

// ─── Load ───
function loadForm() {
  const id = document.getElementById('form-select').value;
  if (!id) return;
  const raw = localStorage.getItem('eps_form_' + id);
  if (!raw) return alert('Formulaire introuvable.');
  currentFormId = id;
  restoreData(JSON.parse(raw));
}

// ─── New form ───
function newForm() {
  if (!confirm('Créer un nouveau formulaire ? Les données non sauvegardées seront perdues.')) return;
  currentFormId = 'diag_' + Date.now();
  document.querySelectorAll('[data-field]').forEach(el => {
    if (el.type === 'checkbox') el.checked = false;
    else el.value = '';
  });
}

// ─── Delete form ───
function deleteForm() {
  const id = document.getElementById('form-select').value;
  if (!id) return;
  if (!confirm('Supprimer ce formulaire ?')) return;
  localStorage.removeItem('eps_form_' + id);
  formList = formList.filter(f => f.id !== id);
  localStorage.setItem('eps_form_list', JSON.stringify(formList));
  rebuildFormSelect();
  if (id === currentFormId) newForm();
}

// ─── Print ───
function printForm() {
  window.print();
}

// ─── Export JSON ───
function exportJSON() {
  const data = collectData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const label = data['raison_sociale'] || 'diagnostic';
  a.href = url;
  a.download = `diagnostic_${label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import JSON ───
function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        currentFormId = data.__id || ('diag_' + Date.now());
        restoreData(data);
        saveForm();
      } catch {
        alert('Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── Build form select ───
function rebuildFormSelect() {
  const sel = document.getElementById('form-select');
  sel.innerHTML = '<option value="">— Choisir un formulaire —</option>';
  formList.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.label} (${f.savedAt ? new Date(f.savedAt).toLocaleDateString('fr-FR') : '?'})`;
    if (f.id === currentFormId) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ─── Auto-save every 60s ───
setInterval(() => {
  const hasData = [...document.querySelectorAll('[data-field]')]
    .some(el => el.type !== 'checkbox' && el.value.trim() !== '');
  if (hasData) saveForm();
}, 60000);

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  formList = JSON.parse(localStorage.getItem('eps_form_list') || '[]');
  rebuildFormSelect();

  // Load last used form if any
  if (formList.length > 0) {
    const last = formList[formList.length - 1];
    const raw = localStorage.getItem('eps_form_' + last.id);
    if (raw) {
      currentFormId = last.id;
      restoreData(JSON.parse(raw));
      document.getElementById('form-select').value = last.id;
    }
  }
});
