// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tiers du système : SIREN, SIRET, numéro de téléphone français, adresse e-mail.

const nettoyerTiers = (texte) => String(texte || '').replace(/[\s.-]/g, '');

// Vérification de la clé de Luhn sur une chaîne de chiffres.
const luhnOk = (s) => {
  let sum = 0;
  for (let i = s.length - 1, alt = false; i >= 0; i--, alt = !alt) {
    let n = +s[i];
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
};

// SIREN : 9 chiffres, clé de Luhn.
export function normaliserSiren(texte) {
  const s = nettoyerTiers(texte);
  return /^\d{9}$/.test(s) && luhnOk(s) ? s : null;
}

// SIRET : 14 chiffres, clé de Luhn.
export function normaliserSiret(texte) {
  const s = nettoyerTiers(texte);
  return /^\d{14}$/.test(s) && luhnOk(s) ? s : null;
}

// Téléphone français : accepte +33, 0033, espaces, points, tirets.
// Renvoie '0X XX XX XX XX'.
export function normaliserTelFr(texte) {
  let s = nettoyerTiers(String(texte || '').trim());
  if (s.startsWith('+33')) s = '0' + s.slice(3);
  else if (s.startsWith('0033')) s = '0' + s.slice(4);
  if (!/^0[1-9]\d{8}$/.test(s)) return null;
  return s.slice(0, 2) + ' ' + s.slice(2, 4) + ' ' + s.slice(4, 6) + ' ' + s.slice(6, 8) + ' ' + s.slice(8, 10);
}

// E-mail : trim + minuscules + validation simple.
export function normaliserEmail(texte) {
  const s = String(texte || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}