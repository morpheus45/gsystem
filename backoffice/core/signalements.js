// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).

// Tri automatique des signalements : normaliser l'explication, comparer deux
// signalements, et regrouper ceux qui parlent du même bug sur le même écran.

const GRAVITE_ORDRE = { non_urgent: 0, urgent: 1, critique: 2 };
const SIGNATURES_IGNOREES = ['corrige', 'refuse', 'doublon'];

export function normaliserTexte(t) {
  if (typeof t !== 'string') return new Set();
  const mots = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((m) => m.length >= 3);
  return new Set(mots);
}

export function similarite(a, b) {
  const motsA = normaliserTexte(a);
  const motsB = normaliserTexte(b);
  const commun = [...motsA].filter((m) => motsB.has(m)).length;
  if (motsA.size + motsB.size - commun === 0) return 0;
  return commun / (motsA.size + motsB.size - commun);
}

export function regrouper(signalements, seuil = 0.5) {
  const actifs = (signalements || []).filter((s) => !SIGNATURES_IGNOREES.includes(s?.statut));
  const parent = actifs.map((_, i) => i);
  const trouve = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < actifs.length; i++) {
    for (let j = i + 1; j < actifs.length; j++) {
      if (actifs[i].ecran === actifs[j].ecran && similarite(actifs[i].explication, actifs[j].explication) >= seuil) {
        const ri = trouve(i);
        const rj = trouve(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }
  const parGroupe = new Map();
  for (let i = 0; i < actifs.length; i++) {
    const r = trouve(i);
    if (!parGroupe.has(r)) parGroupe.set(r, []);
    parGroupe.get(r).push(actifs[i]);
  }
  const groupes = [];
  for (const sigs of parGroupe.values()) {
    const premier = sigs[0];
    const graviteMax = sigs.reduce((max, s) => (GRAVITE_ORDRE[s.gravite] > GRAVITE_ORDRE[max] ? s.gravite : max), sigs[0].gravite);
    groupes.push({
      ids: sigs.map((s) => s.id),
      ecran: premier.ecran,
      gravité: graviteMax,
      nombre: sigs.length,
      premier: premier.id,
      exemple: premier,
    });
  }
  return groupes.sort((a, b) => {
    const ga = GRAVITE_ORDRE[a.gravité];
    const gb = GRAVITE_ORDRE[b.gravité];
    if (gb !== ga) return gb - ga;
    return b.nombre - a.nombre;
  });
}

export function proposerLots(groupes) {
  const parEcran = new Map();
  for (const g of (groupes || [])) {
    if (!parEcran.has(g.ecran)) parEcran.set(g.ecran, []);
    parEcran.get(g.ecran).push(g);
  }
  const lots = [];
  for (const [ecran, gs] of parEcran) {
    const graviteMax = gs.reduce((max, g) => (GRAVITE_ORDRE[g.gravité] > GRAVITE_ORDRE[max] ? g.gravité : max), gs[0].gravité);
    lots.push({ ecran, gravité: graviteMax, groupes: gs });
  }
  return lots.sort((a, b) => GRAVITE_ORDRE[b.gravité] - GRAVITE_ORDRE[a.gravité]);
}
