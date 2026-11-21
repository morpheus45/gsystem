// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Archive ZIP « stockée » (sans compression) : photos et PDF sont déjà compressés.
// Format : APPNOTE de PKWARE (en-têtes locaux, répertoire central, fin de répertoire),
// noms en UTF-8 (bit 11). Moins de 65 535 fichiers et 4 Go : pas de ZIP64.

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Chemin relatif sûr (« Zip Slip ») : ni racine, ni lecteur, ni « .. », ni caractère de contrôle.
export function nomDansZip(nom) {
  return String(nom).replace(/[\u0000-\u001f]/g, '').replace(/\\/g, '/').replace(/:/g, '_')
    .split('/').filter((p) => p && p !== '.' && p !== '..').join('/');
}

export function zipStocke(fichiers, date = new Date()) {
  const heure = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const jour = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const morceaux = [], central = [];
  let position = 0;
  const entete = (signature, champs, nom) => {   // champs : [valeur, taille en octets]
    const t = 4 + champs.reduce((s, [, n]) => s + n, 0);
    const v = new DataView(new ArrayBuffer(t));
    v.setUint32(0, signature, true);
    let i = 4;
    for (const [x, n] of champs) { n === 2 ? v.setUint16(i, x, true) : v.setUint32(i, x, true); i += n; }
    return [new Uint8Array(v.buffer), nom];
  };
  for (const { nom, donnees } of fichiers) {
    const n = new TextEncoder().encode(nomDansZip(nom)), crc = crc32(donnees), taille = donnees.length;
    const commun = [[20, 2], [0x0800, 2], [0, 2], [heure, 2], [jour, 2], [crc, 4], [taille, 4], [taille, 4], [n.length, 2], [0, 2]];
    const [local] = entete(0x04034b50, commun);
    morceaux.push(local, n, donnees);
    central.push(...entete(0x02014b50, [[20, 2], ...commun, [0, 2], [0, 2], [0, 2], [0, 4], [position, 4]], n));
    position += local.length + n.length + taille;
  }
  const tailleCentral = central.reduce((s, m) => s + m.length, 0);
  const [fin] = entete(0x06054b50, [[0, 2], [0, 2], [fichiers.length, 2], [fichiers.length, 2], [tailleCentral, 4], [position, 4], [0, 2]]);
  const tout = [...morceaux, ...central, fin];
  const sortie = new Uint8Array(tout.reduce((s, m) => s + m.length, 0));
  let i = 0;
  for (const m of tout) { sortie.set(m, i); i += m.length; }
  return sortie;
}
