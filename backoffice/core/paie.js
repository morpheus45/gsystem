import { cumulSemaines } from './heures.js';
import { totauxFrais } from './frais.js';

function dimancheDeSemaine(semaine) {
  // Le 4 janvier est toujours en semaine 1 ; on recule à son lundi.
  const [annee, num] = semaine.split('-W').map(Number);
  const j4 = Date.UTC(annee, 0, 4);
  const lundi = j4 - ((new Date(j4).getUTCDay() + 6) % 7) * 86400000;
  return new Date(lundi + ((num - 1) * 7 + 6) * 86400000).toISOString().slice(0, 10);
}

// Variables de paie d'un tech sur une période. Une semaine ISO est rattachée
// à la période qui contient son dimanche (choix par défaut, À DÉCIDER).
export function variablesPaie({ tech, periode: { debut, fin }, temps, frais = [], primes = 0, regles }) {
  const t = { heuresNormales: 0, sup1: 0, sup2: 0, absences: 0 };
  for (const s of cumulSemaines(temps, regles.heures)) {
    const dimanche = dimancheDeSemaine(s.semaine);
    if (dimanche < debut || dimanche > fin) continue;
    t.heuresNormales += s.normales; t.sup1 += s.sup1; t.sup2 += s.sup2; t.absences += s.absences;
  }
  const fraisRemboursables = totauxFrais(frais.filter((f) => f.date >= debut && f.date <= fin)).remboursable;
  const { taux1, taux2 } = regles.heures;
  return { tech, debut, fin, ...t, fraisRemboursables, primes, taux1, taux2, reglesValidees: regles.valide };
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
      // Texte : guillemets si ; " ou saut de ligne ; une formule (= + - @) est neutralisée.
      let t = String(v ?? '');
      if (/^[=+\-@]/.test(t)) t = `'${t}`;
      return /[;"\n\r]|^'/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    });
    return values.join(';') + '\n';
  });
  return header + '\n' + rows.join('');
}
