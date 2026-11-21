-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
-- Panne de synchro APK -> back-office (18/11/2026 vers 15 h -> 19/11/2026) : le déclencheur
-- ignorer_hors_delai (purge légale) s'exécutait avec les droits de l'appelant. Le pont écrit avec la
-- clé serveur (service_role), qui n'a pas accès au schéma private : « permission denied for schema
-- private », chaque import refusé (403). Comme ses voisins (journal, hors_periode_verrouillee) : droits
-- du propriétaire, chemin de recherche déjà verrouillé (search_path = ''). Test : pont-service.test.js.
alter function private.ignorer_hors_delai() security definer;
