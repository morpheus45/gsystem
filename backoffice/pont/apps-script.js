// Pont APK -> back-office, exécuté par un Apps Script SÉPARÉ (Drive/Backoffice).
// LECTURE SEULE du Drive (permission drive.readonly) : il ne crée, ne modifie
// ni ne supprime aucun fichier. En base, il ne fait qu'AJOUTER : une ligne déjà
// importée (même cle_source) est ignorée, rien n'est écrasé ni effacé.
// Exceptions : le logo de la société, posé s'il est déposé dans le Drive (logoDuDrive),
// et l'identité VIDE d'un véhicule, lue depuis sa plaque (identiteDuVehicule).
// normaliser() et TABLES_PONT sont ajoutés à la construction (pont/normaliser.js),
// normaliserPlaque() et lireFicheImmat() aussi (core/plaque.js).
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
  try {
    logoDuDrive(cle);
  } catch (e) {
    bilan.erreurs.push('logo : ' + e.message);
  }
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
    const r = dossierTech.getFilesByName('reglages.json');   // lu, jamais modifié
    const reglages = r.hasNext() ? JSON.parse(r.next().getBlob().getDataAsString('UTF-8')) : null;
    try {
      vehiculeDuTech(cle, reglages, technicienId, photos, premiereDate);
    } catch (e) {
      bilan.erreurs.push(dossierTech.getName() + '/véhicule : ' + e.message);
    }
    try {
      baremesDuTech(cle, reglages, technicienId);
    } catch (e) {
      bilan.erreurs.push(dossierTech.getName() + '/barèmes : ' + e.message);
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

// Barèmes de primes des réglages : le courant peut changer (mis à jour), un mois figé jamais.
function baremesDuTech(cle, reglages, technicienId) {
  if (!reglages) return;
  const ligne = (mois, prix) => ({ societe_id: SOCIETE_ID, technicien_id: technicienId, mois, prix: prix || {} });
  appel(cle, 'post', 'primes_tarifs?on_conflict=societe_id,technicien_id,mois', [ligne('courant', reglages.prices)],
    'resolution=merge-duplicates,return=minimal');
  const figes = Object.entries(reglages.primeTarifsParMois || {}).map(([m, p]) => ligne(m, p));
  if (figes.length) ajouter(cle, 'primes_tarifs', figes, 'societe_id,technicien_id,mois');
}

// Ajout seul, par paquets : un doublon (même clé unique) est ignoré.
function ajouter(cle, table, lignes, unique) {
  for (let i = 0; i < lignes.length; i += 500) {
    appel(cle, 'post', table + '?on_conflict=' + (unique || 'societe_id,cle_source'), lignes.slice(i, i + 500),
      'resolution=ignore-duplicates,return=minimal');
  }
}

// Véhicule du tech d'après l'APK : plaque des réglages, affectation, photos du compteur.
function vehiculeDuTech(cle, reglages, technicienId, photos, premiereDate) {
  const v = vehiculeDepuisApk(reglages, photos);
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
  identiteDuVehicule(cle, vehiculeId, v.plaque);
}

// Identité d'un véhicule sans marque, lue sur la fiche publique de sa plaque (core/plaque.js).
// N'écrit que dans une identité VIDE ; la base reprend alors le plan d'un véhicule identique.
// Une plaque introuvable n'est retentée qu'au bout de 7 jours (usage occasionnel).
function identiteDuVehicule(cle, vehiculeId, plaqueApk) {
  const vide = appel(cle, 'get', 'vehicules?select=id&marque=eq.&id=eq.' + vehiculeId);
  const plaque = normaliserPlaque(plaqueApk);
  if (!vide.length || !plaque) return;
  const props = PropertiesService.getScriptProperties();
  const essais = JSON.parse(props.getProperty('PLAQUES_LUES') || '{}');
  if (essais[plaque] && Date.now() - essais[plaque] < 7 * 86400000) return;
  essais[plaque] = Date.now();
  props.setProperty('PLAQUES_LUES', JSON.stringify(essais));
  const rep = UrlFetchApp.fetch('https://immatriculation-auto.info/vehicle/' + plaque, { muteHttpExceptions: true });
  const f = rep.getResponseCode() === 200 ? lireFicheImmat(rep.getContentText()) : null;
  if (!f) return;
  const motorisation = [f.carburant, f.boite && 'boîte ' + f.boite.toLowerCase(), f.annee && 'modèle ' + f.annee].filter(Boolean).join(', ');
  appel(cle, 'patch', 'vehicules?marque=eq.&id=eq.' + vehiculeId,
    { marque: f.marque, modele: f.modele, carburant: f.carburant, motorisation: motorisation }, 'return=minimal');
}

// Logo de la société : le fichier logo-backoffice.(webp|png|jpg) déposé n'importe où dans
// le Drive. Posé une fois par version du fichier (date retenue dans les Propriétés).
// Gardé tel quel : un WebP animé reste animé. La base vérifie le format et la taille.
function logoDuDrive(cle) {
  const types = { 'image/webp': 1, 'image/png': 1, 'image/jpeg': 1 };
  for (const nom of ['logo-backoffice.webp', 'logo-backoffice.png', 'logo-backoffice.jpg']) {
    const f = DriveApp.getFilesByName(nom);
    if (!f.hasNext()) continue;
    const fichier = f.next();
    const version = String(fichier.getLastUpdated().getTime());
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('LOGO_POSE') === version) return;
    const blob = fichier.getBlob();
    if (!types[blob.getContentType()]) throw new Error(nom + ' : format ' + blob.getContentType() + ' refusé');
    if (blob.getBytes().length > 220000) throw new Error(nom + ' : plus de 220 Ko');
    appel(cle, 'patch', 'societes?id=eq.' + SOCIETE_ID,
      { logo: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
    props.setProperty('LOGO_POSE', version);
    return;
  }
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
