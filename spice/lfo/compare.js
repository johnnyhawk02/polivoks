// JS Modulator against the ngspice results of lfo.cir (same R107 settings).
//   node spice/lfo/compare.js
const { Modulator } = require('../../dsp.js');
const spice = { 0: 43.98, 1e3: 35.70, 3e3: 25.95, 10e3: 13.27, 30e3: 5.543, 100e3: 1.825 };
const sr = 48000;
console.log('R107      SPICE Hz   JS Hz    tri min..max      square');
for (const rp of Object.keys(spice).map(Number)) {
  const m = new Modulator(1 / sr, null);
  let last = 0, edges = [], tmin = 9, tmax = -9, smin = 9, smax = -9;
  for (let i = 0; i < sr * 8; i++) {
    const t = m.step(4.3e3 + rp, 0, 0); const q = m.vo > 0 ? (m.vo - 0.53) * 15 / 115 : 0;
    if (i > sr * 2) { tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); smin = Math.min(smin, q); smax = Math.max(smax, q); }
    if (last < 0 && m.vo > 0) edges.push(i); last = m.vo;
  }
  const f = (edges.length - 1) / ((edges[edges.length - 1] - edges[0]) / sr);
  console.log(String(rp).padEnd(8), spice[rp].toFixed(2).padStart(9), f.toFixed(2).padStart(8), `${tmin.toFixed(2)}..${tmax.toFixed(2)}`.padStart(15), `${smin.toFixed(2)}..${smax.toFixed(2)}`.padStart(12));
}
console.log('SPICE: triangle ±1.43, square -0.06 .. 1.38-1.40');
// noise chain: response of the C4/R7/C5/R8 ladder + A3 at a few frequencies
console.log('control-noise gain (A3 out / A2 out): SPICE 25 Hz 8.3, 158 Hz 20.2, 794 Hz 11.8, 2.5 kHz 4.3');
for (const f of [25, 158, 794, 2512]) {
  const m = new Modulator(1 / sr, null); let mx = 0;
  for (let i = 0; i < sr; i++) { m.step(1e6, 3, Math.sin(2 * Math.PI * f * i / sr) * 0.01); if (i > sr / 2) mx = Math.max(mx, Math.abs(m.ctl)); }
  console.log('  JS', f, 'Hz', (mx / 0.01).toFixed(1));
}
