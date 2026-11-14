// Aliasing of the pulse output through the whole engine (filter open, VCA
// held): energy away from the harmonics of the played note, in dB below the
// harmonics, for the PW knob at a few settings.  Usage: node pw_alias.js [dsp.js path]
const { PolivoksEngine } = require(process.argv[2] || '../../dsp.js');
const SR = 48000, N = 1 << 16;
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
    const wr = Math.cos(a * k), wi = Math.sin(a * k), ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
    re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; } }
}
function measure(note, pw, wave) {
  const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
  const set = { cutoff: 1, res: 0, fEnv: 0, mix1: 0.6, mix2: 0, vcaHold: 1, o1wave: wave, o1pw: pw, volume: 0.5 };
  for (const k in set) { e.setParam(k, set[k]); e.ps[k] = set[k]; }
  e.noteOn(note);
  const warm = new Float32Array(SR); for (let i = 0; i < SR; i += 128) e.render(warm.subarray(i, i + 128), 128);
  const x = new Float32Array(N); for (let i = 0; i < N; i += 128) e.render(x.subarray(i, i + 128), 128);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  fft(re, im);
  const P = (k) => re[k] * re[k] + im[k] * im[k];
  let pk = 0, kp = 0; for (let k = 20; k < N / 2; k++) if (P(k) > pk) { pk = P(k); kp = k; }
  // fundamental: lowest strong peak
  let f0 = 0; for (let k = 20; k < N / 2; k++) if (P(k) > pk * 1e-3 && P(k) >= P(k - 1) && P(k) >= P(k + 1)) { f0 = k; break; }
  let fr = f0; { const a = P(f0 - 1), b = P(f0), c = P(f0 + 1); fr = f0 + 0.5 * (a - c) / (a - 2 * b + c); }
  let harm = 0, alias = 0;
  for (let k = Math.round(30 * N / SR); k < N / 2; k++) {
    const h = k / fr, d = Math.abs(h - Math.round(h)) * fr;
    if (d <= 3) harm += P(k); else alias += P(k);
  }
  return { f: fr * SR / N, db: 10 * Math.log10(alias / harm) };
}
for (const note of [69, 81, 93]) {
  const row = [];
  for (const pw of [0, 0.5, 0.8, 0.9, 1]) { const r = measure(note, pw, 2); row.push(`pw ${pw}: ${r.db.toFixed(1)} dB`); }
  console.log(`note ${note}:`, row.join('  '));
}
