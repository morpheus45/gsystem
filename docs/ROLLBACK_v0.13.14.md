# Snapshot G-Systems v0.13.14 — point de rollback

Document de référence permettant de revenir à l'état v0.13.14 si jamais
les changements de v0.14.0 (intégration retour matériel + refonte design)
posent problème.

Date du snapshot : 1er juin 2026
Commit de référence : `3a05020` (release v0.13.14)
Lien : <https://github.com/morpheus45/gsystem/releases/tag/v0.13.14>

---

## État de l'app à v0.13.14 (avant changements)

### 7 boutons sur l'accueil
1. **TEMPS** (violet) — feuille de temps, slot Matin/Aprem, types VACANCES/FORMATION (7h), Viber auto
2. **GSM SEUL** (bleu) — 1 site = 1 email (sujet `GSM SEUL - ISTGS54 - n°`)
3. **GESTE CO** (vert) — Installé/Cadeau par type, EPS HOTLINE, validation règles
4. **RÉCAP GESTE CO** (vert clair) — primes par type, formule explicite
5. **TICKETS DE FRAIS** (orange) — photos + PDF, REPAS/PARKING/AUTRE
6. **COMPTEUR VOITURE** (bleu canard) — photo seule
7. **ENVOI MENSUEL** (bleu) — Excel + tickets + compteur + snapshot archive

### Réglages clés
- 2 groupes emails : **GS** (TEMPS/Frais/Compteur) et **EPS** (GSM/GESTE CO)
- Email perso (Cc auto envoi mensuel)
- Code site fixe `ISTGS54`
- Cycle mensuel 21 → 20 (modifiable)
- Tarifs primes (GSM 3 / CO 2 / DMP 2 / SE 4)
- Tarifs cadeau client (GSM 3 / CO 1,50 / DMP 3 / SE 4,50)
- Plaque voiture
- Sauvegarde ZIP (incluant `excel_archives/`)
- Vérifier mises à jour

### Algorithme heures auto
- 0 slot actif → 0h
- 1 slot actif (OK ou NR) → 4h
- 2 slots actifs, les deux avec un OK → 8h
- 2 slots actifs, sinon → 6h
- VACANCES ou FORMATION → 7h (override)

### CSV récap GESTE CO
- BOM UTF-8 + `sep=;` en première ligne
- 3 blocs : MES PRIMES / CADEAUX CLIENT OFFERTS / DÉTAIL PAR SITE
- TOTAL aligné (B11 = somme qty, D11 = somme prime)

### Infrastructure
- Repo public : <https://github.com/morpheus45/gsystem>
- Page tuto : <https://morpheus45.github.io/gsystem/>
- Build CI auto à chaque push (GitHub Actions)
- Mises à jour auto via popup (signature stable depuis v0.6.0)
- Apache POI pour remplir le `.xlsm` directement sur le téléphone
- min SDK 26 (Android 8.0+)

### Modèles de données (entries.json)
- `TempsEntry` : id, date, departement, typeMission, nomClient, ville,
  numeroIntervention, observationType, observations, slotMidi, heures
- `GsmSeulEntry` : id, date, siteNumber, nomClient, observations,
  pasMediasExploitables, cablesLaissesSurSite
- `GesteCoEntry` : id, date, siteNumber, installedGsm/Co/Dmp/Se,
  offeredGsm/Co/Dmp/Se, epsDerogation, nomClient, observations
- `FraisTicket` : id, date, timestamp, fileName, categorie, montantEur, observations
- `CompteurEntry` : id, date, timestamp, fileName, kilometres, observations

### AppSettings
```kotlin
emailGsTo / emailGsCc1 / emailGsCc2          // Groupe GS
emailEpsTo / emailEpsCc1 / emailEpsCc2        // Groupe EPS
emailMoi                                       // Cc perso envoi mensuel
siteCodeFixe = "ISTGS54"
cycleStartDay = 21
prices = GesteCoPrices(3, 2, 2, 4)
clientGifts = GesteCoClientGifts(3, 1.5, 3, 4.5)
nomUtilisateur
departementDefaut = "34"
plaqueVoiture
emailFrais        // legacy
excelFileUri / excelFileName
```

---

## Comment revenir à v0.13.14 si v0.14.0 pose souci

### Côté code (git)
```bash
cd C:\Users\cedri\Projects\gsystem
git reset --hard 3a05020   # SHA du commit v0.13.14
git push --force-with-lease origin main   # uniquement si décidé en concertation
```

### Côté APK utilisateur
- Aller sur <https://github.com/morpheus45/gsystem/releases/tag/v0.13.14>
- Télécharger `app-debug.apk`
- Désinstaller la version actuelle (Paramètres → Apps → G-Systems → Désinstaller)
- Réinstaller v0.13.14

Les données utilisateur (entries.json, photos, etc.) sont conservées
tant qu'on ne désinstalle pas. Une fois désinstallé, il faut une
sauvegarde ZIP pour les restaurer.

---

## Fichiers principaux v0.13.14 (chemins relatifs au repo)

```
app/src/main/java/com/morpheus45/gsystem/
├── MainActivity.kt                # navigation NavHost, 7 routes
├── data/
│   ├── Models.kt                  # AppSettings + 5 entities
│   ├── SettingsStore.kt           # DataStore prefs
│   └── EntriesRepository.kt       # JSON file storage + backup
├── ui/
│   ├── HomeScreen.kt              # 7 BigButton
│   ├── SettingsScreen.kt          # 2 groupes emails + tarifs
│   ├── TempsScreen.kt             # form + slot + 9 types
│   ├── GsmSeulScreen.kt           # form per-site
│   ├── GesteCoScreen.kt           # tableau Installé/Cadeau
│   ├── GesteCoRecapScreen.kt      # primes par type
│   ├── FraisScreen.kt             # photo + PDF
│   ├── CompteurScreen.kt          # photo seule
│   ├── EnvoiMensuelScreen.kt      # Excel + photos + Cc perso
│   └── common/Common.kt           # PeriodHeader
├── excel/ExcelFiller.kt           # Apache POI .xlsm
├── export/CsvExporter.kt          # CSV BOM + sep=;
├── email/EmailSender.kt           # send / sendMulti
├── update/UpdateChecker.kt        # GitHub Releases API
├── update/UpdateDialog.kt
├── update/UpdateInstaller.kt
├── backup/BackupExporter.kt       # ZIP de toutes les données
├── photos/PhotoStorage.kt         # filesDir/photos/
├── viber/ViberSender.kt           # share intent Viber
├── util/Dates.kt
└── util/HoursCalculator.kt        # règle 0/4/6/7/8h
```

---

## Plan pour v0.14.0 (à venir)

1. ✅ Snapshot rollback créé (ce document)
2. Intégrer la PWA "Bon Retour Stock" comme nouveau bouton via WebView
3. Polir le design (Material 3, animations, spacing)
4. Bump v0.14.0
