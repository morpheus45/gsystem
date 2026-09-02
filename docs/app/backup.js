/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Depot sur le Drive partage - miroir de backup/BackupUploader.kt et
// backup/StatsUploader.kt.
//
// Le meme deploiement Apps Script recoit le mail mensuel, ses pieces jointes et
// le _stats.json qui alimente le tableau de bord du comptable. Le classement
// est identique : Sauvegardes G-Systems / <tech> / <mois de FIN du cycle>/.
//
// UNE difference technique, imposee par le navigateur : l'Android poste en
// application/json, ce qui declencherait ici une requete preliminaire CORS
// qu'Apps Script ne sait pas traiter. On poste donc en text/plain - le script
// lit e.postData.contents sans regarder le type, la charge utile est identique.
//
// Rien n'est bloquant : un depot qui echoue ne doit jamais empecher un envoi
// mensuel de partir, exactement comme le runCatching de l'Android.

import { remboursable, tvaDepuisTtc, htDepuisTtc } from './frais.js';
import { primesParType, datesInstallation, totalInstalle } from './gesteco.js';

export const POINT = 'https://script.google.com/macros/s/'
  + 'AKfycbxJDvoGwgrtlZH5AVrBlHLJy8sYGW7laIKU_AH880C1BRi79_JthDYp2nHgplCP_w9t/exec';
export const JETON = 'gsys-backup-2026-7Kq2vR';

const enBase64 = (o) => {
  let s = '';
  const bloc = 0x8000;
  for (let i = 0; i < o.length; i += bloc) {
    s += String.fromCharCode.apply(null, o.subarray(i, i + bloc));
  }
  return btoa(s);
};

/** Type MIME d'une piece jointe d'apres son extension, comme mimeForFile. */
export function typeMime(nom) {
  const ext = String(nom).split('.').pop().toLowerCase();
  const table = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', txt: 'text/plain',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return table[ext] || 'application/octet-stream';
}

/** Depose des octets. Rend true seulement si le script a repondu ok. */
export async function envoyerOctets(tech, mois, nomFichier, mime, octets) {
  try {
    const r = await fetch(POINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: JETON,
        user: String(tech || '').trim() || 'Inconnu',
        month: mois,
        fileName: nomFichier,
        mimeType: mime,
        dataBase64: enBase64(octets),
      }),
    });
    if (!r.ok) return false;
    return (await r.text()).indexOf('"ok":true') >= 0;
  } catch (e) {
    return false;   // hors reseau ou script injoignable : jamais bloquant
  }
}

/** Depose un fichier deja constitue (piece jointe du mensuel). */
export async function envoyerFichier(tech, mois, fichier) {
  const octets = new Uint8Array(await fichier.arrayBuffer());
  return envoyerOctets(tech, mois, fichier.name, typeMime(fichier.name), octets);
}

/**
 * Le _stats.json du cycle : c'est lui que lit le tableau de bord. La forme des
 * champs suit StatsUploader.push, sans quoi le dashboard afficherait du vide.
 */
export function statsDuCycle(reglages, entrees, lot, debut, fin) {
  const parType = {};
  lot.temps.forEach((e) => {
    const k = String(e.typeMission || '').trim() || '—';
    parType[k] = (parType[k] || 0) + 1;
  });
  const primes = primesParType(lot.gesteCo, datesInstallation(entrees.temps));

  return {
    tech: reglages.nomUtilisateur,
    month: String(fin).slice(0, 7),
    periode: debut + ' → ' + fin,
    interventions: lot.temps.length,
    tickets: lot.frais.length,
    frais: lot.frais.reduce((a, f) => a + (Number(f.montantEur) || 0), 0),
    primes: primes.reduce((a, p) => a + p.total, 0),
    extensions: lot.gesteCo.reduce((a, g) => a + totalInstalle(g), 0),
    compteur: lot.compteur.length,
    repartition: Object.keys(parType).map((t) => ({ type: t, count: parType[t] })),
    primesParType: primes.map((p) => ({
      type: p.type, qty: p.nb, unit: p.tarif, total: p.total,
    })),
    clotures: lot.temps.map((t) => ({
      date: t.date, type: t.typeMission, client: t.nomClient, ville: t.ville,
      dept: t.departement, num: t.numeroIntervention,
      obs: t.observationType || '', note: t.observations || '',
      motif: t.motifRetard || '', hDebut: t.heureDebut || '',
      hFin: t.heureFin || '',
    })),
    fraisList: lot.frais.map((f) => {
      const m = Number(f.montantEur) || 0;
      const cat = String(f.categorie || '').trim() || 'DIVERS';
      return {
        d: f.date, m: m, cat: cat,
        tva: tvaDepuisTtc(m, cat, f.sansTva),
        ht: htDepuisTtc(m, cat, f.sansTva),
        remb: remboursable(m, cat),
      };
    }),
    gestes: lot.gesteCo.map((g) => ({ d: g.date, t: g.installe || {} })),
    prices: primes.reduce((o, p) => { o[p.type] = p.tarif; return o; }, {}),
    maj: Date.now(),
  };
}

/** Depose le _stats.json du cycle dans le dossier du mois de FIN. */
export async function pousserStats(reglages, entrees, lot, debut, fin) {
  const json = JSON.stringify(statsDuCycle(reglages, entrees, lot, debut, fin));
  return envoyerOctets(reglages.nomUtilisateur, String(fin).slice(0, 7),
    '_stats.json', 'application/json', new TextEncoder().encode(json));
}

/**
 * Copie complete de l'envoi mensuel sur le Drive : le corps du mail, puis
 * chaque piece jointe, puis les stats definitives. Le dossier porte le mois de
 * FIN du cycle, la seule autorite de rangement (voir cycle.js).
 */
export async function deposerEnvoi(reglages, entrees, lot, debut, fin, pieces, corps) {
  const mois = String(fin).slice(0, 7);
  const tech = reglages.nomUtilisateur;
  let deposees = 0;
  if (await envoyerOctets(tech, mois, 'mail-mensuel_' + debut + '.txt',
    'text/plain', new TextEncoder().encode(corps))) deposees++;
  for (const p of pieces) {
    if (await envoyerFichier(tech, mois, p)) deposees++;
  }
  if (await pousserStats(reglages, entrees, lot, debut, fin)) deposees++;
  return deposees;
}
