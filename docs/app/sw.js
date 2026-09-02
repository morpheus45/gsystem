/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Cache applicatif : l'app s'ouvre et s'affiche sans reseau, ce qui arrive
// souvent en intervention (sous-sol, zone blanche).
const CACHE = 'gsystems-v17';
const FICHIERS = ['.', 'index.html', 'theme.css', 'app.js', 'tuiles.js',
                  'donnees.js', 'viber.js', 'heures.js', 'cloture.js',
                  'frais.js', 'photos.js', 'pdf.js', 'signature.js', 'docConge.js', 'docBulletin.js', 'docPv.js',
                  'diagnostic/index.html', 'diagnostic/particulier.html',
                  'diagnostic/app.js', 'diagnostic/signature.js',
                  'diagnostic/styles.css', 'diagnostic/icon.svg',
                  'cycle.js', 'zip.js', 'xlsm.js', 'classeur.js', 'docRecap.js', 'gesteco.js', 'fond.js', 'backup.js',
                  'trame-conge.pdf', 'trame-pv.pdf',
                  'manifest.webmanifest', 'icone-180.png', 'icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((noms) =>
    Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
  ).then(() => self.clients.claim()));
});

// Reseau d'abord, cache en secours : le tech a la derniere version des qu'il a
// du signal, et l'app reste utilisable quand il n'en a pas.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copie = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copie)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
