-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Analyse de sécurité Supabase (lint 0011) : figer le search_path des fonctions
-- de trigger restantes, comme les autres.
alter function private.signer_validation() set search_path = '';
alter function private.periode_avance() set search_path = '';
alter function private.email_minuscules() set search_path = '';
