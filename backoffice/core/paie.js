// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { cumulSemaines } from './heures.js';
import { totauxFrais } from './frais.js';

function samediDeSemaine(semaine) {
  // Le 4 janvier est toujours en semaine 1 ; on recule à son lundi, puis + 5 jours.
  const [annee, num] = semaine.split('-W').map(Number);
  const j4 = Date.UTC(annee, 0, 4);
  const lundi = j4 - ((new Date(j4).getUTCDay() + 6) % 7) * 86400000;
  return new Date(lundi + ((num - 1) * 7 + 5) * 86400000).toISOString().slice(0, 10);
}

// Variables de paie d'un tech sur une période. Une semaine ISO est rattachée
// à la période qui contient son samedi : les semaines vont du lundi au samedi (Excel de l'APK)
// et le mois se clôture un samedi (décision de Cédric, 17/11/2026), donc chaque semaine
// tombe entière dans une seule période.
// validations (facultatif) = [{ semaine, valide, refusee }] : seules les semaines VALIDÉES
// paient des heures sup ; refusées -> supRefusees ; ni l'un ni l'autre -> semainesATraiter.
// Sans validations : calcul indicatif (toutes les heures sup comptées).
export function variablesPaie({ tech, periode: { debut, fin }, temps, frais = [], primes = 0, regles, validations }) {
  const t = { heuresNormales: 0, sup1: 0, sup2: 0, absences: 0 };
  const etat = new Map((validations || []).map((v) => [v.semaine, v]));
  let supRefusees = 0, semainesATraiter = 0;
  for (const s of cumulSemaines(temps, regles.heures)) {
    const samedi = samediDeSemaine(s.semaine);
    if (samedi < debut || samedi > fin) continue;
    t.heuresNormales += s.normales; t.absences += s.absences;
    const v = etat.get(s.semaine);
    if (!validations || v?.valide) { t.sup1 += s.sup1; t.sup2 += s.sup2; }
    else if (v?.refusee) supRefusees += s.sup1 + s.sup2;
    else if (s.sup1 + s.sup2 > 0) semainesATraiter++;
  }
  const fraisRemboursables = totauxFrais(frais.filter((f) => f.date >= debut && f.date <= fin)).remboursable;
  const { taux1, taux2 } = regles.heures;
  const r = { tech, debut, fin, ...t, fraisRemboursables, primes, taux1, taux2, reglesValidees: regles.valide };
  return validations ? { ...r, supRefusees, semainesATraiter } : r;
}

// Texte : guillemets si ; " ou saut de ligne ; une formule (= + - @) est neutralisée.
export function texteCsv(v) {
  let t = String(v ?? '');
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return /[;"\n\r]|^'/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function versCsv(lignes) {
  if (!lignes || !lignes.length) return '';
  const header = Object.keys(lignes[0]).join(';');
  const rows = lignes.map((l) => {
    const values = Object.keys(l).map((k) => {
      const v = l[k];
      if (typeof v === 'number') {
        const arrondi = Math.round(v * 100) / 100;
        return String(arrondi).replace('.', ',');
      }
      if (typeof v === 'boolean') {
        return v ? 'oui' : 'non';
      }
      return texteCsv(v);
    });
    return values.join(';') + '\n';
  });
  return header + '\n' + rows.join('');
}
