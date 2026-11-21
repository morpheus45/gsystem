// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).

/**
 * Retourne la date du jour au format 'AAAA-MM-JJ' en heure de Paris.
 * @param {Date} date - Date à formater.
 * @returns {string} Date au format ISO 'AAAA-MM-JJ' selon le fuseau Europe/Paris.
 */
export function jourISO(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

/**
 * Vérifie si l'effet a déjà été joué aujourd'hui.
 * @param {string|null} valeurStockee - Valeur lue dans localStorage (format 'AAAA-MM-JJ').
 * @param {string} aujourdhui - Date du jour au format 'AAAA-MM-JJ'.
 * @returns {boolean} true si déjà joué aujourd'hui, false sinon.
 */
export function dejaJoueAujourdhui(valeurStockee, aujourdhui) {
  return valeurStockee === aujourdhui;
}

/**
 * Déclenche l'effet « la pièce s'allume » une seule fois par jour.
 * @param {HTMLElement|null} el - Élément à animer.
 * @param {Object} [options={}] - Options de configuration.
 * @param {string} [options.cle='gs-ouverture'] - Clé localStorage pour mémoriser la date.
 * @param {number} [options.duree=900] - Durée de l'animation en millisecondes.
 * @returns {boolean} true si l'animation a été jouée, false sinon.
 */
export function ouverture(el, { cle = 'gs-ouverture', duree = 900 } = {}) {
  if (!el) {
    return false;
  }

  // Respecter prefers-reduced-motion
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
  }

  const aujourdhui = jourISO(new Date());

  // Vérifier si déjà joué aujourd'hui (localStorage)
  let dejaJoue = false;
  try {
    const stocke = localStorage.getItem(cle);
    dejaJoue = dejaJoueAujourdhui(stocke, aujourdhui);
  } catch (_) {
    // Stockage indisponible : on joue sans mémoriser
    dejaJoue = false;
  }

  if (dejaJoue) {
    return false;
  }

  // Jouer l'animation
  el.animate(
    [
      { clipPath: 'circle(0% at 50% 40%)', filter: 'blur(22px)' },
      { clipPath: 'circle(80% at 50% 40%)', filter: 'blur(0px)' },
    ],
    {
      duration: duree,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    }
  );

  // Mémoriser la date du jour
  try {
    localStorage.setItem(cle, aujourdhui);
  } catch (_) {
    // Stockage indisponible : on ignore l'erreur
  }

  return true;
}