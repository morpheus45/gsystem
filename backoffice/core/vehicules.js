export const CT_VOITURE = { tousLesMois: 24, source: 'https://www.service-public.fr/particuliers/vosdroits/F2878' };

export function kmMoyenParMois(releves) {
  const valides = releves.filter((r) => r.valide_par).map((r) => ({ ...r, km: Number(r.km) || 0 })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (valides.length < 2) return null;
  const premier = valides[0];
  const dernier = valides[valides.length - 1];
  const mois = (Number(dernier.date.slice(0, 4)) * 12 + Number(dernier.date.slice(5, 7))) - (Number(premier.date.slice(0, 4)) * 12 + Number(premier.date.slice(5, 7)));
  if (mois <= 0) return null;
  return Math.round((Number(dernier.km) - Number(premier.km)) / mois);
}

function ajouterMois(dateIso, mois) {
  const [y, m, d] = dateIso.split('-').map(Number);
  // Bloqué au dernier jour du mois : 31 janvier + 1 mois = 28 (ou 29) février.
  const fin = new Date(Date.UTC(y, m - 1 + mois + 1, 0));
  fin.setUTCDate(Math.min(d, fin.getUTCDate()));
  return fin.toISOString().slice(0, 10);
}

export function prochaineEcheance(regle, dernier) {
  if (!regle?.tousLesMois && !regle?.tousLesKm) {
    throw new Error("règle d'échéance manquante : aucune périodicité définie");
  }
  if (!dernier?.date) throw new Error('saisir la date et le km de départ (aucun entretien précédent)');
  const date = regle.tousLesMois ? ajouterMois(dernier.date, regle.tousLesMois) : null;
  const km = regle.tousLesKm ? Number(dernier.km) + regle.tousLesKm : null;
  return { date, km };
}

function dernierJourMois(periode) {
  const [y, m] = periode.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function statutPhoto(periode, photos, aujourdhui, delaiJours) {
  if (photos.some((p) => p.periode === periode)) return 'recue';
  const [y, m] = periode.split('-').map(Number);
  const limite = new Date(Date.UTC(y, m - 1, dernierJourMois(periode) + delaiJours));
  const auj = new Date(`${aujourdhui}T00:00:00Z`);
  if (auj > limite) return 'en_retard';
  return 'manquante';
}

const ajouterJours = (dateIso, n) =>
  new Date(Date.parse(`${dateIso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function alertes(echeances, { aujourdhui, kmActuel, joursAvant, kmAvant }) {
  const result = [];
  for (const e of echeances) {
    let niveau = null;
    if (e.date && e.date < aujourdhui) niveau = 'depassee';
    else if (e.km != null && kmActuel >= e.km) niveau = 'depassee';
    if (!niveau && e.date && e.date <= ajouterJours(aujourdhui, joursAvant)) niveau = 'proche';
    if (!niveau && e.km != null && kmActuel >= e.km - kmAvant) niveau = 'proche';
    if (!niveau && e.km != null && kmActuel == null) niveau = 'km_inconnu';
    if (niveau) result.push({ type: e.type, niveau });
  }
  return result;
}

// Km mois par mois : dernier relevé VALIDÉ de chaque mois, et l'écart avec le
// mois précédent qui a un relevé (null pour le premier).
export function kmParMois(releves) {
  const fin = new Map();
  for (const r of releves.filter((x) => x.valide_par).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    fin.set(r.date.slice(0, 7), Number(r.km));
  }
  let avant = null;
  return [...fin].map(([mois, kmFin]) => {
    const ligne = { mois, kmFin, parcourus: avant === null ? null : kmFin - avant };
    avant = kmFin;
    return ligne;
  });
}

// Qui avait le véhicule ce jour-là ? (fin vide = toujours en cours ; la plus récente gagne)
export function conducteurA(affectations, date) {
  const en = affectations.filter((a) => a.debut <= date && (!a.fin || a.fin >= date));
  en.sort((a, b) => (a.debut < b.debut ? 1 : -1));
  return en[0]?.technicien_id ?? null;
}

// ANTAI : 45 jours à compter de la date de l'avis pour désigner le conducteur.
// https://www.antai.gouv.fr/la-reglementation
export const ANTAI = {
  designation: 'https://www.antai.gouv.fr/designations',
  contestation: 'https://www.antai.gouv.fr/particulier/designation-ou-contestation',
  delaiJours: 45,
};
export const limiteDesignation = (dateAvis) =>
  new Date(Date.parse(`${dateAvis}T00:00:00Z`) + ANTAI.delaiJours * 86400000).toISOString().slice(0, 10);
