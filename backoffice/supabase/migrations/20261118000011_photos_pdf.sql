-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Les justificatifs de frais de l'APK peuvent être des PDF (CycleSync.kt : mimeFor) :
-- le stockage « photos » les accepte aussi.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
    where id = 'photos';
end $$;
