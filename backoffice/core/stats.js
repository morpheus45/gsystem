// Répartition d'une liste de valeurs (type de mission, résultat...) pour un camembert :
// parts triées de la plus grande à la plus petite (à égalité, ordre d'apparition),
// 5 parts au plus — au-delà, les plus petites sont regroupées en « Autres ».
export function repartition(valeurs, max = 5) {
  const n = new Map();
  for (const v of valeurs) n.set(v, (n.get(v) || 0) + 1);
  const tri = [...n].sort((a, b) => b[1] - a[1]);   // tri stable : l'ordre d'apparition départage
  const garde = tri.length > max ? tri.slice(0, max - 1) : tri;
  const reste = tri.slice(garde.length).reduce((s, [, c]) => s + c, 0);
  const lignes = garde.map(([libelle, c]) => ({ libelle, n: c }));
  if (reste) lignes.push({ libelle: 'Autres', n: reste });
  return lignes.map((l) => ({ ...l, part: l.n / valeurs.length }));
}

// Taux de NR sur le MOIS CIVIL (docs/PROJET.md) : base = installations (INST) réalisées
// (OK + NR client + NR technique) ; taux = (NR client + NR technique) / base ; objectif <= 8 %.
// Même calcul que docs/app/docRecap.js tauxNr (test d'équivalence), sans embarquer son module PDF.
export function tauxNr(temps, moisIso) {
  const realisees = temps.filter((e) => String(e.typeMission || '').toUpperCase() === 'INST'
    && String(e.date || '').slice(0, 7) === moisIso
    && (!e.observationType || e.observationType === 'NR_CLIENT' || e.observationType === 'NR_TECHNIQUE'));
  const nr = realisees.filter((e) => e.observationType).length;
  return { base: realisees.length, pourcent: realisees.length ? (nr * 100 / realisees.length) : null };
}
