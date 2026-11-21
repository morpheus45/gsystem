// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Récap pour la facturation au donneur d'ordre (EPS...) : des QUANTITÉS, pas de prix
// (le barème de facturation n'est pas connu : À DÉCIDER).
// - interventions par type de mission, ventilées OK / NR client / NR technique / autres NR ;
//   les journées sans intervention (VACANCES, FORMATION, FERIE, PLANNING VIDE) ne sont pas facturées ;
// - équipements installés par type (GesteCo), toutes les caméras comptées (la règle « CAM
//   seulement un jour d'INST » ne vaut que pour la prime du tech).
import { PRIX_DEFAUT, LIBELLES } from './primes.js';

const NON_FACTURE = ['VACANCES', 'FORMATION', 'FERIE', 'PLANNING VIDE'];

export function recapFacturation(temps, gestes) {
  const parType = new Map();
  for (const t of temps) {
    const type = String(t.typeMission || '').toUpperCase() || '—';
    if (NON_FACTURE.includes(type)) continue;
    const l = parType.get(type) || { type, ok: 0, nrClient: 0, nrTechnique: 0, nrAutres: 0, total: 0 };
    const o = t.observationType;
    if (!o) l.ok++; else if (o === 'NR_CLIENT') l.nrClient++; else if (o === 'NR_TECHNIQUE') l.nrTechnique++; else l.nrAutres++;
    l.total++;
    parType.set(type, l);
  }
  const qte = {};
  for (const g of gestes) for (const [k, n] of Object.entries(g.installes || {})) if (k in PRIX_DEFAUT && n) qte[k] = (qte[k] || 0) + n;
  return {
    interventions: [...parType.values()].sort((a, b) => b.total - a.total),
    equipements: Object.keys(PRIX_DEFAUT).filter((k) => qte[k]).map((k) => ({ type: LIBELLES[k], qte: qte[k] })),
  };
}

// Grille de tarifs (prix HT remplis plus tard). Base d'une ligne d'intervention : ce qui est
// facturé — 'ok' (OK seulement, par défaut), 'ok_nrclient' (OK + NR client), 'total' (tout).
const QTE = { ok: (l) => l.ok, ok_nrclient: (l) => l.ok + l.nrClient, total: (l) => l.total };

export function montantsFacture(recap, tarifs) {
  const qte = (t) => (t.categorie === 'intervention'
    ? (() => { const l = recap.interventions.find((x) => x.type === t.code); return l ? QTE[t.base || 'ok'](l) : 0; })()
    : recap.equipements.find((x) => x.type === t.code)?.qte || 0);
  const lignes = tarifs.map((t) => {
    const q = qte(t);
    const prix = t.prix_ht == null ? null : Number(t.prix_ht);
    return { libelle: t.libelle, qte: q, prix_ht: prix, montant_ht: prix == null ? null : Math.round(q * prix * 100) / 100 };
  }).filter((l) => l.qte > 0);
  return {
    lignes,
    totalHt: Math.round(lignes.reduce((s, l) => s + (l.montant_ht || 0), 0) * 100) / 100,
    sansPrix: lignes.filter((l) => l.prix_ht == null).length,
  };
}

export function lignesManquantes(recap, existants) {
  const a = new Set(existants.map((t) => `${t.categorie}|${t.code}`));
  return [
    ...recap.interventions.map((l) => ({ categorie: 'intervention', code: l.type, libelle: l.type })),
    ...recap.equipements.map((e) => ({ categorie: 'equipement', code: e.type, libelle: e.type })),
  ].filter((t) => !a.has(`${t.categorie}|${t.code}`));
}
