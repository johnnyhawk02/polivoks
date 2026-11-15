// Null test: the C++ engine (render.cpp) against the web app's JavaScript
// (render.js) on stress cases.  Prints the largest sample difference and
// the null depth for each case.
//   node plugin/test/null.js [path/to/render-binary]
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const bin = process.argv[2] || path.join(os.tmpdir(), 'filth-render');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'filth-null-'));

const P = (id, v) => ({ t: 'p', id, v });
const steps = (f) => Array.from({ length: 16 }, (_, i) => f(i));
const seq = (id, s, bip) => ({ t: 'seq', id, s: Object.assign({ on: false, len: 16, div: 1, depth: 0.5, slew: 0, drift: 0, rt: false, steps: steps(() => 0) }, s), range: bip ? [-1, 1] : [0, 1] });
const notes = (list) => { const ev = []; for (const [q, n, len, v] of list) { ev.push({ q, m: { t: 'on', n, v: v == null ? 1 : v } }); ev.push({ q: q + len, m: { t: 'off', n } }); } return ev; };
const riff = (q0, n0) => notes([[q0, n0, 60], [q0 + 80, n0 + 7, 40], [q0 + 140, n0 + 12, 90, 0.4], [q0 + 260, n0 - 12, 120, 0.8], [q0 + 400, n0 + 3, 30], [q0 + 440, n0 + 5, 200]]);
const init = (extra) => [{ q: 0, m: P('power', 1) }, { q: 0, m: { t: 'bpm', v: 120 } }, { q: 0, m: { t: 'prio', v: true } }, { q: 0, m: { t: 'fmmod', v: true } }, { q: 0, m: { t: 'bendst', v: 12 } }]
  .concat((extra || []).map((m) => (m.q != null ? m : { q: 0, m })));

const CASES = {
  'default patch, riff': { ev: init().concat(riff(10, 57)) },
  'drive + resonance near self-osc': { ev: init([P('drive', 1), P('res', 0.97), P('cutoff', 0.45), P('fEnv', 0.9), P('mix1', 1), P('mix2', 1)]).concat(riff(5, 45)) },
  'filter self-oscillating, no VCOs': { ev: init([P('res', 1), P('mix1', 0), P('mix2', 0), P('cutoff', 0.7), P('vcaHold', 1)]).concat(notes([[2, 60, 600]])) },
  'cross FM, both pots up (FM MOD)': { ev: init([P('o1fm', 1), P('o2fm', 0.8), P('o1wave', 0), P('o2wave', 1), P('o2pitch', 0.3), P('res', 0.6)]).concat(riff(3, 50)) },
  'FM as drawn, duo, glide, LOW priority': { ev: init([{ t: 'fmmod', v: false }, { t: 'prio', v: false }, P('o1fm', 0.7), P('voice', 1), P('glide', 0.6)])
      .concat(notes([[4, 48, 300], [40, 55, 200], [120, 60, 150], [400, 36, 200]])) },
  'pulse width, noise, LFO S&H to pitch and VCA': { ev: init([P('o1wave', 2), P('o1pw', 0.8), P('o2pw', 0.4), P('mixN', 0.7), P('lfoMode', 2), P('lfoRate', 0.8), P('o1mod', 0.6), P('aMod', 0.5), P('fMod', 0.4)]).concat(riff(6, 52)) },
  'slow LFO noise, loop envelopes, bend + wheel': { ev: init([P('lfoRange', 1), P('lfoMode', 3), P('lfoRate', 0.9), P('fEgMode', 1), P('aEgMode', 1), P('fA', 0.3), P('fD', 0.3), P('aD', 0.4)])
      .concat(notes([[2, 62, 650]])).concat([{ q: 100, m: { t: 'bend', v: 1 } }, { q: 200, m: { t: 'bend', v: -0.6 } }, { q: 250, m: { t: 'modw', v: 0.9 } }, { q: 400, m: { t: 'bend', v: 0 } }]) },
  'knob sequences: drift, slew, retrig, mod sources': { ev: init([
      seq('cutoff', { on: true, depth: 0.6, slew: 0.03, drift: 7, steps: steps((i) => Math.sin(i) * 0.9) }),
      seq('o1pitch', { on: true, div: 2, len: 7, depth: 0.25, rt: true, steps: steps((i) => (i % 3) / 3 - 0.5), lOn: true, lDepth: 0.1 }, true),
      seq('res', { eOn: true, eDepth: 0.3, vOn: true, vDepth: -0.2, kOn: true, kDepth: 0.2 }),
      seq('eMix', { e2On: true, e2Depth: 0.5 }), seq('drive', { on: true, len: 5, depth: 0.8, steps: steps((i) => (i & 1 ? 1 : -1)) }),
    ]).concat(riff(4, 55)).concat([{ q: 300, m: seq('cutoff', { on: false }) }, { q: 300, m: P('cutoff', 0.3) }]) },
  'MIDI clock drives the sequencer': { ev: init([seq('cutoff', { on: true, depth: 0.7, steps: steps((i) => (i % 4) / 2 - 0.75) })]).concat(riff(2, 60))
      .concat([{ q: 50, m: { t: 'cstart' } }].concat(Array.from({ length: 400 }, (_, i) => ({ q: 50 + Math.floor(i * 1.6), m: { t: 'clk' } })))).concat([{ q: 700, m: { t: 'cstop' } }]) },
  'chorus I, II, I+II into echo (free, high feedback)': { ev: init([P('chorus', 1), P('eSync', 0), P('eTime', 0.3), P('eFb', 1), P('eMix', 0.6), P('eTone', 0.9), P('eSpread', 1)])
      .concat(riff(2, 57)).concat([{ q: 250, m: P('chorus', 2) }, { q: 500, m: P('chorus', 3) }, { q: 650, m: P('chorus', 0) }, { q: 300, m: P('eTime', 0.7) }]) },
  'echo synced, tempo change, spread 0': { ev: init([P('eSync', 1), P('eTime', 0.6), P('eFb', 0.7), P('eSpread', 0), P('eMix', 0.4)]).concat(riff(2, 64)).concat([{ q: 200, m: { t: 'bpm', v: 93 } }]) },
  'reverb: long decay, gravity, freeze, dark': { ev: init([P('rMix', 0.7), P('rDecay', 0.9), P('rGrav', 0.8), P('rDark', 0.3), P('rSize', 1)]).concat(riff(2, 60))
      .concat([{ q: 300, m: P('rFreeze', 1) }, { q: 500, m: P('rFreeze', 0) }, { q: 550, m: P('rSize', 0.2) }, { q: 650, m: P('rMix', 0) }]) },
  'everything at once': { ev: init([P('drive', 0.7), P('res', 0.9), P('o1fm', 0.5), P('o2fm', 0.5), P('chorus', 3), P('eMix', 0.5), P('eFb', 0.8), P('rMix', 0.5), P('rDecay', 0.7), P('mixN', 0.3),
      seq('cutoff', { on: true, depth: 0.5, drift: -12, steps: steps((i) => ((i * 7) % 5) / 2.5 - 1) })]).concat(riff(2, 48)).concat(riff(380, 60)) },
};
const RATES = [48000, 44100, 96000];
let worst = 0, total = 0, rows = [];
for (const sr of RATES) for (const name in CASES) {
  if (sr !== 48000 && !/everything|default|self-osc/.test(name)) continue;
  const quanta = Math.ceil(sr * 2 / 128);   // 2 s
  const scale = sr / 48000, ev = CASES[name].ev.map((x) => ({ q: Math.round(x.q * scale * 0.75), m: x.m })).sort((a, b) => a.q - b.q);
  const f = path.join(tmp, 's.json'); fs.writeFileSync(f, JSON.stringify({ sr, quanta, events: ev }));
  execFileSync(bin, [f, path.join(tmp, 'c.f32')]); execFileSync('node', [path.join(__dirname, 'render.js'), f, path.join(tmp, 'j.f32')]);
  const a = new Float32Array(fs.readFileSync(path.join(tmp, 'c.f32')).buffer.slice(0)), b = new Float32Array(fs.readFileSync(path.join(tmp, 'j.f32')).buffer.slice(0));
  let d = 0, pk = 0, diff = 0;
  for (let i = 0; i < b.length; i++) { const x = Math.abs(a[i] - b[i]); if (x > d) d = x; if (Math.abs(b[i]) > pk) pk = Math.abs(b[i]); if (a[i] !== b[i]) diff++; }
  worst = Math.max(worst, d); total++;
  rows.push(`${String(sr).padEnd(6)} ${name.padEnd(52)} peak ${pk.toFixed(3)}  max diff ${d === 0 ? '0 (bit-identical)' : d.toExponential(2) + ' (' + (20 * Math.log10(d / pk)).toFixed(1) + ' dB, ' + diff + ' samples)'}`);
  console.log(rows[rows.length - 1]);
}
console.log(`\n${total} cases, worst difference: ${worst === 0 ? '0, every sample bit-identical' : worst}`);
process.exit(worst === 0 ? 0 : 1);
