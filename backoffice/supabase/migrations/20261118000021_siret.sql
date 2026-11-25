-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Demande du 18/11/2026 : le SIRET de chaque société (factures, convention ANTAI).
alter table public.societes add column siret text check (siret ~ '^\d{14}$');
