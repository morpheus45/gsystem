export const REGLES_DEFAUT = {
  heures: { seuilHebdo: 35, tranche25: 8, taux1: 0.25, taux2: 0.5, typesAbsence: ['VACANCES', 'FERIE'], dimancheCompte: false },
  sources: { majoration: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020341', tauxMinimum: 'https://travail-emploi.gouv.fr/les-heures-supplementaires-contreparties' }
};

function fusionProfonde(dest, src) {
  const out = { ...dest };
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      out[k] = fusionProfonde(out[k] || {}, src[k]);
    } else {
      out[k] = src[k];
    }
  }
  return out;
}

export function reglesDe(societe = {}) {
  const result = fusionProfonde(REGLES_DEFAUT, societe.regles || {});
  result.valide = Boolean(societe.regles_valide_par && societe.regles_valide_le);
  const heures = result.heures;
  if (heures.taux1 < 0.10 || heures.taux2 < 0.10) {
    throw new Error('taux de majoration inferieur au seuil de 10 %');
  }
  return result;
}
