// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Passerelle des téléphones, dans un Apps Script SÉPARÉ : l'ancien script n'est pas modifié.
// traiter() est ajouté à la construction (passerelle/logique.js). Aucun appel d'effacement ici (testé).
// Propriétés du script (jamais dans le code) : SUPABASE_CLE_SERVEUR, ANCIEN_SCRIPT, ANCIEN_JETON.

const RACINE = 'Sauvegardes G-Systems';

function doPost(e) {
  const verrou = LockService.getScriptLock();
  let r;
  try {
    const p = JSON.parse(e.postData.contents);
    verrou.waitLock(25000);
    r = traiter(p, environnement_());
  } catch (err) {
    console.error(err);   // le détail reste dans le journal du script
    r = { ok: false, error: 'serveur' };
  } finally { verrou.releaseLock(); }
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}

function propriete_(nom) {
  const v = PropertiesService.getScriptProperties().getProperty(nom);
  if (!v) throw new Error('Propriété du script manquante : ' + nom);
  return v;
}

function environnement_() {
  return {
    maintenant: () => Date.now(),
    mail: (a, sujet, texte) => MailApp.sendEmail(a, sujet, texte, { name: 'G-Systems', noReply: false }),
    base: {
      verifier: (j, complet) => rpc_('telephone_verifier', { p_jeton: j, p_envoi_complet: complet })[0] || null,
      demanderCode: (m) => rpc_('telephone_demander_code', { p_mail: m })[0] || null,
      connecter: (m, c, a, ok) => rpc_('telephone_connecter', { p_mail: m, p_code: c, p_appareil: a, confirme: ok })[0] || null,
      modules: (j, support) => rpc_('telephone_modules', { p_jeton: j, p_support: support }),
      tuiles: (j) => rpc_('telephone_tuiles', { p_jeton: j }),
      saisie: (x) => rpc_('telephone_saisie', x),
    },
    relais: (p) => {
      const rep = UrlFetchApp.fetch(propriete_('ANCIEN_SCRIPT'), { method: 'post', contentType: 'application/json',
        payload: JSON.stringify(Object.assign({ token: propriete_('ANCIEN_JETON') }, p)), muteHttpExceptions: true });
      return JSON.parse(rep.getContentText());
    },
    // Le dossier du technicien doit déjà exister : jamais de second dossier vide à côté du vrai.
    drive: (nom) => {
      const r = DriveApp.getRootFolder().getFoldersByName(RACINE);
      if (!r.hasNext()) throw new Error('Dossier introuvable : ' + RACINE);
      const it = r.next().getFoldersByName(nom);
      if (!it.hasNext()) throw new Error('Dossier du technicien introuvable');
      const d = it.next();
      if (it.hasNext()) throw new Error('Dossier du technicien en double');
      return dossier_(d);
    },
  };
}

function rpc_(nom, corps) {
  const cle = propriete_('SUPABASE_CLE_SERVEUR');
  const rep = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + nom, { method: 'post', contentType: 'application/json',
    headers: { apikey: cle }, payload: JSON.stringify(corps), muteHttpExceptions: true });
  if (rep.getResponseCode() >= 300) throw new Error(nom + ' : ' + rep.getResponseCode());
  return JSON.parse(rep.getContentText());
}

function liste_(it) { const l = []; while (it.hasNext()) l.push(it.next()); return l; }

function dossier_(d) {
  return {
    nom: d.getName(),
    brut: d,
    dossiers: () => liste_(d.getFolders()).map(dossier_),
    dossier: (nom, creer) => {
      const it = d.getFoldersByName(nom);
      if (it.hasNext()) return dossier_(it.next());
      return creer ? dossier_(d.createFolder(nom)) : null;
    },
    fichiers: () => liste_(d.getFiles()).map(fichier_),
    creer: (nom, mime, b64) => { d.createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, nom)); },
  };
}

function fichier_(f) {
  return {
    nom: f.getName(),
    date: f.getLastUpdated().getTime(),
    texte: () => f.getBlob().getDataAsString('UTF-8'),
    base64: () => Utilities.base64Encode(f.getBlob().getBytes()),
    reecrire: (b64) => f.setContent(Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString('UTF-8')),
    ranger: (dest, nom) => { f.moveTo(dest.brut); f.setName(nom); },
  };
}
