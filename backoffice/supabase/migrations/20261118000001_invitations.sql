-- Phase 1 : l'opérateur (toi) crée les sociétés clientes ; les admins invitent ;
-- l'invité entre dans la société en se connectant avec CET email, confirmé.

-- Opérateurs de la plateforme : ajoutés à la main (SQL, service_role), jamais par l'écran.
create table public.operateurs (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.operateurs enable row level security;
create policy moi on public.operateurs for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.operateurs to authenticated;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role public.role_membre not null,
  cree_le timestamptz not null default now(),
  accepte_le timestamptz,
  unique (societe_id, email)
);
alter table public.invitations enable row level security;
create policy gerer on public.invitations for all to authenticated
  using ((select private.a_role(societe_id, '{admin}'))) with check ((select private.a_role(societe_id, '{admin}')));
grant select, insert, delete on public.invitations to authenticated;
create trigger journal after insert or update or delete on public.invitations
  for each row execute function private.journal();

-- L'écran envoie l'email tel que saisi : on le met en minuscules avant la vérification.
create function private.email_minuscules() returns trigger language plpgsql as $$
begin new.email := lower(trim(new.email)); return new; end $$;
create trigger minuscules before insert or update on public.invitations
  for each row execute function private.email_minuscules();

-- Créer une société et inviter son premier admin. Réservé aux opérateurs.
create function public.creer_societe(nom text, email_admin text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s uuid;
begin
  if not exists (select 1 from public.operateurs o where o.user_id = (select auth.uid())) then
    raise exception 'reserve a un operateur de la plateforme';
  end if;
  insert into public.societes (nom) values (trim(nom)) returning id into s;
  insert into public.invitations (societe_id, email, role) values (s, email_admin, 'admin');
  return s;
end $$;

-- À chaque connexion : accepte les invitations faites à l'email CONFIRMÉ de l'utilisateur.
-- Renvoie le nombre de sociétés rejointes.
create function public.accepter_invitations()
returns int language plpgsql security definer set search_path = '' as $$
declare moi uuid := (select auth.uid()); mon_email text; n int;
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
  return n;
end $$;

-- Membres d'une société avec leur email (auth.users n'est pas lisible directement).
create function public.membres_de(s uuid)
returns table (user_id uuid, email text, role public.role_membre)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.a_role(s, '{admin,gestion,comptable,lecture}') then
    raise exception 'acces refuse';
  end if;
  return query select m.user_id, lower(u.email), m.role
    from public.membres m join auth.users u on u.id = m.user_id where m.societe_id = s;
end $$;

revoke execute on function public.creer_societe, public.accepter_invitations, public.membres_de from public, anon;
grant execute on function public.creer_societe, public.accepter_invitations, public.membres_de to authenticated;
