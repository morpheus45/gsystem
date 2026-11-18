-- Demande du 18/11/2026 : un message se corrige (faute de frappe), des deux côtés, et
-- s'efface tant que le destinataire ne l'a pas lu. Au bureau : par son auteur seulement
-- (ou le super admin). Côté technicien : par le pont (clé serveur), plus tard.
alter table public.messages add column modifie_le timestamptz;

create or replace function private.signer_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.auteur := case when new.de = 'bureau' then (select auth.uid()) end;
    new.cree_le := now(); new.lu_le := null; new.modifie_le := null;
    return new;
  end if;
  if (new.societe_id, new.technicien_id, new.de, new.auteur, new.cree_le)
     is distinct from (old.societe_id, old.technicien_id, old.de, old.auteur, old.cree_le) then
    raise exception 'seuls le texte et la lecture d''un message changent';
  end if;
  if new.texte is distinct from old.texte then
    -- Connecté (bureau) : son propre message uniquement. Sans connexion : le pont (côté technicien).
    if (select auth.uid()) is not null and not (old.de = 'bureau' and old.auteur = (select auth.uid()))
       and not private.est_super_admin() then
      raise exception 'seul l''auteur corrige son message';
    end if;
    new.modifie_le := now();
  else
    new.modifie_le := old.modifie_le;
  end if;
  return new;
end $$;

create policy effacer on public.messages for delete to authenticated
  using (lu_le is null and de = 'bureau'
         and (auteur = (select auth.uid()) or (select private.est_super_admin()))
         and (select private.a_role(societe_id, '{admin,gestion}')));
grant delete on public.messages to authenticated;
