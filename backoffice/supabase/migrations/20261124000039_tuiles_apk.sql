-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Tuiles d'origine de l'APK, visibles ou cachées par holding et par société. Sans réglage : toutes visibles,
-- comme avant. Cacher une tuile n'efface rien. La clôture et l'envoi mensuel ne se cachent jamais
-- (remplissage de la feuille de temps) : ils ne sont pas dans la liste.
create table public.tuiles_reglages (
  id uuid primary key default gen_random_uuid(),
  tuile text not null check (tuile in ('arrivee', 'attente', 'techline', 'logistique', 'courrier', 'pv_cameras',
    'bulletin', 'brouillard', 'recap', 'frais', 'prime', 'conge')),
  holding_id uuid references public.holdings on delete cascade,
  societe_id uuid references public.societes on delete cascade,
  visible boolean not null,
  check (num_nonnulls(holding_id, societe_id) = 1),
  unique (tuile, holding_id),
  unique (tuile, societe_id)
);
create index tuiles_reglages_holding_idx on public.tuiles_reglages (holding_id);
create index tuiles_reglages_societe_idx on public.tuiles_reglages (societe_id);
alter table public.tuiles_reglages enable row level security;
revoke all on public.tuiles_reglages from anon, authenticated;
grant select on public.tuiles_reglages to authenticated;
create policy lire on public.tuiles_reglages for select to authenticated using ((select private.est_super_admin()));

create function private.journal_tuile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then return new; end if;
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values (coalesce(r->>'societe_id', r->>'holding_id')::uuid, tg_table_name, r->>'id', tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end, (select auth.uid()));
  return coalesce(new, old);
end $$;
create trigger journal after insert or update or delete on public.tuiles_reglages
  for each row execute function private.journal_tuile();

-- p_visible vide = retirer le réglage (la société suit de nouveau sa holding, ou tout est visible).
create function public.regler_tuile(p_tuile text, p_holding uuid, p_societe uuid, p_visible boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if num_nonnulls(p_holding, p_societe) <> 1 then raise exception 'une holding OU une societe'; end if;
  if p_visible is null then
    delete from public.tuiles_reglages where tuile = p_tuile
      and holding_id is not distinct from p_holding and societe_id is not distinct from p_societe;
  elsif p_holding is not null then
    insert into public.tuiles_reglages (tuile, holding_id, visible) values (p_tuile, p_holding, p_visible)
    on conflict (tuile, holding_id) do update set visible = excluded.visible;
  else
    insert into public.tuiles_reglages (tuile, societe_id, visible) values (p_tuile, p_societe, p_visible)
    on conflict (tuile, societe_id) do update set visible = excluded.visible;
  end if;
end $$;

-- PASSERELLE : tuiles cachées pour ce téléphone. Vide (null) = jeton refusé : le téléphone ne change rien.
create function public.telephone_tuiles(p_jeton text) returns text[]
language sql volatile security definer set search_path = '' as $$
  select coalesce((select array_agg(x.tuile order by x.tuile) from (
      select distinct on (r.tuile) r.tuile, r.visible from public.tuiles_reglages r
      join public.societes soc on soc.id = t.societe_id
      where r.societe_id = soc.id or r.holding_id = soc.holding_id
      order by r.tuile, (r.societe_id is not null) desc) x
    where not x.visible), '{}')
  from public.telephone_verifier(p_jeton) t;
$$;
revoke execute on function private.journal_tuile from public;
revoke execute on function public.regler_tuile, public.telephone_tuiles from public, anon, authenticated;
grant execute on function public.regler_tuile to authenticated;
grant execute on function public.telephone_tuiles to service_role;
