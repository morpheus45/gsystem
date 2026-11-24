// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Module du back-office : réglage de la société, sinon de sa holding, sinon actif (migration 40).

export function moduleActif(reglagesSocietes, reglagesHoldings, module, societe) {
  const s = reglagesSocietes.find((x) => x.societe_id === societe.id && x.module === module);
  if (s) return s.actif;
  const h = societe.holding_id ? reglagesHoldings.find((x) => x.holding_id === societe.holding_id && x.module === module) : undefined;
  return h?.actif ?? true;
}
