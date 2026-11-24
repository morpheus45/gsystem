// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Saisies des modules personnalisés : réponses en clair, dans l'ordre des champs de la version remplie.

const dateSaisie = (t) => String(t).split('-').reverse().join('/');

// null si le champ n'a pas été rempli.
export function texteReponse(champ, valeur) {
  if (valeur === undefined || valeur === null || valeur === '') return null;
  if (champ.type === 'case') return valeur ? 'Oui' : 'Non';
  if (champ.type === 'nombre') return Number(valeur).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
  if (champ.type === 'date') return dateSaisie(valeur);
  if (champ.type === 'photo') return `Photo dans le Drive (${valeur})`;
  if (champ.type === 'signature') return `Signature dans le Drive (${valeur})`;
  return String(valeur);
}

// Une clé sans champ connu reste montrée telle quelle : rien ne se cache.
export function reponses(champs, valeurs) {
  const connus = (champs || []).map((c) => ({ libelle: c.libelle, texte: texteReponse(c, (valeurs || {})[c.cle]) }));
  const reste = Object.keys(valeurs || {}).filter((k) => !(champs || []).some((c) => c.cle === k))
    .map((k) => ({ libelle: k, texte: texteReponse({ type: 'texte' }, valeurs[k]) }));
  return [...connus, ...reste];
}
