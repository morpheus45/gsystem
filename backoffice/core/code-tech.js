// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Code tech EPS : format vérifié avant l'envoi (comme la base, migration 42).
export function normaliserCodeTech(texte) {
  const c = String(texte || '').toUpperCase().replace(/\s/g, '');
  return c === '' ? '' : (/^[A-Z0-9]{2,20}$/.test(c) ? c : null);
}
