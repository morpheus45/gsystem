-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Modules personnalisés (demande du 24/11/2026) : décrits par le super admin, attribués à une
-- holding ou à des sociétés. ÉTAPE 1 : définitions seulement — aucune donnée de l'APK n'est
-- lue ni modifiée, aucun téléphone ne lit encore ces tables.
-- Ne rien perdre : un module se désactive et ne s'efface pas ; chaque version est figée ;
-- un champ garde son type pour toujours (les anciennes saisies restent lisibles).

create table public.modules_perso (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(trim(nom)) between 2 and 40),
  icone text not null check (icone in ('outil', 'liste', 'photo', 'vehicule', 'alerte', 'document')),
  couleur text not null check (couleur ~ '^#[0-9a-f]{6}$'),
  finalite text not null check (length(trim(finalite)) between 10 and 300),   -- RGPD art. 5.1.b
  conservation_mois int not null check (conservation_mois between 1 and 120),  -- RGPD art. 5.1.e
  version int not null default 1 check (version > 0),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid
);

create table public.modules_perso_versions (
  module_id uuid not null references public.modules_perso,
  version int not null,
  champs jsonb not null,
  cree_le timestamptz not null default now(),
  primary key (module_id, version)
);

-- Attribution : une holding OU une société. La ligne de la société l'emporte sur celle de sa holding.
create table public.modules_perso_portee (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules_perso,
  holding_id uuid references public.holdings on delete cascade,
  societe_id uuid references public.societes on delete cascade,
  actif boolean not null default true,
  check (num_nonnulls(holding_id, societe_id) = 1),
  unique (module_id, holding_id),
  unique (module_id, societe_id)
);
create index modules_perso_portee_holding_idx on public.modules_perso_portee (holding_id);
create index modules_perso_portee_societe_idx on public.modules_perso_portee (societe_id);

create function private.champs_perso_valides(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare f jsonb; cles text[] := '{}';
begin
  if c is null or jsonb_typeof(c) <> 'array' or jsonb_array_length(c) not between 1 and 30 then return false; end if;
  for f in select * from jsonb_array_elements(c) loop
    if jsonb_typeof(f) <> 'object'
       or coalesce(f->>'cle', '') !~ '^[a-z][a-z0-9_]{0,39}$'
       or length(trim(coalesce(f->>'libelle', ''))) not between 1 and 60
       or coalesce(f->>'type', '') not in ('texte', 'nombre', 'date', 'case', 'liste', 'photo', 'signature')
       or coalesce(jsonb_typeof(f->'obligatoire'), '') <> 'boolean'
       or f->>'cle' = any(cles) then return false; end if;
    if f->>'type' = 'liste' then
      if coalesce(jsonb_typeof(f->'choix'), '') <> 'array' then return false; end if;
      if jsonb_array_length(f->'choix') not between 2 and 30
         or exists (select 1 from jsonb_array_elements(f->'choix') x
                    where jsonb_typeof(x) <> 'string' or length(trim(x#>>'{}')) not between 1 and 60) then return false; end if;
    elsif f ? 'choix' then return false; end if;
    cles := cles || (f->>'cle');
  end loop;
  return true;
end $$;
alter table public.modules_perso_versions add check (private.champs_perso_valides(champs));

create function private.module_perso_garde() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'module personnalise : % interdit (le desactiver a la place)', lower(tg_op);
end $$;
create trigger ineffacable before delete on public.modules_perso for each row execute function private.module_perso_garde();
create trigger invidable before truncate on public.modules_perso for each statement execute function private.module_perso_garde();
create trigger figee before update or delete on public.modules_perso_versions for each row execute function private.module_perso_garde();
create trigger invidable before truncate on public.modules_perso_versions for each statement execute function private.module_perso_garde();

-- Journal : audit.societe_id est obligatoire ; comme pour les holdings, on y met l'identifiant de l'objet.
create function private.journal_module_perso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values (coalesce(r->>'societe_id', r->>'module_id', r->>'id')::uuid, tg_table_name,
          coalesce(r->>'id', r->>'module_id'), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end, (select auth.uid()));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['modules_perso', 'modules_perso_versions', 'modules_perso_portee'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);   -- écriture : par les fonctions seulement
    execute format('create policy lire on public.%I for select to authenticated using ((select private.est_super_admin()))', t);
    execute format('create trigger journal after insert or update or delete on public.%I
      for each row execute function private.journal_module_perso()', t);
  end loop;
end $$;

-- Créer (id vide) ou modifier un module. Des champs différents = une nouvelle version.
create function public.enregistrer_module_perso(id_module uuid, p_nom text, p_icone text, p_couleur text,
  p_finalite text, p_conservation int, p_champs jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m uuid := id_module; v int; actuels jsonb;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if not private.champs_perso_valides(p_champs) then raise exception 'champs du module invalides'; end if;
  if m is null then
    insert into public.modules_perso (nom, icone, couleur, finalite, conservation_mois, modifie_par)
    values (trim(p_nom), p_icone, lower(p_couleur), trim(p_finalite), p_conservation, (select auth.uid())) returning id into m;
    insert into public.modules_perso_versions (module_id, version, champs) values (m, 1, p_champs);
    return m;
  end if;
  select version into v from public.modules_perso where id = m for update;
  if v is null then raise exception 'module inconnu'; end if;
  if exists (select 1 from public.modules_perso_versions x, jsonb_array_elements(x.champs) a, jsonb_array_elements(p_champs) b
             where x.module_id = m and a->>'cle' = b->>'cle' and a->>'type' <> b->>'type') then
    raise exception 'un champ ne peut pas changer de type : creez un nouveau champ';
  end if;
  select champs into actuels from public.modules_perso_versions where module_id = m and version = v;
  if actuels is distinct from p_champs then
    v := v + 1;
    insert into public.modules_perso_versions (module_id, version, champs) values (m, v, p_champs);
  end if;
  update public.modules_perso set nom = trim(p_nom), icone = p_icone, couleur = lower(p_couleur), finalite = trim(p_finalite),
    conservation_mois = p_conservation, version = v, modifie_le = now(), modifie_par = (select auth.uid()) where id = m;
  return m;
end $$;

create function public.activer_module_perso(id_module uuid, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  update public.modules_perso set actif = p_actif, modifie_le = now(), modifie_par = (select auth.uid()) where id = id_module;
  if not found then raise exception 'module inconnu'; end if;
end $$;

-- p_actif vide = retirer le réglage (la société suit de nouveau sa holding).
create function public.attribuer_module_perso(id_module uuid, p_holding uuid, p_societe uuid, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if num_nonnulls(p_holding, p_societe) <> 1 then raise exception 'une holding OU une societe'; end if;
  if p_actif is null then
    delete from public.modules_perso_portee where module_id = id_module
      and holding_id is not distinct from p_holding and societe_id is not distinct from p_societe;
  elsif p_holding is not null then
    insert into public.modules_perso_portee (module_id, holding_id, actif) values (id_module, p_holding, p_actif)
    on conflict (module_id, holding_id) do update set actif = excluded.actif;
  else
    insert into public.modules_perso_portee (module_id, societe_id, actif) values (id_module, p_societe, p_actif)
    on conflict (module_id, societe_id) do update set actif = excluded.actif;
  end if;
end $$;

-- Modules en service pour une société (ses membres seulement).
create function public.modules_perso_de(s uuid)
returns table (id uuid, nom text, icone text, couleur text, finalite text, version int, champs jsonb)
language sql stable security definer set search_path = '' as $$
  select m.id, m.nom, m.icone, m.couleur, m.finalite, m.version, v.champs
  from public.modules_perso m
  join public.modules_perso_versions v on v.module_id = m.id and v.version = m.version
  join public.societes soc on soc.id = s
  left join public.modules_perso_portee ps on ps.module_id = m.id and ps.societe_id = s
  left join public.modules_perso_portee ph on ph.module_id = m.id and ph.holding_id = soc.holding_id
  where m.actif and coalesce(ps.actif, ph.actif, false)
    and private.a_role(s, '{admin,gestion,comptable,lecture}')
  order by m.nom;
$$;

revoke execute on function public.enregistrer_module_perso, public.activer_module_perso,
  public.attribuer_module_perso, public.modules_perso_de from public, anon;
grant execute on function public.enregistrer_module_perso, public.activer_module_perso,
  public.attribuer_module_perso, public.modules_perso_de to authenticated;
