// Null test of the BUILT plugin: filth-host (test/host.cpp) loads FILTH.vst3
// (or FILTH.component) and plays MIDI notes and parameter moves; render.js
// plays the same through the web app's JavaScript, starting from what the
// page tells a new engine (src/DefaultState.json).  The plugin runs one
// 128-sample quantum behind (its reported latency), so its output is
// compared one quantum later.
//   node plugin/test/null-plugin.js path/to/filth-host path/to/FILTH.vst3
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const [host, plug] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'filth-pnull-'));
const init = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/DefaultState.json'), 'utf8')).map((m) => ({ q: 0, m }));
const P = (q, id, v) => ({ q, m: { t: 'p', id, v } });
const note = (q, n, len, v = 127) => [{ q, m: { t: 'on', n, v: v / 127 } }, { q: q + len, m: { t: 'off', n } }];
const CASES = {
  'default panel, notes': [].concat(note(5, 57, 100), note(150, 64, 60, 90), note(260, 45, 200, 30)),
  'drive, resonance, cross FM, chorus, echo, reverb (automated)': [P(0, 'drive', 0.75), P(0, 'res', 0.9375), P(0, 'o1fm', 0.5), P(0, 'o2fm', 0.25), P(0, 'chorus', 3), P(0, 'eMix', 0.5), P(0, 'rMix', 0.5), P(0, 'rDecay', 0.75)]
    .concat(note(3, 50, 200), note(120, 62, 150, 64), [P(80, 'cutoff', 0.25), P(160, 'cutoff', 0.875), P(200, 'o1range', 4), P(220, 'fMode', 1), P(300, 'rFreeze', 1)]),
  'bend and mod wheel': [P(0, 'o1mod', 0.5)].concat(note(2, 60, 400), [{ q: 50, m: { t: 'bend', v: 1 } }, { q: 120, m: { t: 'bend', v: -0.5 } }, { q: 200, m: { t: 'modw', v: 100 / 127 } }]),
};
let worst = 0;
for (const sr of [48000, 44100]) for (const name in CASES) {
  const quanta = Math.ceil(sr * 1.5 / 128);
  const ev = CASES[name].slice().sort((a, b) => a.q - b.q);
  const fp = path.join(tmp, 'p.json'), fj = path.join(tmp, 'j.json');
  fs.writeFileSync(fp, JSON.stringify({ sr, quanta: quanta + 1, events: ev }));
  fs.writeFileSync(fj, JSON.stringify({ sr, quanta, events: init.concat(ev) }));
  execFileSync(host, [plug, fp, path.join(tmp, 'p.f32')], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('node', [path.join(__dirname, 'render.js'), fj, path.join(tmp, 'j.f32')]);
  const a = new Float32Array(fs.readFileSync(path.join(tmp, 'p.f32')).buffer.slice(0)), b = new Float32Array(fs.readFileSync(path.join(tmp, 'j.f32')).buffer.slice(0));
  const N = quanta * 128, NA = (quanta + 1) * 128;
  let d = 0, pk = 0;
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < N; i++) { const x = a[ch * NA + i + 128], y = b[ch * N + i]; d = Math.max(d, Math.abs(x - y)); pk = Math.max(pk, Math.abs(y)); }
  worst = Math.max(worst, d);
  console.log(`${sr} ${name.padEnd(64)} peak ${pk.toFixed(3)}  max diff ${d === 0 ? '0 (bit-identical)' : d.toExponential(2)}`);
}
console.log(worst === 0 ? '\nthe plugin binary is bit-identical to the web app' : '\nDIFFERENT: worst ' + worst);
process.exit(worst === 0 ? 0 : 1);
