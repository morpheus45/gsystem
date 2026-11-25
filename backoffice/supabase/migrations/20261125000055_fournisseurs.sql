-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Fournisseurs » (catégorie Achats) : le carnet des fournisseurs d'une société.
-- Gardé par le pilotage sur Bureau. Même structure que les tiers, module séparé.

create table public.fournisseur (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 200),
  siren text check (siren is null or siren ~ '^\d{9}$'),
  siret text check (siret is null or siret ~ '^\d{14}$'),
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telephone text check (telephone is null or telephone ~ '^0[1-9]( \d\d){4}$'),
  adresse text check (adresse is null or length(adresse) <= 300),
  code_postal text check (code_postal is null or code_postal ~ '^\d{5}$'),
  ville text check (ville is null or length(ville) <= 120),
  notes text check (notes is null or length(notes) <= 2000),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index fournisseur_societe_idx on public.fournisseur (societe_id, actif);

create trigger horodatage before insert or update on public.fournisseur
  for each row execute function private.poser_modif();

alter table public.fournisseur enable row level security;
revoke all on public.fournisseur from anon, authenticated;
grant select, insert, update on public.fournisseur to authenticated;   -- pas de delete : on désactive

create policy lire on public.fournisseur for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'fournisseurs', 'bureau'));
create policy ecrire on public.fournisseur for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'fournisseurs', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'fournisseurs', 'bureau'));

create trigger journal after insert or update or delete on public.fournisseur
  for each row execute function private.journal();
