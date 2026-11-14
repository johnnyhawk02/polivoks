const { PolivoksEngine, Keyboard, modOct, fmOctPerVolt, detuneOct, pitchOct, Modulator } = require('./dsp.js');
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
console.log('--- pulse width knobs (an addition; SPICE in spice/vco/pw.txt) ---');
{
  // duty of VCO I's pulse in the running engine (A10 output > 0), note 57 (220 Hz) and 81 (880 Hz)
  const duty = (pw, note, extra) => {
    const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
    const s0 = Object.assign({}, open, { o1wave: 2 }, extra || {}); if (pw !== undefined) s0.o1pw = pw;
    for (const k in s0) { e.setParam(k, s0[k]); e.ps[k] = s0[k]; }
    e.noteOn(note); const out = new Float32Array(128);
    for (let i = 0; i < SR * 1.5; i += 128) e.render(out, 128);
    let hi = 0, n = 0; for (let i = 0; i < SR / 2; i += 128) { e.render(out, 128); for (let j = 0; j < 128; j++) { hi += e.vco1.pulse > 0 ? 1 : 0; n++; } }
    return (hi / n * 100).toFixed(1);
  };
  for (const note of [57, 81]) console.log('note', note, 'PW 0/0.25/0.5/0.75/1 duty %:', [0, 0.25, 0.5, 0.75, 1].map((v) => duty(v, note)).join(' '));
  console.log('old preset (no PW saved) duty %:', duty(undefined, 57), ' narrow switch duty %:', duty(undefined, 57, { o1wave: 3 }));
  const f = (pw) => { const { out } = run(Object.assign({}, open, { o1wave: 2, o1pw: pw }), 1, [57]); return freqOf(out, SR); };
  console.log('pitch PW 0 vs 1:', (1200 * Math.log2(f(1) / f(0))).toFixed(2), 'cents');
}
console.log('--- pulse width never silences the output (regression: v1.20.0 went quiet past ~40 % on the narrow-pulse position) ---');
{
  // whole engine at normal mixer/filter/VCA settings; RMS over the knob's range
  // against the RMS at knob 0, square and narrow-pulse positions, both VCOs
  const rms = (set, note) => {
    const e = new PolivoksEngine(SR); e.setParam('power', 1); e.powerLevel = 1;
    for (const x in set) { e.setParam(x, set[x]); e.ps[x] = set[x]; }
    e.noteOn(note); const o = new Float32Array(128); let a = 0, n = 0;
    for (let i = 0; i < SR * 0.5; i += 128) { e.render(o, 128); if (i > SR * 0.25) for (const v of o) { a += v * v; n++; } }
    return Math.sqrt(a / n);
  };
  let worst = 1, where = '';
  for (const [v, mix] of [[1, { mix1: 0.65, mix2: 0 }], [2, { mix1: 0, mix2: 0.65 }]]) for (const w of [2, 3]) for (const note of [33, 57, 81, 105]) {
    const base = { vcaHold: 1, ['o' + v + 'wave']: w }; Object.assign(base, mix);
    const r0 = rms(Object.assign({}, base, { ['o' + v + 'pw']: 0 }), note);
    for (let k = 1; k <= 8; k++) { const r = rms(Object.assign({}, base, { ['o' + v + 'pw']: k / 8 }), note) / r0; if (r < worst) { worst = r; where = `VCO ${v} ${w === 2 ? 'square' : 'narrow'} note ${note} knob ${k / 8}`; } }
  }
  const ok = worst > 0.2;
  console.log(`lowest RMS vs knob 0: ${worst.toFixed(2)} (${where}) ${ok ? 'PASS' : 'FAIL: below 0.2'}`);
  if (!ok) process.exitCode = 1;
}
console.log('--- modulator rate (sheet 10; SLOW range is an addition) ---');
{
  // the engine's own wiring: one 48 kHz sample steps the modulator once
  const rate = (knob, slow) => {
    const e = new PolivoksEngine(SR); e.setParam('lfoRate', knob); e.ps.lfoRate = knob; if (slow !== undefined) e.setParam('lfoRange', slow);
    const m = e.lfo, out = new Float32Array(128); e.render(out, 1);   // sets C and R for this range
    const pot = (p, r) => r * (Math.exp(5 * p) - 1) / (Math.exp(5) - 1);
    const R = 4.3e3 + pot(1 - knob, e.p.lfoRange ? 1e6 : 100e3);
    let prev = m.vo, first = -1, last = -1, n = 0;
    for (let i = 0; i < SR * 400 && n < 2; i++) { m.step(R, 0, 0); if (prev < 0 && m.vo > 0) { if (first < 0) first = i; else { n++; last = i; } } prev = m.vo; }
    return SR * n / (last - first);
  };
  const row = (slow) => [0, 0.1, 0.25, 0.5, 0.75, 1].map((k) => rate(k, slow).toPrecision(3)).join(' ');
  console.log('FAST knob 0/0.1/0.25/0.5/0.75/1 Hz:', row(0));
  console.log('SLOW knob 0/0.1/0.25/0.5/0.75/1 Hz:', row(1));
  console.log('old preset (no range saved), knob 0:', rate(0).toPrecision(3), 'Hz');
}
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
// stereo echo (an added effect after the synth, fx.js)
{
  const { TapeEcho, FxRack } = require('./fx.js');
  const { KnobSeq } = require('./seq.js');
  console.log('--- stereo echo (added effect, not circuit) ---');
  const runFx = (set, len, feed) => {
    const fx = new TapeEcho(SR); for (const k in set) { fx.set(k, set[k]); fx.ps[k] = set[k]; } fx.d = fx.target();
    const L = new Float32Array(SR * len), R = new Float32Array(SR * len);
    for (let i = 0; i < L.length; i++) L[i] = feed(i);
    for (let i = 0; i < L.length; i += 128) fx.process(L.subarray(i, i + 128), R.subarray(i, i + 128), 128);
    return { L, R, fx };
  };
  const peakAt = (x, a, b) => { let m = 0, at = a; for (let i = a; i < b; i++) if (Math.abs(x[i]) > m) { m = Math.abs(x[i]); at = i; } return [at, m]; };
  // 1/8 at 120 BPM = 250 ms, full spread: echoes alternate L, R, L
  const { L, R } = runFx({ eSync: 1, eTime: 2 / 6, eFb: 0.6, eMix: 1, eSpread: 1, eTone: 1 }, 1, (i) => i < 48 ? 0.8 : 0);
  const e1 = peakAt(L, 2000, 18000), e1r = peakAt(R, 2000, 18000), e2 = peakAt(R, 18000, 30000), e3 = peakAt(L, 30000, 42000);
  console.log(`ping-pong 1/8 @120: L ${(e1[0] / SR * 1e3).toFixed(1)} ms (${e1[1].toFixed(3)}), R ${(e2[0] / SR * 1e3).toFixed(1)} ms (${e2[1].toFixed(3)}), L ${(e3[0] / SR * 1e3).toFixed(1)} ms (${e3[1].toFixed(3)}); R at first echo ${e1r[1].toFixed(4)}`);
  if (Math.abs(e1[0] / SR - 0.25) > 0.004 || Math.abs(e2[0] / SR - 0.5) > 0.006 || e1r[1] > 0.01 || !(e3[1] < e2[1] && e2[1] < e1[1])) { console.log('ECHO TIMING FAILED'); process.exitCode = 1; }
  // feedback flat out on loud noise, then silence: bounded and dying away
  const hot = runFx({ eSync: 0, eTime: 0.3, eFb: 1, eMix: 1, eSpread: 1, eTone: 1 }, 12, (i) => i < SR ? (Math.random() * 2 - 1) : 0);
  const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
  let pk = 0; for (const x of [hot.L, hot.R]) for (const v of x) pk = Math.max(pk, Math.abs(v));
  const r1 = rms(hot.L, SR, 2 * SR), r5 = rms(hot.L, 5 * SR, 6 * SR), r11 = rms(hot.L, 11 * SR, 12 * SR);
  console.log(`feedback at max: peak ${pk.toFixed(3)}, rms 1-2 s ${r1.toFixed(3)}, 5-6 s ${r5.toFixed(3)}, 11-12 s ${r11.toFixed(4)}`);
  if (pk > 1 || !(r5 < r1 && r11 < r5 * 0.5)) { console.log('ECHO RUNAWAY'); process.exitCode = 1; }
  // whole chain with random echo settings: finite, ≤ full scale, CPU
  const e = new PolivoksEngine(SR), fx = new TapeEcho(SR), q = new KnobSeq(SR, new FxRack(e, fx));
  q.msg({ t: 'p', id: 'power', v: 1 }); e.powerLevel = 1;
  for (const [k, v] of Object.entries({ volume: 1, cutoff: 0.8, res: 0.7, mix1: 1, mix2: 1 })) q.msg({ t: 'p', id: k, v });
  const oL = new Float32Array(128), oR = new Float32Array(128); let bad = 0, pk2 = 0; const t0 = Date.now(), nb = 3000;
  for (let b = 0; b < nb; b++) {
    if (b % 60 === 0) { for (const k of ['eTime', 'eFb', 'eTone', 'eMix', 'eSpread']) q.msg({ t: 'p', id: k, v: Math.random() }); q.msg({ t: 'p', id: 'eSync', v: Math.random() < .5 ? 0 : 1 }); q.msg({ t: 'on', n: 36 + Math.floor(Math.random() * 36) }); }
    if (b % 60 === 30) q.msg({ t: 'all' });
    q.render(oL, 128); fx.bpm = q.tempo(); fx.process(oL, oR, 128);
    for (let i = 0; i < 128; i++) { if (!isFinite(oL[i]) || !isFinite(oR[i])) bad++; pk2 = Math.max(pk2, Math.abs(oL[i]), Math.abs(oR[i])); }
  }
  console.log(`synth + echo, random settings: NaN/inf ${bad}, peak ${pk2.toFixed(3)}, CPU ${((Date.now() - t0) / 1000 / (nb * 128 / SR) * 100).toFixed(1)}% of realtime`);
  if (bad || pk2 > 1) { console.log('ECHO CHAIN FAILED'); process.exitCode = 1; }
  // MIDI clock at 100 BPM sets the echo: 1/4 = 600 ms
  const q2 = new KnobSeq(SR, new FxRack(new PolivoksEngine(SR), fx)); const o = new Float32Array(128);
  let next = 0; const per = 60 / 100 / 24;
  for (let b = 0; b < SR * 2 / 128; b++) { const t = b * 128 / SR; while (next <= t) { q2.msg({ t: 'clk' }); next += per; } q2.render(o, 128); }
  fx.set('eSync', 1); fx.set('eTime', 4 / 6); fx.bpm = q2.tempo();
  console.log(`MIDI clock 100 BPM: tempo ${q2.tempo()}, echo 1/4 = ${(fx.target() / SR * 1e3).toFixed(1)} ms`);
  if (q2.tempo() !== 100 || Math.abs(fx.target() / SR - 0.6) > 1e-6) { console.log('ECHO CLOCK FAILED'); process.exitCode = 1; }
}
// TONE randomiser (tone.js): interval knob positions and the ranges it draws from
{
  const { makeTone, TONE_PITCH, TONE_CENT } = require('./tone.js');
  console.log('--- TONE randomiser ---');
  let bad = 0;
  for (const s in TONE_PITCH) { const c = 1200 * pitchOct(TONE_PITCH[s]) - 100 * s; if (Math.abs(c) > 0.5) { console.log('pitch knob for', s, 'off by', c.toFixed(2), 'cents'); bad++; } }
  if (Math.abs(1200 * detuneOct(10 * TONE_CENT) - 10) > 0.1) { console.log('detune cent constant off'); bad++; }
  // heard: VCO II against VCO I on the fifth and the fourth (both saw, filter open)
  for (const s of [7, 5]) {
    const f = (solo) => freqOf(run(Object.assign({}, open, { o2wave: 1, o2pitch: TONE_PITCH[s] }, solo), 1, [57]).out, SR);
    const c = 1200 * Math.log2(f({ mix1: 0, mix2: 0.6 }) / f({ mix1: 0.6, mix2: 0 })) - 100 * s;
    console.log(`VCO II at +${s} semitones: ${c.toFixed(1)} cents off`); if (Math.abs(c) > 6) bad++;
  }
  const kinds = {}; let n = 0;
  for (let i = 0; i < 5000; i++) {
    const { kind, k } = makeTone(); kinds[kind] = (kinds[kind] || 0) + 1;
    for (const id in k) { const lo = id === 'o2detune' || id === 'o2pitch' ? -1 : 0, hi = /range/.test(id) ? 4 : /wave|lfoMode/.test(id) ? 3 : 1; if (!(k[id] >= lo && k[id] <= hi)) { bad++; if (n++ < 5) console.log('out of range', id, k[id]); } }
    if (k.vcaHold || k.fMode || k.res > 0.8 || k.cutoff < 0.38 || k.mix1 < 0.4 || 'volume' in k || 'phones' in k || 'outSel' in k || k.o1mod > 0.01 || k.aMod > 0.07 || k.fMod > 0.1 || k.eFb > 0.55 || k.eSync !== 1) { bad++; if (n++ < 5) console.log('outside the usable zone', kind, JSON.stringify(k)); }
  }
  console.log('5000 tones by kind:', JSON.stringify(kinds), bad ? 'FAILED' : 'all in range');
  if (bad) { console.log('TONE TEST FAILED'); process.exitCode = 1; }
}
