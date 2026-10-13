# G-Systems — Handoff (2026-07-01)

## État général
- **Version en production : v1.9.9** (versionCode 88) — publiée en release GitHub « latest ».
- **Script Apps Script : redéployé par l'utilisateur** ("script ok") en version v1.9.9 (notes + accordéon + détail frais).
- Repo : `morpheus45/gsystem` — chemin local `C:\Users\cedri\Projects\gsystem`.
- Arbre de travail **propre** sur `main` (rien en attente de commit).

## Chaîne de déploiement (rappel)
1. Créer une branche, committer.
2. `gh workflow run android-build.yml --ref <branche>` → attendre le build vert.
3. `git checkout main && git merge --ff-only <branche> && git push`.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` → le tag déclenche le build de release
   qui **publie l'APK signé sur GitHub Releases** (~6 min).
5. **Diffusion aux techniciens — automatique depuis 1.9.96.** Le dépôt étant privé,
   l'app ne lit plus GitHub : c'est le script qui va chercher la dernière Release
   (au plus toutes les 15 min), la range dans le Drive **`Sauvegardes G-Systems/_versions`**
   et la propose à tout compte connecté. L'app la télécharge par morceaux, via le
   script : rien n'est public. Le script garde les 3 versions les plus récentes.
   - **Réglage unique** : créer sur GitHub une clé *fine-grained* limitée au dépôt
     `morpheus45/gsystem`, permission **Contents : Read-only** (rien d'autre), puis la
     coller dans l'éditeur Apps Script → *Paramètres du projet* → *Propriétés du
     script* → `GITHUB_JETON`. La clé reste côté serveur, jamais dans l'app.
     **Elle expire** (1 an au plus) : la renouveler avant l'échéance.
   - **Après chaque redéploiement du script** : lancer `testerMiseAJour()` dans
     l'éditeur. Il doit afficher « OK : la version … est prête ». Sinon, il donne la
     cause (clé expirée, API Drive non autorisée…) — à régler AVANT qu'un téléphone
     en dépende.
   - **Sans clé**, déposer l'APK à la main dans `_versions` sous le nom exact
     `gsystem-vX.Y.Z.apk` marche aussi ; la description du fichier Drive sert de notes.
   - **Revenir en arrière** : mettre une version à la corbeille dans `_versions` ne
     suffit pas tant qu'elle reste la Release « latest » sur GitHub (le script la
     rapatrie de nouveau sous 15 min). Publier plutôt une version corrigée, plus
     récente.
- **Sécurité du script (depuis 1.9.96).** La page du tableau de bord est publique, et
  Google y laisse appeler toute fonction dont le nom ne finit pas par « _ ». Les
  fonctions de maintenance (`installerComptes`, `testerMiseAJour`, nettoyages…)
  refusent donc de tourner ailleurs que dans l'éditeur, lancées par le propriétaire ;
  `getAllData_` est privée. Ce contrôle lit l'adresse de l'utilisateur : au premier
  lancement d'une de ces fonctions, Google demande une autorisation de plus
  (« voir votre adresse e-mail ») — l'accepter, **AVANT** « Nouvelle version » :
  sinon l'app et le tableau de bord pourraient répondre « Autorisation requise ».
  La purge mensuelle n'accepte que son propre déclencheur, ou le propriétaire.
- **1.9.96 s'installe à la main**, une fois, sur chaque téléphone : la 1.9.95 interroge
  encore GitHub et ne peut pas la voir. Même clé de signature : l'installation passe
  par-dessus, sans désinstaller ni perdre les données.
- **Pas de Play Store** (jamais configuré).

## Ce qui a été livré dans cette session (v1.9.4 → v1.9.9)
- **v1.9.4** — N° de site obligatoire seulement si GESTE CO offert (>0) ou GSM seul.
- **v1.9.5** — Chaque clôture visible dans la page de supervision (fil + refresh auto).
- **v1.9.6** — Tableau de bord **pro par période choisie (Du/Au)** : global + tech par tech,
  recalcul client à partir de données granulaires datées ajoutées à `_stats.json`
  (fraisList, gestes, prices). Presets 7j/30j/Ce mois/Tout + téléchargement zip de la plage.
- **v1.9.7** — Sauvegarde Drive à **nom fixe** `sauvegarde-complete.zip` : chaque sauvegarde
  (hebdo auto + bouton Synchroniser) **écrase** la précédente → pas de surcharge du Drive.
  (Les anciens zips horodatés déjà présents sont à supprimer manuellement une fois.)
- **v1.9.8** — **Note de clôture** (champ observations) ajoutée aux données et affichée
  en colonne « Note » dans le tableau des clôtures du dashboard.
- **v1.9.9** — **Accordéon** : liste des techs = nom + résumé ; clic sur le nom déplie/replie
  la fiche (KPIs, camembert, primes, clôtures). Vue globale toujours ouverte.
  **Détail des frais** : clic sur « Total frais » déplie un tableau date / nature / TTC / TVA / HT
  + totaux. L'app envoie désormais nature+TVA+HT de chaque ticket (via `FraisTva`).

## Sauvegarde / Drive
- Structure : `Sauvegardes G-Systems / <tech> / <mois> / <fichiers>`.
- Fichiers par mois : mail mensuel, pièces jointes (Excel, photos, PDF récap),
  `sauvegarde-complete.zip` (écrasé à chaque sauvegarde), `_stats.json`.
- Récepteur/dashboard = web app Apps Script (`apps-script/Backup.gs`), déployée par
  l'utilisateur. Accès par compte (depuis 1.9.96) : feuille privée « Comptes G-Systems », voir l'en-tête de `apps-script/Backup.gs`. Endpoint /exec en dur dans
  `BackupConfig.kt`.
- `_stats.json` mis à jour à **chaque clôture** (live) et figé à l'**envoi mensuel**.
- Le comptable a un lien vers le dashboard (période Du/Au + téléchargement zip par tech/mois).
- Dossier Drive partagé : https://drive.google.com/drive/folders/1v2ShEEvnxww0SCac_AfVKlLXejLqUA9W

## Notes importantes
- Le **détail frais** (nature/TVA) et les stats granulaires ne se remplissent qu'avec des
  clôtures faites **en v1.9.9+**, ou après un **Réglages → Synchroniser** (repousse tout
  l'historique au nouveau format).
- Toute modif de `apps-script/Backup.gs` nécessite un **redéploiement manuel** du script
  (Déployer → Gérer les déploiements → ✏️ → Nouvelle version).

## En suspens (mis de côté)
- **Icône de l'APK « GS »** : conçue mais **PAS intégrée** (mise en pause — « on oublie »).
  Direction retenue à ce stade : masque arrondi, fond obsidienne `#07080D`,
  **anneau rouge `#E5231F`**, lettres « GS » blanches `#F4F4F0`, avec un peu plus d'espace
  entre G et S. Aucun fichier modifié ; l'icône actuelle reste le « G » blanc sur fond
  violet `#5B3EB1` (`drawable/ic_launcher_foreground.xml` + `values/colors.xml`).
  À reprendre si souhaité (icône adaptative 100 % vectorielle, arcs supportés par Android).

## Pistes / non commencées
- **Play Store** : non configuré. Chantier séparé si voulu (compte développeur, AAB signé,
  clé d'upload, fiche store, politique de confidentialité).
