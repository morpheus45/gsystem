# Publication Google Play — G-Systems v1.9.9

> Dossier complet pour publier **G-Systems** (`com.morpheus45.gsystem`, versionCode 88,
> versionName 1.9.9) sur le Google Play Store, en conformité avec les règles
> d'admission Google Play.
>
> ⚠ **À lire en entier avant de commencer.** Plusieurs points te concernent
> directement (compte payant, clé de signature, captures d'écran, formulaires) :
> ils ne peuvent pas être faits à ta place.

---

## 0. Le verdict honnête en 30 secondes

L'app **telle qu'elle est aujourd'hui (sideload)** ne passe **pas** Google Play.
Il y a **4 bloqueurs techniques** + plusieurs obligations administratives.
Tout est préparé ici, mais il reste **des actions que toi seul peux faire** :

> 🆕 **Stratégie retenue : deux canaux (build flavors).** Un seul code source
> produit **`sideload`** (ton APK GitHub actuel, INCHANGÉ) **et** **`play`** (AAB
> conforme Store). Les correctifs ci-dessous ont été **appliqués** ainsi — à
> build-vérifier en CI. Détail : `code-changes-required.md`.

| Bloqueur | Qui | Statut |
|---|---|---|
| Auto-update interne (`REQUEST_INSTALL_PACKAGES`) interdit par Play | Code | ✅ appliqué (désactivé sur canal `play`) → `code-changes-required.md` |
| `targetSdk 34` → Play exige **35** | Code | ✅ appliqué (`targetSdk 35` sur canal `play`, AGP 8.6) |
| `IntegrityGuard` casse avec Play App Signing | Code | ✅ appliqué (désactivé sur canal `play`) |
| Build **AAB** signé (pas APK) | Build | ✅ workflow `bundlePlayRelease` → `signing-and-build.md` |
| Compte Play Console (**25 $**, **test fermé 20 testeurs / 14 j**) | **Toi** | ⏳ à faire |
| Clé d'upload (keystore) | **Toi** | ⏳ guide fourni |
| Politique de confidentialité **en ligne** | Semi-auto | ✅ `docs/privacy.html` prêt à héberger |
| Fiche store + captures + icône 512px | **Toi** (textes fournis) | ⏳ |
| Formulaires Data safety / Content rating | **Toi** (réponses fournies) | ⏳ |

> 💡 **Alternative à considérer sérieusement** : cette app est un **outil interne
> d'entreprise** (une société, ses techniciens). Le canal Play le plus adapté est
> **Managed Google Play / app privée** (diffusion réservée à ton organisation via
> Google Workspace), qui évite la fiche publique, le test fermé 20 testeurs et une
> partie des formalités. Voir `signing-and-build.md` §6. Le sideload actuel
> (GitHub Releases) reste aussi parfaitement valable et gratuit.

---

## 1. Contenu de ce dossier

| Fichier | À quoi ça sert |
|---|---|
| `README.md` | Ce guide maître (ordre des opérations) |
| `checklist.md` | Case à cocher avant soumission |
| `store-listing-fr.md` | Titre, descriptions, nouveautés (prêts à copier) |
| `privacy-policy.md` | Politique de confidentialité (texte source) |
| `data-safety.md` | Réponses au formulaire « Sécurité des données » |
| `content-rating.md` | Réponses au questionnaire de classification (IARC) |
| `signing-and-build.md` | Keystore, Play App Signing, build de l'AAB, CI |
| `code-changes-required.md` | Modifs de code **obligatoires** pour passer Play |
| `assets/README.md` | Spécifications icône / feature graphic / captures |
| `../docs/privacy.html` | Politique de confidentialité **hébergeable** (GitHub Pages) |
| `ci/playstore-release.yml` | Workflow GitHub Actions pour produire l'AAB signé |

---

## 2. Ordre des opérations (chemin le plus court)

1. **Créer le compte Google Play Console** (25 $, une fois) →
   <https://play.google.com/console>. Choisir « Personnel » ou « Organisation ».
2. **Héberger la politique de confidentialité** : `docs/privacy.html` est déjà
   prêt → elle sera servie à `https://morpheus45.github.io/gsystem/privacy.html`
   dès le prochain déploiement Pages. (Renseigner ton email de contact dedans.)
3. **Correctifs de code = déjà appliqués** via les deux flavors (`sideload` /
   `play`) — voir `code-changes-required.md`. Il reste à **build-vérifier en CI**
   (l'APK `sideload` doit rester nominal, l'AAB `play` doit compiler). Incrémente
   `versionCode` avant chaque upload Play.
4. **Générer la clé d'upload** (`signing-and-build.md` §1) et **construire l'AAB**
   du flavor play (`bundlePlayRelease`, §3) — en local *(Android Studio)* ou via
   le workflow CI (§5).
5. **Créer l'app dans la Console** : nom, langue par défaut FR, type « Application »,
   gratuite. Activer **Play App Signing** (par défaut).
6. **Remplir la fiche store** (`store-listing-fr.md`) + **importer les visuels**
   (`assets/README.md`).
7. **Remplir les déclarations** : Data safety (`data-safety.md`), Content rating
   (`content-rating.md`), Public cible, Annonces (= non), Politique de confidentialité (URL).
8. **Test fermé** : créer une piste de test fermée, inviter ≥ 20 testeurs,
   laisser tourner **14 jours** (obligatoire pour les comptes personnels créés
   après nov. 2023 avant d'ouvrir la prod).
9. **Promouvoir en production** une fois le test validé → examen Google (qq jours).

---

## 3. Ce que SEUL toi peux faire (non délégable)

- Payer les **25 $** et vérifier ton identité (D-U-N-S si organisation).
- **Conserver la clé d'upload + son mot de passe** (si tu la perds, procédure de
  réinitialisation Google nécessaire). **Ne jamais la committer.**
- Recruter les **20 testeurs** pour le test fermé (comptes Gmail).
- Prendre/valider les **captures d'écran** sur ton téléphone (le rendu réel).
- Choisir si tu pars sur **app publique** ou **app privée (Managed Play)**.

---

## 4. Important — données & vie privée (ne pas survoler)

L'app **envoie automatiquement** vers un Google Drive (via Apps Script) un
récapitulatif contenant des **données clients** (nom, ville, n° d'intervention,
observations) et des **frais**. Pour Google Play c'est de la **collecte + partage
de données** : ça **doit** être déclaré dans « Sécurité des données » et couvert
par la politique de confidentialité (faits ici). Assure-toi d'avoir le **droit**
de traiter ces données clients (RGPD : base légale, information des personnes).
Si tu préfères ne rien déclarer de sensible, l'option **app privée** limite
l'exposition, mais l'obligation RGPD demeure.
