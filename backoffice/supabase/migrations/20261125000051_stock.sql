-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Gestion de stock » : mouvements d'entrée/sortie par article, stock courant calculé.
-- Gardé par le pilotage sur Bureau. Interconnexion : un mouvement porte sur un article (module Articles).
-- Une sortie ne peut pas rendre le stock négatif (vérifié par la base).

create table public.mouvement_stock (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  article_id uuid not null references public.articles on delete cascade,
  type text not null check (type in ('entree', 'sortie')),
  quantite integer not null check (quantite > 0),
  date_mouvement date not null default current_date,
  motif text check (motif is null or length(motif) <= 200),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index mouvement_stock_idx on public.mouvement_stock (societe_id, article_id, date_mouvement);

create trigger horodatage before insert or update on public.mouvement_stock
  for each row execute function private.poser_modif();

-- Une sortie ne peut pas faire passer le stock de l'article sous zéro.
create function private.stock_garde() returns trigger
language plpgsql set search_path = '' as $$
declare dispo int;
begin
  if new.type = 'sortie' then
    select coalesce(sum(case when m.type = 'entree' then m.quantite else -m.quantite end), 0) into dispo
      from public.mouvement_stock m where m.article_id = new.article_id and m.id <> new.id;
    if dispo - new.quantite < 0 then raise exception 'stock insuffisant pour cette sortie (disponible : %)', dispo; end if;
  end if;
  return new;
end $$;
create trigger garde before insert or update on public.mouvement_stock
  for each row execute function private.stock_garde();

alter table public.mouvement_stock enable row level security;
revoke all on public.mouvement_stock from anon, authenticated;
grant select, insert, update, delete on public.mouvement_stock to authenticated;

create policy lire on public.mouvement_stock for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'stock', 'bureau'));
create policy ecrire on public.mouvement_stock for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'stock', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'stock', 'bureau'));

create trigger journal after insert or update or delete on public.mouvement_stock
  for each row execute function private.journal();

-- Stock courant par article (tous les articles actifs, 0 s'ils n'ont aucun mouvement).
create function public.stock_courant(s uuid)
returns table (article_id uuid, libelle text, quantite integer)
language sql stable security definer set search_path = '' as $$
  select a.id, a.libelle,
    coalesce(sum(case when m.type = 'entree' then m.quantite else -m.quantite end), 0)::int as quantite
  from public.articles a
  left join public.mouvement_stock m on m.article_id = a.id
  where a.societe_id = s and a.actif
    and (private.est_super_admin() or (select private.a_role(s, '{admin,gestion,comptable,lecture}')))
    and private.module_ouvert(s, 'stock', 'bureau')
  group by a.id, a.libelle
  order by a.libelle;
$$;
revoke execute on function public.stock_courant from public, anon, authenticated;
grant execute on function public.stock_courant to authenticated;
