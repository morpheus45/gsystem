/**
 * G-Systems — réception des sauvegardes + tableau de bord administratif.
 * POST (app) : range dans Sauvegardes G-Systems / <tech> / <mois> / <fichier>.
 * GET (navigateur) : page siglée G-Systems — global + tech par tech, sur
 * période choisie (Du/Au), sections dépliables (répartition, primes, frais,
 * clôtures) façon SaaS.
 *
 * Déployer -> Gérer les déploiements -> Modifier -> Nouvelle version.
 * Exécuter en tant que : MOI · Qui a accès : « Tout le monde ».
 */

const ROOT_FOLDER = 'Sauvegardes G-Systems';
const SHARED_TOKEN = 'gsys-backup-2026-7Kq2vR';
const RETENTION_YEARS = 3;               // au-delà : purge (corbeille) des dossiers-mois
const PROP = PropertiesService.getScriptProperties();

/** Liste des techniciens désactivés (archivés). */
function getInactiveTechs() {
  try { return JSON.parse(PROP.getProperty('INACTIVE_TECHS') || '[]'); } catch (e) { return []; }
}
/** Active/désactive un technicien depuis le dashboard. Renvoie la liste à jour des inactifs. */
function setTechActive(tech, active) {
  const list = getInactiveTechs().filter(function (n) { return n !== tech; });
  if (!active) list.push(tech);
  PROP.setProperty('INACTIVE_TECHS', JSON.stringify(list));
  return list;
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.token !== SHARED_TOKEN) return json({ ok: false, error: 'token' });

    // --- Chat tech <-> bureau (pas d'upload de fichier) ---
    if (p.action === 'chat_send')     return chatSend_(p.tech, 'tech', p.text);
    if (p.action === 'chat_fetch')    return chatFetch_(p.tech);
    if (p.action === 'chat_markRead') return chatMarkRead_(p.tech, 'tech', Number(p.upTo) || 0);
    if (p.action === 'chat_delete')   return chatDelete_(p.tech);

    const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const userFolder = getOrCreateFolder(root, sanitize(p.user || 'Inconnu'));
    const monthFolder = getOrCreateFolder(userFolder, sanitize(p.month || 'sans-date'));
    const bytes = Utilities.base64Decode(p.dataBase64);
    const blob = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', p.fileName || 'fichier');
    const same = monthFolder.getFilesByName(p.fileName || 'fichier');
    while (same.hasNext()) same.next().setTrashed(true);
    const file = monthFolder.createFile(blob);
    return json({ ok: true, id: file.getId(), name: file.getName() });
  } catch (err) { return json({ ok: false, error: String(err) }); }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.ping) return json({ ok: true, service: 'gsystem-backup' });
  if (e && e.parameter && e.parameter.debug === 'data') {
    var t0 = Date.now();
    try { var d = getAllData(); var s = JSON.stringify(d);
      return json({ ok: true, ms: Date.now() - t0, techs: d.length, bytes: s.length,
        noms: d.map(function (x) { return x.tech + ':' + (x.clotures || []).length + 'c/' + (x.gestes || []).length + 'g'; }) });
    } catch (err) { return json({ ok: false, ms: Date.now() - t0, error: String((err && err.stack) || err) }); }
  }
  if (e && e.parameter && e.parameter.debug === 'full') {
    try { return json({ ok: true, data: getAllData() }); }
    catch (err) { return json({ ok: false, error: String((err && err.stack) || err) }); }
  }
  return HtmlService.createHtmlOutput(DASHBOARD_HTML)
    .setTitle('G-Systems · Espace administratif')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // autorise l'embed via docs/backoffice.html
}

/** Données granulaires de tous les techs (tous mois fusionnés) pour filtrage par date. */
function getAllData() {
  const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
  const techs = {}; const users = root.getFolders();
  while (users.hasNext()) {
    const u = users.next(); const tname = u.getName();
    if (tname === '_telechargements') continue;
    const months = u.getFolders();
    while (months.hasNext()) {
      const mf = months.next();
      const sIt = mf.getFilesByName('_stats.json');
      if (!sIt.hasNext()) continue;
      try {
        const s = JSON.parse(sIt.next().getBlob().getDataAsString('UTF-8'));
        if (!techs[tname]) techs[tname] = { tech: tname, clotures: [], frais: [], gestes: [], prices: {} };
        const T = techs[tname];
        (s.clotures || []).forEach(function (c) { T.clotures.push(c); });
        (s.fraisList || []).forEach(function (f) { T.frais.push(f); });
        (s.gestes || []).forEach(function (g) { T.gestes.push(g); });
        if (s.prices) T.prices = s.prices;
      } catch (err) {}
    }
  }
  return Object.keys(techs).map(function (k) { return techs[k]; })
    .sort(function (a, b) { return String(a.tech).localeCompare(String(b.tech)); });
}

/**
 * Même données que getAllData(), mais renvoyées en CHAÎNE JSON.
 * Le sérialiseur natif de google.script.run échoue (« Une erreur inconnue s'est
 * produite ») sur des graphes d'objets volumineux ou contenant certains
 * caractères ; renvoyer une string (via JSON.stringify, bien formé) contourne
 * le bug. Le client fait JSON.parse. À utiliser pour tout appel client.
 */
function getAllDataStr() { return JSON.stringify(getAllData()); }

/** ZIP de tous les fichiers dont le mois est dans [from, to] (un sous-dossier par tech/mois). */
function makeZip(from, to) {
  try {
    const fM = (from || '').slice(0, 7), tM = (to || '').slice(0, 7);
    const inactive = {}; getInactiveTechs().forEach(function (n) { inactive[n] = true; });
    const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const blobs = []; const users = root.getFolders();
    while (users.hasNext()) {
      const u = users.next(); const tname = u.getName();
      if (tname === '_telechargements') continue;
      if (inactive[tname]) continue;                     // techs actifs uniquement
      const months = u.getFolders();
      while (months.hasNext()) {
        const mf = months.next(); const mn = mf.getName();
        if (fM && mn < fM) continue;
        if (tM && mn > tM) continue;
        const files = mf.getFiles();
        while (files.hasNext()) {
          const f = files.next(); const nm = f.getName();
          if (!keepForDossier_(nm)) continue;            // garde xlsm/pdf/images, jette json/zip/txt
          const b = f.getBlob().copyBlob(); b.setName(tname + '/' + mn + '/' + nm); blobs.push(b);
        }
      }
    }
    try { blobs.push(fraisRecapBlob_(from, to)); } catch (e) {}   // récap « global des frais calculées »
    if (!blobs.length) return { ok: false, error: 'Aucun fichier sur la période' };
    const zip = Utilities.zip(blobs, 'G-Systems_' + (fM || 'debut') + '_' + (tM || 'fin') + '.zip');
    const dl = getOrCreateFolder(root, '_telechargements');
    const old = dl.getFiles(); while (old.hasNext()) { const o = old.next(); if (new Date() - o.getDateCreated() > 3600000) o.setTrashed(true); }
    const file = dl.createFile(zip);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, url: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
  } catch (err) { return { ok: false, error: String(err) }; }
}

/** Export Excel (.xlsx) des clôtures, une feuille par technicien actif, filtrées sur [from, to]. */
function makeCloturesExcel(from, to) {
  try {
    const fromD = from || '', toD = to || '';
    const inactive = {}; getInactiveTechs().forEach(function (n) { inactive[n] = true; });
    const data = getAllData();
    const ss = SpreadsheetApp.create('G-Systems_clotures_' + (fromD || 'debut') + '_' + (toD || 'fin'));
    const def = ss.getSheets()[0];
    const header = ['Date', 'Début', 'Fin', 'Durée', 'Type', 'Client', 'Ville', 'Dép.', 'N°', 'Obs', 'Note'];
    const used = {}; let added = 0;
    data.forEach(function (T) {
      if (inactive[T.tech]) return;
      const clo = (T.clotures || []).filter(function (c) { return (!fromD || c.date >= fromD) && (!toD || c.date <= toD); });
      if (!clo.length) return;
      clo.sort(function (a, b) { return (a.date < b.date) ? 1 : (a.date > b.date) ? -1 : 0; });
      let name = (String(T.tech).replace(/[\[\]\*\?\/\\:]/g, ' ').trim() || 'Tech').slice(0, 95);
      const base = name; let k = 2; while (used[name]) { name = base.slice(0, 92) + ' ' + k; k++; } used[name] = true;
      const sh = ss.insertSheet(name);
      const rows = clo.map(function (c) {
        return [c.date || '', c.hDebut || '', c.hFin || '', durHM(c.hDebut, c.hFin), c.type || '', c.client || '', c.ville || '', String(c.dept || ''), String(c.num || ''), c.obs || '', (c.motif ? '[' + c.motif + '] ' : '') + (c.note || '')];
      });
      sh.getRange(1, 1, rows.length + 1, header.length).setNumberFormat('@');   // tout en texte : dates, heures et N° lisibles (pas de notation scientifique)
      sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
      sh.getRange(2, 1, rows.length, header.length).setValues(rows);
      sh.setFrozenRows(1);
      [92, 56, 56, 60, 54, 160, 150, 55, 100, 90, 320].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
      added++;
    });
    if (!added) { DriveApp.getFileById(ss.getId()).setTrashed(true); return { ok: false, error: 'Aucune clôture sur la période' }; }
    ss.deleteSheet(def);
    const blob = ssToXlsxBlob_(ss, ss.getName() + '.xlsx');
    const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const dl = getOrCreateFolder(root, '_telechargements');
    const old = dl.getFiles(); while (old.hasNext()) { const o = old.next(); if (new Date() - o.getDateCreated() > 3600000) o.setTrashed(true); }
    const file = dl.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, url: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
  } catch (err) { return { ok: false, error: String(err) }; }
}

/** Fichiers gardés dans le dossier période : xlsm/pdf/images. On jette json, zip, txt (backup, stats, mail). */
function keepForDossier_(name) {
  const n = String(name).toLowerCase();
  if (n.slice(-5) === '.json' || n.slice(-4) === '.zip' || n.slice(-4) === '.txt') return false;
  return n.slice(-5) === '.xlsm' || n.slice(-5) === '.xlsx' || n.slice(-4) === '.xls' ||
    n.slice(-4) === '.pdf' || n.slice(-4) === '.jpg' || n.slice(-5) === '.jpeg' ||
    n.slice(-4) === '.png' || n.slice(-5) === '.heic' || n.slice(-5) === '.webp';
}
/** Somme remboursable d'un frais (règle MOBILE 50 % plafond 20 €). */
function fraisRemb_(f) { const m = Number(f.m) || 0; return (String(f.cat || '').toUpperCase() === 'MOBILE') ? Math.min(m * 0.5, 20) : m; }
function round2_(x) { return Math.round((Number(x) || 0) * 100) / 100; }
/** Exporte un Spreadsheet en blob .xlsx puis supprime le fichier temporaire. */
function ssToXlsxBlob_(ss, fileName) {
  SpreadsheetApp.flush();
  const id = ss.getId();
  const blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob().setName(fileName);
  DriveApp.getFileById(id).setTrashed(true);
  return blob;
}
/** Récap « global des frais calculées » par technicien actif, filtré sur [from, to] (blob .xlsx). */
function fraisRecapBlob_(from, to) {
  const fromD = from || '', toD = to || '';
  const inactive = {}; getInactiveTechs().forEach(function (n) { inactive[n] = true; });
  const data = getAllData();
  const ss = SpreadsheetApp.create('FRAIS_' + (fromD || 'debut') + '_' + (toD || 'fin'));
  const sh = ss.getSheets()[0]; sh.setName('Frais');
  const header = ['Technicien', 'Nb tickets', 'TTC payé (€)', 'Remboursé (€)', 'TVA (€)', 'HT (€)'];
  const rows = []; let tN = 0, tTTC = 0, tR = 0, tV = 0, tH = 0;
  data.forEach(function (T) {
    if (inactive[T.tech]) return;
    const fr = (T.frais || []).filter(function (x) { return (!fromD || x.d >= fromD) && (!toD || x.d <= toD); });
    if (!fr.length) return;
    let n = 0, ttc = 0, r = 0, v = 0, h = 0;
    fr.forEach(function (f) {
      const m = Number(f.m) || 0, rr = fraisRemb_(f);
      const tvaFull = (f.tva == null) ? (m - m / 1.2) : (Number(f.tva) || 0);
      const tva = (m > 0) ? tvaFull * (rr / m) : 0;
      n++; ttc += m; r += rr; v += tva; h += (rr - tva);
    });
    rows.push([T.tech, n, round2_(ttc), round2_(r), round2_(v), round2_(h)]);
    tN += n; tTTC += ttc; tR += r; tV += v; tH += h;
  });
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  sh.getRange(rows.length + 2, 1, 1, header.length)
    .setValues([['TOTAL', tN, round2_(tTTC), round2_(tR), round2_(tV), round2_(tH)]]).setFontWeight('bold');
  sh.setFrozenRows(1); sh.autoResizeColumns(1, header.length);
  return ssToXlsxBlob_(ss, 'FRAIS_' + (fromD || 'debut') + '_' + (toD || 'fin') + '.xlsx');
}
/** Durée hh:mm -> "1h05" / "45 min" (miroir serveur de dur()). */
function durHM(a, b) {
  if (!a || !b) return '';
  const pa = String(a).split(':'), pb = String(b).split(':');
  if (pa.length < 2 || pb.length < 2) return '';
  let m = (+pb[0] * 60 + +pb[1]) - (+pa[0] * 60 + +pa[1]);
  if (isNaN(m)) return '';
  if (m < 0) m += 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? (h + 'h' + ('0' + mm).slice(-2)) : (mm + ' min');
}

/** Purge glissante : met à la CORBEILLE les dossiers-mois de plus de RETENTION_YEARS ans (tous techs). */
function purgeOldData() {
  const cut = new Date(); cut.setFullYear(cut.getFullYear() - RETENTION_YEARS);
  const cutM = cut.getFullYear() + '-' + ('0' + (cut.getMonth() + 1)).slice(-2);
  const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
  const trashed = []; const users = root.getFolders();
  while (users.hasNext()) {
    const u = users.next(); const tn = u.getName();
    if (tn === '_telechargements') continue;
    const months = u.getFolders();
    while (months.hasNext()) {
      const mf = months.next(); const mn = mf.getName();
      if (!/^\d{4}-\d{2}/.test(mn)) continue;           // on ne touche qu'aux dossiers datés AAAA-MM
      if (mn.slice(0, 7) < cutM) { mf.setTrashed(true); trashed.push(tn + '/' + mn); }
    }
  }
  if (trashed.length) console.log('Purge >' + RETENTION_YEARS + ' ans (corbeille) : ' + trashed.join(', '));
  return { ok: true, cutoff: cutM, trashed: trashed };
}
/** À EXÉCUTER UNE FOIS : installe le déclencheur mensuel de purge. */
function installPurgeTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'purgeOldData'; });
  if (exists) return 'Déclencheur déjà présent.';
  ScriptApp.newTrigger('purgeOldData').timeBased().onMonthDay(1).atHour(3).create();
  return 'Déclencheur mensuel installé (purge le 1er de chaque mois, ~3 h).';
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sanitize(s) { return String(s).replace(/[\/\\:*?"<>|]/g, '_').trim().slice(0, 80) || 'x'; }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// ============ CHAT tech <-> bureau ============
// Stockage : une feuille Google Sheet « _gsystem_chat » (onglet "messages")
// rangée dans le dossier des sauvegardes. Colonnes : id, tech, from, text, ts,
// readTech, readBureau.
const CHAT_SHEET_NAME = '_gsystem_chat';

function getChatSheet_() {
  const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
  let ss;
  const it = root.getFilesByName(CHAT_SHEET_NAME);
  if (it.hasNext()) {
    ss = SpreadsheetApp.openById(it.next().getId());
  } else {
    ss = SpreadsheetApp.create(CHAT_SHEET_NAME);
    const f = DriveApp.getFileById(ss.getId());
    root.addFile(f); DriveApp.getRootFolder().removeFile(f);
  }
  let sh = ss.getSheetByName('messages');
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName('messages');
    sh.getRange(1, 1, 1, 7).setValues([['id', 'tech', 'from', 'text', 'ts', 'readTech', 'readBureau']]);
  }
  return sh;
}

function chatSend_(tech, from, text) {
  tech = sanitize(tech); text = String(text || '').slice(0, 4000);
  if (!tech || !text) return json({ ok: false, error: 'empty' });
  const sh = getChatSheet_();
  const now = Date.now();
  const last = sh.getLastRow() > 1 ? Number(sh.getRange(sh.getLastRow(), 1).getValue()) : 0;
  const id = Math.max(now, last + 1);   // id strictement croissant
  const who = (from === 'bureau') ? 'bureau' : 'tech';
  sh.appendRow([id, tech, who, text, now, who === 'tech', who === 'bureau']);
  return json({ ok: true, id: id });
}

function chatFetch_(tech) {
  tech = sanitize(tech);
  const sh = getChatSheet_();
  const n = sh.getLastRow();
  const out = [];
  if (n > 1) {
    const rows = sh.getRange(2, 1, n - 1, 5).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) === tech) {
        out.push({ id: Number(rows[i][0]), from: String(rows[i][2]), text: String(rows[i][3]), ts: Number(rows[i][4]) });
      }
    }
  }
  return json({ ok: true, messages: out });
}

function chatMarkRead_(tech, who, upTo) {
  tech = sanitize(tech);
  const sh = getChatSheet_();
  const n = sh.getLastRow();
  if (n > 1) {
    const rows = sh.getRange(2, 1, n - 1, 7).getValues();
    const col = (who === 'bureau') ? 7 : 6;        // readBureau / readTech
    const other = (who === 'bureau') ? 'tech' : 'bureau';
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) === tech && String(rows[i][2]) === other && Number(rows[i][0]) <= upTo) {
        sh.getRange(i + 2, col).setValue(true);
      }
    }
  }
  return json({ ok: true });
}

function chatDelete_(tech) {
  tech = sanitize(tech);
  const sh = getChatSheet_();
  const n = sh.getLastRow();
  if (n > 1) {
    const col = sh.getRange(2, 2, n - 1, 1).getValues();   // colonne B = tech
    for (let i = col.length - 1; i >= 0; i--) {
      if (String(col[i][0]) === tech) sh.deleteRow(i + 2);
    }
  }
  return json({ ok: true });
}

// --- Fonctions appelées par le tableau de bord (google.script.run) ---
function boChatList() {
  // Retourne, par tech, le dernier message + le nombre de non-lus côté bureau.
  const sh = getChatSheet_();
  const n = sh.getLastRow();
  const map = {};
  if (n > 1) {
    const rows = sh.getRange(2, 1, n - 1, 7).getValues();
    for (let i = 0; i < rows.length; i++) {
      const tech = String(rows[i][1]);
      if (!map[tech]) map[tech] = { tech: tech, lastText: '', lastTs: 0, unread: 0 };
      map[tech].lastText = String(rows[i][3]); map[tech].lastTs = Number(rows[i][4]);
      if (String(rows[i][2]) === 'tech' && rows[i][6] !== true) map[tech].unread++;
    }
  }
  return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.lastTs - a.lastTs; });
}
function boChatFetch(tech) {
  const r = chatFetch_(tech);
  return JSON.parse(r.getContent());
}
function boChatSend(tech, text) { chatSend_(tech, 'bureau', text); return { ok: true }; }
function boChatMarkRead(tech, upTo) { chatMarkRead_(tech, 'bureau', Number(upTo) || 0); return { ok: true }; }
function boChatDelete(tech) { chatDelete_(tech); return { ok: true }; }
// Primes marquées « payées » manuellement (clé = "tech|yyyy-MM").
function boPrimeGetPaid() { try { return JSON.parse(PROP.getProperty('PAID_PRIMES') || '{}'); } catch (e) { return {}; } }
function boPrimeSetPaid(tech, ym, paid) {
  var m; try { m = JSON.parse(PROP.getProperty('PAID_PRIMES') || '{}'); } catch (e) { m = {}; }
  var k = tech + '|' + ym;
  if (paid) m[k] = true; else delete m[k];
  PROP.setProperty('PAID_PRIMES', JSON.stringify(m));
  return { ok: true };
}

const DASHBOARD_HTML = `
<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
:root{--bg:#07080D;--card:#12141B;--card2:#1A1D26;--line:#2F3340;--hi:#F7F7F2;--mid:#B8BECC;--low:#7A8094;--blue:#4FA3FF;--red:#FF3D5A}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--hi)}
.head{text-align:center;padding:26px 16px 4px}
.logo{width:200px;max-width:60%;height:auto;overflow:visible}
.bl-g{fill:none;stroke:#ee2322;stroke-width:30;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:560;stroke-dashoffset:560;animation:bl-draw .7s cubic-bezier(.65,0,.35,1) forwards,bl-ignite .5s ease forwards .9s,bl-breathe 2.8s ease-in-out infinite 1.8s}
.bl-word{font-family:'Segoe UI',system-ui,sans-serif;font-weight:600;font-size:62px;letter-spacing:-1px;fill:#f4f4f0;opacity:0;animation:bl-wordin .4s ease forwards .35s,bl-shoot 1.05s cubic-bezier(.5,0,.15,1) forwards 1.3s}
@keyframes bl-draw{to{stroke-dashoffset:0}}
@keyframes bl-ignite{0%{stroke:#ee2322}100%{stroke:#ff4338;filter:drop-shadow(0 0 10px rgba(238,35,34,.55))}}
@keyframes bl-breathe{0%,100%{filter:drop-shadow(0 0 6px rgba(238,35,34,.4))}50%{filter:drop-shadow(0 0 16px rgba(238,35,34,.75))}}
@keyframes bl-wordin{to{opacity:1}}
@keyframes bl-shoot{0%{transform:translateX(0)}28%{transform:translateX(-95px)}50%{transform:translateX(-95px)}82%{transform:translateX(9px)}100%{transform:translateX(0)}}
.sub{color:var(--mid);font-size:13px}
.wrap{max-width:1040px;margin:0 auto;padding:8px 16px 60px}
.bar{position:sticky;top:0;z-index:5;background:rgba(7,8,13,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:12px 8px;margin:0 -8px 8px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center}
input[type=date]{padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--hi);font-size:14px;color-scheme:dark}
.seg{background:var(--card2);color:var(--mid);border:1px solid var(--line);padding:8px 12px;border-radius:9px;font-size:13px;cursor:pointer}
.dtog{display:inline-block;padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid var(--line);color:var(--mid);background:var(--card2)}
.dtog.on{background:var(--blue);color:#fff;border-color:var(--blue)}
.gtech{font-size:12.5px;font-weight:700;color:var(--hi);margin:12px 0 4px}
.seg:hover{color:var(--hi)}
.btn{background:var(--red);color:#fff;border:none;padding:9px 16px;border-radius:9px;font-size:13.5px;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.55}
.techcard{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin:14px 0}
.techcard.glob{border-color:var(--blue);box-shadow:0 0 0 1px rgba(79,163,255,.25)}
.techcard.arch{opacity:.82}
.miniBtn{background:var(--card2);border:1px solid var(--line);color:var(--mid);font-size:11px;font-weight:700;padding:4px 9px;border-radius:7px;cursor:pointer;white-space:nowrap}
.miniBtn.deact:hover{border-color:var(--red);color:var(--red)}
.miniBtn.react{border-color:#4ADE80;color:#4ADE80}
.th{font-size:17px;font-weight:800;margin-bottom:12px}
.chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:10px;margin-bottom:12px}
.chip{background:var(--card2);border-radius:11px;padding:10px 12px}
.chip .cl{font-size:11px;color:var(--mid)}
.chip .cv{font-size:20px;font-weight:700;color:var(--blue);margin-top:2px}
.ct{font-size:12.5px;color:var(--mid);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px}
.pieWrap{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding-top:8px}
.pie{width:128px;height:128px;border-radius:50%;flex:none}
.legend{flex:1;min-width:130px}
.leg{font-size:13px;margin:3px 0;display:flex;align-items:center;gap:7px}
.dot{width:11px;height:11px;border-radius:3px;flex:none}
.pct{color:var(--low)}
.pt{width:100%;border-collapse:collapse;font-size:13.5px}
.pt th,.pt td{padding:6px 8px;border-bottom:1px solid #20232c;text-align:right}
.pt th:first-child,.pt td:first-child{text-align:left}
.pt thead th{color:var(--mid);font-size:11.5px}
.pt tfoot td{font-weight:700;color:var(--blue);border-bottom:none}
.empty,.empty2{color:var(--low);font-size:13px;padding:14px 0}
.empty{text-align:center;padding:34px}
.ctab{max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:6px}
.cflt{display:flex;gap:6px;margin:2px 0 0;flex-wrap:wrap}
.cflt select,.cflt input{background:var(--card2);color:var(--hi);border:1px solid var(--line);border-radius:8px;padding:5px 8px;font-size:12px}
.cflt input{flex:1;min-width:120px}
.clt{width:100%;border-collapse:collapse;font-size:12.5px}
.clt th,.clt td{padding:5px 9px;border-bottom:1px solid #1e212a;text-align:left;white-space:nowrap}
.clt thead th{position:sticky;top:0;background:var(--card2);color:var(--mid);font-size:11px}
.clt td.note{white-space:normal;max-width:260px;color:var(--mid)}
.ok{color:#4ADE80}.nr{color:#FFB347}.an{color:#FF6B6B}
.thh{cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px}
.thh .tn{font-size:16px;font-weight:800}
.thh .sm{font-size:12.5px;color:var(--mid);display:flex;align-items:center;gap:8px;white-space:nowrap}
.chev{display:inline-block;transition:transform .18s;color:var(--low);flex:none}
.thh.open .chev{transform:rotate(90deg)}
.cardbody{margin-top:14px}
.sec{border:1px solid var(--line);border-radius:12px;margin:8px 0;background:var(--card2);overflow:hidden}
.sech{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;user-select:none}
.sech:hover{background:rgba(79,163,255,.07)}
.si{font-size:15px;flex:none}
.st{font-weight:700;font-size:12.5px;letter-spacing:.4px;text-transform:uppercase;color:var(--mid)}
.sec.open .st{color:var(--hi)}
.ss{margin-left:auto;font-size:13px;font-weight:700;color:var(--blue);white-space:nowrap}
.sec.open .chev{transform:rotate(90deg)}
.secb{padding:2px 14px 14px;border-top:1px solid var(--line);background:var(--card)}
</style></head><body>
<div class="head">
  <svg class="logo" viewBox="0 0 470 200" xmlns="http://www.w3.org/2000/svg" aria-label="gsystems">
    <defs><clipPath id="m"><rect x="168" y="0" width="302" height="200"/></clipPath></defs>
    <path class="bl-g" d="M158,58 Q158,38 138,38 L62,38 Q38,38 38,62 L38,138 Q38,162 62,162 L138,162 Q162,162 162,138 L162,108 L112,108"/>
    <g clip-path="url(#m)"><text class="bl-word" x="178" y="128">systems</text></g>
  </svg>
  <div class="sub">Espace administratif · global et par technicien · suivi temps réel</div>
</div>
<div class="wrap">
  <div class="bar">
    <span class="dtog on" id="tabAct" onclick="setView('actifs')">Actifs</span>
    <span class="dtog" id="tabArc" onclick="setView('archives')">Archivés</span>
    <span class="sub">Du</span><input type="date" id="from" onchange="apply()">
    <span class="sub">au</span><input type="date" id="to" onchange="apply()">
    <button class="seg" onclick="preset(7)">7 j</button>
    <button class="seg" onclick="preset(30)">30 j</button>
    <button class="seg" onclick="preset('m')">Ce mois</button>
    <button class="seg" onclick="preset('all')">Tout</button>
    <button class="btn" id="dlx" onclick="downloadExcel()">📊 Excel clôtures</button>
  </div>
  <div id="global"></div>
  <div id="techs"><div class="empty">Chargement…</div></div>
</div>
<script>
var DATA=[];var OPEN={};var SEC={};var GJOUR=false;var VIEW='actifs';var INACTIVE={};var PAID={};var CTID=0;
var COLORS=['#4FA3FF','#26A69A','#EF5350','#FFA726','#AB47BC','#66BB6A','#5C6BC0','#EC407A','#8D6E63','#42A5F5','#FFCA28','#78909C'];
function money(v){return (Number(v)||0).toFixed(2)+' €';}
function remb(f){var m=Number(f.m)||0;return ((f.cat||'').toUpperCase()==='MOBILE')?Math.min(m*0.5,20):m;}
function iso(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function setR(f,t){document.getElementById('from').value=f;document.getElementById('to').value=t;}
function loadErr(e){var tc=document.getElementById('techs');if(tc)tc.innerHTML='<div class="empty">⚠ Erreur de chargement des données :<br><b>'+esc(String((e&&e.message)||e))+'</b><br><small>Réessaie de recharger. Si ça persiste, préviens.</small></div>';}
function init(){
  google.script.run.withSuccessHandler(function(p){PAID=p||{};if(DATA.length)apply();}).boPrimeGetPaid();
  google.script.run.withFailureHandler(loadErr).withSuccessHandler(function(inact){
    INACTIVE={};(inact||[]).forEach(function(n){INACTIVE[n]=true;});
    google.script.run.withFailureHandler(loadErr).withSuccessHandler(function(data){
      try{DATA=data?JSON.parse(data):[];}catch(e){return loadErr(e);}
      var t=new Date(),f=new Date();f.setDate(f.getDate()-30);
      setR(iso(f),iso(t));apply();
    }).getAllDataStr();
  }).getInactiveTechs();
}
function setView(v){VIEW=v;apply();}
function setActive(ev,el){ev.stopPropagation();
  var name=el.getAttribute('data-tech'),active=el.getAttribute('data-act')==='1';
  if(active)delete INACTIVE[name];else INACTIVE[name]=true;apply();
  google.script.run.withFailureHandler(function(e){alert('Erreur : '+e);if(active)INACTIVE[name]=true;else delete INACTIVE[name];apply();}).setTechActive(name,active);}
function preset(p){var t=new Date();
  if(p===7){var f=new Date();f.setDate(f.getDate()-7);setR(iso(f),iso(t));}
  else if(p===30){var f=new Date();f.setDate(f.getDate()-30);setR(iso(f),iso(t));}
  else if(p==='m'){setR(iso(new Date(t.getFullYear(),t.getMonth(),1)),iso(t));}
  else if(p==='all'){setR('','');}
  apply();}
function inR(d,f,t){return (!f||d>=f)&&(!t||d<=t);}
function computeTech(T,f,t){
  var clo=(T.clotures||[]).filter(function(c){return inR(c.date,f,t);});
  var fr=(T.frais||[]).filter(function(x){return inR(x.d,f,t);});
  var ge=(T.gestes||[]).filter(function(x){return inR(x.d,f,t);});
  var rep={};clo.forEach(function(c){var k=c.type||'—';rep[k]=(rep[k]||0)+1;});
  var pri={};ge.forEach(function(g){for(var k in g.t){pri[k]=(pri[k]||0)+g.t[k];}});
  var ppt=[],totP=0,totE=0;
  for(var k in pri){var u=(T.prices&&T.prices[k])||0;var tt=pri[k]*u;totP+=tt;totE+=pri[k];ppt.push({type:k,qty:pri[k],total:tt});}
  ppt.sort(function(a,b){return b.total-a.total;});
  return {tech:T.tech,interventions:clo.length,tickets:fr.length,
    frais:fr.reduce(function(s,x){return s+remb(x);},0),primes:totP,extensions:totE,fraisList:fr,
    repartition:Object.keys(rep).map(function(k){return{type:k,count:rep[k]};}).sort(function(a,b){return b.count-a.count;}),
    primesParType:ppt,clotures:clo,allGestes:T.gestes,prices:T.prices,allClotures:T.clotures};
}
// Taux de NR tech (NR client + NR technique / réalisées) d'un mois "yyyy-MM".
function nrMonth_(clotures, ym){
  var inst=(clotures||[]).filter(function(c){return String(c.type||'').toUpperCase()==='INST' && (c.date||'').slice(0,7)===ym;});
  var real=inst.filter(function(c){var o=c.obs||'OK';return o==='OK'||o==='NR client'||o==='NR technique';});
  if(!real.length) return null;
  var tech=real.filter(function(c){var o=c.obs||'';return o==='NR client'||o==='NR technique';}).length;
  return {tot:real.length, pct:Math.round(tech/real.length*1000)/10};
}
// 3 mois civils glissants (mois courant + 2 précédents), du plus ancien au plus récent.
function nr3moisBody(clotures){
  var now=new Date(),rows='';
  for(var i=2;i>=0;i--){
    var d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    var ym=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);
    var label=moisNom(d.getMonth()+1)+' '+d.getFullYear();
    var r=nrMonth_(clotures, ym);
    if(!r){ rows+='<tr><td>'+label+'</td><td style="color:var(--low)">—</td><td style="color:var(--low)">aucune install.</td></tr>'; }
    else { var ok=r.pct<=8,col=ok?'#4ADE80':'#FF6B6B'; rows+='<tr><td>'+label+'</td><td style="color:'+col+';font-weight:700">'+r.pct+'% '+(ok?'✓':'✗')+'</td><td>'+r.tot+' réal.</td></tr>'; }
  }
  return '<div class="ctab"><table class="clt"><thead><tr><th>Mois</th><th>Taux NR tech</th><th>Base</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function moisNom(m){return ['','janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'][m]||(''+m);}
function primesHistorique(s){
  var ge=s.allGestes||[],pr=s.prices||{},tech=s.tech||'';
  var byMonth={};
  ge.forEach(function(g){var m=(g.d||'').slice(0,7);if(!m)return;var tot=0;for(var k in g.t){tot+=(g.t[k]||0)*((pr[k])||0);}byMonth[m]=(byMonth[m]||0)+tot;});
  var months=Object.keys(byMonth).filter(function(m){return byMonth[m]>0;}).sort().reverse();
  if(!months.length)return '<div class="empty2">Aucune prime</div>';
  var now=new Date(),nowM=now.getFullYear()*12+now.getMonth();
  var p2=function(n){return ('0'+n).slice(-2);};
  var rows=months.map(function(m){
    var y=parseInt(m.slice(0,4),10),mo=parseInt(m.slice(5,7),10);
    var last=new Date(y,mo,0).getDate();
    var perio=p2(1)+'/'+p2(mo)+' → '+p2(last)+'/'+p2(mo)+'/'+y;
    var payAbs=(y*12+(mo-1))+2,py=Math.floor(payAbs/12),pmo=(payAbs%12)+1;
    var paid=!!PAID[tech+'|'+m];
    var statut=paid?'Payée ✓':(payAbs<nowM?'Payée':(payAbs===nowM?'À payer ce mois':'À payer'));
    var col=paid?'#4ADE80':(payAbs<nowM?'var(--low)':(payAbs===nowM?'var(--blue)':'#FFB347'));
    var btn='<button class="miniBtn" style="margin-left:8px" onclick="primePaid(\\''+tech+'\\',\\''+m+'\\','+(paid?'false':'true')+')">'+(paid?'↩ annuler':'✓ payée')+'</button>';
    return '<tr><td>'+perio+'</td><td style="text-align:right">'+money(byMonth[m])+'</td><td>'+moisNom(pmo)+' '+py+'</td><td style="color:'+col+';font-weight:700;white-space:nowrap">'+statut+btn+'</td></tr>';
  }).join('');
  return '<div class="ctab"><table class="clt"><thead><tr><th>Période travaillée</th><th>Prime</th><th>Versée sur salaire</th><th>Statut</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function primePaid(tech,ym,paid){google.script.run.withSuccessHandler(function(){var k=tech+'|'+ym;if(paid)PAID[k]=true;else delete PAID[k];apply();}).boPrimeSetPaid(tech,ym,paid);}
function aggregate(techs){
  var g={tech:'VUE GLOBALE — tous les techniciens',interventions:0,tickets:0,frais:0,primes:0,extensions:0,repartition:[],primesParType:[],clotures:[]};
  var rep={},pri={},clo=[],fl=[];
  techs.forEach(function(s){g.interventions+=s.interventions;g.tickets+=s.tickets;g.frais+=s.frais;g.primes+=s.primes;g.extensions+=s.extensions;
    s.repartition.forEach(function(x){rep[x.type]=(rep[x.type]||0)+x.count;});
    s.primesParType.forEach(function(x){if(!pri[x.type])pri[x.type]={type:x.type,qty:0,total:0};pri[x.type].qty+=x.qty;pri[x.type].total+=x.total;});
    (s.fraisList||[]).forEach(function(f){fl.push(f);});
    s.clotures.forEach(function(c){clo.push({date:c.date,type:c.type,client:c.client,ville:c.ville,dept:c.dept,num:c.num,obs:c.obs,note:c.note,motif:c.motif,hDebut:c.hDebut,hFin:c.hFin,tech:s.tech});});});
  g.repartition=Object.keys(rep).map(function(k){return{type:k,count:rep[k]};}).sort(function(a,b){return b.count-a.count;});
  g.primesParType=Object.keys(pri).map(function(k){return pri[k];}).sort(function(a,b){return b.total-a.total;});
  g.clotures=clo;g.fraisList=fl;return g;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function obsCell(o){var cl=(o==='OK')?'ok':((o==='Annulé')?'an':'nr');return '<span class="'+cl+'">'+esc(o)+'</span>';}
function dur(a,b){if(!a||!b)return '';var pa=a.split(':'),pb=b.split(':');if(pa.length<2||pb.length<2)return '';var m=(+pb[0]*60+ +pb[1])-(+pa[0]*60+ +pa[1]);if(isNaN(m))return '';if(m<0)m+=1440;var h=Math.floor(m/60),mm=m%60;return h>0?(h+'h'+('0'+mm).slice(-2)):(mm+' min');}
function cloturesTable(list,withTech){
  if(!list||!list.length)return '<div class="empty2">Aucune clôture sur la période</div>';
  var l=list.slice().sort(function(a,b){return (a.date<b.date)?1:(a.date>b.date)?-1:0;});
  var types={},obss={};
  l.forEach(function(c){if(c.type)types[c.type]=1;obss[c.obs||'OK']=1;});
  function opts(o,lbl){return '<option value="">'+lbl+'</option>'+Object.keys(o).sort().map(function(k){return '<option>'+esc(k)+'</option>';}).join('');}
  var bar='<div class="cflt"><select data-k="t" onchange="cltFilter(this)">'+opts(types,'Type : tous')+'</select><select data-k="o" onchange="cltFilter(this)">'+opts(obss,'Obs : toutes')+'</select><input data-k="n" oninput="cltFilter(this)" placeholder="Rechercher un N°…"></div>';
  var head='<tr><th>Date</th><th>Début</th><th>Fin</th><th>Durée</th>'+(withTech?'<th>Tech</th>':'')+'<th>Type</th><th>Client</th><th>Ville</th><th>Dép.</th><th>N°</th><th>Obs</th><th>Note</th></tr>';
  var body=l.map(function(c){return '<tr data-t="'+esc(c.type||'')+'" data-o="'+esc(c.obs||'OK')+'" data-n="'+esc(String(c.num||''))+'"><td>'+esc(c.date)+'</td><td>'+esc(c.hDebut)+'</td><td>'+esc(c.hFin)+'</td><td>'+dur(c.hDebut,c.hFin)+'</td>'+(withTech?'<td>'+esc(c.tech)+'</td>':'')+'<td>'+esc(c.type)+'</td><td>'+esc(c.client)+'</td><td>'+esc(c.ville)+'</td><td>'+esc(c.dept)+'</td><td>'+esc(c.num)+'</td><td>'+obsCell(c.obs||'')+'</td><td class="note">'+(c.motif?('<i style="color:var(--low)">'+esc(c.motif)+'</i>'+(c.note?' · ':'')):'')+esc(c.note||'')+'</td></tr>';}).join('');
  return '<div class="cbox">'+bar+'<div class="ctab"><table class="clt"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';}
function cltFilter(el){var root=el.closest('.cbox');if(!root)return;var t=root.querySelector('[data-k=t]').value;var o=root.querySelector('[data-k=o]').value;var n=(root.querySelector('[data-k=n]').value||'').trim().toLowerCase();var trs=root.querySelectorAll('tbody tr');for(var i=0;i<trs.length;i++){var tr=trs[i];var okT=!t||tr.getAttribute('data-t')===t;var okO=!o||tr.getAttribute('data-o')===o;var okN=!n||(tr.getAttribute('data-n')||'').toLowerCase().indexOf(n)>=0;tr.style.display=(okT&&okO&&okN)?'':'none';}}
function setGJour(v){GJOUR=v;apply();}
// Taux de NR sur les INSTALLATIONS uniquement (type INST).
//  - NR brut       = installations non réalisées (obs != OK) / total installations
//  - NR périm. tech = NR client + NR technique / total installations (attendu <= 8%)
function nrRates(list){
  var inst=(list||[]).filter(function(c){return String(c.type||'').toUpperCase()==='INST';});
  // Base « réalisées » = OK + NR client + NR technique (hors annulées + clients absents).
  var real=inst.filter(function(c){var o=c.obs||'OK';return o==='OK'||o==='NR client'||o==='NR technique';});
  var tot=real.length; if(!tot) return null;
  var tech=real.filter(function(c){var o=c.obs||'';return o==='NR client'||o==='NR technique';}).length;
  // Brut : tous incidents (hors annulées) / installations tentées.
  var tented=inst.filter(function(c){return (c.obs||'')!=='Annulé';});
  var brutN=tented.filter(function(c){return (c.obs||'OK')!=='OK';}).length;
  var brut=tented.length?Math.round(brutN/tented.length*1000)/10:0;
  return {tot:tot, brut:brut, tech:Math.round(tech/tot*1000)/10};
}
// Badge NR identique à l'app : mois civil EN COURS, base = installations réalisées.
function nrBadgeApp(clotures){
  var now=new Date();
  var ym=now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2);
  var inst=(clotures||[]).filter(function(c){return String(c.type||'').toUpperCase()==='INST' && (c.date||'').slice(0,7)===ym;});
  var real=inst.filter(function(c){var o=c.obs||'OK';return o==='OK'||o==='NR client'||o==='NR technique';});
  var tot=real.length; if(!tot) return '';
  var tech=Math.round(real.filter(function(c){var o=c.obs||'';return o==='NR client'||o==='NR technique';}).length/tot*1000)/10;
  var tented=inst.filter(function(c){return (c.obs||'')!=='Annulé';});
  var brut=tented.length?Math.round(tented.filter(function(c){return (c.obs||'OK')!=='OK';}).length/tented.length*1000)/10:0;
  var ok=tech<=8, col=ok?'#4ADE80':'#FF6B6B', bg=ok?'rgba(74,222,128,.14)':'rgba(255,107,107,.16)';
  var mois=['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'][now.getMonth()];
  return '<span title="Taux de NR du mois civil en cours, identique a l app. Base = installations realisees ; perimetre tech = NR client + NR technique, attendu <= 8%." '+
    'style="margin-left:8px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;color:'+col+';background:'+bg+'">'+
    'NR '+mois+' · TECH '+tech+' % '+(ok?'✓':'✗')+
    ' <span style="opacity:.65;font-weight:400">· BRUT '+brut+' % · '+tot+' INST</span></span>';
}
function nrBadge(list){
  var r=nrRates(list); if(!r) return '';
  var ok=r.tech<=8;
  var col=ok?'#4ADE80':'#FF6B6B', bg=ok?'rgba(74,222,128,.14)':'rgba(255,107,107,.16)';
  return '<span title="Taux de NR calculé sur la PÉRIODE choisie (Du/Au) — pour un mois civil : Du 1 → Au fin de mois. Base = installations réalisées (OK + NR client + NR technique) ; périmètre tech = NR client + NR technique, attendu <= 8%." '+
    'style="margin-left:8px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;color:'+col+';background:'+bg+'">'+
    'NR tech '+r.tech+'% '+(ok?'✓':'✗')+
    ' <span style="opacity:.65;font-weight:400">· brut '+r.brut+'% · '+r.tot+' réal. · période Du/Au</span></span>';
}
// Vue globale : toggle Période / Aujourd'hui + clôtures REGROUPÉES par technicien.
function globalCloturesBody(list){
  var todayIso=iso(new Date());
  var shown=GJOUR?(list||[]).filter(function(c){return c.date===todayIso;}):(list||[]);
  var tg='<div style="margin-bottom:6px">'+
    '<span class="dtog'+(!GJOUR?' on':'')+'" onclick="setGJour(false)">Toute la période</span> '+
    '<span class="dtog'+(GJOUR?' on':'')+'" onclick="setGJour(true)">Aujourd&#39;hui</span></div>';
  if(!shown.length) return tg+'<div class="empty2">Aucune clôture'+(GJOUR?" aujourd'hui":' sur la période')+'</div>';
  var byTech={};shown.forEach(function(c){var t=c.tech||'—';(byTech[t]=byTech[t]||[]).push(c);});
  var techs=Object.keys(byTech).sort(function(a,b){return String(a).localeCompare(String(b));});
  return tg+techs.map(function(t){
    return '<div class="gtech">👤 '+esc(t)+' ('+byTech[t].length+')'+nrBadge(byTech[t])+'</div>'+cloturesTable(byTech[t],false);
  }).join('');}
function pie(rep){
  var total=(rep||[]).reduce(function(s,x){return s+x.count;},0);
  if(!total)return '<div class="empty2">Aucune intervention</div>';
  var acc=0,stops=[],legend='';
  rep.forEach(function(x,i){var c=COLORS[i%COLORS.length];var a=acc/total*100,b=(acc+x.count)/total*100;acc+=x.count;
    stops.push(c+' '+a.toFixed(2)+'% '+b.toFixed(2)+'%');
    legend+='<div class="leg"><span class="dot" style="background:'+c+'"></span>'+x.type+' <b>'+x.count+'</b> <span class="pct">('+Math.round(x.count/total*100)+'%)</span></div>';});
  return '<div class="pieWrap"><div class="pie" style="background:conic-gradient('+stops.join(',')+')"></div><div class="legend">'+legend+'</div></div>';}
function primesTable(pp){
  if(!pp||!pp.length)return '<div class="empty2">Aucune prime sur la période</div>';
  var tot=0;var body=pp.map(function(x){tot+=x.total;return '<tr><td>'+x.type+'</td><td>'+x.qty+'</td><td>'+money(x.total)+'</td></tr>';}).join('');
  return '<table class="pt"><thead><tr><th>Type</th><th>Qté</th><th>Prime</th></tr></thead><tbody>'+body+'</tbody><tfoot><tr><td>TOTAL PRIME</td><td></td><td>'+money(tot)+'</td></tr></tfoot></table>';}
function chip(l,v){return '<div class="chip"><div class="cl">'+l+'</div><div class="cv">'+v+'</div></div>';}
function fraisTable(list){
  if(!list||!list.length)return '<div class="empty2">Aucun frais</div>';
  var l=list.slice().sort(function(a,b){return (a.d<b.d)?1:(a.d>b.d)?-1:0;});
  var tt=0,tr=0,tv=0,th=0;
  var body=l.map(function(f){
    var m=Number(f.m)||0,r=remb(f);
    var tvaFull=(f.tva==null)?(m-m/1.2):(Number(f.tva)||0);
    var tva=(m>0)?tvaFull*(r/m):0;var ht=r-tva;
    tt+=m;tr+=r;tv+=tva;th+=ht;
    var cat=esc(f.cat)+(((f.cat||'').toUpperCase()==='MOBILE')?' <span class="pct">(50 % · max 20 €)</span>':'');
    return '<tr><td>'+esc(f.d)+'</td><td>'+cat+'</td><td>'+money(m)+'</td><td>'+money(ht)+'</td><td>'+money(tva)+'</td><td>'+money(r)+'</td></tr>';}).join('');
  return '<table class="pt"><thead><tr><th>Date</th><th>Nature</th><th>TTC payé</th><th>HT</th><th>TVA</th><th>Remboursé</th></tr></thead><tbody>'+body+'</tbody><tfoot><tr><td>TOTAL</td><td></td><td>'+money(tt)+'</td><td>'+money(th)+'</td><td>'+money(tv)+'</td><td>'+money(tr)+'</td></tr></tfoot></table>';}
function secRow(key,id,icon,title,summary,bodyHtml){
  var k=key+'|'+id;var open=!!SEC[k];
  return '<div class="sec'+(open?' open':'')+'">'+
    '<div class="sech" data-k="'+esc(k)+'" onclick="togS(this)">'+
    '<span class="si">'+icon+'</span><span class="st">'+title+'</span>'+
    '<span class="ss">'+summary+'</span><span class="chev">▸</span></div>'+
    (open?'<div class="secb">'+bodyHtml+'</div>':'')+
    '</div>';}
function togS(el){var k=el.getAttribute('data-k');SEC[k]=!SEC[k];apply();}
function cardInner(s,glob){
  var key=glob?'GLOBAL':s.tech;
  var n=(s.clotures||[]).length;
  var topType=(s.repartition&&s.repartition.length)?s.repartition[0].type+' '+Math.round(s.repartition[0].count/Math.max(1,s.interventions)*100)+'%':'—';
  return '<div class="chips">'+chip('Interventions',s.interventions||0)+chip('Tickets frais',s.tickets||0)+chip('Frais remboursés',money(s.frais))+chip('Total primes',money(s.primes))+chip('Extensions',s.extensions||0)+'</div>'+
    (glob?'':secRow(key,'nr3','📉','Évolution NR (3 mois glissants)','',nr3moisBody(s.allClotures)))+
    secRow(key,'rep','📊','Répartition interventions',topType,pie(s.repartition))+
    secRow(key,'pri','💶','Primes par type',money(s.primes),primesTable(s.primesParType))+
    (glob?'':secRow(key,'pav','⏳','Primes à venir (versement +2 mois)','',primesHistorique(s)))+
    secRow(key,'fra','🧾','Détail des frais',money(s.frais)+' remb.',fraisTable(s.fraisList))+
    secRow(key,'clo','📋',glob?'Clôtures par technicien':'Clôtures',n+' clôture'+(n>1?'s':''),glob?globalCloturesBody(s.clotures):cloturesTable(s.clotures,false));}
function buildCard(s,glob){
  if(glob){
    var gopen=!!OPEN['__GLOBAL__'];
    return '<div class="techcard glob"><div class="thh'+(gopen?' open':'')+'" data-tech="__GLOBAL__" onclick="tog(this)">'+
      '<span class="tn">🌐 '+esc(s.tech)+'</span>'+nrBadge(s.clotures)+'<span class="sm"><span class="chev">▸</span></span></div>'+
      '<div class="cardbody" style="display:'+(gopen?'block':'none')+'">'+cardInner(s,true)+'</div></div>';
  }
  var open=!!OPEN[s.tech];var inactive=!!INACTIVE[s.tech];
  var sm=(s.interventions||0)+' interv · '+((s.clotures||[]).length)+' clôt · '+money(s.primes);
  var btn='<button class="miniBtn'+(inactive?' react':' deact')+'" data-tech="'+esc(s.tech)+'" data-act="'+(inactive?1:0)+'" onclick="setActive(event,this)">'+(inactive?'↩ Réactiver':'🗄 Désactiver')+'</button>';
  return '<div class="techcard'+(inactive?' arch':'')+'"><div class="thh'+(open?' open':'')+'" data-tech="'+esc(s.tech)+'" onclick="tog(this)">'+
    '<span class="tn">👤 '+esc(s.tech)+'</span>'+nrBadgeApp(s.allClotures)+'<span class="sm">'+btn+' '+sm+' <span class="chev">▸</span></span></div>'+
    '<div class="cardbody" style="display:'+(open?'block':'none')+'">'+cardInner(s,false)+'</div></div>';}
function tog(el){var t=el.getAttribute('data-tech');OPEN[t]=!OPEN[t];apply();}
function apply(){try{applyInner();}catch(err){var tc=document.getElementById('techs');if(tc)tc.innerHTML='<div class="empty">⚠ Erreur d\\'affichage :<br><b>'+esc(String((err&&err.stack)||(err&&err.message)||err))+'</b></div>';}}
function applyInner(){
  var f=document.getElementById('from').value,t=document.getElementById('to').value;
  var g=document.getElementById('global'),tc=document.getElementById('techs');
  if(!DATA.length){tc.innerHTML='<div class="empty">Aucune donnée pour le moment.</div>';g.innerHTML='';return;}
  var all=DATA.map(function(T){return computeTech(T,f,t);});
  var active=all.filter(function(s){return !INACTIVE[s.tech];});
  var arch=all.filter(function(s){return INACTIVE[s.tech];});
  var aTab=document.getElementById('tabAct'),rTab=document.getElementById('tabArc');
  rTab.textContent='Archivés ('+arch.length+')';
  aTab.className='dtog'+(VIEW==='actifs'?' on':'');rTab.className='dtog'+(VIEW==='archives'?' on':'');
  if(VIEW==='archives'){
    g.innerHTML='';
    tc.innerHTML=arch.length?arch.map(function(s){return buildCard(s,false);}).join(''):'<div class="empty">Aucun technicien archivé.</div>';
  }else{
    g.innerHTML=buildCard(aggregate(active),true);
    tc.innerHTML=active.length?active.map(function(s){return buildCard(s,false);}).join(''):'<div class="empty">Aucun technicien actif.</div>';
  }
}
function download(){var f=document.getElementById('from').value,t=document.getElementById('to').value;
  var b=document.getElementById('dl');b.disabled=true;b.textContent='Préparation…';
  google.script.run.withSuccessHandler(function(r){b.disabled=false;b.textContent='⬇ Télécharger';
    if(r&&r.ok){window.open(r.url,'_blank');}else{alert('Erreur : '+((r&&r.error)||'inconnue'));}}).makeZip(f,t);}
function downloadExcel(){var f=document.getElementById('from').value,t=document.getElementById('to').value;
  var b=document.getElementById('dlx');b.disabled=true;b.textContent='Préparation…';
  google.script.run.withSuccessHandler(function(r){b.disabled=false;b.textContent='📊 Excel clôtures';
    if(r&&r.ok){window.open(r.url,'_blank');}else{alert('Erreur : '+((r&&r.error)||'inconnue'));}}).makeCloturesExcel(f,t);}
init();
setInterval(function(){
  google.script.run.withSuccessHandler(function(inact){INACTIVE={};(inact||[]).forEach(function(n){INACTIVE[n]=true;});
    google.script.run.withSuccessHandler(function(d){try{DATA=d?JSON.parse(d):[];}catch(e){return;}apply();}).getAllDataStr();
  }).getInactiveTechs();
},60000);
</script>
<button id="chatFab" onclick="chatToggle()" style="position:fixed;right:18px;bottom:18px;z-index:30;width:56px;height:56px;border-radius:50%;background:var(--blue);color:#062036;border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5)">&#128172;<span id="chatFabBadge" style="display:none;position:absolute;top:-2px;right:-2px;background:var(--red);color:#fff;font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;line-height:20px"></span></button>
<div id="chatPanel" style="display:none;position:fixed;right:18px;bottom:84px;z-index:30;width:340px;max-width:calc(100vw - 24px);height:460px;max-height:calc(100vh - 120px);background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,.6)">
  <div style="background:var(--blue);color:#062036;padding:11px 14px;font-weight:700;display:flex;justify-content:space-between;align-items:center">Messagerie techniciens<span style="display:flex;gap:12px;align-items:center"><span onclick="chatDelete()" title="Supprimer la conversation" style="cursor:pointer;font-size:15px">&#128465;</span><span onclick="chatToggle()" style="cursor:pointer;font-size:18px">&#10005;</span></span></div>
  <div id="chatTechs" style="display:flex;gap:6px;padding:9px 10px;overflow-x:auto;border-bottom:1px solid var(--line);background:#0f1117"></div>
  <div id="chatThread" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px"></div>
  <div id="chatReply" style="display:none;gap:8px;padding:9px 10px;border-top:1px solid var(--line);background:var(--card2)">
    <input id="chatInput" type="text" placeholder="Répondre…" onkeydown="if(event.key==='Enter')chatSend()" style="flex:1;background:#14161d;border:1px solid var(--line);border-radius:9px;padding:8px 11px;color:var(--hi);font-size:13px">
    <button onclick="chatSend()" style="background:var(--blue);color:#062036;border:none;border-radius:9px;padding:0 14px;font-weight:700;font-size:13px;cursor:pointer">Envoyer</button>
  </div>
</div>
<script>
var CHAT={tech:null,list:[]};
function chatToggle(){var p=document.getElementById('chatPanel');var open=p.style.display==='none';p.style.display=open?'flex':'none';if(open)chatLoadList();}
function esc2(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function chatHm(ts){var d=new Date(Number(ts||0));function z(n){return(n<10?'0':'')+n;}return z(d.getHours())+':'+z(d.getMinutes());}
function chatLoadList(){google.script.run.withSuccessHandler(chatRenderList).boChatList();}
function chatRenderList(list){CHAT.list=list||[];var tot=0,h='';for(var i=0;i<CHAT.list.length;i++){var t=CHAT.list[i];tot+=t.unread;var sel=(t.tech===CHAT.tech);h+='<span onclick="chatOpenIdx('+i+')" style="cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:5px 10px;border-radius:16px;border:1px solid var(--line);'+(sel?'background:var(--blue);color:#062036':'background:var(--card2);color:var(--mid)')+'">'+esc2(t.tech)+(t.unread>0?' <b style="background:var(--red);color:#fff;font-size:9px;border-radius:8px;padding:1px 5px">'+t.unread+'</b>':'')+'</span>';}
document.getElementById('chatTechs').innerHTML=h||'<span style="color:var(--low);font-size:12px">Aucun message</span>';
var b=document.getElementById('chatFabBadge');if(tot>0){b.style.display='block';b.textContent=tot>9?'9+':tot;}else{b.style.display='none';}
if(CHAT.tech)chatLoadThread();}
function chatOpenIdx(i){var t=CHAT.list[i];if(t){CHAT.tech=t.tech;document.getElementById('chatReply').style.display='flex';chatLoadThread();chatRenderList(CHAT.list);}}
function chatLoadThread(){if(CHAT.tech)google.script.run.withSuccessHandler(chatRenderThread).boChatFetch(CHAT.tech);}
function chatRenderThread(r){r=r||{};var msgs=(r.messages||[]).slice().sort(function(a,b){return a.id-b.id;});var h='',maxId=0;for(var i=0;i<msgs.length;i++){var m=msgs[i];maxId=Math.max(maxId,Number(m.id));var mine=(m.from==='bureau');h+='<div style="align-self:'+(mine?'flex-end':'flex-start')+';max-width:80%;padding:8px 11px;font-size:12.5px;border-radius:14px;'+(mine?'background:var(--blue);color:#062036;border-bottom-right-radius:4px':'background:var(--card2);color:#E6E8EE;border-bottom-left-radius:4px')+'">'+esc2(m.text)+'<div style="font-size:9px;margin-top:3px;opacity:.7">'+esc2(mine?'Bureau':CHAT.tech)+' &middot; '+chatHm(m.ts)+'</div></div>';}
var th=document.getElementById('chatThread');th.innerHTML=h||'<div style="color:var(--low);font-size:12px;text-align:center;margin-top:20px">Aucun message avec ce technicien</div>';th.scrollTop=th.scrollHeight;
if(maxId>0)google.script.run.boChatMarkRead(CHAT.tech,maxId);}
function chatSend(){var inp=document.getElementById('chatInput');var t=(inp.value||'').trim();if(!t||!CHAT.tech)return;inp.value='';google.script.run.withSuccessHandler(function(){chatLoadThread();chatLoadList();}).boChatSend(CHAT.tech,t);}
function chatDelete(){var t=CHAT.tech;if(!t)return;if(!confirm('Supprimer toute la conversation avec '+t+' ? Action irreversible.'))return;google.script.run.withSuccessHandler(function(){CHAT.tech=null;document.getElementById('chatThread').innerHTML='';document.getElementById('chatReply').style.display='none';chatLoadList();}).boChatDelete(t);}
setInterval(function(){var p=document.getElementById('chatPanel');if(p&&p.style.display!=='none')chatLoadList();},12000);
chatLoadList();
</script>
</body></html>
`;
