<!-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. -->
# Étude des clôtures du 19 et 20/11/2026 (IA gratuite, NON vérifiée)
Cela garantit que le début du cycle correspond toujours au 21 (ou au jour configuré) du mois en cours.
---
### Symptôme 2 – Heures d’arrivée et de fin identiques ou décalées d’une minute  
**Cause** : `settings.pendingArrivalMs` conserve le timestamp de l’arrivée pointée. Dans `AddTempsDialog` (`ui/TempsScreen.kt:889`) la heure de début (`heureDebut`) est extraite de cette valeur : `DateUtil.hm(settings.pendingArrivalMs)`. Après l’enregistrement d’une entrée, le champ n’est pas remis à 0, si bien que la prochaine entrée réutilise le même timestamp, ce qui entraîne `heureDebut ≈ heureFin` (identique ou différence d’une minute, selon l’instant exact de la sauvegarde).  
**Correction minimale** : après l’appel `repo.addTempsAll(entries)` dans le `onSave` de `TempsScreen` (ligne 200), ajouter  
```kotlin
settingsStore.update { it.copy(pendingArrivalMs = 0L, pendingArrivalSource = "") }
```  
ou, de façon équivalente, réinitialiser `pendingArrivalMs = 0L` juste avant `onSave` dans `AddTempsDialog`. Cela empêche le réemploi du timestamp d’une entrée précédente.
---
### Symptôme 3 – Journée du 20 novembre « PLANNING VIDE » absente du back‑office  
**Cause** : Le même bug de `cyclePeriod` fait que la période affichée commence le 19 au lieu du 21. Les entrées du 20 novembre, qui devraient entrer dans le cycle courant (21 nov → 20 déc), se retrouvent techniquement dans le cycle précédent (21 oct → 20 nov) qui a déjà été clôturé et poussé sur le Drive. `CycleSync.pushCycle` ne ré‑injecte donc pas les données du 20 nov, tandis que celles du 19 nov (qui relèvent du cycle précédent mais ont été sauvegardées avant la clôture) apparaissent.  
**Correction minimale** : appliquer la correction du point 1 (condition sur le jour du mois). Une fois le cycle bien borné à `21 nov → 20 déc`, la date du 20 novembre tombera dans la fenêtre courante et sera incluse dans le `pushCycle` suivant, rendant la journée visible dans le back‑office.  
---  
*Trois sections, ≤ 15 lignes chacune, sans modification de code dans le présent échange.*
