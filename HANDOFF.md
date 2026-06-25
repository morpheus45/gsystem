# G-Systems · Document de transmission

> Snapshot du projet pour reprendre la main rapidement.
> Date : 25 juin 2026 · Version actuelle : **v1.9.9** (versionCode 88)
>
> **v1.9.x — supervision & sauvegarde Drive.** Toute la série v1.9 ajoute un
> écosystème de **sauvegarde + supervision** autour de l'app, sans toucher au
> métier (Viber/mails/Excel inchangés) :
>
> - **Sauvegarde Drive automatique** (`backup/`) : l'app POST ses fichiers vers un
>   **web app Google Apps Script** (`apps-script/Backup.gs`), qui range tout dans
>   `Sauvegardes G-Systems / <tech> / <mois> / <fichier>`. Sauvegarde complète
>   (ZIP) **1×/semaine** à l'ouverture (nom **fixe** `sauvegarde-complete.zip` →
>   la nouvelle écrase l'ancienne, pas d'accumulation).
> - **Stats de supervision** (`StatsUploader`) : à **chaque clôture** et à
>   l'**Envoi Mensuel**, l'app dépose un `_stats.json` (KPIs + répartition +
>   primes/type + liste des clôtures avec note + frais datés nature/TVA + gestes
>   datés + barème). Non bloquant, silencieux si pas de réseau.
> - **Dashboard administratif** (HTML servi par le `doGet` du script) : siglé
>   G-Systems, **période Du/Au** (presets 7j / 30j / ce mois / tout), **vue
>   globale + accordéon par technicien**, camembert répartition, primes/type,
>   **détail des frais (nature · TVA)** dépliable, table des clôtures avec
>   observations, **téléchargement ZIP** de la période, auto-refresh 60 s.
> - **Réglages** : bouton **« Synchroniser tout sur le Drive »** (`onSync` →
>   `StatsUploader.syncAll` rejoue tous les cycles présents + pousse le ZIP complet).
> - **Nouvelle tuile 02 « DEMANDE CAMÉRA »** (`DemandeCameraScreen`, base GSM SEUL) :
>   N° de site + nb de caméras + précisions → email EPS immédiat, sujet
>   `HD-100 - <code tech> - Site numéro <site>`.
> - **Page comptable dédiée** (`docs/comptable.html`) séparée du tuto tech.
> - **Clôture** : N° de site obligatoire **seulement si** GESTE CO offert ou GSM seul.
>
> **Rappel des refontes structurantes précédentes (toujours valables) :**
> **v1.7.0 — CLÔTURE UNIFIÉE** (GSM SEUL + GESTE CO fusionnés dans la clôture d'une
> INST, sections inline) · **v1.8.0 — COMPTEUR fusionné dans ENVOI MENSUEL**
> (capture photo inline) · **v1.8.2/8.3 — restyle « écran réel »** des formulaires
> (`ui/FormStyle.kt`) + typo · **v1.8.4/8.5 — récaps en PDF** (`export/PdfExporter.kt`,
> camembert) + mail mensuel épuré · **v1.8.6 — icônes des tuiles** · **v1.8.7 —
> dialogue « Envois EPS » avec statut ✓/✗** · **v1.8.8 — suppression en cascade**
> (`tempsId` + `removeTempsCascade`).

---

## 1. Vue d'ensemble

**G-Systems** est une application Android (Kotlin + Jetpack Compose) pour
techniciens d'alarme/sécurité électronique. Elle remplace 4 outils
manuels (Excel, mails, Viber, photos) par **un seul écran d'accueil avec
7 tuiles**, et **remonte automatiquement les chiffres de chaque tech sur un
Drive partagé** consultable via un dashboard administratif (supervision compta).

- **Repo GitHub** : <https://github.com/morpheus45/gsystem>
- **Tutoriel tech** : <https://morpheus45.github.io/gsystem/>
- **Page comptable** : <https://morpheus45.github.io/gsystem/comptable.html>
- **APK direct** : `https://github.com/morpheus45/gsystem/releases/latest/download/app-debug.apk`
- **Dashboard admin** : le `/exec` du déploiement Apps Script (cf. `BackupConfig.ENDPOINT`)
- **Utilisateur principal** : Cedric Lago Gomez (ISTGS54), G-Systems FR
- **OS cible** : Android 8.0+ (minSdk 26, targetSdk 34)

---

## 2. Les 7 tuiles de l'accueil

Palette continue **violet → vert** (effet « waterfall » : chaque tuile finit sur
la couleur de départ de la suivante ; CLÔTURE reste l'ancrage violet). Chaque
écran reprend la couleur de sa tuile. Valeurs dans `theme/Color.kt`.
⚠ Le commentaire `// ============ 6 TUILES` dans `HomeScreen.kt` est **périmé**
(il y en a 7 depuis l'ajout de DEMANDE CAMÉRA) — cosmétique, à corriger.

| N° | Tuile | Icône | Rôle |
|---|---|---|---|
| 01 | **CLÔTURE** | `Assignment` | Intervention + Viber. **Pour une INST** : N° de site + sections **GESTE CO** (tableau 12 types) et **GSM seul** inline, puis dialogue « Envois EPS » (mails). **Note de clôture** (observations) saisissable |
| 02 | **DEMANDE CAMÉRA** | `Videocam` | Formulaire court (N° site + nb caméras + précisions) → email EPS immédiat, sujet `HD-100 - <code tech> - Site numéro <site>` |
| 03 | **ATTENTE CLIENT** | `Timer` | Toast consigne perso (appels /15 min, techline) + Viber « PROCÉDURE ATTENTE CLIENT · Début : HHhMM » |
| 04 | **COURRIER** | `Email` | 1 appui → Viber « courrier ok » |
| 05 | **RÉCAP** | `BarChart` | Cumul cycle GESTE CO + primes + total € · export **PDF** par mail |
| 06 | **FRAIS** | `Receipt` | Photos tickets + TTC + TVA auto + envoi lot |
| 07 | **ENVOI MENSUEL** | `Outbox` | **Photo compteur (capture inline)** + Excel .xlsm + tickets + **récap PDF (camembert)** en 1 mail |

> **DEMANDE CAMÉRA (02)** ouvre un écran (`DemandeCameraScreen`, route
> `demande_camera`) bâti sur l'ancien GSM SEUL : `sendCameraEmail` envoie vers
> `effectiveEpsTo` + Cc EPS, **pas de Viber**. **ATTENTE CLIENT (03)** et
> **COURRIER (04)** n'ouvrent **pas** d'écran : leur `onClick` (dans
> `MainActivity`) déclenche directement un partage Viber. ATTENTE CLIENT affiche
> en plus un **Toast** de consigne perso au tech (`ViberSender.ATTENTE_RAPPEL_TECH`)
> puis partage `ViberSender.attenteClientMessage()` (heure de début figée au clic).
> COURRIER partage `"courrier ok"`.

> **GSM SEUL et GESTE CO ne sont plus des tuiles** (depuis v1.7.0) : fusionnés
> dans la CLÔTURE d'une installation. Mails/Viber **identiques** (code réutilisé
> via `InstallExtras.kt` + `sendGsmEmail`/`sendGesteCoEmail` passés `internal`).
> Les composables publics `GsmSeulScreen`/`GesteCoScreen` et `CompteurScreen`
> subsistent en **code mort** (plus de route).

Le pip rose pulsant apparaît sur **07 ENVOI MENSUEL** dans les **3 derniers
jours du cycle** (`endOfCycleApproaching`, basé sur `cycleEnd`).

---

## 3. Stack technique

```
Kotlin 1.9.x + Jetpack Compose Material 3 (BOM 2024.06.00)
├── kotlinx.serialization (JSON)
├── DataStore (préférences)
├── Apache POI 5.2.5 (remplissage .xlsm sur device)
│     ⚠ GARDER log4j-api 2.21.1, exclure SEULEMENT log4j-core (voir §10)
├── Coil 2.5 (miniatures)
├── Coroutines 1.8
├── org.json (payloads stats/backup vers Apps Script)
└── android.graphics.pdf.PdfDocument (récaps PDF, aucune dépendance)

CI : GitHub Actions (.github/workflows/) → APK signée, publication auto d'une
     Release avec asset .apk sur tag `v*`
Signing : clé de PRODUCTION (GitHub secrets) en priorité depuis v1.0.0 ;
          repli automatique sur keystore/debug.keystore (committé exprès, stable)
          si la clé prod est absente. storeFile prod JAMAIS commité.
Backend léger : Google Apps Script (apps-script/Backup.gs) — Drive partagé,
          réception des fichiers + dashboard admin. Pas de serveur à maintenir.
```

---

## 4. Arborescence clé

```
app/src/main/
├── AndroidManifest.xml
├── java/com/morpheus45/gsystem/
│   ├── MainActivity.kt              ← NavHost : home/settings/temps/gesteco_recap/
│   │                                  demande_camera/frais/envoi_mensuel.
│   │                                  Sauvegarde Drive auto (1×/sem), check MAJ,
│   │                                  splash, période partagée, onSync Réglages.
│   ├── backup/                      ← ★ NOUVEAU (v1.9) — sauvegarde + supervision
│   │   ├── BackupConfig.kt          ← ENDPOINT (web app /exec) + TOKEN partagé +
│   │   │                              BACKUP_INTERVAL_MS (7 j)
│   │   ├── BackupExporter.kt        ← createBackupZip(context, settingsJson)
│   │   ├── BackupUploader.kt        ← POST JSON {token,user,month,fileName,
│   │   │                              mimeType,dataBase64} → Drive. Non bloquant.
│   │   └── StatsUploader.kt         ← push() (à chaque clôture + mensuel) écrit
│   │                                  _stats.json ; syncAll() rejoue tous les cycles
│   ├── data/
│   │   ├── Models.kt                ← TempsEntry (+ observations), GsmSeulEntry
│   │   │                              (+ tempsId), GesteCoEntry (+ observations,
│   │   │                              tempsId, installedList/totalInstalled/
│   │   │                              totalPrime), FraisTicket, CompteurEntry,
│   │   │                              EntriesStore, AppSettings, GesteCoPrices
│   │   ├── EntriesRepository.kt     ← Storage JSON + removeTempsCascade()
│   │   └── SettingsStore.kt         ← DataStore
│   ├── excel/ExcelFiller.kt         ← Remplissage .xlsm via POI (macros VBA conservées)
│   ├── export/
│   │   ├── CsvExporter.kt
│   │   └── PdfExporter.kt           ← RÉCAP GESTE CO + récap mensuel en PDF (camembert)
│   ├── email/EmailSender.kt         ← send() + sendMulti() (1 PJ ACTION_SEND /
│   │                                  n PJ ACTION_SEND_MULTIPLE + ClipData)
│   ├── viber/ViberSender.kt         ← buildMessage() + OBSERVATION_LABELS +
│   │                                  share() + attenteClientMessage() +
│   │                                  ATTENTE_RAPPEL_TECH (Toast consigne perso)
│   ├── photos/PhotoStorage.kt       ← newCompteurFile, nommage des PJ
│   ├── security/IntegrityGuard.kt   ← anti-tamper (bloque copie re-signée)
│   ├── ui/
│   │   ├── HomeScreen.kt            ← 7 tuiles, data live, footer
│   │   ├── DemandeCameraScreen.kt   ← ★ NOUVEAU — formulaire caméra → email EPS
│   │   ├── InstallExtras.kt         ← sections GESTE CO + GSM inline de la clôture INST
│   │   ├── TempsScreen.kt           ← Formulaire intervention (+ note) ; appelle
│   │   │                              StatsUploader.push à la clôture
│   │   ├── EnvoiMensuelScreen.kt    ← Excel + PJ renommées + récap PDF + capture
│   │   │                              compteur inline ; StatsUploader.push (figé)
│   │   ├── FraisScreen.kt           ← période éditable, totaux TTC/TVA/HT
│   │   ├── GesteCoRecapScreen.kt    ← RÉCAP, export PDF, suppression d'un site
│   │   ├── SettingsScreen.kt        ← onSync « Synchroniser tout sur le Drive »
│   │   ├── FormStyle.kt             ← FormHeaderBar / AccentCard / AccentTextField
│   │   ├── GsmSeulScreen.kt / GesteCoScreen.kt / CompteurScreen.kt ← code mort
│   │   ├── SplashScreen.kt
│   │   ├── components/IndicatorCalm.kt  ← CategoryTile, HomeBigButton, etc.
│   │   ├── theme/ (Color.kt, Type.kt, Theme.kt)
│   │   └── common/Common.kt          ← PeriodHeader + EditablePeriodHeader (Du/Au)
│   ├── update/ (UpdateChecker.kt, UpdateDialog.kt, UpdateInstaller.kt)
│   └── util/ (Dates.kt = DateUtil, FraisTva.kt, HoursCalculator.kt)
│
├── res/xml/backup_rules.xml
└── res/ (font/, drawable/, mipmap-*/, values/)

apps-script/Backup.gs                ← ★ NOUVEAU — web app Drive : doPost (réception
                                        fichiers) + doGet (dashboard admin HTML) +
                                        getAllData + makeZip(from,to)
docs/
├── index.html                       ← Tutoriel tech (GitHub Pages, logo SVG animé)
├── comptable.html                   ← ★ NOUVEAU — page comptable dédiée
└── ROLLBACK_v0.13.14.md

app/src/main/assets/bon_retour/      ← ⚠ ORPHELIN (ancienne PWA BON RETOUR). À nettoyer.
.github/workflows/                   ← CI Android build + release auto
keystore/debug.keystore              ← Clé stable signée
```

---

## 5. Sauvegarde Drive & supervision (★ cœur de la v1.9)

### Principe
Aucun serveur à héberger : un **web app Google Apps Script** (`apps-script/Backup.gs`,
déployé en « Exécuter en tant que MOI / accès Tout le monde ») reçoit les POST de
l'app et sert le dashboard. L'URL `/exec` et le `TOKEN` partagé sont **codés en
dur** dans `BackupConfig` (comme les adresses mail) → pour changer de Drive,
éditer `ENDPOINT`/`TOKEN` **des deux côtés** (Kotlin + `SHARED_TOKEN` du script)
puis publier une MAJ + une nouvelle version du déploiement.

### Flux app → Drive
- `BackupUploader.uploadBytes(user, month, fileName, mimeType, bytes)` :
  POST JSON `{token, user, month, fileName, mimeType, dataBase64}`. Le script
  range dans `Sauvegardes G-Systems / <user> / <month> / <fileName>` (un fichier
  de même nom est remplacé). **`instanceFollowRedirects = true`** (le `/exec`
  renvoie un 302). Tolérant à l'échec → retourne `false`, ne casse jamais l'app.
- **Sauvegarde complète auto** (`MainActivity`, `LaunchedEffect`) : 1×/semaine à
  l'ouverture si `now - lastDriveBackup ≥ BACKUP_INTERVAL_MS`. ZIP via
  `BackupExporter.createBackupZip`, **nom fixe `sauvegarde-complete.zip`**
  (écrase la précédente). Met à jour `settings.lastDriveBackup`.
- **Stats live** (`StatsUploader.push`) appelée dans `TempsScreen` (à chaque
  clôture, ×2) et `EnvoiMensuelScreen` (figé à l'envoi). Écrit `_stats.json` :
  KPIs (interventions, tickets, frais €, primes, extensions, compteur),
  `repartition` (par type), `primesParType`, `clotures` (date/type/client/ville/
  num/obs/**note**), `fraisList` (datés, cat, TVA, HT), `gestes` (datés, qty/type),
  `prices` (barème). → le dashboard recalcule sur n'importe quelle période.
- **Sync manuelle** (Réglages → `onSync`) : `StatsUploader.syncAll` rejoue **tous
  les cycles** présents dans les données + repousse le ZIP complet. Retourne un
  message (« ✅ N mois synchronisés »).

### Dashboard admin (`doGet` → `DASHBOARD_HTML`)
Page sombre siglée G-Systems : barre **Du/Au** + presets (7 j / 30 j / ce mois /
tout), **vue globale** (agrégat tous techs) + **une carte accordéon par tech**.
Chaque carte : chips KPIs, **détail des frais (nature · TVA)** dépliable,
**camembert** répartition interventions (conic-gradient), **primes par type**,
**table des clôtures** (avec colonne Note/observations, code couleur OK/NR/Annulé).
Bouton **⬇ Télécharger** → `makeZip(from, to)` zippe tous les fichiers du Drive
sur la période (un sous-dossier `tech/mois/`) et renvoie un lien public temporaire
(`_telechargements`, purgé après 1 h). Auto-refresh `getAllData` toutes les 60 s.

---

## 6. Règles métier critiques (à ne pas casser)

### Calcul des heures (HoursCalculator.kt)
- **VACANCES / FORMATION / FERIE** : journée entière fixe = **7h**
- Autres : par jour, créneaux Matin + Après-midi
  - 0 actif → 0h · 1 actif → 4h · 2 actifs OK+OK → **8h** · 2 actifs avec ≥1 NR → 6h

### Cycle de paie & période partagée
- Par défaut : du **21** du mois → 20 du mois suivant (`settings.cycleStartDay`)
- `DateUtil.cyclePeriod(today, startDay)` retourne `(start, end)`
- **Période éditable partagée** : l'état `periodStart/periodEnd` vit dans
  `MainActivity.AppNav` et est passé à **Temps, Frais et Envoi Mensuel**
  (propagation via `onPeriodChange` ; `onResetPeriod` revient au cycle auto).

### Clôture d'une installation (INST)
- Sections **GESTE CO** (12 types) + **GSM seul** inline (`InstallExtras.kt`),
  réutilisent `ExtRow`/`MAX_GIFT_EUR` + `sendGesteCoEmail`/`sendGsmEmail`.
- **N° intervention obligatoire** ; **N° de site obligatoire SEULEMENT si** un
  GESTE CO est offert ou GSM seul coché (v1.9, commit e6d6500).
- Clôturer crée une entrée **TEMPS + (GESTE CO) + (GSM)** liées par `tempsId`.
  Supprimer l'intervention passe par `removeTempsCascade()` (sinon orphelins dans
  RÉCAP/primes). Le RÉCAP permet aussi de supprimer un site à la main.
- **Note de clôture** (`observations`) remonte dans `_stats.json` → dashboard.

### Frais & TVA (FraisTva.kt)
- Le tech saisit un montant **TTC** ; l'app déduit HT et TVA par catégorie
  (`RATES`, défaut 20 %). Récap frais dans le **PDF** mensuel (mail épuré).

### Nommage des pièces jointes (PhotoStorage.kt, à l'envoi)
- Tickets frais → `FRAIS-<CATÉGORIE>.<ext>` (suffixe `-2`, `-3`… si doublon)
- Compteur → `<PLAQUE>-<MM>-<AAAA>.jpg`

### Emails
- 2 groupes : **GS** (interne : TEMPS, FRAIS, COMPTEUR) et **EPS** (clients :
  GSM SEUL, GESTE CO, **DEMANDE CAMÉRA**). Email perso en Cc sur Envoi Mensuel.
- **Destinataires fixes codés en dur** (`AppSettings.companion`), masqués dans Réglages :
  - `FIXED_GS_TO   = "fdt@fggestion.fr"`            → `effectiveGsTo`
  - `FIXED_EPS_TO  = "epsinfotechline@eps.e-i.com"` → `effectiveEpsTo`
  - `FIXED_EPS_CC1 = "johanna@fggestion.fr"`        → `effectiveEpsCc1`
  - ⚠ Changer une adresse = éditer la constante puis **publier une MAJ**.
- **Seul champ email éditable = « Responsable secteur »** (`emailEpsCc2` /
  `effectiveEpsCc2`), **OBLIGATOIRE** (`isReady`). Tous les écrans lisent les
  getters `effective*`.
- `EmailSender` : 1 PJ → ACTION_SEND ; n PJ → ACTION_SEND_MULTIPLE. ClipData +
  `FLAG_GRANT_READ_URI_PERMISSION` sur l'intent ET le chooser (sinon PJ perdues).

### Envoi Mensuel
- Bouton **bloqué tant qu'aucune photo compteur** sur la période
  (`hasCompteurPhoto`) — capture inline dans l'écran (caméra + permission). Photo
  jointe + renommée `<PLAQUE>-<MM>-<AAAA>.jpg` auto.
- **Récap PRIMES GESTE CO** + répartition TEMPS dans le **PDF** joint (corps de
  mail épuré : période + liste des PJ). Va vers GS (`fdt@fggestion.fr`) + copie perso.
- Déclenche `StatsUploader.push` (stats du cycle figées au dashboard).

### GESTE CO — règles cadeau
- Cadeau client ≤ **4,50 €** ; offertes ≤ moitié des installées ; dérogation EPS.
  Primes (€, internes) ≠ cadeau client (€). **TYPES** (`GesteCoPrices.TYPES`)
  pilote RÉCAP, CSV/PDF et `StatsUploader` → ajouter un type = toucher tous ces points.

### Sauvegarde locale
- ZIP exportable manuellement + sauvegarde Drive auto. **JAMAIS** d'effacement
  auto à l'upgrade.

---

## 7. Auto-update

`UpdateChecker.kt` appelle `GET /repos/morpheus45/gsystem/releases/latest`,
compare le semver, exige un asset `.apk`. `checkForUpdateSilently()` tourne
**une fois par session** au lancement (MainActivity). La clé
`keystore/debug.keystore` est partagée (local + CI) → MAJ sans réinstall.
**Ne JAMAIS la regénérer** sinon les utilisateurs perdent leurs données.

- Prereleases exclues par `releases/latest`. Promotion : `gh release edit vX.Y.Z --prerelease=false --latest` (mais `gh` indisponible sur le poste → API REST).

---

## 8. Workflow de release (CI auto sur tag)

```bash
# 1. Bump version : app/build.gradle.kts → versionCode + versionName
# 2. Commit + tag + push (le push du tag v* déclenche build + release auto)
git add <fichiers> && git commit -m "vX.Y.Z: ..."
git tag vX.Y.Z && git push origin HEAD --tags
# 3. Surveiller (gh ABSENT → curl sur l'API, rate-limit 60/h non authentifié)
curl -s "https://api.github.com/repos/morpheus45/gsystem/actions/runs?per_page=3" | grep '"status"'
# 4. Vérifier la Release + asset .apk
curl -s "https://api.github.com/repos/morpheus45/gsystem/releases/latest" | grep -E '"tag_name"|\.apk'
```

> ⚠ **`gh` (GitHub CLI) n'est pas installé** sur la machine — passer par l'API REST `curl`.

---

## 9. État actuel — v1.9.9

### Évolutions de la série v1.9 (juin 2026)
- **v1.9.0 — supervision** : `StatsUploader` met à jour les stats compta à chaque
  clôture ; premier dashboard Apps Script.
- **v1.9.x — Réglages** : bouton « Synchroniser tout sur le Drive » + rangement
  Drive **Tech → Mois**.
- **v1.9.x — stats enrichies** : répartition + primes/type + dashboard admin siglé.
- **v1.9.x — supervision fine** : chaque clôture visible ; dashboard pro avec
  période Du/Au global + par tech ; note de clôture (observations) ; **accordéon
  par tech + détail des frais (nature/TVA)**.
- **v1.9.x — sauvegarde Drive** : mail mensuel + zip hebdo ; **nom de zip fixe**
  (la nouvelle écrase l'ancienne) ; dégradé des tuiles préservé.
- **DEMANDE CAMÉRA** : nouvelle tuile N°2 (base GSM SEUL) → email EPS.
- **docs** : page comptable dédiée (`comptable.html`), séparée du tuto tech.
- **Clôture** : N° de site obligatoire **seulement si** GESTE CO offert ou GSM seul.

### Pas encore fait (idées v2.x)
- [ ] Nettoyer `app/src/main/assets/bon_retour/` (orphelin) + WebView restante.
- [ ] Corriger le commentaire périmé `// 6 TUILES` dans `HomeScreen.kt` (→ 7).
- [ ] Supprimer le code mort `GsmSeulScreen`/`GesteCoScreen`/`CompteurScreen`.
- [ ] Affiner les taux TVA par catégorie (`FraisTva.RATES`, tout à 20 % aujourd'hui).
- [ ] Total € live dans la tuile 05 RÉCAP ; heures cumulées dans la tuile 01 CLÔTURE.
- [ ] Tests UI Compose.

---

## 10. Pièges à éviter

1. **Ne pas regénérer `keystore/debug.keystore`** → casse les MAJ et les données.
2. **Apache POI / log4j** : CONSERVER `log4j-api` 2.21.1, exclure **uniquement**
   `log4j-core` (`configurations.all { exclude(module = "log4j-core") }`).
   Tout exclure → `NoClassDefFoundError` au remplissage Excel.
3. **Pièces jointes mail** : sans `ClipData` + `FLAG_GRANT_READ_URI_PERMISSION`
   sur l'intent ET le chooser, les PJ disparaissent après le sélecteur.
4. **Backup / dashboard** : le `TOKEN` doit être **identique** dans
   `BackupConfig.TOKEN` (Kotlin) et `SHARED_TOKEN` (`Backup.gs`). Après édition du
   script, **redéployer une nouvelle version** sinon le `/exec` sert l'ancienne.
   Le POST suit un **302** (`instanceFollowRedirects = true` obligatoire).
5. **Ne pas modifier `OBSERVATION_LABELS` (ViberSender.kt)** sans valider le
   format reçu côté groupe Viber (Cedric a un format précis attendu).
6. **Période partagée** : `Temps`, `Frais`, `EnvoiMensuel` lisent le même
   `periodStart/periodEnd` ; garder `onPeriodChange` cohérent.
7. **`gh` indisponible** → API REST via `curl`.
8. **CI** : minSdk = **26** obligatoire (POI dépend de MethodHandle Android O+).
9. **BON RETOUR supprimé** : ne pas réintroduire de références.

---

## 11. Contacts / contexte

- **Dev/utilisateur principal** : Cedric (morpheus45 GitHub)
- **Société** : G-Systems FR (sécurité électronique / alarme)
- **Code tech Cedric** : ISTGS54 — **code technicien** (propre à chaque tech),
  saisi dans Réglages, préfixe des sujets d'email. Champ `siteCodeFixe` (nom JSON
  historique). Utiliser `ISTGSXXX` comme exemple en doc.
- L'app est utilisée quotidiennement par Cedric, en cours d'extension à l'équipe
  (d'où la supervision Drive : voir les chiffres de chaque tech).

---

## 12. Préférences de collaboration

- L'utilisateur veut du résultat **rapide et visuel** ; il ne touche pas au code,
  teste sur son téléphone et donne des retours en français parlé (souvent courts /
  en majuscules). « c'est moche » = **pivot complet**.
- **Toujours montrer le `git diff` et attendre validation (« go »)** avant tout
  commit/push sur les repos morpheus45.
- Respecter le keystore stable et la rétention des données : le passage d'une
  version à l'autre doit être **invisible pour les données**.
- **Ne pas commiter `.claude/`**.

---

*Document mis à jour pour v1.9.9 (versionCode 88) : écosystème sauvegarde Drive +
supervision (Apps Script, StatsUploader, dashboard admin global/par-tech avec
période, camembert, primes, frais nature/TVA, clôtures + notes, ZIP), bouton
« Synchroniser tout sur le Drive », nouvelle tuile DEMANDE CAMÉRA, page comptable
dédiée, N° de site conditionnel à la clôture. Bon courage pour la suite.*
