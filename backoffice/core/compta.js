// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Extrait comptable des notes de frais, par technicien.
// Comptes : plan comptable général (règlement ANC n° 2014-03, plan de comptes 2025).
// TVA : déductible seulement si la facture est délivrée à l'entreprise (CGI art. 271 et 289,
// BOI-TVA-DED-40-10-10) ; c'est donc la gestion qui coche « TVA récupérable » frais par frais,
// non coché par défaut (on ne réclame jamais une TVA sans justificatif conforme).
// Colonnes : celles du fichier des écritures comptables (FEC, LPF art. A47 A-1).
import { ligneFrais } from './frais.js';
import { texteCsv } from './paie.js';

export const PARAMS_DEFAUT = {
  journal: 'NDF', journalLib: 'Notes de frais', compteTva: '44566', compteSalarie: '421',
  comptes: { PARKING: '6251', DIVERS: '628', MOBILE: '626' }
};

export const LIBELLES_COMPTES = {
  '421': 'Personnel - Rémunérations dues', '44566': 'TVA sur autres biens et services',
  '6251': 'Voyages et déplacements', '6256': 'Missions', '6257': 'Réceptions',
  '626': 'Frais postaux et de télécommunications', '628': 'Divers'
};

export const COLONNES_FEC = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
  'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet',
  'ValidDate', 'Montantdevise', 'Idevise'];

const cents = (x) => Math.round(x * 100);

// Remboursé = ce que l'entreprise doit au salarié. TVA récupérée au prorata du remboursé
// (mobile remboursé en partie), calculée en centimes pour que l'écriture tombe juste.
export function montantsComptables(f) {
  const l = ligneFrais(f);
  const total = cents(l.remboursable);
  const tva = f.tvaRecuperable && l.ttc > 0 ? Math.round(cents(l.tva) * total / cents(l.ttc)) : 0;
  return { total: total / 100, tva: tva / 100, charge: (total - tva) / 100 };
}

const aaaammjj = (iso) => String(iso).slice(0, 10).replaceAll('-', '');
const jjmmaaaa = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');

export function ecritures({ tech, frais, params, valideLe }) {
  return frais.flatMap((f, i) => {
    const compte = params.comptes[String(f.categorie || '').trim().toUpperCase()];
    if (!compte) throw new Error(`compte de charge manquant pour la catégorie ${f.categorie}`);
    const m = montantsComptables(f);
    const base = { JournalCode: params.journal, JournalLib: params.journalLib, EcritureNum: String(i + 1),
      EcritureDate: aaaammjj(f.date), CompAuxNum: '', CompAuxLib: '', PieceRef: f.fichier || f.id, PieceDate: aaaammjj(f.date),
      EcritureLib: `Note de frais ${f.categorie} ${tech.nom}`, EcritureLet: '', DateLet: '', ValidDate: aaaammjj(valideLe),
      Montantdevise: '', Idevise: '' };
    const ligne = (num, debit, credit, aux) => ({ ...base, CompteNum: num, CompteLib: LIBELLES_COMPTES[num] || '',
      Debit: debit, Credit: credit, ...(aux && { CompAuxNum: tech.compteAuxiliaire || '', CompAuxLib: tech.nom }) });
    return [ligne(compte, m.charge, 0), ...(m.tva ? [ligne(params.compteTva, m.tva, 0)] : []), ligne(params.compteSalarie, 0, m.total, true)];
  });
}

export function versCsvFec(lignes) {
  const cellule = (v) => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : texteCsv(v);
  return [COLONNES_FEC.join(';'), ...lignes.map((l) => COLONNES_FEC.map((c) => cellule(l[c])).join(';'))].join('\r\n') + '\r\n';
}

// Contrôles avant envoi au comptable, par frais (id -> liste d'alertes).
export function controles(frais, justificatifs) {
  const cle = (f) => `${f.date}|${String(f.categorie).toUpperCase()}|${cents(f.montantEur)}`;
  const vus = new Map();
  for (const f of frais) vus.set(cle(f), (vus.get(cle(f)) || 0) + 1);
  return new Map(frais.map((f) => [f.id, [
    !justificatifs.has(f.fichier) && 'justificatif absent',
    !(f.montantEur > 0) && 'montant nul',
    vus.get(cle(f)) > 1 && 'doublon possible',
    f.statut === 'a_traiter' && 'à valider',
    f.statut === 'refuse' && 'refusé'
  ].filter(Boolean)]));
}

export function releve(tech, frais, justificatifs) {
  const c = controles(frais, justificatifs);
  const lignes = frais.map((f) => {
    const l = ligneFrais(f), m = montantsComptables(f);
    return { technicien: tech.nom, date: jjmmaaaa(f.date), categorie: f.categorie, ttc: l.ttc, ht: l.ht, tva: l.tva,
      rembourse: m.total, tvaRecuperee: m.tva, charge: m.charge, sansTva: f.sansTva ? 'Oui' : 'Non',
      justificatif: f.fichier || '', controles: c.get(f.id).join(', ') };
  });
  const somme = (k) => lignes.reduce((a, l) => a + cents(l[k]), 0) / 100;
  return { lignes, total: { ttc: somme('ttc'), rembourse: somme('rembourse'), tvaRecuperee: somme('tvaRecuperee'), charge: somme('charge') } };
}
