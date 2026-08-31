/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Remplissage de la feuille de temps .xlsm - miroir de excel/ExcelFiller.kt.
//
// Android ouvre le classeur avec Apache POI. Sur iPhone il n'y a pas de POI :
// le classeur est traite comme l'archive qu'il est (voir zip.js) et on edite
// directement le XML de la feuille de la semaine. Les macros, les styles, les
// images et tout ce qu'on ne touche pas sont recopies tels quels.
//
// Conventions de la trame, identiques a Android :
//   - une feuille par semaine ISO : "S.1" ... "S.53"
//   - 4 lignes par jour, de LUNDI a SAMEDI, puis une ligne TOTAL
//   - colonnes : B = departement, C = mission (fusionnee C:D), E = heures,
//     F = frais TTC remboursables, G = TVA des frais, H = observations

import { lireArchive, lireTexte, ecrireTexte, ecrireArchive } from './zip.js';
import { heuresDuJour } from './heures.js';
import { remboursable, tvaDepuisTtc } from './frais.js';

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];

const ech = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const arrondi2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ------------------------------------------------------------ DATES

/** Numero de semaine ISO 8601 (la semaine du 4 janvier est la premiere). */
export function semaineIso(iso) {
  const p = String(iso).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  // Jeudi de la semaine courante : c'est lui qui porte l'annee ISO.
  const jour = (d.getUTCDay() + 6) % 7;          // 0 = lundi
  d.setUTCDate(d.getUTCDate() - jour + 3);
  const jeudi1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  jeudi1.setUTCDate(jeudi1.getUTCDate() - ((jeudi1.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((d - jeudi1) / (7 * 86400000));
}

/** 0 = LUNDI ... 5 = SAMEDI ; -1 pour DIMANCHE (pas de ligne dans la trame). */
export function indexJour(iso) {
  const p = String(iso).split('-').map(Number);
  const jour = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); // 0 = dimanche
  return jour === 0 ? -1 : jour - 1;
}

// ------------------------------------------------------- TEXTES CELLULES

/** Colonne C : TYPE NOM VILLE NUMERO, en majuscules (miroir Android). */
export function texteMission(e) {
  if (String(e.typeMission || '').toUpperCase() === 'VACANCES') return 'CONGÉ PAYÉ';
  return [e.typeMission, e.nomClient, e.ville, e.numeroIntervention]
    .map((x) => String(x || '').trim()).filter((x) => x)
    .join(' ').toUpperCase();
}

/** Colonne H : code NR, motif de retard, puis la note libre. */
export function texteObservation(e) {
  const codes = {
    NR_CLIENT: 'NR CLIENT', NR_TECHNIQUE: 'NR TECHNIQUE',
    NR_CLIENT_ABS: 'NR CLIENT ABS', NR_AUTRES: 'NR AUTRES',
  };
  const retards = {
    ADRESSE: 'RETARD : PROBLÈME ADRESSE',
    ATTENTE: 'RETARD : ATTENTE CLIENT',
  };
  let retard = retards[e.motifRetard] || '';
  if (e.motifRetard === 'AUTRE') {
    retard = 'RETARD : ' + (String(e.retardTexte || '').trim() || 'AUTRE');
  }
  return [codes[e.observationType] || '', retard, String(e.observations || '').trim()]
    .filter((x) => x).join(' - ');
}

// ---------------------------------------------------------- XML FEUILLE

const COL = (ref) => {
  const lettres = String(ref).match(/^[A-Z]+/)[0];
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

const LETTRE = (i) => {
  let s = '';
  for (let n = i + 1; n > 0;) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = (n - r - 1) / 26;
  }
  return s;
};

/** Decoupe la feuille en lignes manipulables, sans toucher au reste du XML. */
function analyser(xml) {
  const d = xml.indexOf('<sheetData');
  const ouvrant = xml.indexOf('>', d) + 1;
  const vide = xml.charAt(ouvrant - 2) === '/';
  const dedans = vide ? '' : xml.slice(ouvrant, xml.indexOf('</sheetData>'));
  const apres = vide ? xml.slice(ouvrant)
                     : xml.slice(xml.indexOf('</sheetData>') + '</sheetData>'.length);

  const lignes = [];
  const reLigne = /<row([^>]*?)\/>|<row([^>]*?)>([\s\S]*?)<\/row>/g;
  let m;
  while ((m = reLigne.exec(dedans))) {
    const attrs = m[1] != null ? m[1] : m[2];
    const corps = m[3] || '';
    const cellules = [];
    const reCell = /<c([^>]*?)\/>|<c([^>]*?)>([\s\S]*?)<\/c>/g;
    let c;
    while ((c = reCell.exec(corps))) {
      const a = c[1] != null ? c[1] : c[2];
      const ref = (a.match(/\br="([A-Z]+\d+)"/) || [])[1];
      cellules.push({ ref: ref, attrs: a, corps: c[3] != null ? c[3] : null });
    }
    lignes.push({
      r: Number((attrs.match(/\br="(\d+)"/) || [])[1]), attrs: attrs, cellules: cellules,
    });
  }
  return { avant: xml.slice(0, ouvrant), lignes: lignes, apres: apres };
}

function reconstruire(feuille, apres) {
  const corps = feuille.lignes.map((l) => {
    const cs = l.cellules.map((c) => (c.corps == null
      ? '<c' + c.attrs + '/>'
      : '<c' + c.attrs + '>' + c.corps + '</c>')).join('');
    return cs ? '<row' + l.attrs + '>' + cs + '</row>' : '<row' + l.attrs + '/>';
  }).join('');
  return feuille.avant + corps + '</sheetData>' + apres;
}

function ligneDe(feuille, r) {
  let l = feuille.lignes.find((x) => x.r === r);
  if (l) return l;
  l = { r: r, attrs: ' r="' + r + '"', cellules: [] };
  const i = feuille.lignes.findIndex((x) => x.r > r);
  if (i < 0) feuille.lignes.push(l); else feuille.lignes.splice(i, 0, l);
  return l;
}

/** Ecrit une valeur en gardant le style de la cellule existante. */
function ecrireCellule(feuille, colonne, r, valeur, genre) {
  const ligne = ligneDe(feuille, r);
  const ref = LETTRE(colonne) + r;
  let cellule = ligne.cellules.find((c) => c.ref === ref);
  if (!cellule) {
    cellule = { ref: ref, attrs: ' r="' + ref + '"', corps: null };
    const i = ligne.cellules.findIndex((c) => c.ref && COL(c.ref) > colonne);
    if (i < 0) ligne.cellules.push(cellule); else ligne.cellules.splice(i, 0, cellule);
  }
  const style = (cellule.attrs.match(/\bs="\d+"/) || [''])[0];
  const base = ' r="' + ref + '"' + (style ? ' ' + style : '');
  if (genre === 'formule') {
    cellule.attrs = base;
    cellule.corps = '<f>' + ech(valeur) + '</f>';
  } else if (genre === 'nombre') {
    cellule.attrs = base;
    cellule.corps = '<v>' + valeur + '</v>';
  } else {
    // Chaine EN LIGNE : on n'a ainsi jamais a toucher sharedStrings.xml,
    // partage par toutes les feuilles du classeur.
    cellule.attrs = base + ' t="inlineStr"';
    cellule.corps = '<is><t xml:space="preserve">' + ech(valeur) + '</t></is>';
  }
}

/** Valeur texte d'une cellule, chaines partagees resolues. */
function texteCellule(cellule, partagees) {
  if (!cellule || cellule.corps == null) return '';
  const t = (cellule.attrs.match(/\bt="(\w+)"/) || [])[1];
  if (t === 'inlineStr') {
    const tous = cellule.corps.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [];
    return tous.map((x) => x.replace(/<[^>]*>/g, '')).join('');
  }
  const v = (cellule.corps.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
  if (v == null) return '';
  if (t === 's') return partagees[Number(v)] || '';
  if (t === 'str') return v;
  return '';
}

/** [{debut, fin}] par jour + la ligne TOTAL, en numeros de lignes Excel. */
function blocsJour(feuille, partagees) {
  const debuts = [];
  const vus = {};
  let total = -1;
  for (const ligne of feuille.lignes) {
    if (ligne.r < 7) continue;
    const a = ligne.cellules.find((c) => c.ref && COL(c.ref) === 0);
    const val = texteCellule(a, partagees).trim().toUpperCase();
    if (!val) continue;
    if (JOURS.indexOf(val) >= 0 && !vus[val]) { vus[val] = true; debuts.push(ligne.r); }
    else if (val === 'TOTAL' && total < 0) total = ligne.r;
  }
  if (total < 0) throw new Error('Ligne TOTAL introuvable dans la feuille.');
  debuts.sort((a, b) => a - b);
  const blocs = debuts.map((r, i) => ({
    debut: r, fin: i + 1 < debuts.length ? debuts[i + 1] - 1 : total - 1,
  }));
  return { blocs: blocs, total: total };
}

// ------------------------------------------------------------- FUSIONS

function lireFusions(apres) {
  const m = apres.match(/<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/);
  if (!m) return null;
  const refs = [];
  const re = /<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g;
  let x;
  while ((x = re.exec(m[1]))) {
    refs.push({
      c1: COL(x[1] + x[2]), l1: Number(x[2]),
      c2: COL(x[3] + x[4]), l2: Number(x[4]),
    });
  }
  return { bloc: m[0], refs: refs };
}

function ecrireFusions(apres, fusions) {
  const dedans = fusions.refs.map((f) =>
    '<mergeCell ref="' + LETTRE(f.c1) + f.l1 + ':' + LETTRE(f.c2) + f.l2 + '"/>').join('');
  return apres.replace(fusions.bloc,
    '<mergeCells count="' + fusions.refs.length + '">' + dedans + '</mergeCells>');
}

/**
 * Insere `extra` lignes a la fin du bloc d'un jour. Le decalage suit exactement
 * la logique Android : lignes suivantes repoussees, fusion de la date du jour
 * etendue, fusions C:D recreees, style de la 1re ligne du jour recopie.
 */
function insererLignes(feuille, fusions, debut, fin, extra) {
  const depuis = fin + 1;

  for (const ligne of feuille.lignes) {
    if (ligne.r < depuis) continue;
    const nouveau = ligne.r + extra;
    ligne.attrs = ligne.attrs.replace(/\br="\d+"/, 'r="' + nouveau + '"');
    for (const c of ligne.cellules) {
      if (!c.ref) continue;
      c.ref = c.ref.replace(/\d+$/, String(nouveau));
      c.attrs = c.attrs.replace(/\br="[A-Z]+\d+"/, 'r="' + c.ref + '"');
    }
    ligne.r = nouveau;
  }

  if (fusions) {
    for (const f of fusions.refs) {
      if (f.l1 >= depuis) { f.l1 += extra; f.l2 += extra; }
      else if (f.c1 === 0 && f.c2 === 0 && f.l1 > debut && f.l2 === fin) f.l2 += extra;
    }
  }

  // Nouvelles lignes : meme hauteur et memes styles que la 1re ligne du jour.
  const modele = feuille.lignes.find((l) => l.r === debut);
  for (let k = 0; k < extra; k++) {
    const r = depuis + k;
    const ligne = ligneDe(feuille, r);
    if (modele) {
      const garde = ['s="\\d+"', 'customFormat="[^"]*"', 'ht="[^"]*"', 'customHeight="[^"]*"'];
      let attrs = ' r="' + r + '"';
      for (const motif of garde) {
        const m = modele.attrs.match(new RegExp('\\b' + motif));
        if (m) attrs += ' ' + m[0];
      }
      ligne.attrs = attrs;
      for (let col = 1; col <= 7; col++) {
        const src = modele.cellules.find((c) => c.ref && COL(c.ref) === col);
        if (!src) continue;
        const s = (src.attrs.match(/\bs="\d+"/) || [''])[0];
        const ref = LETTRE(col) + r;
        ligne.cellules.push({
          ref: ref, attrs: ' r="' + ref + '"' + (s ? ' ' + s : ''), corps: null,
        });
      }
      ligne.cellules.sort((a, b) => COL(a.ref) - COL(b.ref));
    }
    if (fusions && !fusions.refs.some(
      (f) => f.l1 === r && f.l2 === r && f.c1 === 2 && f.c2 === 3)) {
      fusions.refs.push({ c1: 2, l1: r, c2: 3, l2: r });
    }
  }
}

/** Redonne a chaque jour sa formule de date : le 1er suit B5, les autres +1. */
function reparerDates(feuille, fusions, blocs) {
  if (!fusions) return;
  let precedente = null;
  blocs.forEach((bloc, i) => {
    const fusion = fusions.refs.find((f) =>
      f.c1 === 0 && f.c2 === 0 && f.l1 > bloc.debut && f.l2 <= bloc.fin);
    if (!fusion) return;
    ecrireCellule(feuille, 0, fusion.l1,
      i === 0 ? 'B5+0' : 'A' + precedente + '+1', 'formule');
    precedente = fusion.l1;
  });
}

/** La ligne TOTAL doit couvrir tout le bloc de donnees, lignes ajoutees comprises. */
function reparerTotal(feuille, total) {
  for (const col of [4, 5, 6]) {
    const L = LETTRE(col);
    ecrireCellule(feuille, col, total,
      'SUM(' + L + '10:' + L + (total - 1) + ')', 'formule');
  }
}

/**
 * Etend la plage declaree de la feuille aux lignes ajoutees. `<dimension>` est
 * ecrit AVANT `<sheetData>` : c'est l'en-tete de la feuille qu'il faut reprendre,
 * pas la fin.
 */
function etendreDimension(avant, extra) {
  return avant.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/,
    (t, c1, l1, c2, l2) =>
      '<dimension ref="' + c1 + l1 + ':' + c2 + (Number(l2) + extra) + '"/>');
}

// ---------------------------------------------------------- POINT D'ENTREE

/** Retrouve le fichier XML d'une feuille a partir de son nom d'onglet. */
async function cheminFeuille(entrees, nom) {
  const classeur = await lireTexte(entrees, 'xl/workbook.xml');
  const liens = await lireTexte(entrees, 'xl/_rels/workbook.xml.rels');
  if (!classeur || !liens) return null;
  const normalise = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let id = null;
  let approche = null;
  const feuilles = classeur.match(/<sheet\b[^>]*\/>/g) || [];
  for (const f of feuilles) {
    const n = (f.match(/name="([^"]*)"/) || [])[1];
    const rid = (f.match(/r:id="([^"]*)"/) || [])[1];
    if (n === nom) { id = rid; break; }
    // S.7 / S07 / S 7 : la trame n'est pas nommee de la meme facon partout.
    if (!approche && normalise(n) === normalise(nom)) approche = rid;
  }
  id = id || approche;
  if (!id) return null;
  const rels = liens.match(/<Relationship\b[^>]*\/>/g) || [];
  const rel = rels.find((r) => r.indexOf('Id="' + id + '"') >= 0);
  if (!rel) return null;
  const cible = (rel.match(/Target="([^"]*)"/) || [])[1];
  if (!cible) return null;
  if (cible.charAt(0) === '/') return cible.slice(1);
  return cible.indexOf('xl/') === 0 ? cible : 'xl/' + cible;
}

/**
 * Remplit le classeur et renvoie { blob, rapport }.
 *
 * `fichier` est le .xlsm choisi par le technicien (input type="file"). Le
 * fichier d'origine n'est pas modifie : on rend un nouveau classeur.
 */
export async function remplirClasseur(fichier, temps, frais) {
  const entrees = await lireArchive(await fichier.arrayBuffer());
  const rapport = { ecrites: 0, ajoutees: 0, feuilles: [], avertissements: [] };

  const partageesXml = (await lireTexte(entrees, 'xl/sharedStrings.xml')) || '';
  const partagees = (partageesXml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) =>
    (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [])
      .map((t) => t.replace(/<[^>]*>/g, '')).join(''));

  // Regroupement par feuille de semaine, puis par jour.
  const parSemaine = new Map();
  const ranger = (iso, item, ou) => {
    const nom = 'S.' + semaineIso(iso);
    if (!parSemaine.has(nom)) parSemaine.set(nom, { temps: [], frais: [] });
    parSemaine.get(nom)[ou].push(item);
  };
  temps.forEach((e) => ranger(e.date, e, 'temps'));
  frais.forEach((f) => ranger(f.date, f, 'frais'));

  for (const paireSemaine of parSemaine) {
    const nomFeuille = paireSemaine[0];
    const lot = paireSemaine[1];
    const chemin = await cheminFeuille(entrees, nomFeuille);
    if (!chemin) {
      rapport.avertissements.push(
        'Feuille ' + nomFeuille + ' introuvable dans le classeur.');
      continue;
    }
    const feuille = analyser(await lireTexte(entrees, chemin));
    let apres = feuille.apres;
    const fusions = lireFusions(apres);
    let vue = blocsJour(feuille, partagees);
    let ajouteesFeuille = 0;

    // Les jours sont remplis du dernier au premier : une insertion au jour N
    // ne decale ainsi jamais les jours deja ecrits.
    const parJour = new Map();
    for (const e of lot.temps) {
      const j = indexJour(e.date);
      if (j < 0) { rapport.avertissements.push('Dimanche ignore : ' + e.date); continue; }
      if (!parJour.has(j)) parJour.set(j, []);
      parJour.get(j).push(e);
    }
    const jours = [...parJour.keys()].sort((a, b) => b - a);
    for (const j of jours) {
      const items = parJour.get(j);
      if (j >= vue.blocs.length) continue;
      let bloc = vue.blocs[j];
      const place = bloc.fin - bloc.debut + 1;
      if (items.length > place) {
        const extra = items.length - place;
        insererLignes(feuille, fusions, bloc.debut, bloc.fin, extra);
        rapport.ajoutees += extra;
        ajouteesFeuille += extra;
        vue = blocsJour(feuille, partagees);
        reparerDates(feuille, fusions, vue.blocs);
        reparerTotal(feuille, vue.total);
        bloc = vue.blocs[j];
      }
      const heures = heuresDuJour(items);
      items.forEach((e, i) => {
        const r = bloc.debut + i;
        ecrireCellule(feuille, 1, r, String(e.departement || ''), 'texte');
        ecrireCellule(feuille, 2, r, texteMission(e), 'texte');
        if (i === 0) ecrireCellule(feuille, 4, r, heures, 'nombre');
        const obs = texteObservation(e);
        if (obs) ecrireCellule(feuille, 7, r, obs, 'texte');
        rapport.ecrites++;
      });
    }

    // Les frais viennent APRES les insertions : les blocs sont a jour, et le
    // cumul du jour se pose sur la 1re ligne du jour, comme les heures.
    const fraisJour = new Map();
    for (const f of lot.frais) {
      const j = indexJour(f.date);
      if (j < 0) { rapport.avertissements.push('Dimanche ignore : ' + f.date); continue; }
      if (!fraisJour.has(j)) fraisJour.set(j, []);
      fraisJour.get(j).push(f);
    }
    for (const paireJour of fraisJour) {
      const j = paireJour[0];
      if (j >= vue.blocs.length) continue;
      const r = vue.blocs[j].debut;
      let ttc = 0;
      let tva = 0;
      for (const t of paireJour[1]) {
        const part = remboursable(Number(t.montantEur) || 0, t.categorie);
        ttc += part;
        tva += tvaDepuisTtc(part, t.categorie, t.sansTva);
      }
      ecrireCellule(feuille, 5, r, arrondi2(ttc), 'nombre');
      ecrireCellule(feuille, 6, r, arrondi2(tva), 'nombre');
    }

    if (fusions) apres = ecrireFusions(apres, fusions);
    if (ajouteesFeuille > 0) {
      feuille.avant = etendreDimension(feuille.avant, ajouteesFeuille);
    }
    ecrireTexte(entrees, chemin, reconstruire(feuille, apres));
    rapport.feuilles.push(nomFeuille);
  }

  // Les formules ne portent plus de resultat en cache : Excel doit tout
  // recalculer a l'ouverture, et sa chaine de calcul est a reconstruire.
  await forcerRecalcul(entrees);

  return { blob: ecrireArchive(entrees), rapport: rapport };
}

/** Supprime calcChain.xml (perime) et demande un recalcul complet a l'ouverture. */
async function forcerRecalcul(entrees) {
  if (entrees.has('xl/calcChain.xml')) {
    const types = await lireTexte(entrees, '[Content_Types].xml');
    const liens = await lireTexte(entrees, 'xl/_rels/workbook.xml.rels');
    entrees.delete('xl/calcChain.xml');
    if (types) {
      ecrireTexte(entrees, '[Content_Types].xml',
        types.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
    }
    if (liens) {
      ecrireTexte(entrees, 'xl/_rels/workbook.xml.rels',
        liens.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, ''));
    }
  }
  const classeur = await lireTexte(entrees, 'xl/workbook.xml');
  if (classeur && classeur.indexOf('fullCalcOnLoad') < 0) {
    ecrireTexte(entrees, 'xl/workbook.xml',
      classeur.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>'));
  }
}
