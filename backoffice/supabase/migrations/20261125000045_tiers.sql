-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Clients / tiers » : le carnet des clients et fournisseurs d'une société.
-- N'existe pour une société que si le module « clients » est disponible ET allumé sur Bureau
-- (garde private.module_ouvert, migration 43). Éteindre le module masque les tiers sans les effacer.
-- Aucun tiers de G-SYSTEM n'entre ici : le module y reste simplement éteint.

create table public.tiers (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 200),
  est_client boolean not null default true,
  est_fournisseur boolean not null default false,
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
create index tiers_societe_idx on public.tiers (societe_id, actif);

-- L'auteur et la date de modification sont posés par le serveur, jamais par le client.
create function private.tiers_horodatage() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.modifie_le := now();
  new.modifie_par := (select auth.uid());
  return new;
end $$;
create trigger horodatage before insert or update on public.tiers
  for each row execute function private.tiers_horodatage();

alter table public.tiers enable row level security;
revoke all on public.tiers from anon, authenticated;
grant select, insert, update on public.tiers to authenticated;   -- pas de delete : on désactive (actif = false)

-- Lecture : tout membre de la société, si le module est allumé sur Bureau.
create policy lire on public.tiers for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}'))
    and private.module_ouvert(societe_id, 'clients', 'bureau'));

-- Écriture : admin ou gestion, si le module est allumé sur Bureau.
create policy ecrire on public.tiers for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}'))
    and private.module_ouvert(societe_id, 'clients', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}'))
    and private.module_ouvert(societe_id, 'clients', 'bureau'));

create trigger journal after insert or update or delete on public.tiers
  for each row execute function private.journal();
