-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Commandes fournisseurs » (catégorie Achats) : bon de commande vers un fournisseur,
-- en-tête + lignes d'articles, numéro CMF, totaux recalculés par la base (comme core/montants).
-- Gardé par le pilotage sur Bureau. Les montants de ligne réutilisent private.devis_ligne_montants().

create table public.commande_fournisseur (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  numero text,
  fournisseur_id uuid references public.fournisseur on delete set null,
  fournisseur_nom text not null check (length(trim(fournisseur_nom)) between 1 and 200),
  date_commande date not null default current_date,
  date_livraison_prevue date,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoyee', 'recue', 'annulee')),
  total_ht_centimes integer not null default 0,
  total_tva_centimes integer not null default 0,
  total_ttc_centimes integer not null default 0,
  notes text check (notes is null or length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users,
  unique (societe_id, numero)
);
create index commande_fournisseur_idx on public.commande_fournisseur (societe_id, date_commande);

create function private.commande_fournisseur_numero() returns trigger
language plpgsql set search_path = '' as $$
declare seq int;
begin
  if new.numero is null then
    select coalesce(max(substring(c.numero from '[0-9]+$')::int), 0) + 1 into seq
      from public.commande_fournisseur c
      where c.societe_id = new.societe_id and c.numero like 'CMF-' || to_char(new.date_commande, 'YYYY') || '-%';
    new.numero := 'CMF-' || to_char(new.date_commande, 'YYYY') || '-' || lpad(seq::text, 5, '0');
  end if;
  new.modifie_le := now();
  new.modifie_par := (select auth.uid());
  return new;
end $$;
create trigger numero before insert or update on public.commande_fournisseur
  for each row execute function private.commande_fournisseur_numero();

create table public.commande_fournisseur_ligne (
  id uuid primary key default gen_random_uuid(),
  commande_fournisseur_id uuid not null references public.commande_fournisseur on delete cascade,
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
create index commande_fournisseur_ligne_idx on public.commande_fournisseur_ligne (commande_fournisseur_id, rang);

create trigger montants before insert or update on public.commande_fournisseur_ligne
  for each row execute function private.devis_ligne_montants();

create function private.commande_fournisseur_totaux() returns trigger
language plpgsql set search_path = '' as $$
declare c uuid := coalesce(new.commande_fournisseur_id, old.commande_fournisseur_id);
begin
  update public.commande_fournisseur x set
    total_ht_centimes = coalesce((select sum(l.ht_centimes) from public.commande_fournisseur_ligne l where l.commande_fournisseur_id = c), 0),
    total_tva_centimes = coalesce((select sum(l.tva_centimes) from public.commande_fournisseur_ligne l where l.commande_fournisseur_id = c), 0),
    total_ttc_centimes = coalesce((select sum(l.ttc_centimes) from public.commande_fournisseur_ligne l where l.commande_fournisseur_id = c), 0)
  where x.id = c;
  return null;
end $$;
create trigger totaux after insert or update or delete on public.commande_fournisseur_ligne
  for each row execute function private.commande_fournisseur_totaux();

alter table public.commande_fournisseur enable row level security;
alter table public.commande_fournisseur_ligne enable row level security;
revoke all on public.commande_fournisseur, public.commande_fournisseur_ligne from anon, authenticated;
grant select, insert, update, delete on public.commande_fournisseur to authenticated;
grant select, insert, update, delete on public.commande_fournisseur_ligne to authenticated;

create policy lire on public.commande_fournisseur for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'achats', 'bureau'));
create policy ecrire on public.commande_fournisseur for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'achats', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'achats', 'bureau'));

create policy lire on public.commande_fournisseur_ligne for select to authenticated
  using (exists (select 1 from public.commande_fournisseur c where c.id = commande_fournisseur_id
    and (select private.a_role(c.societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(c.societe_id, 'achats', 'bureau')));
create policy ecrire on public.commande_fournisseur_ligne for all to authenticated
  using (exists (select 1 from public.commande_fournisseur c where c.id = commande_fournisseur_id
    and (select private.a_role(c.societe_id, '{admin,gestion}')) and private.module_ouvert(c.societe_id, 'achats', 'bureau')))
  with check (exists (select 1 from public.commande_fournisseur c where c.id = commande_fournisseur_id
    and (select private.a_role(c.societe_id, '{admin,gestion}')) and private.module_ouvert(c.societe_id, 'achats', 'bureau')));

create trigger journal after insert or update or delete on public.commande_fournisseur for each row execute function private.journal();
