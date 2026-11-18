-- Demande du 18/11/2026 : le SIRET de chaque société (factures, convention ANTAI).
alter table public.societes add column siret text check (siret ~ '^\d{14}$');
