-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Factures » (ventes) : jumeau de Devis. Tables nommées facture_vente / facture_vente_ligne
-- car `factures` et `facture_ligne` sont déjà pris par le module Facturation d'origine.
-- En-tête (client, numéro FAC, échéance, statut) + lignes, totaux recalculés par la base.
-- Gardé par le pilotage sur Bureau. Les montants de ligne réutilisent private.devis_ligne_montants().

create table public.facture_vente (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  numero text,
  tiers_id uuid references public.tiers on delete set null,
  devis_id uuid references public.devis on delete set null,     -- facture issue d'un devis (optionnel)
  client_nom text not null check (length(trim(client_nom)) between 1 and 200),
  date_facture date not null default current_date,
  date_echeance date,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'emise', 'payee', 'annulee')),
  total_ht_centimes integer not null default 0,
  total_tva_centimes integer not null default 0,
  total_ttc_centimes integer not null default 0,
  notes text check (notes is null or length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users,
  unique (societe_id, numero)
);
create index facture_vente_societe_idx on public.facture_vente (societe_id, date_facture);

create function private.facture_vente_numero() returns trigger
language plpgsql set search_path = '' as $$
declare seq int;
begin
  if new.numero is null then
    select coalesce(max(substring(f.numero from '[0-9]+$')::int), 0) + 1 into seq
      from public.facture_vente f
      where f.societe_id = new.societe_id and f.numero like 'FAC-' || to_char(new.date_facture, 'YYYY') || '-%';
    new.numero := 'FAC-' || to_char(new.date_facture, 'YYYY') || '-' || lpad(seq::text, 5, '0');
  end if;
  new.modifie_le := now();
  new.modifie_par := (select auth.uid());
  return new;
end $$;
create trigger numero before insert or update on public.facture_vente
  for each row execute function private.facture_vente_numero();

create table public.facture_vente_ligne (
  id uuid primary key default gen_random_uuid(),
  facture_vente_id uuid not null references public.facture_vente on delete cascade,
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
create index facture_vente_ligne_idx on public.facture_vente_ligne (facture_vente_id, rang);

-- Montants de ligne : même fonction que les devis (elle ne touche que les colonnes de la ligne).
create trigger montants before insert or update on public.facture_vente_ligne
  for each row execute function private.devis_ligne_montants();

create function private.facture_vente_totaux() returns trigger
language plpgsql set search_path = '' as $$
declare f uuid := coalesce(new.facture_vente_id, old.facture_vente_id);
begin
  update public.facture_vente x set
    total_ht_centimes = coalesce((select sum(l.ht_centimes) from public.facture_vente_ligne l where l.facture_vente_id = f), 0),
    total_tva_centimes = coalesce((select sum(l.tva_centimes) from public.facture_vente_ligne l where l.facture_vente_id = f), 0),
    total_ttc_centimes = coalesce((select sum(l.ttc_centimes) from public.facture_vente_ligne l where l.facture_vente_id = f), 0)
  where x.id = f;
  return null;
end $$;
create trigger totaux after insert or update or delete on public.facture_vente_ligne
  for each row execute function private.facture_vente_totaux();

alter table public.facture_vente enable row level security;
alter table public.facture_vente_ligne enable row level security;
revoke all on public.facture_vente, public.facture_vente_ligne from anon, authenticated;
grant select, insert, update, delete on public.facture_vente to authenticated;
grant select, insert, update, delete on public.facture_vente_ligne to authenticated;

create policy lire on public.facture_vente for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'factures', 'bureau'));
create policy ecrire on public.facture_vente for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'factures', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'factures', 'bureau'));

create policy lire on public.facture_vente_ligne for select to authenticated
  using (exists (select 1 from public.facture_vente f where f.id = facture_vente_id
    and (select private.a_role(f.societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(f.societe_id, 'factures', 'bureau')));
create policy ecrire on public.facture_vente_ligne for all to authenticated
  using (exists (select 1 from public.facture_vente f where f.id = facture_vente_id
    and (select private.a_role(f.societe_id, '{admin,gestion}')) and private.module_ouvert(f.societe_id, 'factures', 'bureau')))
  with check (exists (select 1 from public.facture_vente f where f.id = facture_vente_id
    and (select private.a_role(f.societe_id, '{admin,gestion}')) and private.module_ouvert(f.societe_id, 'factures', 'bureau')));

create trigger journal after insert or update or delete on public.facture_vente for each row execute function private.journal();
