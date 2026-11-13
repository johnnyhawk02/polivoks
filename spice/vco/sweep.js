// Run core.cir over expo currents; print frequency, A7 swing, and the pitch
// error against a fixed ramp (cents, relative to the lowest current run).
const { execSync } = require('child_process'), fs = require('fs');
const base = fs.readFileSync(__dirname + '/core.cir', 'utf8');
const args = process.argv.slice(2).map(Number);
const list = args.length ? args : [2e-6, 5e-6, 10e-6, 20e-6, 40e-6, 80e-6, 160e-6, 320e-6, 640e-6];
const extra = process.env.PARAMS || '';
let k0 = null; const rows = [];
for (const I of list) {
  const P = 5.6e-9 * 8 / I, stop = 11 * P, step = P / 4000;
  const net = base.replace(/\.param .*/, `.param ileak=${process.env.IL || '10n'} iexp=${I} tstop=${stop} tstep=${step} `).replace(/^\.param sr6.*$/m, '.param ' + (process.env.PARAMS || 'sr6=2 isc6=20m sr7=2'));
  fs.writeFileSync(__dirname + '/sw.cir', net);
  const out = execSync('ngspice -b sw.cir 2>&1', { cwd: __dirname }).toString();
  const g = (n) => { const m = out.match(new RegExp('^' + n + '\\s*=\\s*([-0-9.e+]+)', 'm')); return m ? +m[1] : NaN; };
  const f = 7 / (g('t10') - g('t3')), k = f * 5.6e-9 / I;
  if (k0 === null) k0 = k;
  const r = { I, f, k, omin: g('omin'), omax: g('omax'), cents: 1200 * Math.log2(k / k0) };
  rows.push(r);
  console.log((I * 1e6).toFixed(1).padStart(7), 'uA', f.toFixed(2).padStart(9), 'Hz  A7', r.omin.toFixed(3), '..', r.omax.toFixed(3), '  dV_eff', (1 / k).toFixed(3), '  ', r.cents.toFixed(1), 'cents');
}
if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(rows));
