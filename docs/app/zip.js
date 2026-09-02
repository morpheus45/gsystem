/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Lecture et ecriture d'archives ZIP, juste ce qu'il faut pour le .xlsm.
//
// Un classeur .xlsm est un ZIP. Les macros vivent dans xl/vbaProject.bin, et
// toute bibliotheque qui reconstruit le classeur les perd. Ici on ne
// reconstruit rien : les entrees qu'on ne touche pas sont recopiees
// OCTET POUR OCTET, encore compressees, telles qu'Excel les a ecrites. Seules
// les feuilles modifiees sont reecrites, et en "stocke" (sans compression) :
// quelques dizaines de kilo-octets, pour n'avoir jamais besoin de compresser.

const SIG_CD = 0x02014b50;      // entree du repertoire central
const SIG_EOCD = 0x06054b50;    // fin du repertoire central
const SIG_LOCAL = 0x04034b50;   // en-tete local

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const ENC = new TextEncoder();
const DEC = new TextDecoder('utf-8');

export const enOctets = (s) => ENC.encode(s);
export const enTexte = (o) => DEC.decode(o);

/** Decompresse un flux deflate brut. Safari 16.4+ / iOS 16.4+. */
async function decompresser(octets) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Ce navigateur ne sait pas ouvrir un fichier Excel '
      + '(iOS 16.4 ou plus recent requis).');
  }
  const flux = new Blob([octets]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/**
 * Lit l'archive. Chaque entree garde ses octets COMPRESSES d'origine : c'est
 * ce qui permet de les recopier sans les toucher.
 */
export async function lireArchive(tampon) {
  const vue = new DataView(tampon);
  const brut = new Uint8Array(tampon);

  let eocd = -1;
  for (let i = brut.length - 22; i >= 0 && i >= brut.length - 65557; i--) {
    if (vue.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Fichier illisible : ce n'est pas un classeur Excel.");

  const nombre = vue.getUint16(eocd + 10, true);
  if (nombre === 0xFFFF) throw new Error('Classeur trop volumineux (format Zip64).');

  const entrees = new Map();
  let p = vue.getUint32(eocd + 16, true);
  for (let k = 0; k < nombre; k++) {
    if (vue.getUint32(p, true) !== SIG_CD) throw new Error('Archive endommagee.');
    const drapeaux = vue.getUint16(p + 8, true);
    const methode = vue.getUint16(p + 10, true);
    const heure = vue.getUint16(p + 12, true);
    const jour = vue.getUint16(p + 14, true);
    const crc = vue.getUint32(p + 16, true);
    const tailleC = vue.getUint32(p + 20, true);
    const tailleU = vue.getUint32(p + 24, true);
    const lgNom = vue.getUint16(p + 28, true);
    const lgExtra = vue.getUint16(p + 30, true);
    const lgComm = vue.getUint16(p + 32, true);
    const attrsExt = vue.getUint32(p + 38, true);
    const posLocale = vue.getUint32(p + 42, true);
    const nom = enTexte(brut.subarray(p + 46, p + 46 + lgNom));

    // Les longueurs de l'en-tete LOCAL peuvent differer de celles du
    // repertoire central : c'est bien celles-la qui donnent le debut des donnees.
    if (vue.getUint32(posLocale, true) !== SIG_LOCAL) throw new Error('Archive endommagee.');
    const lgNomL = vue.getUint16(posLocale + 26, true);
    const lgExtraL = vue.getUint16(posLocale + 28, true);
    const debut = posLocale + 30 + lgNomL + lgExtraL;

    entrees.set(nom, {
      nom, methode, crc, tailleC, tailleU, heure, jour, attrsExt,
      // Bit 3 = tailles reportees apres les donnees. On ecrit les tailles
      // dans l'en-tete, donc ce bit ne doit pas etre recopie.
      drapeaux: drapeaux & ~0x08,
      donnees: brut.subarray(debut, debut + tailleC),
      clair: null,
    });
    p += 46 + lgNom + lgExtra + lgComm;
  }
  return entrees;
}

/** Contenu decompresse d'une entree, en texte. */
export async function lireTexte(entrees, nom) {
  const e = entrees.get(nom);
  if (!e) return null;
  if (e.clair == null) {
    e.clair = e.methode === 0 ? e.donnees : await decompresser(e.donnees);
  }
  return enTexte(e.clair);
}

/** Remplace le contenu d'une entree (elle sera stockee sans compression). */
export function ecrireTexte(entrees, nom, texte) {
  const e = entrees.get(nom);
  if (!e) return false;
  const octets = enOctets(texte);
  e.methode = 0;
  e.donnees = octets;
  e.clair = octets;
  e.crc = crc32(octets);
  e.tailleC = octets.length;
  e.tailleU = octets.length;
  return true;
}

/** Reconstruit l'archive. L'ordre des entrees est celui de la lecture. */
export function ecrireArchive(entrees) {
  const morceaux = [];
  const central = [];
  let position = 0;

  for (const e of entrees.values()) {
    const nom = enOctets(e.nom);
    const local = new Uint8Array(30 + nom.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, SIG_LOCAL, true);
    v.setUint16(4, 20, true);            // version minimale
    v.setUint16(6, e.drapeaux, true);
    v.setUint16(8, e.methode, true);
    v.setUint16(10, e.heure, true);
    v.setUint16(12, e.jour, true);
    v.setUint32(14, e.crc, true);
    v.setUint32(18, e.tailleC, true);
    v.setUint32(22, e.tailleU, true);
    v.setUint16(26, nom.length, true);
    v.setUint16(28, 0, true);            // pas de champ extra : il n'est pas utile ici
    local.set(nom, 30);
    morceaux.push(local, e.donnees);

    const cd = new Uint8Array(46 + nom.length);
    const w = new DataView(cd.buffer);
    w.setUint32(0, SIG_CD, true);
    w.setUint16(4, 20, true);            // version d'ecriture
    w.setUint16(6, 20, true);            // version minimale
    w.setUint16(8, e.drapeaux, true);
    w.setUint16(10, e.methode, true);
    w.setUint16(12, e.heure, true);
    w.setUint16(14, e.jour, true);
    w.setUint32(16, e.crc, true);
    w.setUint32(20, e.tailleC, true);
    w.setUint32(24, e.tailleU, true);
    w.setUint16(28, nom.length, true);
    w.setUint32(38, e.attrsExt, true);
    w.setUint32(42, position, true);
    cd.set(nom, 46);
    central.push(cd);

    position += local.length + e.tailleC;
  }

  let tailleCd = 0;
  for (const c of central) tailleCd += c.length;

  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, SIG_EOCD, true);
  f.setUint16(8, central.length, true);
  f.setUint16(10, central.length, true);
  f.setUint32(12, tailleCd, true);
  f.setUint32(16, position, true);

  return new Blob([...morceaux, ...central, fin],
    { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
}
