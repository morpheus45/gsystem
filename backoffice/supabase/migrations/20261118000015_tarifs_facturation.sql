-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Grille de tarifs de facturation (demande du 17/11/2026) : une ligne par type d'intervention
-- ou par équipement, par client (EPS par défaut) ; le prix HT est rempli plus tard.
create table public.tarifs_facturation (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  client text not null default 'EPS',
  categorie text not null check (categorie in ('intervention', 'equipement')),
  code text not null,                       -- type de mission (INST, SAV...) ou équipement (GSM...)
  libelle text not null,
  base text not null default 'ok' check (base in ('ok', 'ok_nrclient', 'total')),
  prix_ht numeric(10,2) check (prix_ht >= 0),   -- vide = à renseigner
  unique (societe_id, client, categorie, code)
);
alter table public.tarifs_facturation enable row level security;
create policy lire on public.tarifs_facturation for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create policy ecrire on public.tarifs_facturation for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable}')))
  with check ((select private.a_role(societe_id, '{admin,gestion,comptable}')));
grant select, insert, update, delete on public.tarifs_facturation to authenticated;
create trigger journal after insert or update or delete on public.tarifs_facturation
  for each row execute function private.journal();
