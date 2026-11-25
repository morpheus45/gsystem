-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Pilotage des modules fins (couche NOUVELLE et ADDITIVE : ne touche pas les modules existants).
-- Trois serrures : 1) disponible, décidé par le super admin ou le patron de la holding (Gilles) ;
--                  2) allumé par la société elle-même ; 3) par support (bureau / apk / iphone).
-- Un module ne tourne que si disponible ET allumé sur le support. La demande = une société réclame
-- un module non encore disponible ; le super admin ou le patron décide.

-- Patron d'une société : super admin, ou admin de la holding à laquelle la société est rattachée.
create function private.est_patron(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.est_super_admin()
      or exists (select 1 from public.membres_holding mh
                 join public.societes soc on soc.id = s
                 where mh.holding_id = soc.holding_id and mh.user_id = (select auth.uid()) and mh.role = 'admin');
$$;
revoke execute on function private.est_patron from public;
grant execute on function private.est_patron to authenticated;

-- 1. Catalogue des modules fins (référence en lecture seule, semée ici).
create table public.catalogue_module (
  code text primary key check (code ~ '^[a-z_]{2,40}$'),
  libelle text not null,
  famille text not null,
  supports text[] not null default '{bureau,apk,iphone}'
    check (supports <@ '{bureau,apk,iphone}'::text[] and cardinality(supports) between 1 and 3)
);
alter table public.catalogue_module enable row level security;
grant select on public.catalogue_module to authenticated;
create policy lire on public.catalogue_module for select to authenticated using (true);

insert into public.catalogue_module (code, libelle, famille, supports) values
  ('clients', 'Clients / tiers', 'commerce', '{bureau,apk}'),
  ('articles', 'Articles & tarifs', 'commerce', '{bureau}'),
  ('devis', 'Devis', 'commerce', '{bureau}'),
  ('commandes', 'Commandes clients', 'commerce', '{bureau,apk}'),
  ('livraisons', 'Bons de livraison', 'commerce', '{bureau,apk}'),
  ('factures', 'Factures', 'commerce', '{bureau}'),
  ('avoirs', 'Avoirs', 'commerce', '{bureau}'),
  ('reglements', 'Règlements', 'commerce', '{bureau}'),
  ('relances', 'Relances impayés', 'commerce', '{bureau}'),
  ('stock', 'Gestion de stock', 'stock', '{bureau,apk}'),
  ('inventaires', 'Inventaires', 'stock', '{bureau,apk}'),
  ('peremption', 'Lots & péremption', 'stock', '{bureau,apk}'),
  ('fournisseurs', 'Fournisseurs', 'achats', '{bureau}'),
  ('achats', 'Commandes fournisseurs', 'achats', '{bureau}'),
  ('receptions', 'Réceptions', 'achats', '{bureau,apk}'),
  ('location_contrats', 'Contrats de location', 'location', '{bureau}'),
  ('etats_lieux', 'États des lieux', 'location', '{bureau,apk}'),
  ('commissions', 'Commissions', 'intermediation', '{bureau}');

-- 2. Disponible (niveau 1) : décidé par toi / Gilles.
create table public.module_disponible (
  societe_id uuid not null references public.societes on delete cascade,
  code text not null references public.catalogue_module,
  ouvert_par uuid references auth.users,
  ouvert_le timestamptz not null default now(),
  primary key (societe_id, code)
);
alter table public.module_disponible enable row level security;
grant select on public.module_disponible to authenticated;
create policy lire on public.module_disponible for select to authenticated
  using (private.est_patron(societe_id) or (select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create trigger journal after insert or update or delete on public.module_disponible
  for each row execute function private.journal();

-- 3. Allumé (niveau 2) × support : décidé par la société elle-même.
create table public.module_allume (
  societe_id uuid not null references public.societes on delete cascade,
  code text not null references public.catalogue_module,
  support text not null check (support in ('bureau', 'apk', 'iphone')),
  allume_par uuid references auth.users,
  allume_le timestamptz not null default now(),
  primary key (societe_id, code, support)
);
alter table public.module_allume enable row level security;
grant select on public.module_allume to authenticated;
create policy lire on public.module_allume for select to authenticated
  using (private.est_patron(societe_id) or (select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create trigger journal after insert or update or delete on public.module_allume
  for each row execute function private.journal();

-- 4. Demandes de module (la société demande, toi / Gilles décidez).
create table public.demande_module (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  code text not null references public.catalogue_module,
  demande_par uuid references auth.users,
  demande_le timestamptz not null default now(),
  etat text not null default 'en_attente' check (etat in ('en_attente', 'accordee', 'refusee')),
  decide_par uuid references auth.users,
  decide_le timestamptz
);
create unique index demande_module_attente on public.demande_module (societe_id, code) where etat = 'en_attente';
alter table public.demande_module enable row level security;
grant select on public.demande_module to authenticated;
create policy lire on public.demande_module for select to authenticated
  using (private.est_patron(societe_id) or (select private.a_role(societe_id, '{admin,gestion}')));
create trigger journal after insert or update or delete on public.demande_module
  for each row execute function private.journal();

-- Rendre un module disponible (ou non) pour une société : toi ou Gilles. Plus disponible => plus allumé.
create function public.rendre_disponible(p_societe uuid, p_code text, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_patron(p_societe) then raise exception 'reserve au super admin ou au patron de la holding'; end if;
  if not exists (select 1 from public.catalogue_module c where c.code = p_code) then raise exception 'module inconnu'; end if;
  if p_actif then
    insert into public.module_disponible (societe_id, code, ouvert_par)
      values (p_societe, p_code, (select auth.uid())) on conflict (societe_id, code) do nothing;
  else
    delete from public.module_allume where societe_id = p_societe and code = p_code;
    delete from public.module_disponible where societe_id = p_societe and code = p_code;
  end if;
end $$;

-- Allumer / éteindre un module sur un support : la société (admin). Interdit si non disponible.
create function public.allumer_module(p_societe uuid, p_code text, p_support text, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.a_role(p_societe, '{admin}')) is not true then raise exception 'reserve a l''administration de la societe'; end if;
  if not exists (select 1 from public.module_disponible d where d.societe_id = p_societe and d.code = p_code) then
    raise exception 'module non disponible pour cette societe'; end if;
  if not exists (select 1 from public.catalogue_module c where c.code = p_code and p_support = any(c.supports)) then
    raise exception 'support non prevu pour ce module'; end if;
  if p_actif then
    insert into public.module_allume (societe_id, code, support, allume_par)
      values (p_societe, p_code, p_support, (select auth.uid())) on conflict (societe_id, code, support) do nothing;
  else
    delete from public.module_allume where societe_id = p_societe and code = p_code and support = p_support;
  end if;
end $$;

-- Demander un module non encore disponible : la société.
create function public.demander_module(p_societe uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.a_role(p_societe, '{admin,gestion}')) is not true then raise exception 'reserve a la societe'; end if;
  if not exists (select 1 from public.catalogue_module c where c.code = p_code) then raise exception 'module inconnu'; end if;
  if exists (select 1 from public.module_disponible d where d.societe_id = p_societe and d.code = p_code) then
    raise exception 'module deja disponible'; end if;
  if exists (select 1 from public.demande_module x where x.societe_id = p_societe and x.code = p_code and x.etat = 'en_attente') then
    raise exception 'demande deja en attente'; end if;
  insert into public.demande_module (societe_id, code, demande_par) values (p_societe, p_code, (select auth.uid()));
end $$;

-- Répondre à une demande : toi / Gilles. Accordée => le module devient disponible.
create function public.repondre_demande(p_id uuid, p_accord boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.demande_module;
begin
  select * into d from public.demande_module x where x.id = p_id and x.etat = 'en_attente';
  if d.id is null then raise exception 'demande introuvable'; end if;
  if not private.est_patron(d.societe_id) then raise exception 'reserve au super admin ou au patron de la holding'; end if;
  update public.demande_module set etat = case when p_accord then 'accordee' else 'refusee' end,
    decide_par = (select auth.uid()), decide_le = now() where id = p_id;
  if p_accord then
    insert into public.module_disponible (societe_id, code, ouvert_par)
      values (d.societe_id, d.code, (select auth.uid())) on conflict (societe_id, code) do nothing;
  end if;
end $$;

-- Vue pilotage d'une société : chaque module du catalogue avec son état.
create function public.pilotage_modules(s uuid)
returns table (code text, libelle text, famille text, supports text[], disponible boolean, allumes text[], demande text)
language sql stable security definer set search_path = '' as $$
  select c.code, c.libelle, c.famille, c.supports,
    (d.societe_id is not null) as disponible,
    coalesce((select array_agg(a.support order by a.support) from public.module_allume a
              where a.societe_id = s and a.code = c.code), '{}') as allumes,
    (select x.etat from public.demande_module x where x.societe_id = s and x.code = c.code and x.etat = 'en_attente' limit 1) as demande
  from public.catalogue_module c
  left join public.module_disponible d on d.societe_id = s and d.code = c.code
  where private.est_patron(s) or (select private.a_role(s, '{admin,gestion,comptable,lecture}'))
  order by c.famille, c.libelle;
$$;

-- Un module fin tourne pour une société sur un support ? disponible ET allumé.
create function private.module_ouvert(s uuid, p_code text, p_support text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.module_disponible d where d.societe_id = s and d.code = p_code)
     and exists (select 1 from public.module_allume a where a.societe_id = s and a.code = p_code and a.support = p_support);
$$;
revoke execute on function private.module_ouvert from public;
grant execute on function private.module_ouvert to authenticated;

revoke execute on function public.rendre_disponible, public.allumer_module, public.demander_module,
  public.repondre_demande, public.pilotage_modules from public, anon, authenticated;
grant execute on function public.rendre_disponible, public.allumer_module, public.demander_module,
  public.repondre_demande, public.pilotage_modules to authenticated;
