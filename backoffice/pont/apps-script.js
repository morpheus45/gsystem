// Pont APK -> back-office, exécuté par un Apps Script SÉPARÉ (Drive/Backoffice).
// LECTURE SEULE du Drive (permission drive.readonly) : il ne crée, ne modifie
// ni ne supprime aucun fichier. En base, il ne fait qu'AJOUTER : une ligne déjà
// importée (même cle_source) est ignorée, rien n'est écrasé ni effacé.
// normaliser() et TABLES_PONT sont ajoutés à la construction (pont/normaliser.js).
// Réglages : constantes posées à la construction ; la clé serveur (secrète)
// est dans les Propriétés du script, jamais dans le code.

const RACINE = 'Sauvegardes G-Systems';   // apps-script/Code.js : ROOT_FOLDER
const MOIS = /^\d{4}-\d{2}$/;             // dossiers de cycle : AAAA-MM

function importer() {
  const cle = PropertiesService.getScriptProperties().getProperty('SUPABASE_CLE_SERVEUR');
  if (!cle) throw new Error('Propriété du script manquante : SUPABASE_CLE_SERVEUR');
  if (!cle.startsWith('sb_secret_')) {
    throw new Error('SUPABASE_CLE_SERVEUR doit être la clé SECRÈTE (sb_secret_...), pas la clé publique');
  }
  const dossiers = DriveApp.getRootFolder().getFoldersByName(RACINE);
  if (!dossiers.hasNext()) throw new Error('Dossier introuvable : ' + RACINE);
  const techs = dossiers.next().getFolders();
  const bilan = { techs: 0, fichiers: 0, erreurs: [] };
  while (techs.hasNext()) {
    const dossierTech = techs.next();
    const fichiers = donneesDuTech(dossierTech);
    if (!fichiers.length) continue;                 // ordres/, chat... : pas un tech
    bilan.techs++;
    const technicienId = technicien(cle, dossierTech.getName());
    for (const f of fichiers) {
      try {
        const r = normaliser(JSON.parse(f.getBlob().getDataAsString('UTF-8')),
          { societeId: SOCIETE_ID, technicienId });
        for (const bloc of Object.keys(TABLES_PONT)) ajouter(cle, TABLES_PONT[bloc], r[bloc]);
        bilan.fichiers++;
      } catch (e) {
        bilan.erreurs.push(dossierTech.getName() + '/' + f.getName() + ' : ' + e.message);
      }
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
    if (f.hasNext()) res.push(f.next());
  }
  return res;
}

// Id du technicien (créé au premier import ; un nom changé au bureau est gardé).
function technicien(cle, nomApk) {
  appel(cle, 'post', 'techniciens?on_conflict=societe_id,nom_apk',
    [{ societe_id: SOCIETE_ID, nom: nomApk, nom_apk: nomApk }], 'resolution=ignore-duplicates,return=minimal');
  const r = appel(cle, 'get', 'techniciens?select=id&societe_id=eq.' + SOCIETE_ID +
    '&nom_apk=eq.' + encodeURIComponent(nomApk));
  return r[0].id;
}

// Ajout seul, par paquets : un doublon (même cle_source) est ignoré.
function ajouter(cle, table, lignes) {
  for (let i = 0; i < lignes.length; i += 500) {
    appel(cle, 'post', table + '?on_conflict=societe_id,cle_source', lignes.slice(i, i + 500),
      'resolution=ignore-duplicates,return=minimal');
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
