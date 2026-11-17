# Back-office multi-société G-Systems — plan d'action

Vérifié le 17/11/2026 sur `main` = `89d0f44` (version 1.9.105).
Rien ici ne touche l'APK, `apps-script/` ni `docs/`.

## Décisions prises (Phase 0, réponses du 17/11/2026)

| Sujet | Décision |
|---|---|
| Sociétés | **Sociétés clientes indépendantes**, chacune avec ses accès. C'est donc un vrai logiciel en ligne (SaaS) : l'étanchéité entre sociétés est la priorité n° 1. |
| Factures | Notes de frais **+** factures fournisseurs **+** factures émises. Le logiciel doit se relier à la comptabilité et à la **facture électronique** française. |
| Paie | **Export des variables** pour le comptable. Pas de bulletins. |
| Véhicules | Révisions et entretiens, contrôle technique, assurance, pneus et sinistres. |
| Photos | Compteur mensuel (déjà envoyé par l'APK) **+ photos d'état** ajoutées depuis le back-office. Fréquence réglable par société. |
| Heures sup | Repères légaux par défaut, **à valider par le comptable** avant tout usage. |
| Hébergement | **Supabase**. Pour l'instant **en local sur ce poste** (développement, données fictives, accès réservé au poste) ; projet en ligne « pas encore » (17/11/2026). Ne jamais ouvrir la base locale vers l'extérieur. |

## Ce qu'on réutilise

| Existant | Où | Comment on le réutilise |
|---|---|---|
| Règle des heures par jour | `docs/app/heures.js` (copie JS de `util/HoursCalculator.kt`) | **Importé tel quel** par `core/heures.js` (pas de copie). |
| TVA et remboursement des frais | `docs/app/frais.js` (copie JS de `util/FraisTva.kt`) | **Importé tel quel** par `core/frais.js`. |
| Format `donnees.json` | `backup/CycleSync.kt:139-145`, `data/Models.kt` | Lu par le pont d'import `pont/normaliser.js`. |
| Noms des photos | `photos/PhotoStorage.kt:63-78` | Gardés comme référence (`photos_apk.nom_drive`). |
| Plaque du véhicule | `AppSettings.plaqueVoiture` (`data/Models.kt:304`), sauvée dans `reglages.json` (`backup/DriveSync.kt:71`) | Sert à rattacher la photo du compteur au bon véhicule. |
| Tableau de bord actuel | `apps-script/Code.js` (`doGet`, `getAllData`) | Reste en service jusqu'à la parité (Phase 7). |

## Écarts trouvés en revérifiant les faits

1. **`donnees.json` n'écrit pas les valeurs par défaut.** La sérialisation Kotlin (`CycleSync.kt:37`, `Json { ignoreUnknownKeys = true }`) omet tout champ égal à sa valeur par défaut : `kilometres` (0), `observationType` vide, `slotMidi` vide, `heures`… Prouvé par `fixtures/donnees-fictif.json`, produit par la vraie sérialisation. Le pont remet ces valeurs lui-même.
2. **Le cycle n'est pas toujours du 21 au 20.** `docs/PROJET.md:85` : « glissant si `lastEnvoiDateIso` (début = dernier envoi +1) ». Les périodes de paie doivent donc avoir des dates libres (c'est le cas dans `periodes_paie`).
3. **Petite divergence Kotlin ↔ JS sur la règle des heures.** Kotlin teste « vide » avec `isBlank()` (un espace seul compte comme vide), le JS avec `!x` (un espace seul compte comme rempli). Exemple : observation `" "` le matin + OK l'après-midi → Kotlin 8 h, JS brut 6 h. `core/heures.js` nettoie les espaces avant d'appeler la règle JS, et le test d'équivalence le prouve sur 16 cas. `docs/app/heures.js` n'est pas modifié (hors périmètre) : à corriger plus tard dans l'APK web.
4. Le donnees.json est assemblé avec `org.json` dans l'APK. Le harnais de test l'a reconstruit à la main avec la même forme (`{"entries":…,"photos":…}`), car `org.json` n'est pas utilisable dans un test unitaire Android. Le contenu de `entries` vient bien de la vraie sérialisation.

## Phases

Taille : S = petit, M = moyen, L = gros. Aucune durée ni aucun coût n'est estimé ici.

### Phase 0 — Décisions · S · **faite en partie**
- **But** : figer ce qui ne se devine pas.
- **Reste à décider** : voir « Questions ouvertes ».

### Phase 1 — Socle multi-société sécurisé · L · **faite en local (17/11/2026)**
- **But** : sociétés, comptes, rôles, RLS, journal d'audit.
- **Livrables (faits)** : migrations `…_socle.sql` et `…_invitations.sql` ; écran `web/` (connexion email + mot de passe, sociétés, membres, invitations). Décisions du 17/11/2026 : **seul l'opérateur (toi) crée une société** ; connexion **email + mot de passe** ; **page web simple**.
- **Reste** : envoi automatique des emails d'invitation (aujourd'hui l'invitation est enregistrée, il faut prévenir la personne) ; changement de rôle d'un membre depuis l'écran ; libellés des rôles en clair.
- **Rôles** : `admin` (tout, y compris membres et règles), `gestion` (données du quotidien), `comptable` (lecture + paie + factures), `lecture`.
- **Critères d'acceptation** (testés dans `test/rls.test.js` et `test/invitations.test.js`, parcours vérifié dans un navigateur) : seul un opérateur crée une société et il n'en voit pas les données ; une invitation n'est prise qu'avec l'email confirmé ; la société A ne lit ni n'écrit rien de B, sur toutes les tables ; un visiteur non connecté ne voit rien ; chaque écriture est journalisée ; le journal ne s'efface pas.
- **Dépendances** : pour la mise en ligne, création du projet Supabase (accord sur la formule et la région).
- **Risques** : une seule policy oubliée suffit à exposer un client. Parade : le test « RLS activée sur toutes les tables » échoue dès qu'une table l'oublie.

### Phase 2 — Heures et heures sup · M
- **But** : cumul par semaine ISO, ventilation normales / +25 % / +50 % selon les règles de la société.
- **Livrables** : `core/heures.js`, `core/societes.js` (faits), écran de saisie et de correction, écran de validation des règles par le comptable.
- **Critères** : équivalence Kotlin ↔ JS sur `fixtures/heures-cas.json` ; 40 h → 35 + 5 à 25 % ; 48 h → 35 + 8 à 25 % + 5 à 50 % ; taux sous 10 % refusé ; règles « non validées » affichées comme telles.
- **Validation des heures sup (décision du 17/11/2026)** : une case « Validées » par tech et par semaine, cochée par admin ou gestion dans la fiche technicien (pas par le comptable). Signée par la base (qui, quand), décochable jusqu'à l'export de la paie, puis figée ; non effaçable. Seules les semaines validées partiront dans l'export de paie (à brancher dans `core/paie.js`).
- **Fiche technicien** (faite) : interventions, heures par jour (règle de l'APK) et par semaine, frais, véhicule, mois par mois, à partir des données importées de l'APK.
- **Dépendances** : Phase 1 ; validation du comptable.
- **Risques** : la règle actuelle est un **forfait par demi-journée** (4, 6, 7 ou 8 h), pas un pointage réel. Les heures sup calculées dessus ne reflètent pas forcément le temps réel : à confirmer par le comptable.

### Phase 3 — Notes de frais et factures · L
- **But** : notes de frais des techs, factures fournisseurs, factures émises, lien comptable et facture électronique.
- **Livrables** : `core/frais.js` (fait), tables `frais` et `factures` (faites), export comptable, branchement à une **plateforme agréée**.
- **Obligation légale** (sources : [economie.gouv.fr](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises), [service-public](https://entreprendre.service-public.fr/actualites/A15683)) :
  - depuis le **1er septembre 2026**, toutes les entreprises doivent pouvoir **recevoir** des factures électroniques ; les grandes entreprises et ETI doivent aussi les **émettre** ;
  - au **1er septembre 2027**, les PME et micro-entreprises doivent les **émettre** ;
  - l'envoi passe par une **plateforme agréée par l'État** (liste : [service-public A18759](https://entreprendre.service-public.gouv.fr/actualites/A18759)).
- **Conséquence** : le back-office ne doit **pas** devenir lui-même une plateforme agréée (procédure d'agrément lourde, À VÉRIFIER). Il se **branche** sur une plateforme choisie par chaque société (colonne `plateforme_ref`).
- **Une connexion par société** (demande du 17/11/2026) : chaque société branche **sa** plateforme de facture électronique et **son** logiciel de comptabilité. Prévu : une table `connexions` (société, type `facturation` ou `compta`, fournisseur, état), les identifiants rangés dans le coffre chiffré de Supabase (Vault, À VÉRIFIER), jamais en clair, et jamais visibles d'une autre société.
- **Critères** : parking sans TVA → HT = TTC ; mobile 50 € → 20 € remboursés ; même facture fournisseur importée deux fois → refusée (`unique (societe_id, sens, tiers, numero)`).
- **Dépendances** : Phase 1 ; choix de la plateforme agréée ; format d'export du comptable.
- **Risques** : obligations légales (mentions, archivage) : à valider avec l'expert-comptable.

### Phase 4 — Parc véhicules · M
- **But** : véhicules, affectations, kilométrage, entretiens, échéances, photos.
- **Livrables** : `core/vehicules.js` (fait), tables (faites), téléversement des photos d'état, saisie du km au bureau à partir de la photo du compteur.
- **Critères** : km moyen calculé **uniquement** sur les relevés validés ; échéance sans règle saisie → refus (aucun intervalle inventé) ; contrôle technique tous les 24 mois après un contrôle favorable ([service-public F2878](https://www.service-public.fr/particuliers/vosdroits/F2878)) ; photo reçue / manquante / en retard ; alerte « proche » ou « dépassée ».
- **Dépendances** : Phase 1 ; stockage des photos (Phase 0).
- **Risques** : lecture automatique du compteur (OCR) : jamais sans validation humaine. Date du **premier** contrôle technique : saisie par l'utilisateur (non codée).

### Phase 5 — Export des variables de paie · M
- **But** : un fichier par période pour le comptable.
- **Livrables** : `core/paie.js` (fait : heures normales, heures sup 1re tranche (`sup1`) et 2e tranche (`sup2`) avec le **taux réel** de la société, absences, frais remboursables, primes ; CSV `;` à virgule décimale, textes protégés), table `periodes_paie` (née en brouillon, une étape à la fois : brouillon → validée → exportée, puis verrouillée ; le validateur est toujours l'utilisateur connecté).
- **Critères** : une période exportée ne bouge plus, ni ses heures ni ses frais (testé) ; l'export indique si les règles sont validées.
- **Dépendances** : Phases 2 et 3 ; format attendu par le logiciel de paie du comptable.
- **Risques** : une semaine à cheval sur deux périodes est rattachée à la période qui contient **son dimanche** (choix par défaut, **À DÉCIDER**).

### Phase 6 — Pont d'import (greffe de l'APK sur une société) · M

**Démarrée le 17/11/2026, avec les vraies données** (décision de Cédric) : l'APK est le début de la chaîne de production.
- Script **séparé** « Backoffice pont APK (lecture seule) » dans Drive/Backoffice : permission Drive en **lecture seule** ; il lit `Sauvegardes G-Systems/<tech>/<AAAA-MM>/donnees.json` et **ajoute** en base (heures, frais, photos). Import toutes les heures. Rien n'est écrasé ni effacé.
- **Données réelles non effaçables** (décision du 17/11/2026) : heures, frais et photos importés ne peuvent être supprimés par personne, super admin compris, ni par la suppression d'une société (verrou dans la base, testé).
- Société cible : choisie explicitement à la construction (`SOCIETE_ID`).
- Pas encore : le km du compteur (relevé au bureau depuis la photo), les primes (`gesteCo`), le rattachement photo compteur ↔ véhicule par la plaque.
- **But** : lire `donnees.json` et l'importer dans **une** société choisie par un admin.
- **Livrables** : `pont/normaliser.js` (fait), un lecteur Drive à écrire, un écran « importer ce tech dans cette société ».
- **Critères** (testés) : `societeId` obligatoire ; `numeroClient` → `numero_intervention` ; `nomClient` jamais importé ; réimport sans doublon (`cle_source` + `on conflict do nothing`) ; clés inconnues tolérées et signalées ; valeurs par défaut Kotlin remises.
- **Dépendances** : Phases 1, 2, 3 ; accès en lecture au Drive (à décider).
- **Risques** : `gesteCo` (primes) n'est pas importé dans ce squelette. Les photos restent dans Drive (référence seule) tant que le stockage n'est pas décidé.

### Phase 7 — Bascule depuis l'ancien tableau de bord · M
- **But** : arrêter le tableau de bord Apps Script quand le nouveau fait aussi bien.
- **Parité à atteindre** : primes payées, techs inactifs, chat, export ZIP et Excel des clôtures, récap des frais, purge à 3 ans.
- **Critères** : chaque fonction de la liste existe et a été comparée sur un même mois fictif.
- **Risques** : double saisie pendant la transition.

## Plus tard (sans code ici)

- Greffe de l'APK actuelle sur une société, via le pont d'import.
- Plusieurs sociétés avec une APK : une APK par société et un canal de mise à jour par société (la passerelle `?update=` sert aujourd'hui la même version à tous).
- **Sécurité Apps Script, à corriger avant d'ouvrir à d'autres sociétés** : `doPost` ne vérifie qu'un jeton partagé intégré à l'APK, puis fait confiance au nom de tech envoyé. Avec ce jeton, on peut lire, déposer ou mettre à la corbeille les fichiers de n'importe quel tech. Dans un SaaS, il faudra un compte par tech.
- Corriger la divergence « espace seul » dans `docs/app/heures.js`.

## Hébergement : comparaison (rien n'est créé)

| Option | Faits vérifiés | Source |
|---|---|---|
| Supabase Cloud Free | Mis en pause après une semaine de faible activité ; pas de sauvegarde téléchargeable. Inutilisable pour de la paie. | [pricing](https://supabase.com/pricing), [pause](https://supabase.com/kb/faqs/platform/free-project-pausing) |
| Supabase Cloud Pro | À partir de 25 $/mois, sauvegardes quotidiennes gardées 7 jours. Régions UE disponibles : **Paris (eu-west-3)**, Francfort, Irlande. | [pricing](https://supabase.com/pricing), [régions](https://supabase.com/docs/guides/platform/regions) |
| Supabase auto-hébergé | Logiciel libre, installé avec Docker sur son propre serveur. Prix du serveur et maintenance à ta charge : À VÉRIFIER selon l'hébergeur. | [self-hosting](https://supabase.com/docs/guides/self-hosting/docker) |

Le SQL est du Postgres standard (seuls `auth.uid()`, `auth.users` et le rôle `authenticated` viennent de Supabase) : il reste portable.

## Primes, paie, congés (17/11/2026)

- **Primes GesteCo** : règle reprise de l'APK (`core/primes.js`, testée) ; passages et barèmes importés par le pont. Versement à M+2. **À VÉRIFIER** : la paie qui finit le 20 du mois M verse les primes du mois M-2 (janvier → paie du 21/02 au 20/03).
- **Onglet Paie** : tous les techs d'un **mois de paie clôturé** (dates libres choisies par la gestionnaire ; proposition : du lendemain de la clôture précédente au samedi le plus proche du 20) ; heures sup **validées** seulement ; reste à traiter (heures sup, congés) ; « Valider le mois » puis « Exporter et clôturer » (CSV + verrou). Semaines du lundi au samedi, rattachées au mois qui contient leur samedi.
- **Heures sup** : À traiter / Validées / Refusées, signé par la base.
- **Congés** : demandes saisies au bureau, validées ou refusées ; liaison APK plus tard.
- **Pas encore** : liaison des congés avec l'APK.

## Version de test en ligne (17/11/2026)

- Base : projet Supabase **Free** `gsystem-backoffice-test`, région Paris, données fictives uniquement. Se met en pause après une semaine sans activité.
- Page : servie par un **Apps Script séparé** (« Backoffice G-Systems (test) »), rangé dans le dossier Drive `Backoffice`. Il ne touche ni au script ni aux dossiers G-Systems. Construit par `outils/apps-script-build.sh` à partir de `web/`.
- Limite : sans service d'email à soi (SMTP), Supabase n'envoie les confirmations qu'aux membres de l'équipe Supabase. Les comptes des testeurs se créent donc à la main, déjà confirmés, depuis le tableau de bord.

## Questions ouvertes

1. Supabase : formule Pro et région Paris, d'accord pour créer le projet ? (aucun projet créé à ce jour)
2. Heures sup, à faire valider par le comptable : seuil 35 h, contrat 35 ou 39 h, taux (25/50 % ou accord ≥ 10 %), absences hors seuil (VACANCES, FERIE par défaut), dimanche ignoré (comme l'Excel actuel), contingent annuel (220 h sans accord, [service-public F2391](https://www.service-public.fr/particuliers/vosdroits/F2391)) et contrepartie en repos.
3. Le forfait par demi-journée suffit-il pour la paie, ou faut-il les heures réelles (`heureDebut` / `heureFin`) ?
4. Semaine à cheval sur deux périodes : rattachée à la période de son dimanche ?
5. Photos : rester dans Drive (référence seule) ou copier dans un stockage privé par société ?
6. Plateforme agréée de facture électronique : laquelle ? Et quel format d'export pour le comptable ?
7. Remboursement mobile (50 %, plafond 20 €) : commun à toutes les sociétés ou réglable par société ? (aujourd'hui fixe dans `docs/app/frais.js`)
8. Primes (`gesteCo`) : à importer et exporter en paie ?
