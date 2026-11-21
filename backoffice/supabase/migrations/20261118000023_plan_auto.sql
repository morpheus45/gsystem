-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Demande du 18/11/2026 : les échéances se posent toutes seules pour chaque véhicule
-- qui entre. Dès que marque, modèle et carburant sont connus (saisis, ou lus depuis la
-- plaque), le véhicule reprend les règles d'un véhicule identique de la même société,
-- avec la source d'origine citée. Rien n'est inventé : sans véhicule identique, rien.
alter table public.vehicules add column carburant text not null default '';

create function private.reprendre_plan() returns trigger
language plpgsql set search_path = '' as $$
declare modele_id uuid; modele_plaque text;
begin
  if btrim(new.marque) = '' or btrim(new.modele) = ''
     or exists (select 1 from public.entretien_regles r where r.vehicule_id = new.id) then
    return null;
  end if;
  -- Le véhicule identique le plus sûr : celui dont les règles sont d'origine (pas déjà reprises).
  select v.id, v.plaque into modele_id, modele_plaque
  from public.vehicules v
  where v.societe_id = new.societe_id and v.id <> new.id
    and lower(btrim(v.marque)) = lower(btrim(new.marque))
    and lower(btrim(v.modele)) = lower(btrim(new.modele))
    and lower(btrim(v.carburant)) = lower(btrim(new.carburant))
    and exists (select 1 from public.entretien_regles r where r.vehicule_id = v.id)
  order by exists (select 1 from public.entretien_regles r
                   where r.vehicule_id = v.id and r.source not like 'Repris de %') desc, v.plaque
  limit 1;
  if modele_id is null then return null; end if;
  insert into public.entretien_regles (societe_id, vehicule_id, type, tous_les_km, tous_les_mois, source)
  select new.societe_id, new.id, r.type, r.tous_les_km, r.tous_les_mois,
         case when r.source like 'Repris de %' then r.source
              else 'Repris de ' || modele_plaque || ' : ' || r.source end
  from public.entretien_regles r where r.vehicule_id = modele_id;
  return null;
end $$;

create trigger reprendre_plan after insert or update of marque, modele, carburant on public.vehicules
  for each row execute function private.reprendre_plan();
