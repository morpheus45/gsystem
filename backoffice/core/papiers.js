// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Papiers du technicien : permis de conduire et n° de sécurité sociale (NIR).
// Mêmes règles que la base (migration 31), pour prévenir avant l'envoi.

const nettoyerPapier = (texte) => String(texte || '').toUpperCase().replace(/[\s.-]/g, '');

// NIR : 15 caractères, Corse 2A/2B, clé = 97 - (13 premiers chiffres mod 97).
export function normaliserNir(texte) {
  const n = nettoyerPapier(texte);
  if (!/^[1-478]\d{2}(0[1-9]|1[0-2]|[2-9]\d)(2A|2B|\d{2})\d{8}$/.test(n)) return null;
  const corps = BigInt(n.slice(0, 13).replace('2A', '19').replace('2B', '18'));
  return 97n - (corps % 97n) === BigInt(n.slice(13)) ? n : null;
}

// N° de permis : lettres et chiffres, 6 à 20 (ancien et nouveau format, permis étrangers).
export function normaliserPermis(texte) {
  const n = nettoyerPapier(texte);
  return /^[A-Z0-9]{6,20}$/.test(n) ? n : null;
}

// Affichage masqué : seuls les 4 derniers caractères restent lisibles.
export function masquer(numero) {
  const n = String(numero || '');
  return n.length > 4 ? '•••• ' + n.slice(-4) : n;
}

// NIR lisible par blocs : 1 85 05 78 006 084 91.
export function grouperNir(nir) {
  const n = String(nir || '');
  return n.length === 15 ? [n[0], n.slice(1, 3), n.slice(3, 5), n.slice(5, 7), n.slice(7, 10), n.slice(10, 13), n.slice(13)].join(' ') : n;
}
