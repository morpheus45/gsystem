-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Décision du 17/11/2026 : les données réelles venues de l'APK (heures, frais,
-- photos) ne peuvent être effacées par PERSONNE : ni utilisateur, ni super admin,
-- ni suppression de société, ni la clé serveur. Le trigger s'applique à tous.
-- Les corrections (update) restent possibles et sont journalisées (audit).
create function private.interdire_effacement() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'donnee reelle de l''APK (%) : effacement interdit', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['temps', 'frais', 'photos_apk'] loop
    execute format('create trigger effacement_interdit before delete on public.%I
      for each row execute function private.interdire_effacement()', t);
    execute format('create trigger vidage_interdit before truncate on public.%I
      for each statement execute function private.interdire_effacement()', t);
  end loop;
end $$;
