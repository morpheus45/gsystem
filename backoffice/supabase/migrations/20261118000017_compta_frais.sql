-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Demande du 18/11/2026 : un extrait comptable par technicien, « validé en tout points ».
-- Chaque frais est validé ou refusé un par un (admin, gestion), signé par la base ;
-- seuls les validés partent chez le comptable ; un frais exporté est figé.

alter table public.frais
  add column statut text not null default 'a_traiter' check (statut in ('a_traiter', 'valide', 'refuse')),
  add column tva_recuperable boolean not null default false,   -- facture au nom de l'entreprise (CGI art. 271)
  add column motif_refus text not null default '',
  add column valide_par uuid references auth.users,
  add column valide_le timestamptz;
alter table public.techniciens add column compte_auxiliaire text not null default '';   -- compte du salarié chez le comptable

-- Extrait envoyé au comptable : quels frais, par qui, quand. Ne s'efface pas (aucun droit
-- de suppression) ; il ne part qu'avec la purge légale du technicien (cascade).
create table public.exports_compta (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references public.societes on delete cascade,
  technicien_id uuid not null,
  debut date not null,
  fin date not null,
  frais_ids uuid[] not null,
  parametres jsonb not null,   -- comptes utilisés ce jour-là : un retéléchargement redonne le même fichier
  par uuid not null references auth.users,
  le timestamptz not null default now(),
  check (fin >= debut),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id) on delete cascade
);
create index exports_compta_idx on public.exports_compta (societe_id, technicien_id, debut);
create index exports_compta_frais_idx on public.exports_compta using gin (frais_ids);
alter table public.exports_compta enable row level security;
create policy lire on public.exports_compta for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
grant select on public.exports_compta to authenticated;
create trigger journal after insert or update or delete on public.exports_compta
  for each row execute function private.journal();

create function private.frais_exporte(f uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exports_compta e where f = any(e.frais_ids));
$$;

create function private.valider_frais() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then   -- l'APK et le bureau déposent, seul un humain valide ensuite
    new.statut := 'a_traiter'; new.tva_recuperable := false; new.motif_refus := '';
    new.valide_par := null; new.valide_le := null;
    return new;
  end if;
  if (new.statut, new.tva_recuperable, new.motif_refus) is distinct from (old.statut, old.tva_recuperable, old.motif_refus)
     and private.frais_exporte(old.id) then
    raise exception 'frais deja exporte en comptabilite : fige';
  end if;
  if old.statut <> 'a_traiter' and (new.date, new.categorie, new.montant_eur, new.sans_tva, new.fichier)
     is distinct from (old.date, old.categorie, old.montant_eur, old.sans_tva, old.fichier) then
    raise exception 'frais valide ou refuse : le repasser a traiter avant de le modifier';
  end if;
  if new.statut = 'refuse' and btrim(new.motif_refus) = '' then raise exception 'motif de refus obligatoire'; end if;
  if new.statut = 'valide' and not new.montant_eur > 0 then raise exception 'montant nul : validation impossible'; end if;
  if new.statut = 'a_traiter' then
    new.valide_par := null; new.valide_le := null; new.tva_recuperable := false; new.motif_refus := '';
  elsif new.statut is distinct from old.statut or new.tva_recuperable is distinct from old.tva_recuperable then
    new.valide_par := (select auth.uid()); new.valide_le := now();
  else
    new.valide_par := old.valide_par; new.valide_le := old.valide_le;
  end if;
  return new;
end $$;
create trigger valider before insert or update on public.frais
  for each row execute function private.valider_frais();

-- Comptes utilisés pour les écritures (plan comptable général), validés par le comptable.
create table public.parametres_compta (
  societe_id uuid primary key references public.societes on delete cascade,
  journal text not null default 'NDF',
  journal_lib text not null default 'Notes de frais',
  compte_tva text not null default '44566',
  compte_salarie text not null default '421',
  comptes jsonb not null default '{"PARKING": "6251", "DIVERS": "628", "MOBILE": "626"}',
  valide_par uuid references auth.users,
  valide_le timestamptz
);
alter table public.parametres_compta enable row level security;
create policy lire on public.parametres_compta for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion,comptable,lecture}')));
create policy ecrire on public.parametres_compta for all to authenticated
  using ((select private.a_role(societe_id, '{admin,comptable}'))) with check ((select private.a_role(societe_id, '{admin,comptable}')));
grant select, insert, update on public.parametres_compta to authenticated;
create trigger journal after insert or update or delete on public.parametres_compta
  for each row execute function private.journal();

-- Validation signée par la base ; changer un compte retire la validation.
create function private.signer_parametres_compta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.journal, new.journal_lib, new.compte_tva, new.compte_salarie, new.comptes)
     is distinct from (old.journal, old.journal_lib, old.compte_tva, old.compte_salarie, old.comptes) then
    new.valide_par := null; new.valide_le := null;
  elsif new.valide_le is null then
    new.valide_par := null;
  elsif tg_op = 'INSERT' or old.valide_le is null then
    new.valide_par := (select auth.uid()); new.valide_le := now();
  else
    new.valide_par := old.valide_par; new.valide_le := old.valide_le;
  end if;
  return new;
end $$;
create trigger signer before insert or update on public.parametres_compta
  for each row execute function private.signer_parametres_compta();

-- Export : tous les frais de la période doivent être traités ; prend les validés pas encore exportés.
create function public.exporter_compta(s uuid, tech uuid, du date, au date)
returns table (export_id uuid, frais_ids uuid[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare ids uuid[]; e uuid; p jsonb;
begin
  if not private.a_role(s, '{admin,gestion,comptable}') then raise exception 'pas le droit d''exporter'; end if;
  if exists (select 1 from public.frais f where f.societe_id = s and f.technicien_id = tech
             and f.date between du and au and f.statut = 'a_traiter') then
    raise exception 'des frais de la periode restent a traiter';
  end if;
  select to_jsonb(x) - 'societe_id' into p from public.parametres_compta x where x.societe_id = s and x.valide_le is not null;
  if p is null then raise exception 'parametres comptables non valides par le comptable'; end if;
  select coalesce(array_agg(f.id order by f.date, f.id), '{}') into ids from public.frais f
    where f.societe_id = s and f.technicien_id = tech and f.date between du and au
      and f.statut = 'valide' and not private.frais_exporte(f.id);
  if cardinality(ids) = 0 then raise exception 'rien a exporter : aucun frais valide non exporte'; end if;
  insert into public.exports_compta (societe_id, technicien_id, debut, fin, frais_ids, parametres, par)
    values (s, tech, du, au, ids, p, (select auth.uid())) returning id into e;
  export_id := e; frais_ids := ids; return next;
end $$;
revoke execute on function public.exporter_compta from public, anon;
grant execute on function public.exporter_compta to authenticated;

