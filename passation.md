# Passation — G-Systems (sessions du 21/09/2026)

> **MISE À JOUR (session 2, 21/09/2026) — back office RÉPARÉ EN PRODUCTION.**
> Le correctif A de la session 1 (« snapshot vide ») ne suffisait pas : entre-temps le
> cycle **2026-10 a reçu 1 vraie clôture**, donc il n'était plus « vide » et évinçait
> quand même tout le cycle **2026-09** (54 interventions) par chevauchement de 3 jours.
> **Vrai correctif** : dans `getAllData()`, la dédup se fait désormais **au jour**
> (on n'écarte que les jours réellement communs entre deux snapshots, on ne jette
> plus le cycle entier). Déployé (Apps Script Version ≥ 47) + prouvé en live :
> Cédric passe de **160c → 214c** (= +54 = cycle 2026-09), fenêtre 21/08→21/09 = **55**
> interventions au lieu de 1. Bonus : endpoint diagnostic lecture-seule `?debug=snaps`
> (inventaire brut des `_stats.json`). Détails en §2-A et §5.

## 1. Objectif
Corriger trois problèmes signalés par Cédric et diffuser les correctifs :
1. Le **back office** (tableau de bord Apps Script) n'affichait **aucune intervention** sur la période 21/08 → 21/09.
2. Après un **envoi mensuel**, l'app devait **revenir à l'accueil** pour éviter un second appui et un double envoi.
3. Les **observations** (colonne H du .xlsm) **débordaient** hors du cadre imprimable.
+ Symptôme annexe : le **.xlsm n'était pas déposé sur le Drive** dans le dossier du mois alors que l'envoi avait été fait.

## 2. Problématique — résolue / non résolue

### ✅ Résolu (et prouvé par les données réelles du Drive)
- **A — Back office vide : bug du dashboard, pas les données. ✅ DÉPLOYÉ & PROUVÉ EN PROD (session 2).**
  Les données sont intactes : le `_stats.json` du dossier **2026-09 contient 54 interventions**.
  Cause racine RÉELLE : dans `getAllData()` (Backup.gs), la dédup anti-chevauchement triait par `maj` décroissante et, dès qu'un snapshot chevauchait un snapshot déjà retenu, **jetait le snapshot entier**. Le cycle **2026-10** (période 19/09→18/10, `maj` la plus récente) chevauche 2026-09 (22/08→21/09) sur **3 jours** (19–21/09) → tout le cycle 2026-09 (54 interventions) était évincé.
  - *Session 1* avait cru à un **stub vide** 2026-10 et ajouté un garde `estVide` (un snapshot 0 clôture/frais/geste n'est plus compté et ne réserve plus sa plage). Correct mais insuffisant : dès que 2026-10 a reçu **1 vraie clôture**, il n'était plus vide et le bug est revenu.
  - *Session 2* — **vrai correctif** : dédup **au jour** et non au snapshot. On traite du plus récent (`maj` max) au plus ancien et on n'ajoute d'un snapshot que les items dont la **date** n'est pas déjà couverte par un snapshot plus récent (`covered(d)`). Les jours communs ne sont comptés qu'une fois, **sans jeter le cycle plus ancien**. Le garde `estVide` est conservé (empêche un stub vide de réserver une plage). Champs de date : clôture `c.date`, frais `f.d`, geste `g.d`.
  - **Preuve live** : `?debug=data&code=Gsystems` → Cédric **160c/43g → 214c/57g** (= +54 clôtures +14 gestes = cycle 2026-09 pile, aucun double-compte) ; fenêtre 21/08→21/09 = **55** interventions (avant : 1).
  - **Diagnostic** : nouvel endpoint GET lecture-seule `?debug=snaps&code=<CODE>` = inventaire brut par dossier (`periode`, `maj`, nb clôtures/frais/gestes). C'est LUI qui a montré que 2026-10 n'était plus vide (clot=1).
- **B — Retour accueil après envoi** : ajout d'un callback `onSent` déclenché uniquement en cas de succès → `navController.navigate("home") { popUpTo("home") { inclusive = true } }`.
- **C — Observations qui débordent** : `wrapText` (retour à la ligne dans la cellule H, style du gabarit conservé via clone) + plafond **180 caractères**.
- **Réessai upload Drive** : `BackupUploader.uploadBytes` retente **3 fois** (délai 1,5 s / 3 s) avant d'abandonner → un .xlsm ne sera plus « perdu » par un échec réseau ponctuel silencieux.
- **Diffusion** : release **v1.9.86** (versionCode 166) taguée et publiée → APK signé prod `gsystem-v1.9.86.apk` sur GitHub Releases → auto-update pour les techs.

### ⏳ Non résolu / en attente d'action manuelle
- ~~Le correctif A n'est pas encore actif en production.~~ **FAIT (session 2)** : `Backup.gs` redéployé (Version ≥ 47), back office réparé et prouvé en live.
- **Ancien .xlsm manquant sur le Drive** : Cédric l'a **re-déposé à la main** dans `2026-09`. Le réessai évitera que ça se reproduise, mais l'historique passé n'est pas re-poussé automatiquement.
- **Amélioration possible non faite** : faire **remonter visuellement** un échec d'upload à la fin de l'envoi (message à l'écran), en plus du réessai. Le bloc Drive de l'envoi avale encore le résultat.

## 3. Fichiers importants
- `apps-script/Backup.gs` — back-office (dashboard) + endpoints. Fonction clé : `getAllData()` (fusion/dédup **au jour** des `_stats.json` via `covered(d)` + garde `estVide`). Endpoints de debug GET : `?ping=1`, `?debug=data&code=<DASHBOARD_CODE>` (résumé), `?debug=full&code=<DASHBOARD_CODE>` (données fusionnées), `?debug=snaps&code=<DASHBOARD_CODE>` (**inventaire BRUT** des snapshots, avant fusion) ; POST JSON `restore_list` / `photo_pull` (token `SHARED_TOKEN` dans le fichier ; le POST doit préserver la méthode sur la redirection 302 — `curl --post301/302/303`). `DASHBOARD_CODE = 'Gsystems'`. URL /exec = base64 dans `docs/backoffice.html`. **Le déploiement Apps Script est distinct du repo** : après édition, recoller dans `Code.gs` (l'éditeur nomme le fichier `Code.gs`) puis **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version** (sinon l'ancienne version reste servie). Propagation : quelques secondes après « Nouvelle version ».
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
1. ~~[Cédric] Redéployer `Backup.gs`~~ **FAIT (session 2)** : redéployé (Version ≥ 47), back office prouvé réparé (`?debug=data` → 214c, fenêtre 21/08→21/09 = 55). ⚠️ La version déployée est **en avance sur le repo** tant que le commit session 2 (dédup au jour + `?debug=snaps`) n'est pas poussé — voir §2-A.
2. **[Techs] Auto-update** vers 1.9.86 (retour accueil + observations + réessai).
3. **(Optionnel)** Ajouter un **message d'échec d'upload** visible en fin d'envoi (le réessai est fait ; reste à le signaler).
4. **(Optionnel)** Re-synchroniser l'historique si besoin (bouton « Synchroniser » des réglages re-pousse tous les cycles).
5. **(Veille)** Le chevauchement de 3 jours entre cycles (2026-10 commence le 19/09 alors que 2026-09 finit le 21/09) vient des bornes de cycle glissant (`Dates.kt`). La dédup au jour le neutralise côté back office, mais si tu veux supprimer le chevauchement à la source, c'est dans `currentCycle`/`cyclesFor`.

---
*Contexte plus large (hors périmètre de cette session) : publication Play Store en cours sur la branche `playstore` (AAB `bundlePlayRelease`), et fiche « Diagnostic Sécurité » = repo séparé `diagnostic-securite-pwa`.*
