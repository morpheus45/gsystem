-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Demandes du 21/11/2026 :
-- 1) Congés : une ligne validée est modifiable ou annulable par admin/gestion avec motif obligatoire.
--    L'auteur et la date de décision initiale sont préservés ; auteur et date de modification sont posés.
-- 2) Véhicules : « supprimer » un véhicule = l'archiver avec motif, auteur et date (jamais effacé).

-- === Congés ===
alter table public.conges drop constraint if exists conges_statut_check;
alter table public.conges add constraint conges_statut_check check (statut in ('demandee', 'validee', 'refusee', 'annulee'));

alter table public.conges add column if not exists modifie_par uuid references auth.users;
alter table public.conges add column if not exists modifie_le timestamptz;
alter table public.conges add column if not exists motif_modification text not null default '';

create or replace function private.signer_conge() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.statut = 'demandee' then
      new.decide_par := null; new.decide_le := null;
    else
      new.decide_par := (select auth.uid()); new.decide_le := now();
    end if;
    new.modifie_par := null; new.modifie_le := null; new.motif_modification := '';
    return new;
  end if;

  -- Si la ligne était déjà validée
  if old.statut = 'validee' then
    -- Si modification de dates, de type ou annulation
    if (new.debut, new.fin, new.type, new.statut) is distinct from (old.debut, old.fin, old.type, old.statut) then
      if btrim(new.motif_modification) = '' then
        raise exception 'motif obligatoire pour modifier ou annuler un congé validé';
      end if;
      new.decide_par := old.decide_par;
      new.decide_le := old.decide_le;
      new.modifie_par := (select auth.uid());
      new.modifie_le := now();
    end if;
  elsif new.statut = 'demandee' then
    new.decide_par := null; new.decide_le := null;
    new.modifie_par := null; new.modifie_le := null; new.motif_modification := '';
  elsif new.statut is distinct from old.statut then
    new.decide_par := (select auth.uid()); new.decide_le := now();
  else
    new.decide_par := old.decide_par; new.decide_le := old.decide_le;
  end if;

  return new;
end $$;

-- === Véhicules ===
alter table public.vehicules add column if not exists archive_le date;
alter table public.vehicules add column if not exists archive_par uuid references auth.users;
alter table public.vehicules add column if not exists motif_archive text not null default '';

create or replace function private.archiver_vehicule() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.archive_le is not null and old.archive_le is null then
    if btrim(new.motif_archive) = '' then
      raise exception 'motif obligatoire pour archiver un véhicule';
    end if;
    new.archive_le := current_date;
    new.archive_par := (select auth.uid());
    new.actif := false;
  elsif new.archive_le is null and old.archive_le is not null then
    new.archive_par := null;
    new.motif_archive := '';
    new.actif := true;
  elsif new.archive_le is not null then
    new.archive_le := old.archive_le;
    new.archive_par := old.archive_par;
    new.motif_archive := coalesce(nullif(btrim(new.motif_archive), ''), old.motif_archive);
  end if;
  return new;
end $$;

drop trigger if exists archiver on public.vehicules;
create trigger archiver before update on public.vehicules
  for each row execute function private.archiver_vehicule();

create or replace function private.interdire_effacement_vehicule() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.archive_le is not null then
    raise exception 'effacement interdit : véhicule archivé';
  end if;
  return old;
end $$;

drop trigger if exists effacement_interdit on public.vehicules;
create trigger effacement_interdit before delete on public.vehicules
  for each row execute function private.interdire_effacement_vehicule();
