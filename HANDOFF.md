# G-Systems · Document de transmission

> Snapshot du projet pour reprendre la main rapidement.
> Date : 2 juin 2026 · Version actuelle : **v0.17.2**

---

## 1. Vue d'ensemble

**G-Systems** est une application Android (Kotlin + Jetpack Compose) pour
techniciens d'alarme/sécurité électronique. Elle remplace 4 outils
manuels (Excel, mails, Viber, photos) par **un seul écran d'accueil avec
8 tuiles**.

- **Repo GitHub** : <https://github.com/morpheus45/gsystem>
- **Tutoriel tech** : <https://morpheus45.github.io/gsystem/>
- **APK direct** : `https://github.com/morpheus45/gsystem/releases/latest/download/app-debug.apk`
- **Utilisateur principal** : Cedric Lago Gomez (ISTGS54), G-Systems FR
- **OS cible** : Android 8.0+ (minSdk 26, targetSdk 34)

---

## 2. Les 8 tuiles de l'accueil

| N° | Tuile | Couleur | Rôle |
|---|---|---|---|
| 01 | **TEMPS** | violet `#7C3AED` | Feuille de temps, interventions, Viber auto |
| 02 | **GSM SEUL** | cyan `#06B6D4` | 1 site → 1 email immédiat |
| 03 | **GESTE CO** | émeraude `#10B981` | Site + extensions, primes + cadeau client |
| 04 | **RÉCAP** | ambre `#F59E0B` | Cumul cycle + total € |
| 05 | **FRAIS** | orange `#EA580C` | Photos tickets + envoi lot |
| 06 | **COMPTEUR** | bleu `#2563EB` | Photo kilométrique véhicule |
| 07 | **BON RETOUR** | indigo `#4F46E5` | PWA HTML embarquée (WebView) |
| 08 | **ENVOI MENSUEL** | magenta `#DB2777` | Excel .xlsm + tickets + compteur en 1 mail |

Le pip rose pulsant apparaît sur **08 ENVOI MENSUEL** à partir du 18 du mois.

---

## 3. Stack technique

```
Kotlin 1.9.x + Jetpack Compose Material 3 (BOM 2024.06.00)
├── kotlinx.serialization (JSON)
├── DataStore (préférences)
├── Apache POI 5.2.5 + slf4j-nop (remplissage .xlsm sur device)
├── Coil 2.5 (miniatures)
├── Coroutines 1.8
└── WebView (assets/bon_retour/index.html — PWA)

CI : GitHub Actions (.github/workflows/) → APK debug signée
Signing : keystore/debug.keystore (committé exprès, stable pour les MAJ
          seamless ; tous les builds CI partagent la même clé)
```

---

## 4. Arborescence clé

```
app/src/main/
├── AndroidManifest.xml
├── java/com/morpheus45/gsystem/
│   ├── MainActivity.kt              ← NavHost, route /home + 9 destinations
│   ├── data/
│   │   ├── Models.kt                ← TempsEntry, GsmSeulEntry, GesteCoEntry,
│   │   │                              FraisTicket, CompteurEntry, EntriesStore,
│   │   │                              AppSettings
│   │   ├── EntriesRepository.kt     ← Storage JSON
│   │   └── SettingsStore.kt         ← DataStore
│   ├── excel/
│   │   └── ExcelFiller.kt           ← Remplissage .xlsm via POI
│   ├── export/
│   │   └── CsvExporter.kt           ← CSV (BOM UTF-8 + sep=;)
│   ├── email/
│   │   └── EmailSender.kt           ← Intent ACTION_SEND_MULTIPLE
│   ├── viber/
│   │   └── ViberSender.kt           ← buildMessage() + OBSERVATION_LABELS
│   ├── ui/
│   │   ├── HomeScreen.kt            ← 8 tuiles, data live, footer
│   │   ├── TempsScreen.kt           ← Formulaire intervention + validation
│   │   ├── GsmSeulScreen.kt
│   │   ├── GesteCoScreen.kt
│   │   ├── GesteCoRecapScreen.kt
│   │   ├── FraisScreen.kt
│   │   ├── CompteurScreen.kt
│   │   ├── BonRetourScreen.kt       ← WebView + BOOT_PATCH JS
│   │   ├── EnvoiMensuelScreen.kt
│   │   ├── SettingsScreen.kt
│   │   ├── components/IndicatorCalm.kt  ← CategoryTile, HomeBigButton,
│   │   │                                  HairlineDivider, PulsingSignalDot,
│   │   │                                  LiveStatusBar, HairlineBack/SettingsIcon,
│   │   │                                  PrimaryAction, FooterSpec
│   │   ├── theme/
│   │   │   ├── Color.kt             ← Palette MISSION CONTROL (8 gradients +
│   │   │   │                          Obsidian + Signal)
│   │   │   ├── Type.kt              ← Tektur + GeistMono + system
│   │   │   └── Theme.kt             ← darkColorScheme(IndicatorCalmScheme)
│   │   └── common/PeriodHeader.kt   ← Header de période cycle (réutilisable)
│   ├── update/
│   │   ├── UpdateChecker.kt         ← GET /releases/latest
│   │   └── UpdateDialog.kt
│   ├── util/
│   │   ├── DateUtil.kt              ← cyclePeriod(date, startDay)
│   │   └── HoursCalculator.kt       ← Règle finale 0/4/6/7/8h
│   └── backup/                      ← ZIP export + restore
└── res/
    ├── font/                        ← tektur_*.ttf, geist_mono_*.ttf
    ├── drawable/, mipmap-*/         ← Icônes app
    └── values/                      ← strings, themes

app/src/main/assets/bon_retour/
├── index.html                       ← La PWA d'inventaire (124 KB)
├── manifest.webmanifest, sw.js
└── icon-192.png, icon-512.png

docs/
├── index.html                       ← Tutoriel GitHub Pages (utilise pour
│                                      le déploiement à tous les techs)
└── ROLLBACK_v0.13.14.md

design/                              ← Artefacts /canvas-design (philosophie + PNG)
.github/workflows/                   ← CI Android build
keystore/debug.keystore              ← Clé stable signée
```

---

## 5. Règles métier critiques (à ne pas casser)

### Calcul des heures (HoursCalculator.kt)
- **VACANCES / FORMATION** : journée entière fixe = **7h**
- Autres : par jour, on regarde les créneaux Matin + Après-midi
  - 0 actif → 0h
  - 1 actif → 4h
  - 2 actifs OK + OK → **8h**
  - 2 actifs avec au moins une NR → 6h

### Cycle de paie
- Par défaut : du **21** du mois → 20 du mois suivant
- Modifiable dans Réglages (`settings.cycleStartDay`)
- `DateUtil.cyclePeriod(today, startDay)` retourne `(start, end)`
- ENVOI MENSUEL permet override manuel (Du / Au)

### GESTE CO — règles cadeau
- Total cadeau client ≤ **4,50 €** (configurable, défaut)
- Nombre d'offertes ≤ moitié des installées (arrondi inf.)
- Dérogation EPS possible (flag dans l'entrée)
- Primes internes (€) ≠ cadeau client (€) : 2 lignes distinctes dans le CSV récap

### Emails
- **2 groupes** dans Réglages :
  - **GS** (G-Systems interne) : reçoit TEMPS, FRAIS, COMPTEUR
  - **EPS** (clients) : reçoit GSM SEUL, GESTE CO
- Email perso utilisateur ajouté en Cc automatique sur ENVOI MENSUEL

### CSV
- Préfixe `﻿sep=;\n` (BOM UTF-8 + hint séparateur pour Excel FR)
- GESTE CO récap structuré en 3 blocs avec ligne TOTAL alignée

### Sauvegarde
- ZIP exportable manuellement (Réglages → "Exporter sauvegarde")
- Inclut JSON entrées + snapshots .xlsm mensuels + photos tickets/compteur
- **JAMAIS** d'effacement automatique au upgrade : tout doit persister entre versions

---

## 6. Auto-update (point sensible)

`UpdateChecker.kt` appelle `GET /repos/morpheus45/gsystem/releases/latest`.
- **Prereleases** sont automatiquement exclues par GitHub → pratique pour tester
- Pour pousser à tous les techs : créer la release **sans `--prerelease`**
- Pour tester soi-même sans impact : `gh release create vX.Y.Z ... --prerelease`
- **Promotion d'une prerelease en stable** :
  `gh release edit vX.Y.Z --prerelease=false --latest`

La clé de signature `keystore/debug.keystore` est partagée par tous les builds
(local + CI) → les MAJ ne demandent jamais une réinstallation complète.
**Ne JAMAIS regénérer cette clé sinon tous les utilisateurs perdent leurs données.**

---

## 7. Workflow de release

```bash
# 1. Bump version
vim app/build.gradle.kts        # versionCode + versionName

# 2. Commit + push (déclenche CI automatique)
git add . && git commit -m "vX.Y.Z: ..." && git push

# 3. Attendre la fin du build
gh run watch <run-id> --exit-status

# 4. Récupérer l'APK
gh run download <run-id> -D /tmp/vXYZ
cp /tmp/vXYZ/gsystem-debug-apk/app-debug.apk /tmp/gsystem-vX.Y.Z.apk

# 5. Publier la release
gh release create vX.Y.Z /tmp/gsystem-vX.Y.Z.apk \
  --title "vX.Y.Z - Description" \
  --notes "Notes Markdown"

# 6. Optionnel : marquer en prerelease pour tester d'abord
#    Ajouter --prerelease à la commande ci-dessus
```

Les utilisateurs voient le popup MAJ à l'ouverture suivante de l'app
(ou via Réglages → "Vérifier maintenant").

---

## 8. Historique des refontes design

| Version | Direction | Statut |
|---|---|---|
| 0.1 – 0.14.x | Material 3 standard, 1 couleur vive par bouton | Abandonné (jugé "criard") |
| **0.15.0** | "INDICATOR CALM" — crème + encre anthracite + ambre | Rejeté par l'utilisateur : "blanc fade, sans intérêt" |
| **0.16.0** | "OBSIDIAN" — pur noir + signal rouge mono | Rejeté : "limit mieux au départ" — trop monochrome |
| **0.17.x** | **"MISSION CONTROL"** — dark + 8 gradients colorés + icônes + data live | **EN PRODUCTION** |

Si tu refais le design un jour, **ne reviens PAS à du blanc ou du
monochrome**. L'utilisateur veut :
- Dark base (premium 2026, batterie OLED)
- Identité chromatique par catégorie (preserve la mémoire visuelle)
- Typographie XL (Tektur Bold pour le wordmark)
- Animations subtiles (press scale, halo, pulse)
- Données live (counters, indicators)

Référence : `design/v0.16_DIRECTIONS.md` et `design/v0.15_REDESIGN_SPEC.md`.

---

## 9. État actuel — v0.17.2

### Dernières évolutions
- v0.17.0 (1 juin) : refonte MISSION CONTROL — 8 tuiles colorées
- v0.17.1 (1 juin) : tuiles divisées par 2 en hauteur (64dp au lieu de 124)
- v0.17.2 (2 juin) : TEMPS dialog plein hauteur scrollable + champs obligatoires avec asterisques rouges

### Anonymisation tutoriel
ISTGS54 a été remplacé par ISTGSXXX dans `docs/index.html` pour ne pas
exposer le code personnel du dev. ISTGS55 (Jean Robert) est conservé
car il est référencé en dur dans la PWA BON RETOUR.

### Pas encore fait (idées de v0.18+)
- [ ] Appliquer le même travail "champs obligatoires" aux autres écrans
  (GSM SEUL, GESTE CO, FRAIS, COMPTEUR)
- [ ] Dialog plein hauteur scrollable pour tous les formulaires
- [ ] Affichage live des heures cumulées du cycle dans la tuile 01 TEMPS
- [ ] Total € live dans la tuile 04 RÉCAP (actuellement les données live
      sont 0 pour RECAP)
- [ ] Dark/light mode toggle (actuellement dark forcé)
- [ ] Tests UI Compose
- [ ] Optimiser le BON RETOUR : storage natif au lieu du localStorage isolé
      (problème : pas de synchronisation avec le reste de l'app)

---

## 10. Pièges à éviter

1. **Ne pas regénérer `keystore/debug.keystore`** → casse les MAJ
2. **Ne pas modifier les `OBSERVATION_LABELS` dans ViberSender.kt** sans tester
   le format Viber côté reçu (Cedric a un format précis attendu par l'équipe)
3. **Apache POI sur Android** = pénible. `log4j-api` doit rester exclu globalement
   (`configurations.all { exclude(group = "org.apache.logging.log4j") }`)
4. **BON RETOUR (PWA WebView)** :
   - Le HTML utilise `localStorage` du WebView, isolé du reste
   - Les curly quotes `"` ASCII ont été remplacés en automate pour le code,
     mais si tu rééditemes `index.html` dans Word/Notes, ça peut revenir
   - Le ServiceWorker est désactivé par injection JS (file:// incompatible)
5. **`MainActivity.kt`** : `HomeScreen` reçoit maintenant le `store` en plus
   du `settings` (depuis v0.17.0) pour afficher les counters live
6. **CI** : minSdk = **26** obligatoirement (POI dépend de MethodHandle Android O+)

---

## 11. Contacts / contexte

- **Dev/utilisateur principal** : Cedric (morpheus45 GitHub)
- **Société** : G-Systems FR (sécurité électronique / alarme)
- **Code site Cedric** : ISTGS54 (mais utiliser ISTGSXXX comme exemple en doc)
- **Collègue par défaut dans BON RETOUR** : Jean Robert (ISTGS55)

L'app est utilisée quotidiennement par Cedric et sera étendue à l'équipe
(actuellement en phase de validation par lui-même avant déploiement large).

---

## 12. Commandes utiles

```bash
# Voir le dernier build
gh run list --limit 1

# Logs d'un build qui a échoué
gh run view <id> --log-failed | grep "e: file"

# Voir la dernière release
gh api repos/morpheus45/gsystem/releases/latest --jq '.tag_name'

# Forcer une release en latest (si bloquée en prerelease)
gh release edit vX.Y.Z --prerelease=false --latest

# Compiler localement (Android Studio recommandé, mais possible CLI)
./gradlew :app:assembleDebug

# Voir l'arborescence du code Kotlin
find app/src/main/java -name "*.kt" | head -40
```

---

## 13. Notes pour le prochain

- L'utilisateur veut du résultat **rapide et visuel**. Les specs MD longs
  l'agacent — préfère pousser une version, le laisser tester, itérer.
- Pour les changements de design : si tu hésites, **publie en prerelease**
  et propose le test manuel. Ne pas pousser un design non validé en latest.
- L'utilisateur ne touche pas au code, il teste sur son téléphone et te
  donne des retours en français parlé (souvent en majuscules quand
  ferme). Les retours courts comme "c'est moche" / "limit mieux avant"
  veulent dire **pivot complet**, pas un petit ajustement.
- Toujours respecter le keystore stable et la rétention des données :
  le passage d'une version à l'autre doit être **invisible pour les données**.

---

*Document généré à l'issue de la session "MISSION CONTROL" — bon courage
pour la suite.*
