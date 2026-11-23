-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Système de signalement de bugs : table signalements et stockage des captures.

create type public.gravite_signalement as enum ('non_urgent', 'urgent', 'critique');
create type public.statut_signalement as enum ('nouveau', 'a_valider', 'planifie', 'en_cours', 'corrige', 'refuse', 'doublon');

create table public.signalements (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references public.societes(id),
  auteur uuid not null default auth.uid(),
  cree_le timestamp default now(),
  ecran text not null,
  version text not null,
  gravite public.gravite_signalement not null,
  explication text not null,
  statut public.statut_signalement not null default 'nouveau',
  planifie_le date,
  doublon_de uuid references public.signalements(id),
  decision text,
  constraint explication_non_vide check (length(trim(explication)) > 0),
  constraint explication_bornee check (length(explication) <= 4000)
);

create table public.signalements_captures (
  id uuid primary key default gen_random_uuid(),
  signalement_id uuid not null references public.signalements(id) on delete cascade,
  chemin text not null
);

-- RLS pour signalements
alter table public.signalements enable row level security;

-- Lecture : l'auteur voit ses propres signalements, le super admin voit tout
create policy "signalements_lecture" on public.signalements
  for select using (
    (select auth.uid()) = auteur or exists (select 1 from public.operateurs where user_id = (select auth.uid()))
  );

-- Création : tout utilisateur connecté peut créer
create policy "signalements_creation" on public.signalements
  for insert with check (
    (select auth.uid()) = auteur
  );

-- Modification du statut et décision : seul le super admin
create policy "signalements_modif_admin" on public.signalements
  for update using (
    exists (select 1 from public.operateurs where user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.operateurs where user_id = (select auth.uid()))
  );

-- Suppression interdite (trigger qui refuse delete)
create or replace function private.refuser_suppression_signalement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Les signalements ne peuvent pas être supprimés';
end;
$$;

create trigger refuser_suppression_signalement
before delete on public.signalements
for each row execute function private.refuser_suppression_signalement();

-- RLS pour signalements_captures
alter table public.signalements_captures enable row level security;

-- Lecture : même règle que signalements (via le FK)
create policy "signalements_captures_lecture" on public.signalements_captures
  for select using (
    exists (
      select 1 from public.signalements s
      where s.id = signalements_captures.signalement_id
        and ((select auth.uid()) = s.auteur or exists (select 1 from public.operateurs where user_id = (select auth.uid())))
    )
  );

-- Création : l'auteur d'un signalement peut ajouter des captures
create policy "signalements_captures_creation" on public.signalements_captures
  for insert with check (
    exists (
      select 1 from public.signalements s
      where s.id = signalement_id and (select auth.uid()) = s.auteur
    )
  );

-- Suppression interdite (trigger qui refuse delete)
create trigger refuser_suppression_capture
before delete on public.signalements_captures
for each row execute function private.refuser_suppression_signalement();

-- Pas de droit pour anon
revoke all on public.signalements from anon;
revoke all on public.signalements_captures from anon;

-- Droits de lecture/insertion pour authenticated
grant select, insert on public.signalements to authenticated;
grant select, insert on public.signalements_captures to authenticated;

-- Droits de modification du statut pour authenticated (la policy le limite au super admin)
grant update (statut, planifie_le, doublon_de, decision) on public.signalements to authenticated;

-- Captures d'écran : stockage privé « signalements », dossier = identifiant du signalement.
-- L'auteur du signalement y dépose et relit ses captures ; le super admin relit tout. Jamais de suppression.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('signalements', 'signalements', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
      on conflict (id) do nothing;
    execute $p$create policy signalements_captures_lire on storage.objects for select to authenticated
      using (bucket_id = 'signalements' and (
        exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))
        or exists (select 1 from public.signalements s
                   where s.id::text = (storage.foldername(name))[1] and s.auteur = (select auth.uid()))))$p$;
    execute $p$create policy signalements_captures_deposer on storage.objects for insert to authenticated
      with check (bucket_id = 'signalements' and exists (select 1 from public.signalements s
        where s.id::text = (storage.foldername(name))[1] and s.auteur = (select auth.uid())))$p$;
  end if;
end $$;
