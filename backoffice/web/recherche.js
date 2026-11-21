// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).

/**
 * Normalise un texte : minuscules, sans accents, espaces réduits, bords retirés.
 * @param {string} texte
 * @returns {string}
 */
export function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filtre une liste d'éléments selon une requête textuelle.
 * Chaque élément doit avoir { titre, sousTitre, motsCles, action }.
 * Garde ceux dont le texte normalisé contient TOUS les mots de la requête normalisée.
 * Tri : ceux dont le titre normalisé commence par la requête normalisée d'abord, puis l'ordre d'origine.
 * Requête vide → les max premiers éléments.
 * @param {Array<{titre: string, sousTitre: string, motsCles: string, action: Function}>} elements
 * @param {string} requete
 * @param {number} max
 * @returns {Array}
 */
export function filtrerPalette(elements, requete, max = 8) {
  const rn = normaliser(requete);
  if (rn === '') return elements.slice(0, max);

  const mots = rn.split(' ').filter(Boolean);

  // Garder les éléments dont le texte normalisé contient tous les mots
  const trouves = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const texte = normaliser(el.titre + ' ' + el.sousTitre + ' ' + el.motsCles);
    if (mots.every(m => texte.includes(m))) {
      trouves.push({ el, index: i });
    }
  }

  // Tri : titre qui commence par la requête normalisée d'abord, puis ordre d'origine
  trouves.sort((a, b) => {
    const aTitre = normaliser(a.el.titre).startsWith(rn) ? 0 : 1;
    const bTitre = normaliser(b.el.titre).startsWith(rn) ? 0 : 1;
    if (aTitre !== bTitre) return aTitre - bTitre;
    return a.index - b.index;
  });

  return trouves.slice(0, max).map(t => t.el);
}

// Compteur d'identifiants uniques pour les options de la liste
let _idCompteur = 0;

/**
 * Ouvre la palette de recherche ⌘K.
 * @param {Object} options
 * @param {Array<{titre: string, sousTitre: string, motsCles: string, action: Function}>} options.elements
 * @param {Function} options.onChoisir - appelée avec l'élément choisi
 * @param {string} [options.placeholder]
 * @returns {Function} fermer - fonction pour fermer la palette
 */
export function ouvrirPalette({ elements, onChoisir, placeholder = 'Chercher un technicien, un véhicule, une action\u2026' }) {
  const ancienFocus = document.activeElement;
  let indexActif = -1;
  let resultats = [];

  // Fond
  const fond = document.createElement('div');
  fond.className = 'palette-fond';

  // Palette (dialogue)
  const palette = document.createElement('div');
  palette.className = 'palette';
  palette.setAttribute('role', 'dialog');
  palette.setAttribute('aria-modal', 'true');
  palette.setAttribute('aria-label', 'Recherche');
  fond.appendChild(palette);

  // Champ de recherche
  const listeId = 'palette-liste-' + (++_idCompteur);
  const champ = document.createElement('input');
  champ.type = 'search';
  champ.className = 'palette-champ';
  champ.placeholder = placeholder;
  champ.setAttribute('aria-controls', listeId);
  champ.setAttribute('role', 'combobox');   // motif ARIA 1.2 : champ + liste de suggestions
  champ.setAttribute('aria-expanded', 'true');
  champ.setAttribute('aria-autocomplete', 'list');
  palette.appendChild(champ);

  // Liste
  const liste = document.createElement('ul');
  liste.className = 'palette-liste';
  liste.setAttribute('role', 'listbox');
  liste.id = listeId;
  palette.appendChild(liste);

  /** Met à jour la liste de résultats */
  function mettreAJour() {
    resultats = filtrerPalette(elements, champ.value);
    // Vider la liste (sans innerHTML)
    while (liste.firstChild) liste.removeChild(liste.firstChild);

    if (resultats.length === 0) {
      const li = document.createElement('li');
      li.className = 'vide';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.textContent = 'Aucun résultat';
      liste.appendChild(li);
      indexActif = -1;
      champ.removeAttribute('aria-activedescendant');
      return;
    }

    for (let i = 0; i < resultats.length; i++) {
      const r = resultats[i];
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = listeId + '-opt-' + i;
      li.setAttribute('aria-selected', 'false');

      const spanTitre = document.createElement('span');
      spanTitre.className = 'titre';
      spanTitre.textContent = r.titre;
      li.appendChild(spanTitre);

      const spanSous = document.createElement('span');
      spanSous.className = 'sous-titre';
      spanSous.textContent = r.sousTitre;
      li.appendChild(spanSous);

      // Clic sur une option
      li.addEventListener('click', () => {
        choisir(r);
      });

      liste.appendChild(li);
    }

    // Le premier résultat est présélectionné : Entrée le choisit directement.
    indexActif = -1;
    activerOption(0);
  }

  /** Active l'option à l'index donné */
  function activerOption(nouvelIndex) {
    // Désactiver l'ancienne
    if (indexActif >= 0 && indexActif < resultats.length) {
      const ancien = liste.children[indexActif];
      if (ancien) ancien.setAttribute('aria-selected', 'false');
    }
    indexActif = nouvelIndex;
    if (indexActif >= 0 && indexActif < resultats.length) {
      const actuel = liste.children[indexActif];
      if (actuel) {
        actuel.setAttribute('aria-selected', 'true');
        champ.setAttribute('aria-activedescendant', actuel.id);
        // Faire défiler si nécessaire
        actuel.scrollIntoView({ block: 'nearest' });
      }
    } else {
      champ.removeAttribute('aria-activedescendant');
    }
  }

  /** Choisit un élément et ferme la palette */
  function choisir(element) {
    onChoisir(element);
    fermer();
  }

  /** Ferme la palette et rend le focus */
  function fermer() {
    if (fond.parentNode) {
      fond.parentNode.removeChild(fond);
    }
    if (ancienFocus && typeof ancienFocus.focus === 'function') {
      ancienFocus.focus();
    }
  }

  // Gestion du clavier
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (resultats.length === 0) return;
      const prochain = indexActif < resultats.length - 1 ? indexActif + 1 : 0;
      activerOption(prochain);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (resultats.length === 0) return;
      const precedent = indexActif > 0 ? indexActif - 1 : resultats.length - 1;
      activerOption(precedent);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (indexActif >= 0 && indexActif < resultats.length) {
        choisir(resultats[indexActif]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fermer();
    }
  });

  // Tab reste dans la palette (piège de focus)
  palette.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      champ.focus();
    }
  });

  // Saisie : mise à jour des résultats
  champ.addEventListener('input', () => {
    mettreAJour();
  });

  // Clic sur le fond (hors .palette) : fermer
  fond.addEventListener('click', (e) => {
    if (!palette.contains(e.target)) {
      fermer();
    }
  });

  // Ajouter au DOM et focus
  document.body.appendChild(fond);
  champ.focus();
  mettreAJour();

  return fermer;
}

/**
 * Installe le raccourci clavier ⌘K / Ctrl+K pour ouvrir la palette.
 * @param {Function} ouvrir - fonction appelée quand le raccourci est activé
 * @returns {Function} retirer - retire l'écouteur
 */
export function installerRaccourci(ouvrir) {
  function gerer(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      // N'ouvrir que si aucune palette n'est déjà dans le DOM
      if (!document.querySelector('.palette')) {
        ouvrir();
      }
    }
  }
  document.addEventListener('keydown', gerer);
  return function retirer() {
    document.removeEventListener('keydown', gerer);
  };
}
