-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Demande du 24/11/2026 : permis de conduire (numéro + copie) et n° de sécurité sociale
-- dans la fiche technicien, « sous la main en cas de besoin ».
-- Deux tables, deux publics (RGPD art. 5.1.c, minimisation) :
--   permis : désigner le conducteur d'une amende   → admin, gestion ;
--   n° de sécurité sociale (NIR) : paie et déclarations sociales → admin, gestion, comptable
--   (le NIR ne sert qu'à ça : décret 2019-341 « cadre NIR », secteur travail et protection sociale).
-- Le rôle lecture ne voit ni l'un ni l'autre. Jamais effacés à la main ; le journal garde
-- qui a modifié et quand, SANS les numéros (il est lisible par le comptable) ; purge légale
-- après le départ du technicien (durées ci-dessous, À VÉRIFIER avec un juriste).

-- NIR : 15 caractères, Corse 2A/2B, clé = 97 - (13 premiers chiffres mod 97).
create function private.nir_valide(n text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(n ~ '^[1-478][0-9]{2}(0[1-9]|1[0-2]|[2-9][0-9])(2A|2B|[0-9]{2})[0-9]{8}$'
    and 97 - (replace(replace(left(n, 13), '2A', '19'), '2B', '18')::numeric % 97) = right(n, 2)::int, false);
$$;

create table public.permis_conduire (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  numero text not null check (numero ~ '^[A-Z0-9]{6,20}$'),
  categories text not null default 'B' check (categories ~ '^[A-Z0-9]{1,3}(,[A-Z0-9]{1,3})*$'),
  delivre_le date,
  scan text,                              -- copie dans le stockage privé « identite »
  modifie_le timestamptz not null default now(),
  modifie_par uuid,
  unique (societe_id, technicien_id),
  check (scan is null or scan like societe_id::text || '/permis/' || technicien_id::text || '\_%'),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);

create table public.secu_sociale (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  nir text not null check (private.nir_valide(nir)),
  modifie_le timestamptz not null default now(),
  modifie_par uuid,
  unique (societe_id, technicien_id),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);

-- Saisie tolérante (espaces, tirets, minuscules) ; auteur et date toujours ceux du serveur.
create function private.papiers_normaliser() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'permis_conduire' then
    new.numero := upper(regexp_replace(new.numero, '[\s.-]', '', 'g'));
    new.categories := upper(regexp_replace(new.categories, '[\s;/]+', ',', 'g'));
  else
    new.nir := upper(regexp_replace(new.nir, '[\s.-]', '', 'g'));
  end if;
  new.modifie_le := now();
  new.modifie_par := (select auth.uid());
  return new;
end $$;

-- Journal sans les numéros ni le chemin de la copie.
create function private.journal_masque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
        purge boolean := tg_op = 'DELETE' and private.purge_en_cours((r->>'societe_id')::uuid);
        cache text[] := array['numero', 'nir', 'scan'];
begin
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((r->>'societe_id')::uuid, tg_table_name, r->>'id',
          case when purge then 'PURGE' else tg_op end,
          case when tg_op <> 'INSERT' and not purge then to_jsonb(old) - cache end,
          case when tg_op <> 'DELETE' then to_jsonb(new) - cache end,
          (select auth.uid()));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['permis_conduire', 'secu_sociale'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger normaliser before insert or update on public.%I
      for each row execute function private.papiers_normaliser()', t);
    execute format('create trigger journal after insert or update or delete on public.%I
      for each row execute function private.journal_masque()', t);
    execute format('create trigger effacement_interdit before delete on public.%I
      for each row execute function private.interdire_effacement()', t);
    execute format('create trigger vidage_interdit before truncate on public.%I
      for each statement execute function private.interdire_effacement()', t);
  end loop;
end $$;

create policy lire on public.permis_conduire for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')));
create policy ecrire on public.permis_conduire for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')))
  with check ((select private.a_role(societe_id, '{admin,gestion}')));
create policy lire on public.secu_sociale for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable}')));
create policy ecrire on public.secu_sociale for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')))
  with check ((select private.a_role(societe_id, '{admin,gestion}')));

-- Durées de conservation, comptées depuis le départ du technicien (archivage).
insert into public.durees_conservation values
  ('permis_conduire', 1, 'Sert à désigner le conducteur d''une amende : une contravention se prescrit en 1 an (Code de procédure pénale, art. 9). À VÉRIFIER.'),
  ('secu_sociale', 5, 'Sert à la paie et aux déclarations sociales : documents sur salaires 5 ans après le départ (F10029). À VÉRIFIER.');

create or replace function private.date_conservation(t text, r jsonb) returns date
language sql stable security definer set search_path = '' as $$
  select case t
    when 'conges' then (r->>'fin')::date
    when 'amendes' then (r->>'date_avis')::date
    when 'techniciens' then (r->>'archive_le')::date
    when 'photos_apk' then substring(r->>'nom_local' from '_(\d{4}-\d{2}-\d{2})_')::date
    when 'primes_tarifs' then case when r->>'mois' = 'courant'
      then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
      else (r->>'mois' || '-01')::date end
    when 'permis_conduire' then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
    when 'secu_sociale' then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
    else (r->>'date')::date end;
$$;

-- Comme pour le technicien : délai compté jour pour jour depuis le départ.
create or replace function private.expire(t text, r jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case when t in ('techniciens', 'permis_conduire', 'secu_sociale')
                         then d + make_interval(years => c.annees) < current_date
                       else make_date(extract(year from d)::int + c.annees, 12, 31) < current_date end, false)
  from public.durees_conservation c, (select private.date_conservation(t, r) as d) x
  where c.table_nom = t;
$$;

create or replace function private.tech_purgeable(s uuid, tech uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare t text; reste boolean;
begin
  if not exists (select 1 from public.techniciens x where x.societe_id = s and x.id = tech
                 and private.expire('techniciens', to_jsonb(x)) is true) then return false; end if;
  foreach t in array array['temps','heures_sup','gestes_co','primes_tarifs','conges','frais','photos_apk','amendes','permis_conduire','secu_sociale'] loop
    execute format('select exists (select 1 from public.%I d where d.societe_id = $1 and d.technicien_id = $2
      and private.expire(%L, to_jsonb(d)) is not true)', t, t) into reste using s, tech;
    if reste then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.apercu_purge(s uuid) returns table (table_nom text, lignes int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare t text; k int;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  foreach t in array array['temps','heures_sup','gestes_co','primes_tarifs','conges','frais','photos_apk','amendes','permis_conduire','secu_sociale'] loop
    execute format('select count(*)::int from public.%I d where d.societe_id = $1
      and private.expire(%L, to_jsonb(d)) is true', t, t) into k using s;
    if k > 0 then table_nom := t; lignes := k; return next; end if;
  end loop;
  select count(*)::int into k from public.techniciens x where x.societe_id = s and private.tech_purgeable(s, x.id);
  if k > 0 then table_nom := 'techniciens'; lignes := k; return next; end if;
end $$;

create or replace function public.purger_donnees(s uuid, confirmation text)
returns table (table_nom text, lignes int, fichiers text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t text; k int; fs text[]; ids text[]; tech uuid;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if confirmation is distinct from 'PURGER' then raise exception 'confirmation attendue : PURGER'; end if;
  perform set_config('app.purge_legale', s::text, true);   -- jusqu'à la fin de la transaction
  foreach t in array array['temps','heures_sup','gestes_co','conges','frais','photos_apk','amendes','primes_tarifs','permis_conduire','secu_sociale'] loop
    execute format('with x as (delete from public.%I d where d.societe_id = $1 and private.expire(%L, to_jsonb(d)) is true
        returning d.id::text as id, %s as f)
      select count(*)::int, coalesce(array_agg(f) filter (where f is not null), ''{}''), coalesce(array_agg(id), ''{}'') from x',
      t, t, case t when 'photos_apk' then 'd.stockage' when 'amendes' then 'd.scan' when 'permis_conduire' then 'd.scan' else 'null::text' end)
      into k, fs, ids using s;
    delete from public.audit a where a.table_nom = t and a.ligne_id = any(ids) and a.action <> 'PURGE';
    if k > 0 then table_nom := t; lignes := k; fichiers := fs; return next; end if;
  end loop;
  k := 0;
  for tech in select x.id from public.techniciens x where x.societe_id = s and private.tech_purgeable(s, x.id) loop
    begin
      delete from public.affectations a where a.societe_id = s and a.technicien_id = tech;
      delete from public.techniciens x where x.societe_id = s and x.id = tech;
      delete from public.audit a where a.ligne_id = tech::text and a.action <> 'PURGE';
      k := k + 1;
    exception when foreign_key_violation then null;   -- encore lié ailleurs : on le garde
    end;
  end loop;
  if k > 0 then table_nom := 'techniciens'; lignes := k; fichiers := '{}'; return next; end if;
  perform set_config('app.purge_legale', '', true);
end $$;

create or replace function private.fichier_orphelin(seau text, chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case seau
    when 'photos' then not exists (select 1 from public.photos_apk p where p.stockage = chemin)
    when 'scans' then not exists (select 1 from public.amendes a where a.scan = chemin)
    when 'identite' then not exists (select 1 from public.permis_conduire p where p.scan = chemin)
    else false end;
$$;

-- Stockage « identite » : privé, à part des scans d'amendes (ceux-là sont lisibles par le
-- rôle lecture). Chemin : <societe_id>/permis/<technicien_id>_<horodatage>.<ext>.
-- Lecture et ajout : admin, gestion. Aucun effacement, sauf copie orpheline à la purge.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('identite', 'identite', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
    on conflict (id) do nothing;
  execute $p$create policy identite_lire on storage.objects for select to authenticated
    using (bucket_id = 'identite' and (select private.a_role(
      (storage.foldername(name))[1]::uuid, '{admin,gestion}')))$p$;
  execute $p$create policy identite_ajouter on storage.objects for insert to authenticated
    with check (
      bucket_id = 'identite'
      and (storage.foldername(name))[2] = 'permis'
      and (select private.a_role((storage.foldername(name))[1]::uuid, '{admin,gestion}'))
      and exists (
        select 1 from public.techniciens t
        where t.societe_id = (storage.foldername(name))[1]::uuid
          and t.id::text = split_part(storage.filename(name), '_', 1)
      )
    )$p$;
  drop policy if exists purge_fichiers on storage.objects;
  execute $p$create policy purge_fichiers on storage.objects for delete to authenticated
    using (bucket_id in ('photos', 'scans', 'identite') and (select private.est_super_admin())
           and private.fichier_orphelin(bucket_id, name))$p$;
end $$;
