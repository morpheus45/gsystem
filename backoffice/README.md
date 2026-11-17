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
