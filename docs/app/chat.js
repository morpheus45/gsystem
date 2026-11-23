// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
/**
 * Service de chat tech ↔ bureau, identique à l'APK Android.
 * Utilise le même endpoint que les sauvegardes (backup.js) pour éviter les problèmes de CORS.
 * POST JSON { token, action, tech, ... } → réponse JSON { ok, ... }.
 * Tout est non bloquant et tolérant à l'échec réseau (retourne null / [] / false).
 */

import { POINT, JETON } from './backup.js';

/**
 * POST JSON { token, action, tech, ... } → réponse JSON { ok, ... }.
 * Non bloquant et tolérant à l'échec réseau (retourne null / [] / false).
 */
async function demanderChat(action, tech, extra) {
  try {
    const payload = { token: JETON, action, tech };
    if (extra) Object.assign(payload, extra);
    const r = await fetch(POINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/**
 * Envoie un message du technicien.
 * @param {string} tech - nom du technicien
 * @param {string} text - texte du message
 * @returns {boolean} true si ok
 */
export async function envoyerMessage(tech, text) {
  if (!String(tech || '').trim() || !String(text || '').trim()) return false;
  const resp = await demanderChat('chat_send', tech, { text });
  return !!(resp && resp.ok === true);
}

/**
 * Récupère tout le fil du technicien (volume faible : on relit à chaque poll).
 * @param {string} tech - nom du technicien
 * @returns {Array<ChatMessage>} liste des messages
 */
export async function chargerMessages(tech) {
  if (!String(tech || '').trim()) return [];
  const resp = await demanderChat('chat_fetch', tech, null);
  if (!resp || !resp.ok || !Array.isArray(resp.messages)) return [];
  return resp.messages.map((m) => ({
    id: Number(m.id) || 0,
    from: String(m.from || ''),
    text: String(m.text || ''),
    ts: Number(m.ts) || 0,
  }));
}

/**
 * Marque comme lus (côté tech) les messages jusqu'à upToId inclus.
 * @param {string} tech - nom du technicien
 * @param {number} upToId - id du dernier message lu
 * @returns {boolean} true si ok
 */
export async function marquerLus(tech, upToId) {
  if (!String(tech || '').trim() || !(upToId > 0)) return false;
  const resp = await demanderChat('chat_markRead', tech, { upTo: upToId });
  return !!(resp && resp.ok === true);
}