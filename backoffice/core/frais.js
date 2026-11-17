import { htDepuisTtc, tvaDepuisTtc, remboursable } from '../../docs/app/frais.js';

const arrondi = (x) => Math.round(x * 100) / 100;

export function ligneFrais(t) {
  return {
    ttc: arrondi(t.montantEur),
    ht: arrondi(htDepuisTtc(t.montantEur, t.categorie, t.sansTva)),
    tva: arrondi(tvaDepuisTtc(t.montantEur, t.categorie, t.sansTva)),
    remboursable: arrondi(remboursable(t.montantEur, t.categorie))
  };
}

export function totauxFrais(liste) {
  const somme = { ttc: 0, ht: 0, tva: 0, remboursable: 0 };
  for (const t of liste) {
    const l = ligneFrais(t);
    somme.ttc += l.ttc;
    somme.ht += l.ht;
    somme.tva += l.tva;
    somme.remboursable += l.remboursable;
  }
  return {
    ttc: arrondi(somme.ttc),
    ht: arrondi(somme.ht),
    tva: arrondi(somme.tva),
    remboursable: arrondi(somme.remboursable)
  };
}