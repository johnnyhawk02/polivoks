// The engine's maths (engine/jsmath.cpp, through filth-render --math) against
// headless Chromium's Math on the same inputs, per function.
//   node plugin/test/mathcheck.js path/to/filth-render
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const FN = ['exp', 'log', 'log1p', 'log2', 'sin', 'cos', 'tan', 'tanh', 'pow'];
let s = 7; const r = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
const N = 300000, X = new Float64Array(N * 2);
for (let i = 0; i < N; i++) {   // the ranges the engine uses, and wider
  const k = i % 6, u = r(), v = r();
  X[2 * i] = k == 0 ? (u - 0.5) * 60 : k == 1 ? (u - 0.5) * 6 : k == 2 ? u * 2e4 : k == 3 ? (u - 0.5) * 1e-3 : k == 4 ? u * 3 : (u - 0.5) * 2e3;
  X[2 * i + 1] = k == 4 ? (v - 0.5) * 20 : (v - 0.5) * 6;
  if (k == 4 || k == 2) X[2 * i] = Math.abs(X[2 * i]);
}
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'filth-math-'));
  fs.writeFileSync(path.join(tmp, 'in.f64'), Buffer.from(X.buffer));
  execFileSync(process.argv[2], ['--math', path.join(tmp, 'in.f64'), path.join(tmp, 'out.f64')]);
  const c = new Float64Array(fs.readFileSync(path.join(tmp, 'out.f64')).buffer.slice(0));
  const { chromium } = require('playwright'); const b = await chromium.launch(), p = await b.newPage();
  const ver = await b.version();
  const js = await p.evaluate(([xs, FN]) => { const X = new Float64Array(xs), n = X.length / 2, o = [];
    for (const f of FN) for (let i = 0; i < n; i++) o.push(f == 'pow' ? Math.pow(X[2 * i], X[2 * i + 1]) : Math[f](X[2 * i]));
    return o; }, [Array.from(X), FN]);
  await b.close();
  let bad = 0; console.log('Chromium ' + ver);
  FN.forEach((f, j) => { let m = 0, ex = '';
    for (let i = 0; i < N; i++) { const a = c[j * N + i], z = js[j * N + i]; if (!Object.is(a, z) && !(a !== a && z !== z)) { if (!m) ex = `  e.g. x=${X[2 * i]}${f == 'pow' ? ' y=' + X[2 * i + 1] : ''}: plugin ${a}, Chrome ${z}`; m++; } }
    bad += m; console.log(`${f.padEnd(6)} ${m ? m + ' of ' + N + ' differ' + ex : 'identical'}`); });
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
