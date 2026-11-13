// Run summer.cir and express each case in octaves of the keyboard scale.
const { execSync } = require('child_process');
const out = execSync('ngspice -b summer.cir 2>&1', { cwd: __dirname }).toString();
const v = [...out.matchAll(/^v\(a2o\) = ([-0-9.e+]+)/gm)].map(m => +m[1]);
const ref = v[0], oct = v[1] - ref, o = (x) => ((x - ref) / oct).toFixed(4);
// JS formulas (dsp.js) for the same cases
const I_OCT = 1.5 / 100e3;
const modJ = (a, vb) => -(a * vb) / (47e3 + 100e3 * a * (1 - a)) / I_OCT;
const fmJ = (a, vt) => { const vth = a * vt / 2, rth = a * 100e3 * (200e3 - a * 100e3) / 200e3; return -(vth / (100e3 + rth)) / I_OCT; };
const dtJ = (d) => { const vw = -12.5 + 25 * d, rth = 100e3 * d * (1 - d); return -(vw / (1e6 + rth)) / I_OCT; };
console.log(`A2 out per keyboard octave (1.5 V into 100k): ${oct.toFixed(4)} V; register step: ${o(v[2])} oct`);
let i = 3;
for (const a of [0.1, 0.25, 0.5, 0.75, 1]) console.log(`mod pot ${a}, bus +1.43 V: SPICE ${o(v[i++])} oct, JS ${modJ(a, 1.43).toFixed(4)}`);
for (const a of [0.25, 0.5, 1]) console.log(`FM pot ${a}, triangle +1 V: SPICE ${o(v[i++])} oct, JS ${fmJ(a, 1).toFixed(4)}`);
for (const d of [0, 0.25, 0.75, 1]) console.log(`detune ${d}: SPICE ${o(v[i++])} oct, JS ${dtJ(d).toFixed(4)}`);
