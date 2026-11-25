-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Lots & péremption » : les lots d'un article avec leur DLUO (date de péremption).
-- Gardé par le pilotage sur Bureau. Le statut (bon / proche / périmé) est calculé à l'affichage
-- par le cœur core/peremption, à partir de la DLUO et d'un seuil d'alerte.

create table public.lot (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  article_id uuid not null references public.articles on delete cascade,
  numero_lot text check (numero_lot is null or length(numero_lot) <= 60),
  dluo date not null,
  quantite integer not null default 0 check (quantite >= 0),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index lot_societe_idx on public.lot (societe_id, dluo);
create index lot_article_idx on public.lot (article_id);

create trigger horodatage before insert or update on public.lot
  for each row execute function private.poser_modif();

alter table public.lot enable row level security;
revoke all on public.lot from anon, authenticated;
grant select, insert, update, delete on public.lot to authenticated;

create policy lire on public.lot for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'peremption', 'bureau'));
create policy ecrire on public.lot for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'peremption', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'peremption', 'bureau'));

create trigger journal after insert or update or delete on public.lot
  for each row execute function private.journal();
