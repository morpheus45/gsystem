<!-- © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE). -->
# Rendu « doux » du back-office — demande du 19/11/2026 (à reprendre)

## La demande (mots de Cédric)

> « J'aimerais un résultat dans ce style-là, regarde, écoute » — « Mais adapté à mon projet » —
> « Je parle du rendu du SaaS » — « C'est un SaaS pro, c'est des images de gamins ça » (à propos
> d'objets 3D illustratifs : caméra, camionnette, pièce, étoile…, refusés) — « Délègue au maximum et
> consigne la demande pour reprise ».

Référence : vidéo TikTok verticale de 55 s (@andromis, « Voici un SaaS à 4 000 € »), envoyée dans la
session du 19/11/2026, non versionnée. Musique rythmée ; le contenu utile est l'image.

## Ce que montre la référence

Fond gris clair aéré, cartes blanches très arrondies, ombres douces ; rail de navigation **noir**
arrondi à gauche, pastille de l'élément actif qui glisse ; bandeau d'accueil en dégradé pastel avec
une **forme 3D abstraite** (fleur, nœud, galet) ; membres en pastilles brillantes ; gros chiffres ;
barres arrondies (une mise en avant, les autres claires) ; sélecteurs « Hebdo / Mensuel » en
pilules noires ; boutons d'action en pilules noires. Sept effets, code visible dans la vidéo :

| Étape | Effet | Réglages lus dans la vidéo |
|---|---|---|
| L'arrivée | les cartes arrivent l'une après l'autre | `opacity 0→1`, `rotateX(18deg)→none`, `blur(18px)→0`, 1150 ms, délai `i × 55 ms` |
| La matière | objets 3D irisés | Three.js `MeshPhysicalMaterial({ iridescence: 1, clearcoat: 1, sheen: 1, roughness: 0.28 })` |
| Les données | chiffres qui défilent | chaque chiffre = bande 0-9 ; `pos = easeOutExpo(p) × (10 + chiffre)` ; `translateY(-pos × 5 %)` |
| L'équipe | barres qui montent | `scaleY(0)→scaleY(1)`, 1100 ms, délai `i × 30 ms` |
| Les favoris | filtre qui estompe | `cartes.forEach(c => c.classList.toggle('dim', !voir(c, type)))` |
| Le stockage | anneau qui se remplit | `strokeDashoffset C → C × 0.32`, 1900 ms, `cubic-bezier(.3, 0, .1, 1)` |
| La navigation | pastille qui glisse | `transition: transform .6s cubic-bezier(.34, 1.4, .5, 1)` |

## Décisions d'adaptation (prises le 19/11/2026)

1. **Couleurs G-Systems**, pas la lavande de la référence : noir du logo (`#0d0607` / `#1c0a0e`),
   dégradé de la marque `#e6001c → #ff5a6e → #ff8a3d`.
2. **SaaS pro** : aucune illustration littérale. Une seule forme 3D **abstraite** : le nœud au
   dégradé de la marque, dans le bandeau d'accueil (et l'écran de connexion). Déjà prête :
   `web/objets3d.js` (WebP intégré, 22 Ko), fabriquée par `outils/rendu3d/`.
3. **Menu** : rail noir (fond du logo) qui **garde les libellés** et les **bandes de groupes**
   (demande antérieure de Cédric) ; pastille blanche de l'élément actif qui glisse (ordinateur) ;
   ligne qui défile sur téléphone.
4. **Tableau de bord en mosaïque** : bandeau d'accueil (surtitre société · mois, titre, phrase, sélecteur
   de mois en pilule, bouton noir « Voir les interventions », nœud qui flotte doucement) ; 5 tuiles
   aux chiffres qui défilent ; **anneau** dans la tuile Taux NR (part d'installations réussies,
   vert si NR ≤ 8 %, rouge au-dessus, texte et icône gardés) ; **barres arrondies** à la place des
   camemberts (types de mission, résultats ; valeur écrite sur chaque barre) ; « À faire » en liste à
   pastilles de couleur + pilule « Ouvrir » ; « Par technicien » avec avatars en pastilles brillantes.
5. **Mouvement** (skills `animate`, `emil-design-eng`) : les effets « spectacle » (arrivée des cartes,
   chiffres, barres, anneau) seulement à la **première ouverture de la journée** et quand les données
   changent ; durées raccourcies pour l'usage quotidien (arrivée 600 ms, chiffres 900 ms, barres 700 ms,
   anneau 1100 ms, pastille 360 ms) ; **aucun déplacement** si « réduire les animations » est demandé.
6. **Accessibilité** : contraste ≥ 4,5:1 (clair et sombre), focus visible au clavier, cibles ≥ 44 px au
   toucher, aucun défilement horizontal en 375 px ; les chiffres animés gardent leur valeur lisible
   par les lecteurs d'écran.

## Jetons de design

| Jeton | Clair | Sombre |
|---|---|---|
| `--bg` | `#f6f3f3` | `#0d0809` |
| `--card` | `#ffffff` | `#171012` |
| `--surface-2` | `#f3eeee` | `#20171a` |
| `--text` | `#160d0f` | `#f8f1f1` |
| `--muted` | `#6b5f61` | `#b8aaac` |
| `--border` | `#ebe3e4` | `#2d2225` |
| `--accent` (liens, texte de marque) | `#c4001a` | `#ff8f82` |
| `--accent-fond` (pilule principale) | `#160d0f` | `#f8f1f1` |
| `--sur-accent` (texte sur pilule) | `#ffffff` | `#160d0f` |
| `--rail` | `#150b0d` | `#060304` (+ filet `#2d2225`) |
| `--barre-douce` | `#f3e5e6` | `#2b1d20` |
| `--rayon` / `--rayon-sm` | 20 px / 12 px | idem |

Bandeau d'accueil : clair `linear-gradient(115deg, #ffe3e1, #ffd9cf 48%, #ffe7d6)`,
sombre `linear-gradient(115deg, #3a1418, #3b1d16 55%, #3a2214)`.

## Étapes et état

- [x] Analyse de la référence ; décisions ; forme 3D abstraite (nœud) prête.
- [ ] Couche de style (`web/index.html`) et structure du tableau de bord — confiée aux IA gratuites (`delegue`).
- [ ] Rendu du tableau de bord : chiffres, anneau, barres, À faire, avatars, arrivée, pastille du rail
      (`web/rendu.js` + branchement dans `web/app.js`) — confié aux IA gratuites.
- [ ] Vérification : clair et sombre, 375 / 768 / 1440 px, audit `ui-ux-pro-max`, tests, captures à Cédric.
- [ ] Après validation de Cédric : étendre aux autres écrans (techniciens, véhicules, paie, compta…).
