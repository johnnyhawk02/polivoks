const { PolivoksEngine } = require('./dsp.js');
const fs = require('fs');
const SR = 48000;

function freqOf(x, sr) { // zero-crossing with interpolation, skip first half
  let last = -1, first = -1, count = 0; const st = Math.floor(x.length / 2);
  let mean = 0; for (let i = st; i < x.length; i++) mean += x[i]; mean /= (x.length - st);
  for (let i = st + 1; i < x.length; i++) {
    const a = x[i - 1] - mean, b = x[i] - mean;
    if (a < 0 && b >= 0) { const t = i - 1 + a / (a - b); if (first < 0) first = t; else count++; last = t; }
  }
  return count / ((last - first) / sr);
}
function run(setup, secs, notes) {
  const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
  for (const k in setup) { e.setParam(k, setup[k]); e.ps[k] = setup[k]; }
  for (const n of notes || []) e.noteOn(n);
  const out = new Float32Array(SR * secs); const blk = 128;
  for (let i = 0; i < out.length; i += blk) e.render(out.subarray(i, i + blk), Math.min(blk, out.length - i));
  return { out, e };
}
const open = { cutoff: 1, res: 0, fEnv: 0, mix1: 0.6, mix2: 0, vcaHold: 1, o1wave: 1 };
console.log('--- VCO tracking (saw, filter open) ---');
for (const n of [33, 45, 57, 69, 81, 93, 105]) {
  const { out } = run(open, 1, [n]);
  const f = freqOf(out, SR), ideal = 440 * Math.pow(2, (n - 69) / 12);
  console.log(n, ideal.toFixed(2), f.toFixed(2), (1200 * Math.log2(f / ideal)).toFixed(1) + ' cents');
}
console.log('--- self-oscillation (res=1, no input) ---');
for (const c of [0.3, 0.5, 0.7]) {
  const { out } = run({ cutoff: c, res: 1, mix1: 0, mix2: 0, vcaHold: 1, fEnv: 0 }, 2, []);
  let pk = 0; for (let i = SR; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
  console.log('cutoff', c, 'osc f', freqOf(out, SR).toFixed(1), 'peak', pk.toFixed(3));
}
console.log('--- stability sweep ---');
{
  const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
  const keys = Object.keys(e.p); let bad = 0, pk = 0; const out = new Float32Array(128);
  const t0 = Date.now(); let blocks = 0;
  for (let b = 0; b < 3000; b++) {
    if (b % 40 === 0) { for (const k of keys) if (k !== 'power') { const v = Math.random(); const map = { lfoMode: 3, o1range: 4, o2range: 4, o1wave: 3, o2wave: 3 }; e.setParam(k, map[k] ? Math.floor(v * (map[k] + 1)) : (k === 'tune' || k === 'o2detune') ? v * 2 - 1 : v); } e.noteOn(30 + Math.floor(Math.random() * 60)); }
    if (b % 40 === 25) e.allOff();
    e.render(out, 128); blocks++;
    for (const v of out) { if (!isFinite(v)) bad++; pk = Math.max(pk, Math.abs(v)); }
  }
  const secs = blocks * 128 / SR, ms = Date.now() - t0;
  console.log('NaN/inf:', bad, 'peak', pk.toFixed(3), `CPU: ${(ms / 1000 / secs * 100).toFixed(1)}% of realtime`);
}
// demo wav
{
  const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
  const set = { cutoff: 0.32, res: 0.85, fEnv: 0.55, fD: 0.35, fS: 0.1, aS: 0.8, mix1: 0.7, mix2: 0.55, o2detune: 0.012, o1range: 1, o2range: 2 };
  for (const k in set) { e.setParam(k, set[k]); e.ps[k] = set[k]; }
  const seq = [36, 36, 48, 36, 39, 36, 43, 46], step = SR * 0.2; const out = new Float32Array(SR * 6);
  for (let i = 0, si = 0; i < out.length; i += 128) {
    const pos = Math.floor(i / step);
    if (i % step < 128) { e.allOff(); e.noteOn(seq[pos % 8]); }
    if (i % step >= step * 0.6 && i % step < step * 0.6 + 128) e.allOff();
    e.render(out.subarray(i, i + 128), Math.min(128, out.length - i));
  }
  const buf = Buffer.alloc(44 + out.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + out.length * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(out.length * 2, 40);
  for (let i = 0; i < out.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32000), 44 + i * 2);
  fs.writeFileSync('demo.wav', buf);
  let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v)); console.log('demo peak', pk.toFixed(3));
}
