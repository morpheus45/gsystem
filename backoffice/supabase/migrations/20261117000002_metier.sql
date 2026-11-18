-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Tables métier : personnel, heures, paie, frais, factures, véhicules.
-- Les clés étrangères composites (societe_id, x_id) empêchent de relier
-- une ligne de la société A à un objet de la société B.

create table public.techniciens (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  nom text not null,
  nom_apk text,               -- nom du dossier Drive de l'APK (pont d'import)
  actif boolean not null default true,
  unique (societe_id, id),
  unique (societe_id, nom_apk)
);

create table public.temps (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  cle_source text not null,   -- identifiant stable : réimport sans doublon
  date date not null,
  departement text not null default '',
  type_mission text not null,
  ville text not null default '',
  numero_intervention text not null default '',
  observation_type text not null default '',
  observations text not null default '',
  motif_retard text not null default '',
  retard_texte text not null default '',
  slot_midi text not null default '',
  heure_debut text not null default '',
  heure_fin text not null default '',
  unique (societe_id, cle_source),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);
create index temps_tech_date_idx on public.temps (societe_id, technicien_id, date);

create type public.statut_periode as enum ('brouillon', 'validee', 'exportee');

create table public.periodes_paie (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  debut date not null,
  fin date not null,
  statut public.statut_periode not null default 'brouillon',
  valide_par uuid references auth.users,
  valide_le timestamptz,
  exporte_le timestamptz,
  check (fin >= debut),
  check (statut = 'brouillon' or (valide_par is not null and valide_le is not null)),
  check (statut <> 'exportee' or exporte_le is not null)
);
create index periodes_societe_idx on public.periodes_paie (societe_id, debut, fin);

create type public.sens_facture as enum ('emise', 'recue');

create table public.factures (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  sens public.sens_facture not null,
  categorie text not null default '',      -- garage, carburant, client... (configurable)
  numero text not null,
  date date not null,
  tiers text not null,
  montant_ht numeric(12,2) not null,
  tva numeric(12,2) not null,
  montant_ttc numeric(12,2) not null,
  fichier text,
  plateforme_ref text,                     -- référence chez la plateforme agréée (à brancher)
  unique (societe_id, id),
  unique (societe_id, sens, tiers, numero)
);

create table public.frais (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  cle_source text not null,
  date date not null,
  horodatage bigint,
  fichier text not null default '',
  categorie text not null default '',
  montant_eur numeric(10,2) not null default 0,
  observations text not null default '',
  sans_tva boolean not null default false,
  unique (societe_id, cle_source),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);
create index frais_tech_date_idx on public.frais (societe_id, technicien_id, date);

-- Photos envoyées par l'APK : on garde la référence Drive (choix du stockage : Phase 0).
create table public.photos_apk (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  cle_source text not null,
  nom_local text not null,
  nom_drive text not null,
  unique (societe_id, cle_source),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);

create table public.vehicules (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  plaque text not null,
  libelle text not null default '',
  actif boolean not null default true,
  unique (societe_id, id),
  unique (societe_id, plaque)
);

create table public.affectations (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  vehicule_id uuid not null,
  technicien_id uuid not null,
  debut date not null,
  fin date,
  check (fin is null or fin >= debut),
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);

create type public.source_releve as enum ('photo', 'saisie');

create table public.vehicules_photos (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  vehicule_id uuid not null,
  type text not null,                     -- compteur, face_avant, pneus, degat... (configurable)
  periode text not null check (periode ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source text not null check (source in ('apk', 'backoffice')),
  emplacement text not null,              -- ex. drive:<nom> ou storage:<chemin>
  unique (societe_id, id),
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id)
);

create table public.releves_km (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  vehicule_id uuid not null,
  date date not null,
  km int not null check (km >= 0),
  source public.source_releve not null,
  photo_id uuid,
  valide_par uuid references auth.users,
  valide_le timestamptz,
  check ((valide_par is null) = (valide_le is null)),
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id),
  foreign key (societe_id, photo_id) references public.vehicules_photos (societe_id, id)
);

-- Intervalles SAISIS par la société : aucun intervalle n'est inventé ici.
create table public.entretien_regles (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  vehicule_id uuid,                       -- null = tous les véhicules de la société
  type text not null,
  tous_les_km int check (tous_les_km > 0),
  tous_les_mois int check (tous_les_mois > 0),
  check (tous_les_km is not null or tous_les_mois is not null),
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id)
);

create table public.entretiens (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  vehicule_id uuid not null,
  type text not null,
  date date not null,
  km int check (km >= 0),
  garage text not null default '',
  cout numeric(12,2),
  facture_id uuid,
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id),
  foreign key (societe_id, facture_id) references public.factures (societe_id, id)
);

create table public.echeances (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  vehicule_id uuid not null,
  type text not null,                     -- CT, ASSURANCE, PNEUS, SINISTRE... (configurable)
  date date,
  km int,
  check (date is not null or km is not null),
  foreign key (societe_id, vehicule_id) references public.vehicules (societe_id, id)
);

-- Droits : tous les membres lisent ; admin et gestion écrivent ;
-- le comptable écrit aussi les périodes de paie et les factures.
do $$
declare t text; ecrivains text;
begin
  foreach t in array array['techniciens','temps','periodes_paie','factures','frais','photos_apk',
    'vehicules','affectations','vehicules_photos','releves_km','entretien_regles','entretiens','echeances']
  loop
    ecrivains := case when t in ('periodes_paie','factures') then '{admin,gestion,comptable}' else '{admin,gestion}' end;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lire on public.%I for select to authenticated
      using ((select private.a_role(societe_id, ''{admin,gestion,comptable,lecture}'')))', t);
    execute format('create policy ecrire on public.%I for all to authenticated
      using ((select private.a_role(societe_id, %L))) with check ((select private.a_role(societe_id, %L)))',
      t, ecrivains, ecrivains);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create trigger journal after insert or update or delete on public.%I
      for each row execute function private.journal()', t);
  end loop;
end $$;

-- Période de paie : née en brouillon, elle avance d'une étape à la fois
-- (brouillon -> validée -> exportée), puis elle est verrouillée.
-- Le validateur et les dates sont posés ici : jamais pris de l'appelant.
create function private.periode_avance() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'brouillon' then raise exception 'une periode nait en brouillon'; end if;
    new.valide_par := null; new.valide_le := null; new.exporte_le := null;
    return new;
  end if;
  if old.statut = 'exportee' then raise exception 'periode verrouillee'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.statut = old.statut then
    new.valide_par := old.valide_par; new.valide_le := old.valide_le; new.exporte_le := old.exporte_le;
  elsif old.statut = 'brouillon' and new.statut = 'validee' then
    new.valide_par := (select auth.uid()); new.valide_le := now();
  elsif old.statut = 'validee' and new.statut = 'exportee' then
    new.valide_par := old.valide_par; new.valide_le := old.valide_le; new.exporte_le := now();
  else
    raise exception 'passage % -> % interdit (une etape a la fois, brouillon -> validee -> exportee)', old.statut, new.statut;
  end if;
  return new;
end $$;
create trigger avance before insert or update or delete on public.periodes_paie
  for each row execute function private.periode_avance();

-- Relevé km validé : le validateur est l'utilisateur connecté.
create trigger signer before insert or update on public.releves_km
  for each row execute function private.signer_validation();

-- Heures et frais d'une période exportée : plus aucune modification.
create function private.hors_periode_verrouillee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  if exists (select 1 from public.periodes_paie p
             where p.societe_id = (r->>'societe_id')::uuid and p.statut = 'exportee'
               and (r->>'date')::date between p.debut and p.fin)
     or (tg_op = 'UPDATE' and exists (select 1 from public.periodes_paie p
             where p.societe_id = old.societe_id and p.statut = 'exportee'
               and old.date between p.debut and p.fin)) then
    raise exception 'periode de paie verrouillee';
  end if;
  return coalesce(new, old);
end $$;
create trigger verrou before insert or update or delete on public.temps
  for each row execute function private.hors_periode_verrouillee();
create trigger verrou before insert or update or delete on public.frais
  for each row execute function private.hors_periode_verrouillee();
