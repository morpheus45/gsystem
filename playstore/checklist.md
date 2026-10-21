# Checklist de soumission — G-Systems v1.9.9

> Coche au fur et à mesure. Ordre détaillé dans `README.md` §2.
> Légende : 🧑 = action que **toi seul** peux faire · 💻 = code/build · 📝 = formulaire.

---

## A. Compte & prérequis

- [ ] 🧑 Compte **Google Play Console** créé (25 $ payés, identité vérifiée)
- [ ] 🧑 Choix du modèle : **app publique** _ou_ **app privée (Managed Play)** → §6 signing
- [ ] 🧑 E-mail de contact défini

## B. Politique de confidentialité

- [ ] 📝 `docs/privacy.html` : `<nom/raison sociale>` et `<e-mail>` complétés
- [ ] 🧑 GitHub Pages activé → URL accessible : `https://morpheus45.github.io/gsystem/privacy.html`
- [ ] URL testée dans un navigateur (page s'affiche)

## C. Correctifs de code — APPLIQUÉS via flavors, à build-vérifier — voir `code-changes-required.md`

- [x] 💻 Deux flavors `sideload` / `play` + flag `BuildConfig.PLAY_BUILD`
- [x] 💻 `REQUEST_INSTALL_PACKAGES` déplacé en `src/sideload/` (absent du canal play)
- [x] 💻 `IntegrityGuard` + auto-update désactivés sur le canal play
- [x] 💻 `compileSdk 35`, `targetSdk 35` (play) / 34 (sideload), AGP 8.6.0
- [ ] 💻 **Build CI APK (sideload)** vert → APK quotidien intact
- [ ] 💻 **Build CI AAB (play)** vert (`bundlePlayRelease`)
- [ ] 🧑 AAB play testé : pas d'écran « COPIE NON AUTORISÉE », UI edge-to-edge OK
- [ ] 💻 `versionCode` incrémenté avant upload Play (→ 89)

## D. Signature & build — voir `signing-and-build.md`

- [ ] 🧑 Clé d'upload `gsystem-upload.jks` générée + **sauvegardée** (coffre)
- [ ] 💻 `*.jks` / `key.properties` dans `.gitignore` (jamais committés)
- [ ] 💻 **AAB** produit (`app-release.aab`) — local _ou_ CI
- [ ] (CI) 🧑 4 secrets GitHub créés (`UPLOAD_*`)

## E. Création de l'app dans la Console

- [ ] Nom : **G-Systems** · Langue par défaut : **FR** · Type : Application · Gratuite
- [ ] **Play App Signing** activé (par défaut, à la 1re release)

## F. Fiche store — voir `store-listing-fr.md` + `assets/README.md`

- [ ] 📝 Nom (≤30), description courte (≤80), description complète (≤4000)
- [ ] 📝 Release notes
- [ ] 🧑 **Icône 512×512** importée
- [ ] 🧑 **Feature graphic 1024×500** importé
- [ ] 🧑 **≥ 2 captures** téléphone importées (données fictives, pas de vrai client)
- [ ] 📝 Catégorie : Productivité · Annonces : **Non** · Achats intégrés : **Non**

## G. Déclarations obligatoires

- [ ] 📝 **Sécurité des données** rempli → voir `data-safety.md` (déclare le partage Drive !)
- [ ] 📝 **Classification du contenu** (IARC) → voir `content-rating.md`
- [ ] 📝 **Public cible** : 18+ (pas d'enfants)
- [ ] 📝 **Annonces** : Non
- [ ] 📝 **URL politique de confidentialité** renseignée
- [ ] 📝 Section **Gouvernement / Santé / Finance** : non concerné

## H. Test fermé (comptes perso créés après nov. 2023)

- [ ] 🧑 Piste de **test fermé** créée, AAB téléversé
- [ ] 🧑 **≥ 20 testeurs** invités (comptes Gmail) et **opt-in**
- [ ] 🧑 Test laissé tourner **14 jours** continus

## I. Production

- [ ] 🧑 Promotion en **production** après validation du test fermé
- [ ] ⏳ Examen Google (quelques jours) → publication

---

## Garde-fous RGPD (ne pas zapper)

- [ ] 🧑 Droit de traiter les **données clients** confirmé (base légale, info des personnes)
- [ ] 🧑 Cohérence vérifiée entre `privacy.html` ↔ `data-safety.md` ↔ réalité du code
- [ ] 🧑 `backup_rules.xml` / `allowBackup` revus (pas d'export cloud non maîtrisé des données sensibles)
