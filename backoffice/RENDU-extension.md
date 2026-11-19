<!-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE). -->
# Extension du rendu « doux » aux autres écrans

> **Statut** : plan proposé le 19/11/2026, **à valider par Cédric** après le prototype du tableau de bord
> (voir `RENDU.md`). Premier jet relu : les 33 identifiants cités existent bien dans la page.
>
> **Corrections apportées à la relecture** (elles priment sur le texte ci-dessous) :
> 1. Arrivée des cartes : les valeurs de `RENDU.md` (600 ms, `rotateX(12deg)`, flou 8 px, délai `i × 55 ms`),
>    pas les valeurs brutes de la vidéo (18°, 18 px).
> 2. Chat, bulles du bureau : pas de texte blanc sur le corail (contraste insuffisant) ; fond `--accent-doux`
>    et texte `--text`, ou fond `#c4001a` et texte blanc.
> 3. Anneau de la fiche véhicule : à préciser avant de le faire (ce qu'il mesure : part de l'intervalle
>    d'entretien déjà consommée ?), sinon ne pas le mettre.
> 4. Les lots modifient tous `web/index.html` et `web/app.js` : pour les mener **en parallèle**, un lot =
>    une branche ou un espace de travail séparé, fusionnés ensuite un par un et testés ; sinon l'un après l'autre.

## Principes communs à tous les écrans

Chaque écran reçoit les mêmes jetons (`--bg`, `--card`, `--rail`, dégradé marque), le même rail noir à gauche (pastille blanche glissante), les mêmes pilules noires pour les actions principales, les mêmes cartes blanches très arrondies (`--rayon: 20px`). La forme 3D abstraite (nœud) n'apparaît qu'une fois : connexion et bandeau du tableau de bord.

---

## 1. Connexion (`#login-screen`, `#signup-screen`)

1. **`#login-screen`** → bandeau dégradé marque en fond haut de carte (`linear-gradient(115deg, #ffe3e1, #ffd9cf 48%, #ffe7d6)`), nœud 3D flottant en coin supérieur droit (même `objets3d.js` que le tableau de bord). *Bénéfice : cohérence immédiate avec le tableau de bord.*
2. **`#login-screen h1`** → typographie `font-size: 1.75rem; letter-spacing: -0.03em; font-weight: 700`. *Bénéfice : hiérarchie claire.*
3. **`#login-form button[type=submit]`** → pilule noire (`background: var(--accent-fond); border-radius: 999px; width: 100%`). *Bénéfice : cohérence avec les CTA du tableau de bord.*
4. **`#signup-link`, `#login-link`** → remplacer la couleur `--accent` bleue par `--accent` rouge G-Systems. *Bénéfice : palette unifiée.*
5. **À ne pas animer** : le bouton « Se connecter » (action répétée à chaque session).

---

## 2. Liste des sociétés (`#niveau-societes`, `.societe-list`)

1. **`.societe-list`** → grille `minmax(280px, 1fr)`, gap 20px ; chaque `.societe-item` passe à `border-radius: 20px; padding: 20px 24px; box-shadow` doux. *Bénéfice : mosaïque aérée.*
2. **`.societe-item`** → avatar-pastille colorée (initiales de la société, dégradé marque) à gauche, `.societe-name` en `font-size: 1rem; font-weight: 600`. *Bénéfice : identification rapide sans logo.*
3. **`#titre-societes`** → surtitre `<span>` en `font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted)` au-dessus du titre. *Bénéfice : hiérarchie tableau de bord.*
4. **`#operator-section > summary`** → pilule noire (`border-radius: 999px; background: var(--accent-fond); color: var(--sur-accent)`). *Bénéfice : CTA visible.*
5. **Arrivée des cartes** : `opacity 0→1, rotateX(18deg)→none, blur(18px)→0`, 600 ms, délai `i × 55 ms` — seulement à la première ouverture du jour. **À ne pas animer** : le hover sur `.societe-item` (action fréquente).

---

## 3. Techniciens — liste (`#tech-liste`)

1. **`#techniciens-table tbody tr`** → avatar-pastille brillante (initiales) dans la première cellule, même style que « Par technicien » du tableau de bord. *Bénéfice : cohérence visuelle.*
2. **`#tech-filtre`** → remplacer le `<select>` par deux pilules noires/grises (Actuels / Archivés). *Bénéfice : sélecteur dans le style du tableau de bord.*
3. **`.section` contenant `#techniciens-table`** → carte blanche `border-radius: 20px`. *Bénéfice : cohérence.*
4. **`details.ajout#tech-liste > summary`** → pilule noire. *Bénéfice : CTA unifié.*
5. **À ne pas animer** : le filtre Actuels/Archivés (changement fréquent).

---

## 4. Fiche technicien (`#tech-fiche`) et ses sous-onglets

1. **`#tech-fiche-titre`** → avatar-pastille brillante (initiales, dégradé marque, 48 px) à gauche du nom ; `font-size: 1.375rem; font-weight: 700`. *Bénéfice : identité forte.*
2. **`.sous-onglets` dans `#tech-fiche`** → pilules noires/grises (`border-radius: 999px`), fond `var(--surface-2)`. *Bénéfice : cohérence avec le sélecteur Hebdo/Mensuel.*
3. **`.tech-resume-carte`** → 3 tuiles chiffres-défilants (interventions du mois, heures, frais) en ligne, même style que le tableau de bord. *Bénéfice : lecture immédiate.*
4. **`#tech-camemberts`** → remplacer les camemberts par des barres arrondies horizontales (même rendu que le tableau de bord), valeur écrite sur chaque barre. *Bénéfice : cohérence.*
5. **`#tech-section-heures table`** → colonne « Validées » avec pilule verte/rouge selon statut. *Bénéfice : état lisible d'un coup d'œil.*
6. **À ne pas animer** : la navigation entre sous-onglets (action très fréquente) ; les filtres de tableau.

---

## 5. Interventions (`#panel-interventions`)

1. **`#int-resume`** → 3 tuiles chiffres-défilants (total, OK, NR) au-dessus du tableau. *Bénéfice : synthèse immédiate.*
2. **Filtres `#int-tech`, `#int-type`, `#int-resultat`** → regroupés dans une carte `border-radius: 20px; padding: 16px 20px`. *Bénéfice : zone de filtres délimitée.*
3. **`#int-export`, `#int-zip`** → pilules secondaires (contour, `border-radius: 999px`). *Bénéfice : hiérarchie CTA.*
4. **`#int-table tbody tr.ligne-cliquable`** → colonne Résultat en pilule colorée (vert OK, rouge NR). *Bénéfice : lecture rapide.*
5. **À ne pas animer** : le bouton Afficher, les filtres (actions répétées).

---

## 6. Congés (`#panel-conges`)

1. **`#conges-filtre`** → 4 pilules (À valider · Validés · Refusés · Tous), style sélecteur tableau de bord. *Bénéfice : cohérence.*
2. **`#conges-table` colonne Statut** → pilule colorée (orange demandée, vert validée, rouge refusée). *Bénéfice : état visible.*
3. **`details.ajout` « Saisir une demande »** → pilule noire. *Bénéfice : CTA unifié.*
4. **Carte englobante** → `border-radius: 20px`. *Bénéfice : cohérence.*
5. **À ne pas animer** : le filtre de statut.

---

## 7. Messages / Chat (`#panel-messages`)

1. **`#chat-liste`** → chaque item devient une carte `border-radius: 12px; padding: 12px 16px` avec avatar-pastille brillante à gauche. *Bénéfice : cohérence équipe.*
2. **`.bulle.bureau`** → fond dégradé marque (`#e6001c → #ff5a6e`), texte blanc. *Bénéfice : identité G-Systems.*
3. **`#chat-form button[type=submit]`** → pilule noire. *Bénéfice : CTA unifié.*
4. **`#chat-messages`** → `border-radius: 20px; border: 1px solid var(--border)`. *Bénéfice : cohérence carte.*
5. **À ne pas animer** : l'envoi de message, la sélection de conversation (actions très fréquentes).

---

## 8. Véhicules — liste (`#vehicules-liste`)

1. **`#vehicules-table tbody tr`** → plaque en pilule noire (`border-radius: 999px; background: var(--accent-fond); color: var(--sur-accent); font-size: 0.8125rem`). *Bénéfice : identification immédiate.*
2. **Carte englobante** → `border-radius: 20px`. *Bénéfice : cohérence.*
3. **`details.ajout` « Ajouter un véhicule »** → pilule noire. *Bénéfice : CTA unifié.*
4. **À ne pas animer** : le tri du tableau.

---

## 9. Fiche véhicule (`#vehicule-detail`) et plan d'entretien

1. **`#vehicule-detail-title`** → icône-pastille (initiales de la plaque, fond `--surface-2`) à gauche. *Bénéfice : cohérence fiche technicien.*
2. **`.sous-onglets` dans `#vehicule-detail`** → pilules noires/grises. *Bénéfice : cohérence.*
3. **`#plan-table` colonne État** → pilule colorée (vert OK, orange proche, rouge dépassé) remplaçant les classes `.alerte-depassee` / `.alerte-proche`. *Bénéfice : lecture immédiate.*
4. **`#entretiens-stats`** → 2 tuiles chiffres (coût total, nombre d'entretiens). *Bénéfice : synthèse.*
5. **Anneau SVG** dans la tuile kilométrage (même rendu que Taux NR du tableau de bord) : `strokeDashoffset`, 1100 ms — seulement au chargement de la fiche. **À ne pas animer** : les formulaires d'ajout.

---

## 10. Paie (`#panel-paie`)

1. **`#paie-periode`** → sélecteur en pilule (style Hebdo/Mensuel). *Bénéfice : cohérence.*
2. **`#paie-resume`** → 3 tuiles chiffres-défilants (heures normales totales, sup, frais). *Bénéfice : synthèse.*
3. **`#paie-table` colonne État** → pilule colorée. *Bénéfice : lecture rapide.*
4. **`#paie-export`** → pilule noire (CTA principal). *Bénéfice : hiérarchie.*
5. **À ne pas animer** : validation de semaine (action répétée).

---

## 11. Compta (`#panel-compta`)

1. **`#compta-table`** → colonne « À traiter » en pilule orange si > 0. *Bénéfice : alerte visible.*
2. **Carte englobante** → `border-radius: 20px`. *Bénéfice : cohérence.*
3. **`#compta-params > summary`** → pilule secondaire. *Bénéfice : hiérarchie CTA.*
4. **À ne pas animer** : le bouton Afficher.

---

## 12. Facturation (`#panel-facturation`)

1. **`#fact-interventions`, `#fact-equipements`** → précédés chacun d'une tuile chiffre-défilant (total lignes). *Bénéfice : synthèse.*
2. **`#fact-export`** → pilule secondaire. *Bénéfice : hiérarchie.*
3. **`#tarifs-table` colonne Prix HT** → fond `--barre-douce` si vide (à remplir). *Bénéfice : alerte douce.*
4. **À ne pas animer** : le bouton Afficher.

---

## 13. Membres (`#panel-membres`)

1. **`#membres-table tbody tr`** → avatar-pastille brillante (initiales) en première colonne. *Bénéfice : cohérence équipe.*
2. **`#inviter-form button`** → pilule noire. *Bénéfice : CTA unifié.*
3. **`#purge-lancer`** → pilule danger (contour rouge). *Bénéfice : action destructive clairement signalée.*
4. **À ne pas animer** : les actions de gestion des membres.

---

## Ordre de réalisation — lots indépendants

| Lot | Fichiers / écrans | Peut démarrer |
|-----|-------------------|---------------|
| **A** | Connexion (`#login-screen`, `#signup-screen`) | Immédiatement |
| **B** | Liste des sociétés (`#niveau-societes`) | Immédiatement |
| **C** | Techniciens liste + fiche (`#panel-techniciens`) | Immédiatement |
| **D** | Véhicules liste + fiche (`#panel-vehicules`) | Immédiatement |
| **E** | Interventions + Congés (`#panel-interventions`, `#panel-conges`) | Immédiatement |
| **F** | Messages (`#panel-messages`) | Immédiatement |
| **G** | Paie + Compta + Facturation (`#panel-paie`, `#panel-compta`, `#panel-facturation`) | Immédiatement |
| **H** | Membres (`#panel-membres`) | Immédiatement |
| **I** | Intégration finale : jetons communs, rail, pastille glissante, `prefers-reduced-motion` | Après A–H |

Chaque lot A–H est **strictement indépendant** : il ne touche qu'à son propre panneau et aux classes communes déjà définies dans `RENDU.md`. Le lot I consolide et vérifie la cohérence globale (clair/sombre, 375/768/1440 px, accessibilité).
