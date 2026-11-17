-- Échéance « Fait » (demande du 17/11/2026) : on note quand (et à quel km) elle a été faite,
-- elle passe dans l'historique et la suivante est créée à part. Le signataire est posé par la
-- base ; une échéance faite ne s'efface plus (historique du véhicule).
alter table public.echeances add column fait_le date;
alter table public.echeances add column fait_km int check (fait_km >= 0);
alter table public.echeances add column fait_par uuid references auth.users;

create function private.echeance_faite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.fait_le is not null then raise exception 'echeance faite : elle reste dans l''historique'; end if;
    return old;
  end if;
  if new.fait_le is null then new.fait_par := null; new.fait_km := null;
  elsif tg_op = 'INSERT' or old.fait_le is null then new.fait_par := (select auth.uid());
  else new.fait_par := old.fait_par; end if;
  return new;
end $$;
create trigger fait before insert or update or delete on public.echeances
  for each row execute function private.echeance_faite();
