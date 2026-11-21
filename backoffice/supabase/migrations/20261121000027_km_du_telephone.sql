-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Index unique sur les relevés km : un réimport ne double pas un relevé de saisie existant.

create unique index releves_km_vehicule_date_source on public.releves_km (vehicule_id, date, source);
