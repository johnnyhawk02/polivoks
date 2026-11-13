// Overdrive comparison with ngspice t_od.cir (Iset 1 uA each, res 0.5)
const { K140VCF, VT_OF } = require('../dsp.js');
const FS = 768000, VT = VT_OF(300.15);
// [amp, LP AC rms, THD %, LP mean] from ngspice t_od.cir
const sp = { 300: [[0.5,0.452,0.55,-0.119],[2,1.801,0.72,-0.120],[5,4.497,0.75,-0.127],[10,9.314,14.6,-0.323]],
             2400: [[0.5,0.147,0.13,-0.126],[2,0.553,0.91,-0.218],[5,0.956,1.97,-0.619],[10,1.139,3.35,-1.553]] };
console.log('freq  amp   LP rms spice / js    THD% spice / js    LP mean spice / js');
for (const f of [300, 2400]) for (const [a, rs, ts, ms] of sp[f]) {
  const v = new K140VCF(1 / FS); v.setRes(0.5);
  const N = Math.round(FS * 0.06), st = Math.round(FS * 0.04);
  let ss = 0, n = 0, m = 0; const H = new Float64Array(22);
  for (let i = 0; i < N; i++) {
    const t = i / FS; v.step(a * Math.sin(2 * Math.PI * f * t), 1e-6, VT);
    if (i >= st) { const y = -v.y2; ss += y * y; m += y; n++;
      for (let k = 1; k <= 10; k++) { H[2*k] += y * Math.sin(2*Math.PI*k*f*t); H[2*k+1] += y * Math.cos(2*Math.PI*k*f*t); } }
  }
  m /= n; const rms = Math.sqrt(ss / n - m * m);
  const amp = k => Math.hypot(H[2*k], H[2*k+1]);
  let hs = 0; for (let k = 2; k <= 10; k++) hs += amp(k) ** 2;
  console.log(`${String(f).padStart(4)}  ${String(a).padStart(4)}   ${rs.toFixed(3)} / ${rms.toFixed(3)}      ${ts.toFixed(2).padStart(5)} / ${(100*Math.sqrt(hs)/amp(1)).toFixed(2).padStart(5)}     ${ms.toFixed(3)} / ${m.toFixed(3)}`);
}
