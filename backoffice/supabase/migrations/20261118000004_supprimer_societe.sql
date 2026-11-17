-- Super admin : supprimer une société entière avec toutes ses données.
-- Le journal d'audit est gardé (trace de la suppression).

create function private.est_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()));
$$;
revoke execute on function private.est_super_admin from public;
grant execute on function private.est_super_admin to authenticated;

-- Le verrou de paie ne s'ouvre que pour un super admin qui supprime CETTE société.
create function private.suppression_en_cours(s uuid) returns boolean
language sql stable set search_path = '' as $$
  select current_setting('app.suppression_societe', true) = s::text and private.est_super_admin();
$$;

create or replace function private.periode_avance() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'brouillon' then raise exception 'une periode nait en brouillon'; end if;
    new.valide_par := null; new.valide_le := null; new.exporte_le := null;
    return new;
  end if;
  if tg_op = 'DELETE' and private.suppression_en_cours(old.societe_id) then return old; end if;
  if old.statut = 'exportee' then raise exception 'periode verrouillee'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.statut = old.statut then
    new.valide_par := old.valide_par; new.valide_le := old.valide_le; new.exporte_le := old.exporte_le;
  elsif old.statut = 'brouillon' and new.statut = 'validee' then
    new.valide_par := (select auth.uid()); new.valide_le := now();
  elsif old.statut = 'validee' and new.statut = 'exportee' then
    new.valide_par := old.valide_par; new.valide_le := old.valide_le; new.exporte_le := now();
  else
    raise exception 'passage % -> % interdit (une etape a la fois, brouillon -> validee -> exportee)', old.statut, new.statut;
  end if;
  return new;
end $$;

create or replace function private.hors_periode_verrouillee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'DELETE' and private.suppression_en_cours(old.societe_id) then return old; end if;
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

-- « Garder un admin » ne bloque pas la suppression de toute la société.
create or replace function private.garder_un_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.suppression_en_cours(old.societe_id) then return old; end if;
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.societe_id <> old.societe_id)
     and exists (select 1 from public.societes s where s.id = old.societe_id)
     and not exists (select 1 from public.membres m where m.societe_id = old.societe_id
                     and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'dernier admin de la societe : impossible de le retirer';
  end if;
  return coalesce(new, old);
end $$;

create function public.supprimer_societe(s uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  perform set_config('app.suppression_societe', s::text, true);   -- jusqu'à la fin de la transaction
  -- Enfants d'abord (clés composites sans cascade), puis la société.
  delete from public.entretiens where societe_id = s;
  delete from public.echeances where societe_id = s;
  delete from public.entretien_regles where societe_id = s;
  delete from public.releves_km where societe_id = s;
  delete from public.vehicules_photos where societe_id = s;
  delete from public.affectations where societe_id = s;
  delete from public.temps where societe_id = s;
  delete from public.frais where societe_id = s;
  delete from public.photos_apk where societe_id = s;
  delete from public.periodes_paie where societe_id = s;
  delete from public.membres where societe_id = s;
  delete from public.societes where id = s;   -- le reste part en cascade
  perform set_config('app.suppression_societe', '', true);
end $$;
revoke execute on function public.supprimer_societe from public, anon;
grant execute on function public.supprimer_societe to authenticated;
