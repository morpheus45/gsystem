-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Documents d'embauche du technicien (demande du 24/11/2026), pour toutes les sociétés et holdings.
-- RGPD art. 5 et 10 : le casier judiciaire n'est JAMAIS conservé (mention « vu le » seulement) ; le solde
-- de points n'existe pas ici (Code de la route L223-7) : on note la validité du permis, à date.
-- accès 'rh' : admin, gestion ; accès 'paie' : en plus le comptable. Jamais la lecture seule.

create table public.documents_types (
  code text primary key check (code ~ '^[a-z_]{2,30}$'),
  libelle text not null,
  aide text not null default '',
  acces text not null check (acces in ('rh', 'paie')),
  copie boolean not null,                 -- false : aucune copie gardée, la base la refuse
  expire boolean not null default false,  -- date d'expiration demandée
  rappel_mois int,                        -- contrôle à refaire après tant de mois
  exige text not null check (exige in ('obligatoire', 'facultatif')),
  conservation_annees int not null check (conservation_annees > 0),   -- après le départ, À VÉRIFIER
  ordre int not null
);
insert into public.documents_types values
  ('identite', 'Pièce d''identité', 'Carte d''identité ou passeport.', 'rh', true, true, null, 'obligatoire', 5, 10),
  ('sejour', 'Titre de séjour et de travail', 'Seulement si nécessaire.', 'rh', true, true, null, 'facultatif', 5, 20),
  ('permis_verso', 'Permis de conduire : verso', 'Le recto et le numéro sont dans le bloc Permis.', 'rh', true, false, null, 'facultatif', 1, 30),
  ('permis_valide', 'Validité du permis vérifiée', 'Relevé restreint (sans points) montré par le salarié. Ne jamais noter le solde de points.', 'rh', false, false, 6, 'obligatoire', 1, 40),
  ('vitale', 'Attestation de droits (sécurité sociale)', 'Plutôt que la carte Vitale.', 'paie', true, false, null, 'obligatoire', 5, 50),
  ('rib', 'RIB', 'Pour le versement du salaire.', 'paie', true, false, null, 'obligatoire', 5, 60),
  ('domicile', 'Justificatif de domicile', '', 'rh', true, false, null, 'obligatoire', 1, 70),
  ('contrat', 'Contrat de travail signé', '', 'paie', true, false, null, 'obligatoire', 5, 80),
  ('dpae', 'Accusé de DPAE', 'Déclaration préalable à l''embauche.', 'paie', true, false, null, 'obligatoire', 5, 90),
  ('visite', 'Attestation de visite médicale', 'Attestation de suivi ou avis d''aptitude seulement, jamais de dossier médical.', 'rh', true, true, null, 'obligatoire', 5, 100),
  ('mutuelle', 'Mutuelle : adhésion ou dispense', '', 'paie', true, false, null, 'obligatoire', 5, 110),
  ('habilitation', 'Habilitation électrique (titre signé)', 'Titre signé par l''employeur ; une préparation ne suffit pas.', 'rh', true, true, null, 'obligatoire', 5, 120),
  ('formation', 'Autre formation (hauteur…)', 'Selon le poste.', 'rh', true, true, null, 'facultatif', 5, 130),
  ('epi', 'Remise des EPI et du matériel signée', '', 'rh', true, false, null, 'obligatoire', 5, 140),
  ('casier', 'Casier judiciaire (bulletin n° 3) consulté', 'Seulement si le poste le justifie. Aucune copie gardée : date et personne qui l''a vu.', 'rh', false, false, null, 'facultatif', 1, 150);

-- Réglage par holding OU société (la société l'emporte) : super admin.
create table public.documents_regles (
  id uuid primary key default gen_random_uuid(),
  type text not null references public.documents_types,
  holding_id uuid references public.holdings on delete cascade,
  societe_id uuid references public.societes on delete cascade,
  exige text not null check (exige in ('obligatoire', 'facultatif', 'non_demande')),
  check (num_nonnulls(holding_id, societe_id) = 1),
  unique (type, holding_id), unique (type, societe_id)
);
create index documents_regles_holding_idx on public.documents_regles (holding_id);
create index documents_regles_societe_idx on public.documents_regles (societe_id);

-- Une ligne par remise : un renouvellement s'ajoute, l'ancien est gardé jusqu'à la purge.
create table public.documents_tech (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  type text not null references public.documents_types,
  vu_le date not null default current_date,
  expire_le date,
  fichier text unique,                    -- stockage privé « identite »
  ecarte boolean not null default false,  -- erreur de saisie : masqué, jamais effacé à la main
  cree_le timestamptz not null default now(),
  cree_par uuid,
  check (fichier is null or fichier like societe_id::text || '/%/' || technicien_id::text || '\_' || type || '\_%'),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);
create index documents_tech_idx on public.documents_tech (societe_id, technicien_id);

create function private.document_controle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.documents_types;
begin
  select * into t from public.documents_types where code = new.type;
  if new.fichier is not null and not t.copie then raise exception 'aucune copie de ce document ne doit etre gardee'; end if;
  if new.fichier is not null and split_part(new.fichier, '/', 2) <> t.acces then raise exception 'dossier du fichier incorrect'; end if;
  if new.fichier is null and t.copie then raise exception 'copie du document attendue'; end if;
  if new.vu_le > current_date + 1 then raise exception 'date future'; end if;
  if tg_op = 'INSERT' then
    new.cree_le := now();
    new.cree_par := (select auth.uid());
  elsif (to_jsonb(new) - 'ecarte') <> (to_jsonb(old) - 'ecarte') then
    raise exception 'document deja enregistre : seul « ecarte » peut changer';
  end if;
  return new;
end $$;

-- Journal sans le chemin des fichiers.
create or replace function private.journal_masque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
        purge boolean := tg_op = 'DELETE' and private.purge_en_cours((r->>'societe_id')::uuid);
        cache text[] := array['numero', 'nir', 'scan', 'fichier'];
begin
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((r->>'societe_id')::uuid, tg_table_name, r->>'id',
          case when purge then 'PURGE' else tg_op end,
          case when tg_op <> 'INSERT' and not purge then to_jsonb(old) - cache end,
          case when tg_op <> 'DELETE' then to_jsonb(new) - cache end,
          (select auth.uid()));
  return coalesce(new, old);
end $$;

create function private.acces_document(s uuid, t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.a_role(s, case (select acces from public.documents_types where code = t)
    when 'paie' then '{admin,gestion,comptable}'::public.role_membre[]
    when 'rh' then '{admin,gestion}'::public.role_membre[] else '{}'::public.role_membre[] end);
$$;
revoke execute on function private.acces_document from public;
grant execute on function private.acces_document to authenticated;

alter table public.documents_types enable row level security;
alter table public.documents_regles enable row level security;
alter table public.documents_tech enable row level security;
revoke all on public.documents_types, public.documents_regles, public.documents_tech from anon, authenticated;
grant select on public.documents_types, public.documents_regles to authenticated;
grant select, insert, update on public.documents_tech to authenticated;
create policy lire on public.documents_types for select to authenticated using (true);
create policy lire on public.documents_regles for select to authenticated using (
  (select private.est_super_admin())
  or private.a_role(societe_id, '{admin,gestion,comptable}')
  or exists (select 1 from public.societes s where s.holding_id = documents_regles.holding_id
             and private.a_role(s.id, '{admin,gestion,comptable}')));
create policy lire on public.documents_tech for select to authenticated using (private.acces_document(societe_id, type));
create policy ajouter on public.documents_tech for insert to authenticated
  with check ((select private.a_role(societe_id, '{admin,gestion}')));
create policy ecarter on public.documents_tech for update to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}'))) with check ((select private.a_role(societe_id, '{admin,gestion}')));
create trigger controle before insert or update on public.documents_tech for each row execute function private.document_controle();
create trigger journal after insert or update or delete on public.documents_tech for each row execute function private.journal_masque();
create trigger effacement_interdit before delete on public.documents_tech for each row execute function private.interdire_effacement();
create trigger vidage_interdit before truncate on public.documents_tech for each statement execute function private.interdire_effacement();

-- p_exige vide = retirer le réglage (la société suit de nouveau sa holding, ou la liste commune).
create function public.regler_document(p_type text, p_holding uuid, p_societe uuid, p_exige text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if num_nonnulls(p_holding, p_societe) <> 1 then raise exception 'une holding OU une societe'; end if;
  delete from public.documents_regles where type = p_type
    and holding_id is not distinct from p_holding and societe_id is not distinct from p_societe;
  if p_exige is not null then
    insert into public.documents_regles (type, holding_id, societe_id, exige) values (p_type, p_holding, p_societe, p_exige);
  end if;
end $$;
revoke execute on function public.regler_document from public, anon;
grant execute on function public.regler_document to authenticated;

-- Purge légale : la durée dépend du type de document.
insert into public.durees_conservation values ('documents_tech', 5,
  'Documents d''embauche : 1 à 5 ans après le départ selon le document (Code du travail, registre du personnel et documents sociaux). À VÉRIFIER.');

create or replace function private.date_conservation(t text, r jsonb) returns date
language sql stable security definer set search_path = '' as $$
  select case t
    when 'conges' then (r->>'fin')::date
    when 'amendes' then (r->>'date_avis')::date
    when 'techniciens' then (r->>'archive_le')::date
    when 'photos_apk' then substring(r->>'nom_local' from '_(\d{4}-\d{2}-\d{2})_')::date
    when 'primes_tarifs' then case when r->>'mois' = 'courant'
      then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
      else (r->>'mois' || '-01')::date end
    when 'permis_conduire' then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
    when 'secu_sociale' then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
    when 'documents_tech' then (select x.archive_le from public.techniciens x where x.id = (r->>'technicien_id')::uuid)
    else (r->>'date')::date end;
$$;

create or replace function private.expire(t text, r jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case when t in ('techniciens', 'permis_conduire', 'secu_sociale', 'documents_tech')
                         then d + make_interval(years => coalesce(
                           (select k.conservation_annees from public.documents_types k where t = 'documents_tech' and k.code = r->>'type'), c.annees)) < current_date
                       else make_date(extract(year from d)::int + c.annees, 12, 31) < current_date end, false)
  from public.durees_conservation c, (select private.date_conservation(t, r) as d) x
  where c.table_nom = t;
$$;

create or replace function private.tech_purgeable(s uuid, tech uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare t text; reste boolean;
begin
  if not exists (select 1 from public.techniciens x where x.societe_id = s and x.id = tech
                 and private.expire('techniciens', to_jsonb(x)) is true) then return false; end if;
  foreach t in array array['temps','heures_sup','gestes_co','primes_tarifs','conges','frais','photos_apk','amendes','permis_conduire','secu_sociale','documents_tech'] loop
    execute format('select exists (select 1 from public.%I d where d.societe_id = $1 and d.technicien_id = $2
      and private.expire(%L, to_jsonb(d)) is not true)', t, t) into reste using s, tech;
    if reste then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.apercu_purge(s uuid) returns table (table_nom text, lignes int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare t text; k int;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  foreach t in array array['temps','heures_sup','gestes_co','primes_tarifs','conges','frais','photos_apk','amendes','permis_conduire','secu_sociale','documents_tech'] loop
    execute format('select count(*)::int from public.%I d where d.societe_id = $1
      and private.expire(%L, to_jsonb(d)) is true', t, t) into k using s;
    if k > 0 then table_nom := t; lignes := k; return next; end if;
  end loop;
  select count(*)::int into k from public.techniciens x where x.societe_id = s and private.tech_purgeable(s, x.id);
  if k > 0 then table_nom := 'techniciens'; lignes := k; return next; end if;
end $$;

create or replace function public.purger_donnees(s uuid, confirmation text)
returns table (table_nom text, lignes int, fichiers text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t text; k int; fs text[]; ids text[]; tech uuid;
begin
  if not private.est_super_admin() then raise exception 'reserve au super admin'; end if;
  if confirmation is distinct from 'PURGER' then raise exception 'confirmation attendue : PURGER'; end if;
  perform set_config('app.purge_legale', s::text, true);   -- jusqu'à la fin de la transaction
  foreach t in array array['temps','heures_sup','gestes_co','conges','frais','photos_apk','amendes','primes_tarifs','permis_conduire','secu_sociale','documents_tech'] loop
    execute format('with x as (delete from public.%I d where d.societe_id = $1 and private.expire(%L, to_jsonb(d)) is true
        returning d.id::text as id, %s as f)
      select count(*)::int, coalesce(array_agg(f) filter (where f is not null), ''{}''), coalesce(array_agg(id), ''{}'') from x',
      t, t, case t when 'photos_apk' then 'd.stockage' when 'amendes' then 'd.scan' when 'permis_conduire' then 'd.scan' when 'documents_tech' then 'd.fichier' else 'null::text' end)
      into k, fs, ids using s;
    delete from public.audit a where a.table_nom = t and a.ligne_id = any(ids) and a.action <> 'PURGE';
    if k > 0 then table_nom := t; lignes := k; fichiers := fs; return next; end if;
  end loop;
  k := 0;
  for tech in select x.id from public.techniciens x where x.societe_id = s and private.tech_purgeable(s, x.id) loop
    begin
      delete from public.affectations a where a.societe_id = s and a.technicien_id = tech;
      delete from public.techniciens x where x.societe_id = s and x.id = tech;
      delete from public.audit a where a.ligne_id = tech::text and a.action <> 'PURGE';
      k := k + 1;
    exception when foreign_key_violation then null;   -- encore lié ailleurs : on le garde
    end;
  end loop;
  if k > 0 then table_nom := 'techniciens'; lignes := k; fichiers := '{}'; return next; end if;
  perform set_config('app.purge_legale', '', true);
end $$;

create or replace function private.fichier_orphelin(seau text, chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case seau
    when 'photos' then not exists (select 1 from public.photos_apk p where p.stockage = chemin)
    when 'scans' then not exists (select 1 from public.amendes a where a.scan = chemin)
    when 'identite' then not exists (select 1 from public.permis_conduire p where p.scan = chemin)
      and not exists (select 1 from public.documents_tech d where d.fichier = chemin)
    else false end;
$$;

-- Stockage « identite » : <societe>/<rh|paie>/<technicien>_<type>_<horodatage>.<ext>.
-- La lecture par admin et gestion existe déjà (migration 31) ; le comptable ne lit que « paie ».
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  execute $p$create policy identite_lire_paie on storage.objects for select to authenticated
    using (bucket_id = 'identite' and (storage.foldername(name))[2] = 'paie'
      and (select private.a_role((storage.foldername(name))[1]::uuid, '{comptable}')))$p$;
  execute $p$create policy identite_ajouter_docs on storage.objects for insert to authenticated
    with check (
      bucket_id = 'identite'
      and (storage.foldername(name))[2] in ('rh', 'paie')
      and (select private.a_role((storage.foldername(name))[1]::uuid, '{admin,gestion}'))
      and exists (
        select 1 from public.techniciens t, public.documents_types k
        where t.societe_id = (storage.foldername(name))[1]::uuid and k.copie and k.acces = (storage.foldername(name))[2]
          and starts_with(storage.filename(name), t.id::text || '_' || k.code || '_')
      )
    )$p$;
end $$;
