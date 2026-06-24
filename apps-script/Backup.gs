/**
 * G-Systems — réception des sauvegardes et rangement sur le Drive.
 *
 * DÉPLOIEMENT (à faire une fois, sous le compte Google qui possède le Drive
 * partagé G-Systems) :
 *   1. https://script.google.com → Nouveau projet → colle ce fichier.
 *   2. Déployer → Nouveau déploiement → type « Application Web ».
 *        - Exécuter en tant que : MOI (le propriétaire du Drive)
 *        - Qui a accès : « Tout le monde »
 *   3. Autorise les accès Drive quand c'est demandé.
 *   4. Copie l'URL « /exec » du déploiement → donne-la au dev (elle est codée
 *      dans l'app comme les adresses mail).
 *
 * L'app Android envoie un POST JSON :
 *   { token, user, month, fileName, mimeType, dataBase64 }
 * Le fichier est rangé dans :  Sauvegardes G-Systems / <user> / <month> / <fileName>
 */

const ROOT_FOLDER = 'Sauvegardes G-Systems';
// Doit être IDENTIQUE à BackupConfig.TOKEN côté app (anti-spam basique).
const SHARED_TOKEN = 'gsys-backup-2026-7Kq2vR';

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

    // Remplace un fichier de même nom dans le mois (évite les doublons).
    const same = monthFolder.getFilesByName(p.fileName || 'fichier');
    while (same.hasNext()) same.next().setTrashed(true);

    const file = monthFolder.createFile(blob);
    return json({ ok: true, id: file.getId(), name: file.getName() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Permet un test rapide dans le navigateur (GET sur l'URL /exec).
function doGet() {
  return json({ ok: true, service: 'gsystem-backup', root: ROOT_FOLDER });
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sanitize(s) {
  return String(s).replace(/[\/\\:*?"<>|]/g, '_').trim().slice(0, 80) || 'x';
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
