/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Photos des tickets. Elles sont redimensionnees AVANT stockage : une photo
// d'iPhone pese 3 a 5 Mo, et le stockage local du navigateur est limite a
// quelques mega-octets. 1600 px de cote suffisent largement a relire un
// ticket, pour un poids divise par dix.

const CLE = 'gsys.photos';
const COTE_MAX = 1600;
const QUALITE = 0.72;

function lireToutes() {
  try { return JSON.parse(localStorage.getItem(CLE) || '{}'); }
  catch (e) { return {}; }
}

export function photo(nom) { return lireToutes()[nom] || null; }

export function enregistrerPhoto(nom, dataUrl) {
  const t = lireToutes();
  t[nom] = dataUrl;
  try { localStorage.setItem(CLE, JSON.stringify(t)); return true; }
  catch (e) { return false; }   // quota depasse
}

export function supprimerPhoto(nom) {
  const t = lireToutes();
  delete t[nom];
  try { localStorage.setItem(CLE, JSON.stringify(t)); } catch (e) { /* ignore */ }
}

/** Redimensionne et compresse une photo prise par l'appareil. */
export function reduire(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('lecture impossible'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image illisible'));
      img.onload = () => {
        const ratio = Math.min(1, COTE_MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * ratio);
        c.height = Math.round(img.height * ratio);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', QUALITE));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

/** Nom de fichier propre, comme PhotoStorage.fraisAttachmentName. */
export function nomTicket(categorie, index) {
  const cat = String(categorie || 'DIVERS').toUpperCase().replace(/[^A-Z0-9-]/g, '_');
  return 'FRAIS-' + cat + (index > 1 ? '-' + index : '') + '.jpg';
}
