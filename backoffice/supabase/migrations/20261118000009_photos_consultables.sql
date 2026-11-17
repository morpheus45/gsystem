-- Demande du 17/11/2026 : les photos de l'APK doivent être consultables par la société
-- (pas seulement par le propriétaire du Drive). Le pont copie chaque photo dans un
-- stockage PRIVÉ par société et note ici son emplacement.
alter table public.photos_apk add column stockage text;   -- chemin dans le stockage « photos »

-- Les photos APK ne sont écrites que par le pont (clé serveur) : lecture seule pour les utilisateurs.
revoke insert, update, delete on public.photos_apk from authenticated;

-- Stockage « photos » : un dossier par société ; lecture par ses membres ; aucun
-- dépôt ni effacement par un utilisateur (le pont passe par la clé serveur).
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('photos', 'photos', false, 15728640, array['image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  execute $p$create policy photos_lire on storage.objects for select to authenticated
    using (bucket_id = 'photos' and (select private.a_role(
      (storage.foldername(name))[1]::uuid, '{admin,gestion,comptable,lecture}')))$p$;
end $$;
