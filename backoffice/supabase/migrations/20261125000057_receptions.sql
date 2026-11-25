-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Réceptions » (catégorie Achats) : réception de marchandise d'un fournisseur.
-- Gardé par le pilotage sur Bureau. Interconnexion : si la réception porte sur un article, elle crée
-- automatiquement une ENTRÉE de stock (le stock de l'article monte tout seul).

create table public.reception (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  commande_fournisseur_id uuid references public.commande_fournisseur on delete set null,
  article_id uuid references public.articles on delete set null,
  article_libelle text not null check (length(trim(article_libelle)) between 1 and 200),
  quantite integer not null check (quantite > 0),
  date_reception date not null default current_date,
  fournisseur_nom text check (fournisseur_nom is null or length(fournisseur_nom) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index reception_societe_idx on public.reception (societe_id, date_reception);

create trigger horodatage before insert or update on public.reception
  for each row execute function private.poser_modif();

-- Une réception avec article crée une entrée de stock (le stock monte automatiquement).
create function private.reception_vers_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.article_id is not null then
    insert into public.mouvement_stock (societe_id, article_id, type, quantite, motif)
      values (new.societe_id, new.article_id, 'entree', new.quantite, 'réception du ' || to_char(new.date_reception, 'DD/MM/YYYY'));
  end if;
  return null;
end $$;
create trigger vers_stock after insert on public.reception
  for each row execute function private.reception_vers_stock();

alter table public.reception enable row level security;
revoke all on public.reception from anon, authenticated;
grant select, insert, update, delete on public.reception to authenticated;

create policy lire on public.reception for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'receptions', 'bureau'));
create policy ecrire on public.reception for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'receptions', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'receptions', 'bureau'));

create trigger journal after insert or update or delete on public.reception
  for each row execute function private.journal();
