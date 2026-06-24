/**
 * G-Systems — réception des sauvegardes + tableau de bord comptable.
 *
 * UNE seule web app à la même URL /exec :
 *   - POST (depuis l'app Android) : enregistre un fichier sur le Drive, rangé
 *     dans  Sauvegardes G-Systems / <tech> / <mois> / <fichier>.
 *   - GET (depuis un navigateur)  : affiche le TABLEAU DE BORD comptable
 *     (stats par tech + bouton « tout télécharger »).
 *
 * DÉPLOIEMENT (sous le compte Google propriétaire du Drive partagé) :
 *   Déployer -> Gérer les déploiements -> Modifier -> Nouvelle version.
 *   Exécuter en tant que : MOI · Qui a accès : « Tout le monde »
 *   (l'URL /exec ne change pas).
 */

const ROOT_FOLDER = 'Sauvegardes G-Systems';
const SHARED_TOKEN = 'gsys-backup-2026-7Kq2vR';
const ACCENT = '#1d9e75';

// ============ RÉCEPTION (app Android) ============
function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.token !== SHARED_TOKEN) return json({ ok: false, error: 'token' });

    const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const userFolder = getOrCreateFolder(root, sanitize(p.user || 'Inconnu'));
    const monthFolder = getOrCreateFolder(userFolder, sanitize(p.month || 'sans-date'));

    const bytes = Utilities.base64Decode(p.dataBase64);
    const blob = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream',
                                   p.fileName || 'fichier');

    const same = monthFolder.getFilesByName(p.fileName || 'fichier');
    while (same.hasNext()) same.next().setTrashed(true);

    const file = monthFolder.createFile(blob);
    return json({ ok: true, id: file.getId(), name: file.getName() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ============ TABLEAU DE BORD (navigateur) ============
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return json({ ok: true, service: 'gsystem-backup', root: ROOT_FOLDER });
  }
  return HtmlService.createHtmlOutput(DASHBOARD_HTML)
    .setTitle('G-Systems · Espace comptable')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Liste des mois présents (sous-dossiers de chaque tech), du plus récent au plus ancien. */
function getMonths() {
  const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
  const set = {};
  const users = root.getFolders();
  while (users.hasNext()) {
    const u = users.next();
    if (u.getName() === '_telechargements') continue;
    const ms = u.getFolders();
    while (ms.hasNext()) set[ms.next().getName()] = true;
  }
  const out = Object.keys(set);
  out.sort().reverse();
  return out;
}

/** Stats par tech pour un mois donné (lit chaque <tech>/<mois>/_stats.json). */
function getStats(month) {
  const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
  const rows = [];
  const users = root.getFolders();
  while (users.hasNext()) {
    const u = users.next();
    if (u.getName() === '_telechargements') continue;
    const mIt = u.getFoldersByName(month);
    if (!mIt.hasNext()) continue;
    const mf = mIt.next();
    const row = {
      tech: u.getName(), periode: '', interventions: null, tickets: null,
      frais: null, primes: null, extensions: null, compteur: null, fichiers: 0, stats: false
    };
    let n = 0;
    const fit = mf.getFiles();
    while (fit.hasNext()) { fit.next(); n++; }
    row.fichiers = n;
    const sIt = mf.getFilesByName('_stats.json');
    if (sIt.hasNext()) {
      try {
        const s = JSON.parse(sIt.next().getBlob().getDataAsString('UTF-8'));
        row.periode = s.periode || '';
        row.interventions = num(s.interventions);
        row.tickets = num(s.tickets);
        row.frais = num(s.frais);
        row.primes = num(s.primes);
        row.extensions = num(s.extensions);
        row.compteur = num(s.compteur);
        row.stats = true;
      } catch (err) {}
    }
    rows.push(row);
  }
  rows.sort(function (a, b) { return String(a.tech).localeCompare(String(b.tech)); });
  return rows;
}

/** Construit un ZIP de tout le mois (un sous-dossier par tech) et renvoie une URL de téléchargement. */
function makeZip(month) {
  try {
    const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const blobs = [];
    const users = root.getFolders();
    while (users.hasNext()) {
      const u = users.next();
      if (u.getName() === '_telechargements') continue;
      const mIt = u.getFoldersByName(month);
      if (!mIt.hasNext()) continue;
      const mf = mIt.next();
      const tname = u.getName();
      const files = mf.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        const b = f.getBlob().copyBlob();
        b.setName(tname + '/' + f.getName());
        blobs.push(b);
      }
    }
    if (!blobs.length) return { ok: false, error: 'Aucun fichier pour ce mois' };

    const zip = Utilities.zip(blobs, 'G-Systems_' + month + '.zip');
    const dl = getOrCreateFolder(root, '_telechargements');
    // Nettoie les zips de plus d'1 h.
    const old = dl.getFiles();
    while (old.hasNext()) {
      const o = old.next();
      if (new Date() - o.getDateCreated() > 3600000) o.setTrashed(true);
    }
    const file = dl.createFile(zip);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, url: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ============ Helpers ============
function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sanitize(s) { return String(s).replace(/[\/\\:*?"<>|]/g, '_').trim().slice(0, 80) || 'x'; }
function num(v) { const n = Number(v); return isNaN(n) ? null : n; }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============ HTML du tableau de bord ============
const DASHBOARD_HTML = `
<!doctype html><html lang="fr"><head><meta charset="utf-8">
<style>
  :root{--accent:#1d9e75}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f1f23;background:#f7f6fb}
  .bar{background:var(--accent);color:#fff;padding:16px 18px;font-weight:700;font-size:18px}
  .wrap{max-width:920px;margin:0 auto;padding:18px 16px 60px}
  .ctrl{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:14px 0}
  select{padding:9px 12px;border:1px solid #d9d6e2;border-radius:9px;font-size:15px;background:#fff}
  .btn{background:var(--accent);color:#fff;border:none;padding:11px 16px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
  .btn:disabled{opacity:.6;cursor:default}
  .period{color:#66666b;font-size:13px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:8px 0 18px}
  .card{background:#fff;border:1px solid #e6e3ee;border-radius:12px;padding:12px 14px}
  .card .l{font-size:12px;color:#66666b}
  .card .v{font-size:22px;font-weight:700;color:var(--accent);margin-top:2px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e6e3ee;border-radius:12px;overflow:hidden}
  th,td{padding:10px 12px;text-align:right;font-size:14px;border-bottom:1px solid #efedf4}
  th:first-child,td:first-child{text-align:left}
  thead th{background:#f0f7f4;color:#0f6e56;font-size:12.5px}
  tbody tr:last-child td{border-bottom:none}
  tfoot td{font-weight:700;background:#fafafe}
  .muted{color:#9a9aa6}
  .note{font-size:12.5px;color:#66666b;margin-top:14px}
  .empty{padding:30px;text-align:center;color:#9a9aa6}
</style></head><body>
  <div class="bar">G-Systems · Espace comptable</div>
  <div class="wrap">
    <div class="ctrl">
      <label class="period">Période :</label>
      <select id="month" onchange="loadMonth()"></select>
      <button class="btn" id="dl" onclick="download()">⬇ Télécharger tout le mois</button>
      <span class="period" id="periodeLabel"></span>
    </div>
    <div class="cards" id="cards"></div>
    <div id="tableZone"><div class="empty">Chargement…</div></div>
    <div class="note">Stats mises à jour à chaque clôture (live) et figées à l'envoi mensuel. Le bouton télécharge un ZIP avec un sous-dossier par technicien.</div>
  </div>

<script>
  var current = '';
  function eur(v){ return (v==null)?'—':(Number(v).toFixed(2)+' €'); }
  function intv(v){ return (v==null)?'—':v; }

  function init(){
    google.script.run.withSuccessHandler(function(months){
      var sel=document.getElementById('month');
      if(!months.length){ document.getElementById('tableZone').innerHTML='<div class="empty">Aucune donnée pour le moment.</div>'; return; }
      sel.innerHTML = months.map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('');
      current = months[0];
      loadMonth();
    }).getMonths();
  }

  function loadMonth(){
    current = document.getElementById('month').value || current;
    document.getElementById('tableZone').innerHTML='<div class="empty">Chargement…</div>';
    google.script.run.withSuccessHandler(render).getStats(current);
  }

  function render(rows){
    var tI=0,tT=0,tF=0,tP=0,tE=0,tC=0,per='';
    var body = rows.map(function(r){
      if(r.periode) per=r.periode;
      tI+=r.interventions||0; tT+=r.tickets||0; tF+=r.frais||0; tP+=r.primes||0; tE+=r.extensions||0; tC+=r.compteur||0;
      return '<tr><td>'+r.tech+'</td><td>'+intv(r.interventions)+'</td><td>'+intv(r.tickets)+'</td><td>'+eur(r.frais)+'</td><td>'+eur(r.primes)+'</td><td>'+intv(r.extensions)+'</td><td>'+intv(r.compteur)+'</td><td class="muted">'+r.fichiers+'</td></tr>';
    }).join('');
    document.getElementById('periodeLabel').textContent = per ? ('('+per+')') : '';
    document.getElementById('cards').innerHTML =
      card('Techniciens', rows.length) + card('Interventions', tI) +
      card('Total frais', tF.toFixed(2)+' €') + card('Total primes', tP.toFixed(2)+' €');
    if(!rows.length){ document.getElementById('tableZone').innerHTML='<div class="empty">Aucun technicien ce mois.</div>'; return; }
    document.getElementById('tableZone').innerHTML =
      '<table><thead><tr><th>Technicien</th><th>Interv.</th><th>Tickets</th><th>Frais</th><th>Primes</th><th>Extensions</th><th>Compteur</th><th>Fichiers</th></tr></thead>'+
      '<tbody>'+body+'</tbody>'+
      '<tfoot><tr><td>TOTAL</td><td>'+tI+'</td><td>'+tT+'</td><td>'+tF.toFixed(2)+' €</td><td>'+tP.toFixed(2)+' €</td><td>'+tE+'</td><td>'+tC+'</td><td></td></tr></tfoot></table>';
  }

  function card(l,v){ return '<div class="card"><div class="l">'+l+'</div><div class="v">'+v+'</div></div>'; }

  function download(){
    if(!current) return;
    var b=document.getElementById('dl'); b.disabled=true; b.textContent='Préparation du ZIP…';
    google.script.run.withSuccessHandler(function(r){
      b.disabled=false; b.textContent='⬇ Télécharger tout le mois';
      if(r && r.ok){ window.open(r.url,'_blank'); }
      else { alert('Erreur : '+((r&&r.error)||'inconnue')); }
    }).makeZip(current);
  }

  init();
</script>
</body></html>
`;
