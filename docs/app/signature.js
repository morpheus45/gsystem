/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Pad de signature tactile. Les traces sont conserves en COORDONNEES, pas en
// image : le PDF les redessine en vectoriel, donc la signature reste nette a
// toute taille et pese quelques centaines d'octets au lieu de plusieurs Ko.

export function creerPad(canvas) {
  const ctx = canvas.getContext('2d');
  let traces = [];
  let encours = null;

  function dimensionner() {
    const r = canvas.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * d);
    canvas.height = Math.round(r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    redessiner();
  }

  function redessiner() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.strokeStyle = '#F7F7F2';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    traces.forEach((t) => {
      if (t.length < 2) return;
      ctx.beginPath();
      t.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    });
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  function debut(e) {
    e.preventDefault();          // sinon iOS fait defiler la page pendant qu'on signe
    encours = [point(e)];
    traces.push(encours);
  }
  function bouge(e) {
    if (!encours) return;
    e.preventDefault();
    encours.push(point(e));
    redessiner();
  }
  function fin() { encours = null; }

  canvas.addEventListener('pointerdown', debut);
  canvas.addEventListener('pointermove', bouge);
  window.addEventListener('pointerup', fin);
  canvas.addEventListener('touchstart', debut, { passive: false });
  canvas.addEventListener('touchmove', bouge, { passive: false });
  window.addEventListener('touchend', fin);
  window.addEventListener('resize', dimensionner);

  dimensionner();

  return {
    vide: () => traces.length === 0,
    effacer: () => { traces = []; redessiner(); },
    traces: () => traces.map((t) => t.map((p) => ({ x: p.x, y: p.y }))),
  };
}
