/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Compte connecte - miroir de auth/Session.kt. Le jeton, signe par le script
// Apps Script, remplace l'ancien jeton partage : il est propre au technicien et
// revocable, et le script en deduit lui-meme QUI ecrit. Plus aucun secret dans
// ce code public.

export const POINT = 'https://script.google.com/macros/s/'
  + 'AKfycbxJDvoGwgrtlZH5AVrBlHLJy8sYGW7laIKU_AH880C1BRi79_JthDYp2nHgplCP_w9t/exec';
const CLE = 'gsys.session';
const JOUR = 24 * 3600 * 1000;

export function session() {
  try { return JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { return null; }
}
export const jeton = () => (session() || {}).jeton || '';
function enregistrer(r) {
  localStorage.setItem(CLE, JSON.stringify(
    { email: r.email, nom: r.nom, role: r.role, jeton: r.jeton, depuis: Date.now() }));
}
/** Deconnexion : seul le compte est oublie, les donnees du telephone restent. */
export function effacerSession() { localStorage.removeItem(CLE); }

/** A passer sur chaque reponse du script : « session » = retour a la connexion. */
export function verifierReponse(texte) {
  if (texte && texte.indexOf('"error":"session"') >= 0 && session()) {
    effacerSession();
    window.dispatchEvent(new Event('gsys-session'));
  }
}

async function appeler(corps) {
  // text/plain : pas de requete preliminaire CORS, qu'Apps Script ne sait pas traiter.
  const r = await fetch(POINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corps),
  });
  return r.json();
}

/** Rend null si la connexion a reussi, sinon le code du refus. Exception = pas de reseau. */
export async function seConnecter(email, motDePasse) {
  const r = await appeler({ action: 'auth_connexion', email: String(email).trim(), motDePasse });
  if (!r.ok) return r.error || 'inconnu';
  enregistrer(r);
  return null;
}

/** Le jeton vit 90 jours : on le prolonge des 7 jours d'age, quand le reseau le permet. */
export async function renouvelerSiBesoin() {
  const s = session();
  if (!s || Date.now() - (s.depuis || 0) < 7 * JOUR) return;
  try {
    const r = await appeler({ action: 'auth_renouveler', token: s.jeton });
    if (r.ok) enregistrer(r);
    else verifierReponse(JSON.stringify(r));
  } catch (e) { /* hors reseau : nouvel essai au prochain lancement */ }
}
