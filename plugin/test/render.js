// The same render with the web app's own JavaScript (dsp.js, seq.js, fx.js),
// wired exactly as index.html's AudioWorklet (PolivoksProc).
//   node render.js script.json out.f32
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '../..');
const { PolivoksEngine } = require(root + '/dsp.js'), { KnobSeq } = require(root + '/seq.js');
const { TapeEcho, JunoChorus, BlackHole, FxRack, SoftClip, Level } = require(root + '/fx.js');
const sc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), sr = sc.sr || 48000, Q = sc.quanta || 1000, B = sc.block || 128;
const e = new PolivoksEngine(sr), fx = new TapeEcho(sr), ch = new JunoChorus(sr), rv = new BlackHole(sr);
const q = new KnobSeq(sr, new FxRack(e, fx, ch, rv), () => {}), lev = new Level(sr), clip = new SoftClip();
const L = new Float32Array(Q * B), R = new Float32Array(Q * B), ev = sc.events || []; let k = 0;
for (let i = 0; i < Q; i++) {
  while (k < ev.length && (ev[k].q || 0) <= i) q.msg(ev[k++].m);
  const l = L.subarray(i * B, (i + 1) * B), r = R.subarray(i * B, (i + 1) * B);
  q.render(l, B); ch.process(l, r, B); fx.bpm = q.tempo(); fx.process(l, r, B); rv.process(l, r, B); clip.process(l, r, B); lev.add(l, r, B);
}
fs.writeFileSync(process.argv[3], Buffer.concat([Buffer.from(L.buffer), Buffer.from(R.buffer)]));
