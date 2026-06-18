# G-Systems · Document de transmission

> Snapshot du projet pour reprendre la main rapidement.
> Date : 18 juin 2026 · Version actuelle : **v1.4.3** (versionCode 65)

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
| 01 | **CLÔTURE** | violet `#7C3AED` | Clôture d'intervention, feuille de temps, Viber auto (route `temps`) |
| 02 | **COURRIER** | indigo `#4F46E5` | 1 appui → partage Viber « courrier ok » (aucune saisie) |
| 03 | **GSM SEUL** | cyan `#06B6D4` | 1 site → 1 email immédiat |
| 04 | **GESTE CO** | émeraude `#10B981` | Site + extensions, primes + cadeau client |
| 05 | **RÉCAP** | ambre `#F59E0B` | Cumul cycle + total € |
| 06 | **FRAIS** | orange `#EA580C` | Photos tickets + montant TTC + TVA auto + envoi lot |
| 07 | **COMPTEUR** | bleu `#2563EB` | Photo kilométrique véhicule |
| 08 | **ENVOI MENSUEL** | magenta `#DB2777` | Excel .xlsm + tickets + compteur en 1 mail |

Le pip rose pulsant apparaît sur **08 ENVOI MENSUEL** dans les **3 derniers
jours du cycle** (`endOfCycleApproaching`, basé sur `cycleEnd` et non plus un
seuil fixe au 18).

> **COURRIER (02)** n'ouvre pas d'écran : son `onClick` appelle directement
> `ViberSender.share(context, "courrier ok")` depuis `MainActivity`.

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
└── (plus de WebView — l'écran BON RETOUR a été supprimé en v0.22.4)

CI : GitHub Actions (.github/workflows/android-build.yml) → APK signée,
     publication auto d'une Release avec asset .apk sur tag `v*`
Signing : clé de PRODUCTION (GitHub secrets) en priorité depuis v1.0.0 ;
          repli automatique sur keystore/debug.keystore (committé exprès, stable)
          si la clé prod est absente (PR, build local). storeFile prod JAMAIS commité.
```

---

## 4. Arborescence clé

```
app/src/main/
├── AndroidManifest.xml
├── java/com/morpheus45/gsystem/
│   ├── MainActivity.kt              ← NavHost, routes home/settings/temps/gsm/
│   │                                  gesteco/gesteco_recap/frais/compteur/
│   │                                  envoi_mensuel (+ période partagée, splash,
│   │                                  check MAJ). onCourrier = ViberSender.share
│   ├── data/
│   │   ├── Models.kt                ← TempsEntry, GsmSeulEntry, GesteCoEntry,
│   │   │                              FraisTicket (categorie + montantEur),
│   │   │                              CompteurEntry, EntriesStore, AppSettings
│   │   ├── EntriesRepository.kt     ← Storage JSON
│   │   └── SettingsStore.kt         ← DataStore
│   ├── excel/ExcelFiller.kt         ← Remplissage .xlsm via POI (réécrit sur
│   │                                  l'URI existant → conserve les macros VBA)
│   ├── export/CsvExporter.kt        ← CSV (BOM UTF-8 + sep=;)
│   ├── email/EmailSender.kt         ← sendMulti() : ACTION_SEND (1 PJ) /
│   │                                  ACTION_SEND_MULTIPLE (n PJ) + ClipData
│   │                                  pour propager les permissions URI
│   ├── viber/ViberSender.kt         ← buildMessage() + OBSERVATION_LABELS +
│   │                                  share(context, message)
│   ├── ui/
│   │   ├── HomeScreen.kt            ← 8 tuiles, data live, footer
│   │   ├── TempsScreen.kt           ← Formulaire intervention + période éditable
│   │   ├── GsmSeulScreen.kt
│   │   ├── GesteCoScreen.kt
│   │   ├── GesteCoRecapScreen.kt
│   │   ├── FraisScreen.kt            ← Scroll (weight 1f), période éditable,
│   │   │                              totaux TTC/TVA/HT
│   │   ├── CompteurScreen.kt
│   │   ├── EnvoiMensuelScreen.kt     ← Remplit Excel + PJ renommées + récap
│   │   │                              frais/TVA dans le corps du mail
│   │   ├── SettingsScreen.kt
│   │   ├── components/IndicatorCalm.kt  ← CategoryTile, HomeBigButton, etc.
│   │   ├── theme/ (Color.kt, Type.kt, Theme.kt)
│   │   └── common/Common.kt          ← PeriodHeader + EditablePeriodHeader (Du/Au)
│   ├── update/ (UpdateChecker.kt, UpdateDialog.kt)
│   ├── util/
│   │   ├── Dates.kt                 ← objet DateUtil : cyclePeriod(date, startDay),
│   │   │                              parseIso, fr(), today()
│   │   ├── FraisTva.kt              ← TVA par catégorie (RATES, défaut 20 %)
│   │   └── HoursCalculator.kt        ← Règle 0/4/6/8h (+ 7h vacances/formation)
│   └── backup/                      ← ZIP export + restore
└── res/ (font/, drawable/, mipmap-*/, values/)

app/src/main/assets/bon_retour/      ← ⚠ ORPHELIN : assets de l'ancienne PWA
                                        BON RETOUR, plus référencés (écran et
                                        route supprimés en v0.22.4). À nettoyer.

docs/
├── index.html                       ← Tutoriel GitHub Pages (logo gsystems SVG,
│                                      8 tuiles à jour, focus COURRIER)
└── ROLLBACK_v0.13.14.md

design/                              ← Artefacts design
logodraft/                           ← Réfs logo gsystems (gs_ref*.png) + splash-preview.html
.github/workflows/                   ← CI Android build + release auto
keystore/debug.keystore              ← Clé stable signée
```

---

## 5. Règles métier critiques (à ne pas casser)

### Calcul des heures (HoursCalculator.kt)
- **VACANCES / FORMATION** : journée entière fixe = **7h**
- Autres : par jour, créneaux Matin + Après-midi
  - 0 actif → 0h · 1 actif → 4h · 2 actifs OK+OK → **8h** · 2 actifs avec ≥1 NR → 6h

### Cycle de paie & période partagée
- Par défaut : du **21** du mois → 20 du mois suivant (`settings.cycleStartDay`)
- `DateUtil.cyclePeriod(today, startDay)` retourne `(start, end)`
- **Période éditable partagée** (depuis v0.22.3) : l'état `periodStart/periodEnd`
  vit dans `MainActivity.AppNav` et est passé à **Temps, Frais et Envoi Mensuel**.
  Toute saisie Du/Au dans un écran se propage aux autres (via `onPeriodChange`).
  `EditablePeriodHeader` (Common.kt) gère la saisie ; bouton « ↺ Cycle par défaut ».

### Frais & TVA (FraisTva.kt)
- Le tech saisit un montant **TTC** ; l'app déduit HT et TVA par catégorie.
- `RATES` : table catégorie→taux (défaut 20 %). Modifier la table pour ajuster.
- Le récap frais (TTC/HT/TVA par ticket + totaux) est écrit dans le **corps du
  mail** d'Envoi Mensuel (pas de CSV séparé — choix utilisateur explicite).

### Nommage des pièces jointes (PhotoStorage.kt, à l'envoi)
- Tickets frais → `FRAIS-<CATÉGORIE>.<ext>` (suffixe `-2`, `-3`… si doublon de catégorie)
- Compteur → `<PLAQUE>-<MM>-<AAAA>.jpg`
- Les fichiers sont copiés/renommés dans `cacheDir/exports` juste avant l'envoi.

### Emails
- 2 groupes : **GS** (interne : TEMPS, FRAIS, COMPTEUR) et **EPS** (clients :
  GSM SEUL, GESTE CO). Email perso ajouté en Cc sur Envoi Mensuel.
- **Destinataires fixes codés en dur** (v1.2.0) dans `AppSettings.companion` —
  identiques pour toute l'équipe, **masqués dans Réglages**, le tech ne les saisit plus :
  - `FIXED_GS_TO   = "fdt@fggestion.fr"`      → `effectiveGsTo`
  - `FIXED_EPS_TO  = "epsinfotechline@eps.e-i.com"` → `effectiveEpsTo`
  - `FIXED_EPS_CC1 = "johanna@fggestion.fr"`  → `effectiveEpsCc1`
  - ⚠ Pour changer une de ces adresses : éditer la constante puis **publier une MAJ**
    (plus modifiable côté téléphone).
- **Seul champ email éditable dans Réglages = « Responsable secteur »** : `emailEpsCc2`
  (`effectiveEpsCc2`), en copie des envois EPS. **OBLIGATOIRE depuis v1.3.0** : il
  fait partie de `isReady` (propre à chaque secteur, donc à chaque tech de saisir
  le sien) → app bloquée sur Réglages tant qu'il est vide.
- Tous les écrans lisent les getters `effective*` (jamais les champs bruts) →
  changer un getter suffit à propager partout (GSM SEUL, GESTE CO, RÉCAP, Envoi Mensuel).
- `EmailSender.sendMulti` : 1 PJ → ACTION_SEND ; n PJ → ACTION_SEND_MULTIPLE.
  ClipData + FLAG_GRANT_READ_URI_PERMISSION sur l'intent ET le chooser (sinon
  les PJ n'apparaissent pas après le chooser).

### Envoi Mensuel — photo compteur obligatoire (v1.1.0)
- Le bouton « Remplir Excel + envoyer le mensuel » est **désactivé tant qu'aucune
  photo compteur** n'est présente sur la période (`hasCompteurPhoto =
  compteurPeriod.isNotEmpty()` dans `EnvoiMensuelScreen.kt`). Un bandeau rouge
  « ⛔ Envoi bloqué… » s'affiche sinon.
- La photo compteur est **jointe automatiquement** (nommée `<PLAQUE>-<MM>-<AAAA>.jpg`)
  — le tech n'a rien à renseigner sur la photo, la règle est codée en dur.
- **Récap PRIMES GESTE CO** (v1.3.0) dans le corps du mail : `primesByType` agrège les
  extensions installées de la période × `settings.prices`, rendu en barres texte
  (barre ∝ montant €) + `TOTAL PRIMES`. Les primes ne sont PAS dans les mails GESTE CO
  client (règle inchangée) — uniquement dans le mensuel interne (GS + copie perso).

### GESTE CO — règles cadeau
- Total cadeau client ≤ **4,50 €** ; offertes ≤ moitié des installées (arrondi inf.) ;
  dérogation EPS possible. Primes (€) ≠ cadeau client (€) : 2 lignes dans le CSV récap.

### Sauvegarde
- ZIP exportable manuellement. **JAMAIS** d'effacement auto à l'upgrade.

---

## 6. Auto-update

`UpdateChecker.kt` appelle `GET /repos/morpheus45/gsystem/releases/latest`,
compare le semver, exige un asset `.apk`. `checkForUpdateSilently()` tourne
**une fois par session** au lancement (MainActivity). Le tutoriel/Release se
propage donc avec un petit délai (build CI + check à l'ouverture suivante).

- Prereleases exclues automatiquement par `releases/latest` → pratique pour tester.
- Promotion prerelease → stable : `gh release edit vX.Y.Z --prerelease=false --latest`.

La clé `keystore/debug.keystore` est partagée (local + CI) → MAJ sans réinstall.
**Ne JAMAIS la regénérer** sinon les utilisateurs perdent leurs données.

---

## 7. Workflow de release (CI auto sur tag)

```bash
# 1. Bump version
#    app/build.gradle.kts → versionCode + versionName

# 2. Commit + tag + push  (le push du tag v* déclenche build + release auto)
git add <fichiers> && git commit -m "vX.Y.Z: ..."
git tag vX.Y.Z && git push origin HEAD --tags

# 3. Surveiller le build (API GitHub ; `gh` n'est PAS installé sur ce poste)
curl -s "https://api.github.com/repos/morpheus45/gsystem/actions/runs?event=push&branch=vX.Y.Z&per_page=1" | grep '"status"'

# 4. Vérifier la Release + asset .apk
curl -s "https://api.github.com/repos/morpheus45/gsystem/releases/latest" | grep -E '"tag_name"|\.apk'
```

Le workflow `.github/workflows/android-build.yml` build l'APK debug et, sur tag
`v*`, crée la Release avec l'APK en asset. Les utilisateurs voient le popup MAJ
à l'ouverture suivante.

> ⚠ **`gh` (GitHub CLI) n'est pas disponible** sur la machine du dev — passer par
> l'API REST via `curl` (attention au rate-limit 60/h non authentifié).

---

## 8. Historique des refontes design

| Version | Direction | Statut |
|---|---|---|
| 0.1 – 0.14.x | Material 3 standard, 1 couleur vive/bouton | Abandonné (« criard ») |
| 0.15.0 | « INDICATOR CALM » crème/ambre | Rejeté (« blanc fade ») |
| 0.16.0 | « OBSIDIAN » noir + signal rouge mono | Rejeté (« trop monochrome ») |
| **0.17.x+** | **« MISSION CONTROL »** dark + 8 gradients + data live | **EN PRODUCTION** |

Logo : le **wordmark officiel gsystems** (G rouge `#ee2322` arrondi + « systems »
anthracite `#2b2d33`) est la référence de marque. Reproduit en SVG **animé**
dans `docs/index.html` (header : le G se dessine, s'embrase, puis « systems »
jaillit de la gueule du G — séquence « Réveil de marque ») et dans
`logodraft/splash-preview.html`.

Ne reviens **pas** à du blanc/monochrome. L'utilisateur veut : dark base,
identité chromatique par catégorie, typo XL (Tektur), animations subtiles, data live.

---

## 9. État actuel — v1.4.2

### Évolutions récentes (juin 2026)
- **v0.22.4** : tuile **02 COURRIER** (Viber « courrier ok ») ; suppression complète
  de BON RETOUR ; renumérotation des tuiles ; tutoriel + nouveau logo gsystems.
- **v0.23.0** : GESTE CO installé **sans cadeau → pas de mail** ; répartition TEMPS
  (camembert texte) ajoutée dans le corps du mail mensuel.
- **v0.23.1** : TEMPS — nouveau type **FERIE** (journée entière 7h, même logique que VACANCES).
- **v0.24.0** : garde d'intégrité (anti-tamper) + mention copyright.
- **v1.0.0** : Excel — clonage du style des lignes auto-insérées (>4 interventions/jour) ;
  signature Release par **clé de production** (GitHub secrets), repli sur clé debug
  si absente ; nettoyage du tutoriel.
- **v1.1.0** :
  - **Envoi Mensuel bloqué sans photo compteur** : bouton désactivé + bandeau rouge
    tant qu'aucune photo compteur sur la période (`hasCompteurPhoto`). Photo jointe
    auto, rien à renseigner par le tech (cf. §5).
  - **Réglages EPS** : Cc 2 relibellé **« Responsable secteur »**, modifiable et vide.
- **v1.2.0** (cette session) :
  - **Destinataires fixes codés en dur + masqués** dans Réglages (cf. §5 Emails) :
    `fdt@fggestion.fr`, `epsinfotechline@eps.e-i.com`, `johanna@fggestion.fr`.
    Réglages n'affiche plus que les champs perso (nom, plaque, email perso,
    responsable secteur, code tech, cycle, primes). Plus de saisie d'adresses par le tech.
  - **« Code site » renommé « Code tech »** (libellés UI + doc) : c'est le code
    technicien personnel, pas un code de site. **Vide par défaut** (`siteCodeFixe = ""`,
    plus de repli `ISTGS54`) pour que chaque tech saisisse le sien.
- **v1.3.0** (cette session) :
  - **3 champs obligatoires** ajoutés à `isReady` (app bloquée sur Réglages tant
    qu'ils sont vides) : **nom du tech**, **code tech** (`siteCodeFixe`, sinon trou
    dans le sujet « GSM SEUL -  - n° ») et **responsable secteur** (`emailEpsCc2`,
    propre à chaque secteur). Libellés `*`, aides, validation et tutoriel alignés.
  - **Récap PRIMES GESTE CO dans le corps du mensuel** : extensions installées de la
    période agrégées par type × tarif (`settings.prices`), rendu en barres « texte »
    (même format que la répartition TEMPS, barre proportionnelle au montant €) +
    `TOTAL PRIMES` de la période. `EnvoiMensuelScreen` : `gesteCoPeriod` + `primesByType`.
    Aussi en StatRow à l'écran et en ligne de récap du mail. Va vers le groupe GS
    (`fdt@fggestion.fr`) + copie perso.

- **v1.4.0** (cette session) :
  - **3 nouveaux types GESTE CO** : **CL** (3 €), **DF** (1,50 €), **SONDE IN** (1,50 €).
    Primes internes ; cadeau client = 0 par défaut (modifiable dans Réglages). Ajoutés
    partout : `GesteCoEntry` (installed*/offered*), `GesteCoPrices`/`GesteCoClientGifts`
    (+ `priceFor` + `TYPES`), écran GESTE CO (ExtRow + buildEntry), Réglages (PriceField
    primes & cadeaux), RÉCAP (`when type`), CsvExporter (cumul + colonnes détail).
    ⚠ Pour ajouter un type : penser à TOUS ces points (TYPES pilote RÉCAP + CSV).

- **v1.4.1** (cette session) : **mail mensuel — rendu propre**.
  - **Texte brut nettoyé** (fallback) : suppression des barres ASCII `█` (illisibles
    en police proportionnelle Outlook/Gmail) ; lignes courtes `LABEL : valeur` pour
    Répartition TEMPS, Frais (HT/TVA regroupés dans le TOTAL) et Primes GESTE CO.
  - **Version HTML** (tableaux + wordmark gsystems coloré + **graphe à barres
    multicolore** de la répartition TEMPS — barres = `<div>` coloré à largeur px,
    email-safe ; pas de vrai camembert car SVG/conic-gradient/JS non supportés en mail)
    via `EXTRA_HTML_TEXT` (`EmailSender.sendMulti(htmlBody=…)`, helper `buildMonthlyHtml`).
    Affichée par les clients qui la gèrent (Gmail…), sinon repli auto sur le texte brut.
    ⚠ Outlook mobile peut l'ignorer → à tester côté Cédric. Voir mémoire « format mails texte brut ».

- **v1.4.2** (cette session) :
  - **Récap visuel HTML joint** au mensuel : `buildMonthlyHtml` écrit dans
    `cacheDir/exports/Recap-mensuel_<start>.html` (doc complet + meta charset),
    ajouté aux pièces jointes. S'ouvre dans le navigateur avec le rendu exact —
    car le HTML **dans le corps** n'est pas fiable (Outlook ET Gmail ignorent
    `EXTRA_HTML_TEXT` depuis un partage Android, vérifié). Ligne ajoutée au corps
    pour signaler la PJ. (Un lien cliquable vers une PJ depuis le corps = impossible.)
  - **Pas de tutoiement dans les corps de mail** (destinataires pro) — formulation
    neutre. Voir mémoire « format mails texte brut ».

- **v1.4.3** (cette session) : renommage **« Cadeau » → « GESTE CO »** dans toute
  l'UI (en-tête colonne du dialogue, cartes site, validations, RÉCAP, Réglages
  « GESTE CO client », en-tête CSV). Le modèle reste `offered*`/`clientGifts`
  (noms de champs inchangés) — seul l'affichage change. Mail client : « Geste
  commercial » conservé.

### Pas encore fait (idées v1.5+)
- [ ] Nettoyer `app/src/main/assets/bon_retour/` (orphelin) et toute dépendance WebView restante.
- [ ] Affiner les taux TVA par catégorie dans `FraisTva.RATES` si besoin (tout à 20 % aujourd'hui).
- [ ] Champs obligatoires (astérisques) sur GSM SEUL / GESTE CO / FRAIS / COMPTEUR.
- [ ] Total € live dans la tuile 05 RÉCAP (données live = 0 actuellement).
- [ ] Heures cumulées du cycle dans la tuile 01 CLÔTURE.
- [ ] Tests UI Compose.

---

## 10. Pièges à éviter

1. **Ne pas regénérer `keystore/debug.keystore`** → casse les MAJ et les données.
2. **Apache POI / log4j (corrigé en v0.22.1)** : POI charge `log4j-api` au
   chargement de `IOUtils` (`LogManager.getLogger`). Il faut **CONSERVER
   `log4j-api` 2.21.1** et exclure **uniquement** `log4j-core`
   (`configurations.all { exclude(module = "log4j-core") }`). Exclure tout
   le groupe log4j → `NoClassDefFoundError` au remplissage Excel.
3. **Pièces jointes mail** : sans `ClipData` + `FLAG_GRANT_READ_URI_PERMISSION`
   sur l'intent ET le chooser, les PJ disparaissent après le sélecteur.
   1 fichier = ACTION_SEND ; plusieurs = ACTION_SEND_MULTIPLE.
4. **Ne pas modifier `OBSERVATION_LABELS` (ViberSender.kt)** sans valider le
   format reçu côté groupe Viber (Cedric a un format précis attendu).
5. **Période partagée** : `Temps`, `Frais` et `EnvoiMensuel` lisent le même
   `periodStart/periodEnd` remonté dans `MainActivity`. Si tu touches l'un,
   garde la propagation `onPeriodChange` cohérente.
6. **`gh` indisponible** sur le poste → utiliser l'API REST via `curl`.
7. **CI** : minSdk = **26** obligatoire (POI dépend de MethodHandle Android O+).
8. **BON RETOUR supprimé** : ne pas réintroduire de références ; les assets
   `assets/bon_retour/` restent à nettoyer.

---

## 11. Contacts / contexte

- **Dev/utilisateur principal** : Cedric (morpheus45 GitHub)
- **Société** : G-Systems FR (sécurité électronique / alarme)
- **Code tech Cedric** : ISTGS54 — c'est un **code technicien** (propre à chaque
  tech, pas un code de site), saisi dans Réglages, préfixe des sujets d'email
  GSM SEUL / GESTE CO. Champ `siteCodeFixe` (nom JSON historique conservé).
  Utiliser ISTGSXXX comme exemple en doc.
- L'app est utilisée quotidiennement par Cedric, en cours d'extension à l'équipe.

---

## 12. Préférences de collaboration

- L'utilisateur veut du résultat **rapide et visuel** ; il ne touche pas au code,
  teste sur son téléphone et donne des retours en français parlé (souvent courts /
  en majuscules). « c'est moche » / « limit mieux avant » = **pivot complet**.
- **Toujours montrer le `git diff` et attendre validation (« go »)** avant tout
  commit/push sur les repos morpheus45.
- Respecter le keystore stable et la rétention des données : le passage d'une
  version à l'autre doit être **invisible pour les données**.

---

*Document mis à jour à l'issue de la session v1.1.0 (photo compteur obligatoire à
l'envoi mensuel + Responsable secteur en Cc 2 des envois EPS). Bon courage pour la suite.*
