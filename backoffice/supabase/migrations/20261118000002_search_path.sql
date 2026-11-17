-- Analyse de sécurité Supabase (lint 0011) : figer le search_path des fonctions
-- de trigger restantes, comme les autres.
alter function private.signer_validation() set search_path = '';
alter function private.periode_avance() set search_path = '';
alter function private.email_minuscules() set search_path = '';
