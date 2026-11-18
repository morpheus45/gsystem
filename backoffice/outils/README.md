<!-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE). -->
# Régénérer les fixtures produites par le vrai code Kotlin

1. Copier `HarnaisBackofficeTest.kt.txt` vers `app/src/test/java/com/morpheus45/gsystem/HarnaisBackofficeTest.kt`.
2. Lancer (JDK 17) : `./gradlew :app:testSideloadDebugUnitTest --tests '*HarnaisBackofficeTest*'`
3. **Supprimer** le fichier copié : rien ne doit être commité sous `app/`.

Le harnais écrit `backoffice/fixtures/donnees-fictif.json` et `backoffice/fixtures/heures-kotlin.json`.
