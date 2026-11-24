// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Seul point d'envoi vers le Drive - miroir de backup/Passerelle.kt.
//  - pas encore connecte : ancien script, comme avant ;
//  - connecte : passerelle et jeton propre a CET iPhone ;
//  - deconnecte (autre telephone, ou coupe par le bureau) : plus aucun envoi,
//    sans retour a l'ancien jeton. Les donnees restent sur l'iPhone.

import { POINT, JETON } from './backup.js';

/** Vide = passerelle pas encore en service : rien ne change dans l'application. */
export const PASSERELLE = '';
const CLE = 'gsys.connexion';
const COUPE = 'coupe';

const lu = () => { try { return localStorage.getItem(CLE); } catch (e) { return null; } };

export function etatConnexion() {
  if (!PASSERELLE) return 'ancienne';
  const v = lu();
  if (v === null) return 'ancienne';
  return /^[0-9a-f]{64}$/.test(v) ? 'connecte' : 'deconnecte';
}

async function envoyer(url, charge) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      // text/plain : evite la requete preliminaire CORS, qu'Apps Script ne sait pas traiter.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(charge),
    });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

/** POST ; la charge ne contient aucun jeton. null = reseau, refus ou deconnecte. */
export async function poster(charge) {
  const etat = etatConnexion();
  if (etat === 'deconnecte') return null;
  if (etat === 'ancienne') return envoyer(POINT, { ...charge, token: JETON });
  const jeton = lu();
  const rep = await envoyer(PASSERELLE, { ...charge, jeton });
  // Refus certain pour CE jeton ; une panne ne coupe rien.
  if (rep && rep.ok === false && rep.error === 'token' && lu() === jeton) {
    try { localStorage.setItem(CLE, COUPE); } catch (e) { /* rien */ }
    return null;
  }
  return rep;
}

export async function demanderCode(mail) {
  if (!PASSERELLE) return false;
  const r = await envoyer(PASSERELLE, { action: 'code_demander', mail: String(mail).trim() });
  return !!(r && r.ok);
}

/** Rend { etat } : pret, remplace, ok, refus ou reseau. */
export async function connecter(mail, code, confirme) {
  if (!PASSERELLE) return { etat: 'reseau' };
  const r = await envoyer(PASSERELLE, {
    action: 'connecter', mail: String(mail).trim(), code: String(code).replace(/\D/g, ''),
    appareil: 'iPhone', confirme: confirme === true,
  });
  if (!r) return { etat: 'reseau' };
  if (!r.ok) return { etat: r.error === 'refus' ? 'refus' : 'reseau' };
  if (r.etat === 'ok') {
    if (!/^[0-9a-f]{64}$/.test(r.jeton || '')) return { etat: 'reseau' };
    localStorage.setItem(CLE, r.jeton);
  }
  return { etat: r.etat, ancien: r.ancien || '', ancienEnvoi: r.ancienEnvoi || '' };
}
