// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Transformations pures entre lignes de la feuille de chat (colonnes id, tech, from,
// text, ts, readTech, readBureau) et objets message. Testées par test/chat.test.js.

// Lignes -> messages ; `depuis` (horodatage ms) ne garde que les plus récents.
export function feuilleEnMessages(rows, depuis) {
  const out = [];
  if (!rows || !rows.length) return out;
  for (let i = 0; i < rows.length; i++) {
    const ts = Number(rows[i][4]);
    if (depuis && ts <= depuis) continue;
    const parBureau = String(rows[i][2]) === 'bureau';
    // « lu » = accusé de lecture du DESTINATAIRE : readTech pour un message du bureau,
    // readBureau pour un message du technicien (comme l'APK).
    out.push({
      id: Number(rows[i][0]),
      tech: String(rows[i][1]),
      from: String(rows[i][2]),
      text: String(rows[i][3]),
      ts: ts,
      lu: (parBureau ? rows[i][5] : rows[i][6]) === true
    });
  }
  return out;
}

// Messages -> lignes de la feuille (texte borné à 2000 caractères, caractères de
// contrôle retirés, nom du technicien nettoyé comme le fait l'APK).
export function messagesEnFeuille(msgs) {
  if (!msgs || !msgs.length) return [];
  const rows = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const tech = String(m.tech || '').replace(/[\/\\:*?"<>|]/g, '_').trim().slice(0, 80) || 'x';
    const text = String(m.text || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 2000);
    const from = String(m.from) === 'bureau' ? 'bureau' : 'tech';
    // Le texte vide ne se pose pas : sans texte, rien à ajouter.
    if (!text) continue;
    const ts = Number(m.ts) || Date.now();
    const id = Number(m.id);
    rows.push([id, tech, from, text, ts, from === 'tech', from === 'bureau']);
  }
  return rows;
}