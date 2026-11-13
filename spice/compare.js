// Compare the JS filter (dsp.js K140VCF / FilterCV) with the ngspice results.
// node spice/compare.js
const { K140VCF, FilterCV, VT_OF } = require('../dsp.js');
const FS = 192000, VT = VT_OF(300.15);
function resp(Iset, res, f, amp, secs) {
  const v = new K140VCF(1 / FS); v.vos1 = v.vos2 = 0; v.setRes(res);
  const N = Math.round(FS * secs), st = Math.floor(N / 2);
  let sb = 0, cb = 0, sl = 0, cl = 0;
  for (let i = 0; i < N; i++) {
    const t = i / FS, x = amp * Math.sin(2 * Math.PI * f * t);
    v.step(x, Iset, VT);
    if (i >= st) { const s = Math.sin(2 * Math.PI * f * t), c = Math.cos(2 * Math.PI * f * t);
      sb += v.y1 * s; cb += v.y1 * c; sl += v.y2 * s; cl += v.y2 * c; }
  }
  const n = N - st; return { bp: 2 * Math.hypot(sb, cb) / n / amp, lp: 2 * Math.hypot(sl, cl) / n / amp };
}
function peak(Iset, res) {
  let best = 0, fb = 0, g = [];
  for (let e = 1; e < 5.2; e += 0.01) { const f = Math.pow(10, e), r = resp(Iset, res, f, 0.001, Math.max(0.05, 40 / f)).bp; g.push([f, r]); if (r > best) { best = r; fb = f; } }
  const h = best / Math.SQRT2; let lo = 0, hi = 0;
  for (let i = 1; i < g.length; i++) { if (g[i - 1][1] < h && g[i][1] >= h && !lo) lo = g[i][0]; if (g[i - 1][1] >= h && g[i][1] < h) hi = g[i][0]; }
  return { f0: fb, bpk: best, q: fb / (hi - lo) };
}
// ngspice t_ac.cir results: [Icol, res, f0, BP peak, Q]
const sp = [[1e-6,0,575,1.209,1.077],[1e-6,0.5,582,3.716,3.217],[1e-6,0.8,582,8.176,7.04],[1e-6,0.95,582,27.03,22.49],
            [10e-6,0,6310,1.207,1.050],[10e-6,0.5,6383,3.709,3.168],[10e-6,0.95,6383,27.09,22.71]];
console.log('Icol    res   f0 spice / js     BPpk spice / js    Q spice / js');
for (const [ic, r, f0, bpk, q] of sp) {
  const j = peak(ic / 2, r);
  console.log(`${(ic*1e6).toFixed(0).padStart(3)}uA  ${r.toFixed(2)}  ${f0.toFixed(0).padStart(5)} / ${j.f0.toFixed(0).padStart(5)}   ${bpk.toFixed(2).padStart(6)} / ${j.bpk.toFixed(2).padStart(6)}   ${q.toFixed(2).padStart(6)} / ${j.q.toFixed(2)}`);
}
console.log('LP passband gain (JS):', resp(1e-6, 0, 20, 0.001, 0.5).lp.toFixed(3), ' spice 1.205');
// cutoff control law
const cv = new FilterCV(), sc = [[0,4.44e-8],[0.1,5.90e-7],[0.2,4.40e-6],[0.3,2.57e-5],[0.4,1.32e-4],[0.5,2.24e-4]];
console.log('linear knob  Icol spice / js');
for (const [pc, ic] of sc) { const I = 12.5 / 100e3 + FilterCV.wiper(pc, 12.5, 47e3);
  console.log(pc.toFixed(1), ic.toExponential(2), (2 * cv.iset(I, 300.15)).toExponential(2)); }
module.exports = { resp };
