<!-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. -->

# ETUDE — Jeton de sauvegarde par téléphone (G-Systems)

## Problème
`SHARED_TOKEN` est écrit en dur dans `BackupConfig.kt` (APK), `JETON` dans `docs/app/backup.js` (iPhone) et lu via `SHARED_TOKEN`/`SHARED_TOKEN_OLD` dans `apps-script/Code.js`. Le dépôt est public : ce jeton est connu de tous. Aucun serveur dédié : tout passe par le web app Apps Script, qui vérifie déjà le token dans `checkToken_()` et accepte déjà `SHARED_TOKEN_OLD` en cas de rotation.

## Objectif
Un jeton PAR TÉLÉPHONE, délivré par le bureau (back-office), révocable, sans casser les téléphones en service pendant la fenêtre de transition où l'ancien jeton reste accepté.

## Conception minimale (pas de nouveau serveur)

### Côté serveur — `apps-script/Code.js`
1. Propriété script `PHONE_TOKENS` : `{"<phoneId>":"<jeton>"}` (vide au départ).
2. Propriété script `TOKEN_MODE` : `"shared"` (défaut) ou `"per_phone"`.
3. Modifier `checkToken_(got, phoneId)` :
   - mode `shared` : comportement actuel (SHARED_TOKEN / SHARED_TOKEN_OLD).
   - mode `per_phone` : accepter `got` si `phoneId` présent et `PHONE_TOKENS[phoneId] === got` ; sinon accepter encore SHARED_TOKEN / SHARED_TOKEN_OLD (fenêtre de transition).
4. Fonctions admin (protégées par `DASHBOARD_CODE`) : `boIssuePhoneToken(code, phoneId, token)`, `boRevokePhoneToken(code, phoneId)`, `boListPhoneTokens(code)`.
5. `doPost` passe `p.phoneId` à `checkToken_`.
6. Ajouter au dashboard HTML un panneau "Jeton par téléphone" : liste des phones, créer / révoquer.

### Côté clients
7. Android : `phoneId` stable (UUID généré une fois, stocké dans DataStore), jeton par téléphone stocké à la place de `BackupConfig.TOKEN`. Envoyer `token` + `phoneId` dans chaque POST (BackupUploader, DriveSync, ChatApi, OrdresApi, UpdateChecker).
8. iPhone (`docs/app/backup.js`) : `phoneId` UUID dans localStorage, jeton par téléphone à la place de `JETON`, envoyer `token` + `phoneId`.

### Délivrance du jeton (back-office)
- Le bureau génère un jeton aléatoire par téléphone et le déclare via le dashboard (`boIssuePhoneToken`).
- Alternative plus simple : le téléphone appelle `?issue=1&phoneId=X&token=<ancien jeton>` ; le script crée `PHONE_TOKENS[X]` s'il manque et renvoie le nouveau jeton que l'app stocke. L'ancien jeton partagé sert encore pour ce premier échange.

### Transition sans casse
A. Déployer le script avec `PHONE_TOKENS` vide + `TOKEN_MODE="shared"` : rien ne change.
B. Publier l'APK vX qui envoie `phoneId` + le jeton stocké (ancien jeton tant qu'aucun per-phone n'est émis) : tout fonctionne.
C. Le bureau émet un jeton par téléphone ; chaque téléphone le récupère (flux issu ou saisi), le stocke, l'utilise. Ancien jeton toujours accepté via `SHARED_TOKEN_OLD` / fallback `per_phone`.
D. Quand tous les téléphones sont passés au jeton par téléphone : supprimer `SHARED_TOKEN` / `SHARED_TOKEN_OLD`, passer `TOKEN_MODE` en `per_phone` strict, révoquer les jetons des téléphones perdus.

### Ce que Cédric doit faire lui-même
- Déployer le script Apps Script (nouvelle version après chaque édition de Code.js) et publier le nouvel APK (tag CI).
- Générer les jetons par téléphone, les inscrire dans le dashboard (jamais dans le dépôt public).
- Tester un vrai appel avec `token` invalide (refus) et valide (succès).
- Vérifier que les téléphones en service continuent de recevoir leurs sauvegardes pendant la transition.
- Ne jamais écrire un jeton en dur, ici ou ailleurs.

### Fichiers à modifier
1. `apps-script/Code.js` — propriétés + `checkToken_` + fonctions admin + `doPost` + dashboard UI.
2. `app/src/main/java/com/morpheus45/gsystem/backup/BackupConfig.kt` — supprimer `TOKEN`, ajouter téléphone/jeton stockés.
3. `backup/BackupUploader.kt` — ajouter `phoneId`.
4. `backup/DriveSync.kt` — ajouter `phoneId`.
5. `chat/ChatApi.kt` — ajouter `phoneId`.
6. `ordres/OrdresApi.kt` — ajouter `phoneId`.
7. `update/UpdateChecker.kt` — ajouter `phoneId`.
8. `docs/app/backup.js` — remplacer `JETON` par jeton par téléphone + `phoneId`.

### Sécurité
- Aucun jeton en dur dans le code ni dans ce document. Jetons aléatoires, stockés dans les propriétés du script (côté serveur) et localement sur chaque téléphone.
- Révocation immédiate : supprimer l'entrée `PHONE_TOKENS[phoneId]` depuis le dashboard.
