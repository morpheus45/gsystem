-- Socle multi-société : sociétés, membres et rôles, règles validées, journal d'audit.
-- Chaque table métier porte societe_id ; la RLS est activée partout.

create schema if not exists private;

create type public.role_membre as enum ('admin', 'gestion', 'comptable', 'lecture');

create table public.societes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  cree_le timestamptz not null default now()
);

create table public.membres (
  societe_id uuid not null references public.societes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.role_membre not null,
  primary key (societe_id, user_id)
);
create index membres_user_idx on public.membres (user_id);

-- Règles d'heures / paie d'une société, versionnées. Rien ne s'applique avant validation.
create table public.regles_societe (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  version int not null,
  regles jsonb not null default '{}',
  valide_par uuid references auth.users,
  valide_le timestamptz,
  unique (societe_id, version),
  check ((valide_par is null) = (valide_le is null))
);

-- Journal d'audit : écrit seulement par trigger, jamais modifié ni effacé.
create table public.audit (
  id bigint generated always as identity primary key,
  societe_id uuid not null,
  table_nom text not null,
  ligne_id text,
  action text not null,
  avant jsonb,
  apres jsonb,
  par uuid,
  le timestamptz not null default now()
);
create index audit_societe_idx on public.audit (societe_id, le);

-- L'utilisateur connecté a-t-il l'un de ces rôles dans cette société ?
-- security definer : lit membres sans repasser par sa propre RLS (évite la récursion).
create function private.a_role(s uuid, roles public.role_membre[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.societe_id = s and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;
revoke execute on function private.a_role from public;
grant usage on schema private to authenticated;
grant execute on function private.a_role to authenticated;

create function private.journal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((r->>'societe_id')::uuid, tg_table_name, coalesce(r->>'id', r->>'user_id'), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end $$;

-- Validation (règles, relevés km) : le validateur est TOUJOURS l'utilisateur
-- connecté et la date est celle du serveur, quelle que soit la valeur envoyée.
create function private.signer_validation() returns trigger language plpgsql as $$
begin
  if new.valide_par is null and new.valide_le is null then return new; end if;
  if tg_op = 'UPDATE' and old.valide_le is not null then
    new.valide_par := old.valide_par; new.valide_le := old.valide_le;   -- déjà signée : figée
  else
    new.valide_par := (select auth.uid()); new.valide_le := now();
  end if;
  return new;
end $$;

-- Une société garde toujours au moins un admin.
create function private.garder_un_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.societe_id <> old.societe_id)
     and exists (select 1 from public.societes s where s.id = old.societe_id)
     and not exists (select 1 from public.membres m where m.societe_id = old.societe_id
                     and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'dernier admin de la societe : impossible de le retirer';
  end if;
  return coalesce(new, old);
end $$;

alter table public.societes enable row level security;
alter table public.membres enable row level security;
alter table public.regles_societe enable row level security;
alter table public.audit enable row level security;

create policy societes_lire on public.societes for select to authenticated
  using ((select private.a_role(id, '{admin,gestion,comptable,lecture}')));
create policy societes_modifier on public.societes for update to authenticated
  using ((select private.a_role(id, '{admin}'))) with check ((select private.a_role(id, '{admin}')));
-- Création d'une société : par le serveur (service_role), pas par un utilisateur.

create policy membres_lire on public.membres for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create policy membres_gerer on public.membres for all to authenticated
  using ((select private.a_role(societe_id, '{admin}'))) with check ((select private.a_role(societe_id, '{admin}')));

create policy regles_lire on public.regles_societe for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create policy regles_gerer on public.regles_societe for all to authenticated
  using ((select private.a_role(societe_id, '{admin}'))) with check ((select private.a_role(societe_id, '{admin}')));

create policy audit_lire on public.audit for select to authenticated
  using ((select private.a_role(societe_id, '{admin,comptable}')));

grant select, update on public.societes to authenticated;
grant select, insert, update, delete on public.membres, public.regles_societe to authenticated;
grant select on public.audit to authenticated;

create trigger garder_un_admin before update or delete on public.membres
  for each row execute function private.garder_un_admin();
create trigger signer before insert or update on public.regles_societe
  for each row execute function private.signer_validation();
create trigger journal after insert or update or delete on public.membres
  for each row execute function private.journal();
create trigger journal after insert or update or delete on public.regles_societe
  for each row execute function private.journal();
