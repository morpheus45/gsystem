// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Modules du bureau sur l'iPhone - miroir de modules/ModulesDepot.kt.
// Une saisie est d'abord gardee dans les donnees de l'iPhone (donc sauvegardee avec
// elles), puis envoyee par la passerelle. Rien ne s'efface ; sans passerelle, rien ne part.

import { poster, etatConnexion, PASSERELLE } from './connexion.js';

const CLE_LISTE = 'gsys.modules.liste';
const CLE_CACHEES = 'gsys.modules.cachees';
const CLE_BROUILLON = 'gsys.modules.brouillon.';

/** Nom de la tuile pour le bureau. Cloture, envoi mensuel et messages n'y sont pas : jamais caches. */
export const MASQUABLES = { arrivee: 'arrivee', attente: 'attente', techline: 'techline', logistique: 'logistique',
  courrier: 'courrier', pv: 'pv_cameras', bulletin: 'bulletin', demande_brouillard: 'brouillard', recap: 'recap',
  frais: 'frais', prime: 'prime', conge: 'conge' };
const NOMS = new Set(Object.values(MASQUABLES));

const lire = (cle, defaut) => { try { const v = JSON.parse(localStorage.getItem(cle)); return v == null ? defaut : v; } catch (e) { return defaut; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); return true; } catch (e) { return false; } };

const moduleLisible = (m) => m && typeof m.id === 'string' && /^[0-9a-f-]{36}$/.test(m.id) && typeof m.nom === 'string'
  && Number.isInteger(m.version) && Array.isArray(m.champs)
  && m.champs.every((c) => c && typeof c.cle === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(c.cle) && typeof c.libelle === 'string');

export function listeModules() {
  const l = PASSERELLE ? lire(CLE_LISTE, []) : [];
  return Array.isArray(l) ? l.filter(moduleLisible) : [];
}

export function tuilesCachees() {
  const l = PASSERELLE ? lire(CLE_CACHEES, []) : [];
  return new Set(Array.isArray(l) ? l.filter((t) => NOMS.has(t)) : []);
}

/** Une arrivee en cours garde sa tuile : elle sert a cloturer. */
export function tuileVisible(ecran, cachees, arriveeEnCours) {
  return !MASQUABLES[ecran] || ecran === arriveeEnCours || !cachees.has(MASQUABLES[ecran]);
}

export function nouvelId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const o = crypto.getRandomValues(new Uint8Array(16));
  o[6] = (o[6] & 15) | 64; o[8] = (o[8] & 63) | 128;
  const h = [...o].map((x) => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
export const nomPiece = (champ) => 'MOD_' + nouvelId() + '_' + champ.cle + (champ.type === 'signature' ? '.png' : '.jpg');

export const lireBrouillon = (idModule) => {
  const b = lire(CLE_BROUILLON + idModule, null);
  return b && b.id && moduleLisible(b.module) && b.textes ? b : null;
};
export const garderBrouillon = (b) => ecrire(CLE_BROUILLON + b.module.id, b);
export function effacerBrouillon(idModule) { try { localStorage.removeItem(CLE_BROUILLON + idModule); } catch (e) { /* rien */ } }

/** Photos et signatures de la saisie. */
export const piecesDe = (s) => s.champs.filter((c) => c.type === 'photo' || c.type === 'signature')
  .map((c) => s.valeurs[c.cle]).filter(Boolean);

export const etatSaisie = (s) => (s.envoyee ? 'Envoyée'
  : s.refus === 'piece' ? 'Photo introuvable : gardée sur cet iPhone'
    : s.refus ? 'Refusée par le bureau : gardée sur cet iPhone' : 'En attente d’envoi');

let enCours = null;

/**
 * Relit la liste du bureau puis envoie ce qui attend. [saisies] rend la liste ACTUELLE,
 * [marquer] note l'etat d'une saisie, [photo] rend une image. Vrai si quelque chose a change.
 */
export function echanger(outils) {
  if (!PASSERELLE || etatConnexion() !== 'connecte') return Promise.resolve(false);
  if (!enCours) enCours = faire(outils).catch(() => false).finally(() => { enCours = null; });
  return enCours;
}

async function faire({ saisies, marquer, photo }) {
  let change = false;
  const r = await poster({ action: 'modules_liste', support: 'iphone' });
  if (r && r.ok) {
    const noter = (cle, v) => { if (Array.isArray(v) && localStorage.getItem(cle) !== JSON.stringify(v)) { ecrire(cle, v); change = true; } };
    noter(CLE_LISTE, r.modules);
    noter(CLE_CACHEES, r.cachees);
  }
  for (const s of saisies().filter((x) => !x.envoyee)) {
    const etat = await envoyerUne(s, photo);
    if (etat === null) break;                    // reseau : on reprendra plus tard
    if (etat !== (s.refus || '')) { marquer(s.id, etat === 'ok' ? { envoyee: true, refus: '' } : { refus: etat }); change = true; }
  }
  return change;
}

/** 'ok', un refus, ou null (reseau). Les pieces d'abord : une saisie recue a toujours ses photos. */
async function envoyerUne(s, photo) {
  for (const nom of piecesDe(s)) {
    const d = photo(nom);
    if (!d) return 'piece';
    const r = await poster({ month: 'modules', fileName: nom, mimeType: (d.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg', dataBase64: d.slice(d.indexOf(',') + 1) });
    if (!r || r.ok !== true) return null;
  }
  const r = await poster({ action: 'module_saisie', id: s.id, module: s.module, version: s.version, date: s.date, valeurs: s.valeurs });
  if (!r) return null;
  if (r.ok) return 'ok';
  return ['conflit', 'module', 'contenu'].includes(r.error) ? r.error : null;
}
