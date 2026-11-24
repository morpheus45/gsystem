// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Liste des interventions : durée et filtres, repris de l'ancien tableau de bord
// (apps-script/Code.js : durHM, cltFilter).

// Fin - arrivée en minutes ; une fin avant l'arrivée passe minuit. Heure illisible : null.
export function dureeMinutes(debut, fin) {
  const hm = (t) => /^\d{1,2}:\d{2}$/.test(String(t)) ? t.split(':').map(Number) : null;
  const a = hm(debut), b = hm(fin);
  if (!a || !b) return null;
  const m = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
  return m < 0 ? m + 1440 : m;
}

export function texteDuree(m) {
  if (m == null) return '';
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

// Filtres : technicien, type, résultat (vide = OK), 2 chiffres = département exact, sinon texte cherché dans le n° et la ville. Pas les dates/heures.
export function filtrer(liste, { tech, type, resultat, texte } = {}) {
  const t = String(texte || '').trim().toLowerCase();
  const depExact = /^\d{2}$/.test(t);
  return liste.filter((e) => (!tech || e.technicien_id === tech)
    && (!type || e.type_mission === type)
    && (!resultat || (e.observation_type || 'OK') === resultat)
    && (!t || (depExact
      ? String(e.departement || '') === t   // « 66 » = le département, rien d'autre
      : [e.numero_intervention, e.ville].some((v) => String(v || '').toLowerCase().includes(t)))));
}

// Code de résultat de l'APK -> libellé, comme l'APK (backup/StatsUploader.kt). Code inconnu : tel quel.
const LIBELLES_RESULTAT = { NR_CLIENT: 'NR client', NR_TECHNIQUE: 'NR technique', NR_CLIENT_ABS: 'NR client absent', NR_AUTRES: 'NR autres', ANNULE: 'Annulé', ANNULE_ROUTE: 'Annulé en route', ANNULE_SITE: 'Annulé sur site' };
export function libelleResultat(code) {
  return code ? LIBELLES_RESULTAT[code] || code : 'OK';
}
