-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Articles & tarifs » : le catalogue des produits/prestations d'une société.
-- N'existe que si le module « articles » est disponible ET allumé sur Bureau (garde private.module_ouvert).
-- Alimentera devis et factures. Les prix sont en centimes (entiers), la TVA au taux français.

-- Horodatage générique (auteur et date posés par le serveur), réutilisable par les futurs modules.
create function private.poser_modif() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.modifie_le := now();
  new.modifie_par := (select auth.uid());
  return new;
end $$;

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  reference text check (reference is null or reference ~ '^[A-Z0-9_-]{1,30}$'),
  libelle text not null check (length(trim(libelle)) between 1 and 120),
  ean13 text check (ean13 is null or ean13 ~ '^\d{13}$'),
  prix_ht_centimes integer not null default 0 check (prix_ht_centimes >= 0),
  taux_tva numeric(4,1) not null default 20 check (taux_tva in (0, 2.1, 5.5, 10, 20)),
  unite text check (unite is null or length(unite) <= 20),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index articles_societe_idx on public.articles (societe_id, actif);
-- Une référence ne se répète pas dans une société (quand elle est renseignée).
create unique index articles_reference_idx on public.articles (societe_id, reference) where reference is not null;

create trigger horodatage before insert or update on public.articles
  for each row execute function private.poser_modif();

alter table public.articles enable row level security;
revoke all on public.articles from anon, authenticated;
grant select, insert, update on public.articles to authenticated;   -- pas de delete : on désactive (actif = false)

create policy lire on public.articles for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}'))
    and private.module_ouvert(societe_id, 'articles', 'bureau'));

create policy ecrire on public.articles for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}'))
    and private.module_ouvert(societe_id, 'articles', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}'))
    and private.module_ouvert(societe_id, 'articles', 'bureau'));

create trigger journal after insert or update or delete on public.articles
  for each row execute function private.journal();
