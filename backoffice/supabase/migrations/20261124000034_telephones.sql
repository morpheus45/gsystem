-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Jeton par téléphone (demande du 24/11/2026). ÉTAPE 1 : la base seulement, aucun téléphone ne s'en sert encore.
-- Le jeton appartient à UN téléphone ; les données appartiennent au technicien. Le technicien change seul
-- de téléphone avec un code reçu par mail : l'ancien est coupé dans la même transaction. Rien n'est effacé.
-- Les fonctions du téléphone sont réservées à la passerelle (service_role) ; ni jeton ni code n'est gardé en clair.

create table public.techniciens_mail (
  technicien_id uuid primary key,
  societe_id uuid not null,
  mail text not null check (mail ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(mail) <= 200),
  unique (societe_id, technicien_id),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id) on delete cascade
);
create unique index techniciens_mail_unique on public.techniciens_mail (lower(mail));

create table public.telephones (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  appareil text not null default '' check (length(appareil) <= 80),
  jeton_hash text not null unique,
  cree_le timestamptz not null default now(),
  vu_le timestamptz not null default now(),
  envoi_le timestamptz,                   -- dernier envoi complet (voyant vert)
  coupe_le timestamptz,
  coupe_motif text check (coupe_motif in ('remplace', 'bureau')),
  coupe_par uuid,
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id) on delete cascade
);
create unique index telephones_un_actif on public.telephones (technicien_id) where coupe_le is null;

create table private.telephone_codes (
  id uuid primary key default gen_random_uuid(),
  technicien_id uuid not null references public.techniciens (id) on delete cascade,
  code_hash text not null,
  bureau boolean not null default false,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  essais int not null default 0,
  utilise boolean not null default false
);
create index telephone_codes_tech_idx on private.telephone_codes (technicien_id, cree_le);
revoke all on private.telephone_codes from public, anon, authenticated;

-- Aléa de Postgres (gen_random_uuid : 122 bits chacun) ; empreintes SHA-256.
create function private.empreinte(t text) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex'); $$;
create function private.alea_jeton() returns text
language sql volatile set search_path = '' as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); $$;
-- 48 bits entièrement aléatoires de l'uuid (fin), ramenés à n chiffres.
create function private.alea_code(n int) returns text
language sql volatile set search_path = '' as $$
  select lpad((('x' || right(replace(gen_random_uuid()::text, '-', ''), 12))::bit(48)::bigint % (10::numeric ^ n)::bigint)::text, n, '0');
$$;

create function private.nouveau_code(tech uuid, du_bureau boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare c text := private.alea_code(case when du_bureau then 8 else 6 end); i uuid := gen_random_uuid();
begin
  update private.telephone_codes set utilise = true where technicien_id = tech and not utilise;   -- un seul code valable
  insert into private.telephone_codes (id, technicien_id, code_hash, bureau, expire_le)
  values (i, tech, private.empreinte(i::text || c), du_bureau, now() + case when du_bureau then interval '15 minutes' else interval '10 minutes' end);
  return c;
end $$;

-- Journal sans l'empreinte du jeton.
create function private.journal_telephone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old)); cache text[] := array['jeton_hash', 'vu_le', 'envoi_le'];
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - cache = to_jsonb(old) - cache then return new; end if;   -- simple passage
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((r->>'societe_id')::uuid, tg_table_name, coalesce(r->>'id', r->>'technicien_id'), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) - cache end,
          case when tg_op <> 'DELETE' then to_jsonb(new) - cache end, (select auth.uid()));
  return coalesce(new, old);
end $$;
create trigger journal after insert or update or delete on public.telephones for each row execute function private.journal_telephone();
create trigger journal after insert or update or delete on public.techniciens_mail for each row execute function private.journal_telephone();

alter table public.techniciens_mail enable row level security;
alter table public.telephones enable row level security;
revoke all on public.techniciens_mail, public.telephones from anon, authenticated;
grant select on public.techniciens_mail to authenticated;
grant select (id, societe_id, technicien_id, appareil, cree_le, vu_le, envoi_le, coupe_le, coupe_motif) on public.telephones to authenticated;
create policy lire on public.techniciens_mail for select to authenticated using ((select private.a_role(societe_id, '{admin,gestion}')));
create policy lire on public.telephones for select to authenticated using ((select private.a_role(societe_id, '{admin,gestion}')));

-- BUREAU --------------------------------------------------------------------------------------------
-- Le mail est la clé du compte : admin seulement (et holding, super admin). Le changer annule les codes en cours.
create function public.telephone_regler_mail(tech uuid, p_mail text)
returns void language plpgsql security definer set search_path = '' as $$
declare s uuid := (select societe_id from public.techniciens where id = tech);
begin
  if s is null or private.a_role(s, '{admin}') is not true then raise exception 'reserve a l''admin'; end if;
  update private.telephone_codes set utilise = true where technicien_id = tech and not utilise;
  if coalesce(trim(p_mail), '') = '' then delete from public.techniciens_mail where technicien_id = tech; return; end if;
  insert into public.techniciens_mail (technicien_id, societe_id, mail) values (tech, s, lower(trim(p_mail)))
  on conflict (technicien_id) do update set mail = excluded.mail;
end $$;

create function public.telephone_couper(tech uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare s uuid := (select societe_id from public.techniciens where id = tech); n int;
begin
  if s is null or private.a_role(s, '{admin,gestion}') is not true then raise exception 'reserve a l''admin ou a la gestion'; end if;
  update private.telephone_codes set utilise = true where technicien_id = tech and not utilise;
  update public.telephones set coupe_le = now(), coupe_motif = 'bureau', coupe_par = (select auth.uid())
  where technicien_id = tech and coupe_le is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Secours quand le technicien n'a plus accès à son mail.
create function public.telephone_code_bureau(tech uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare t public.techniciens;
begin
  select * into t from public.techniciens where id = tech for update;
  if t.id is null or private.a_role(t.societe_id, '{admin}') is not true then raise exception 'reserve a l''admin'; end if;
  if not t.actif or t.archive_le is not null then raise exception 'technicien inactif'; end if;
  if not exists (select 1 from public.techniciens_mail where technicien_id = tech) then raise exception 'enregistrez d''abord son mail'; end if;
  return private.nouveau_code(tech, true);
end $$;

-- PASSERELLE (service_role) ---------------------------------------------------------------------------
-- Renvoie une ligne à envoyer par mail, ou rien ; la passerelle répond toujours la même chose au téléphone.
create function public.telephone_demander_code(p_mail text)
returns table (mail text, nom text, code text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t record;
begin
  select x.id, x.nom, m.mail into t from public.techniciens_mail m join public.techniciens x on x.id = m.technicien_id
  where lower(m.mail) = lower(trim(p_mail)) and x.actif and x.archive_le is null for update of x;
  if t.id is null then return; end if;
  if (select count(*) from private.telephone_codes c where c.technicien_id = t.id and not c.bureau and c.cree_le > now() - interval '1 hour') >= 3
     or exists (select 1 from private.telephone_codes c where c.technicien_id = t.id and not c.bureau and c.cree_le > now() - interval '1 minute')
     or (select coalesce(sum(c.essais), 0) from private.telephone_codes c where c.technicien_id = t.id and c.cree_le > now() - interval '1 hour') >= 10
     -- 60 codes par heure pour toute la plateforme : le quota de mails ne s'épuise pas d'un coup.
     or (select count(*) from private.telephone_codes c where not c.bureau and c.cree_le > now() - interval '1 hour') >= 60 then return; end if;
  mail := t.mail; nom := t.nom; code := private.nouveau_code(t.id, false);
  return next;
end $$;

-- confirme = false : le code est vérifié mais pas utilisé ; dit quel téléphone serait coupé.
-- confirme = true  : coupe l'ancien et crée le nouveau, ensemble ou pas du tout. Échec : etat = 'refus', sans détail.
create function public.telephone_connecter(p_mail text, p_code text, p_appareil text, confirme boolean)
returns table (etat text, jeton text, ancien text, ancien_envoi timestamptz, mail text, nom text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t record; c private.telephone_codes; v public.telephones; j text;
begin
  etat := 'refus';
  select x.id, x.societe_id, x.nom, m.mail into t from public.techniciens_mail m join public.techniciens x on x.id = m.technicien_id
  where lower(m.mail) = lower(trim(p_mail)) and x.actif and x.archive_le is null for update of x;
  if t.id is null then return next; return; end if;
  select k.* into c from private.telephone_codes k
  where k.technicien_id = t.id and not k.utilise and k.expire_le > now() and k.essais < 5 order by k.cree_le desc limit 1;
  if c.id is null then return next; return; end if;
  if c.code_hash <> private.empreinte(c.id::text || coalesce(regexp_replace(p_code, '\s', '', 'g'), '')) then
    update private.telephone_codes set essais = essais + 1 where id = c.id;
    return next; return;
  end if;
  select q.* into v from public.telephones q where q.technicien_id = t.id and q.coupe_le is null;
  ancien := v.appareil; ancien_envoi := v.envoi_le; nom := t.nom;
  if confirme is not true then
    etat := case when v.id is null then 'pret' else 'remplace' end;
    return next; return;
  end if;
  update private.telephone_codes set utilise = true where id = c.id;
  update public.telephones set coupe_le = now(), coupe_motif = 'remplace' where id = v.id;
  j := private.alea_jeton();
  insert into public.telephones (societe_id, technicien_id, appareil, jeton_hash)
  values (t.societe_id, t.id, left(coalesce(p_appareil, ''), 80), private.empreinte(j));
  etat := 'ok'; jeton := j; mail := t.mail;
  return next;
end $$;

-- À chaque appel du téléphone : le dossier auquel il a droit, et lui seul. Rien = refus.
create function public.telephone_verifier(p_jeton text, p_envoi_complet boolean default false)
returns table (societe_id uuid, technicien_id uuid, dossier text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v record;
begin
  select q.id, q.societe_id, q.technicien_id, x.nom_apk into v from public.telephones q join public.techniciens x on x.id = q.technicien_id
  where q.jeton_hash = private.empreinte(coalesce(p_jeton, '')) and q.coupe_le is null
    and x.actif and x.archive_le is null and coalesce(x.nom_apk, '') <> '';
  if v.id is null then return; end if;
  update public.telephones set vu_le = now(), envoi_le = case when p_envoi_complet then now() else envoi_le end where id = v.id;
  societe_id := v.societe_id; technicien_id := v.technicien_id; dossier := v.nom_apk;
  return next;
end $$;

revoke execute on function private.empreinte, private.alea_jeton, private.alea_code, private.nouveau_code from public, authenticated;
revoke execute on function public.telephone_regler_mail, public.telephone_couper, public.telephone_code_bureau,
  public.telephone_demander_code, public.telephone_connecter, public.telephone_verifier from public, anon, authenticated;
grant execute on function public.telephone_regler_mail, public.telephone_couper, public.telephone_code_bureau to authenticated;
grant execute on function public.telephone_demander_code, public.telephone_connecter, public.telephone_verifier to service_role;
