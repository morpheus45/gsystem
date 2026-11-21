<!-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE). -->
# Sécurité du back-office

Registre des audits, des failles corrigées et des règles à suivre pour ne pas les reproduire.
Chaque faille corrigée a son test automatique : s'il repasse au rouge, la faille est revenue.

## Audit du 18/11/2026

**Périmètre** : base en ligne (droits de table, règles par ligne, fonctions, stockage,
réglages publics d'authentification), page web (injection HTML, liens, exports), Apps Script
de la page et du pont, recherche de secrets dans le dépôt et son historique.

**Ce qui est sain** (vérifié, rien à corriger) :

- RLS active sur les 29 tables ; chaque règle vérifie le rôle dans la bonne société.
- Les 7 fonctions appelables par un compte connecté vérifient les droits avant d'agir ;
  toutes ont un `search_path` verrouillé ; aucune n'est appelable sans connexion.
- L'acceptation d'une invitation exige un email **confirmé** (pas de prise de compte par
  une adresse non vérifiée).
- Stockage `photos` et `scans` privé, limité en taille et en type (JPEG, PNG, PDF).
- Page : aucun `innerHTML` (124 `textContent`) ; liens fixes ou signés ; logo SVG refusé.
- Pont : seuls les champs listés un par un sont importés (un téléphone ne change ni de
  société ni ne s'auto-valide un frais) ; `nomClient` jamais importé.
- Aucun secret dans le dépôt ni dans son historique.

### Failles corrigées

| N° | Gravité | Faille | Correction | Test |
|----|---------|--------|------------|------|
| S1 | Moyenne (défense en profondeur) | Le visiteur non connecté (`anon`) gardait les droits Supabase par défaut sur toutes les tables, dont `TRUNCATE`, qui vide une table sans passer par la RLS. Les tables en lecture seule restaient modifiables au niveau table (seule la RLS bloquait). | Migration `…024_durcissement` : plus aucun droit pour `anon` ; plus de `TRUNCATE` ; écriture retirée sur `audit`, `operateurs`, `exports_compta`, `primes_tarifs`, `gestes_co`, `durees_conservation` ; idem pour les tables futures. | `durcissement.test.js` |
| S2 | Faible | Export CSV : une cellule commençant par une tabulation ou un retour chariot échappait à la neutralisation des formules Excel. | `texteCsv` neutralise aussi `\t` et `\r`. | `securite.test.js` |
| S3 | Faible | Export facturation : le nom du client n'était pas échappé. | Passe par `texteCsv`. | revue de code |
| S4 | Faible | Archive ZIP : un nom de technicien contenant `../` pouvait écrire hors du dossier d'extraction (« Zip Slip »). | `nomDansZip` nettoie chaque nom (ni racine, ni `..`, ni contrôle). | `securite.test.js` |
| S5 | Faible | Pont : un nom de photo venu du téléphone (`..`, `/`) devenait un morceau de chemin dans le stockage. | `nomDeFichierSur` refuse ces noms avant envoi. | `securite.test.js` |
| S6 | Faible | Identité de véhicule lue sur un site extérieur : ni nettoyée ni bornée. | `lireFicheImmat` retire balises et caractères de contrôle, borne la longueur ; la base borne aussi (contrainte `vehicules_identite_bornee`). | `securite.test.js`, `durcissement.test.js` |
| S7 | Faible | Lecture de plaque (Apps Script) ouverte à tout compte connecté, même inscrit sans invitation. | Réservée aux membres d'au moins une société. | simulation |

### Leçon tirée de l'audit

**L1 — La base de test doit reproduire la production.** Elle n'imitait pas les droits par
défaut de Supabase : 5 tests attendaient « accès refusé » alors qu'en production la base
ignorait simplement l'opération (0 ligne). La protection tenait, mais les tests ne
prouvaient pas ce qu'ils annonçaient. `test/supabase-local.sql` imite désormais ces droits.

### À faire dans le tableau de bord Supabase (réglages de sécurité : à faire par Cédric)

Page : https://supabase.com/dashboard/project/ajaakvqemhmryhfgapqa/auth/providers?provider=Email
(source : https://supabase.com/docs/guides/auth/password-security).

| N° | Réglage | Pourquoi |
|----|---------|----------|
| R1 | Longueur minimale des mots de passe : 12, avec chiffres, minuscules, majuscules et symboles (aujourd'hui 6, la valeur par défaut) | Un mot de passe de 6 caractères se devine. Attention : un compte dont le mot de passe actuel est trop court reçoit une erreur à la connexion et doit le changer (prévenir M. Steckler). La page d'inscription passera à 12 en même temps. |
| R2 | « Prevent use of leaked passwords » | Refuse les mots de passe déjà divulgués. Signalé par l'audit Supabase, mais **réservé à l'offre Pro (payante)** : non activable sur l'offre gratuite, aucun abonnement sans accord. |
| R3 | Inscriptions ouvertes à tous (`disable_signup = false`) | Accepté pour l'instant : le parcours d'invitation en dépend. Un compte inscrit sans invitation ne voit rien (RLS) et n'utilise aucun service (S7). Voir la proposition « invitations par lien ». |

## APK des techniciens — relevé du 18/11/2026 (à reprendre)

Relevé en préparant le brouillage du code. Rien n'est publié : l'APK en service (1.9.105)
est inchangé. Suivi dans `PLAN.md`, rubrique « Sécurité » des tâches restantes.

| N° | Constat | État |
|----|---------|------|
| A1 | Les versions publiées sont la variante **debug** (aucun secret `RELEASE_KEYSTORE_BASE64` dans GitHub) : APK déboguable (avec un câble, on lit les données privées de l'appli) et code lisible. | **Prêt, à activer** : branche `apk/brouillage-r8` (commit 8ac139c) — la publication construit la variante release, brouillée par R8 et non déboguable, avec la même clé. Testé sur émulateur (mise à jour sans perte de données, import PDF, Excel, fiche EPS). Reste : fusionner dans `main` puis publier une version. |
| A2 | L'APK est signé avec la **clé de test du dépôt** (`keystore/debug.keystore`), aussi attendue par `IntegrityGuard` : toute personne ayant accès au dépôt peut fabriquer une mise à jour acceptée par le téléphone. | **À décider** : clé de production privée (secret GitHub), nouvelle empreinte dans `IntegrityGuard`, une désinstallation/réinstallation puis « Restaurer depuis le Drive ». Moment idéal : tant que Cédric est le seul utilisateur. |
| A3 | Le jeton de sauvegarde (`BackupConfig.TOKEN`) est écrit en clair dans le code : le brouillage ne cache pas les textes, il se lit dans l'APK. | **À reprendre** : un compte par technicien (tâche « Plus tard ») ou un jeton par appareil, puis changer le jeton. |
| A4 | Une version de test Play Store (1.9.95) a été construite sans brouillage. Le Play Store ne brouille pas le code (le brouillage se règle à la construction : R8, `isMinifyEnabled`). | **À faire par Cédric** : Play Console › Tester et publier › Tests › mettre fin au test. |

## Règles permanentes (à vérifier à chaque évolution)

1. **Toute nouvelle table** : `enable row level security`, une règle par action, et le rôle
   vérifié dans la société de la ligne (`private.a_role(societe_id, …)`). Une table en lecture
   seule : `revoke insert, update, delete … from authenticated`.
2. **Toute nouvelle fonction de `public`** : `security definer` seulement si nécessaire, avec
   `set search_path = ''`, un contrôle de droits en première ligne, puis
   `revoke execute … from public, anon` et `grant execute … to authenticated`.
3. **Jamais de suppression** de vraies données, sauf la purge légale (super admin, durées de
   conservation sourcées).
4. **Page** : jamais `innerHTML` avec une donnée ; toujours `textContent`. Un lien construit
   avec une donnée : uniquement une URL signée ou une constante.
5. **Export** : toute cellule texte passe par `texteCsv` ; tout nom de fichier d'archive par
   `nomDansZip`.
6. **Donnée venue de l'extérieur** (téléphone, site tiers) : liste blanche des champs,
   nettoyage, longueur bornée dans le code **et** dans la base.
7. **Clés** : seule la clé publique (`sb_publishable_`) dans la page ; la clé serveur
   uniquement dans les Propriétés du script du pont ; aucun secret dans le dépôt.
8. **Tests** : chaque faille corrigée a son test ; la base de test imite les droits par défaut
   de Supabase (L1).
9. **APK** : jamais de secret écrit dans le code (le brouillage ne cache pas les textes) ; toute
   version publiée doit être la variante release, brouillée et non déboguable (A1, à activer).
10. **Déclencheurs** : toute fonction de déclencheur qui appelle une fonction du schéma `private` est
   `security definer` (avec `set search_path = ''`). Sinon le pont, qui écrit avec la clé serveur
   (`service_role`, sans accès à `private`), est refusé : c'est la panne de synchro du 18-19/11/2026
   (migration `…025_synchro_pont`, test `pont-service.test.js`, qui écrit avec ce rôle-là).
