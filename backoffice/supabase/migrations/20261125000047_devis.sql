-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Devis » : en-tête (client, date, numéro) + lignes d'articles, totaux HT/TVA/TTC.
-- Gardé par le pilotage sur Bureau. Les totaux sont recalculés par la base (jamais par le client),
-- avec le même arrondi que le cœur core/montants (au centime, demi vers le haut).
-- Interconnexion : le client vient du module Clients, les lignes du module Articles — mais le devis
-- garde une copie du nom et du libellé, donc il reste lisible même si un tiers ou un article disparaît.

-- EN-TÊTE
create table public.devis (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  numero text,
  tiers_id uuid references public.tiers on delete set null,
  client_nom text not null check (length(trim(client_nom)) between 1 and 200),
  date_devis date not null default current_date,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoye', 'accepte', 'refuse')),
  total_ht_centimes integer not null default 0,
  total_tva_centimes integer not null default 0,
  total_ttc_centimes integer not null default 0,
  notes text check (notes is null or length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users,
  unique (societe_id, numero)
);
create index devis_societe_idx on public.devis (societe_id, date_devis);

-- Numéro automatique DEV-AAAA-00001, par société et par année (même format que core/numeros).
create function private.devis_numero() returns trigger
language plpgsql set search_path = '' as $$
declare seq int;
begin
  if new.numero is null then
    select coalesce(max(substring(d.numero from '[0-9]+$')::int), 0) + 1 into seq
      from public.devis d
      where d.societe_id = new.societe_id and d.numero like 'DEV-' || to_char(new.date_devis, 'YYYY') || '-%';
    new.numero := 'DEV-' || to_char(new.date_devis, 'YYYY') || '-' || lpad(seq::text, 5, '0');
  end if;
  new.modifie_le := now();
  new.modifie_par := (select auth.uid());
  return new;
end $$;
create trigger numero before insert or update on public.devis
  for each row execute function private.devis_numero();

-- LIGNES
create table public.devis_ligne (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis on delete cascade,
  article_id uuid references public.articles on delete set null,
  libelle text not null check (length(trim(libelle)) between 1 and 200),
  quantite integer not null default 1 check (quantite > 0),
  prix_unitaire_centimes integer not null default 0 check (prix_unitaire_centimes >= 0),
  remise_pct numeric(5,2) not null default 0 check (remise_pct between 0 and 100),
  taux_tva numeric(4,1) not null default 20 check (taux_tva in (0, 2.1, 5.5, 10, 20)),
  ht_centimes integer not null default 0,
  tva_centimes integer not null default 0,
  ttc_centimes integer not null default 0,
  rang integer not null default 0
);
create index devis_ligne_idx on public.devis_ligne (devis_id, rang);

-- Montants d'une ligne, calculés par la base (mêmes règles que core/montants).
create function private.devis_ligne_montants() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.ht_centimes := round(new.quantite::numeric * new.prix_unitaire_centimes * (100 - new.remise_pct) / 100.0);
  new.tva_centimes := round(new.ht_centimes * new.taux_tva / 100.0);
  new.ttc_centimes := new.ht_centimes + new.tva_centimes;
  return new;
end $$;
create trigger montants before insert or update on public.devis_ligne
  for each row execute function private.devis_ligne_montants();

-- Totaux de l'en-tête = somme des lignes, recalculés à chaque changement de ligne.
create function private.devis_totaux() returns trigger
language plpgsql set search_path = '' as $$
declare d uuid := coalesce(new.devis_id, old.devis_id);
begin
  update public.devis x set
    total_ht_centimes = coalesce((select sum(l.ht_centimes) from public.devis_ligne l where l.devis_id = d), 0),
    total_tva_centimes = coalesce((select sum(l.tva_centimes) from public.devis_ligne l where l.devis_id = d), 0),
    total_ttc_centimes = coalesce((select sum(l.ttc_centimes) from public.devis_ligne l where l.devis_id = d), 0)
  where x.id = d;
  return null;
end $$;
create trigger totaux after insert or update or delete on public.devis_ligne
  for each row execute function private.devis_totaux();

-- SÉCURITÉ : gardée par le pilotage sur Bureau, comme les autres modules fins.
alter table public.devis enable row level security;
alter table public.devis_ligne enable row level security;
revoke all on public.devis, public.devis_ligne from anon, authenticated;
grant select, insert, update, delete on public.devis to authenticated;         -- un devis brouillon peut être supprimé
grant select, insert, update, delete on public.devis_ligne to authenticated;    -- les lignes se modifient librement

create policy lire on public.devis for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'devis', 'bureau'));
create policy ecrire on public.devis for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'devis', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'devis', 'bureau'));

-- Une ligne suit les droits de son devis.
create policy lire on public.devis_ligne for select to authenticated
  using (exists (select 1 from public.devis d where d.id = devis_id
    and (select private.a_role(d.societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(d.societe_id, 'devis', 'bureau')));
create policy ecrire on public.devis_ligne for all to authenticated
  using (exists (select 1 from public.devis d where d.id = devis_id
    and (select private.a_role(d.societe_id, '{admin,gestion}')) and private.module_ouvert(d.societe_id, 'devis', 'bureau')))
  with check (exists (select 1 from public.devis d where d.id = devis_id
    and (select private.a_role(d.societe_id, '{admin,gestion}')) and private.module_ouvert(d.societe_id, 'devis', 'bureau')));

create trigger journal after insert or update or delete on public.devis for each row execute function private.journal();
