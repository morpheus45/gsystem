-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- ÉTAPE 1 : table modules_societe, RLS, function modules_actifs, journal d'audit

-- Module enum visible côté application
create type public.module_enum as enum (
  'interventions','heures','frais','vehicules','conges','paie','compta','facturation','messages','documents'
);

-- Table des modules par société : absence d'une ligne = module actif
create table public.modules_societe (
  societe_id uuid not null references public.societes on delete cascade,
  module public.module_enum not null,
  actif boolean default true,
  modifie_par uuid references auth.users,
  modifie_le timestamptz not null default now(),
  primary key (societe_id, module)
);

-- RLS activée
alter table public.modules_societe enable row level security;

-- Lecture : membres de la société voient quels modules sont actifs
create policy modules_lire on public.modules_societe for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));

-- Écriture : super admin seulement
create policy modules_gerer on public.modules_societe for all to authenticated
  using (private.est_super_admin()) with check (private.est_super_admin());

grant select on public.modules_societe to authenticated;
grant insert, update, delete on public.modules_societe to authenticated;

-- Activer / désactiver un module pour une société (super admin seulement).
create or replace function public.activer_module(s uuid, mod public.module_enum, actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  insert into public.modules_societe (societe_id, module, actif, modifie_par, modifie_le)
  values (s, mod, actif, (select auth.uid()), now())
  on conflict (societe_id, module) do update
    set actif = excluded.actif, modifie_par = excluded.modifie_par, modifie_le = excluded.modifie_le;
end $$;
revoke execute on function public.activer_module(uuid, public.module_enum, boolean) from public, anon;
grant execute on function public.activer_module(uuid, public.module_enum, boolean) to authenticated;

-- Fonction publique modules_actifs : retourne les modules actifs pour une société
-- security definer, search_path = '', vérification des droits en premier
-- Absence d'une ligne = module actif ; une ligne actif=false exclut le module.
create or replace function public.modules_actifs(s uuid)
returns table (module text)
language sql security definer set search_path = '' as $$
  select e.elem::text as module
  from unnest(enum_range(NULL::public.module_enum)) as e(elem)
  where (private.est_super_admin() or private.a_role(s, '{admin,gestion,comptable,lecture}'))
    and not exists (
      select 1 from public.modules_societe m
      where m.societe_id = s and m.module = e.elem and m.actif is false
    );
$$;
revoke execute on function public.modules_actifs(uuid) from public, anon;
grant execute on function public.modules_actifs(uuid) to authenticated;

-- Trigger journal : audit de tout insert/update/delete sur modules_societe
create function private.journal_module() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((r->>'societe_id')::uuid, 'modules_societe', coalesce(r->>'id', r->>'user_id'), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end $$;

create trigger journal after insert or update or delete on public.modules_societe
  for each row execute function private.journal_module();

-- Index de recherche sur module
create index modules_societe_module_idx on public.modules_societe (module);