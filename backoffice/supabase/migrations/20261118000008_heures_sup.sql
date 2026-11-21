-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Décision du 17/11/2026 : les heures sup se VALIDENT par une case cochée dans le
-- back-office, par admin ou gestion (pas par le comptable). Une ligne par tech et
-- par semaine ISO ; seules les heures sup validées partent dans l'export de paie.
create table public.heures_sup (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  semaine text not null check (semaine ~ '^\d{4}-W\d{2}$'),
  date date not null,                 -- lundi de la semaine (sert au verrou de paie)
  sup1 numeric(6,2) not null default 0,   -- heures de 1re tranche au moment de la validation
  sup2 numeric(6,2) not null default 0,   -- heures de 2e tranche
  valide boolean not null default false,
  valide_par uuid references auth.users,
  valide_le timestamptz,
  unique (societe_id, technicien_id, semaine),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);

-- Coché : signé par l'utilisateur connecté (jamais la valeur envoyée). Décoché : signature retirée.
create function private.signer_heures_sup() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.valide then new.valide_par := (select auth.uid()); new.valide_le := now();
  else new.valide_par := null; new.valide_le := null; end if;
  return new;
end $$;

alter table public.heures_sup enable row level security;
create policy lire on public.heures_sup for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create policy ecrire on public.heures_sup for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')))
  with check ((select private.a_role(societe_id, '{admin,gestion}')));
grant select, insert, update, delete on public.heures_sup to authenticated;

create trigger signer before insert or update on public.heures_sup
  for each row execute function private.signer_heures_sup();
create trigger verrou before insert or update or delete on public.heures_sup
  for each row execute function private.hors_periode_verrouillee();
create trigger journal after insert or update or delete on public.heures_sup
  for each row execute function private.journal();
create trigger effacement_interdit before delete on public.heures_sup
  for each row execute function private.interdire_effacement();
