# Visuels Google Play — spécifications & TODO

> Tous les visuels marqués **obligatoire** doivent être fournis pour publier.
> Place les fichiers finaux dans ce dossier (`playstore/assets/`) puis téléverse-les
> dans la Console (Présence sur le Store → Fiche principale → Éléments graphiques).

---

## 1. Icône de l'application — **obligatoire**

| Spéc | Valeur |
|---|---|
| Format | **PNG 32 bits** (avec alpha) |
| Dimensions | **512 × 512 px** |
| Poids max | 1 Mo |
| Forme | Carré plein (Play applique le masque arrondi/adaptatif lui-même) |

➡ **À produire** : `icon-512.png`

> L'app utilise une icône **adaptative vectorielle** (`mipmap/ic_launcher`) — il
> n'existe **pas** de PNG 512 prêt. Exporter un 512×512 à partir du design de
> l'icône (le wordmark « G-S » / logo). Un fichier orphelin
> `app/src/main/assets/bon_retour/icon-512.png` existe mais n'est pas forcément le
> bon visuel : à vérifier/remplacer. Fond plein, marges de sécurité ~10 %.

---

## 2. Image de présentation (Feature graphic) — **obligatoire**

| Spéc | Valeur |
|---|---|
| Format | PNG ou JPG (sans alpha) |
| Dimensions | **1024 × 500 px** |
| Poids max | 1 Mo |

➡ **À produire** : `feature-graphic-1024x500.png`

Contenu suggéré : fond sombre (Obsidian `#0b0d10`), wordmark **« G-SYSTEMS »** en
clair, accent violet (`#8A5CF6`), sous-titre « Outil de terrain pour techniciens ».
Pas de texte près des bords (rogné selon les appareils).

---

## 3. Captures d'écran téléphone — **obligatoire (min. 2, idéal 4-8)**

| Spéc | Valeur |
|---|---|
| Format | PNG ou JPG |
| Nombre | **2 à 8** |
| Ratio | 16:9 ou 9:16 |
| Côté min | ≥ 320 px · Côté max | ≤ 3840 px |
| Conseil | Captures **réelles** en portrait, ex. 1080 × 2400 |

➡ **À produire** (sur ton téléphone, rendu réel) :
- `screen-1-home.png` — l'accueil avec les 7 tuiles
- `screen-2-cloture.png` — Clôture d'intervention
- `screen-3-frais.png` — Frais (ticket + TVA)
- `screen-4-recap.png` — Récap du cycle
- (optionnel) `screen-5-envoi.png` — Envoi mensuel

> ⚠ **Toi seul** peux les prendre (rendu réel sur l'appareil). Évite d'y faire
> figurer de **vraies données client** : utilise des données fictives pour les
> captures publiques (ex. « Client : Démo », « Ville : Exemple »).

---

## 4. Captures tablette — *facultatif*

Non requis si l'app n'est pas mise en avant tablette. Si fournies : 7" et/ou 10",
mêmes règles de format.

---

## 5. Récap des fichiers attendus dans ce dossier

```
playstore/assets/
├─ icon-512.png                 (obligatoire)
├─ feature-graphic-1024x500.png (obligatoire)
├─ screen-1-home.png            (obligatoire)
├─ screen-2-cloture.png         (obligatoire)
├─ screen-3-frais.png           (recommandé)
└─ screen-4-recap.png           (recommandé)
```

---

## 6. Charte rapide (pour rester cohérent avec l'app)

| Élément | Valeur |
|---|---|
| Fond | Obsidian `#0B0D10` |
| Texte clair | `#F2F5F7` |
| Accent violet | `#8A5CF6` (CameraEnd / AttenteStart) |
| Accent secondaire | `#6366F1` |
| Typo | Sans-serif géométrique, majuscules pour les titres |
