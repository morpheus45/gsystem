-- Demande du 17/11/2026 : aucun scan sans les informations qui vont avec.
-- Un scan ne peut être déposé qu'au chemin <societe_id>/amendes/<id de l'amende>.<ext>,
-- pour une amende qui EXISTE déjà dans cette société et n'a pas encore de scan.
-- L'amende (avec ses infos obligatoires) est donc toujours enregistrée avant.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  drop policy if exists scans_ajouter on storage.objects;
  execute $p$create policy scans_ajouter on storage.objects for insert to authenticated
    with check (
      bucket_id = 'scans'
      and (storage.foldername(name))[2] = 'amendes'
      and (select private.a_role((storage.foldername(name))[1]::uuid, '{admin,gestion}'))
      and exists (
        select 1 from public.amendes a
        where a.societe_id = (storage.foldername(name))[1]::uuid
          and a.id::text = split_part(storage.filename(name), '.', 1)
          and a.scan is null
      )
    )$p$;
end $$;
