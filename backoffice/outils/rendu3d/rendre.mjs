// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Fabrique les objets 3D du back-office (scene.html) en PNG transparents, via Chromium sans fenêtre.
// Dans ce dossier : `npm i three@0.170.0`, puis `python3 -m http.server 5191 --bind 127.0.0.1` et
// `node rendre.mjs noeud` (formes disponibles : noeud, galet, petales).
// Ensuite : WebP 400 px (ffmpeg -c:v libwebp -quality 86 -pix_fmt yuva420p) et régénérer web/objets3d.js.
import { chromium } from '/home/cedric/.local/share/mise/installs/node/26.8.2/lib/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const objets = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/home/cedric/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 640 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
p.on('pageerror', (e) => console.log('erreur:', e.message));
for (const o of objets) {
  await p.goto(`http://127.0.0.1:5191/scene.html?objet=${o}`);
  await p.waitForFunction(() => window.rendu, null, { timeout: 120000 });
  const url = await p.evaluate(() => window.rendu);
  writeFileSync(`${o}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('rendu', o);
}
await b.close();
