-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Code tech EPS (ISTGSxx) sur la fiche du technicien : sert à récupérer son planning.
-- Rempli par ceux qui peuvent modifier la fiche (admin, gestion). Pas un secret (il est sur le PDF) ;
-- le mot de passe commun n'est JAMAIS ici, il reste dans le script caché. Rien n'est effacé.
alter table public.techniciens add column code_tech text
  check (code_tech is null or code_tech ~ '^[A-Z0-9]{2,20}$');

-- Pour le script caché du planning (service_role) : techniciens actifs qui ont un code, avec leur dossier Drive.
create function public.planning_a_charger()
returns table (code_tech text, dossier text) language sql stable security definer set search_path = '' as $$
  select x.code_tech, x.nom_apk from public.techniciens x
  where x.actif and x.archive_le is null and coalesce(x.code_tech, '') <> '' and coalesce(x.nom_apk, '') <> '';
$$;
revoke execute on function public.planning_a_charger from public, anon, authenticated;
grant execute on function public.planning_a_charger to service_role;
