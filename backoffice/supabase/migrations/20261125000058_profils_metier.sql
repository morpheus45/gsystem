-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Profils métier : des paquets de modules prêts à l'emploi. Le super admin (ou le patron de holding)
-- choisit un profil et, en un clic, les bons modules deviennent DISPONIBLES pour la société.
-- Additif : on ajoute les modules du profil sans retirer ceux déjà présents ; on affine ensuite dans le pilotage.

create table public.profil_metier (
  code text primary key check (code ~ '^[a-z_]{2,40}$'),
  libelle text not null,
  recherche text not null default '',          -- mots-clés pour la recherche rapide
  modules text[] not null default '{}'
);
alter table public.profil_metier enable row level security;
grant select on public.profil_metier to authenticated;
create policy lire on public.profil_metier for select to authenticated using (true);

insert into public.profil_metier (code, libelle, recherche, modules) values
  ('loueur_vehicules', 'Loueur de véhicules', 'loueur voiture auto vehicule location lld camion', '{location_contrats,clients,factures,reglements}'),
  ('immobilier', 'Immobilier (vente / location de biens)', 'immobilier agence appartement maison bien bail loyer', '{location_contrats,clients,devis,factures,reglements}'),
  ('location_materiel', 'Location de matériel', 'location materiel outillage engin equipement', '{location_contrats,clients,factures,reglements}'),
  ('ecommerce', 'Vente en ligne / e-commerce', 'ecommerce vente en ligne boutique internet web shop', '{clients,articles,stock,inventaires,devis,factures,reglements,fournisseurs,achats,receptions}'),
  ('negoce_gros', 'Négoce / commerce de gros', 'negoce gros grossiste distribution interentreprises', '{articles,stock,peremption,inventaires,fournisseurs,achats,receptions,clients,factures,reglements}'),
  ('parfumerie', 'Parfumerie / cosmétique', 'parfumerie cosmetique beaute parfum produits dluo', '{articles,stock,peremption,inventaires,clients,factures,fournisseurs,achats,receptions}'),
  ('commerce_detail', 'Commerce de détail / magasin', 'commerce detail magasin boutique vente caisse', '{articles,stock,clients,factures,reglements,fournisseurs,achats,receptions}'),
  ('restauration', 'Restauration / alimentaire', 'restaurant restauration alimentaire traiteur cuisine peremption', '{articles,stock,peremption,inventaires,fournisseurs,achats,receptions}'),
  ('prestataire', 'Prestataire de services', 'prestataire service conseil consultant', '{clients,devis,factures,reglements}'),
  ('artisan_btp', 'Artisan / BTP', 'artisan btp batiment chantier travaux maconnerie', '{clients,devis,factures,reglements}'),
  ('grossiste', 'Grossiste / distributeur', 'grossiste distributeur approvisionnement entrepot', '{articles,stock,inventaires,fournisseurs,achats,receptions,clients,factures,reglements}'),
  ('garage_auto', 'Garage automobile', 'garage auto mecanique reparation pieces vehicule', '{clients,articles,stock,devis,factures,reglements,fournisseurs,achats,receptions}'),
  ('agence_voyage', 'Agence de voyage', 'agence voyage tourisme sejour billet', '{clients,devis,factures,reglements}'),
  ('coiffure_beaute', 'Coiffure / institut de beauté', 'coiffure beaute salon institut esthetique', '{clients,articles,stock,factures,reglements}'),
  ('securite_alarme', 'Sécurité / alarme', 'securite alarme surveillance intervention technique', '{}');

-- Applique un profil : ajoute ses modules aux disponibles de la société (additif). Toi ou Gilles.
create function public.appliquer_profil(p_societe uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare m text;
begin
  if not private.est_patron(p_societe) then raise exception 'reserve au super admin ou au patron de la holding'; end if;
  if not exists (select 1 from public.profil_metier p where p.code = p_code) then raise exception 'profil inconnu'; end if;
  for m in select unnest(p.modules) from public.profil_metier p where p.code = p_code loop
    if exists (select 1 from public.catalogue_module c where c.code = m) then
      insert into public.module_disponible (societe_id, code, ouvert_par)
        values (p_societe, m, (select auth.uid())) on conflict (societe_id, code) do nothing;
    end if;
  end loop;
end $$;
revoke execute on function public.appliquer_profil from public, anon, authenticated;
grant execute on function public.appliquer_profil to authenticated;
