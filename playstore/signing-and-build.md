# Signature & build de l'AAB pour Google Play

> Google Play n'accepte **pas** d'APK pour une nouvelle app : il faut un
> **Android App Bundle (`.aab`)**, signé par ta **clé d'upload**, avec
> **Play App Signing** activé (Google gère la clé de distribution finale).

---

## 0. Comprendre Play App Signing (lire avant tout)

Deux clés différentes :

1. **Clé d'upload** (la tienne, créée ci-dessous) → signe l'AAB que tu téléverses.
2. **Clé d'app** (gérée par Google) → re-signe les APK livrés aux utilisateurs.

Conséquences :
- Tu **ne perds jamais** la possibilité de publier même si tu perds la clé
  d'upload (réinitialisation possible via support Google).
- L'empreinte SHA-256 vue par l'app sur l'appareil = celle de la **clé d'app
  Google**, pas la tienne → c'est pourquoi `IntegrityGuard` doit être neutralisé
  (voir `code-changes-required.md` §3).

---

## 1. Générer la clé d'upload (keystore)

À faire **une fois**, sur ta machine. Nécessite le JDK (`keytool` est inclus avec
Android Studio : `…/jbr/bin/keytool`, ou tout JDK 17).

```bash
keytool -genkeypair -v \
  -keystore gsystem-upload.jks \
  -alias gsystem-upload \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -storetype JKS
```

`-validity 9125` = 25 ans (Google recommande une validité longue).
Il te demandera :
- **mot de passe du keystore** (note-le précieusement),
- **mot de passe de la clé** (peut être le même),
- nom / organisation (libre, ex. « morpheus45 »).

> 🔐 **Sauvegarde le fichier `gsystem-upload.jks` + les 2 mots de passe** dans un
> gestionnaire de mots de passe / coffre. Si tu perds le keystore, tu peux
> demander une réinitialisation de clé d'upload à Google (quelques jours), mais
> **ne le commite JAMAIS** dans Git.

Ajouter au `.gitignore` (vérifier qu'il y est déjà) :

```
*.jks
*.keystore
keystore/*.jks
key.properties
```

---

## 2. Brancher la clé sur Gradle

Le `app/build.gradle.kts` lit déjà la clé release via variables d'environnement
**ou** propriétés Gradle (voir lignes 30-51). Tu n'as **rien à modifier** dans le
build : il suffit de fournir les valeurs.

### En local — `key.properties` (NON versionné)

Créer `key.properties` à la racine du projet (à côté de `settings.gradle.kts`) :

```properties
RELEASE_STORE_FILE=gsystem-upload.jks
RELEASE_STORE_PASSWORD=<mot_de_passe_keystore>
RELEASE_KEY_ALIAS=gsystem-upload
RELEASE_KEY_PASSWORD=<mot_de_passe_cle>
```

Place `gsystem-upload.jks` à la racine du projet (même dossier).
Gradle le résout via `rootProject.file(RELEASE_STORE_FILE)`.

> Le build retombe proprement sur la clé **debug** si la clé release est absente
> (PR, autre machine) — pratique, mais pour Play tu **dois** signer avec la clé
> d'upload. Vérifie que `key.properties` est bien pris en compte (log Gradle :
> `hasReleaseKey = true`).

---

## 3. Construire l'AAB en local (Android Studio)

> ⚠ Le projet a **deux flavors** (`sideload` / `play`). Pour Play, on construit
> **toujours le flavor `play`** : tâche `bundlePlayRelease` (pas `bundleRelease`,
> qui serait ambigu).

Option menu : **Build → Generate Signed Bundle / APK → Android App Bundle**,
puis choisir la variante **playRelease**.
Ou en ligne de commande, à la racine :

```bash
./gradlew :app:bundlePlayRelease
```

Sortie : `app/build/outputs/bundle/playRelease/app-play-release.aab`

C'est **ce fichier** que tu téléverses dans la Console.

> ℹ️ Il n'y a **pas** de wrapper Gradle committé localement ici ; `bundleRelease`
> suppose un environnement Android (Android Studio installé, ou la CI §5). Si tu
> n'as pas Android Studio, utilise directement le workflow CI ci-dessous.

### Vérifier l'AAB (optionnel mais conseillé)

Avec [bundletool](https://github.com/google/bundletool) tu peux générer les APK
qui seraient livrés et tester sur appareil :

```bash
java -jar bundletool.jar build-apks \
  --bundle=app-play-release.aab --output=gsystem.apks \
  --ks=gsystem-upload.jks --ks-key-alias=gsystem-upload --mode=universal
```

---

## 4. Premier upload & Play App Signing

1. Console → ton app → **Test fermé** (ou Production) → **Créer une release**.
2. À la 1re release, Play propose **Play App Signing** → **accepter** (par défaut).
   Google génère/gère la clé d'app ; ta clé `.jks` devient la clé d'**upload**.
3. Téléverser `app-release.aab`.
4. La Console affiche ensuite, dans **Configuration → Intégrité de l'app**, les
   empreintes (SHA-1 / SHA-256) de la **clé d'app** ET de la **clé d'upload**.
   (Utile si tu choisis l'option B d'IntegrityGuard — déconseillé.)

---

## 5. Build via GitHub Actions (CI) — sans Android Studio

Un workflow prêt est fourni : `playstore/ci/playstore-release.yml`.
Copie-le en `.github/workflows/playstore-release.yml`.

Il faut créer 4 **secrets GitHub** (Repo → Settings → Secrets and variables →
Actions) :

| Secret | Contenu |
|---|---|
| `UPLOAD_KEYSTORE_BASE64` | `base64 -w0 gsystem-upload.jks` (le fichier encodé) |
| `UPLOAD_STORE_PASSWORD` | mot de passe du keystore |
| `UPLOAD_KEY_ALIAS` | `gsystem-upload` |
| `UPLOAD_KEY_PASSWORD` | mot de passe de la clé |

Encoder le keystore en base64 :

```bash
# Linux/macOS
base64 -w0 gsystem-upload.jks > keystore.b64
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("gsystem-upload.jks")) > keystore.b64
```

Le workflow décode le keystore, écrit `key.properties`, lance `bundleRelease` et
publie l'`app-release.aab` en **artefact** téléchargeable (que tu téléverses
ensuite manuellement dans la Console).

> 🔁 Optionnel : on peut automatiser le dépôt direct dans la Console via l'action
> `r0adkll/upload-google-play` + un compte de service Google. Plus de setup
> (compte de service, API Play activée). Pour démarrer, l'upload manuel de
> l'artefact suffit largement.

---

## 6. Alternative : app PRIVÉE (Managed Google Play)

G-Systems est un **outil interne** : une société, ses techniciens, qui envoient
des données clients vers ton Drive. Pour ce cas, la voie la plus simple est une
**app privée** diffusée via **Managed Google Play**, réservée à ton organisation.

Avantages vs. publication publique :
- **Pas de fiche publique** ni de captures « marketing » obligatoires au même
  niveau.
- **Pas** de test fermé 20 testeurs / 14 jours imposé aux comptes perso publics.
- Diffusion **restreinte** à ton entreprise (via Google Workspace / EMM).
- Exposition réduite des données clients.

Conditions :
- Avoir un **Google Workspace** (organisation) OU passer par la **Managed Google
  Play iframe / Play EMM**.
- Publier l'app en **« Privée »** ciblant ton organisation dans la Console.
- Les obligations **RGPD** demeurent (base légale, information des personnes).

Si tu n'as pas de Workspace et que la diffusion publique te rebute, le **sideload
actuel** (GitHub Releases, gratuit) reste parfaitement valable — c'est même ce
pour quoi l'auto-update avait été conçu. Play n'est nécessaire que si tu **veux**
le canal Store.

---

## 7. Récapitulatif des artefacts

| Élément | Où | À committer ? |
|---|---|---|
| `gsystem-upload.jks` | local + coffre | ❌ JAMAIS |
| `key.properties` | racine projet (local) | ❌ |
| Secrets GitHub | Settings → Secrets | ❌ (chiffrés côté GitHub) |
| `app-release.aab` | `app/build/outputs/bundle/release/` | ❌ (artefact) |
| `.github/workflows/playstore-release.yml` | repo | ✅ |
