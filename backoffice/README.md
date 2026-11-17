# Back-office multi-société — squelette

Squelette **testé**, sans interface ni hébergement. Le plan complet est dans [PLAN.md](PLAN.md).

## Lancer tous les tests (une commande)

```bash
cd backoffice && npm ci && npm test
```

Il faut Node 26 (version testée : 26.8.2). Seule dépendance : PGlite (un vrai Postgres qui tourne dans Node), pour les tests de sécurité. Aucun compte cloud n'est utilisé.

## Contenu

| Dossier | Rôle |
|---|---|
| `core/` | Règles métier : sociétés, heures et heures sup, frais, véhicules, paie. Réutilise `docs/app/heures.js` et `docs/app/frais.js` sans les copier. |
| `pont/` | Transforme un `donnees.json` de l'APK en lignes d'**une** société choisie. |
| `supabase/migrations/` | Tables, rôles, RLS, journal d'audit. |
| `fixtures/` | Données **100 % fictives**. `donnees-fictif.json` et `heures-kotlin.json` ont été produits par le vrai code Kotlin (harnais JUnit jetable, supprimé ensuite). |
| `test/` | Tests `node --test`, dont l'isolation entre sociétés (`rls.test.js`). |

## Régénérer les fixtures Kotlin

Le harnais est gardé hors de `app/`, dans [outils/](outils/README.md).

## Base locale (Supabase sur ce poste, développement seulement)

Supabase tourne en local dans Docker, avec des données **fictives**. Ce n'est pas la production.
Version de l'outil figée à `supabase@2.122.1` (branche stable officielle).

| Action | Commande (depuis `backoffice/`) |
|---|---|
| Démarrer (réservé à ce poste) | `npx supabase@2.122.1 start --network-id gsystem-backoffice-local` |
| Voir les adresses | `npx supabase@2.122.1 status` |
| Arrêter (garde les données) | `npx supabase@2.122.1 stop` |
| Repartir de zéro (migrations + `supabase/seed.sql`) | `npx supabase@2.122.1 db reset --network-id gsystem-backoffice-local` |
| Sauvegarder les données dans un fichier | `npx supabase@2.122.1 db dump --local --data-only > sauvegarde.sql` |

Interface d'administration : http://127.0.0.1:54323 (Supabase Studio).

**Toujours ajouter `--network-id gsystem-backoffice-local` à `start` et à `db reset`.** Sans ça, Supabase écoute sur tout le réseau local avec des mots de passe par défaut connus de tous ([doc officielle](https://supabase.com/docs/guides/local-development)). Ce réseau Docker se crée une seule fois :

```bash
docker network create -o 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' gsystem-backoffice-local
```

## Écran du back-office (Phase 1)

```bash
npm run web
```

Ouvre http://127.0.0.1:5180/web/ (ce poste seulement). Supabase local doit tourner.

1. Créer son compte sur l'écran, puis cliquer le lien de confirmation reçu dans la boîte de test locale : http://127.0.0.1:54324 (Mailpit, aucun vrai email ne part).
2. Devenir opérateur (une fois, jamais depuis l'écran) :
   `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "insert into operateurs select id from auth.users where email = 'VOTRE_EMAIL'"`
3. L'opérateur crée une société et saisit l'email de son admin. L'admin crée son compte avec **cet email confirmé** : il entre seul dans la société, puis invite son équipe.

L'opérateur ne voit pas les données des sociétés qu'il crée.

## Version de test en ligne (Apps Script + Supabase Free)

Page : https://script.google.com/macros/s/AKfycbyaSTT80yEP9H9GXxJcbK-1P2rT_xgA3yyAKbMvJuJK8Mmbdv1UU9oT5dVsV13E_z2TgA/exec

Mettre à jour après un changement dans `web/`. Construire depuis `backoffice/`, puis lancer clasp **depuis `apps-script-test/`** (non versionné ; il garde le lien vers le script) :

```bash
SUPABASE_URL=https://<projet>.supabase.co SUPABASE_CLE_PUBLIQUE=sb_publishable_... sh outils/apps-script-build.sh
npx @google/clasp@3.4.1 -P "$PWD/.clasp.json" push --force
npx @google/clasp@3.4.1 -P "$PWD/.clasp.json" create-version "message"
npx @google/clasp@3.4.1 -P "$PWD/.clasp.json" update-deployment -V <n> AKfycbyaSTT80yEP9H9GXxJcbK-1P2rT_xgA3yyAKbMvJuJK8Mmbdv1UU9oT5dVsV13E_z2TgA
```

Toujours passer `-P apps-script-test/.clasp.json` : sinon clasp prend le projet G-Systems de la racine du dépôt.

## Migrer ailleurs plus tard

Rien ne dépend de ce poste :
- **Structure** : les fichiers de `supabase/migrations/` sont la seule référence. Ils s'appliquent tels quels sur Supabase en ligne (`supabase link` puis `supabase db push`) ou sur un Supabase auto-hébergé.
- **Données** : la sauvegarde ci-dessus est un fichier SQL standard, rechargeable avec `psql`.
- **Hors Supabase** : le SQL est du Postgres standard. Seuls `auth.uid()`, `auth.users` et le rôle `authenticated` viennent de Supabase ; `test/supabase-local.sql` montre en 9 lignes comment les recréer.
