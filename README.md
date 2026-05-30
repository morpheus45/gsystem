# G-Systems — Android App

Application Android pour techniciens G-Systems : saisie rapide des
interventions TEMPS / GSM SEUL / GESTE CO, calcul des totaux en €, envoi
par email avec pièce jointe CSV à la fin du cycle mensuel.

## Page d'installation pour les techs

**[➜ morpheus45.github.io/gsystem](https://morpheus45.github.io/gsystem/)** — tutoriel + lien APK toujours à jour.

## Téléchargement de l'APK

À chaque push sur `main`, GitHub Actions builde une APK debug. Pour la
récupérer :

1. Aller dans l'onglet **Actions** du repo
2. Cliquer sur le dernier run "Build Android APK" qui est ✅ vert
3. En bas de page, télécharger l'artifact **`gsystem-debug-apk`**
4. Décompresser le ZIP → tu obtiens `app-debug.apk`
5. Transférer sur le téléphone (USB, Drive, email à soi-même…)
6. Ouvrir l'APK sur Android. Autoriser "Installer des applications de
   sources inconnues" pour le navigateur ou l'app de fichiers utilisé.

## Premier lancement

L'app demande les 3 adresses email (TEMPS, GSM SEUL, GESTE CO), le jour
de début de cycle mensuel (par défaut : 21), et les tarifs unitaires des
extensions GESTE CO. Ces réglages sont conservés ; tu peux les modifier
n'importe quand via l'icône engrenage en haut à droite de l'écran d'accueil.

## Fonctionnement quotidien

- **TEMPS** : saisie d'une intervention (date, dépt, type, client, heures, observations)
- **GSM SEUL** : saisie d'une installation GSM (date, dépt, client)
- **GESTE CO** : saisie d'une ligne d'extension vendue (date, type, quantité)
  - Le sous-total et le total période sont calculés automatiquement
- À chaque écran, bouton **Envoyer** pour générer le CSV de la période en
  cours et ouvrir l'app email avec destinataire + pièce jointe pré-remplis.

## Stack technique

- Kotlin 1.9 + Jetpack Compose (Material 3)
- Stockage : DataStore (préférences) + JSON local (fichier `entries.json`)
- Min SDK 24 (Android 7.0+), target SDK 34
- Build : Gradle 8.7, Android Gradle Plugin 8.4

## Développement local

Avec Android Studio Iguana (ou plus récent) :

```bash
git clone https://github.com/morpheus45/gsystem.git
cd gsystem
./gradlew :app:assembleDebug
```

L'APK sera dans `app/build/outputs/apk/debug/app-debug.apk`.
