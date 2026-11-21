-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Audit de sécurité du 18/11/2026 (SECURITE.md, S1 et S6). Deux barrières plutôt qu'une :
-- la RLS protège chaque ligne ; les droits de table retirent en plus ce qui ne sert à personne.

-- S1. Supabase ouvre d'office toute table de public à anon et authenticated (seule la RLS
-- protège). Le visiteur non connecté n'a besoin d'aucune table : tout se lit après connexion.
revoke all on all tables in schema public from anon;
-- TRUNCATE vide une table sans passer par la RLS ni par les déclencheurs de ligne.
revoke truncate, references, trigger on all tables in schema public from authenticated;
-- Tables en lecture seule pour les comptes : écrites par le pont (clé serveur), par une
-- fonction contrôlée (exporter_compta) ou par les déclencheurs (audit), jamais à la main.
revoke insert, update, delete on public.audit, public.durees_conservation, public.exports_compta,
  public.gestes_co, public.operateurs, public.primes_tarifs from authenticated;
-- Et pour les tables à venir.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- S6. L'identité d'un véhicule peut venir d'un site extérieur (lecture de la plaque) : bornée.
alter table public.vehicules add constraint vehicules_identite_bornee check (
  length(marque) <= 60 and length(modele) <= 60 and length(carburant) <= 30 and length(motorisation) <= 120);
