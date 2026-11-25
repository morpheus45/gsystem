-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Holdings : groupe de sociétés au-dessus des sociétés.
-- super admin (operateurs) : voit et gère toutes les holdings et toutes les sociétés.
-- Une holding regroupe plusieurs sociétés. Une société appartient à au plus une holding.
-- Un "admin de holding" a les droits admin sur TOUTES les sociétés de sa holding (y compris futures).

-- Journal d'audit pour holdings et membres_holding (pas de societe_id sur ces tables,
-- on utilise holding_id / id pour satisfaire la NOT NULL de audit.societe_id)
create function private.journal_holding() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((coalesce(r->>'holding_id', r->>'id'))::uuid, tg_table_name, coalesce(r->>'id', r->>'user_id'),
          case when tg_op = 'DELETE' then 'DELETE' else tg_op end,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end $$;

-- Table des holdings
create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  cree_le timestamptz not null default now()
);

-- Lien société -> holding (nullable : une société peut n'être dans aucune holding)
alter table public.societes add column holding_id uuid references public.holdings on delete set null;
create index societes_holding_idx on public.societes (holding_id);

-- Membres d'une holding : rôle unique 'admin'
create table public.membres_holding (
  holding_id uuid not null references public.holdings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role = 'admin'),
  primary key (holding_id, user_id)
);
create index membres_holding_user_idx on public.membres_holding (user_id);

-- L'utilisateur connecté est-il admin de cette holding ?
-- security definer : lit membres_holding sans repasser par sa propre RLS (évite la récursion).
create function private.admin_holding(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres_holding mh
    where mh.holding_id = h and mh.user_id = (select auth.uid()) and mh.role = 'admin'
  );
$$;
revoke execute on function private.admin_holding from public;
grant execute on function private.admin_holding to authenticated;

-- RLS sur les nouvelles tables
alter table public.holdings enable row level security;
alter table public.membres_holding enable row level security;

-- Super admin : tout sur holdings
create policy holdings_lire on public.holdings for select to authenticated
  using ((select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))));
create policy holdings_gerer on public.holdings for all to authenticated
  using ((select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))))
  with check ((select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))));

-- Admin de holding : lit sa holding
create policy holdings_lire_admin on public.holdings for select to authenticated
  using ((select private.admin_holding(id)));

-- Membres holding : super admin gère tout, admin de holding lit son holding
create policy membres_holding_lire on public.membres_holding for select to authenticated
  using (
    (select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid())))
    or
    (select private.admin_holding(holding_id))
  );

create policy membres_holding_gerer on public.membres_holding for all to authenticated
  using ((select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))))
  with check ((select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))));

-- Pas de droit pour anon
revoke all on public.holdings, public.membres_holding from anon;

-- Droits pour authenticated (RLS filtre)
grant select on public.holdings, public.membres_holding to authenticated;
grant insert, update, delete on public.holdings, public.membres_holding to authenticated;

-- Journal d'audit pour holdings et membres_holding
create trigger journal after insert or update or delete on public.holdings
  for each row execute function private.journal_holding();
create trigger journal after insert or update or delete on public.membres_holding
  for each row execute function private.journal_holding();

-- Modifier private.a_role pour qu'un admin de la holding de la société soit traité comme 'admin' de cette société
-- Garde security definer et search_path = '' ; ne retire rien des droits actuels (super admin + membres)
create or replace function private.a_role(s uuid, roles public.role_membre[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))
      or exists (
        select 1 from public.membres m
        where m.societe_id = s and m.user_id = (select auth.uid()) and m.role = any (roles)
      )
      or exists (
        select 1 from public.societes soc
        join public.membres_holding mh on mh.holding_id = soc.holding_id
        where soc.id = s and mh.user_id = (select auth.uid()) and mh.role = 'admin'
      ) and 'admin' = any (roles);   -- l'admin de holding vaut 'admin' de la société, pas les autres rôles
$$;