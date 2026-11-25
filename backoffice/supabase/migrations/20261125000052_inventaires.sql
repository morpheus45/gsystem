-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Module « Inventaires » : un comptage fige le stock théorique de chaque article, on saisit le compté,
-- l'écart se calcule, et à la clôture le stock s'ajuste (un mouvement par écart). Gardé par le pilotage sur Bureau.

create table public.inventaire (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  date_inventaire date not null default current_date,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'clos')),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users
);
create index inventaire_societe_idx on public.inventaire (societe_id, date_inventaire);
create trigger horodatage before insert or update on public.inventaire
  for each row execute function private.poser_modif();

create table public.inventaire_ligne (
  id uuid primary key default gen_random_uuid(),
  inventaire_id uuid not null references public.inventaire on delete cascade,
  article_id uuid references public.articles on delete set null,
  libelle text not null,
  quantite_theorique integer not null default 0,
  quantite_comptee integer not null default 0 check (quantite_comptee >= 0),
  ecart integer not null default 0,
  rang integer not null default 0
);
create index inventaire_ligne_idx on public.inventaire_ligne (inventaire_id, rang);

-- L'écart = compté - théorique, posé par la base.
create function private.inventaire_ecart() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.ecart := new.quantite_comptee - new.quantite_theorique;
  return new;
end $$;
create trigger ecart before insert or update on public.inventaire_ligne
  for each row execute function private.inventaire_ecart();

-- Stock net d'un article (somme des mouvements).
create function private.stock_net(a uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when m.type = 'entree' then m.quantite else -m.quantite end), 0)::int
  from public.mouvement_stock m where m.article_id = a;
$$;

-- Crée un inventaire et fige une ligne par article actif (théorique = stock net, compté = théorique au départ).
create function public.creer_inventaire(s uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv uuid;
begin
  if not (private.est_super_admin() or (select private.a_role(s, '{admin,gestion}'))) then raise exception 'reserve a l''administration'; end if;
  if not private.module_ouvert(s, 'inventaires', 'bureau') then raise exception 'module inventaires non actif'; end if;
  insert into public.inventaire (societe_id) values (s) returning id into inv;
  insert into public.inventaire_ligne (inventaire_id, article_id, libelle, quantite_theorique, quantite_comptee, rang)
    select inv, a.id, a.libelle, private.stock_net(a.id), private.stock_net(a.id), row_number() over (order by a.libelle)
    from public.articles a where a.societe_id = s and a.actif;
  return inv;
end $$;

-- Clôture : ajuste le stock selon les écarts (un mouvement par article), puis verrouille l'inventaire.
create function public.cloturer_inventaire(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s uuid; st text;
begin
  select i.societe_id, i.statut into s, st from public.inventaire i where i.id = p_id;
  if s is null then raise exception 'inventaire inconnu'; end if;
  if not (private.est_super_admin() or (select private.a_role(s, '{admin,gestion}'))) then raise exception 'reserve a l''administration'; end if;
  if not private.module_ouvert(s, 'inventaires', 'bureau') then raise exception 'module inventaires non actif'; end if;
  if st = 'clos' then raise exception 'inventaire deja clos'; end if;
  insert into public.mouvement_stock (societe_id, article_id, type, quantite, motif)
    select s, l.article_id, case when l.ecart > 0 then 'entree' else 'sortie' end, abs(l.ecart), 'inventaire du ' || current_date
    from public.inventaire_ligne l where l.inventaire_id = p_id and l.ecart <> 0 and l.article_id is not null;
  update public.inventaire set statut = 'clos' where id = p_id;
end $$;

alter table public.inventaire enable row level security;
alter table public.inventaire_ligne enable row level security;
revoke all on public.inventaire, public.inventaire_ligne from anon, authenticated;
grant select, insert, update, delete on public.inventaire to authenticated;
grant select, insert, update, delete on public.inventaire_ligne to authenticated;

create policy lire on public.inventaire for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(societe_id, 'inventaires', 'bureau'));
create policy ecrire on public.inventaire for all to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'inventaires', 'bureau'))
  with check ((select private.a_role(societe_id, '{admin,gestion}')) and private.module_ouvert(societe_id, 'inventaires', 'bureau'));

create policy lire on public.inventaire_ligne for select to authenticated
  using (exists (select 1 from public.inventaire i where i.id = inventaire_id
    and (select private.a_role(i.societe_id, '{admin,gestion,comptable,lecture}')) and private.module_ouvert(i.societe_id, 'inventaires', 'bureau')));
create policy ecrire on public.inventaire_ligne for all to authenticated
  using (exists (select 1 from public.inventaire i where i.id = inventaire_id
    and (select private.a_role(i.societe_id, '{admin,gestion}')) and private.module_ouvert(i.societe_id, 'inventaires', 'bureau')))
  with check (exists (select 1 from public.inventaire i where i.id = inventaire_id
    and (select private.a_role(i.societe_id, '{admin,gestion}')) and private.module_ouvert(i.societe_id, 'inventaires', 'bureau')));

create trigger journal after insert or update or delete on public.inventaire for each row execute function private.journal();

revoke execute on function public.creer_inventaire, public.cloturer_inventaire from public, anon, authenticated;
grant execute on function public.creer_inventaire, public.cloturer_inventaire to authenticated;
