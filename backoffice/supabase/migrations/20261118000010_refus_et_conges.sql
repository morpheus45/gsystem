-- Demandes du 17/11/2026 :
-- 1) heures sup : « Refusées » en plus de « Validées » (une semaine refusée n'est pas payée) ;
-- 2) demandes de congés à valider (saisies au bureau ; branchement APK plus tard).

alter table public.heures_sup add column refusee boolean not null default false;
alter table public.heures_sup add constraint heures_sup_un_seul_choix check (not (valide and refusee));

-- Validée OU refusée : signé par l'utilisateur connecté ; ni l'un ni l'autre : signature retirée.
create or replace function private.signer_heures_sup() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.valide or new.refusee then new.valide_par := (select auth.uid()); new.valide_le := now();
  else new.valide_par := null; new.valide_le := null; end if;
  return new;
end $$;

create table public.conges (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  debut date not null,
  fin date not null,
  type text not null check (type in ('CP', 'RTT', 'SANS_SOLDE', 'AUTRE')),
  motif text not null default '',
  statut text not null default 'demandee' check (statut in ('demandee', 'validee', 'refusee')),
  source text not null default 'bureau' check (source in ('bureau', 'apk')),
  decide_par uuid references auth.users,
  decide_le timestamptz,
  cree_le timestamptz not null default now(),
  check (fin >= debut),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);
create index conges_tech_idx on public.conges (societe_id, technicien_id, debut);

-- Décision signée par l'utilisateur connecté (jamais la valeur envoyée).
create function private.signer_conge() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.statut = 'demandee' then new.decide_par := null; new.decide_le := null;
  elsif tg_op = 'INSERT' or new.statut is distinct from old.statut then
    new.decide_par := (select auth.uid()); new.decide_le := now();
  else new.decide_par := old.decide_par; new.decide_le := old.decide_le; end if;
  return new;
end $$;

alter table public.conges enable row level security;
create policy lire on public.conges for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create policy ecrire on public.conges for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')))
  with check ((select private.a_role(societe_id, '{admin,gestion}')));
grant select, insert, update, delete on public.conges to authenticated;
create trigger signer before insert or update on public.conges
  for each row execute function private.signer_conge();
create trigger journal after insert or update or delete on public.conges
  for each row execute function private.journal();
create trigger effacement_interdit before delete on public.conges
  for each row execute function private.interdire_effacement();
