/* ==========================================================================
   Signature Pad — stylet, doigt, souris (Pointer Events)
   Sauvegarde locale en base64 (localStorage) par clé.
   Usage HTML :
     <div class="sig" data-sig="paraphe_tech" data-w="220" data-h="80"></div>
   ========================================================================== */
(function () {
  const STROKE_COLOR = '#0a2858';
  const STROKE_WIDTH = 1.8;
  const STORAGE_PREFIX = 'sig::';

  function init(host) {
    const key = host.dataset.sig;
    const w = parseInt(host.dataset.w || '220', 10);
    const h = parseInt(host.dataset.h || '70', 10);

    /* DPI scaling pour rendu net */
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'crosshair';
    canvas.style.background = '#fff';
    canvas.style.border = '1px dotted #888';
    canvas.style.display = 'block';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;

    /* boutons */
    const wrap = document.createElement('div');
    wrap.style.display = 'inline-block';
    wrap.appendChild(canvas);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;margin-top:2px;';
    btnRow.className = 'no-print';

    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.textContent = '🗑️ Effacer';
    btnClear.style.cssText = 'font-size:10px;padding:2px 6px;cursor:pointer;background:#fff;border:1px solid #888;border-radius:3px;';
    btnRow.appendChild(btnClear);

    wrap.appendChild(btnRow);
    host.appendChild(wrap);

    /* dessin */
    let drawing = false;
    let last = null;

    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      last = getPos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      /* point pour signature très courte */
      ctx.lineTo(last.x + 0.01, last.y + 0.01);
      ctx.stroke();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }
    function end(e) {
      if (!drawing) return;
      drawing = false;
      save();
    }

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', e => { if (drawing) end(e); });

    /* persistance */
    function save() {
      try {
        const data = canvas.toDataURL('image/png');
        localStorage.setItem(STORAGE_PREFIX + key, data);
      } catch (_) {}
    }
    function load() {
      const data = localStorage.getItem(STORAGE_PREFIX + key);
      if (!data) return;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = data;
    }
    function clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (_) {}
    }

    btnClear.addEventListener('click', clear);

    /* expose pour reset global */
    host._sigPad = { clear, save, load };

    load();
  }

  function initAll() {
    document.querySelectorAll('.sig[data-sig]').forEach(host => {
      if (!host._sigPad) init(host);
    });
  }

  /* clear global utilisé par resetForm */
  window.clearAllSignatures = function () {
    document.querySelectorAll('.sig[data-sig]').forEach(host => {
      if (host._sigPad) host._sigPad.clear();
    });
  };

  /* export/import : intègre les signatures dans le JSON existant */
  window.collectSignatures = function () {
    const out = {};
    document.querySelectorAll('.sig[data-sig]').forEach(host => {
      const k = host.dataset.sig;
      const v = localStorage.getItem(STORAGE_PREFIX + k);
      if (v) out[k] = v;
    });
    return out;
  };
  window.restoreSignatures = function (sigs) {
    if (!sigs) return;
    Object.entries(sigs).forEach(([k, v]) => {
      try { localStorage.setItem(STORAGE_PREFIX + k, v); } catch (_) {}
    });
    /* recharge visuellement */
    document.querySelectorAll('.sig[data-sig]').forEach(host => {
      if (host._sigPad) host._sigPad.load();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
