# G-Systems — mémoire projet

> Référence dense pour retrouver vite l'essentiel. MAJ : 2026-07-18.

## Carte mentale

```mermaid
mindmap
  root((G-Systems))
    App Android
      Kotlin + Jetpack Compose
      Thème Obsidian (sombre)
      Accueil à onglets (Sur site / Intervention / Fin de cycle)
      Tuiles
        01 Arrivée sur site (note heure + appel techline)
        02 Attente client (note arrivée + appel)
        03 Appel techline
        04 Clôture (TEMPS) + curseur retard
        05 PV Caméras (PDF signé -> mail client)
        06 Demande caméra (rappel EPS)
        07 Courrier (Viber)
        08 Récap (cumul cycle)
        09 Frais (à rembourser, MOBILE 50% plaf 20€)
        10 Envoi mensuel (Excel + tickets + compteur)
        11 Prime à venir (versement +2 mois, détail par type)
        12 Demande de congé (PDF signé -> bureau)
      Données locales : DataStore + kotlinx.serialization
      Excel .xlsm sur device : Apache POI
      PDF : android.graphics.pdf (PdfDocument + PdfRenderer)
    Apps Script (backend)
      doPost : réception sauvegardes + chat
      doGet : dashboard back-office (DASHBOARD_HTML)
      getAllData : lit les _stats.json (dédup par cycle)
      Chat tech <-> bureau (feuille _gsystem_chat)
      Primes payées (PropertiesService PAID_PRIMES)
    Distribution
      Sideload : tag v* -> Release GitHub (APK auto-update)
      Play Store : branche playstore, tag play-v* -> AAB
      CI GitHub Actions (build-apk + playstore-release)
    Tutos (GitHub Pages)
      docs/index.html (technicien)
      docs/comptable.html (comptable)
      docs/backoffice.html (iframe du /exec)
    Drive
      Sauvegardes G-Systems / <tech> / <mois> / fichiers
      _stats.json (dashboard) + sauvegarde-complete.zip
```

## Architecture (où est quoi)

| Domaine | Emplacement |
|---|---|
| App Compose | `app/src/main/java/com/morpheus45/gsystem/ui/*Screen.kt` |
| Accueil + tuiles | `ui/HomeScreen.kt` (enum HomeGroup, HomeTile, USE_TABBED_HOME) |
| Navigation + routes | `MainActivity.kt` (AppNav, composable("...")) |
| Modèles | `data/Models.kt` (AppSettings, GesteCoEntry, GesteCoPrices, TempsEntry…) |
| Prix primes | `data/Models.kt` GesteCoPrices.TYPES = GSM,CO,DMP,SE,TC,SI,CAM,DACCO,BA,CL,DF,SONDE IN |
| PDF (PV, congé) | `export/PvPdfGenerator.kt`, `export/CongePdfGenerator.kt`, `export/PdfExporter.kt` |
| Email | `email/EmailSender.kt` (Intent ACTION_SEND, CC, sendPdf multi-destinataires) |
| Sauvegarde Drive | `backup/StatsUploader.kt` (push/syncAll), `backup/BackupExporter.kt`, `backup/BackupUploader.kt` |
| Signature doigt | `ui/PvCameraScreen.kt` (SignatureController, SignaturePad internal) |
| Backend dashboard | `apps-script/Backup.gs` (doGet DASHBOARD_HTML, doPost, getAllData) |
| Tuto tech / comptable | `docs/index.html`, `docs/comptable.html`, `docs/backoffice.html` |
| Version app | `app/build.gradle.kts` (versionCode / versionName) |

## Workflows

### Release (double canal)
1. Bump `versionCode` + `versionName` dans `app/build.gradle.kts`.
2. Commit + push `main` → CI compile (vérif).
3. Tag `vX.Y.Z` sur main → CI publie la **Release GitHub** (APK sideload auto-update).
4. `git checkout playstore` → `git merge main` → push → tag `play-vX.Y.Z` → CI build **AAB** (artefact `gsystem-play-aab`).
5. `gh run download <id>` pour récupérer l'AAB → upload manuel Play Console.

### Déploiement Apps Script (dashboard)
- Éditer `apps-script/Backup.gs`, valider syntaxe (voir gotcha template).
- Éditeur script.google.com → coller dans Code.gs → Déployer → **Gérer les déploiements → ✏️ → Nouvelle version → Déployer**.
- URL /exec fixe (ID `AKfycbx…w9t`) = celle embarquée dans `docs/backoffice.html`. « Qui a accès : Tout le monde ».
- Post-déploiement : /exec peut renvoyer « Page introuvable » 1-3 min (propagation, transitoire).

## Règles métier clés
- **NR** : sur le MOIS CIVIL (1→fin). Base = installations réalisées (OK + NR client + NR technique). Taux tech = (NR client + NR technique) / réalisées, attendu ≤ 8 % (vert). On garde aussi le taux brut.
- **Prime** : par type installé × prix. Versée sur salaire à **mois +2** (janvier → mars).
- **Frais remboursables** : MOBILE = 50 % plafonné à 20 € ; sinon 100 %.
- **Cycle** : 21 → 20 par défaut ; glissant si `lastEnvoiDateIso` (début = dernier envoi +1).
- **Dossier Drive** = mois de FIN de cycle (`cycleEnd.take(7)`).

## Problèmes résolus (gotchas)
- **Dashboard figé « Chargement… » (apostrophe)** : le JS client vit dans le template backtick `DASHBOARD_HTML` ; `\'` y devient `'` → deux chaînes collées → `SyntaxError: Unexpected string` → bloc mort. Écrire `\\'`. `node --check` sur la source NE voit PAS le bug : valider la **sortie évaluée** du template (`scratchpad/verify_template.js`). Voir aussi commit `493afb5` (« Aujourd'hui »).
- **google.script.run figé sur gros retour** : sérialiser en CHAÎNE (`getAllDataStr` = `JSON.stringify`) et `JSON.parse` côté client ; le sérialiseur natif échoue sur les gros objets (« Une erreur inconnue s'est produite »). `?debug=data` / `?debug=full` = sondes de diagnostic.
- **Double-comptage primes/frais/clôtures** : un même cycle écrit dans deux dossiers-mois → `getAllData` additionnait 2×. Corrigé par dédup sur `periode` (unique par cycle), en gardant le `maj` le plus récent.
- **Surcharge Go Drive** : `sauvegarde-complete.zip` écrit dans le dossier du mois courant → un zip complet par mois → multiplication. Cible : synchro incrémentale (photos 1 fois, data JSON fusionnée) + restauration par fusion.

## Contraintes / sécurité
- Ne JAMAIS uploader un APK debug local dans le tuto (le CI signe cert `CN=PIPSILY`… ici cert prod). L'AAB Play est re-signé par Google (signature différente de l'APK sideload).
- Ne jamais commiter le keystore prod (.jks) — seulement le cert public.
- L'utilisateur clique le déploiement final Play Console.
- Mails gsystem : texte brut, lignes courtes `LABEL : valeur`, pas de barres ASCII (cassé Outlook mobile).
- Tuto : guide d'onboarding au présent, jamais de numéros de version ni de langage changelog.
