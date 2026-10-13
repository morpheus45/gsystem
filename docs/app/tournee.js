/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// TOURNEE DU JOUR : import d'un PDF « ordre de mission » -> une mission par
// page « ORDRE DE MISSION N° ». Meme logique que util/OrdreMissionParser.kt et
// data/Mission.kt (Android). Les missions restent 100 % LOCALES : elles ne
// partent jamais au Drive ni au back office.

const CLE = 'gsys.missions';

// pdf.js 3.x (build UMD) : lisible par les anciens Safari iOS, contrairement
// aux builds 4.x en modules. Charge a la demande, seulement a l'import.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

export function lireMissions() {
  try {
    const brut = localStorage.getItem(CLE);
    const l = brut ? JSON.parse(brut) : [];
    return Array.isArray(l) ? l : [];
  } catch (e) { return []; }
}

export function ecrireMissions(l) {
  localStorage.setItem(CLE, JSON.stringify(l));
}

/** Client « sur place » : arrivee pointee, mission non cloturee (la plus recente).
    Sert a pre-remplir le PV cameras, le bulletin et le diagnostic, comme l'APK. */
export function surPlace() {
  return lireMissions().filter((m) => !m.done && m.arrivalMs > 0)
    .sort((a, b) => b.arrivalMs - a.arrivalMs)[0] || null;
}

/** « 12 RUE DE LA PAIX, 34140 MEZE » : une ligne, pour les champs d'adresse uniques. */
export function adresseComplete(m) {
  return [m.adresse, [m.cp, m.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

/** Missions a traiter (pas encore cloturees), triees par heure de RDV. */
export function missionsActives() {
  return lireMissions().filter((m) => !m.done)
    .sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));
}

/** Modifie une mission par son n° d'ordre de mission. */
export function majMission(num, maj) {
  ecrireMissions(lireMissions().map((m) => (m.num === num ? { ...m, ...maj } : m)));
}

let chargement = null;
function chargerPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!chargement) {
    chargement = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        ok(window.pdfjsLib);
      };
      s.onerror = () => { chargement = null; ko(new Error('pdf.js indisponible (réseau ?)')); };
      document.head.appendChild(s);
    });
  }
  return chargement;
}

/**
 * Texte du PDF, ligne par ligne (comme PDFTextStripper) : les morceaux de
 * texte sont regroupes par hauteur puis lus de gauche a droite.
 */
export async function texteDuPdf(donnees) {
  const pdfjs = await chargerPdfJs();
  const doc = await pdfjs.getDocument({ data: donnees }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const contenu = await page.getTextContent();
    const lignes = [];
    contenu.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5];
      const x = it.transform[4];
      let l = lignes.find((z) => Math.abs(z.y - y) < 3);
      if (!l) { l = { y, morceaux: [] }; lignes.push(l); }
      l.morceaux.push({ x, s: it.str });
    });
    lignes.sort((a, b) => b.y - a.y);
    pages.push(lignes.map((l) => l.morceaux.sort((a, b) => a.x - b.x)
      .map((m) => m.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n'));
  }
  return pages.join('\n');
}

const CIVILITE = /^(?:MME|MLLE|MR|M)\.?\s+/i;

/** Coeur testable : parse le TEXTE deja extrait du PDF (miroir du Kotlin). */
export function parseTexte(texte) {
  const starts = [];
  const re = /ORDRE DE MISSION N°/g;
  let m;
  while ((m = re.exec(texte))) starts.push(m.index);
  if (!starts.length) return [];

  const ch = (r, bloc) => {
    const x = r.exec(bloc);
    return x && x[1] ? x[1].trim() : '';
  };

  const missions = [];
  starts.forEach((start, i) => {
    // Le bloc part de la ligne « RDV : … » qui precede le marqueur et va
    // jusqu'au RDV de la mission suivante (les pages PV restent dedans mais
    // n'ont aucun champ « : » exploitable).
    const r0 = texte.lastIndexOf('RDV', start);
    const from = r0 >= 0 ? r0 : start;
    let end = texte.length;
    if (i + 1 < starts.length) {
      const nf = texte.lastIndexOf('RDV', starts[i + 1]);
      end = nf > from ? nf : starts[i + 1];
    }
    const b = texte.slice(from, end);

    const num = ch(/ORDRE DE MISSION N°\s*(\d+)/, b);
    if (!num) return;
    const dateRdv = ch(/RDV\s*:\s*(\d{2}\/\d{2}\/\d{4})/, b);
    const heure = ch(/RDV\s*:\s*\d{2}\/\d{2}\/\d{4}\s*à\s*(\d{1,2}:\d{2})/, b);
    const type = ch(/Type de mission\s*:\s*([A-ZÉÈ]+)/, b);
    // Nom = la ligne qui se termine par « V : » ; civilite retiree.
    const nom = ch(/\n\s*([^\n]+?)\s+V\s*:/, b).replace(CIVILITE, '').trim();
    // Adresse = 1re ligne avec un code postal (5 chiffres).
    const adr = ch(/\n([^\n]*\b\d{5}\b[^\n]*)\n/, b);
    const cp = ch(/\b(\d{5})\b/, adr);
    const dept = cp.length >= 2 ? cp.slice(0, 2) : '';
    const ville = ch(/\b\d{5}\b\s+(.+)$/, adr);
    // pdf.js coupe souvent la rue et « CP VILLE » sur deux lignes : la rue est
    // alors la ligne juste au-dessus (sauf si c'est la ligne du nom « V : »).
    let adresse = adr.replace(/\s*\b\d{5}\b.*$/, '').trim();
    if (!adresse && adr) {
      const avant = b.slice(0, b.indexOf(adr)).split('\n').filter((l) => l.trim());
      const prec = avant.length ? avant[avant.length - 1].trim() : '';
      if (prec && !/\bV\s*:/.test(prec)) adresse = prec;
    }
    const site = ch(/\bSite\s*:\s*(\d+)/, b);
    const conv = ch(/Convention\s*:\s*(\d+)/, b);
    // Portable d'abord ; « / » stoppe la capture au 1er numero. Sinon le fixe.
    const tel = ch(/Tel portable\s*:\s*([\d ]{8,})/, b)
      || ch(/Tel fixe\s*:\s*([\d ]{8,})/, b);

    missions.push({
      num, dateRdv, heure, type, nom, adresse, cp, dept, ville, tel, site, conv,
      arrivalMs: 0, done: false,
    });
  });
  return missions.sort((a, b) => a.heure.localeCompare(b.heure));
}

/** Fichier PDF choisi -> missions (remplace la tournee precedente). */
export async function importerPdf(fichier) {
  const donnees = new Uint8Array(await fichier.arrayBuffer());
  const missions = parseTexte(await texteDuPdf(donnees));
  if (missions.length) ecrireMissions(missions);
  return missions;
}
