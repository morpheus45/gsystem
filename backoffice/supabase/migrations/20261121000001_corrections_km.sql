-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Historisation des corrections de kilométrage validé et suppression admin des doublons de photo de compteur

create table public.corrections_km (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  vehicule_id uuid not null,
  releve_id uuid not null references public.releves_km(id) on delete cascade,
  ancien_km int not null check (ancien_km >= 0),
  nouveau_km int not null check (nouveau_km >= 0),
  motif text not null check (length(trim(motif)) > 0),
  auteur uuid not null references auth.users,
  cree_le timestamptz not null default now(),
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id) on delete cascade
);

alter table public.corrections_km enable row level security;

-- Droit lecture pour les membres authentifiés (via RLS)
create policy lire on public.corrections_km for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));

-- Droit écriture uniquement admin / gestion
create policy ecrire on public.corrections_km for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')))
  with check ((select private.a_role(societe_id, '{admin,gestion}')));

grant select, insert, update, delete on public.corrections_km to authenticated;

-- Journalisation des modifications
create trigger journal after insert or update or delete on public.corrections_km
  for each row execute function private.journal();

-- Suppression de photos de compteur réservée exclusivement aux administrateurs
drop policy if exists ecrire on public.vehicules_photos;
create policy inserer on public.vehicules_photos for insert to authenticated
  with check ((select private.a_role(societe_id, '{admin,gestion}')));
create policy modifier on public.vehicules_photos for update to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')))
  with check ((select private.a_role(societe_id, '{admin,gestion}')));
create policy supprimer on public.vehicules_photos for delete to authenticated
  using ((select private.a_role(societe_id, '{admin}')));
