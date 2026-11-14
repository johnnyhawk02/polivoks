// Sweep the added PW pot in pw.cir: duty of A10's output, A10 (+) volts and
// the pitch (period of the saw), for a few expo currents.
const { execSync } = require('child_process'), fs = require('fs');
const base = fs.readFileSync(__dirname + '/pw.cir', 'utf8');
const Is = (process.env.I || '20e-6,160e-6,640e-6').split(',').map(Number);
const pws = (process.env.PW || '0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1').split(',').map(Number);
function run(I, pw, c8ic) {
  const P = 5.6e-9 * 8 / I, stop = 14 * P, step = P / 4000;
  const net = base.replace(/^\.param .*$/m, `.param iexp=${I} tstop=${stop} tstep=${step} pw=${pw} c8ic=${c8ic}`);
  fs.writeFileSync(__dirname + '/pw_run.cir', net);
  execSync('ngspice -b pw_run.cir > /dev/null 2>&1', { cwd: __dirname });
  const rows = fs.readFileSync(__dirname + '/out.txt', 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  // columns: t v(o) t v(s) t v(a10) t v(a10p)
  const t = rows.map((r) => r[0]), o = rows.map((r) => r[1]), a = rows.map((r) => r[5]), ap = rows.map((r) => r[7]);
  // saw resets: o jumps up through its mid level
  const mid = 4.6, ups = [];
  for (let i = 1; i < t.length; i++) if (o[i - 1] < mid && o[i] >= mid) ups.push(t[i - 1] + (mid - o[i - 1]) / (o[i] - o[i - 1]) * (t[i] - t[i - 1]));
  const t0 = ups[ups.length - 9], t1 = ups[ups.length - 1], per = (t1 - t0) / 8;
  let hi = 0, mo = 0, vp = 0, T = 0, amin = 1e9, amax = -1e9;
  for (let i = 1; i < t.length; i++) if (t[i] > t0 && t[i] <= t1) {
    const dt = t[i] - t[i - 1];
    hi += (a[i] > 0 ? 1 : 0) * dt; mo += o[i] * dt; vp += ap[i] * dt; T += dt;
    amin = Math.min(amin, a[i]); amax = Math.max(amax, a[i]);
  }
  return { f: 1 / per, duty: hi / T, mean: mo / T, vp: vp / T, amin, amax };
}
for (const I of Is) {
  let c8 = 4.6; const f0 = run(I, 0, c8); c8 = f0.mean;    // settle C8 at the saw's mean
  for (const pw of pws) {
    const r = run(I, pw, c8);
    console.log(`I ${(I * 1e6).toFixed(0).padStart(4)} uA  pw ${pw.toFixed(2)}  f ${r.f.toFixed(2).padStart(9)} Hz  A10+ ${r.vp.toFixed(3).padStart(7)} V  duty ${(r.duty * 100).toFixed(1).padStart(5)} %  A10 out ${r.amin.toFixed(1)}..${r.amax.toFixed(1)} V`);
  }
}
