# Passation — G-Systems (session du 21/09/2026)

## 1. Objectif
Corriger trois problèmes signalés par Cédric et diffuser les correctifs :
1. Le **back office** (tableau de bord Apps Script) n'affichait **aucune intervention** sur la période 21/08 → 21/09.
2. Après un **envoi mensuel**, l'app devait **revenir à l'accueil** pour éviter un second appui et un double envoi.
3. Les **observations** (colonne H du .xlsm) **débordaient** hors du cadre imprimable.
+ Symptôme annexe : le **.xlsm n'était pas déposé sur le Drive** dans le dossier du mois alors que l'envoi avait été fait.

## 2. Problématique — résolue / non résolue

### ✅ Résolu (et prouvé par les données réelles du Drive)
- **A — Back office vide : bug du dashboard, pas les données.**
  Les données sont intactes : le `_stats.json` du dossier **2026-09 contient 54 interventions** (24/08 → 18/09).
  Cause racine : dans `getAllData()` (Backup.gs), la déduplication anti-chevauchement trie par `maj` décroissante et garde le plus récent. Le **stub _stats.json VIDE du cycle suivant** (dossier **2026-10**, période 19/09→18/10, créé automatiquement à l'envoi, `maj` la plus récente) **chevauchait** 2026-09 sur 3 jours (19–21/09) et **évinçait le vrai snapshot**.
  Correctif : un snapshot **vide** (0 clôture / 0 frais / 0 geste) n'est plus compté et **ne réserve plus sa plage de dates**. Simulation sur les vrais snapshots → 2026-09 conservé (102 interventions visibles).
- **B — Retour accueil après envoi** : ajout d'un callback `onSent` déclenché uniquement en cas de succès → `navController.navigate("home") { popUpTo("home") { inclusive = true } }`.
- **C — Observations qui débordent** : `wrapText` (retour à la ligne dans la cellule H, style du gabarit conservé via clone) + plafond **180 caractères**.
- **Réessai upload Drive** : `BackupUploader.uploadBytes` retente **3 fois** (délai 1,5 s / 3 s) avant d'abandonner → un .xlsm ne sera plus « perdu » par un échec réseau ponctuel silencieux.
- **Diffusion** : release **v1.9.86** (versionCode 166) taguée et publiée → APK signé prod `gsystem-v1.9.86.apk` sur GitHub Releases → auto-update pour les techs.

### ⏳ Non résolu / en attente d'action manuelle
- **Le correctif A n'est PAS encore actif en production.** Le back office tourne sur le **déploiement Apps Script**, pas sur le repo. Il faut **redéployer `Backup.gs`** (voir §5). Tant que ce n'est pas fait, la fenêtre 21/08→21/09 reste vide.
- **Ancien .xlsm manquant sur le Drive** : Cédric l'a **re-déposé à la main** dans `2026-09`. Le réessai évitera que ça se reproduise, mais l'historique passé n'est pas re-poussé automatiquement.
- **Amélioration possible non faite** : faire **remonter visuellement** un échec d'upload à la fin de l'envoi (message à l'écran), en plus du réessai. Le bloc Drive de l'envoi avale encore le résultat.

## 3. Fichiers importants
- `apps-script/Backup.gs` — back-office (dashboard) + endpoints. Fonction clé : `getAllData()` (fusion/dédup des `_stats.json`). Endpoints de debug : `?ping=1`, `?debug=data&code=<DASHBOARD_CODE>`, `?debug=full&code=<DASHBOARD_CODE>` ; POST JSON `restore_list` / `photo_pull` (token dans le fichier). URL /exec = base64 dans `docs/backoffice.html`.
- `app/src/main/java/com/morpheus45/gsystem/ui/EnvoiMensuelScreen.kt` — écran envoi mensuel (param `onSent`, capture succès).
- `app/src/main/java/com/morpheus45/gsystem/MainActivity.kt` — navigation (`composable("envoi_mensuel")` câble `onSent`).
- `app/src/main/java/com/morpheus45/gsystem/excel/ExcelFiller.kt` — remplissage .xlsm (`buildObservation`, `setWrap`, `MAX_OBS_LEN`).
- `app/src/main/java/com/morpheus45/gsystem/backup/BackupUploader.kt` — uploads Drive (réessai `MAX_TRIES`/`attemptUpload`).
- `app/src/main/java/com/morpheus45/gsystem/backup/StatsUploader.kt` — génère `_stats.json` (dossier = **mois de FIN de cycle**, `month = end.take(7)`).
- `app/src/main/java/com/morpheus45/gsystem/util/Dates.kt` — `currentCycle` / `cyclesFor` (cycle glissant ancré sur le dernier envoi ; bascule le 21).
- `.github/workflows/android-build.yml` — build APK ; **publie une Release** uniquement sur un **tag `v*`**.

## 4. Ce que j'ai essayé et raté (pour gagner du temps la prochaine fois)
- **Fausse piste sur la source du back office** : d'abord cherché dans `inventaire/diagnostic-securite-pwa` puis dans le tuto `gsystem/docs/index.html`. En réalité le back office est une **iframe Apps Script** (`Backup.gs`), et l'écran « Diagnostic Sécurité » était encore un autre projet.
- **Chrome piloté = impasse** : l'extension bloque les domaines Google (Play Console, Drive, Apps Script) → impossible de piloter le back office par le navigateur.
- **Diagnostic « au feeling » recadré** : j'ai d'abord supposé un décalage de mois ; Cédric a demandé des **preuves**. La bonne méthode a été d'interroger le service Apps Script en **lecture seule** via `curl`/`urllib` sur les endpoints `?debug` et `photo_pull` → preuve chiffrée (159 clôtures, max 17/08, 2026-09 = 54 interventions, stub 2026-10 vide).
- **Push initial rejeté** (main avait avancé, release 1.9.85) → résolu par `git fetch` + `git rebase origin/main`.

## 5. Prochaines étapes
1. **[Cédric] Redéployer `Backup.gs`** : éditeur Apps Script → coller la version du repo → **Déployer → Gérer les déploiements → (crayon) le déploiement existant → Version : Nouvelle version → Déployer**. Puis vérifier que 21/08→21/09 affiche les 54 interventions (re-tester via `?debug=data&code=…` : le nb de clôtures doit augmenter).
2. **[Techs] Auto-update** vers 1.9.86 (retour accueil + observations + réessai).
3. **(Optionnel)** Ajouter un **message d'échec d'upload** visible en fin d'envoi (le réessai est fait ; reste à le signaler).
4. **(Optionnel)** Re-synchroniser l'historique si besoin (bouton « Synchroniser » des réglages re-pousse tous les cycles).

---
*Contexte plus large (hors périmètre de cette session) : publication Play Store en cours sur la branche `playstore` (AAB `bundlePlayRelease`), et fiche « Diagnostic Sécurité » = repo séparé `diagnostic-securite-pwa`.*
