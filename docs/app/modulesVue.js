// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Ecrans des modules du bureau (HTML seulement). Tout texte venu du bureau ou du
// technicien passe par ech ; la couleur n'est acceptee que sous la forme #rrggbb.

import { etatSaisie } from './modules.js';
import { texteValeur } from './modulesRegles.js';

const ICONES = { outil: '\u{1F6E0}️', liste: '\u{1F4CB}', photo: '\u{1F4F7}', vehicule: '\u{1F69A}', alerte: '⚠️', document: '\u{1F4C4}' };
export const couleur = (m) => (/^#[0-9a-f]{6}$/i.test(m.couleur) ? m.couleur : '#5b6472');
const sombre = (c) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.55).toString(16).padStart(2, '0')).join('');
const degrade = (m) => `linear-gradient(135deg,${couleur(m)},${sombre(couleur(m))})`;

export function tuilesModules(modules, saisies, ech) {
  const attente = saisies.filter((s) => !s.envoyee).length;
  return modules.map((m, i) => `
      <button class="tuile" data-module="${ech(m.id)}" style="background:${degrade(m)}">
        <span class="num">${16 + i}</span>
        <span class="rond">${ICONES[m.icone] || ICONES.liste}</span>
        <span class="txt"><div class="nom">${ech(m.nom.toUpperCase())}</div>
        <div class="sous">${ech(m.finalite || '')}</div></span>
      </button>`).join('') + (saisies.length ? `
      <button class="tuile" data-ecran="saisies" style="background:linear-gradient(135deg,#3B82F6,#06B6D4)">
        <span class="num">${16 + modules.length}</span>
        <span class="rond">\u{1F4CB}</span>
        <span class="txt"><div class="nom">MES SAISIES</div>
        <div class="sous">${attente ? attente + ' en attente d’envoi' : 'Formulaires remplis'}</div></span>
      </button>` : '');
}

const barre = (titre, fond, ech) => `
  <div class="barre-titre" style="background:${fond}">
    <button class="retour" data-va="accueil">←</button>
    <span class="t">${ech(titre)}</span>
  </div>`;

function champModule(c, b, photo, ech) {
  const id = 'm_' + ech(c.cle);
  const v = b.textes[c.cle] || '';
  const tete = `<div class="champ${c.obligatoire ? ' requis' : ''}"><label${['case', 'liste', 'photo', 'signature'].includes(c.type) ? '' : ` for="${id}"`}>${ech(c.libelle)}</label>`;
  if (c.type === 'nombre') return `${tete}<input id="${id}" data-mod="${ech(c.cle)}" inputmode="decimal" maxlength="20" value="${ech(v)}" /></div>`;
  if (c.type === 'date') return `${tete}<input id="${id}" data-mod="${ech(c.cle)}" type="date" value="${ech(v)}" /></div>`;
  if (c.type === 'case' || c.type === 'liste') {
    const choix = c.type === 'case' ? [['oui', 'Oui'], ['non', 'Non']] : (c.choix || []).map((x) => [x, x]);
    return `${tete}<div class="segment" role="group" aria-label="${ech(c.libelle)}">${choix.map(([val, texte]) =>
      `<button type="button" data-mod-choix="${ech(c.cle)}" data-valeur="${ech(val)}" aria-pressed="${v === val}">${ech(texte)}</button>`).join('')}</div></div>`;
  }
  if (c.type === 'photo') {
    const d = v && photo(v);
    return `${tete}${d ? `<img class="apercu-photo" src="${ech(d)}" alt="${ech(c.libelle)}" />` : ''}
      <label class="btn mod-photo">${v ? 'Reprendre' : 'Prendre la photo'}
        <input type="file" accept="image/*" capture="environment" data-mod-photo="${ech(c.cle)}" /></label></div>`;
  }
  if (c.type === 'signature') {
    const d = v && photo(v);
    return `${tete}${d ? `<img class="apercu-photo mod-signature" src="${ech(d)}" alt="Signature" />`
      : `<canvas class="pad" data-mod-pad="${ech(c.cle)}"></canvas>`}
      <div class="pad-actions"><span class="aide">${d ? 'Signature gardée.' : 'Signe avec le doigt.'}</span>
        <button type="button" data-mod-effacer="${ech(c.cle)}">${d ? 'Refaire' : 'Effacer'}</button></div></div>`;
  }
  return `${tete}<textarea id="${id}" data-mod="${ech(c.cle)}" rows="2" maxlength="2000">${ech(v)}</textarea></div>`;
}

/** [b] : brouillon ouvert. */
export function vueModule(b, erreur, photo, ech) {
  const m = b.module;
  return `${barre(m.nom, degrade(m), ech)}
  <div class="form">
    ${m.champs.map((c) => champModule(c, b, photo, ech)).join('')}
    <div class="note">Ces données servent à : ${ech(m.finalite || '')}. Conservées ${ech(m.conservation_mois)} mois.</div>
    <div class="mod-erreur" id="mod_erreur" role="alert">${ech(erreur)}</div>
    <button class="btn" id="mod_enregistrer" style="background:${degrade(m)}">Enregistrer</button>
    <button class="lien" id="mod_vider">Vider le formulaire</button>
  </div>`;
}

export function vueSaisies(saisies, dateFr, ech) {
  return `${barre('MES SAISIES', 'linear-gradient(135deg,#3B82F6,#06B6D4)', ech)}
  <div class="form">
    ${[...saisies].sort((a, b) => b.creeLe - a.creeLe).map((s) => `
      <details class="note mod-saisie"><summary>
        <b>${ech(s.nomModule)}</b> · ${ech(dateFr(s.date))}<br><span class="${s.refus && !s.envoyee ? 'mod-erreur' : ''}">${ech(etatSaisie(s))}</span></summary>
        ${s.champs.map((c) => `<div class="mod-reponse"><span>${ech(c.libelle)}</span><b>${ech(texteValeur(c, s.valeurs[c.cle]))}</b></div>`).join('')}
      </details>`).join('') || '<div class="vide">Aucune saisie pour l’instant.</div>'}
  </div>`;
}
