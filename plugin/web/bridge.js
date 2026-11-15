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
  window.filthPlugin = {
    store,
    connect(fn) {
      onEngine = fn; hook();
      tell('filthReady', '1');   // the plugin answers with any knob the DAW moved while the window was shut
      return { port: { postMessage: (m) => tell('filthMsg', JSON.stringify(m)) } };
    },
  };
})();
