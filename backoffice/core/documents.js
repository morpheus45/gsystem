// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Documents d'embauche : ce qui est demandé et où on en est.

// Réglage : celui de la société, sinon de sa holding, sinon la liste commune.
export function exigence(type, regles, societe) {
  const siennes = regles.filter((r) => r.type === type.code);
  const r = siennes.find((x) => x.societe_id === societe.id)
    ?? (societe.holding_id ? siennes.find((x) => x.holding_id === societe.holding_id) : undefined);
  return r?.exige ?? type.exige;
}

const plusMoisDoc = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`), jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(Math.min(jour, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
};

// Date limite d'une remise : expiration du document, ou contrôle à refaire. Vide = sans limite.
export const limiteDocument = (type, remise) => remise.expire_le || (type.rappel_mois ? plusMoisDoc(remise.vu_le, type.rappel_mois) : '');

// État d'un document : recu, bientot (60 jours), expire, manquant, facultatif ; et la remise qui compte.
export function etatDocument(type, exige, remises, aujourdhui) {
  const valables = remises.filter((r) => r.type === type.code && !r.ecarte);
  if (!valables.length) return { etat: exige === 'obligatoire' ? 'manquant' : 'facultatif', remise: null };
  const cle = (r) => limiteDocument(type, r) || '9999';
  const remise = [...valables].sort((a, b) => cle(b).localeCompare(cle(a)) || b.cree_le.localeCompare(a.cree_le))[0];
  const limite = limiteDocument(type, remise);
  if (!limite) return { etat: 'recu', remise };
  if (limite < aujourdhui) return { etat: 'expire', remise };
  const d = new Date(`${aujourdhui}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 60);
  return { etat: limite <= d.toISOString().slice(0, 10) ? 'bientot' : 'recu', remise };
}
