// Pont APK -> back-office, exécuté par un Apps Script SÉPARÉ (Drive/Backoffice).
// LECTURE SEULE du Drive (permission drive.readonly) : il ne crée, ne modifie
// ni ne supprime aucun fichier. En base, il ne fait qu'AJOUTER : une ligne déjà
// importée (même cle_source) est ignorée, rien n'est écrasé ni effacé.
// normaliser() et TABLES_PONT sont ajoutés à la construction (pont/normaliser.js).
// Réglages : constantes posées à la construction ; la clé serveur (secrète)
// est dans les Propriétés du script, jamais dans le code.

const RACINE = 'Sauvegardes G-Systems';   // apps-script/Code.js : ROOT_FOLDER
const MOIS = /^\d{4}-\d{2}$/;             // dossiers de cycle : AAAA-MM
const MAX_PHOTOS = 100;                   // par passage (Apps Script s'arrête à 6 min) ; la suite au passage suivant

function importer() {
  const cle = PropertiesService.getScriptProperties().getProperty('SUPABASE_CLE_SERVEUR');
  if (!cle) throw new Error('Propriété du script manquante : SUPABASE_CLE_SERVEUR');
  if (!cle.startsWith('sb_secret_')) {
    throw new Error('SUPABASE_CLE_SERVEUR doit être la clé SECRÈTE (sb_secret_...), pas la clé publique');
  }
  const dossiers = DriveApp.getRootFolder().getFoldersByName(RACINE);
  if (!dossiers.hasNext()) throw new Error('Dossier introuvable : ' + RACINE);
  const techs = dossiers.next().getFolders();
  const bilan = { techs: 0, fichiers: 0, photos: 0, photosIntrouvables: 0, erreurs: [] };
  while (techs.hasNext()) {
    const dossierTech = techs.next();
    const fichiers = donneesDuTech(dossierTech);
    if (!fichiers.length) continue;                 // ordres/, chat... : pas un tech
    bilan.techs++;
    const technicienId = technicien(cle, dossierTech.getName());
    const dejaCopiees = new Set(appel(cle, 'get', 'photos_apk?select=cle_source&technicien_id=eq.' + technicienId +
      '&stockage=not.is.null').map((p) => p.cle_source));
    const photos = {};          // toutes les photos du tech (pour le compteur)
    let premiereDate = null;    // 1re donnée du tech (début de sa 1re affectation)
    for (const { fichier: f, dossier } of fichiers) {
      try {
        const donnees = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
        const r = normaliser(donnees, { societeId: SOCIETE_ID, technicienId });
        for (const bloc of Object.keys(TABLES_PONT)) ajouter(cle, TABLES_PONT[bloc], r[bloc]);
        copierPhotos(cle, technicienId, dossier, r.photos, dejaCopiees, bilan);
        Object.assign(photos, donnees.photos || {});
        for (const t of r.temps) if (t.date && (!premiereDate || t.date < premiereDate)) premiereDate = t.date;
        bilan.fichiers++;
      } catch (e) {
        bilan.erreurs.push(dossierTech.getName() + '/' + f.getName() + ' : ' + e.message);
      }
    }
    try {
      vehiculeDuTech(cle, dossierTech, technicienId, photos, premiereDate);
    } catch (e) {
      bilan.erreurs.push(dossierTech.getName() + '/véhicule : ' + e.message);
    }
  }
  console.log(JSON.stringify(bilan));
  return bilan;
}

// Les donnees.json des dossiers de cycle (AAAA-MM) d'un tech.
function donneesDuTech(dossierTech) {
  const res = [];
  const mois = dossierTech.getFolders();
  while (mois.hasNext()) {
    const m = mois.next();
    if (!MOIS.test(m.getName())) continue;
    const f = m.getFilesByName('donnees.json');
    if (f.hasNext()) res.push({ fichier: f.next(), dossier: m });
  }
  return res;
}

// Copie des photos du cycle dans le stockage privé « photos » de la société
// (<société>/apk/<tech>/<AAAA-MM>/<nom>), pour qu'elles soient consultables dans le
// back-office. Le Drive est seulement LU. Une photo déjà copiée n'est pas renvoyée.
function copierPhotos(cle, technicienId, dossier, photos, dejaCopiees, bilan) {
  for (const p of photos) {
    if (dejaCopiees.has(p.cle_source) || bilan.photos >= MAX_PHOTOS) continue;
    const f = dossier.getFilesByName(p.nom_drive);
    if (!f.hasNext()) { bilan.photosIntrouvables++; continue; }
    try {   // une photo refusée ne bloque pas les suivantes
      copierUnePhoto(cle, technicienId, dossier, p, f.next().getBlob());
      dejaCopiees.add(p.cle_source);
      bilan.photos++;
    } catch (e) {
      bilan.erreurs.push(p.nom_drive + ' : ' + e.message);
    }
  }
}

function copierUnePhoto(cle, technicienId, dossier, p, blob) {
  const chemin = [SOCIETE_ID, 'apk', technicienId, dossier.getName(), p.nom_drive].join('/');
  const rep = UrlFetchApp.fetch(SUPABASE_URL + '/storage/v1/object/photos/' + chemin.split('/').map(encodeURIComponent).join('/'), {
    method: 'post', contentType: blob.getContentType() || 'image/jpeg', payload: blob.getBytes(),
    headers: { apikey: cle, 'x-upsert': 'true' }, muteHttpExceptions: true,
  });
  if (rep.getResponseCode() >= 300) throw new Error('photo ' + p.nom_drive + ' : ' + rep.getResponseCode() + ' ' + rep.getContentText().slice(0, 200));
  appel(cle, 'patch', 'photos_apk?societe_id=eq.' + SOCIETE_ID + '&cle_source=eq.' + encodeURIComponent(p.cle_source),
    { stockage: chemin }, 'return=minimal');
}

// Id du technicien (créé au premier import ; un nom changé au bureau est gardé).
function technicien(cle, nomApk) {
  appel(cle, 'post', 'techniciens?on_conflict=societe_id,nom_apk',
    [{ societe_id: SOCIETE_ID, nom: nomApk, nom_apk: nomApk }], 'resolution=ignore-duplicates,return=minimal');
  const r = appel(cle, 'get', 'techniciens?select=id&societe_id=eq.' + SOCIETE_ID +
    '&nom_apk=eq.' + encodeURIComponent(nomApk));
  return r[0].id;
}

// Ajout seul, par paquets : un doublon (même clé unique) est ignoré.
function ajouter(cle, table, lignes, unique) {
  for (let i = 0; i < lignes.length; i += 500) {
    appel(cle, 'post', table + '?on_conflict=' + (unique || 'societe_id,cle_source'), lignes.slice(i, i + 500),
      'resolution=ignore-duplicates,return=minimal');
  }
}

// Véhicule du tech d'après l'APK : plaque des réglages, affectation, photos du compteur.
function vehiculeDuTech(cle, dossierTech, technicienId, photos, premiereDate) {
  const f = dossierTech.getFilesByName('reglages.json');   // lu, jamais modifié
  const v = vehiculeDepuisApk(f.hasNext() ? JSON.parse(f.next().getBlob().getDataAsString('UTF-8')) : null, photos);
  if (!v.plaque) return;
  ajouter(cle, 'vehicules', [{ societe_id: SOCIETE_ID, plaque: v.plaque }], 'societe_id,plaque');
  const vehiculeId = appel(cle, 'get', 'vehicules?select=id&societe_id=eq.' + SOCIETE_ID +
    '&plaque=eq.' + encodeURIComponent(v.plaque))[0].id;
  const ouvertes = appel(cle, 'get', 'affectations?select=id,vehicule_id,debut&technicien_id=eq.' + technicienId + '&fin=is.null');
  const aujourdhui = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  const plan = planAffectation(ouvertes, vehiculeId, aujourdhui, premiereDate);
  plan.fermer.forEach((a) => appel(cle, 'patch', 'affectations?id=eq.' + a.id, { fin: a.fin }));
  if (plan.ouvrir) {
    appel(cle, 'post', 'affectations', [Object.assign({ societe_id: SOCIETE_ID, technicien_id: technicienId }, plan.ouvrir)], 'return=minimal');
  }
  ajouter(cle, 'vehicules_photos', v.photosCompteur.map((p) => ({ societe_id: SOCIETE_ID, vehicule_id: vehiculeId,
    type: 'compteur', periode: p.periode, source: 'apk', emplacement: 'drive:' + p.nom_drive })), 'societe_id,emplacement');
}

function appel(cle, methode, chemin, corps, prefer) {
  const rep = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + chemin, {
    method: methode,
    contentType: 'application/json',
    headers: Object.assign({ apikey: cle }, prefer ? { Prefer: prefer } : {}),
    payload: corps ? JSON.stringify(corps) : undefined,
    muteHttpExceptions: true,
  });
  const code = rep.getResponseCode();
  if (code >= 300) throw new Error(methode + ' ' + chemin.split('?')[0] + ' : ' + code + ' ' + rep.getContentText().slice(0, 300));
  const texte = rep.getContentText();
  return texte ? JSON.parse(texte) : null;
}

// À lancer UNE fois : importe tout, puis installe l'import automatique toutes les heures.
function installer() {
  ScriptApp.getProjectTriggers().forEach((d) => ScriptApp.deleteTrigger(d));   // ceux de CE script seulement
  ScriptApp.newTrigger('importer').timeBased().everyHours(1).create();
  return importer();
}
