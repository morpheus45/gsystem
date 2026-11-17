-- Les justificatifs de frais de l'APK peuvent être des PDF (CycleSync.kt : mimeFor) :
-- le stockage « photos » les accepte aussi.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
    where id = 'photos';
end $$;
