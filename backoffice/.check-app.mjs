// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./web/app.js', import.meta.url), 'utf8');
console.log(JSON.stringify(src.slice(0, 120)));
console.log('---');
console.log(JSON.stringify(src.slice(-120)));
