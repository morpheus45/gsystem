-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Responsables de secteur : nommés par le super admin, le patron de la holding ou l'admin de la société (adjoint).
-- Chacun a ses cases (voir / modifier, par domaine) et SES techniciens ; rien d'autre. Réglable à tout moment.
-- Règles AJOUTÉES seulement : les droits des autres membres ne changent pas. Aucune suppression permise.
-- Compta, paie, facturation : chiffres de la société, donc une case à part, décochée au départ, en lecture.
-- Jamais accessibles à un responsable : sécurité sociale, documents d'embauche, membres, journal, téléphones.

create table public.responsables (
  societe_id uuid not null references public.societes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (societe_id, user_id)
);
create index responsables_user_idx on public.responsables (user_id);
create table public.responsables_droits (
  societe_id uuid not null,
  user_id uuid not null,
  domaine text not null check (domaine in ('interventions', 'conges', 'frais', 'vehicules', 'messages', 'saisies',
    'primes', 'permis', 'paie', 'compta', 'facturation')),
  modifier boolean not null default false check (not modifier or domaine in ('conges', 'frais', 'vehicules', 'messages')),
  primary key (societe_id, user_id, domaine),
  foreign key (societe_id, user_id) references public.responsables on delete cascade
);
create table public.responsables_techniciens (
  societe_id uuid not null,
  user_id uuid not null,
  technicien_id uuid not null,
  primary key (societe_id, user_id, technicien_id),
  foreign key (societe_id, user_id) references public.responsables on delete cascade,
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id) on delete cascade
);
create index responsables_techniciens_tech_idx on public.responsables_techniciens (societe_id, technicien_id);
create table private.invitations_responsable (
  societe_id uuid not null references public.societes on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%' and length(email) <= 200),
  cree_le timestamptz not null default now(),
  primary key (societe_id, email)
);
revoke all on private.invitations_responsable from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['responsables', 'responsables_droits', 'responsables_techniciens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);   -- écriture : par les fonctions seulement
    execute format('create policy lire on public.%I for select to authenticated
      using (user_id = (select auth.uid()) or (select private.a_role(societe_id, ''{admin}'')))', t);
    execute format('create trigger journal after insert or update or delete on public.%I
      for each row execute function private.journal()', t);
  end loop;
end $$;

-- L'utilisateur connecté est-il responsable ici ? a-t-il cette case, pour ce technicien (ou le véhicule qu'il conduit aujourd'hui) ?
create function private.est_responsable(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responsables r where r.societe_id = s and r.user_id = (select auth.uid()));
$$;
create function private.resp(s uuid, t uuid, d text, m boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responsables_droits x
    join public.responsables_techniciens k on k.societe_id = x.societe_id and k.user_id = x.user_id
    where x.societe_id = s and x.user_id = (select auth.uid()) and k.technicien_id = t
      and x.domaine = d and (x.modifier or not m));
$$;
create function private.resp_tech(s uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responsables_techniciens k
    where k.societe_id = s and k.user_id = (select auth.uid()) and k.technicien_id = t);
$$;
-- Domaines de la société entière (paie, compta, facturation).
create function private.resp_dom(s uuid, d text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responsables_droits x where x.societe_id = s and x.user_id = (select auth.uid()) and x.domaine = d);
$$;
create function private.resp_vehicule(s uuid, v uuid, m boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.affectations a where a.societe_id = s and a.vehicule_id = v
    and a.debut <= current_date and (a.fin is null or a.fin >= current_date)
    and private.resp(s, a.technicien_id, 'vehicules', m));
$$;
revoke execute on function private.est_responsable, private.resp, private.resp_dom, private.resp_tech, private.resp_vehicule from public;
grant execute on function private.est_responsable, private.resp, private.resp_dom, private.resp_tech, private.resp_vehicule to authenticated;

-- LECTURE
create policy resp_lire on public.societes for select to authenticated using (private.est_responsable(id));
create policy resp_lire on public.techniciens for select to authenticated using (private.resp_tech(societe_id, id));
create policy resp_lire on public.temps for select to authenticated using (private.resp(societe_id, technicien_id, 'interventions'));
create policy resp_lire on public.conges for select to authenticated using (private.resp(societe_id, technicien_id, 'conges'));
create policy resp_lire on public.frais for select to authenticated using (private.resp(societe_id, technicien_id, 'frais'));
create policy resp_lire on public.photos_apk for select to authenticated using (private.resp(societe_id, technicien_id, 'frais'));
create policy resp_lire on public.messages for select to authenticated using (private.resp(societe_id, technicien_id, 'messages'));
create policy resp_lire on public.saisies_modules for select to authenticated using (private.resp(societe_id, technicien_id, 'saisies'));
create policy resp_lire on public.gestes_co for select to authenticated using (private.resp(societe_id, technicien_id, 'primes'));
create policy resp_lire on public.primes_tarifs for select to authenticated using (private.resp(societe_id, technicien_id, 'primes'));
create policy resp_lire on public.permis_conduire for select to authenticated using (private.resp(societe_id, technicien_id, 'permis'));
create policy resp_lire on public.heures_sup for select to authenticated using (private.resp(societe_id, technicien_id, 'paie'));
create policy resp_lire on public.periodes_paie for select to authenticated using (private.resp_dom(societe_id, 'paie'));
create policy resp_lire on public.exports_compta for select to authenticated using (private.resp(societe_id, technicien_id, 'compta'));
create policy resp_lire on public.parametres_compta for select to authenticated using (private.resp_dom(societe_id, 'compta'));
create policy resp_lire on public.factures for select to authenticated using (private.resp_dom(societe_id, 'compta'));
create policy resp_lire on public.tarifs_facturation for select to authenticated using (private.resp_dom(societe_id, 'facturation'));
create policy resp_lire on public.affectations for select to authenticated using (private.resp(societe_id, technicien_id, 'vehicules'));
create policy resp_lire on public.amendes for select to authenticated using (private.resp(societe_id, technicien_id, 'vehicules'));
create policy resp_lire on public.vehicules for select to authenticated using (private.resp_vehicule(societe_id, id));
do $$
declare t text;
begin
  foreach t in array array['echeances', 'entretiens', 'entretien_regles', 'releves_km', 'vehicules_photos'] loop
    execute format('create policy resp_lire on public.%I for select to authenticated using (private.resp_vehicule(societe_id, vehicule_id))', t);
  end loop;
end $$;

-- MODIFICATION (jamais d'effacement) : avant ET après, la ligne reste dans son secteur.
create policy resp_ajouter on public.conges for insert to authenticated with check (private.resp(societe_id, technicien_id, 'conges', true));
create policy resp_modifier on public.conges for update to authenticated
  using (private.resp(societe_id, technicien_id, 'conges', true)) with check (private.resp(societe_id, technicien_id, 'conges', true));
create policy resp_modifier on public.frais for update to authenticated
  using (private.resp(societe_id, technicien_id, 'frais', true)) with check (private.resp(societe_id, technicien_id, 'frais', true));
create policy resp_ajouter on public.messages for insert to authenticated
  with check (de = 'bureau' and private.resp(societe_id, technicien_id, 'messages', true));
create policy resp_modifier on public.messages for update to authenticated
  using (private.resp(societe_id, technicien_id, 'messages', true)) with check (private.resp(societe_id, technicien_id, 'messages', true));
do $$
declare t text;
begin
  foreach t in array array['echeances', 'entretiens', 'releves_km'] loop
    execute format('create policy resp_ajouter on public.%I for insert to authenticated with check (private.resp_vehicule(societe_id, vehicule_id, true))', t);
    execute format('create policy resp_modifier on public.%I for update to authenticated
      using (private.resp_vehicule(societe_id, vehicule_id, true)) with check (private.resp_vehicule(societe_id, vehicule_id, true))', t);
  end loop;
end $$;
-- Un responsable valide ou refuse une note de frais ; il n'en change ni le montant, ni la date, ni le technicien.
create function private.frais_du_responsable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare libre text[] := array['statut', 'tva_recuperable', 'motif_refus', 'valide_par', 'valide_le'];
begin
  if (select auth.uid()) is not null and not private.a_role(new.societe_id, '{admin,gestion}')
     and private.est_responsable(new.societe_id) and to_jsonb(new) - libre <> to_jsonb(old) - libre then
    raise exception 'un responsable valide ou refuse seulement';
  end if;
  return new;
end $$;
revoke execute on function private.frais_du_responsable from public;
create trigger a_responsable before update on public.frais for each row execute function private.frais_du_responsable();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute $p$create policy photos_lire_responsable on storage.objects for select to authenticated
      using (bucket_id = 'photos' and exists (select 1 from public.photos_apk p
        where p.stockage = storage.objects.name and private.resp(p.societe_id, p.technicien_id, 'frais')))$p$;
  end if;
end $$;

-- NOMMER ET RÉGLER : admin de la société (adjoint), patron de sa holding, super admin.
create function public.nommer_responsable(s uuid, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare u uuid; e text := lower(trim(coalesce(p_email, '')));
begin
  if private.a_role(s, '{admin}') is not true then raise exception 'reserve a l''admin de la societe'; end if;
  select x.id into u from auth.users x where lower(x.email) = e and x.email_confirmed_at is not null;
  if u is not null then
    if exists (select 1 from public.membres m where m.societe_id = s and m.user_id = u) then raise exception 'cette personne est deja membre de la societe'; end if;
    insert into public.responsables (societe_id, user_id) values (s, u) on conflict do nothing;
    return 'nomme';
  end if;
  insert into private.invitations_responsable (societe_id, email) values (s, e) on conflict do nothing;
  return 'invite';
end $$;

create function public.retirer_responsable(s uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if private.a_role(s, '{admin}') is not true then raise exception 'reserve a l''admin de la societe'; end if;
  delete from private.invitations_responsable i where i.societe_id = s and i.email = e;
  delete from public.responsables r using auth.users x where r.societe_id = s and r.user_id = x.id and lower(x.email) = e;
end $$;

create function public.responsables_de(s uuid)
returns table (user_id uuid, email text, etat text, droits jsonb, techniciens uuid[])
language sql stable security definer set search_path = '' as $$
  select r.user_id, lower(x.email), 'actif',
    coalesce((select jsonb_object_agg(d.domaine, d.modifier) from public.responsables_droits d where d.societe_id = s and d.user_id = r.user_id), '{}'),
    coalesce((select array_agg(k.technicien_id) from public.responsables_techniciens k where k.societe_id = s and k.user_id = r.user_id), '{}')
  from public.responsables r join auth.users x on x.id = r.user_id
  where r.societe_id = s and private.a_role(s, '{admin}')
  union all
  select null, i.email, 'invite', '{}', '{}' from private.invitations_responsable i where i.societe_id = s and private.a_role(s, '{admin}')
  order by 2;
$$;

-- droits : {"conges": true, "frais": false} (présent = voir, true = modifier). Tout ou rien.
create function public.regler_responsable(s uuid, u uuid, droits jsonb, techs uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.a_role(s, '{admin}') is not true then raise exception 'reserve a l''admin de la societe'; end if;
  if jsonb_typeof(droits) is distinct from 'object' then raise exception 'droits invalides'; end if;
  perform 1 from public.responsables r where r.societe_id = s and r.user_id = u for update;
  if not found then raise exception 'responsable inconnu'; end if;
  delete from public.responsables_droits d where d.societe_id = s and d.user_id = u and not droits ? d.domaine;
  insert into public.responsables_droits (societe_id, user_id, domaine, modifier)
    select s, u, k, coalesce((v #>> '{}')::boolean, false) from jsonb_each(droits) as e(k, v)
    on conflict (societe_id, user_id, domaine) do update set modifier = excluded.modifier;
  delete from public.responsables_techniciens k where k.societe_id = s and k.user_id = u and not k.technicien_id = any (coalesce(techs, '{}'));
  insert into public.responsables_techniciens (societe_id, user_id, technicien_id)
    select s, u, x from unnest(coalesce(techs, '{}')) x on conflict do nothing;
end $$;

create or replace function public.accepter_invitations()
returns int language plpgsql security definer set search_path = '' as $$
declare moi uuid := (select auth.uid()); mon_email text; n int; k int; l int;
begin
  select lower(u.email) into mon_email from auth.users u
    where u.id = moi and u.email_confirmed_at is not null;
  if mon_email is null then return 0; end if;
  with prises as (
    update public.invitations i set accepte_le = now()
    where i.email = mon_email and i.accepte_le is null
    returning i.societe_id, i.role
  )
  insert into public.membres (societe_id, user_id, role)
    select societe_id, moi, role from prises
    on conflict (societe_id, user_id) do nothing;
  get diagnostics n = row_count;
  with prises as (
    delete from private.invitations_holding i where i.email = mon_email returning i.holding_id
  )
  insert into public.membres_holding (holding_id, user_id, role)
    select holding_id, moi, 'admin' from prises on conflict do nothing;
  get diagnostics k = row_count;
  with prises as (
    delete from private.invitations_responsable i where i.email = mon_email returning i.societe_id
  )
  insert into public.responsables (societe_id, user_id)
    select p.societe_id, moi from prises p
    where not exists (select 1 from public.membres m where m.societe_id = p.societe_id and m.user_id = moi) on conflict do nothing;
  get diagnostics l = row_count;
  return n + k + l;
end $$;

-- Modules du menu : visibles aussi par un responsable (ses cases décident du contenu).
do $$
declare avant text := pg_get_functiondef('public.modules_actifs(uuid)'::regprocedure); apres text;
begin
  apres := replace(avant, 'private.a_role(s, ''{admin,gestion,comptable,lecture}''))', 'private.a_role(s, ''{admin,gestion,comptable,lecture}'') or private.est_responsable(s))');
  if apres = avant then raise exception 'modules_actifs : definition inattendue'; end if;
  execute apres;
  avant := pg_get_functiondef('public.modules_saisis(uuid)'::regprocedure);
  apres := replace(avant, 'where private.a_role(s, ''{admin,gestion}'')', 'where (private.a_role(s, ''{admin,gestion}'') or exists (select 1 from public.responsables_droits d
      where d.societe_id = s and d.user_id = (select auth.uid()) and d.domaine = ''saisies''))');
  if apres = avant then raise exception 'modules_saisis : definition inattendue'; end if;
  execute apres;
end $$;

revoke execute on function public.nommer_responsable, public.retirer_responsable, public.responsables_de,
  public.regler_responsable from public, anon, authenticated;
grant execute on function public.nommer_responsable, public.retirer_responsable, public.responsables_de,
  public.regler_responsable to authenticated;
