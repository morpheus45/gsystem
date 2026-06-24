/**
 * G-Systems — réception des sauvegardes + tableau de bord administratif.
 * POST (app)      : range dans Sauvegardes G-Systems / <tech> / <mois> / <fichier>.
 * GET (navigateur): page sigée G-Systems (stats par tech + vue globale + télécharger).
 *
 * Déployer -> Gérer les déploiements -> Modifier -> Nouvelle version.
 * Exécuter en tant que : MOI · Qui a accès : « Tout le monde ».
 */

const ROOT_FOLDER = 'Sauvegardes G-Systems';
const SHARED_TOKEN = 'gsys-backup-2026-7Kq2vR';

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.token !== SHARED_TOKEN) return json({ ok: false, error: 'token' });
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
  return HtmlService.createHtmlOutput(DASHBOARD_HTML)
    .setTitle('G-Systems · Espace administratif')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getMonths() {
  const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
  const set = {}; const users = root.getFolders();
  while (users.hasNext()) {
    const u = users.next(); if (u.getName() === '_telechargements') continue;
    const ms = u.getFolders(); while (ms.hasNext()) set[ms.next().getName()] = true;
  }
  const out = Object.keys(set); out.sort().reverse(); return out;
}

function getStats(month) {
  const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
  const rows = []; const users = root.getFolders();
  while (users.hasNext()) {
    const u = users.next(); if (u.getName() === '_telechargements') continue;
    const mIt = u.getFoldersByName(month); if (!mIt.hasNext()) continue;
    const mf = mIt.next();
    const row = { tech: u.getName(), periode: '', interventions: null, tickets: null,
      frais: null, primes: null, extensions: null, compteur: null, fichiers: 0,
      repartition: [], primesParType: [] };
    let n = 0; const fit = mf.getFiles(); while (fit.hasNext()) { fit.next(); n++; } row.fichiers = n;
    const sIt = mf.getFilesByName('_stats.json');
    if (sIt.hasNext()) { try {
      const s = JSON.parse(sIt.next().getBlob().getDataAsString('UTF-8'));
      row.periode = s.periode || ''; row.interventions = num(s.interventions); row.tickets = num(s.tickets);
      row.frais = num(s.frais); row.primes = num(s.primes); row.extensions = num(s.extensions); row.compteur = num(s.compteur);
      row.repartition = s.repartition || []; row.primesParType = s.primesParType || [];
    } catch (err) {} }
    rows.push(row);
  }
  rows.sort(function (a, b) { return String(a.tech).localeCompare(String(b.tech)); });
  return rows;
}

function makeZip(month) {
  try {
    const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const blobs = []; const users = root.getFolders();
    while (users.hasNext()) {
      const u = users.next(); if (u.getName() === '_telechargements') continue;
      const mIt = u.getFoldersByName(month); if (!mIt.hasNext()) continue;
      const mf = mIt.next(); const tname = u.getName(); const files = mf.getFiles();
      while (files.hasNext()) { const f = files.next(); const b = f.getBlob().copyBlob(); b.setName(tname + '/' + f.getName()); blobs.push(b); }
    }
    if (!blobs.length) return { ok: false, error: 'Aucun fichier pour ce mois' };
    const zip = Utilities.zip(blobs, 'G-Systems_' + month + '.zip');
    const dl = getOrCreateFolder(root, '_telechargements');
    const old = dl.getFiles(); while (old.hasNext()) { const o = old.next(); if (new Date() - o.getDateCreated() > 3600000) o.setTrashed(true); }
    const file = dl.createFile(zip);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, url: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
  } catch (err) { return { ok: false, error: String(err) }; }
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sanitize(s) { return String(s).replace(/[\/\\:*?"<>|]/g, '_').trim().slice(0, 80) || 'x'; }
function num(v) { const n = Number(v); return isNaN(n) ? null : n; }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

const DASHBOARD_HTML = `
<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
:root{--bg:#07080D;--card:#12141B;--card2:#1A1D26;--line:#2F3340;--hi:#F7F7F2;--mid:#B8BECC;--low:#7A8094;--blue:#4FA3FF;--red:#FF3D5A}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--hi)}
.head{text-align:center;padding:26px 16px 6px}
.logo{width:210px;max-width:62%;height:auto;overflow:visible}
.bl-g{fill:none;stroke:#ee2322;stroke-width:30;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:560;stroke-dashoffset:560;animation:bl-draw .7s cubic-bezier(.65,0,.35,1) forwards,bl-ignite .5s ease forwards .9s,bl-breathe 2.8s ease-in-out infinite 1.8s}
.bl-word{font-family:'Segoe UI',system-ui,sans-serif;font-weight:600;font-size:62px;letter-spacing:-1px;fill:#f4f4f0;opacity:0;animation:bl-wordin .4s ease forwards .35s,bl-shoot 1.05s cubic-bezier(.5,0,.15,1) forwards 1.3s}
@keyframes bl-draw{to{stroke-dashoffset:0}}
@keyframes bl-ignite{0%{stroke:#ee2322}100%{stroke:#ff4338;filter:drop-shadow(0 0 10px rgba(238,35,34,.55))}}
@keyframes bl-breathe{0%,100%{filter:drop-shadow(0 0 6px rgba(238,35,34,.4))}50%{filter:drop-shadow(0 0 16px rgba(238,35,34,.75))}}
@keyframes bl-wordin{to{opacity:1}}
@keyframes bl-shoot{0%{transform:translateX(0)}28%{transform:translateX(-95px)}50%{transform:translateX(-95px)}82%{transform:translateX(9px)}100%{transform:translateX(0)}}
.sub{color:var(--mid);font-size:13.5px;margin-top:2px}
.wrap{max-width:1000px;margin:0 auto;padding:8px 16px 60px}
.ctrl{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;margin:16px 0}
select{padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:15px;background:var(--card);color:var(--hi)}
.btn{background:var(--red);color:#fff;border:none;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.55}
.techcard{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin:14px 0}
.techcard.glob{border-color:var(--blue);box-shadow:0 0 0 1px rgba(79,163,255,.25)}
.th{font-size:17px;font-weight:800;margin-bottom:12px}
.th .per{color:var(--low);font-weight:400;font-size:12px}
.chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px}
.chip{background:var(--card2);border-radius:11px;padding:10px 12px}
.chip .cl{font-size:11px;color:var(--mid)}
.chip .cv{font-size:20px;font-weight:700;color:var(--blue);margin-top:2px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:620px){.cols{grid-template-columns:1fr}}
.ct{font-size:12.5px;color:var(--mid);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px}
.pieWrap{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
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
</style></head><body>
<div class="head">
  <svg class="logo" viewBox="0 0 470 200" xmlns="http://www.w3.org/2000/svg" aria-label="gsystems">
    <defs><clipPath id="m"><rect x="168" y="0" width="302" height="200"/></clipPath></defs>
    <path class="bl-g" d="M158,58 Q158,38 138,38 L62,38 Q38,38 38,62 L38,138 Q38,162 62,162 L138,162 Q162,162 162,138 L162,108 L112,108"/>
    <g clip-path="url(#m)"><text class="bl-word" x="178" y="128">systems</text></g>
  </svg>
  <div class="sub">Espace administratif · suivi en temps réel des clôtures</div>
</div>
<div class="wrap">
  <div class="ctrl">
    <label class="sub">Période :</label>
    <select id="month" onchange="loadMonth()"></select>
    <button class="btn" id="dl" onclick="download()">⬇ Télécharger tout le mois</button>
  </div>
  <div id="global"></div>
  <div id="techs"><div class="empty">Chargement…</div></div>
</div>
<script>
var current='';
var COLORS=['#4FA3FF','#26A69A','#EF5350','#FFA726','#AB47BC','#66BB6A','#5C6BC0','#EC407A','#8D6E63','#42A5F5','#FFCA28','#78909C'];
function money(v){return (Number(v)||0).toFixed(2)+' €';}
function init(){google.script.run.withSuccessHandler(function(months){
  var sel=document.getElementById('month');
  if(!months.length){document.getElementById('techs').innerHTML='<div class="empty">Aucune donnée pour le moment.</div>';return;}
  sel.innerHTML=months.map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('');
  current=months[0];loadMonth();}).getMonths();}
function loadMonth(){current=document.getElementById('month').value||current;
  document.getElementById('global').innerHTML='';document.getElementById('techs').innerHTML='<div class="empty">Chargement…</div>';
  google.script.run.withSuccessHandler(render).getStats(current);}
function aggregate(rows){
  var g={tech:'VUE GLOBALE — tous les techniciens',periode:'',interventions:0,tickets:0,frais:0,primes:0,extensions:0,compteur:0,repartition:[],primesParType:[]};
  var rep={},pri={};
  rows.forEach(function(r){if(r.periode)g.periode=r.periode;
    g.interventions+=r.interventions||0;g.tickets+=r.tickets||0;g.frais+=r.frais||0;g.primes+=r.primes||0;g.extensions+=r.extensions||0;g.compteur+=r.compteur||0;
    (r.repartition||[]).forEach(function(x){rep[x.type]=(rep[x.type]||0)+x.count;});
    (r.primesParType||[]).forEach(function(x){if(!pri[x.type])pri[x.type]={type:x.type,qty:0,total:0};pri[x.type].qty+=x.qty;pri[x.type].total+=x.total;});});
  g.repartition=Object.keys(rep).map(function(t){return {type:t,count:rep[t]};}).sort(function(a,b){return b.count-a.count;});
  g.primesParType=Object.keys(pri).map(function(t){return pri[t];}).sort(function(a,b){return b.total-a.total;});
  return g;}
function pie(rep){
  var total=(rep||[]).reduce(function(s,x){return s+x.count;},0);
  if(!total)return '<div class="empty2">Aucune intervention</div>';
  var acc=0,stops=[],legend='';
  rep.forEach(function(x,i){var c=COLORS[i%COLORS.length];var a=acc/total*100,b=(acc+x.count)/total*100;acc+=x.count;
    stops.push(c+' '+a.toFixed(2)+'% '+b.toFixed(2)+'%');
    legend+='<div class="leg"><span class="dot" style="background:'+c+'"></span>'+x.type+' <b>'+x.count+'</b> <span class="pct">('+Math.round(x.count/total*100)+'%)</span></div>';});
  return '<div class="pieWrap"><div class="pie" style="background:conic-gradient('+stops.join(',')+')"></div><div class="legend">'+legend+'</div></div>';}
function primesTable(pp){
  if(!pp||!pp.length)return '<div class="empty2">Aucune prime ce mois</div>';
  var tot=0;var body=pp.map(function(x){tot+=x.total;return '<tr><td>'+x.type+'</td><td>'+x.qty+'</td><td>'+money(x.total)+'</td></tr>';}).join('');
  return '<table class="pt"><thead><tr><th>Type</th><th>Qté</th><th>Prime</th></tr></thead><tbody>'+body+'</tbody><tfoot><tr><td>TOTAL PRIME</td><td></td><td>'+money(tot)+'</td></tr></tfoot></table>';}
function chip(l,v){return '<div class="chip"><div class="cl">'+l+'</div><div class="cv">'+v+'</div></div>';}
function buildCard(s,glob){
  return '<div class="techcard'+(glob?' glob':'')+'">'+
    '<div class="th">'+(glob?'🌐 ':'👤 ')+s.tech+(s.periode?' <span class="per">('+s.periode+')</span>':'')+'</div>'+
    '<div class="chips">'+chip('Interventions',s.interventions||0)+chip('Tickets frais',s.tickets||0)+chip('Total frais',money(s.frais))+chip('Total primes',money(s.primes))+'</div>'+
    '<div class="cols"><div class="col"><div class="ct">Répartition interventions</div>'+pie(s.repartition)+'</div>'+
    '<div class="col"><div class="ct">Primes par type</div>'+primesTable(s.primesParType)+'</div></div></div>';}
function render(rows){
  if(!rows||!rows.length){document.getElementById('global').innerHTML='';document.getElementById('techs').innerHTML='<div class="empty">Aucun technicien ce mois.</div>';return;}
  document.getElementById('global').innerHTML=buildCard(aggregate(rows),true);
  document.getElementById('techs').innerHTML=rows.map(function(r){return buildCard(r,false);}).join('');}
function download(){if(!current)return;var b=document.getElementById('dl');b.disabled=true;b.textContent='Préparation du ZIP…';
  google.script.run.withSuccessHandler(function(r){b.disabled=false;b.textContent='⬇ Télécharger tout le mois';
    if(r&&r.ok){window.open(r.url,'_blank');}else{alert('Erreur : '+((r&&r.error)||'inconnue'));}}).makeZip(current);}
init();
</script></body></html>
`;
