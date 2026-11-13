const { PolivoksEngine, Keyboard, modOct, fmOctPerVolt, detuneOct, pitchOct } = require('./dsp.js');
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
console.log('--- keyboard board (sheet 3) ---');
{
  const f1 = (set, play) => {     // frequency of each VCO alone after play(e)
    const r = [];
    for (const solo of [{ mix1: 0.6, mix2: 0 }, { mix1: 0, mix2: 0.6 }]) {
      const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
      const s0 = Object.assign({}, open, { o2wave: 1 }, set, solo);
      for (const k in s0) { e.setParam(k, s0[k]); e.ps[k] = s0[k]; }
      const out = new Float32Array(SR); play(e, out);
      r.push(freqOf(out, SR));
    }
    return r.map(f => (69 + 12 * Math.log2(f / 440)).toFixed(2));
  };
  const blocks = (e, out, a, b) => { for (let i = a; i < b; i += 128) e.render(out.subarray(i, i + 128), 128); };
  console.log('2-voice, keys 45+60 held:  VCO I / II notes', f1({ voice: 1 }, (e, o) => { e.noteOn(60); e.noteOn(45); blocks(e, o, 0, o.length); }).join(' / '));
  console.log('1-voice, keys 45+60 held:  VCO I / II notes', f1({ voice: 0 }, (e, o) => { e.noteOn(60); e.noteOn(45); blocks(e, o, 0, o.length); }).join(' / '));
  console.log('2-voice, 45+60 released:   VCO I / II notes', f1({ voice: 1 }, (e, o) => { e.noteOn(60); e.noteOn(45); blocks(e, o, 0, 4800); e.allOff(); blocks(e, o, 4800, o.length); }).join(' / '));
  const kb = new Keyboard(1 / SR); kb.press(53); for (let i = 0; i < SR; i++) kb.step(0, true);
  kb.release(53); kb.press(65); let t50 = -1, t1 = -1;
  for (let i = 0; i < SR; i++) { kb.step(0, true); const k = 53 - kb.v12 / 0.125; if (t50 < 0 && k > 59) t50 = i; if (t1 < 0 && k > 64.88) t1 = i; }
  console.log(`track-and-hold 53→65: half-way ${(t50 / SR * 1e6).toFixed(0)} µs, 1 % left ${(t1 / SR * 1e6).toFixed(0)} µs (SPICE 374 / 2325 µs incl. gate delay)`);
  kb.release(65); let toff = -1; for (let i = 0; i < 100; i++) { kb.step(0, true); if (toff < 0 && !kb.gate) toff = i; }
  console.log(`gate off ${(toff / SR * 1e6).toFixed(0)} µs after release (SPICE 262 µs)`);
  const kb2 = new Keyboard(1 / SR); kb2.press(53); for (let i = 0; i < SR; i++) kb2.step(1e6, true);
  kb2.press(41); kb2.release(53); let tg = -1;
  for (let i = 0; i < SR; i++) { kb2.step(1e6, true); if (tg < 0 && 53 - kb2.cv1 / 0.125 < 47) tg = i; }
  console.log(`glide at full (R48 1 MΩ): half-way ${(tg / SR * 1e3).toFixed(1)} ms (RC·ln2 = ${(1.001e6 * 0.22e-6 * Math.LN2 * 1e3).toFixed(1)} ms)`);
  const e = new PolivoksEngine(SR); e.setParam('power', 1); const o = new Float32Array(128); let rises = 0, last = false;
  e.noteOn(48); for (let b = 0; b < 40; b++) { e.render(o, 128); if (e.gate && !last) rises++; last = e.gate; if (b === 20) { e.noteOn(50); e.noteOff(48); } }
  console.log(`legato 48→50: gate rises ${rises} (no retrigger)`);
}
console.log('--- VCO summer (sheet 5), octaves; SPICE in spice/vco/summer.txt ---');
console.log('mod bus +1.43 V, pot 0.1/0.25/0.5/0.75/1:', [0.1, 0.25, 0.5, 0.75, 1].map(a => modOct(a, 1.43).toFixed(4)).join(' '));
console.log('FM per volt, pot 0.25/0.5/1:', [0.25, 0.5, 1].map(a => fmOctPerVolt(a).toFixed(4)).join(' '), ' detune -1/0/+1:', [-1, 0, 1].map(d => detuneOct(d).toFixed(4)).join(' '));
console.log('--- pitch knobs (±1 octave, an addition) ---');
console.log('pitchOct -1/-0.5/0/0.5/1:', [-1, -0.5, 0, 0.5, 1].map(d => pitchOct(d).toFixed(4)).join(' '));
for (const [id, mix] of [['o1pitch', { mix1: 0.6, mix2: 0 }], ['o2pitch', { mix1: 0, mix2: 0.6, o2wave: 1 }]])
  for (const v of [-1, 1]) { const { out } = run(Object.assign({}, open, mix, { [id]: v }), 1, [57]); console.log(id, v, 'note', (69 + 12 * Math.log2(freqOf(out, SR) / 440)).toFixed(2)); }
console.log('--- stability sweep ---');
{
  const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
  const keys = Object.keys(e.p); let bad = 0, pk = 0; const out = new Float32Array(128);
  const t0 = Date.now(); let blocks = 0;
  for (let b = 0; b < 3000; b++) {
    if (b % 40 === 0) { for (const k of keys) if (k !== 'power') { const v = Math.random(); const map = { lfoMode: 3, o1range: 4, o2range: 4, o1wave: 3, o2wave: 3 }; e.setParam(k, map[k] ? Math.floor(v * (map[k] + 1)) : (k === 'tune' || k === 'o2detune' || k.endsWith('pitch')) ? v * 2 - 1 : v); } e.noteOn(30 + Math.floor(Math.random() * 60)); }
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
  const set = { cutoff: 0.54, res: 0.85, fEnv: 0.55, fD: 0.35, fS: 0.1, aS: 0.8, mix1: 0.7, mix2: 0.55, o2detune: 0.012, o1range: 1, o2range: 2 };
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
// knob sequencer (performance feature, seq.js): rides on the knob, off = untouched
{
  const { KnobSeq } = require('./seq.js');
  const e = new PolivoksEngine(SR); const q = new KnobSeq(SR, e);
  q.msg({ t: 'p', id: 'cutoff', v: 0.5 });
  const out = new Float32Array(128), seen = new Set();
  q.setBpm(120);
  q.setSeq('cutoff', { on: true, len: 4, div: 1, depth: 0.5, slew: 0, steps: [1, -1, 0.5, 0, 0,0,0,0,0,0,0,0,0,0,0,0] }, [0, 1]);
  for (let b = 0; b < SR / 128; b++) { q.render(out, 128); seen.add(e.p.cutoff.toFixed(3)); }
  q.msg({ t: 'p', id: 'cutoff', v: 0.4 });  // knob moves the centre
  q.render(out, 128); const moved = e.p.cutoff;
  q.setSeq('cutoff', { on: false, len: 4, div: 1, depth: 0.5, slew: 0, steps: [] });
  console.log('seq cutoff values', [...seen].sort().join(' '), '| moved', moved.toFixed(3), '| off ->', e.p.cutoff);
  if (![...seen].includes('1.000') || ![...seen].includes('0.000') || ![...seen].includes('0.750') || e.p.cutoff !== 0.4) { console.log('SEQ TEST FAILED'); process.exitCode = 1; }
}
