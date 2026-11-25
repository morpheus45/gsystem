-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Contrats de location » : GÉNÉRIQUE — on loue des biens de tout type (véhicule, immobilier,
-- matériel, autre). Un bien à louer + des contrats qui s'y rattachent (client, période, loyer).
-- Gardé par le pilotage sur Bureau. La durée et « en cours » se calculent avec le cœur core/location.

-- Les biens que la société met en location.
create table public.bien_location (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  libelle text not null check (length(trim(libelle)) between 1 and 200),
  type text not null default 'autre' check (type in ('vehicule', 'immobilier', 'materiel', 'autre')),
  reference text check (reference is null or length(reference) <= 60),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index bien_location_idx on public.bien_location (societe_id, actif);

-- Les contrats de location.
create table public.contrat_location (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  bien_id uuid references public.bien_location on delete set null,
  bien_libelle text not null check (length(trim(bien_libelle)) between 1 and 200),
  tiers_id uuid references public.tiers on delete set null,
  client_nom text not null check (length(trim(client_nom)) between 1 and 200),
  date_debut date not null default current_date,
  date_fin date,
  loyer_centimes integer not null default 0 check (loyer_centimes >= 0),
  periode text not null default 'mois' check (periode in ('jour', 'semaine', 'mois')),
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'annule')),
  notes text check (notes is null or length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users,
  check (date_fin is null or date_fin >= date_debut)
);
create index contrat_location_idx on public.contrat_location (societe_id, date_debut);

create trigger horodatage before insert or update on public.bien_location
  for each row execute function private.poser_modif();
create trigger horodatage before insert or update on public.contrat_location
  for each row execute function private.poser_modif();

alter table public.bien_location enable row level security;
alter table public.contrat_location enable row level security;
revoke all on public.bien_location, public.contrat_location from anon, authenticated;
grant select, insert, update, delete on public.bien_location to authenticated;
grant select, insert, update, delete on public.contrat_location to authenticated;

create policy lire on public.bien_location for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'location_contrats', 'bureau'));
create policy ecrire on public.bien_location for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'location_contrats', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'location_contrats', 'bureau'));

create policy lire on public.contrat_location for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'location_contrats', 'bureau'));
create policy ecrire on public.contrat_location for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'location_contrats', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'location_contrats', 'bureau'));

create trigger journal after insert or update or delete on public.bien_location for each row execute function private.journal();
create trigger journal after insert or update or delete on public.contrat_location for each row execute function private.journal();
