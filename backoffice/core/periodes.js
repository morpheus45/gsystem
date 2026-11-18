// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Clôture du mois de paie (décision du 17/11/2026) : un cycle d'environ 4 semaines qui se
// termine en fin de semaine, le samedi le plus proche du 20 ; le suivant commence le lendemain.
const enDate = (d) => new Date(`${d}T00:00:00Z`);
const versIso = (t) => new Date(t).toISOString().slice(0, 10);

function samediProcheDu20(annee, mois) {   // mois : 0-11
  const vingt = Date.UTC(annee, mois, 20);
  const j = new Date(vingt).getUTCDay();                  // 0 dimanche ... 6 samedi
  const apres = (6 - j + 7) % 7, avant = (j + 1) % 7;     // jours jusqu'au samedi suivant / depuis le précédent
  return versIso(vingt + (apres <= avant ? apres : -avant) * 86400000);
}

export function finProposee(aujourdhui) {
  const d = enDate(aujourdhui);
  const ceMois = samediProcheDu20(d.getUTCFullYear(), d.getUTCMonth());
  return ceMois >= aujourdhui ? ceMois : samediProcheDu20(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export const lendemain = (date) => versIso(enDate(date).getTime() + 86400000);
