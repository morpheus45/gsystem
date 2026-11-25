// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Modules personnalisés : mêmes règles que la base (migration 32), pour prévenir avant l'envoi.

export const TYPES_CHAMP = { texte: 'Texte', nombre: 'Nombre', date: 'Date', case: 'Case à cocher',
  liste: 'Liste de choix', photo: 'Photo', signature: 'Signature' };

// Clé stable d'un champ, tirée de son libellé ; jamais celle d'un autre champ, même ancien.
export function cleChamp(libelle, prises = []) {
  const base = (String(libelle || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '') || 'champ').slice(0, 34);
  let cle = base;
  for (let i = 2; prises.includes(cle); i++) cle = `${base}_${i}`;
  return cle;
}

// Premier défaut du module, en clair ; null si tout est bon.
export function defautModule({ nom, finalite, conservation, champs }) {
  const n = String(nom || '').trim(), f = String(finalite || '').trim();
  if (n.length < 2 || n.length > 40) return 'Nom : 2 à 40 caractères.';
  if (f.length < 10 || f.length > 300) return 'Dites à quoi servent les données (10 à 300 caractères).';
  if (!Number.isInteger(conservation) || conservation < 1 || conservation > 120) return 'Conservation : 1 à 120 mois.';
  if (!champs.length || champs.length > 30) return 'Ajoutez de 1 à 30 champs.';
  for (const c of champs) {
    const l = String(c.libelle || '').trim();
    if (!l || l.length > 60) return 'Chaque champ a un nom de 1 à 60 caractères.';
    if (!TYPES_CHAMP[c.type]) return `« ${l} » : type inconnu.`;
    if (c.type === 'liste' && (c.choix.length < 2 || c.choix.length > 30 || c.choix.some((x) => !x || x.length > 60)))
      return `« ${l} » : 2 à 30 choix, de 60 caractères au plus.`;
  }
  return null;
}

// Réglage d'une société : le sien d'abord, sinon celui de sa holding.
export function enService(portees, societe) {
  const p = portees.find((x) => x.societe_id === societe.id)
    ?? (societe.holding_id ? portees.find((x) => x.holding_id === societe.holding_id) : undefined);
  return p?.actif ?? false;
}
