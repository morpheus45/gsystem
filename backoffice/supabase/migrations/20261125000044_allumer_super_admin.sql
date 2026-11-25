-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Allumage d'un module : le super admin peut le faire en plus de l'administration de la société
-- (il configure tout depuis le back-office). Le reste de la règle ne change pas.
create or replace function public.allumer_module(p_societe uuid, p_code text, p_support text, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_super_admin() and (select private.a_role(p_societe, '{admin}')) is not true then
    raise exception 'reserve au super admin ou a l''administration de la societe'; end if;
  if not exists (select 1 from public.module_disponible d where d.societe_id = p_societe and d.code = p_code) then
    raise exception 'module non disponible pour cette societe'; end if;
  if not exists (select 1 from public.catalogue_module c where c.code = p_code and p_support = any(c.supports)) then
    raise exception 'support non prevu pour ce module'; end if;
  if p_actif then
    insert into public.module_allume (societe_id, code, support, allume_par)
      values (p_societe, p_code, p_support, (select auth.uid())) on conflict (societe_id, code, support) do nothing;
  else
    delete from public.module_allume where societe_id = p_societe and code = p_code and support = p_support;
  end if;
end $$;
