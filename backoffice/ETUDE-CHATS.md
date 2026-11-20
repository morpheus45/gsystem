<!-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. -->

# Étude des flux de messages chat (bureau ↔ techniciens)

> **Étude seulement** — aucun changement de code, pas de commit/push.
> Objectif : documenter l'existant et proposer un plan bidirectionnel simple et sûr.

---

## 1. Flux actuel — Application Android (APK)

### 1.1 Fichiers concernés
| Fichier | Rôle |
|---------|------|
| `app/src/main/java/com/morpheus45/gsystem/chat/ChatApi.kt` | Envoi, récupération, lecture, suppression via Apps Script |
| `app/src/main/java/com/morpheus45/gsystem/chat/ChatStore.kt` | Cache mémoire (StateFlow) partagé entre badge accueil et ChatScreen |
| `app/src/main/java/com/morpheus45/gsystem/ui/ChatScreen.kt` | UI Compose, poll 12 s, envoi, suppression, marquage lu |
| `app/src/main/java/com/morpheus45/gsystem/backup/BackupConfig.kt` | `ENDPOINT` + `TOKEN` partagés avec la sauvegarde Drive |
| `app/src/main/java/com/morpheus45/gsystem/chat/ChatMessage.kt` | Data class : `id`, `from` ("tech" \| "bureau"), `text`, `ts` |

### 1.2 Envoi (technicien → bureau)
- **Déclencheur** : utilisateur tape + bouton Envoyer dans `ChatScreen.kt:111-123`
- **Appel** : `ChatApi.send(tech, text)` → POST JSON vers `BackupConfig.ENDPOINT` (`/exec`)
  - `token` = `SHARED_TOKEN` (identique sauvegarde Drive)
  - `action` = `"chat_send"`
  - `tech` = `settings.nomUtilisateur`
  - `text` = message
- **Backend** : Apps Script `chatSend_(tech, 'tech', text)` → écrit dans Google Sheet `_gsystem_chat` (onglet `messages`)
  - Colonnes : `id` (timestamp croissant), `tech`, `from`, `text`, `ts`, `readTech`, `readBureau`
  - `readTech=true` pour les messages *du* technicien (lu par l'émetteur), `readBureau=false`

### 1.3 Réception (bureau → technicien)
- **Poll** : `ChatScreen.kt:93-103` → `LaunchedEffect` toutes les **12 secondes**
  - `ChatStore.refresh(tech)` → `ChatApi.fetch(tech)` → `chatFetch_(tech)`
  - Retourne tous les messages du technicien (filtrés par colonne `tech`)
  - Champ `lu` calculé côté Apps Script : `readTech` si `from='bureau'` sinon `readBureau`
- **Cache** : `ChatStore._messages` (StateFlow) — ne s'écrase pas si réponse vide (résilience réseau)
- **Marquage lu** : après refresh, si `latestId > settings.chatLastReadId` → `ChatApi.markRead(tech, latest)` → `chatMarkRead_(tech, 'tech', upTo)` met `readTech=true` pour messages `from='bureau'` jusqu'à `upTo`

### 1.4 Suppression
- **Bouton** corbeille dans `TopAppBar` → `ChatApi.deleteConversation(tech)` → `chatDelete_(tech)`
- Supprime **toutes** les lignes du technicien dans la feuille (les deux sens)
- **Pas d'archive** côté APK (l'archive est faite par le tableau de bord avant suppression)

### 1.5 Points clés
- **Même endpoint** que la sauvegarde Drive (`BackupConfig.ENDPOINT`, `BackupConfig.TOKEN`)
- **Stockage** : Google Sheet `_gsystem_chat` dans le dossier Drive des sauvegardes
- **Pas de temps réel** : poll 12 s (configurable dans `ChatScreen.kt:101`)
- **Authentification** : token partagé (pas de secret, APK décompilable) — protection réelle = code Apps Script

---

## 2. Flux actuel — Application iPhone (PWA `docs/app/`)

### 2.1 Constat
- **Aucune fonctionnalité chat** bureau ↔ technicien dans la PWA iPhone.
- Seuls **messages Viber sortants** existent (`docs/app/viber.js`):
  - `messageCloture(…)` — message de clôture d'intervention
  - `messageAttente(…)` — message d'attente client
- Ces fonctions ouvrent le partage iOS vers Viber, **pas de persistance** ni de réponse.

### 2.2 Endpoint Apps Script
- La PWA utilise le **même** `ENDPOINT` Apps Script pour la sauvegarde (`docs/app/backup.js:25-26`)
- Mais **aucune action** `chat_send` / `chat_fetch` / `chat_markRead` / `chat_delete` n'est appelée.

---

## 3. Back-office (Supabase `public.messages` + UI `backoffice/web/app.js`)

### 3.1 Table `public.messages` (migrations Supabase)
| Migration | Contenu |
|-----------|---------|
| `20261118000019_messages.sql` | Création table, RLS, trigger `private.signer_message()` — insertion seule, `lu_le` seul champ modifiable, `de IN ('bureau','technicien')`, `auteur` = `auth.uid()` si `de='bureau'` |
| `20261118000020_messages_modifiables.sql` | Ajout `modifie_le`, autorise **correction texte** (par auteur bureau ou pont côté technicien), **suppression** si `lu_le IS NULL` et `de='bureau'` (par auteur ou super admin) |

**Schéma principal** :
```sql
id uuid PK, societe_id, technicien_id, de ('bureau'|'technicien'), texte, auteur uuid, cree_le, lu_le, modifie_le
Index: messages_conversation_idx (societe_id, technicien_id, cree_le)
RLS: lecture/écriture/mise à jour/suppression → rôle admin ou gestion de la société
```

### 3.2 UI back-office — Fonctions principales (`backoffice/web/app.js`)

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `compterMessagesNonLus()` | 2334 | `SELECT count(*) WHERE de='technicien' AND lu_le IS NULL` → badge onglet |
| `chargerMessages()` | 2340 | `SELECT * FROM messages WHERE societe_id=… ORDER BY cree_le` → `messages[]` global + `afficherChat()` |
| `afficherChat()` | 2350 | Liste techniciens (actifs + ceux qui ont des messages), badge non-lus, checkboxes diffusion |
| `afficherFil()` | 2382 | Bulles conversation du `chatTech` sélectionné, boutons Modifier/Supprimer (si `de='bureau'` et auteur) |
| `ouvrirConversation(t)` | 2405 | Marque lus côté bureau (`UPDATE lu_le=now() WHERE de='technicien' AND lu_le IS NULL`) |
| `modifierMessage(m)` | 2419 | `UPDATE texte WHERE id=m.id` (trigger vérifie auteur) |
| `supprimerMessage(m)` | 2428 | `DELETE WHERE id=m.id` (trigger refuse si `lu_le` non null ou pas auteur) |
| `envoyerMessages(ids[], texte)` | 2436 | `INSERT` multiples `de='bureau'` + `auteur=auth.uid()` |

- **Poll UI** : `setInterval(chargerMessages, 30000)` actif seulement sur onglet Messages (`panel-messages`)
- **Envoi unitaire** : formulaire `#chat-form` → `envoyerMessages([chatTech.id], texte)`
- **Diffusion** : formulaire `#chat-diffusion` → checkboxes techniciens → `envoyerMessages(ids, texte)`

### 3.3 Sens des messages
- **Bureau → technicien** : `de='bureau'`, inséré par UI back-office (admin/gestion)
- **Technicien → bureau** : **pas encore implémenté** — prévu via le **pont** (clé serveur) qui écrira `de='technicien'`

---

## 4. Pont d'import (`backoffice/pont/`)

### 4.1 Existant
- `apps-script.js` : import **lecture seule** Drive → Supabase (heures, frais, photos, gestes_co, véhicules, barèmes)
- `normaliser.js` : `TABLES_PONT = { temps: 'temps', frais: 'frais', photos: 'photos_apk', gestes: 'gestes_co' }`
- **Aucune table `messages`** dans `TABLES_PONT` — le chat n'est pas importé
- Exécution : toutes les heures (trigger Apps Script) + bouton « Synchroniser maintenant » back-office

### 4.2 Données source Drive
- Structure : `Sauvegardes G-Systems/<tech>/<AAAA-MM>/donnees.json`
- Le chat APK n'est **pas** dans `donnees.json` — il est dans la feuille Google Sheet `_gsystem_chat` (Apps Script partagé)

---

## 5. Synthèse : état des lieux

| Côté | Envoi | Réception | Stockage | Bidirectionnel ? |
|------|-------|-----------|----------|------------------|
| **APK Android** | ✅ `chat_send` → Sheet | ✅ Poll 12 s `chat_fetch` | Sheet `_gsystem_chat` | ✅ (via Apps Script) |
| **PWA iPhone** | ❌ (Viber seulement) | ❌ | — | ❌ |
| **Back-office** | ✅ `INSERT de='bureau'` | ✅ Poll 30 s `SELECT` | Supabase `messages` | ⚠️ Sens technicien manquant |
| **Pont** | — | — | — | ❌ Pas de messages |

---

## 6. Plan bidirectionnel simple et sûr (étape par étape)

### Principe directeur
- **Ne pas casser l'existant** : APK continue de parler à la feuille `_gsystem_chat` via Apps Script.
- **Pont unique** : le pont (clé serveur) devient le **seul** écrivain `de='technicien'` dans Supabase.
- **Lecture back-office** : inchangée (poll 30 s sur `messages`).
- **Écriture back-office** : inchangée (`INSERT de='bureau'`).

### Étape 1 — Étendre le pont pour lire la feuille `_gsystem_chat` et écrire dans `messages`

**Fichiers à modifier** :
1. `backoffice/pont/normaliser.js`
   - Ajouter `'messages': 'messages'` dans `TABLES_PONT`
   - Ajouter fonction `normaliserMessages(feuille, { societeId, technicienId })` → retourne lignes `{ societe_id, technicien_id, de, texte, cree_le, lu_le }`
     - `de` = valeur colonne `from` ('tech' → 'technicien', 'bureau' → 'bureau')
     - `cle_source` = `${technicienId}/message/${id}` (id de la feuille)
     - `cree_le` = `new Date(ts).toISOString()`
     - `lu_le` = `readBureau` si `from='technicien'` sinon `readTech` (convertir booléen → timestamp ou null)

2. `backoffice/pont/apps-script.js`
   - Dans `importer()`, après `donneesDuTech()`, ajouter lecture feuille `_gsystem_chat` :
     ```javascript
     const chatSheet = getChatSheet_(); // réutiliser la logique existante
     const rows = chatSheet.getRange(2, 1, chatSheet.getLastRow()-1, 7).getValues();
     const techRows = rows.filter(r => String(r[1]) === dossierTech.getName());
     const messages = normaliserMessages(techRows, { societeId: SOCIETE_ID, technicienId });
     ajouter(cle, 'messages', messages, 'societe_id,cle_source');
     ```
   - `getChatSheet_()` existe déjà dans `apps-script/Code.js` (l.693) — **dupliquer** la fonction dans `apps-script.js` du pont (le pont est un Apps Script séparé, lecture seule Drive).

**Sécurité** :
- Clé unique `societe_id, cle_source` → pas de doublon, réimport idempotent
- `de='technicien'` seulement pour `from='tech'` ; `de='bureau'` aussi importé (historique complet)
- Le pont n'écrit **jamais** `de='bureau'` de lui-même (réservé à l'UI back-office)

### Étape 2 — Adapter l'APK pour lire depuis Supabase (optionnel, plus tard)

> **Non bloquant** : l'APK continue de fonctionner via Apps Script. Cette étape vise à supprimer la dépendance à la feuille Google Sheet.

**Fichiers à modifier** :
1. `app/src/main/java/com/morpheus45/gsystem/chat/ChatApi.kt`
   - Nouvelle implémentation `fetchSupabase(tech)` : GET `.../rest/v1/messages?technicien_id=eq.…&select=id,de,texte,cree_le,lu_le,modifie_le&order=cree_le`
   - Utiliser la **clé publique** Supabase (anon key) — en dur dans `BackupConfig` ou `BuildConfig`
   - Garder l'ancien `fetch()` en fallback si échec

2. `ChatStore.kt` — inchangé (cache agnostique à la source)

3. `ChatScreen.kt` — inchangé (poll 12 s appelle `ChatStore.refresh()`)

**Marquage lu côté APK** :
- `markRead(tech, upToId)` → PATCH `messages?technicien_id=eq.…&id=lte.${upToId}&de=eq.bureau` avec `lu_le=now()`
- Nécessite **RLS** autorisant `UPDATE lu_le` pour le technicien (policy à ajouter : `technicien_id = auth.uid()` via JWT ? Non, APK n'a pas d'utilisateur Supabase)
- **Alternative simple** : garder `chat_markRead` Apps Script qui met `readTech=true` dans la feuille. Le pont réimportera `lu_le` au passage suivant. Latence ≤ 1 h (fréquence pont).

### Étape 3 — PWA iPhone : ajouter le chat (quand demandé)

**Fichiers à créer/modifier** :
1. `docs/app/chat.js` (nouveau) — miroir de `ChatScreen.kt` en JS vanilla / module
2. `docs/app/app.js` — importer et initialiser l'onglet chat
3. `docs/app/backup.js` — réutiliser `ENDPOINT` + `TOKEN` existants pour `chat_send/fetch/markRead/delete`
4. UI : onglet « Support » ou bulle flottante (style `chatFab` du tableau de bord Apps Script l.1239)

**Backend** : même Apps Script (`chat_send/fetch/…`) — **aucun changement** requis.

---

## 7. Fichiers à modifier — Résumé

| Étape | Fichier | Type | Description |
|-------|---------|------|-------------|
| 1 | `backoffice/pont/normaliser.js` | **Modifier** | `TABLES_PONT` + `normaliserMessages()` |
| 1 | `backoffice/pont/apps-script.js` | **Modifier** | Import messages depuis `_gsystem_chat` dans `importer()` |
| 2 (optionnel) | `app/.../chat/ChatApi.kt` | **Modifier** | Ajout `fetchSupabase()`, `markReadSupabase()` |
| 2 (optionnel) | `app/.../backup/BackupConfig.kt` | **Modifier** | Ajouter `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| 3 (futur) | `docs/app/chat.js` | **Créer** | Module chat PWA |
| 3 (futur) | `docs/app/app.js` | **Modifier** | Intégrer chat PWA |
| — | `backoffice/web/app.js` | **Aucun** | Déjà prêt (lit `de='technicien'`) |
| — | Migrations Supabase | **Aucun** | Déjà prévues (`de='technicien'`, trigger pont) |

---

## 8. Points de vigilance

1. **Idempotence** : `cle_source = "${technicienId}/message/${idSheet}"` garantit pas de doublon même si pont relancé.
2. **Ordre des messages** : `cree_le` = `ts` (epoch ms) → tri correct dans `afficherFil()`.
3. **Lu / non-lu** : `lu_le` = timestamp si lu, `null` sinon. Back-office marque `lu_le` à l'ouverture (`ouvrirConversation`). Pont réimportera les `lu_le` mis à jour par Apps Script (`readBureau`).
4. **Suppression** : APK `chat_delete` efface la feuille. Pont n'importe plus ces messages (disparus de la source). Back-office garde son historique (`messages` non effacé) — **comportement souhaité** (traçabilité bureau).
5. **Archive** : `boChatDelete` archive dans Drive avant suppression feuille. Historique conservé.
6. **RLS messages** : déjà restrictif (`admin|gestion` pour bureau, `technicien` futur via pont clé serveur). Pas de policy `SELECT` pour technicien authentifié (APK n'a pas de JWT) — lecture via Apps Script ou future clé publique.

---

## 9. Ordre de réalisation recommandé

1. **Étape 1** (pont → Supabase) : **immédiat** — débloque la visibilité bureau des messages techniciens.
2. **Étape 2** (APK → Supabase) : **plus tard** — quand on veut retirer la dépendance Google Sheet. Non urgent.
3. **Étape 3** (PWA iPhone) : **à la demande** — si besoin métier.

> Fin de l'étude. Aucun code modifié.