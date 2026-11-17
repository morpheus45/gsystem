-- Décision du 17/11/2026 : l'opérateur de la plateforme est SUPER ADMIN,
-- avec accès à tout (lecture et écriture) dans toutes les sociétés.
-- Un seul point de décision : toutes les policies passent par private.a_role.
-- Les super admins s'ajoutent seulement en SQL (table operateurs, sans droit
-- d'écriture pour les utilisateurs) ; leurs écritures restent journalisées.
create or replace function private.a_role(s uuid, roles public.role_membre[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.operateurs o where o.user_id = (select auth.uid()))
      or exists (
        select 1 from public.membres m
        where m.societe_id = s and m.user_id = (select auth.uid()) and m.role = any (roles)
      );
$$;
