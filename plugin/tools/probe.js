// Loads the plugin's web bundle (web/dist) in headless Chromium with a stand-in
// for JUCE's backend, as the plugin's window would, and reports what the page
// sends.  Used to check the bridge and to write the first-run state
// (src/DefaultState.h) and the parameter list (src/Params.h).
//   node plugin/tools/probe.js [--write] [--shot file.png]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const dist = path.join(__dirname, '../web/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(dist, u === '/' ? 'index.html' : u);
  if (!f.startsWith(dist) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => {
    window.__sent = []; window.__ls = [];
    const L = {};
    window.__JUCE__ = { backend: { addEventListener: (id, fn) => { (L[id] = L[id] || []).push(fn); }, emitEvent: (id, t) => window.__sent.push([id, t]) } };
    window.__emit = (id, t) => (L[id] || []).forEach((f) => f(t));
    const AC = window.AudioContext; window.AudioContext = function () { window.__ac = true; return new AC(); };
  });
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForTimeout(4000);
  const r = await pg.evaluate(() => ({
    sent: window.__sent, ac: !!window.__ac, mode: window.filthTest && window.filthTest.mode(), canvas: !!document.querySelector('canvas'),
    S: window.filthApp.S.map((c) => ({ id: c.id, kind: c.kind, scale: c.scale, n: c.opts ? c.opts.length : 0, def: c.def, v: c.v, label: c.label })),
    store: Object.fromEntries([...Array(window.filthStore.length)].map((_, i) => [window.filthStore.key(i), window.filthStore.getItem(window.filthStore.key(i))])),
  }));
  // a DAW move while open: the knob follows and the page answers with the same value
  await pg.evaluate(() => window.__emit('filthHost', JSON.stringify([['cutoff', 0.123456789012345], ['o1range', 4]])));
  await pg.waitForTimeout(300);
  const after = await pg.evaluate(() => ({ c: window.filthApp.S.find((c) => c.id === 'cutoff').v, r: window.filthApp.S.find((c) => c.id === 'o1range').v, last: window.__sent.slice(-6) }));
  const shot = process.argv.indexOf('--shot'); if (shot > 0) await pg.screenshot({ path: process.argv[shot + 1] });
  await b.close(); srv.close();
  const msgs = r.sent.filter((s) => s[0] === 'filthMsg').map((s) => JSON.parse(s[1])), st = r.sent.filter((s) => s[0] === 'filthStore');
  console.log('errors:', errs.length ? errs : 'none');
  console.log('AudioContext made:', r.ac, '| engine mode:', r.mode, '| 3D canvas:', r.canvas);
  console.log('messages to the engine:', msgs.length, '| store writes:', st.length, '| ready:', r.sent.some((s) => s[0] === 'filthReady'));
  console.log('controls:', r.S.length, '| after host move: cutoff', after.c, 'o1range', after.r);
  console.log('page answered:', after.last.map((s) => s[1]).join(' '));
  if (process.argv.includes('--write')) {
    const out = path.join(__dirname, '../src');
    const init = msgs.filter((m) => m.t !== 'on' && m.t !== 'off');
    fs.writeFileSync(path.join(out, 'DefaultState.json'), JSON.stringify(init) + '\n');
    fs.writeFileSync(path.join(out, 'controls.json'), JSON.stringify(r.S, null, 1));
    console.log('wrote src/DefaultState.json and src/controls.json');
  }
})().catch((e) => { console.error(e); process.exit(1); });
