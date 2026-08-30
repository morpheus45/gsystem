/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Messages Viber - repris mot pour mot de viber/ViberSender.kt. Le bureau doit
// recevoir le meme texte, que le technicien soit sur Android ou sur iPhone.

/** Phrase de cloture : dept type client ville numero + observation. */
export function messageCloture(e) {
  const morceaux = [
    (e.departement || '').trim(),
    (e.typeMission || '').trim().toLowerCase(),
    (e.nomClient || '').trim().toLowerCase(),
    (e.ville || '').trim().toLowerCase(),
    (e.numeroIntervention || '').trim(),
  ].filter(function (m) { return m; });
  const base = morceaux.join(' ');
  const suffixes = {
    NR_CLIENT: 'NR CLIENT', NR_TECHNIQUE: 'NR TECHNIQUE',
    NR_CLIENT_ABS: 'NR CLIENT ABS', NR_AUTRES: 'NR AUTRES', ANNULE: 'ANNULE',
  };
  const suffixe = suffixes[e.observationType] || 'ok';
  const note = (e.observations || '').trim().toLowerCase();
  const estNr = (e.observationType || '').indexOf('NR_') === 0;
  return (estNr && note) ? base + ' ' + suffixe + ' - ' + note : base + ' ' + suffixe;
}

/** Procedure attente client : l'heure est figee au moment du clic. */
export function messageAttente() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'PROC\u00c9DURE ATTENTE CLIENT\nD\u00e9but : '
       + p(d.getHours()) + 'h' + p(d.getMinutes());
}

export const RAPPEL_ATTENTE =
  'Rappel : appels toutes les 15 minutes jusqu\'au d\u00e9part valid\u00e9 par la '
  + 'techline 03.88.39.88.94 (CHOIX 2 PUIS 3).';

/**
 * Ouvre la feuille de partage d'iOS, ou Viber figure : c'est l'equivalent
 * exact du selecteur Android. Si le partage n'est pas disponible (navigateur
 * de bureau), le texte est copie pour ne pas laisser le technicien bloque.
 */
export async function partager(texte) {
  if (navigator.share) {
    try { await navigator.share({ text: texte }); return 'partage'; }
    catch (e) { if (e && e.name === 'AbortError') return 'annule'; }
  }
  try { await navigator.clipboard.writeText(texte); return 'copie'; }
  catch (e) { return 'echec'; }
}
