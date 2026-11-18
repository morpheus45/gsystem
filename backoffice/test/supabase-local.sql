-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- TEST SEULEMENT : imite ce que Supabase fournit déjà (schéma auth, rôles).
-- auth.uid() lit l'identifiant de l'utilisateur comme le fait Supabase.
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin;
create role anon nologin;
grant usage on schema auth, public to authenticated, anon;
