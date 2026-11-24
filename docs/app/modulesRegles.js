// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Saisie et validation des champs des règles (iPhone). Sans DOM, sans import.
// Champs : { cle, libelle, type, obligatoire, choix? } ; types : texte, nombre, date, case, liste, photo, signature.

/** Vérifie qu'une chaîne est une date réelle au format AAAA-MM-JJ (2026-02-31 refusé). */
const dateValide = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const an = +m[1], mois = +m[2], jour = +m[3];
  const d = new Date(an, mois - 1, jour);
  return d.getFullYear() === an && d.getMonth() === mois - 1 && d.getDate() === jour;
};

/** Nombre à virgule décimale, sans séparateur de milliers. */
const formatNombre = (v) => String(v).replace('.', ',');

/** JJ/MM/AAAA depuis une chaîne AAAA-MM-JJ ou un objet Date. */
const formatDate = (v) => {
  if (v instanceof Date) {
    const j = String(v.getDate()).padStart(2, '0');
    const m = String(v.getMonth() + 1).padStart(2, '0');
    return j + '/' + m + '/' + v.getFullYear();
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  return s;
};

/** Valeur saisie : trim ; vide -> null. nombre -> Number ou null. case -> true/false/null. Autre -> texte trimé. */
export function valeurSaisie(c, texte) {
  const t = (texte == null ? '' : String(texte)).trim();
  if (t === '') return null;
  switch (c.type) {
    case 'nombre': {
      const s = t.replace(/\s/g, '');
      if (!/^-?\d{1,12}([.,]\d{1,6})?$/.test(s)) return null;
      return Number(s.replace(',', '.'));
    }
    case 'case':
      if (t === 'oui') return true;
      if (t === 'non') return false;
      return null;
    default:
      return t;
  }
}

/** Première erreur dans l'ordre des champs, ou null si tout est bon. */
export function defautSaisie(champs, textes) {
  for (const c of champs) {
    const t = (textes[c.cle] == null ? '' : String(textes[c.cle])).trim();
    if (t === '') {
      if (c.obligatoire) return '« ' + c.libelle + ' » est à remplir.';
      continue;
    }
    const v = valeurSaisie(c, t);
    switch (c.type) {
      case 'nombre':
        if (v === null) return '« ' + c.libelle + ' » : nombre invalide.';
        break;
      case 'date':
        if (!dateValide(t)) return '« ' + c.libelle + ' » : date invalide.';
        break;
      case 'case':
        if (v === null) return '« ' + c.libelle + ' » : choix invalide.';
        break;
      case 'liste':
        if (!c.choix || !c.choix.includes(t)) return '« ' + c.libelle + ' » : choix invalide.';
        break;
      case 'photo':
      case 'signature':
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(t)) return '« ' + c.libelle + ' » : fichier invalide.';
        break;
      default:
        if (t.length > 2000) return '« ' + c.libelle + ' » : 2000 caractères au plus.';
    }
  }
  return null;
}

/** Objet des seuls champs remplis et connus (zéro et false sont gardés). */
export function valeursSaisie(champs, textes) {
  const o = {};
  for (const c of champs) {
    const v = valeurSaisie(c, textes[c.cle]);
    if (v === undefined || v === null) continue;
    o[c.cle] = v;
  }
  return o;
}

/** Libellé lisible d'une valeur. */
export function texteValeur(c, v) {
  if (v === undefined || v === null || v === '') return 'Non rempli';
  if (c == null) return String(v);
  switch (c.type) {
    case 'case':
      return v ? 'Oui' : 'Non';
    case 'nombre':
      return formatNombre(v);
    case 'date':
      return formatDate(v);
    case 'photo':
      return 'Photo';
    case 'signature':
      return 'Signature';
    default:
      return String(v);
  }
}
