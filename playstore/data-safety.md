# Formulaire « Sécurité des données » — réponses prêtes

> Console → **Contenu de l'application → Sécurité des données**. Ce formulaire est
> **obligatoire** et **public** (affiché sur la fiche). Il doit refléter la
> réalité du code. ⚠ Mentir ici = motif de **suspension**.
>
> Rappel du code : l'app **transmet** (via `backup/` + Apps Script) un
> récapitulatif contenant des **données clients** (nom, ville, n° d'intervention,
> observations) + **frais** vers un Google Drive. C'est donc **collecte + partage**.

---

## A. Vue d'ensemble

| Question | Réponse |
|---|---|
| Votre app collecte ou partage-t-elle des données utilisateur requises ? | **Oui** |
| Toutes les données sont-elles chiffrées en transit ? | **Oui** (HTTPS) |
| Fournissez-vous un moyen de demander la suppression des données ? | **Oui** — via l'e-mail de contact (suppression côté organisation) + désinstallation pour les données locales |

---

## B. Types de données — à déclarer

Pour **chaque** type ci-dessous, Play demande : *Collectée ?* / *Partagée ?* /
*Traitement éphémère ?* / *Obligatoire ou facultative ?* / *Finalités*.

### 1. Informations personnelles → « Autres informations » (données client)
- **Collectée : Oui** · **Partagée : Oui** (vers le Drive de l'organisation)
- Obligatoire : **Oui**
- Finalité : **Gestion de l'app / fonctionnalité de l'app** (suivi d'intervention)
- *Détail* : nom du client, ville, n° d'intervention, observations.

> Play n'a pas de case « données de tiers » dédiée : déclarer sous
> « Informations personnelles → Nom » + « Autres informations » selon ce qui colle
> le mieux. L'essentiel : **ne rien cacher**.

### 2. Photos
- **Collectée : Oui** · **Partagée : Oui** (tickets/relevés envoyés au Drive)
- Obligatoire : Oui · Finalité : **Fonctionnalité de l'app**

### 3. Informations financières → « Autres informations financières »
- **Collectée : Oui** · **Partagée : Oui**
- Obligatoire : Oui · Finalité : **Fonctionnalité de l'app**
- *Détail* : montants de frais professionnels, TVA (frais du technicien, pas de
  coordonnées bancaires).

### 4. Identifiants / Nom (du technicien)
- **Collectée : Oui** · **Partagée : Oui**
- Obligatoire : Oui · Finalité : **Fonctionnalité de l'app**
- *Détail* : nom/identifiant du technicien saisi en réglages.

---

## C. Ce que l'app NE collecte PAS (à laisser décoché)

- ❌ Position géographique (GPS)
- ❌ Contacts, calendrier, SMS, appels
- ❌ Identifiant publicitaire / données à des fins **publicitaires**
- ❌ Historique de navigation / recherche
- ❌ Données de santé
- ❌ Coordonnées bancaires (numéro de carte, IBAN)
- ❌ Aucun **SDK analytics / pub tiers** (pas de Firebase Analytics, pas d'AdMob)

---

## D. Pratiques de sécurité

| Question | Réponse |
|---|---|
| Données chiffrées en transit | **Oui** |
| L'utilisateur peut demander la suppression | **Oui** |
| Engagement envers la Play Families Policy | **Non concerné** (app adultes/pro) |
| Données examinées par un programme de sécurité indépendant | **Non** (facultatif) |

---

## E. Finalités autorisées (rappel des cases Play)

Cocher uniquement : **Fonctionnalité de l'app** et **Gestion de l'app**.
Ne **PAS** cocher : Publicité/marketing, Personnalisation, Analytics tiers,
Prévention de la fraude par un tiers.

---

## F. Cohérence à vérifier

- La **politique de confidentialité** (URL) décrit **exactement** ces mêmes
  données et ce partage Drive → c'est le cas dans `docs/privacy.html`. ✅
- Si tu actives un jour un SDK analytics, **reviens** mettre à jour ce formulaire.
- Si tu choisis l'**app privée** (Managed Play), tu remplis quand même ce
  formulaire, mais l'exposition publique est réduite.
