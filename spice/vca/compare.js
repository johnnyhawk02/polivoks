// Run the JS VCA on the same cases as tr.js (tr.json) and print both.
//   node spice/vca/compare.js
const { VCA } = require('../../dsp.js');
const cases = require('./tr.json');
const fs = 192000, h = 1 / fs;
console.log(' vin  venv  vmod | A2 p-p SPICE   JS  | A4 p-p SPICE   JS');
for (const c of cases) {
  const v = new VCA(h); v.control(c.vmod, 0, c.venv);
  let mn2 = 1e9, mx2 = -1e9, mn4 = 1e9, mx4 = -1e9;
  const n = Math.round(0.36 * fs);
  for (let i = 0; i < n; i++) {
    v.step(c.vin * Math.sin(2 * Math.PI * 1000 * i * h));
    if (i * h > 0.31) { mn2 = Math.min(mn2, v.v2); mx2 = Math.max(mx2, v.v2); mn4 = Math.min(mn4, v.v4); mx4 = Math.max(mx4, v.v4); }
  }
  console.log([c.vin, c.venv, c.vmod].map(x => String(x).padStart(5)).join(' '), '|',
    c.a2.toFixed(3).padStart(8), (mx2 - mn2).toFixed(3).padStart(7), '|', c.a4.toFixed(3).padStart(8), (mx4 - mn4).toFixed(3).padStart(7));
}
const { K118Tail } = require('../../dsp.js');
const s1 = new K118Tail(27e3), s2 = new K118Tail(0);
console.log('tail currents (µA), JS:  stage 1 at vmod -0.3/0/0.5/1.5:', [-0.3, 0, 0.5, 1.5].map(v => (s1.tail(v, 100e3) * 1e6).toFixed(1)).join(' '),
  ' stage 2 at venv 1/3/6:', [1, 3, 6].map(v => (s2.tail(v, 100e3) * 1e6).toFixed(1)).join(' '));
console.log('SPICE (dc.cir):          stage 1: 0.13 57.6 244.7 404.7   stage 2: 4.29 22.9 50.6');
