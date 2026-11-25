-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Clarification : le module fin « Factures » devient « Factures clients » (factures de vente),
-- pour ne pas le confondre avec le module « Facturation » d'origine (facture au donneur d'ordre EPS).
-- Le code interne reste 'factures' ; seul le libellé affiché change.
update public.catalogue_module set libelle = 'Factures clients' where code = 'factures';
