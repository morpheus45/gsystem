-- Demande du 17/11/2026 : « supprimer » un utilisateur de l'appli = l'ARCHIVER (double
-- validation à l'écran). Il sort des actifs ; toutes ses données sont conservées. La date
-- d'archivage permettra une purge à 3 ans si elle est décidée (aujourd'hui : rien ne s'efface).
alter table public.techniciens add column archive_le date;
alter table public.techniciens add column archive_par uuid references auth.users;

-- Archiver : date du jour et auteur posés par la base, et le tech devient inactif.
-- Restaurer (archive_le vidé) : de nouveau actif.
create function private.archiver_technicien() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.archive_le is not null and old.archive_le is null then
    new.archive_le := current_date; new.archive_par := (select auth.uid()); new.actif := false;
  elsif new.archive_le is null and old.archive_le is not null then
    new.archive_par := null; new.actif := true;
  elsif new.archive_le is not null then
    new.archive_le := old.archive_le; new.archive_par := old.archive_par;
  end if;
  return new;
end $$;
create trigger archiver before update on public.techniciens
  for each row execute function private.archiver_technicien();
