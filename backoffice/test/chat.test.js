// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tests du pont/chat.js (feuilleEnMessages, messagesEnFeuille) — transformations pures
// entre la feuille de chat (colonnes id, tech, from, text, ts, readTech, readBureau)
// et les objets message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feuilleEnMessages, messagesEnFeuille } from '../pont/chat.js';

// ---- feuilleEnMessages ----

test('feuilleEnMessages : entrée vide -> sortie vide', () => {
  assert.deepEqual(feuilleEnMessages([], 0), []);
  assert.deepEqual(feuilleEnMessages(null, 0), []);
});

test('feuilleEnMessages : message du bureau -> lu = readTech', () => {
  const rows = [[1000, 'Tech1', 'bureau', 'Bonjour', 1000, true, false]];
  const msgs = feuilleEnMessages(rows, 0);
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0], {
    id: 1000, tech: 'Tech1', from: 'bureau', text: 'Bonjour', ts: 1000, lu: true
  });
});

test('feuilleEnMessages : message du tech -> lu = readBureau', () => {
  const rows = [[1001, 'Tech1', 'tech', 'Salut', 1001, false, true]];
  const msgs = feuilleEnMessages(rows, 0);
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0], {
    id: 1001, tech: 'Tech1', from: 'tech', text: 'Salut', ts: 1001, lu: true
  });
});

test('feuilleEnMessages : filtre depuis (horodatage) — ne garde que les plus récents', () => {
  const rows = [
    [1, 'T', 'tech', 'Ancien', 100, true, false],
    [2, 'T', 'bureau', 'Récent', 200, false, true],
    [3, 'T', 'tech', 'Encore', 300, true, false],
  ];
  const msgs = feuilleEnMessages(rows, 100);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].id, 2);
  assert.equal(msgs[1].id, 3);
});

test('feuilleEnMessages : depuis = 0 (ou falsy) -> ne filtre rien', () => {
  const rows = [
    [1, 'T', 'tech', 'Ancien', 100, true, false],
    [2, 'T', 'bureau', 'Récent', 200, false, true],
  ];
  const msgs = feuilleEnMessages(rows, 0);
  assert.equal(msgs.length, 2);
});

test('feuilleEnMessages : id et ts sont des nombres (feuille stockant des types réels)', () => {
  const rows = [[42, 'T', 'bureau', 'Salut', 1700000000000, true, false]];
  const msgs = feuilleEnMessages(rows, 0);
  assert.equal(msgs[0].id, 42);
  assert.equal(typeof msgs[0].id, 'number');
  assert.equal(msgs[0].ts, 1700000000000);
  assert.equal(typeof msgs[0].ts, 'number');
  assert.equal(msgs[0].lu, true);   // readTech = true (message bureau)
});

// ---- messagesEnFeuille ----

test('messagesEnFeuille : entrée vide -> sortie vide', () => {
  assert.deepEqual(messagesEnFeuille([]), []);
  assert.deepEqual(messagesEnFeuille(null), []);
});

test('messagesEnFeuille : message bureau -> ligne [id, tech, "bureau", text, ts, false, true]', () => {
  const rows = messagesEnFeuille([{ id: 1, tech: 'Tech1', from: 'bureau', text: 'Hello', ts: 1000 }]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], [1, 'Tech1', 'bureau', 'Hello', 1000, false, true]);
});

test('messagesEnFeuille : message tech -> ligne [id, tech, "tech", text, ts, true, false]', () => {
  const rows = messagesEnFeuille([{ id: 2, tech: 'Tech2', from: 'tech', text: 'Hi', ts: 2000 }]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], [2, 'Tech2', 'tech', 'Hi', 2000, true, false]);
});

test('messagesEnFeuille : from inconnu -> tech (défaut)', () => {
  const rows = messagesEnFeuille([{ id: 1, tech: 'T', from: 'system', text: 'X', ts: 1000 }]);
  assert.equal(rows[0][2], 'tech');
});

test('messagesEnFeuille : texte limité à 2000 caractères', () => {
  const long = 'a'.repeat(2500);
  const rows = messagesEnFeuille([{ id: 1, tech: 'T', from: 'bureau', text: long, ts: 1000 }]);
  assert.equal(rows[0][3].length, 2000);
});

test('messagesEnFeuille : caractères de contrôle retirés', () => {
  const rows = messagesEnFeuille([{ id: 1, tech: 'T', from: 'bureau', text: 'Hello\x00World\x1f', ts: 1000 }]);
  assert.equal(rows[0][3], 'HelloWorld');
});

test('messagesEnFeuille : tech nettoyé (caractères spéciaux remplacés par _)', () => {
  const rows = messagesEnFeuille([{ id: 1, tech: 'T/\\:*?"<>|Tech', from: 'bureau', text: 'X', ts: 1000 }]);
  assert.equal(rows[0][1], 'T_________Tech');
});

test('messagesEnFeuille : tech vide ou absent -> "x"', () => {
  const rows = messagesEnFeuille([{ id: 1, tech: '', from: 'bureau', text: 'X', ts: 1000 }]);
  assert.equal(rows[0][1], 'x');
});

test('messagesEnFeuille : texte vide -> ligne ignorée', () => {
  const rows = messagesEnFeuille([{ id: 1, tech: 'T', from: 'bureau', text: '', ts: 1000 }]);
  assert.equal(rows.length, 0);
});

test('messagesEnFeuille : ts absent -> Date.now()', () => {
  const before = Date.now();
  const rows = messagesEnFeuille([{ id: 1, tech: 'T', from: 'bureau', text: 'X' }]);
  const after = Date.now();
  const ts = rows[0][4];
  assert.ok(ts >= before && ts <= after);
});

test('messagesEnFeuille : plusieurs messages', () => {
  const msgs = [
    { id: 1, tech: 'T1', from: 'bureau', text: 'A', ts: 1000 },
    { id: 2, tech: 'T2', from: 'tech', text: 'B', ts: 2000 },
  ];
  const rows = messagesEnFeuille(msgs);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], [1, 'T1', 'bureau', 'A', 1000, false, true]);
  assert.deepEqual(rows[1], [2, 'T2', 'tech', 'B', 2000, true, false]);
});

// ---- aller-retour ----

test('aller-retour feuilleEnMessages -> messagesEnFeuille -> feuilleEnMessages', () => {
  const rows = [
    [1000, 'Tech1', 'bureau', 'Hello', 1000, false, true],
    [1001, 'Tech1', 'tech', 'Hi', 1001, true, false],
  ];
  const msgs = feuilleEnMessages(rows, 0);
  const newRows = messagesEnFeuille(msgs);
  assert.deepEqual(newRows, [
    [1000, 'Tech1', 'bureau', 'Hello', 1000, false, true],
    [1001, 'Tech1', 'tech', 'Hi', 1001, true, false],
  ]);
});
