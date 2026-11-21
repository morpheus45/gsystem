-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Demande du 17/11/2026 : purger « selon les textes en vigueur ». Les données réelles
-- restent ineffaçables, SAUF une ligne dont le délai légal de conservation est dépassé,
-- effacée par le super admin via purger_donnees() (mot de confirmation exigé).
-- Sources : service-public F10029 (modifiée le 01/07/2024), Code de commerce L123-22,
-- Code du travail L3243-4, RGPD art. 5.1.e (pas plus longtemps que nécessaire).
-- Délai compté depuis le 31/12 de l'année du document (exercice = année civile : À VÉRIFIER
-- avec le comptable) ; pour un technicien, depuis la date de son départ (archivage).

create table public.durees_conservation (
  table_nom text primary key,
  annees int not null check (annees > 0),
  source text not null
);
insert into public.durees_conservation values
  ('temps', 5, 'Base des salaires et primes : documents sur salaires, primes, indemnités 5 ans (F10029). Le décompte des horaires seul est 1 an, mais il sert à la paie.'),
  ('heures_sup', 5, 'Heures sup payées : documents sur salaires 5 ans (F10029).'),
  ('gestes_co', 5, 'Base des primes : documents sur primes 5 ans (F10029).'),
  ('primes_tarifs', 5, 'Barèmes de primes : documents sur primes 5 ans (F10029).'),
  ('conges', 5, 'Absences et indemnités : documents sur salaires et indemnités 5 ans (F10029).'),
  ('frais', 10, 'Notes de frais = pièces justificatives comptables 10 ans (Code de commerce L123-22).'),
  ('photos_apk', 10, 'Justificatifs (tickets, factures) : pièces comptables 10 ans (L123-22). Photo sans date lisible : jamais purgée.'),
  ('amendes', 10, 'Aucun texte propre trouvé : amende payée = pièce comptable 10 ans (L123-22). À VÉRIFIER.'),
  ('techniciens', 5, 'Registre unique du personnel : 5 ans après le départ du salarié (F10029).');
alter table public.durees_conservation enable row level security;
create policy lire on public.durees_conservation for select to authenticated using (true);
grant select on public.durees_conservation to authenticated;

-- Date d'où part le délai, selon la table.
create function private.date_conservation(t text, r jsonb) returns date
language sql stable security definer set search_path = '' as $$
  select case t
    when 'conges' then (r->>'fin')::date
    when 'amendes' then (r->>'date_avis')::date
    when 'techniciens' then (r->>'archive_le')::date
    when 'photos_apk' then substring(r->>'nom_local' from '_(\d{4}-\d{2}-\d{2})_')::date
    when 'primes_tarifs' then case when r->>'mois' = 'courant'
      then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
      else (r->>'mois' || '-01')::date end
    else (r->>'date')::date end;
$$;

-- Vrai seulement si le délai légal est dépassé (date inconnue : jamais).
create function private.expire(t text, r jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case when t = 'techniciens' then d + make_interval(years => c.annees) < current_date
                       else make_date(extract(year from d)::int + c.annees, 12, 31) < current_date end, false)
  from public.durees_conservation c, (select private.date_conservation(t, r) as d) x
  where c.table_nom = t;
$$;

create function private.purge_en_cours(s uuid) returns boolean
language sql stable set search_path = '' as $$
  select current_setting('app.purge_legale', true) = s::text and private.est_super_admin();
$$;

-- Ineffaçable, sauf ligne expirée pendant une purge du super admin.
create or replace function private.interdire_effacement() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if private.purge_en_cours(old.societe_id) and private.expire(tg_table_name, to_jsonb(old)) is true then
      return old;
    end if;
  end if;
  raise exception 'donnee reelle de l''APK (%) : effacement interdit', tg_table_name;
end $$;

-- Le verrou de paie ne retient pas une ligne expirée pendant la purge.
create or replace function private.hors_periode_verrouillee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'DELETE' and (private.suppression_en_cours(old.societe_id)
     or (private.purge_en_cours(old.societe_id) and private.expire(tg_table_name, r) is true)) then
    return old;
  end if;
  if exists (select 1 from public.periodes_paie p
             where p.societe_id = (r->>'societe_id')::uuid and p.statut = 'exportee'
               and (r->>'date')::date between p.debut and p.fin)
     or (tg_op = 'UPDATE' and exists (select 1 from public.periodes_paie p
             where p.societe_id = old.societe_id and p.statut = 'exportee'
               and old.date between p.debut and p.fin)) then
    raise exception 'periode de paie verrouillee';
  end if;
  return coalesce(new, old);
end $$;

-- Journal : une ligne purgée laisse une trace SANS son contenu (sinon la purge ne purge rien).
create or replace function private.journal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old)); purge boolean := tg_op = 'DELETE' and private.purge_en_cours((r->>'societe_id')::uuid);
begin
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((r->>'societe_id')::uuid, tg_table_name, coalesce(r->>'id', r->>'user_id'),
          case when purge then 'PURGE' else tg_op end,
          case when tg_op <> 'INSERT' and not purge then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end $$;

-- Une donnée hors délai n'entre pas (le pont relit tout le Drive : sans ça, le purgé reviendrait).
-- Nom en « a_ » : passe avant le verrou de paie.
create function private.ignorer_hors_delai() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.expire(tg_table_name, to_jsonb(new)) is true then return null; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['temps','heures_sup','gestes_co','primes_tarifs','conges','frais','photos_apk','amendes'] loop
    execute format('create trigger a_hors_delai before insert on public.%I
      for each row execute function private.ignorer_hors_delai()', t);
  end loop;
end $$;

-- Technicien purgeable : parti depuis plus de 5 ans et plus aucune donnée gardée.
create function private.tech_purgeable(s uuid, tech uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare t text; reste boolean;
begin
  if not exists (select 1 from public.techniciens x where x.societe_id = s and x.id = tech
                 and private.expire('techniciens', to_jsonb(x)) is true) then return false; end if;
  foreach t in array array['temps','heures_sup','gestes_co','primes_tarifs','conges','frais','photos_apk','amendes'] loop
    execute format('select exists (select 1 from public.%I d where d.societe_id = $1 and d.technicien_id = $2
      and private.expire(%L, to_jsonb(d)) is not true)', t, t) into reste using s, tech;
    if reste then return false; end if;
  end loop;
  return true;
end $$;

-- Aperçu : ce qui partirait, table par table. Rien n'est effacé.
create function public.apercu_purge(s uuid) returns table (table_nom text, lignes int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare t text; k int;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  foreach t in array array['temps','heures_sup','gestes_co','primes_tarifs','conges','frais','photos_apk','amendes'] loop
    execute format('select count(*)::int from public.%I d where d.societe_id = $1
      and private.expire(%L, to_jsonb(d)) is true', t, t) into k using s;
    if k > 0 then table_nom := t; lignes := k; return next; end if;
  end loop;
  select count(*)::int into k from public.techniciens x where x.societe_id = s and private.tech_purgeable(s, x.id);
  if k > 0 then table_nom := 'techniciens'; lignes := k; return next; end if;
end $$;

-- Purge : efface l'expiré, et ses traces dans le journal. Renvoie les fichiers de stockage
-- devenus orphelins, que la page supprime ensuite (Supabase interdit de les effacer en SQL).
create function public.purger_donnees(s uuid, confirmation text)
returns table (table_nom text, lignes int, fichiers text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t text; k int; fs text[]; ids text[]; tech uuid;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if confirmation is distinct from 'PURGER' then raise exception 'confirmation attendue : PURGER'; end if;
  perform set_config('app.purge_legale', s::text, true);   -- jusqu'à la fin de la transaction
  foreach t in array array['temps','heures_sup','gestes_co','conges','frais','photos_apk','amendes','primes_tarifs'] loop
    execute format('with x as (delete from public.%I d where d.societe_id = $1 and private.expire(%L, to_jsonb(d)) is true
        returning d.id::text as id, %s as f)
      select count(*)::int, coalesce(array_agg(f) filter (where f is not null), ''{}''), coalesce(array_agg(id), ''{}'') from x',
      t, t, case t when 'photos_apk' then 'd.stockage' when 'amendes' then 'd.scan' else 'null::text' end)
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

revoke execute on function public.apercu_purge, public.purger_donnees from public, anon;
grant execute on function public.apercu_purge, public.purger_donnees to authenticated;

-- Stockage : le super admin ne peut supprimer QUE les fichiers dont la ligne a été purgée.
create function private.fichier_orphelin(seau text, chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case seau
    when 'photos' then not exists (select 1 from public.photos_apk p where p.stockage = chemin)
    when 'scans' then not exists (select 1 from public.amendes a where a.scan = chemin)
    else false end;
$$;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  execute $p$create policy purge_fichiers on storage.objects for delete to authenticated
    using (bucket_id in ('photos', 'scans') and (select private.est_super_admin())
           and private.fichier_orphelin(bucket_id, name))$p$;
end $$;
