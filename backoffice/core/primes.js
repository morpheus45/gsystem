// Primes GesteCo : reprise de la règle de l'APK, sans la réinventer.
// - prime d'un passage = Σ équipements INSTALLÉS × prix (data/Models.kt : totalPrime) ;
// - une CAM ne compte que si le tech a une clôture INST le même jour (règle CAMÉRAS) ;
// - barème : celui figé pour le mois (primeTarifsParMois) sinon le courant (prices)
//   (ui/PrimeAVenirScreen.kt : pricesFor) ; clé absente du JSON = défaut Kotlin ;
// - versement sur le salaire de mois + 2 (PrimeAVenirScreen.kt : moisPaie).

// GesteCoPrices (data/Models.kt) : valeurs par défaut, dans l'ordre de TYPES.
export const PRIX_DEFAUT = { gsm: 3, co: 2, dmp: 2, se: 4, tc: 1.5, si: 3, cam: 4, dacco: 3, ba: 1, cl: 3, df: 1.5, sondeIn: 1.5 };
export const LIBELLES = { gsm: 'GSM', co: 'CO', dmp: 'DMP', se: 'SE', tc: 'TC', si: 'SI', cam: 'CAM', dacco: 'DACCO', ba: 'BA', cl: 'CL', df: 'DF', sondeIn: 'SONDE IN' };

export function prixDuMois(reglages, mois) {
  return { ...PRIX_DEFAUT, ...(reglages?.primeTarifsParMois?.[mois] ?? reglages?.prices ?? {}) };
}

// gestes : [{ date, installes: { gsm, co, ... } }] ; temps : [{ date, typeMission }].
export function primesDuMois(gestes, temps, reglages, mois) {
  const prix = prixDuMois(reglages, mois);
  const joursInst = new Set(temps.filter((t) => String(t.typeMission ?? '').toUpperCase() === 'INST').map((t) => t.date));
  const qte = {};
  for (const g of gestes.filter((x) => x.date.startsWith(mois))) {
    for (const [k, n] of Object.entries(g.installes || {})) {
      if (!(k in PRIX_DEFAUT) || !n || (k === 'cam' && !joursInst.has(g.date))) continue;
      qte[k] = (qte[k] || 0) + n;
    }
  }
  const detail = Object.keys(PRIX_DEFAUT).filter((k) => qte[k])
    .map((k) => ({ type: LIBELLES[k], qte: qte[k], montant: Math.round(qte[k] * prix[k] * 100) / 100 }));
  return { total: Math.round(detail.reduce((s, d) => s + d.montant, 0) * 100) / 100, detail };
}

// Paie qui se termine le AAAA-MM-20 = salaire de ce mois -> primes de mois - 2.
// (Rattachement période de paie <-> mois de salaire : À VÉRIFIER avec Cédric.)
export function moisDesPrimes(finPeriode) {
  const [a, m] = finPeriode.split('-').map(Number);
  return new Date(Date.UTC(a, m - 3, 1)).toISOString().slice(0, 7);
}
