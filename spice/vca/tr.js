// VCA transient bench: 1 kHz sine into X5 pin 1 at several envelope and
// modulation voltages; prints A2 and A4 peak-to-peak and the A4 DC shift.
//   node spice/vca/tr.js  [JSON=tr.json]
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
function run(vin, venv, vmod) {
  const net = `* vca tran
.include ${path.join(__dirname, '..', 'models.lib')}
.include ${path.join(__dirname, 'k118.lib')}
.param vmod=${vmod} venv=${venv}
Vp vp 0 12.5
Vn vn 0 -12.5
Vin fin 0 sin(0 ${vin} 1k)
.include ${path.join(__dirname, 'board.inc')}
.ic v(c1)=5.536 v(out)=0
.tran 2u 0.36 0.3
.measure tran a2pp PP v(a2o) from=0.31 to=0.36
.measure tran a4pp PP v(a4o) from=0.31 to=0.36
.measure tran a4av AVG v(a4o) from=0.31 to=0.36
.end
`;
  const fn = path.join(os.tmpdir(), 'vca_tr.cir'); fs.writeFileSync(fn, net);
  const out = execFileSync('ngspice', ['-b', fn], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const g = (k) => parseFloat(out.match(new RegExp(k + '\\s*=\\s*([-0-9.e+]+)'))[1]);
  return { vin, venv, vmod, a2: g('a2pp'), a4: g('a4pp'), a4dc: g('a4av') };
}
const cases = [];
for (const vin of [0.5, 2, 5, 10]) for (const venv of [1, 3, 6]) cases.push([vin, venv, 0]);
for (const vmod of [-0.3, -0.1, 0.3, 0.75, 1.5]) cases.push([2, 6, vmod]);
const res = [];
console.log(' vin  venv  vmod   A2 p-p   A4 p-p   A4 dc');
for (const c of cases) {
  const r = run(...c); res.push(r);
  console.log([r.vin, r.venv, r.vmod].map(x => String(x).padStart(5)).join(' '), r.a2.toFixed(3).padStart(8), r.a4.toFixed(3).padStart(8), r.a4dc.toFixed(4).padStart(8));
}
if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(res, null, 1));
