// Renders many random patches offline (synth engine + echo) and reports how
// many are usable.  Compares TONE (tone.js) with the panel-wide PATCH dice.
//   node tonecheck.js [patches per mode, default 200] [seed] [tone|patch] [tone depth 0..1]
// Each patch plays the same phrase: four short notes (C3 G3 E4 C5), one held
// note (C4, 1.5 s), then 3 s of nothing.  A patch is usable when
//   - every note is heard (note RMS above -40 dBFS)
//   - it is not too loud (under 0.1 % of samples in the limiter knee, > 0.95)
//   - nothing drones: dry synth below -50 dBFS 2 s after the last key is up
//     and the echo tail below -45 dBFS 3 s after
//   - the filter does not scream: with all mixer inputs down and a key held
//     the output is under -25 dBFS or less than 10 dB above the same patch
//     with RESONANCE at 0 (no self-oscillation)
//   - it is not harsh: spectral centroid of the held note under 4.5 kHz
//   - the modulation is gentle: the held note's level wobbles less than 2 dB
//     (rms of 40 ms level around a 0.5 s moving average)
const { PolivoksEngine } = require('./dsp.js');
const { TapeEcho, FxRack } = require('./fx.js');
const { KnobSeq } = require('./seq.js');
const { makeTone } = require('./tone.js');
const SR = 48000;

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// the panel: knob ids, selector sizes and switches (level knobs left at default)
const KNOBS = ['lfoRate', 'tune', 'glide', 'o1mod', 'o1fm', 'o1pitch', 'o2mod', 'o2detune', 'o2pitch', 'mix1', 'mix2', 'mixN',
  'fA', 'fD', 'fS', 'fR', 'cutoff', 'res', 'fMod', 'fEnv', 'aA', 'aD', 'aS', 'aR', 'aMod', 'eTime', 'eFb', 'eTone', 'eSpread', 'eMix'];
const BIP = { tune: 1, o1pitch: 1, o2pitch: 1, o2detune: 1 };
const SELS = { lfoMode: 4, o1range: 5, o1wave: 3, o2range: 5, o2wave: 3 };
const SWS = ['voice', 'fEgMode', 'fMode', 'aEgMode', 'vcaHold', 'eSync'];
// PATCH as in index.html (dice.patch)
function patchDice(R) {
  const rnd = (a, b) => a + R() * (b - a), pick = (a) => a[Math.floor(R() * a.length)];
  const ECHO_RANGE = { eFb: [.1, .55], eMix: [0, .4], eTone: [.2, .85] }, k = {};
  for (const id of KNOBS) {
    if (ECHO_RANGE[id]) k[id] = rnd(...ECHO_RANGE[id]);
    else k[id] = BIP[id] ? (id === 'tune' ? rnd(-.15, .15) : id.endsWith('pitch') ? pick([0, 0, 0, 7 / 12, -5 / 12, 1, -1]) : rnd(-.3, .3)) : R() ** (id.startsWith('mix') || id === 'cutoff' ? .6 : 1);
  }
  for (const id in SELS) k[id] = Math.floor(rnd(0, SELS[id]));
  for (const id of SWS) k[id] = R() < .5 ? 0 : 1;
  if (k.mix1 < .3 && k.mix2 < .3) k.mix1 = .6;
  return { kind: 'patch', k };
}

function engineFor(k, seqs) {
  const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
  const fx = new TapeEcho(SR);
  for (const id in k) { if (id in fx.p) { fx.set(id, k[id]); fx.ps[id] = k[id]; } else { e.setParam(id, k[id]); e.ps[id] = k[id]; } }
  const q = new KnobSeq(SR, new FxRack(e, fx));
  for (const id in k) q.base[id] = k[id];
  const rg = (id) => (id === 'o2detune' || /pitch|tune/.test(id) ? [-1, 1] : [0, 1]);
  for (const id in seqs || {}) { q.setSeq(id, seqs[id], rg(id)); }
  return { e, fx, q };
}
// events: [time s, 'on'|'off', note]
const PHRASE = [[0.3, 'on', 48], [0.75, 'off', 48], [0.8, 'on', 55], [1.25, 'off', 55], [1.3, 'on', 64], [1.75, 'off', 64], [1.8, 'on', 72], [2.25, 'off', 72], [2.3, 'on', 60], [3.8, 'off', 60]];
const END = 6.8;
function render(k, events, secs, seqs) {
  const { e, fx, q } = engineFor(k, seqs), n = Math.floor(secs * SR);
  const dry = new Float32Array(n), L = new Float32Array(n), R = new Float32Array(n);
  let ei = 0; const blk = 128;
  for (let i = 0; i < n; i += blk) {
    while (ei < events.length && events[ei][0] * SR <= i) { const [, t, note] = events[ei++]; if (t === 'on') e.noteOn(note); else e.noteOff(note); }
    const m = Math.min(blk, n - i);
    q.render(dry.subarray(i, i + m), m); L.set(dry.subarray(i, i + m), i);
    fx.process(L.subarray(i, i + m), R.subarray(i, i + m), m);
  }
  return { dry, L, R };
}
const rms = (x, a, b) => { let s = 0; a = Math.floor(a * SR); b = Math.floor(b * SR); for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const dB = (v) => 20 * Math.log10(v + 1e-12);
function centroid(x, a) {
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N), s0 = Math.floor(a * SR);
  for (let i = 0; i < N; i++) re[i] = x[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) {
    const w = -2 * Math.PI / len;
    for (let i = 0; i < N; i += len) for (let j = 0; j < len / 2; j++) {
      const c = Math.cos(w * j), s = Math.sin(w * j), a1 = i + j, b1 = a1 + len / 2;
      const tr = re[b1] * c - im[b1] * s, ti = re[b1] * s + im[b1] * c;
      re[b1] = re[a1] - tr; im[b1] = im[a1] - ti; re[a1] += tr; im[a1] += ti;
    }
  }
  let num = 0, den = 0; for (let i = 1; i < N / 2; i++) { const p = re[i] * re[i] + im[i] * im[i]; num += p * i * SR / N; den += p; }
  return den > 0 ? num / den : 0;
}
function wobble(x, a, b) {
  const w = Math.floor(0.04 * SR), lv = [];
  for (let i = Math.floor(a * SR); i + w < b * SR; i += w) { let s = 0; for (let j = 0; j < w; j++) s += x[i + j] * x[i + j]; lv.push(dB(Math.sqrt(s / w))); }
  let acc = 0, n = 0;
  for (let i = 6; i < lv.length - 6; i++) { let m = 0; for (let j = -6; j <= 6; j++) m += lv[i + j]; m /= 13; if (m > -60) { acc += (lv[i] - m) ** 2; n++; } }
  return n ? Math.sqrt(acc / n) : 0;
}
function check(k, seqs) {
  const { dry, L, R } = render(k, PHRASE, END, seqs);
  const notes = [[0.3, 0.75], [0.8, 1.25], [1.3, 1.75], [1.8, 2.25], [2.3, 3.8]].map(([a, b]) => dB(rms(dry, a, b + 0.05)));
  let hot = 0, peak = 0; for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > 0.95) hot++; if (a > peak) peak = a; }
  const drone = dB(rms(dry, 5.8, 6.3)), tail = dB(Math.max(rms(L, 6.3, 6.8), rms(R, 6.3, 6.8)));
  const held = Math.max(...notes.slice(4)) > -40 ? centroid(dry, 2.6) : 0;
  const wob = wobble(dry, 2.55, 3.8);
  // self-oscillation: same patch, every input down, a key held
  const sk = Object.assign({}, k, { mix1: 0, mix2: 0, mixN: 0, eMix: 0 }), sk0 = Object.assign({}, sk, { res: 0 });
  const so = (q) => dB(rms(render(q, [[0, 'on', 60]], 1.2).dry, 0.6, 1.2)), sl = so(sk), scream = Math.min(sl - so(sk0), sl + 35);
  const level = dB(rms(L, 0.3, 3.8));
  const why = [];
  if (Math.min(...notes) < -40) why.push('silent');
  if (hot / L.length > 0.001) why.push('too loud');
  if (drone > -50 || tail > -45) why.push('drone');
  if (scream > 10) why.push('screams');
  if (held > 4500) why.push('harsh');
  if (wob > 2) why.push('wobbly');
  return { notes, level, peak, drone, tail, held, wob, scream, why };
}

const N = +process.argv[2] || 200, seed = +process.argv[3] || 1;
const pct = (v) => (100 * v).toFixed(0) + '%';
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const AMT = process.argv[5] === undefined ? undefined : +process.argv[5];
const only = (process.argv[4] || '').toUpperCase();
for (const [name, gen] of [['TONE', makeTone], ['PATCH', patchDice]].filter(([n]) => !only || n === only)) {
  const R = mulberry(seed * 7919 + (name === 'TONE' ? 1 : 2)), res = [], kinds = {}, t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const { kind, k, seqs } = gen(R, AMT), r = check(k, seqs); r.kind = kind; r.k = k; res.push(r);
    const s = kinds[kind] || (kinds[kind] = { n: 0, ok: 0 }); s.n++; if (!r.why.length) s.ok++;
  }
  const count = (w) => res.filter((r) => r.why.includes(w)).length / N;
  const ok = res.filter((r) => !r.why.length).length / N;
  console.log(`--- ${name}: ${N} patches, ${((Date.now() - t0) / 1000).toFixed(0)} s ---`);
  console.log(`usable ${pct(ok)}  | silent note ${pct(count('silent'))}  too loud ${pct(count('too loud'))}  drone ${pct(count('drone'))}  screams ${pct(count('screams'))}  harsh ${pct(count('harsh'))}  wobbly ${pct(count('wobbly'))}`);
  const lv = res.map((r) => r.level).filter((v) => v > -100);
  console.log(`level (phrase rms, dBFS): median ${med(lv).toFixed(1)}, 10-90% ${lv.slice().sort((a, b) => a - b)[Math.floor(N * .1)].toFixed(1)} … ${lv.slice().sort((a, b) => a - b)[Math.floor(N * .9)].toFixed(1)}   peak median ${med(res.map((r) => r.peak)).toFixed(2)}`);
  console.log(`held-note brightness (centroid): median ${med(res.map((r) => r.held)).toFixed(0)} Hz   wobble median ${med(res.map((r) => r.wob)).toFixed(2)} dB`);
  if (name === 'TONE') console.log('by kind: ' + Object.entries(kinds).map(([k, s]) => `${k} ${s.ok}/${s.n}`).join(', '));
  if (process.env.SHOW) for (const r of res.filter((r) => r.why.length).slice(0, +process.env.SHOW)) console.log(' ', r.kind, r.why.join(','), 'notes', r.notes.map((v) => v.toFixed(0)).join(' '), 'drone', r.drone.toFixed(0), 'tail', r.tail.toFixed(0), 'scream', r.scream.toFixed(0), 'cent', r.held.toFixed(0), 'wob', r.wob.toFixed(1), process.env.K ? JSON.stringify(r.k) : '');
}
