// The JS VCO's pulse duty for the PW knob, at the currents in pw.txt (SPICE).
const { VCO, vpwOf } = require('../../dsp.js');
const h = 1 / 192000;
const Is = (process.env.I || '20e-6,80e-6,160e-6,320e-6,640e-6').split(',').map(Number);
for (const I of Is) for (const a of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
  const v = new VCO(h, 77); v.vpw = vpwOf(a);
  for (let i = 0; i < 192000 * 1.5; i++) v.step(I);
  let hi = 0, n = 192000 * 0.5, mn = 1e9, mx = -1e9;
  for (let i = 0; i < n; i++) { v.step(I); hi += v.pulse > 0 ? 1 : 0; mn = Math.min(mn, v.pulse); mx = Math.max(mx, v.pulse); }
  console.log(`I ${(I * 1e6).toFixed(0).padStart(4)} uA  pw ${a.toFixed(2)}  A10+ ${vpwOf(a).toFixed(3).padStart(7)} V  duty ${(hi / n * 100).toFixed(1).padStart(5)} %  A10 out ${mn.toFixed(1)}..${mx.toFixed(1)} V`);
}
