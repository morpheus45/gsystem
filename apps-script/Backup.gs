/**
 * G-Systems — réception des sauvegardes + tableau de bord administratif.
 * POST (app) : range dans Sauvegardes G-Systems / <tech> / <mois> / <fichier>.
 * GET (navigateur) : page siglée G-Systems — global + tech par tech, sur
 * période choisie (Du/Au), KPIs + camembert + primes + clôtures.
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

/** ZIP de tous les fichiers dont le mois est dans [from, to] (un sous-dossier par tech/mois). */
function makeZip(from, to) {
  try {
    const fM = (from || '').slice(0, 7), tM = (to || '').slice(0, 7);
    const root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const blobs = []; const users = root.getFolders();
    while (users.hasNext()) {
      const u = users.next(); const tname = u.getName();
      if (tname === '_telechargements') continue;
      const months = u.getFolders();
      while (months.hasNext()) {
        const mf = months.next(); const mn = mf.getName();
        if (fM && mn < fM) continue;
        if (tM && mn > tM) continue;
        const files = mf.getFiles();
        while (files.hasNext()) { const f = files.next(); const b = f.getBlob().copyBlob(); b.setName(tname + '/' + mn + '/' + f.getName()); blobs.push(b); }
      }
    }
    if (!blobs.length) return { ok: false, error: 'Aucun fichier sur la période' };
    const zip = Utilities.zip(blobs, 'G-Systems_' + (fM || 'debut') + '_' + (tM || 'fin') + '.zip');
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
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

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
.seg:hover{color:var(--hi)}
.btn{background:var(--red);color:#fff;border:none;padding:9px 16px;border-radius:9px;font-size:13.5px;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.55}
.techcard{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin:14px 0}
.techcard.glob{border-color:var(--blue);box-shadow:0 0 0 1px rgba(79,163,255,.25)}
.th{font-size:17px;font-weight:800;margin-bottom:12px}
.chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:10px;margin-bottom:14px}
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
.ctab{max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:6px}
.clt{width:100%;border-collapse:collapse;font-size:12.5px}
.clt th,.clt td{padding:5px 9px;border-bottom:1px solid #1e212a;text-align:left;white-space:nowrap}
.clt thead th{position:sticky;top:0;background:var(--card2);color:var(--mid);font-size:11px}
.ok{color:#4ADE80}.nr{color:#FFB347}.an{color:#FF6B6B}
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
    <span class="sub">Du</span><input type="date" id="from" onchange="apply()">
    <span class="sub">au</span><input type="date" id="to" onchange="apply()">
    <button class="seg" onclick="preset(7)">7 j</button>
    <button class="seg" onclick="preset(30)">30 j</button>
    <button class="seg" onclick="preset('m')">Ce mois</button>
    <button class="seg" onclick="preset('all')">Tout</button>
    <button class="btn" id="dl" onclick="download()">⬇ Télécharger</button>
  </div>
  <div id="global"></div>
  <div id="techs"><div class="empty">Chargement…</div></div>
</div>
<script>
var DATA=[];
var COLORS=['#4FA3FF','#26A69A','#EF5350','#FFA726','#AB47BC','#66BB6A','#5C6BC0','#EC407A','#8D6E63','#42A5F5','#FFCA28','#78909C'];
function money(v){return (Number(v)||0).toFixed(2)+' €';}
function iso(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function setR(f,t){document.getElementById('from').value=f;document.getElementById('to').value=t;}
function init(){
  google.script.run.withSuccessHandler(function(data){
    DATA=data||[];
    var t=new Date(),f=new Date();f.setDate(f.getDate()-30);
    setR(iso(f),iso(t));apply();
  }).getAllData();
}
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
    frais:fr.reduce(function(s,x){return s+(Number(x.m)||0);},0),primes:totP,extensions:totE,
    repartition:Object.keys(rep).map(function(k){return{type:k,count:rep[k]};}).sort(function(a,b){return b.count-a.count;}),
    primesParType:ppt,clotures:clo};
}
function aggregate(techs){
  var g={tech:'VUE GLOBALE — tous les techniciens',interventions:0,tickets:0,frais:0,primes:0,extensions:0,repartition:[],primesParType:[],clotures:[]};
  var rep={},pri={},clo=[];
  techs.forEach(function(s){g.interventions+=s.interventions;g.tickets+=s.tickets;g.frais+=s.frais;g.primes+=s.primes;g.extensions+=s.extensions;
    s.repartition.forEach(function(x){rep[x.type]=(rep[x.type]||0)+x.count;});
    s.primesParType.forEach(function(x){if(!pri[x.type])pri[x.type]={type:x.type,qty:0,total:0};pri[x.type].qty+=x.qty;pri[x.type].total+=x.total;});
    s.clotures.forEach(function(c){clo.push({date:c.date,type:c.type,client:c.client,ville:c.ville,num:c.num,obs:c.obs,tech:s.tech});});});
  g.repartition=Object.keys(rep).map(function(k){return{type:k,count:rep[k]};}).sort(function(a,b){return b.count-a.count;});
  g.primesParType=Object.keys(pri).map(function(k){return pri[k];}).sort(function(a,b){return b.total-a.total;});
  g.clotures=clo;return g;}
function obsCell(o){var cl=(o==='OK')?'ok':((o==='Annulé')?'an':'nr');return '<span class="'+cl+'">'+o+'</span>';}
function cloturesTable(list,withTech){
  if(!list||!list.length)return '<div class="empty2">Aucune clôture sur la période</div>';
  var l=list.slice().sort(function(a,b){return (a.date<b.date)?1:(a.date>b.date)?-1:0;});
  var head='<tr><th>Date</th>'+(withTech?'<th>Tech</th>':'')+'<th>Type</th><th>Client</th><th>Ville</th><th>N°</th><th>Obs</th></tr>';
  var body=l.map(function(c){return '<tr><td>'+c.date+'</td>'+(withTech?'<td>'+(c.tech||'')+'</td>':'')+'<td>'+(c.type||'')+'</td><td>'+(c.client||'')+'</td><td>'+(c.ville||'')+'</td><td>'+(c.num||'')+'</td><td>'+obsCell(c.obs||'')+'</td></tr>';}).join('');
  return '<div class="ctab"><table class="clt"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>';}
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
function buildCard(s,glob){
  return '<div class="techcard'+(glob?' glob':'')+'">'+
    '<div class="th">'+(glob?'🌐 ':'👤 ')+s.tech+'</div>'+
    '<div class="chips">'+chip('Interventions',s.interventions||0)+chip('Tickets frais',s.tickets||0)+chip('Total frais',money(s.frais))+chip('Total primes',money(s.primes))+chip('Extensions',s.extensions||0)+'</div>'+
    '<div class="cols"><div class="col"><div class="ct">Répartition interventions</div>'+pie(s.repartition)+'</div>'+
    '<div class="col"><div class="ct">Primes par type</div>'+primesTable(s.primesParType)+'</div></div>'+
    '<div class="ct" style="margin-top:14px">Clôtures ('+((s.clotures||[]).length)+')</div>'+cloturesTable(s.clotures,glob)+'</div>';}
function apply(){
  var f=document.getElementById('from').value,t=document.getElementById('to').value;
  if(!DATA.length){document.getElementById('techs').innerHTML='<div class="empty">Aucune donnée pour le moment.</div>';document.getElementById('global').innerHTML='';return;}
  var techs=DATA.map(function(T){return computeTech(T,f,t);});
  document.getElementById('global').innerHTML=buildCard(aggregate(techs),true);
  document.getElementById('techs').innerHTML=techs.map(function(s){return buildCard(s,false);}).join('');
}
function download(){var f=document.getElementById('from').value,t=document.getElementById('to').value;
  var b=document.getElementById('dl');b.disabled=true;b.textContent='Préparation…';
  google.script.run.withSuccessHandler(function(r){b.disabled=false;b.textContent='⬇ Télécharger';
    if(r&&r.ok){window.open(r.url,'_blank');}else{alert('Erreur : '+((r&&r.error)||'inconnue'));}}).makeZip(f,t);}
init();
setInterval(function(){google.script.run.withSuccessHandler(function(d){DATA=d||[];apply();}).getAllData();},60000);
</script></body></html>
`;
