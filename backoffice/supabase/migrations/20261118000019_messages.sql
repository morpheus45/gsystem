-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Demande du 18/11/2026 : reconstruire le chat bureau ↔ technicien (ancien tableau de bord :
-- feuille « chat » d'Apps Script). Côté bureau maintenant ; côté technicien branché plus tard
-- (l'APK n'est pas modifiée : ses messages seront déposés par le pont avec la clé serveur).
-- Lisible par admin et gestion seulement. Un message ne se modifie ni ne s'efface ;
-- seule la date de lecture se pose. Durée de conservation : À DÉCIDER (aucun texte propre).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null,
  technicien_id uuid not null,
  de text not null check (de in ('bureau', 'technicien')),
  texte text not null check (btrim(texte) <> '' and length(texte) <= 2000),
  auteur uuid references auth.users,   -- qui, au bureau, a écrit
  cree_le timestamptz not null default now(),
  lu_le timestamptz,                   -- lu par le destinataire
  foreign key (societe_id, technicien_id) references public.techniciens (societe_id, id) on delete cascade
);
create index messages_conversation_idx on public.messages (societe_id, technicien_id, cree_le);

alter table public.messages enable row level security;
create policy lire on public.messages for select to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}')));
create policy ecrire on public.messages for insert to authenticated
  with check (de = 'bureau' and (select private.a_role(societe_id, '{admin,gestion}')));
create policy marquer_lu on public.messages for update to authenticated
  using ((select private.a_role(societe_id, '{admin,gestion}'))) with check ((select private.a_role(societe_id, '{admin,gestion}')));
grant select, insert, update on public.messages to authenticated;

create function private.signer_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.auteur := case when new.de = 'bureau' then (select auth.uid()) end;
    new.cree_le := now(); new.lu_le := null;
  elsif (new.societe_id, new.technicien_id, new.de, new.texte, new.auteur, new.cree_le)
        is distinct from (old.societe_id, old.technicien_id, old.de, old.texte, old.auteur, old.cree_le) then
    raise exception 'un message ne se modifie pas (seule la lecture se marque)';
  end if;
  return new;
end $$;
create trigger signer before insert or update on public.messages
  for each row execute function private.signer_message();
