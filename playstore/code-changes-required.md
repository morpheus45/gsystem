# Modifications de code pour Google Play — APPLIQUÉES (build flavors)

> ✅ **Ces changements ont été appliqués** sur le code, en mode « deux canaux »
> (build flavors). Ton APK quotidien (`sideload`) est **inchangé** ; un nouveau
> canal `play` produit une variante conforme Google Play.
>
> ⚠ **À build-vérifier** : je ne peux pas compiler localement (pas d'Android
> Studio / wrapper Gradle ici). Il faut lancer un build (CI ou Android Studio)
> pour confirmer avant publication. Voir la checklist en bas.

---

## Principe : un seul code, deux canaux

| | `sideload` (APK GitHub) | `play` (AAB Store) |
|---|---|---|
| Auto-update interne | ✅ gardé | ❌ désactivé |
| `REQUEST_INSTALL_PACKAGES` | ✅ présent | ❌ absent |
| IntegrityGuard | ✅ actif | ❌ désactivé |
| `targetSdk` | 34 | 35 |
| Bouton « Vérifier MAJ » (Réglages) | ✅ visible | ❌ masqué |
| Distribution | GitHub Releases | Play Console |

Le flag `BuildConfig.PLAY_BUILD` (faux en sideload, vrai en play) aiguille le code
partagé. **Aucune duplication de code.**

---

## 1. `app/build.gradle.kts` — flavors + SDK

```kotlin
compileSdk = 35              // était 34 (requis pour targetSdk 35)

defaultConfig {
    ...
    targetSdk = 34           // valeur par défaut = sideload
}

flavorDimensions += "canal"
productFlavors {
    create("sideload") {
        dimension = "canal"
        buildConfigField("boolean", "PLAY_BUILD", "false")
    }
    create("play") {
        dimension = "canal"
        targetSdk = 35
        versionNameSuffix = "-play"
        buildConfigField("boolean", "PLAY_BUILD", "true")
    }
}
```

## 2. `build.gradle.kts` (racine) — AGP

```kotlin
id("com.android.application") version "8.6.0" apply false   // était 8.4.2
```
`compileSdk 35` exige **AGP ≥ 8.6.0**. AGP 8.6.0 est compatible avec le Gradle
8.7 déjà utilisé.

## 3. `AndroidManifest.xml` — permission déplacée

- `REQUEST_INSTALL_PACKAGES` **retirée** de `app/src/main/AndroidManifest.xml`.
- **Remise** dans un manifest propre au canal sideload :
  `app/src/sideload/AndroidManifest.xml`.
- Le canal `play` ne reçoit donc **jamais** cette permission → conforme.

## 4. `MainActivity.kt` — gardes conditionnées au canal

```kotlin
// IntegrityGuard : ignoré sur Play (Google re-signe → signature ≠ figée)
if (!BuildConfig.PLAY_BUILD && !IntegrityGuard.isGenuine(this)) { ... }

// Auto-update : ignorée sur Play (MAJ via le Store)
if (!BuildConfig.PLAY_BUILD && !updateCheckedThisSession) { ... }
```

## 5. `SettingsScreen.kt` — section MAJ masquée sur Play

La section « Mises à jour » (bouton « Vérifier maintenant ») est entourée de
`if (!BuildConfig.PLAY_BUILD) { ... }`.

> ℹ️ Le code de l'updater (`update/UpdateChecker`, `UpdateDialog`,
> `UpdateInstaller`) reste présent dans les deux variantes mais **n'est jamais
> atteint** sur Play (effet gardé + bouton masqué + permission absente). C'est
> volontairement minimal et sûr. Étape « propre » optionnelle plus tard :
> déplacer le package `update/` dans `src/sideload/` pour qu'il ne soit même pas
> compilé côté Play (nécessite une petite abstraction dans `MainActivity`).

## 6. CI

- `.github/workflows/android-build.yml` : build `:app:assembleSideloadRelease`
  / `assembleSideloadDebug` (ton APK quotidien, chemin `apk/sideload/...`).
- `playstore/ci/playstore-release.yml` : build `:app:bundlePlayRelease` → AAB.

---

## Point de vigilance : edge-to-edge (Android 15 / API 35)

`targetSdk 35` impose l'**edge-to-edge** par défaut. L'app est en Compose plein
écran : après build, **vérifier sur appareil** que la barre de statut (haut) et la
barre de navigation (bas) ne masquent rien (status bar, footer « G-SYS »). Si
besoin : `WindowCompat.setDecorFitsSystemWindows(window, false)` +
`windowInsetsPadding`. À contrôler visuellement.

---

## Checklist de vérification (avant de publier)

- [ ] Build **CI APK** (sideload) vert → APK quotidien toujours OK
- [ ] APK sideload installé : auto-update **présent**, app démarre normalement
- [ ] Build **CI AAB** (play) vert
- [ ] AAB play installé (via bundletool / test interne) : **pas** d'écran
      « COPIE NON AUTORISÉE », pas de bouton MAJ, UI edge-to-edge OK
- [ ] `versionCode` incrémenté si nouvel upload Play (88 → 89…)

---

## Versions / SDK de référence

| | Avant | Après |
|---|---|---|
| AGP | 8.4.2 | **8.6.0** |
| Gradle | 8.7 | 8.7 (inchangé) |
| compileSdk | 34 | **35** |
| targetSdk | 34 | 34 (sideload) / **35** (play) |
| minSdk | 26 | 26 (inchangé) |
