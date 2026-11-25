// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { heuresDuJour } from '../../docs/app/heures.js';

function nettoyer(entrees) {
  return entrees.map((e) => ({ ...e, slotMidi: String(e.slotMidi ?? '').trim(), observationType: String(e.observationType ?? '').trim() }));
}

export function heuresJour(entrees) {
  return heuresDuJour(nettoyer(entrees));
}

export function semaineIso(dateIso) {
  const [annee, mois, jour] = dateIso.split('-').map(Number);
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  const jourSemaine = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jourSemaine);
  const anneeIso = d.getUTCFullYear();
  const debut = new Date(Date.UTC(anneeIso, 0, 1));
  const numero = Math.ceil(((d - debut) / 86400000 + 1) / 7);
  return `${anneeIso}-W${String(numero).padStart(2, '0')}`;
}

// sup1 = 1re tranche (payée à r.taux1), sup2 = au-delà (payée à r.taux2).
export function ventiler(h, r) {
  const normales = Math.min(h, r.seuilHebdo);
  const sup1 = Math.min(Math.max(h - r.seuilHebdo, 0), r.tranche25);
  const sup2 = Math.max(h - r.seuilHebdo - r.tranche25, 0);
  return { normales, sup1, sup2 };
}

function joursDeTravail(temps, r) {
  const groupes = new Map();
  for (const t of temps) {
    if (!groupes.has(t.date)) groupes.set(t.date, []);
    groupes.get(t.date).push(t);
  }

  const jours = new Map();
  for (const [date, entrees] of groupes) {
    const jour = new Date(`${date}T00:00:00Z`);
    if (jour.getUTCDay() === 0 && !r.dimancheCompte) continue;
    const missions = entrees.map((e) => String(e.typeMission ?? '').toUpperCase());
    const absences = missions.some((m) => r.typesAbsence.includes(m))
      && !missions.includes('PLANNING VIDE');
    const h = heuresJour(entrees);
    const cle = semaineIso(date);
    if (!jours.has(cle)) jours.set(cle, { semaine: cle, travaillees: 0, absences: 0 });
    const j = jours.get(cle);
    if (absences) j.absences += h;
    else j.travaillees += h;
  }

  return [...jours.values()].sort((a, b) => (a.semaine < b.semaine ? -1 : a.semaine > b.semaine ? 1 : 0));
}

export function cumulSemaines(temps, r) {
  return joursDeTravail(temps, r).map((j) => ({ semaine: j.semaine, travaillees: j.travaillees, absences: j.absences, ...ventiler(j.travaillees, r) }));
}