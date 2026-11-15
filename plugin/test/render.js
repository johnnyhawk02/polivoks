// The same render with the web app's own JavaScript (dsp.js, seq.js, fx.js),
// wired exactly as index.html's AudioWorklet (PolivoksProc), run in headless
// Chromium (Playwright): the browser's own V8 and its Math, which is what the
// web app plays with.  FILTH_REF=node runs it in Node instead (Node 22's V8
// has an older Math, so cross-FM patches drift apart from Chrome's).
//   node render.js script.json out.f32
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '../..');
const sc = fs.readFileSync(process.argv[2], 'utf8'), out = process.argv[3];

function render(scs) {
  const sc = JSON.parse(scs), sr = sc.sr || 48000, Q = sc.quanta || 1000, B = sc.block || 128;
  const e = new PolivoksEngine(sr), fx = new TapeEcho(sr), ch = new JunoChorus(sr), rv = new BlackHole(sr);
  const q = new KnobSeq(sr, new FxRack(e, fx, ch, rv), () => {}), lev = new Level(sr), clip = new SoftClip();
  const L = new Float32Array(Q * B), R = new Float32Array(Q * B), ev = sc.events || []; let k = 0;
  for (let i = 0; i < Q; i++) {
    while (k < ev.length && (ev[k].q || 0) <= i) q.msg(ev[k++].m);
    const l = L.subarray(i * B, (i + 1) * B), r = R.subarray(i * B, (i + 1) * B);
    q.render(l, B); ch.process(l, r, B); fx.bpm = q.tempo(); fx.process(l, r, B); rv.process(l, r, B); clip.process(l, r, B); lev.add(l, r, B);
  }
  const u = new Uint8Array(Q * B * 8); u.set(new Uint8Array(L.buffer), 0); u.set(new Uint8Array(R.buffer), Q * B * 4);
  return u;
}

if (process.env.FILTH_REF === 'node') {
  const { PolivoksEngine } = require(root + '/dsp.js'), { KnobSeq } = require(root + '/seq.js');
  const { TapeEcho, JunoChorus, BlackHole, FxRack, SoftClip, Level } = require(root + '/fx.js');
  Object.assign(global, { PolivoksEngine, KnobSeq, TapeEcho, JunoChorus, BlackHole, FxRack, SoftClip, Level });
  fs.writeFileSync(out, render(sc));
} else {
  (async () => {
    const { chromium } = require('playwright');
    const b = await chromium.launch(), p = await b.newPage();
    await p.setContent('<html></html>');
    for (const f of ['dsp.js', 'seq.js', 'fx.js']) await p.addScriptTag({ content: fs.readFileSync(path.join(root, f), 'utf8') });
    const b64 = await p.evaluate(`(() => { const u = (${render.toString()})(${JSON.stringify(sc)}); let s = '';
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); })()`);
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    await b.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
