// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tuiles d'origine de l'APK qui peuvent être cachées (migration 39). Clôture et envoi mensuel : jamais.

export const TUILES_APK = [['arrivee', 'Arrivée sur site'], ['attente', 'Attente client'], ['techline', 'Appel techline'],
  ['logistique', 'Problème logistique'], ['courrier', 'Courrier'], ['pv_cameras', 'PV caméras'], ['bulletin', 'Bulletin inter'],
  ['brouillard', 'Demande brouillard'], ['recap', 'Récap'], ['frais', 'Frais'], ['prime', 'Prime à venir'], ['conge', 'Demande de congé']];

// Réglage de la société, sinon celui de sa holding, sinon visible.
export function tuileVisible(reglages, tuile, societe) {
  const r = reglages.find((x) => x.tuile === tuile && x.societe_id === societe.id)
    ?? (societe.holding_id ? reglages.find((x) => x.tuile === tuile && x.holding_id === societe.holding_id) : undefined);
  return r?.visible ?? true;
}
