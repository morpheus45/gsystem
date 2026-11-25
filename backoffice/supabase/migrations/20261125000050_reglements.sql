-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Règlements » : les encaissements reçus pour les factures clients. Gardé par le pilotage sur Bureau.
-- Interconnexion : quand le total réglé atteint le total TTC d'une facture, elle passe en « payée »
-- automatiquement (et revient en « émise » si un règlement est retiré). Une facture annulée n'est pas touchée.

create table public.reglement (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  facture_vente_id uuid references public.facture_vente on delete cascade,
  date_reglement date not null default current_date,
  montant_centimes integer not null check (montant_centimes > 0),
  mode text not null default 'virement' check (mode in ('virement', 'cheque', 'especes', 'cb', 'autre')),
  reference text check (reference is null or length(reference) <= 100),
  notes text check (notes is null or length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index reglement_societe_idx on public.reglement (societe_id, date_reglement);
create index reglement_facture_idx on public.reglement (facture_vente_id);

create trigger horodatage before insert or update on public.reglement
  for each row execute function private.poser_modif();

-- Solde automatique de la facture reliée.
create function private.reglement_solde() returns trigger
language plpgsql security definer set search_path = '' as $$
declare fv uuid := coalesce(new.facture_vente_id, old.facture_vente_id); paye int; tot int; st text;
begin
  if fv is null then return null; end if;
  select f.total_ttc_centimes, f.statut into tot, st from public.facture_vente f where f.id = fv;
  if st is null or st = 'annulee' then return null; end if;
  select coalesce(sum(r.montant_centimes), 0) into paye from public.reglement r where r.facture_vente_id = fv;
  if tot > 0 and paye >= tot and st <> 'payee' then
    update public.facture_vente set statut = 'payee' where id = fv;
  elsif paye < tot and st = 'payee' then
    update public.facture_vente set statut = 'emise' where id = fv;
  end if;
  return null;
end $$;
create trigger solde after insert or update or delete on public.reglement
  for each row execute function private.reglement_solde();

alter table public.reglement enable row level security;
revoke all on public.reglement from anon, authenticated;
grant select, insert, update, delete on public.reglement to authenticated;

create policy lire on public.reglement for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'reglements', 'bureau'));
create policy ecrire on public.reglement for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'reglements', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'reglements', 'bureau'));

create trigger journal after insert or update or delete on public.reglement
  for each row execute function private.journal();
