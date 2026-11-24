-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Holdings : seul le super admin rattache une société, nomme un admin de holding et règle les modules.
-- Modules du back-office réglables par holding ; le réglage de la société l'emporte. Sans réglage : tout
-- reste actif, comme avant. Aucune donnée n'est modifiée ni effacée.

-- 1. La holding d'une société ne se change que par le super admin (ou par l'éditeur SQL).
create function private.garde_holding_societe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.holding_id is distinct from old.holding_id and (select auth.uid()) is not null and not private.est_super_admin() then
    raise exception 'rattachement a une holding : reserve au super admin';
  end if;
  return new;
end $$;
revoke execute on function private.garde_holding_societe from public;
create trigger garde_holding before update of holding_id on public.societes
  for each row execute function private.garde_holding_societe();

create function public.rattacher_societe(s uuid, h uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  update public.societes set holding_id = h where id = s;
  if not found then raise exception 'societe inconnue'; end if;
end $$;

create function public.enregistrer_holding(h uuid, p_nom text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r uuid := h;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if length(trim(coalesce(p_nom, ''))) not between 2 and 120 then raise exception 'nom de la holding : 2 a 120 caracteres'; end if;
  if exists (select 1 from public.holdings x where lower(x.nom) = lower(trim(p_nom)) and x.id is distinct from h) then
    raise exception 'cette holding existe deja';
  end if;
  if h is null then insert into public.holdings (nom) values (trim(p_nom)) returning id into r;
  else
    update public.holdings set nom = trim(p_nom) where id = h;
    if not found then raise exception 'holding inconnue'; end if;
  end if;
  return r;
end $$;

-- 2. Admin de holding : invité par son email, il entre en se connectant avec CET email confirmé.
create table private.invitations_holding (
  holding_id uuid not null references public.holdings on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%' and length(email) <= 200),
  cree_le timestamptz not null default now(),
  primary key (holding_id, email)
);

revoke all on private.invitations_holding from public, anon, authenticated;   -- par les fonctions seulement

create function public.nommer_admin_holding(h uuid, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare u uuid; e text := lower(trim(coalesce(p_email, '')));
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if not exists (select 1 from public.holdings x where x.id = h) then raise exception 'holding inconnue'; end if;
  select x.id into u from auth.users x where lower(x.email) = e and x.email_confirmed_at is not null;
  if u is not null then
    insert into public.membres_holding (holding_id, user_id, role) values (h, u, 'admin') on conflict do nothing;
    return 'nomme';
  end if;
  insert into private.invitations_holding (holding_id, email) values (h, e) on conflict do nothing;
  return 'invite';
end $$;

create function public.retirer_admin_holding(h uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  delete from private.invitations_holding i where i.holding_id = h and i.email = e;
  delete from public.membres_holding m using auth.users x where m.holding_id = h and m.user_id = x.id and lower(x.email) = e;
end $$;

create function public.admins_holding(h uuid)
returns table (email text, etat text) language sql stable security definer set search_path = '' as $$
  select lower(x.email), 'actif' from public.membres_holding m join auth.users x on x.id = m.user_id
  where m.holding_id = h and private.est_super_admin()
  union all
  select i.email, 'invite' from private.invitations_holding i where i.holding_id = h and private.est_super_admin()
  order by 1;
$$;

-- Connexion : comme avant pour les sociétés, plus les invitations de holding.
create or replace function public.accepter_invitations()
returns int language plpgsql security definer set search_path = '' as $$
declare moi uuid := (select auth.uid()); mon_email text; n int; k int;
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
  return n + k;
end $$;

-- 3. Modules du back-office par holding.
create table public.modules_holding (
  holding_id uuid not null references public.holdings on delete cascade,
  module public.module_enum not null,
  actif boolean not null,
  primary key (holding_id, module)
);
alter table public.modules_holding enable row level security;
revoke all on public.modules_holding from anon, authenticated;
grant select on public.modules_holding to authenticated;
create policy lire on public.modules_holding for select to authenticated using ((select private.est_super_admin()));
create trigger journal after insert or update or delete on public.modules_holding
  for each row execute function private.journal_holding();

-- p_actif vide = retirer le réglage (la société suit sa holding ; la holding laisse tout actif).
create function public.regler_module(p_module public.module_enum, p_holding uuid, p_societe uuid, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if num_nonnulls(p_holding, p_societe) <> 1 then raise exception 'une holding OU une societe'; end if;
  if p_holding is not null then
    if p_actif is null then delete from public.modules_holding m where m.holding_id = p_holding and m.module = p_module;
    else insert into public.modules_holding (holding_id, module, actif) values (p_holding, p_module, p_actif)
      on conflict (holding_id, module) do update set actif = excluded.actif; end if;
  elsif p_actif is null then delete from public.modules_societe m where m.societe_id = p_societe and m.module = p_module;
  else insert into public.modules_societe (societe_id, module, actif, modifie_par, modifie_le)
      values (p_societe, p_module, p_actif, (select auth.uid()), now())
    on conflict (societe_id, module) do update set actif = excluded.actif, modifie_par = excluded.modifie_par, modifie_le = excluded.modifie_le;
  end if;
end $$;

create or replace function public.modules_actifs(s uuid)
returns table (module text)
language sql security definer set search_path = '' as $$
  select e.elem::text as module
  from unnest(enum_range(NULL::public.module_enum)) as e(elem)
  left join public.modules_societe ms on ms.societe_id = s and ms.module = e.elem
  left join public.modules_holding mh on mh.module = e.elem
    and mh.holding_id = (select soc.holding_id from public.societes soc where soc.id = s)
  where (private.est_super_admin() or private.a_role(s, '{admin,gestion,comptable,lecture}'))
    and coalesce(ms.actif, mh.actif, true);
$$;

revoke execute on function public.rattacher_societe, public.enregistrer_holding, public.nommer_admin_holding,
  public.retirer_admin_holding, public.admins_holding, public.regler_module from public, anon, authenticated;
grant execute on function public.rattacher_societe, public.enregistrer_holding, public.nommer_admin_holding,
  public.retirer_admin_holding, public.admins_holding, public.regler_module to authenticated;
