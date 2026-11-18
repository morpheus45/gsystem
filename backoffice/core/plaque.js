// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Identité d'un véhicule lue sur la fiche publique d'immatriculation-auto.info, à son
// entrée dans la flotte (usage occasionnel, nos propres véhicules, faits seulement).
// Copié tel quel dans l'Apps Script (outils/apps-script-build.sh) : pas d'import ici.

// Format SIV (AA-123-AA) seulement ; tout le reste est refusé.
export function normaliserPlaque(texte) {
  const p = String(texte || '').toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) ? p : null;
}

export function lireFicheImmat(html) {
  const s = String(html || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const champ = (nom) => (s.match(new RegExp(`"${nom}":\\[0,"([^"]*)"\\]`)) || [])[1] || '';
  const marque = champ('brand').trim(), modele = champ('model').trim();
  if (!marque || !modele) return null;
  const description = (s.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  return {
    marque, modele,
    annee: Number(champ('year')) || null,
    carburant: (description.match(/carburant (\S+)/) || [])[1] || '',
    boite: (description.match(/ et sa (\S+)$/) || [])[1] || '',
  };
}
