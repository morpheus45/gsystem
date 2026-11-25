-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Où un module sert : téléphone Android (apk), iPhone (iphone), back-office (bureau), réglable par holding
-- et par société. La ligne de la société l'emporte sur celle de sa holding. Rien n'est effacé ;
-- les attributions existantes restent en service sur les téléphones, comme avant.
alter table public.modules_perso_portee add column supports text[] not null default '{apk,iphone}'
  check (supports <@ '{apk,iphone,bureau}'::text[] and cardinality(supports) between 1 and 3);

drop function public.attribuer_module_perso(uuid, uuid, uuid, boolean);
create function public.attribuer_module_perso(id_module uuid, p_holding uuid, p_societe uuid, p_actif boolean,
  p_supports text[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare sup text[] := (select array_agg(distinct x order by x) from unnest(p_supports) x);
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if num_nonnulls(p_holding, p_societe) <> 1 then raise exception 'une holding OU une societe'; end if;
  if p_actif is null then
    delete from public.modules_perso_portee where module_id = id_module
      and holding_id is not distinct from p_holding and societe_id is not distinct from p_societe;
  elsif p_holding is not null then
    insert into public.modules_perso_portee (module_id, holding_id, actif, supports)
    values (id_module, p_holding, p_actif, coalesce(sup, '{apk,iphone}'))
    on conflict (module_id, holding_id) do update set actif = excluded.actif, supports = coalesce(sup, public.modules_perso_portee.supports);
  else
    insert into public.modules_perso_portee (module_id, societe_id, actif, supports)
    values (id_module, p_societe, p_actif, coalesce(sup, '{apk,iphone}'))
    on conflict (module_id, societe_id) do update set actif = excluded.actif, supports = coalesce(sup, public.modules_perso_portee.supports);
  end if;
end $$;

-- Le réglage qui s'applique à une société : le sien, sinon celui de sa holding.
create function private.module_sur(m uuid, s uuid, sup text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when ps.id is not null then ps.actif and sup = any(ps.supports)
                               else coalesce(ph.actif and sup = any(ph.supports), false) end
    from public.modules_perso mp
    join public.societes soc on soc.id = s
    left join public.modules_perso_portee ps on ps.module_id = m and ps.societe_id = s
    left join public.modules_perso_portee ph on ph.module_id = m and ph.holding_id = soc.holding_id
    where mp.id = m and mp.actif), false);
$$;
revoke execute on function private.module_sur from public;

drop function public.telephone_modules(text);
create function public.telephone_modules(p_jeton text, p_support text default 'apk')
returns table (id uuid, nom text, icone text, couleur text, finalite text, conservation_mois int, version int, champs jsonb)
language sql volatile security definer set search_path = '' as $$
  select m.id, m.nom, m.icone, m.couleur, m.finalite, m.conservation_mois, m.version, v.champs
  from public.telephone_verifier(p_jeton) t
  join public.modules_perso m on p_support in ('apk', 'iphone') and private.module_sur(m.id, t.societe_id, p_support)
  join public.modules_perso_versions v on v.module_id = m.id and v.version = m.version
  order by m.nom;
$$;

-- BACK-OFFICE : saisie faite au bureau pour un technicien. Mêmes règles, jamais de doublon ni de modification.
alter table public.saisies_modules add column saisie_par uuid;   -- vide = saisie du téléphone

create function public.modules_bureau(s uuid)
returns table (id uuid, nom text, icone text, couleur text, finalite text, conservation_mois int, version int, champs jsonb)
language sql stable security definer set search_path = '' as $$
  select m.id, m.nom, m.icone, m.couleur, m.finalite, m.conservation_mois, m.version, v.champs
  from public.modules_perso m
  join public.modules_perso_versions v on v.module_id = m.id and v.version = m.version
  where private.a_role(s, '{admin,gestion}') and private.module_sur(m.id, s, 'bureau')
  order by m.nom;
$$;

create function public.saisir_module_bureau(p_id uuid, s uuid, tech uuid, p_module uuid, p_version int, p_date date, p_valeurs jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare c jsonb; e public.saisies_modules;
begin
  if private.a_role(s, '{admin,gestion}') is not true then raise exception 'reserve a l''admin ou a la gestion'; end if;
  if not exists (select 1 from public.techniciens x where x.id = tech and x.societe_id = s) then raise exception 'technicien inconnu'; end if;
  if p_id is null then return 'contenu'; end if;
  select x.* into e from public.saisies_modules x where x.id = p_id;
  if e.id is not null then
    return case when e.societe_id = s and e.technicien_id = tech and e.module_id = p_module and e.version = p_version
                     and e.date = p_date and e.valeurs = p_valeurs then 'deja' else 'conflit' end;
  end if;
  if not private.module_sur(p_module, s, 'bureau') then return 'module'; end if;
  select v.champs into c from public.modules_perso_versions v where v.module_id = p_module and v.version = p_version;
  if c is null then return 'module'; end if;
  -- Photos et signatures : au téléphone seulement (elles restent dans le Drive du technicien).
  if exists (select 1 from jsonb_array_elements(c) f where f->>'type' in ('photo', 'signature') and p_valeurs ? (f->>'cle')) then return 'contenu'; end if;
  select jsonb_agg(case when f->>'type' in ('photo', 'signature') then jsonb_set(f, '{obligatoire}', 'false') else f end) into c
  from jsonb_array_elements(c) f;
  if p_date is null or p_date > current_date + 1 or p_date < current_date - 400
     or not private.valeurs_perso_valides(c, p_valeurs) then return 'contenu'; end if;
  insert into public.saisies_modules (id, societe_id, technicien_id, module_id, version, date, valeurs, saisie_par)
  values (p_id, s, tech, p_module, p_version, p_date, p_valeurs, (select auth.uid())) on conflict (id) do nothing;
  return case when found then 'ok' else 'conflit' end;
end $$;

revoke execute on function public.attribuer_module_perso, public.telephone_modules, public.modules_bureau,
  public.saisir_module_bureau from public, anon, authenticated;
grant execute on function public.attribuer_module_perso, public.modules_bureau, public.saisir_module_bureau to authenticated;
grant execute on function public.telephone_modules to service_role;
