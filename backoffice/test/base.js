// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Base Postgres de test (PGlite) : imitation Supabase + toutes les migrations.
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lire = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const MIG = '../supabase/migrations/';

export async function ouvrirBase() {
  const db = new PGlite();
  await db.exec(lire('./supabase-local.sql'));
  for (const f of readdirSync(new URL(MIG, import.meta.url)).sort()) await db.exec(lire(MIG + f));
  // Exécute fn en tant qu'utilisateur connecté (rôle authenticated), ou visiteur si uid est null.
  db.comme = async (uid, fn) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);
      set role ${uid ? 'authenticated' : 'anon'};`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  return db;
}
