/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// GESTE CO - miroir de ui/InstallExtras.kt et de data/Models.kt.
//
// La section s'ajoute a la cloture d'une INSTALLATION (et de quelques types de
// SAV) : pour chaque type d'extension, combien ont ete INSTALLEES - ce qui donne
// la prime du technicien - et combien ont ete OFFERTES au client.
//
// Les deux baremes sont distincts et ne doivent jamais etre confondus :
//   PRIMES  = ce que touche le technicien par extension installee ;
//   CADEAUX = ce que coute a l'entreprise une extension offerte, plafonne.

export const TYPES = [
  { cle: 'gsm', nom: 'GSM' },
  { cle: 'co', nom: 'CO' },
  { cle: 'dmp', nom: 'DMP' },
  { cle: 'se', nom: 'SE' },
  { cle: 'tc', nom: 'TC' },
  { cle: 'si', nom: 'SI' },
  { cle: 'cam', nom: 'CAM' },
  { cle: 'dacco', nom: 'DACCO' },
  { cle: 'ba', nom: 'BA' },
  { cle: 'cl', nom: 'CL' },
  { cle: 'df', nom: 'DF' },
  { cle: 'sondeIn', nom: 'SONDE IN' },
];

/** Prime interne, par extension installee. */
export const PRIMES = {
  gsm: 3.0, co: 2.0, dmp: 2.0, se: 4.0, tc: 1.5, si: 3.0,
  cam: 4.0, dacco: 3.0, ba: 1.0, cl: 3.0, df: 1.5, sondeIn: 1.5,
};

/** Cout d'une extension offerte au client. Zero = prime interne seulement. */
export const CADEAUX = {
  gsm: 3.0, co: 1.5, dmp: 3.0, se: 4.5, tc: 0, si: 0,
  cam: 0, dacco: 0, ba: 0, cl: 0, df: 0, sondeIn: 0,
};

export const PLAFOND_CADEAU = 4.50;
export const PLAFOND_CADEAU_SAV = 3.00;

/** Types de SAV qui ouvrent droit a un geste commercial (cadeau seul). */
export const TYPES_SAV_GESTE = ['REPA', 'PILE', 'SAV', 'DECL', 'AJOU', 'FINS',
  'INTE', 'MIGR'];

export function gesteVide() {
  return { actif: false, eps: false, installe: {}, offert: {} };
}

const n = (v) => {
  const x = parseInt(String(v == null ? '' : v).trim(), 10);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

const somme = (m) => TYPES.reduce((a, t) => a + n(m[t.cle]), 0);

export const totalInstalle = (g) => somme((g && g.installe) || {});
export const totalOffert = (g) => somme((g && g.offert) || {});

export const totalCadeau = (g) => TYPES.reduce(
  (a, t) => a + n(((g && g.offert) || {})[t.cle]) * CADEAUX[t.cle], 0);

export const totalPrime = (g) => TYPES.reduce(
  (a, t) => a + n(((g && g.installe) || {})[t.cle]) * PRIMES[t.cle], 0);

/** Aucun type ne peut etre offert en plus grand nombre qu'il n'est installe. */
const parTypeOk = (g) => TYPES.every(
  (t) => n((g.offert || {})[t.cle]) <= n((g.installe || {})[t.cle]));

/**
 * GESTE CO valide ?
 *  - en SAV (mise en conformite) : cadeau SEUL, plafond 3 EUR ; aucune regle
 *    « installe / moitie / par type » puisque rien n'est installe ;
 *  - sinon (INSTALLATION) : offert <= installe par type, offert <= la moitie
 *    des installees, et cadeau total <= 4,50 EUR. La derogation EPS leve les
 *    deux dernieres regles, jamais la premiere.
 */
export function gesteValide(g, savMode) {
  if (!g || !g.actif) return true;
  if (savMode) return totalCadeau(g) <= PLAFOND_CADEAU_SAV + 0.001;
  if (totalInstalle(g) === 0) return true;
  const moitieOk = g.eps || totalOffert(g) <= Math.floor(totalInstalle(g) / 2);
  const plafondOk = g.eps || totalCadeau(g) <= PLAFOND_CADEAU + 0.001;
  return parTypeOk(g) && moitieOk && plafondOk;
}

/**
 * Le n° de site n'est obligatoire QUE si un mail va partir, c'est-a-dire s'il y
 * a quelque chose d'offert. Des extensions seulement installees (pour la prime)
 * ne declenchent aucun envoi, donc aucun n° de site a saisir.
 */
export function besoinSite(g) {
  return !!(g && g.actif && totalOffert(g) > 0);
}

const eur2 = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');

/** Ce qui cloche, en clair, sous la section. Chaine vide si tout va bien. */
export function raisonInvalide(g, savMode) {
  if (!g || !g.actif || gesteValide(g, savMode)) return '';
  if (savMode) {
    return 'Geste commercial : ' + eur2(totalCadeau(g))
      + ' € au-dessus du plafond de ' + eur2(PLAFOND_CADEAU_SAV) + ' €.';
  }
  if (!parTypeOk(g)) {
    return 'Un type est offert en plus grand nombre qu\'installé.';
  }
  if (!g.eps && totalOffert(g) > Math.floor(totalInstalle(g) / 2)) {
    return 'Offert (' + totalOffert(g) + ') au-delà de la moitié des '
      + 'installées (' + totalInstalle(g) + ') : cochez la dérogation '
      + 'EPS si elle est accordée.';
  }
  return 'GESTE CO total ' + eur2(totalCadeau(g)) + ' € au-dessus du '
    + 'plafond de ' + eur2(PLAFOND_CADEAU) + ' €.';
}

/**
 * Construit l'entree GESTE CO rattachee a une cloture, ou null s'il n'y a rien
 * a enregistrer. En SAV il suffit d'un cadeau offert ; sinon il faut des
 * extensions installees.
 */
export function construireGeste(g, d, savMode) {
  if (!g || !g.actif) return null;
  if (savMode ? totalOffert(g) === 0 : totalInstalle(g) === 0) return null;
  const copier = (m) => {
    const out = {};
    TYPES.forEach((t) => { if (n(m[t.cle]) > 0) out[t.cle] = n(m[t.cle]); });
    return out;
  };
  return {
    id: d.id,
    tempsId: d.tempsId,
    date: d.date,
    siteNumber: String(d.siteNumber || '').trim(),
    installe: copier(g.installe || {}),
    offert: copier(g.offert || {}),
    eps: !!g.eps,
    nomClient: String(d.nomClient || '').trim(),
    observations: String(d.observations || '').trim(),
  };
}

/**
 * Primes du cycle, par type, du montant le plus eleve au plus faible.
 *
 * Regle CAM : une camera ne rapporte que si elle a ete posee un jour ou une
 * INSTALLATION est enregistree - sinon elle n'entre ni dans le nombre ni dans
 * le montant.
 */
export function primesParType(gestes, datesInst) {
  const dates = datesInst instanceof Set ? datesInst : new Set(datesInst || []);
  const compte = {};
  const tarif = {};
  TYPES.forEach((t) => { tarif[t.nom] = PRIMES[t.cle]; });
  gestes.forEach((g) => {
    TYPES.forEach((t) => {
      const nb = n((g.installe || {})[t.cle]);
      if (!nb) return;
      if (t.cle === 'cam' && !dates.has(g.date)) return;
      compte[t.nom] = (compte[t.nom] || 0) + nb;
    });
  });
  return Object.keys(compte)
    .map((nom) => ({
      type: nom, nb: compte[nom], tarif: tarif[nom],
      total: compte[nom] * tarif[nom],
    }))
    .sort((a, b) => b.total - a.total);
}

/** Les dates auxquelles une INSTALLATION est enregistree (regle CAM). */
export function datesInstallation(temps) {
  return new Set(temps
    .filter((e) => String(e.typeMission || '').toUpperCase() === 'INST')
    .map((e) => e.date));
}
