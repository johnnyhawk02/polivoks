// Mixer bench (sheet 9, У6 A2 + panel pots R103-R106 on sheet 1).
// Builds one netlist per (wave, pot position), runs ngspice, prints the gain
// from the source's open-circuit voltage to A2's output and to the filter
// input, next to the closed-form gain the JS uses.
//   node spice/mixer/mix.js
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const lib = path.join(__dirname, '..', 'models.lib');
// source resistance seen by each pot (sheet 5 / sheet 10)
const SRC = { saw: 20e3, tri: 1, pulse: 30e3 * 20e3 / 50e3, noise: 1 };   // pulse: R35 30k / R36 20k EST
const { mixGain } = require('../../dsp.js');
function jsGain(t, Rs) { return mixGain(t, Rs); }
function unused(t, Rs) {
  const Ra = 100e3 * (1 - t) + 1, Rb = 100e3 * t + 1, G = 1 / Rb + 1 / 22e3;
  return 1 / (1 + (Ra + Rs) * G);
}
function run(Rs, t, f, amp) {
  const Ra = 100e3 * (1 - t) + 1, Rb = 100e3 * t + 1;
  const net = `* mixer
.include ${lib}
Vp vp 0 12.5
Vn vn 0 -12.5
Vs src 0 sin(0 ${amp} ${f})
Rs src top ${Rs}
Ra top wip ${Ra}
Rb wip 0 ${Rb}
R7 wip sum 22k
R11 pin3 0 10k
R10 sum a2o 22k
XA2 pin3 sum vp vn a2o K140UD8
C2 a2o c2o 0.22u
R85 c2o fin 39k
Rf fin 0 960
.tran ${1 / f / 200} ${10 / f + 0.05} 0.05
.measure tran a2pp PP v(a2o) from=${0.05 + 2 / f} to=${0.05 + 10 / f}
.measure tran inpp PP v(c2o) from=${0.05 + 2 / f} to=${0.05 + 10 / f}
.end
`;
  const fn = path.join(require('os').tmpdir(), 'mix_bench.cir');
  fs.writeFileSync(fn, net);
  const out = execFileSync('ngspice', ['-b', fn], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const g = (k) => parseFloat(out.match(new RegExp(k + '\\s*=\\s*([-0-9.e+]+)'))[1]);
  return { a2: g('a2pp') / (2 * amp), fin: g('inpp') / (2 * amp) };
}
console.log('wave   t     SPICE A2/src  JS     at filter in');
for (const w of ['saw', 'tri', 'pulse', 'noise']) for (const t of [0.1, 0.25, 0.5, 0.75, 1]) {
  const r = run(SRC[w], t, 1000, 1);
  console.log(w.padEnd(6), t.toFixed(2), r.a2.toFixed(4).padStart(10), jsGain(t, SRC[w]).toFixed(4).padStart(8), r.fin.toFixed(4).padStart(10));
}
console.log('--- C2 / R85 high-pass (saw, t=1): gain at filter input vs f ---');
for (const f of [5, 10, 18, 40, 100]) console.log(f + ' Hz', run(SRC.saw, 1, f, 1).fin.toFixed(3));
console.log('--- clipping: two full-level saws are 2 x 4 V; A2 swing check (t=1, 9 V source) ---');
console.log('A2 p-p / 2 =', (run(SRC.tri, 1, 1000, 13).a2 * 13).toFixed(2), 'V');
