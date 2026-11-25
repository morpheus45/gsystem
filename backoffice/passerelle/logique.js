// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Passerelle des téléphones : décisions pures (testées), sans Google ni réseau.
// RIEN NE S'EFFACE : un fichier remplacé ou retiré est déplacé dans _historique/<dossier>/.
// Le dossier du technicien vient TOUJOURS du jeton, jamais de ce que le téléphone écrit.
// Copié dans l'Apps Script par outils/passerelle-build.sh : pas d'import ici.

const HISTORIQUE = '_historique';
const MAX_BASE64 = 40 * 1024 * 1024;   // ~30 Mo
const REFUS = { ok: false, error: 'token' };

export function nomSur(nom) {
  return typeof nom === 'string' && nom.length > 0 && nom.length <= 120 && nom !== '.' && nom !== '..'
    && nom === nom.trim() && !/[\/\\:*?"<>|\u0000-\u001f]/.test(nom);
}

// Dossiers où un téléphone peut écrire. « ordres » est rempli par le bureau ; les « _ » sont réservés.
export function dossierEcriture(mois) {
  if (!mois || mois === '__root__') return '';
  if (mois === '_secours') return mois;
  return nomSur(mois) && !mois.startsWith('_') && mois.toLowerCase() !== 'ordres' ? mois : null;
}

export function protege(nom) {
  return nom === 'donnees.json' || nom === '_stats.json' || nom === 'desktop.ini'
    || /\.(xlsm|zip)$/i.test(nom) || /^(Recap-|mail-)/i.test(nom);
}

// env : { base, drive, mail, relais, maintenant, verrou }. verrou(f) : une écriture Drive à la fois, et
// seulement APRÈS le contrôle du jeton (des appels sans droit ne bloquent pas les téléphones). drive(dossierTech) renvoie le dossier du technicien.
export function traiter(p, env) {
  if (!p || typeof p !== 'object') return REFUS;
  if (p.action === 'code_demander') return demanderCode(p, env);
  if (p.action === 'connecter') return connecter(p, env);
  const droit = typeof p.jeton === 'string' && /^[0-9a-f]{64}$/.test(p.jeton) ? env.base.verifier(p.jeton, p.action === 'envoi_complet') : null;
  if (!droit || !nomSur(droit.dossier) || droit.dossier.startsWith('_')) return REFUS;

  // Messages : l'ancien script les garde ; le technicien est imposé. La suppression n'est pas relayée.
  if (p.action === 'chat_send') return env.relais({ action: 'chat_send', tech: droit.dossier, text: String(p.text || '').slice(0, 4000) });
  if (p.action === 'chat_fetch') return env.relais({ action: 'chat_fetch', tech: droit.dossier });
  if (p.action === 'chat_markRead') return env.relais({ action: 'chat_markRead', tech: droit.dossier, upTo: Number(p.upTo) || 0 });
  if (p.action === 'envoi_complet') return { ok: true };
  if (p.action === 'modules_liste') return listerModules(p, env);
  if (p.action === 'module_saisie') return saisirModule(p, env);

  const racine = env.drive(droit.dossier);
  if (p.action === undefined || p.action === 'upload') return env.verrou(() => deposer(p, racine, env));
  if (p.action === 'restore_list') return restaurerListe(racine);
  if (p.action === 'photo_pull') return lirePhoto(p, racine);
  if (p.action === 'cycle_prune') return env.verrou(() => ranger(p, racine, env));
  if (p.action === 'ordres_pull') return lireOrdres(p, racine);
  return { ok: false, error: 'action' };
}

// Même réponse que le mail existe ou non.
function demanderCode(p, env) {
  const r = typeof p.mail === 'string' && p.mail.length <= 200 ? env.base.demanderCode(p.mail) : null;
  if (r) {
    env.mail(r.mail, 'G-Systems : votre code ' + r.code, 'Bonjour ' + r.nom + ',\n\nVotre code pour connecter un téléphone : ' + r.code
      + '\nIl est valable 10 minutes. Ne le donnez à personne, même au bureau.\n\nSi vous n\'avez rien demandé, ignorez ce message.');
  }
  return { ok: true };
}

function connecter(p, env) {
  if (typeof p.mail !== 'string' || typeof p.code !== 'string' || p.mail.length > 200 || p.code.length > 20) return { ok: false, error: 'refus' };
  const r = env.base.connecter(p.mail, p.code, String(p.appareil || '').slice(0, 80), p.confirme === true);
  if (!r || r.etat === 'refus') return { ok: false, error: 'refus' };
  if (r.etat !== 'ok') return { ok: true, etat: r.etat, ancien: r.ancien || '', ancienEnvoi: r.ancien_envoi || '' };
  // Le jeton est déjà créé : un mail d'alerte qui échoue ne doit pas bloquer le technicien.
  try {
    env.mail(r.mail, 'G-Systems : nouveau téléphone connecté', 'Bonjour ' + r.nom + ',\n\nUn nouveau téléphone vient d\'être connecté à votre compte.'
      + (r.ancien ? ' L\'ancien (' + r.ancien + ') est déconnecté ; ses données y restent.' : '')
      + '\n\nSi ce n\'est pas vous, prévenez le bureau tout de suite : il peut couper l\'accès.');
  } catch (e) { /* sans effet sur la connexion */ }
  return { ok: true, etat: 'ok', jeton: r.jeton };
}

// Tuiles cachées : absentes de la réponse si la base ne les donne pas, le téléphone ne change alors rien.
function listerModules(p, env) {
  const r = { ok: true, modules: env.base.modules(p.jeton, p.support === 'iphone' ? 'iphone' : 'apk') };
  const cachees = env.base.tuiles(p.jeton);
  if (Array.isArray(cachees)) r.cachees = cachees;
  return r;
}

// Tout ce qui n'est pas « ok » ou « deja » : le téléphone garde sa saisie et réessaiera.
function saisirModule(p, env) {
  const uuid = (x) => typeof x === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
  if (!uuid(p.id) || !uuid(p.module) || !Number.isInteger(p.version) || p.version < 1 || p.version > 100000
    || typeof p.date !== 'string' || !dateReelle(p.date)
    || !p.valeurs || typeof p.valeurs !== 'object' || Array.isArray(p.valeurs)) return { ok: false, error: 'contenu' };
  const r = env.base.saisie({ p_jeton: p.jeton, p_id: p.id, p_module: p.module, p_version: p.version, p_date: p.date, p_valeurs: p.valeurs });
  if (r === 'jeton') return REFUS;
  return r === 'ok' || r === 'deja' ? { ok: true, etat: r } : { ok: false, error: r || 'serveur' };
}

function dateReelle(t) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

const horodatage = (env) => new Date(env.maintenant()).toISOString().replace(/[:.]/g, '-');

function versHistorique(fichier, racine, dossier, env) {
  const h = racine.dossier(HISTORIQUE, true).dossier(dossier || 'racine', true);
  fichier.ranger(h, horodatage(env) + '_' + fichier.nom);
}

// Le nouveau fichier est créé AVANT que l'ancien bouge : jamais d'instant sans fichier.
function deposer(p, racine, env) {
  const dossier = dossierEcriture(p.month);
  if (dossier === null || !nomSur(p.fileName)) return { ok: false, error: 'nom' };
  if (typeof p.dataBase64 !== 'string' || !p.dataBase64 || p.dataBase64.length > MAX_BASE64) return { ok: false, error: 'contenu' };
  const dest = dossier ? racine.dossier(dossier, true) : racine;
  const anciens = dest.fichiers().filter((f) => f.nom === p.fileName);
  if (anciens.length === 1 && anciens[0].base64() === p.dataBase64) return { ok: true, name: p.fileName, identique: true };
  if (p.fileName === '_stats.json' && anciens.length === 1) {   // chiffres recalculés : Drive garde ses versions
    anciens[0].reecrire(p.dataBase64);
    return { ok: true, name: p.fileName };
  }
  if (dossier === '_secours' && anciens.length) return { ok: false, error: 'existe' };
  dest.creer(p.fileName, typeof p.mimeType === 'string' ? p.mimeType : 'application/octet-stream', p.dataBase64);
  for (const a of anciens) versHistorique(a, racine, dossier, env);
  return { ok: true, name: p.fileName };
}

// L'ancien « nettoyage » : les fichiers retirés vont dans l'historique.
function ranger(p, racine, env) {
  const dossier = dossierEcriture(p.month);
  // Une liste absente ou sans donnees.json viderait le mois : refusée.
  if (!dossier || !/^\d{4}-\d{2}$/.test(dossier) || !Array.isArray(p.keep) || !p.keep.includes('donnees.json')) return { ok: false, error: 'liste' };
  const d = racine.dossier(dossier, false);
  if (!d) return { ok: true, trashed: 0 };
  const garder = new Set(p.keep);
  const retires = d.fichiers().filter((f) => !garder.has(f.nom) && !protege(f.nom));
  for (const f of retires) versHistorique(f, racine, dossier, env);
  return { ok: true, trashed: retires.length };
}

function restaurerListe(racine) {
  const cycles = [];
  for (const d of racine.dossiers()) {
    if (d.nom.startsWith('_') || d.nom === 'photos') continue;
    const f = d.fichiers().find((x) => x.nom === 'donnees.json');
    if (f) cycles.push({ month: d.nom, donnees: f.texte() });
  }
  const r = racine.fichiers().find((x) => x.nom === 'reglages.json');
  return { ok: true, settings: r ? r.texte() : '', cycles };
}

function lirePhoto(p, racine) {
  const dossier = dossierEcriture(p.month);
  if (dossier === null || !nomSur(p.fileName)) return { ok: false, error: 'nom' };
  const d = dossier ? racine.dossier(dossier, false) : racine;
  const f = d && d.fichiers().find((x) => x.nom === p.fileName);
  return f ? { ok: true, dataBase64: f.base64() } : { ok: false, error: 'not found' };
}

function lireOrdres(p, racine) {
  const d = racine.dossier('ordres', false);
  if (!d) return { ok: true, ordres: [] };
  const depuis = Number(p.sinceTs) || 0;
  const l = d.fichiers().filter((f) => f.date > depuis).sort((a, b) => b.date - a.date).slice(0, 3);
  return { ok: true, ordres: l.map((f) => ({ fileName: f.nom, ts: f.date, dataBase64: f.base64() })) };
}
