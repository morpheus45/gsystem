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
