-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Saisies des modules personnalisés, faites sur le téléphone du technicien (suite de la migration 32).
-- Ne rien perdre : une saisie reçue ne se modifie pas et ne s'efface pas (sauf purge légale, durée du module) ;
-- une saisie faite hors réseau est acceptée même si le module a été désactivé ou modifié entre-temps ;
-- le même envoi répété ne crée jamais de doublon. Le technicien vient du jeton, jamais de ce que le téléphone écrit.
-- Les photos restent dans le dossier Drive du technicien : ici, seulement leur nom de fichier.

create table public.saisies_modules (
  id uuid primary key,                    -- créé par le téléphone : renvoyer deux fois la même saisie ne la double pas
  societe_id uuid not null,
  technicien_id uuid not null,
  module_id uuid not null,
  version int not null,
  date date not null,
  valeurs jsonb not null,
  recu_le timestamptz not null default now(),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id),
  foreign key (module_id, version) references public.modules_perso_versions (module_id, version)
);
create index saisies_modules_idx on public.saisies_modules (societe_id, module_id, date);
create index saisies_modules_tech_idx on public.saisies_modules (societe_id, technicien_id);
create index saisies_modules_version_idx on public.saisies_modules (module_id, version);

-- Les valeurs suivent exactement les champs de la version remplie.
create function private.valeurs_perso_valides(champs jsonb, v jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare f jsonb; x jsonb; s text;
begin
  if v is null or jsonb_typeof(v) <> 'object' or length(v::text) > 60000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(v) k
             where not exists (select 1 from jsonb_array_elements(champs) c where c->>'cle' = k)) then return false; end if;
  for f in select * from jsonb_array_elements(champs) loop
    x := v->(f->>'cle');
    if x is null or x = 'null'::jsonb then
      if (f->>'obligatoire')::boolean then return false; end if;
      continue;
    end if;
    s := x#>>'{}';
    case f->>'type'
      when 'case' then if jsonb_typeof(x) <> 'boolean' then return false; end if;
      when 'nombre' then if jsonb_typeof(x) <> 'number' then return false; end if;
      else
        if jsonb_typeof(x) <> 'string' then return false; end if;
        if (f->>'obligatoire')::boolean and trim(s) = '' then return false; end if;
        if f->>'type' = 'texte' and length(s) > 2000 then return false; end if;
        if f->>'type' = 'liste' and s <> '' and not (f->'choix') ? s then return false; end if;
        if f->>'type' = 'date' and s <> '' then
          if s !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
          begin perform s::date; exception when others then return false; end;
        end if;
        if f->>'type' in ('photo', 'signature') and s <> '' and s !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' then return false; end if;
    end case;
  end loop;
  return true;
end $$;

create function private.saisie_figee() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'saisie deja recue : modification interdite';
end $$;

alter table public.saisies_modules enable row level security;
revoke all on public.saisies_modules from anon, authenticated;
grant select on public.saisies_modules to authenticated;
create policy lire on public.saisies_modules for select to authenticated using ((select private.a_role(societe_id, '{admin,gestion}')));
create trigger figee before update on public.saisies_modules for each row execute function private.saisie_figee();
create trigger journal after insert or delete on public.saisies_modules for each row execute function private.journal_masque();
create trigger effacement_interdit before delete on public.saisies_modules for each row execute function private.interdire_effacement();
create trigger vidage_interdit before truncate on public.saisies_modules for each statement execute function private.interdire_effacement();

-- PASSERELLE (service_role) ---------------------------------------------------------------------------
-- Modules en service pour la société du téléphone. Jeton refusé : aucune ligne.
create function public.telephone_modules(p_jeton text)
returns table (id uuid, nom text, icone text, couleur text, finalite text, conservation_mois int, version int, champs jsonb)
language sql volatile security definer set search_path = '' as $$
  select m.id, m.nom, m.icone, m.couleur, m.finalite, m.conservation_mois, m.version, v.champs
  from public.telephone_verifier(p_jeton) t
  join public.societes soc on soc.id = t.societe_id
  join public.modules_perso m on m.actif
  join public.modules_perso_versions v on v.module_id = m.id and v.version = m.version
  left join public.modules_perso_portee ps on ps.module_id = m.id and ps.societe_id = soc.id
  left join public.modules_perso_portee ph on ph.module_id = m.id and ph.holding_id = soc.holding_id
  where coalesce(ps.actif, ph.actif, false)
  order by m.nom;
$$;

-- 'ok' = enregistrée, 'deja' = la même était déjà là ; tout le reste = le téléphone garde sa saisie.
create function public.telephone_saisie(p_jeton text, p_id uuid, p_module uuid, p_version int, p_date date, p_valeurs jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare t record; c jsonb; e public.saisies_modules;
begin
  select * into t from public.telephone_verifier(p_jeton);
  if t.technicien_id is null then return 'jeton'; end if;
  if p_id is null then return 'contenu'; end if;
  select x.* into e from public.saisies_modules x where x.id = p_id;
  if e.id is not null then
    return case when e.technicien_id = t.technicien_id and e.module_id = p_module and e.version = p_version
                     and e.date = p_date and e.valeurs = p_valeurs then 'deja' else 'conflit' end;
  end if;
  -- Attribué à cette société ou à sa holding, même si désactivé depuis.
  if not exists (select 1 from public.modules_perso_portee p join public.societes soc on soc.id = t.societe_id
                 where p.module_id = p_module and (p.societe_id = soc.id or p.holding_id = soc.holding_id)) then return 'module'; end if;
  select v.champs into c from public.modules_perso_versions v where v.module_id = p_module and v.version = p_version;
  if c is null then return 'module'; end if;
  if p_date is null or p_date > current_date + 1 or p_date < current_date - 400
     or not private.valeurs_perso_valides(c, p_valeurs) then return 'contenu'; end if;
  insert into public.saisies_modules (id, societe_id, technicien_id, module_id, version, date, valeurs)
  values (p_id, t.societe_id, t.technicien_id, p_module, p_version, p_date, p_valeurs) on conflict (id) do nothing;
  return case when found then 'ok' else 'conflit' end;   -- même saisie au même instant : le prochain essai dira « deja »
end $$;

revoke execute on function private.valeurs_perso_valides, private.saisie_figee from public;
revoke execute on function public.telephone_modules, public.telephone_saisie from public, anon, authenticated;
grant execute on function public.telephone_modules, public.telephone_saisie to service_role;

-- PURGE LÉGALE ------------------------------------------------------------------------------------------
insert into public.durees_conservation values ('saisies_modules', 10,
  'Saisies des modules personnalisés : la durée fixée sur chaque module (1 à 120 mois) s''applique (RGPD art. 5.1.e).');

create or replace function private.expire(t text, r jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case when t = 'saisies_modules' then d + make_interval(months =>
                         (select m.conservation_mois from public.modules_perso m where m.id = (r->>'module_id')::uuid)) < current_date
                       when t in ('techniciens', 'permis_conduire', 'secu_sociale', 'documents_tech')
                         then d + make_interval(years => coalesce(
                           (select k.conservation_annees from public.documents_types k where t = 'documents_tech' and k.code = r->>'type'), c.annees)) < current_date
                       else make_date(extract(year from d)::int + c.annees, 12, 31) < current_date end, false)
  from public.durees_conservation c, (select private.date_conservation(t, r) as d) x
  where c.table_nom = t;
$$;

-- Mêmes fonctions qu'avant, avec la nouvelle table en plus ; journal masqué sans le contenu des saisies.
do $$
declare f text; avant text; apres text;
begin
  foreach f in array array['private.tech_purgeable(uuid,uuid)', 'public.apercu_purge(uuid)', 'public.purger_donnees(uuid,text)', 'private.journal_masque()'] loop
    avant := pg_get_functiondef(f::regprocedure);
    apres := replace(replace(avant, '''documents_tech'']', '''documents_tech'',''saisies_modules'']'), '''scan'', ''fichier'']', '''scan'', ''fichier'', ''valeurs'']');
    if apres = avant then raise exception 'definition inattendue : %', f; end if;
    execute apres;
  end loop;
end $$;
