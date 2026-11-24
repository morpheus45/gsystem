-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Écran « Saisies » : libellés des modules remplis (toutes versions, même désactivés) ou en service
-- dans la société. Lecture seule, admin et gestion ; aucune donnée n'est modifiée.
create function public.modules_saisis(s uuid)
returns table (id uuid, nom text, icone text, couleur text, conservation_mois int, versions jsonb)
language sql stable security definer set search_path = '' as $$
  select m.id, m.nom, m.icone, m.couleur, m.conservation_mois,
    (select jsonb_object_agg(v.version, v.champs) from public.modules_perso_versions v where v.module_id = m.id)
  from public.modules_perso m
  join public.societes soc on soc.id = s
  left join public.modules_perso_portee ps on ps.module_id = m.id and ps.societe_id = s
  left join public.modules_perso_portee ph on ph.module_id = m.id and ph.holding_id = soc.holding_id
  where private.a_role(s, '{admin,gestion}')
    and ((m.actif and coalesce(ps.actif, ph.actif, false))
      or exists (select 1 from public.saisies_modules x where x.societe_id = s and x.module_id = m.id))
  order by m.nom;
$$;
revoke execute on function public.modules_saisis from public, anon;
grant execute on function public.modules_saisis to authenticated;
