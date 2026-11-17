-- Amendes des véhicules (demande du 17/11/2026) : avis, conducteur désigné, statut,
-- scan privé par société. Document légal : jamais effacé (comme les données APK).
-- Désignation sous 45 jours après la date de l'avis : https://www.antai.gouv.fr/la-reglementation

create table public.amendes (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  vehicule_id uuid not null,
  technicien_id uuid,                     -- conducteur réel désigné (même société)
  numero_avis text not null,
  date_avis date not null,                -- point de départ des 45 jours
  date_infraction date,
  heure_infraction text not null default '',
  lieu text not null default '',
  motif text not null default '',
  montant numeric(10,2),
  scan text,                              -- chemin dans le stockage privé « scans »
  statut text not null default 'a_traiter'
    check (statut in ('a_traiter', 'designee', 'contestee', 'payee')),
  designe_le date,
  cree_le timestamptz not null default now(),
  unique (societe_id, numero_avis),
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);
create index amendes_vehicule_idx on public.amendes (societe_id, vehicule_id, date_avis);

alter table public.amendes enable row level security;
create policy lire on public.amendes for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create policy ecrire on public.amendes for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')))
  with check ((select private.a_role(societe_id, '{admin,gestion}')));
grant select, insert, update, delete on public.amendes to authenticated;
create trigger journal after insert or update or delete on public.amendes
  for each row execute function private.journal();
create trigger effacement_interdit before delete on public.amendes
  for each row execute function private.interdire_effacement();
create trigger vidage_interdit before truncate on public.amendes
  for each statement execute function private.interdire_effacement();

-- Photos du compteur importées de l'APK : une seule fois chacune (réimport sans doublon).
alter table public.vehicules_photos add constraint vehicules_photos_emplacement_unique unique (societe_id, emplacement);

-- Stockage des scans (Supabase Storage) : un dossier par société, privé.
-- Chemin : <societe_id>/... ; lecture par ses membres, ajout par admin/gestion,
-- aucun effacement. Ignoré là où Storage n'existe pas (tests PGlite).
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('scans', 'scans', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
    on conflict (id) do nothing;
  execute $p$create policy scans_lire on storage.objects for select to authenticated
    using (bucket_id = 'scans' and (select private.a_role(
      (storage.foldername(name))[1]::uuid, '{admin,gestion,comptable,lecture}')))$p$;
  execute $p$create policy scans_ajouter on storage.objects for insert to authenticated
    with check (bucket_id = 'scans' and (select private.a_role(
      (storage.foldername(name))[1]::uuid, '{admin,gestion}')))$p$;
end $$;
