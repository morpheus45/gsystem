-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Journal : l'import réécrit chaque heure des lignes identiques ; ces non-modifications ne sont plus notées.
-- Rien n'est effacé, les données et l'ancien journal restent. Créations, vraies modifications,
-- effacements et purges restent notés. Les journaux masqués (permis, NIR, documents) ne changent pas.
create or replace function private.journal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old)); purge boolean := tg_op = 'DELETE' and private.purge_en_cours((r->>'societe_id')::uuid);
begin
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then return new; end if;
  insert into public.audit (societe_id, table_nom, ligne_id, action, avant, apres, par)
  values ((r->>'societe_id')::uuid, tg_table_name, coalesce(r->>'id', r->>'user_id'),
          case when purge then 'PURGE' else tg_op end,
          case when tg_op <> 'INSERT' and not purge then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end $$;
