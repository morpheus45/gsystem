-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Primes GesteCo venues de l'APK (règle : core/primes.js, reprise de data/Models.kt).
-- Écrites seulement par le pont (clé serveur) ; lecture par la société ; jamais effacées.

create table public.gestes_co (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  cle_source text not null,
  date date not null,
  numero_site text not null default '',
  installes jsonb not null default '{}',   -- { gsm: 2, cam: 1, ... } : équipements INSTALLÉS
  unique (societe_id, cle_source),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);
create index gestes_co_tech_date_idx on public.gestes_co (societe_id, technicien_id, date);

-- Barèmes des réglages de l'APK : 'courant' (prices) ou un mois figé AAAA-MM (primeTarifsParMois).
create table public.primes_tarifs (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  mois text not null check (mois = 'courant' or mois ~ '^\d{4}-\d{2}$'),
  prix jsonb not null default '{}',
  unique (societe_id, technicien_id, mois),
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['gestes_co', 'primes_tarifs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lire on public.%I for select to authenticated
      using ((select private.a_role(societe_id, ''{admin,gestion,comptable,lecture}'')))', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger journal after insert or update or delete on public.%I
      for each row execute function private.journal()', t);
    execute format('create trigger effacement_interdit before delete on public.%I
      for each row execute function private.interdire_effacement()', t);
  end loop;
end $$;
