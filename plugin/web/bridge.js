// FILTH plugin bridge: runs first in the plugin's copy of index.html (see
// build.js).  It gives the page what the browser gave it, from the plugin:
//   window.filthPlugin.store    in place of localStorage: this instance's
//                               settings (saved with the DAW project) and the
//                               shared preset library, both kept by the plugin
//   window.filthPlugin.connect  in place of the AudioWorklet: the page's
//                               messages go to the C++ engine, and the
//                               engine's reports come back
// and moves a knob when the DAW automates it.  Numbers cross as JSON text
// (JSON.stringify / JSON.parse on this side, correctly rounded on the C++
// side), so every value arrives as exactly the same double.
(() => {
  'use strict';
  window.__errs = []; addEventListener('error', (e) => { if (window.__errs.length < 20) window.__errs.push(String(e.message || e) + ' @' + (e.filename || '') + ':' + (e.lineno || '')); });
  const init = /*FILTH_INIT*/null;   // the plugin replaces this with { store: { key: text } }
  const data = new Map(Object.entries((init && init.store) || {}));
  const backend = () => (window.__JUCE__ && window.__JUCE__.backend) || null;
  const tell = (id, text) => { const b = backend(); if (b) b.emitEvent(id, text); };
  const store = {
    getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
    setItem: (k, v) => { k = String(k); v = String(v); if (data.get(k) === v) return; data.set(k, v); tell('filthStore', JSON.stringify({ k, v })); },
    removeItem: (k) => { k = String(k); if (!data.has(k)) return; data.delete(k); tell('filthStore', JSON.stringify({ k, v: null })); },
    key: (i) => { const ks = [...data.keys()]; return i >= 0 && i < ks.length ? ks[i] : null; },
    get length() { return data.size; },
    clear: () => { for (const k of [...data.keys()]) store.removeItem(k); },
  };
  let onEngine = null, hooked = false;
  // the page's control for an id, moved as if turned (it sends the value back, which the plugin ignores when equal)
  const hostSet = (id, v) => {
    const app = window.filthApp; if (!app) return;
    const c = app.S.find((x) => x.id === id);
    if (c && c.v !== v) c.set(v);
  };
  const hook = () => {
    const b = backend(); if (!b || hooked) return; hooked = true;
    b.addEventListener('filthEngine', (t) => { if (onEngine) onEngine(typeof t === 'string' ? JSON.parse(t) : t); });
    b.addEventListener('filthHost', (t) => { const d = typeof t === 'string' ? JSON.parse(t) : t; for (const [id, v] of d) hostSet(id, v); });
  };
  hook(); if (!hooked) addEventListener('DOMContentLoaded', hook);
  // the window's only resize handle (Johnny, v2.18.0): a small grip in the bottom-right corner.  The
  // plugin keeps the window to the panel's proportions; the drag goes as a fraction of the starting
  // size, measured in screen coordinates (they hold still while the window grows under the pointer)
  const grip = () => {
    const g = document.createElement('div'); g.id = 'filth-grip';
    g.style.cssText = 'position:fixed;right:0;bottom:0;width:18px;height:18px;z-index:2147483647;cursor:nwse-resize;touch-action:none;opacity:.55';
    g.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" style="display:block">' +
      [[15, 3], [15, 8], [15, 13]].map(([a, b]) => `<line x1="${a}" y1="${b}" x2="${b}" y2="${a}" stroke="#000" stroke-width="1.2" stroke-linecap="round"/>` +
        `<line x1="${a + 1}" y1="${b + 1}" x2="${b + 1}" y2="${a + 1}" stroke="#fff" stroke-opacity=".5" stroke-width="1" stroke-linecap="round"/>`).join('') + '</svg>';
    let d = null, raf = 0, last = null;
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); g.setPointerCapture(e.pointerId);
      d = { x: e.screenX, y: e.screenY, w: innerWidth, h: innerHeight }; tell('filthResize', '{"start":1}');
    });
    g.addEventListener('pointermove', (e) => {
      if (!d) return; e.preventDefault();
      last = JSON.stringify({ x: (d.w + e.screenX - d.x) / d.w, y: (d.h + e.screenY - d.y) / d.h });
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; tell('filthResize', last); });
    });
    const end = () => { d = null; };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end); g.addEventListener('lostpointercapture', end);
    document.body.appendChild(g);
  };
  if (document.body) grip(); else addEventListener('DOMContentLoaded', grip);
  window.filthPlugin = {
    store,
    panel: (aspect) => tell('filthPanel', String(aspect)),   // the 3D panel's width / height (view3d.js)
    connect(fn) {
      onEngine = fn; hook();
      tell('filthReady', '1');   // the plugin answers with any knob the DAW moved while the window was shut
      return { port: { postMessage: (m) => tell('filthMsg', JSON.stringify(m)) } };
    },
  };
})();
