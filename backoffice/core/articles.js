// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).

// Nettoyage et validation d'une référence article : majuscules, A-Z 0-9 - _ , longueur 1-30.
export function normaliserReference(texte) {
  if (typeof texte !== 'string') return null;
  const nettoye = texte.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,30}$/.test(nettoye)) return null;
  return nettoye;
}

// Validation EAN-13 : 13 chiffres, clé de contrôle valide (somme impairs + 3*pairs multiple de 10).
export function normaliserEan13(texte) {
  if (typeof texte !== 'string') return null;
  const nettoye = texte.replace(/\s+/g, '');
  if (!/^\d{13}$/.test(nettoye)) return null;
  let somme = 0;
  for (let i = 0; i < 12; i++) {
    const chiffre = parseInt(nettoye[i], 10);
    somme += (i % 2 === 0) ? chiffre : chiffre * 3;
  }
  const cle = (10 - (somme % 10)) % 10;
  if (cle !== parseInt(nettoye[12], 10)) return null;
  return nettoye;
}

// Nettoyage d'un libellé : trim, espaces multiples → simple espace, longueur 1-120.
export function normaliserLibelle(texte) {
  if (typeof texte !== 'string') return null;
  const nettoye = texte.trim().replace(/\s+/g, ' ');
  if (nettoye.length < 1 || nettoye.length > 120) return null;
  return nettoye;
}