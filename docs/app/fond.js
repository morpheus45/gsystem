/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Surimpression d'une trame PDF officielle (demande de conges, PV cameras).
//
// L'Android ouvre la trame avec PdfRenderer, la RASTERISE a 180 dpi, dessine
// les champs sur l'image et enregistre l'image comme page. Safari ne sait pas
// rasteriser un PDF, et embarquer un moteur de rendu couterait des centaines
// de kilo-octets a une application qui doit fonctionner hors ligne.
//
// On obtient le meme document autrement : la trame est reprise TELLE QUELLE et
// les champs sont ajoutes par-dessus, en vectoriel, aux memes coordonnees. Le
// bureau recoit le meme formulaire rempli aux memes endroits, en plus net.
//
// Technique : mise a jour incrementale. Les octets d'origine ne sont pas
// touches ; on ajoute a la fin les objets nouveaux, une page reecrite dont le
// /Contents pointe aussi vers notre flux, et une table xref qui renvoie a
// l'ancienne par /Prev. C'est le mecanisme prevu par le format, et il evite
// d'avoir a comprendre tout le fichier.

/** Lecture d'un PDF en latin1 : un octet = un caractere, positions preservees. */
function enTexte(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

/** Ecriture inverse : un caractere = un octet, sans passer par l'UTF-8. */
function enOctets(s) {
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
}

/**
 * Localise le Nieme objet page. Les deux trames ecrivent leurs objets page en
 * clair (hors flux d'objets), ce qui permet de les retrouver sans decoder la
 * table des references.
 */
export function pageDeFond(u8, index) {
  const s = enTexte(u8);
  const pages = [];
  const re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const fin = s.indexOf('endobj', m.index);
    if (fin < 0) continue;
    const corps = s.slice(m.index + m[0].length, fin);
    if (!/\/Type\s*\/Page(?![s])/.test(corps)) continue;
    pages.push({ num: Number(m[1]), debut: m.index, fin: fin + 6, corps: corps });
  }
  const p = pages[index || 0];
  if (!p) throw new Error('Trame illisible : aucune page trouvée.');

  const boite = p.corps.match(
    /\/MediaBox\s*\[\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/);
  const contenus = [];
  const cRef = p.corps.match(/\/Contents\s+(\d+)\s+0\s+R/);
  const cTab = p.corps.match(/\/Contents\s*\[([^\]]*)\]/);
  if (cTab) {
    const re2 = /(\d+)\s+0\s+R/g;
    let x;
    while ((x = re2.exec(cTab[1]))) contenus.push(x[1] + ' 0 R');
  } else if (cRef) {
    contenus.push(cRef[1] + ' 0 R');
  }

  return {
    numero: p.num,
    corps: p.corps,
    contenus: contenus,
    largeur: boite ? Number(boite[3]) - Number(boite[1]) : 595,
    hauteur: boite ? Number(boite[4]) - Number(boite[2]) : 842,
    total: pages.length,
  };
}

/** Plus grand /Size rencontre : c'est le premier numero d'objet libre. */
function prochainNumero(s) {
  let max = 0;
  let m;
  const re = /\/Size\s+(\d+)/g;
  while ((m = re.exec(s))) max = Math.max(max, Number(m[1]));
  if (max) return max;
  const re2 = /(\d+)\s+0\s+obj\b/g;
  while ((m = re2.exec(s))) max = Math.max(max, Number(m[1]));
  return max + 1;
}

function racine(s) {
  const m = [...s.matchAll(/\/Root\s+(\d+)\s+0\s+R/g)].pop();
  return m ? m[1] : null;
}

function dernierStartxref(s) {
  const m = [...s.matchAll(/startxref\s+(\d+)/g)].pop();
  return m ? Number(m[1]) : 0;
}

/**
 * Ajoute `flux` par-dessus la page decrite par `page` et rend le PDF complet.
 *
 * `flux` est du contenu PDF brut (celui que rend creerPage().flux()), exprime
 * dans le repere de la trame. Les polices FR / FB / FS / FD y sont disponibles.
 */
export function surimprimer(u8, page, flux) {
  return surimprimerPages(u8, [{ page: page, flux: flux }]);
}

/**
 * Surimprime plusieurs pages en une seule passe : le PV tient sur deux pages,
 * et deux mises a jour successives empileraient inutilement deux tables xref.
 * `couches` = [{ page, flux }].
 */
export function surimprimerPages(u8, couches) {
  const s = enTexte(u8);
  const root = racine(s);
  if (!root) throw new Error('Trame illisible : catalogue introuvable.');

  let n = prochainNumero(s);
  const idFR = n++;
  const idFB = n++;
  const idFS = n++;
  const idFD = n++;
  const polices = '/FR ' + idFR + ' 0 R /FB ' + idFB + ' 0 R /FS ' + idFS
                + ' 0 R /FD ' + idFD + ' 0 R';

  const objets = [
    [idFR, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'],
    [idFB, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'],
    [idFS, '<< /Type /Font /Subtype /Type1 /BaseFont /Symbol /Encoding '
         + '<< /Type /Encoding /Differences [65 /lessequal /greaterequal /arrowright] >> >>'],
    [idFD, '<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats /Encoding '
         + '<< /Type /Encoding /Differences [65 /a19 /a23] >> >>'],
  ];

  couches.forEach((couche) => {
    const page = couche.page;
    const idFlux = n++;
    // Le flux est encadre par q/Q : la trame peut laisser un etat graphique
    // quelconque, et rien de ce qu'on dessine ne doit deborder sur elle.
    const contenu = 'q\n1 0 0 1 0 0 cm\n' + couche.flux + '\nQ';

    // Page reecrite : meme dictionnaire, /Contents et /Resources completes.
    let corps = page.corps;
    const liste = page.contenus.concat([idFlux + ' 0 R']).join(' ');
    if (/\/Contents\s*\[/.test(corps)) {
      corps = corps.replace(/\/Contents\s*\[[^\]]*\]/, '/Contents [' + liste + ']');
    } else {
      corps = corps.replace(/\/Contents\s+\d+\s+0\s+R/, '/Contents [' + liste + ']');
    }
    if (/\/Font\s*<</.test(corps)) {
      corps = corps.replace(/\/Font\s*<</, '/Font << ' + polices + ' ');
    } else if (/\/Resources\s*<</.test(corps)) {
      corps = corps.replace(/\/Resources\s*<</,
        '/Resources << /Font << ' + polices + ' >> ');
    } else {
      // Ressources heritees ou indirectes : la page recoit son propre /Font, ce
      // qui n'enleve rien a la trame - elle porte deja ses ressources ailleurs.
      corps = corps.replace(/>>\s*$/, '/Resources << /Font << ' + polices + ' >> >> >>');
    }
    objets.push([idFlux,
      '<< /Length ' + contenu.length + ' >>\nstream\n' + contenu + '\nendstream']);
    objets.push([page.numero, corps.trim()]);
  });
  objets.sort((a, b) => a[0] - b[0]);

  let ajout = '\n';
  const positions = {};
  objets.forEach((o) => {
    positions[o[0]] = s.length + ajout.length;
    ajout += o[0] + ' 0 obj\n' + o[1] + '\nendobj\n';
  });

  // Table xref de la mise a jour : une sous-section par suite de numeros.
  const groupes = [];
  objets.map((o) => o[0]).forEach((num) => {
    const dernier = groupes[groupes.length - 1];
    if (dernier && num === dernier[dernier.length - 1] + 1) dernier.push(num);
    else groupes.push([num]);
  });

  const debutXref = s.length + ajout.length;
  let xref = 'xref\n';
  groupes.forEach((g) => {
    xref += g[0] + ' ' + g.length + '\n';
    g.forEach((num) => {
      xref += String(positions[num]).padStart(10, '0') + ' 00000 n \n';
    });
  });
  xref += 'trailer\n<< /Size ' + n + ' /Root ' + root + ' 0 R /Prev '
        + dernierStartxref(s) + ' >>\nstartxref\n' + debutXref + '\n%%EOF\n';

  const queue = enOctets(ajout + xref);
  const sortie = new Uint8Array(u8.length + queue.length);
  sortie.set(u8, 0);
  sortie.set(queue, u8.length);
  return new Blob([sortie], { type: 'application/pdf' });
}
