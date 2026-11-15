// ============================================================================
// Stereo echo: an EFFECT ADDED AFTER THE SYNTH.  It is not part of the
// Polivoks circuit and models no particular unit; it is a tape / BBD style
// ping-pong delay voiced to sit with a gritty mono synth:
//   - two delay lines that feed each other (ping-pong), SPREAD sets how much
//     of the repeat crosses sides: 0 = centred mono echo, 1 = full ping-pong
//   - every pass goes through a band limit (TONE: dark … bright low-pass, plus
//     a fixed low cut) and a soft saturator, so repeats get darker and dirtier
//   - FEEDBACK is capped below unity and the saturator bounds the loop, so it
//     can never run away
//   - gentle wow and flutter (slightly different on each side), and delay-time
//     changes glide like a tape motor, so moving TIME bends the repeats
//   - TIME is free (40 ms … 1.2 s) or, with SYNC, steps through note values of
//     the shared clock (which follows MIDI clock)
// The synth engine is untouched: this runs on the chorus's stereo output
// (with the chorus OFF, the synth's mono output on both sides).
// ============================================================================
const ECHO_DEFAULTS = { eTime: 0.5, eFb: 0.35, eTone: 0.45, eMix: 0.25, eSpread: 0.8, eSync: 1 };
// sync note values in 16ths: 1/16, 1/8T, 1/8, 1/8., 1/4, 1/4., 1/2
const ECHO_DIVS = [1, 4 / 3, 2, 3, 4, 6, 8];
const ECHO_FB_MAX = 0.94;

class TapeEcho {
  constructor(sr) {
    this.sr = sr;
    this.size = 1 << Math.ceil(Math.log2(sr * 4 + 8)); this.mask = this.size - 1;
    this.bL = new Float32Array(this.size); this.bR = new Float32Array(this.size); this.w = 0;
    this.p = Object.assign({}, ECHO_DEFAULTS); this.ps = Object.assign({}, ECHO_DEFAULTS);
    this.bpm = 120;
    this.d = this.target();                 // current delay, samples (glides)
    this.lpL = 0; this.lpR = 0; this.lp2L = 0; this.lp2R = 0; this.hpL = 0; this.hpR = 0;
    this.yL = 0; this.yR = 0;
    this.ph = [0, 0.37, 0.11, 0.6];          // wow L, wow R, flutter L, flutter R
    this.rs = 0x2545f491; this.drift = 0; this.driftT = 0;
  }
  set(id, v) { if (id in this.p) { this.p[id] = v; if (id === 'eSync') this.ps[id] = v; } }
  // delay time asked for by the knobs, in samples
  target() {
    const u = Math.max(0, Math.min(1, this.p.eTime));
    let s;
    if (this.p.eSync >= 0.5) s = ECHO_DIVS[Math.min(ECHO_DIVS.length - 1, Math.round(u * (ECHO_DIVS.length - 1)))] * 15 / this.bpm;
    else s = 0.04 * Math.pow(30, u);
    return Math.max(0.01, Math.min(3.6, s)) * this.sr;
  }
  rnd() { let s = this.rs; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.rs = s >>> 0; return this.rs / 4294967296 - 0.5; }
  // 4-point Hermite read, d samples behind the write head
  read(b, d) {
    const pos = this.w - d, i = Math.floor(pos), f = pos - i, m = this.mask;
    const y0 = b[(i - 1) & m], y1 = b[i & m], y2 = b[(i + 1) & m], y3 = b[(i + 2) & m];
    const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * f + c2) * f + c1) * f + y1;
  }
  // in: L and R (the chorus's output; the same signal on both when it is OFF); writes the stereo result back
  process(L, R, n) {
    const sr = this.sr, p = this.p, ps = this.ps;
    const sm = 1 - Math.exp(-1 / (0.02 * sr));
    const glide = 1 - Math.exp(-1 / (0.12 * sr));        // tape motor settling
    const tgt = this.target();
    const hpk = 1 - Math.exp(-2 * Math.PI * 90 / sr);
    const TW = 2 * Math.PI / sr;
    for (let s = 0; s < n; s++) {
      ps.eFb += (p.eFb - ps.eFb) * sm; ps.eTone += (p.eTone - ps.eTone) * sm;
      ps.eMix += (p.eMix - ps.eMix) * sm; ps.eSpread += (p.eSpread - ps.eSpread) * sm;
      this.d += (tgt - this.d) * glide;
      // wow ~0.5 Hz, flutter ~6.5 Hz, plus a slow random drift
      const ph = this.ph;
      ph[0] += 0.53 * TW; ph[1] += 0.61 * TW; ph[2] += 6.3 * TW; ph[3] += 6.9 * TW;
      if (ph[0] > 6.2832) { ph[0] -= 6.2832; } if (ph[1] > 6.2832) ph[1] -= 6.2832;
      if (ph[2] > 6.2832) ph[2] -= 6.2832; if (ph[3] > 6.2832) ph[3] -= 6.2832;
      if (--this.driftT <= 0) { this.driftT = 64; this.drift += (this.rnd() * 0.6 - this.drift * 0.002); }
      const dr = this.drift * 0.00002 * sr;
      const wL = (0.0009 * Math.sin(ph[0]) + 0.00007 * Math.sin(ph[2])) * sr + dr;
      const wR = (0.0009 * Math.sin(ph[1]) + 0.00007 * Math.sin(ph[3])) * sr - dr;
      const dL = Math.max(4, this.d + wL), dR = Math.max(4, this.d + wR);
      const yL = this.read(this.bL, dL), yR = this.read(this.bR, dR);

      const x = L[s], xR = R[s], sp = ps.eSpread, fb = ECHO_FB_MAX * Math.min(1, Math.max(0, ps.eFb));
      // ping-pong routing: the left input enters on the left (and the right
      // input on the right as SPREAD comes down); SPREAD of each repeat crosses sides
      let iL = x + fb * ((1 - sp) * yL + sp * yR);
      let iR = xR * (1 - sp) + fb * ((1 - sp) * yR + sp * yL);
      // band limit on every pass: tone low-pass (two poles) and a 90 Hz low cut
      const fc = 650 * Math.pow(2, 4.2 * Math.min(1, Math.max(0, ps.eTone)));
      const lk = 1 - Math.exp(-TW * fc);
      this.lpL += (iL - this.lpL) * lk; this.lp2L += (this.lpL - this.lp2L) * lk;
      this.lpR += (iR - this.lpR) * lk; this.lp2R += (this.lpR - this.lp2R) * lk;
      this.hpL += (this.lp2L - this.hpL) * hpk; this.hpR += (this.lp2R - this.hpR) * hpk;
      iL = this.lp2L - this.hpL; iR = this.lp2R - this.hpR;
      // soft saturation, a little asymmetric like an overdriven tape / BBD stage
      this.bL[this.w] = Math.tanh(iL * 1.25 + 0.04) / 1.25 - 0.032;
      this.bR[this.w] = Math.tanh(iR * 1.25 + 0.04) / 1.25 - 0.032;
      this.w = (this.w + 1) & this.mask;

      // dry stays full up to half MIX, then fades; wet comes up to full by half
      const m = Math.min(1, Math.max(0, ps.eMix)), dg = Math.min(1, 2 - 2 * m), wg = Math.min(1, 2 * m);
      L[s] = x * dg + yL * wg;   // the soft clipper (SoftClip) follows
      R[s] = xR * dg + yR * wg;
    }
  }
  static lim(x) { return SoftClip.lim(x); }
}

// The output stage (added, not circuit): a soft clipper after the echo.
// Transparent below 0.7, then a soft knee up to 1, so nothing can hard clip.
// `hit` is how far into the knee the loudest sample went since it was last
// read (0 = never reached it, 1 = driven well past it): the CLIP LED.
class SoftClip {
  constructor() { this.hit = 0; }
  process(L, R, n) {
    let pk = 0;
    for (let i = 0; i < n; i++) {
      const a = L[i] < 0 ? -L[i] : L[i], b = R[i] < 0 ? -R[i] : R[i];
      if (a > pk) pk = a; if (b > pk) pk = b;
      L[i] = SoftClip.lim(L[i]); R[i] = SoftClip.lim(R[i]);
    }
    if (pk > 0.7) this.hit = Math.max(this.hit, Math.min(1, (pk - 0.7) / 0.5));
  }
  read() { const h = this.hit; this.hit = 0; return h; }
  // transparent below 0.7, then a soft knee up to 1
  static lim(x) { const a = x < 0 ? -x : x; if (a <= 0.7) return x; const y = 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3); return x < 0 ? -y : y; }
}

// ============================================================================
// Stereo chorus: an EFFECT ADDED AFTER THE SYNTH (the Polivoks had none),
// modelled on the Roland Juno-60's.  It runs before the echo.
//   Sourced (florian-anwander.de/roland_string_choruses): two MN3009 BBDs fed
//   from one mono input; one LFO; I = 0.5 Hz triangle, full depth; II = 0.8 Hz
//   triangle, full depth; I+II = fast, sine-like, 8 % depth; the second BBD's
//   modulation is inverted in I and II and NOT inverted in I+II; each BBD
//   output goes to one side and the dry signal is mixed 1:1 into both.
//   MN3009: 256 stages, so the delay is 128 clock periods.
//   Estimated (EST): the delay sweep 1.66 … 5.35 ms (widely quoted
//   measurements, not from a schematic); the I+II rate 9.75 Hz (also quoted;
//   the Juno-6 is 8 Hz, other sources say 8-10 Hz); the input and output
//   filters (2-pole 9 kHz, below the lowest clock's 12 kHz Nyquist); the hiss
//   (-76 dB re 1.0, MN3009-class S/N); the BBD's soft overload; the switch's
//   5 ms fade; and the output trim CH_TRIM (output scaling, not circuit: the
//   dry + wet sum is taken back so switching it on is about level).
// The BBD is modelled as what it is: the filtered input is sampled at each
// clock tick (at the tick's exact time), shifted 128 ticks, and held until
// the next tick; the held steps are averaged over each output sample, then
// smoothed by the output filter.  So the clock really sweeps from about 24 to
// 77 kHz, with its own aliasing where the input filter lets it through.
// With OFF selected (and the fade done) the signal is untouched and the
// chorus costs nothing; the right channel is a copy of the left.
// ============================================================================
const CH_LFO = [0, 0.5, 0.8, 9.75];             // Hz for OFF, I, II, I+II (I+II EST)
const CH_DEPTH = [0, 1, 1, 0.08];               // fraction of the full sweep
const CH_DMIN = 1.66e-3, CH_DMAX = 5.35e-3;     // full sweep, s (EST)
const CH_STAGES = 256, CH_FC = 9000, CH_NOISE = 1.6e-4, CH_TRIM = 0.72;

class Biquad2 {           // 2-pole Butterworth low-pass (bilinear, prewarped)
  constructor(fc, sr) {
    const k = Math.tan(Math.PI * fc / sr), q = Math.SQRT1_2, n = 1 / (1 + k / q + k * k);
    this.b0 = k * k * n; this.b1 = 2 * this.b0; this.a1 = 2 * (k * k - 1) * n; this.a2 = (1 - k / q + k * k) * n;
    this.z1 = 0; this.z2 = 0;
  }
  run(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b0 * x - this.a2 * y; return y; }
  reset() { this.z1 = this.z2 = 0; }
}
class BBD {
  constructor(sr) {
    this.N = CH_STAGES / 2; this.buf = new Float32Array(this.N); this.i = 0;
    this.ph = 0; this.hold = 0; this.pre = new Biquad2(CH_FC, sr); this.post = new Biquad2(CH_FC, sr); this.xp = 0;
  }
  reset() { this.buf.fill(0); this.i = 0; this.ph = 0; this.hold = 0; this.xp = 0; this.pre.reset(); this.post.reset(); }
  // x: input this sample; inc: clock ticks per output sample (f_clk / sr)
  step(x, inc, noise) {
    const a = this.pre.run(x), a0 = this.xp; this.xp = a;
    let ph = this.ph + inc, acc = 0, t0 = 0;
    while (ph >= 1) {                       // a tick at fraction t of this sample
      ph -= 1; const t = 1 - ph / inc;
      acc += this.hold * (t - t0); t0 = t;
      const v = a0 + (a - a0) * t;          // the input at the tick
      this.hold = this.buf[this.i];         // out comes what went in 128 ticks ago
      this.buf[this.i] = v > 1.5 || v < -1.5 ? 1.5 * Math.tanh(v / 1.5) : v;   // soft overload past the BBD's swing (EST)
      this.i = this.i + 1 === this.N ? 0 : this.i + 1;
    }
    this.ph = ph; acc += this.hold * (1 - t0);
    return this.post.run(acc + noise);
  }
}
class JunoChorus {
  constructor(sr) {
    this.sr = sr; this.p = { chorus: 0 }; this.mode = 0;
    this.l1 = new BBD(sr); this.l2 = new BBD(sr);
    this.lph = 0; this.g = 0;               // LFO phase (0..1), wet gain (fades on switching)
    this.rs = 0x1234567;
  }
  set(id, v) { if (id in this.p) this.p[id] = Math.max(0, Math.min(3, Math.round(v))); }
  rnd() { let s = this.rs; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.rs = s >>> 0; return this.rs / 4294967296 - 0.5; }
  process(L, R, n) {
    const want = this.p.chorus;
    if (want === 0 && this.g === 0) { R.set(L.subarray(0, n)); return; }   // OFF: untouched
    if (want !== 0) { if (this.g === 0) { this.l1.reset(); this.l2.reset(); } this.mode = want; }
    const sr = this.sr, m = this.mode, fl = CH_LFO[m] / sr, dep = CH_DEPTH[m], inv = m !== 3;
    const mid = (CH_DMIN + CH_DMAX) / 2, half = (CH_DMAX - CH_DMIN) / 2 * dep, N = CH_STAGES / 2;
    const gT = want ? 1 : 0, gk = 1 / (0.005 * sr), nz = CH_NOISE * 3.4641;   // uniform noise of that RMS
    for (let s = 0; s < n; s++) {
      let ph = this.lph + fl; if (ph >= 1) ph -= 1; this.lph = ph;
      // triangle (I, II) or sine (I+II), -1 … 1
      const lf = m === 3 ? Math.sin(2 * Math.PI * ph) : (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
      const d1 = mid + half * lf, d2 = mid + half * (inv ? -lf : lf);
      const x = L[s];
      const w1 = this.l1.step(x, N / (d1 * sr), nz * this.rnd()), w2 = this.l2.step(x, N / (d2 * sr), nz * this.rnd());
      this.g += gT > this.g ? Math.min(gk, gT - this.g) : -Math.min(gk, this.g - gT);
      const g = this.g, t = 1 + (CH_TRIM - 1) * g;
      L[s] = (x + g * w1) * t; R[s] = (x + g * w2) * t;
    }
  }
}

// ============================================================================
// Reverb: an EFFECT ADDED AFTER THE ECHO (the Polivoks had none).  A huge,
// dark, slowly moving space in the Blackhole style; it models no unit and copies
// no one's code.  A feedback delay network (Jot / Stautner-Puckette):
//   - 30 ms pre-delay, then four allpass diffusers on each side, so a hit
//     enters the tank already a cloud
//   - eight delay lines (57 … 200 ms, times SIZE: up to about 1 s) mixed by
//     an 8x8 Hadamard matrix, which loses no energy, and fed back
//   - each line's gain is set from DECAY's RT60 (0.5 s … 60 s); a one-pole
//     crossover in each loop gives the highs a shorter RT60 (DARK), so long
//     tails turn into a warm wash
//   - each line's length drifts slowly (its own sine, 0.07 … 0.3 Hz, about
//     1.6 ms), which smears the pitch a little and stops metallic ringing
//   - GRAVITY: each new note restarts a swell on the wet output: it starts 24 dB
//     down and is lifted against the tail's own decay, so the tail blooms up over
//     0.4 … 3 s instead of dying away, then drops back in 60 ms: a reversed tail
//   - FREEZE: the loop gain goes to exactly 1, damping and input go out, and the
//     tail holds for as long as it stays on (a soft limit in the loop bounds it)
//   - MIX at 0 skips it altogether: the sound is bit-identical to no reverb
// Voicing choices (line lengths, diffusion 0.62, mod depth, 110 Hz low cut on
// the wet, input level) are by ear and by the tests in test.js (EST).
// ============================================================================
const REV_DEFAULTS = { rSize: 0.6, rDecay: 0.5, rGrav: 0, rDark: 0.6, rMix: 0, rFreeze: 0 };
const REV_LINES = [57.3, 71.1, 89.7, 103.9, 131.3, 149.1, 173.9, 199.7];   // ms at SIZE 1/5
const REV_DIFF = [[4.71, 3.59, 12.73, 9.31], [5.27, 3.11, 13.69, 8.43]];    // ms, left and right diffusers
const REV_RATES = [0.071, 0.093, 0.117, 0.139, 0.163, 0.199, 0.241, 0.297]; // Hz, the lines' drift
// input signs per line (even lines take the left, odd the right) and the output taps: a hit reaches the
// outputs at once instead of cancelling in the first pass
const REV_IN_G = 3;   // input level into the tank (EST, set by test.js's level check)
const REV_IN = [1, 1, -1, 1, 1, -1, 1, -1];
const REV_TL = [1, 0.3, -1, 0.3, 1, -0.3, 1, 0.3].map((v) => v / 2), REV_TR = [0.3, 1, -0.3, 1, 0.3, -1, -0.3, -1].map((v) => v / 2);
const REV_RT = (u) => 0.5 * Math.pow(120, Math.max(0, Math.min(1, u)));    // DECAY → RT60, s
const REV_SCALE = (u) => 0.35 + 4.65 * Math.pow(Math.max(0, Math.min(1, u)), 1.5);   // SIZE → line length factor
class BlackHole {
  constructor(sr) {
    this.sr = sr; this.p = Object.assign({}, REV_DEFAULTS); this.ps = Object.assign({}, REV_DEFAULTS);
    this.len = 1 << Math.ceil(Math.log2(sr * 1.08)); this.mask = this.len - 1;
    this.buf = REV_LINES.map(() => new Float32Array(this.len)); this.w = 0;
    this.preL = new Float32Array(1 << Math.ceil(Math.log2(sr * 0.04))); this.preR = new Float32Array(this.preL.length); this.pw = 0; this.pd = Math.round(0.03 * sr);
    this.ap = REV_DIFF.map((side) => side.map((ms) => ({ b: new Float32Array(Math.ceil(ms * sr / 1000) + 1), i: 0 })));
    this.lp = new Float64Array(8); this.dc = new Float64Array(8); this.y = new Float64Array(8); this.raw = new Float64Array(8); this.g = new Float64Array(16);
    this.c = REV_RATES.map((_, i) => Math.cos(i * 0.9)); this.s = REV_RATES.map((_, i) => Math.sin(i * 0.9));
    this.scale = REV_SCALE(this.p.rSize); this.wet = 0; this.frz = 0; this.idle = true;
    this.hpL = 0; this.hpR = 0; this.envF = 0; this.envS = 0; this.swell = 1; this.ref = 0; this.swDb = 0;
  }
  set(id, v) { if (id in this.p) this.p[id] = v; }
  reset() { for (const b of this.buf) b.fill(0); this.preL.fill(0); this.preR.fill(0); for (const s of this.ap) for (const a of s) a.b.fill(0); this.lp.fill(0); this.dc.fill(0); this.hpL = this.hpR = 0; this.envF = this.envS = 0; this.swell = 1; this.swDb = 0; }
  read(b, d) {
    const pos = this.w - d, i = Math.floor(pos), f = pos - i, m = this.mask;
    const y0 = b[(i - 1) & m], y1 = b[i & m], y2 = b[(i + 1) & m], y3 = b[(i + 2) & m];
    const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * f + c2) * f + c1) * f + y1;
  }
  process(L, R, n) {
    const p = this.p, ps = this.ps, sr = this.sr;
    const on = p.rMix > 0 || p.rFreeze >= 0.5;
    if (!on && this.wet === 0) { this.idle = true; return; }   // off: untouched, no cost
    if (this.idle) { this.reset(); this.idle = false; }
    const sm = 1 - Math.exp(-1 / (0.02 * sr)), slow = 1 - Math.exp(-1 / (0.6 * sr));
    const mix = Math.max(0, Math.min(1, p.rMix)), frzT = p.rFreeze >= 0.5 ? 1 : 0, fk = 1 / (0.05 * sr);
    // per block: the loop gains from DECAY and DARK at the current size
    ps.rDecay += (p.rDecay - ps.rDecay) * Math.min(1, sm * n); ps.rDark += (p.rDark - ps.rDark) * Math.min(1, sm * n); ps.rGrav += (p.rGrav - ps.rGrav) * Math.min(1, sm * n);
    const rt = REV_RT(ps.rDecay), dark = Math.max(0, Math.min(1, ps.rDark)), rtH = rt * (1 - 0.9 * dark);
    const xk = 1 - Math.exp(-2 * Math.PI * 8000 * Math.pow(0.1, dark) / sr), dck = 2 * Math.PI * 12 / sr, hk = 1 - Math.exp(-2 * Math.PI * 110 / sr);
    const tgtScale = REV_SCALE(p.rSize), g = this.g;
    for (let i = 0; i < 8; i++) { const Ls = REV_LINES[i] * 1e-3 * this.scale * sr; g[i] = Math.pow(10, -3 * Ls / (rt * sr)); g[8 + i] = Math.pow(10, -3 * Ls / (rtH * sr)); }
    const rtE = Math.sqrt(rt * rtH), grav = Math.max(0, Math.min(1, ps.rGrav)), swT = (0.4 + 2.6 * grav) * sr, swk = 1 - Math.exp(-1 / (0.005 * sr)), cutk = 1 - Math.exp(-1 / (0.06 * sr)), ink = REV_IN_G / Math.sqrt(1 + rt / 4);
    const MOD = 0.0016 * sr, raw = this.raw, ap = this.ap, buf = this.buf, y = this.y, lp = this.lp, dc = this.dc, msk = this.mask;
    const rot = REV_RATES.map((r) => [Math.cos(2 * Math.PI * r / sr), Math.sin(2 * Math.PI * r / sr)]);
    for (let s = 0; s < n; s++) {
      this.wet += (mix - this.wet) * sm; if (!on && this.wet < 1e-5) this.wet = 0;
      this.frz += frzT > this.frz ? Math.min(fk, frzT - this.frz) : -Math.min(fk, this.frz - frzT);
      this.scale += (tgtScale - this.scale) * slow;
      const xL = L[s], xR = R[s], fz = this.frz, inG = ink * (1 - fz);
      // GRAVITY: a new note (the input's fast envelope jumping over its slow one) restarts the swell
      const a = Math.abs(xL) + Math.abs(xR);
      this.envF += (a - this.envF) * 0.01; this.envS += (a - this.envS) * 0.0004;
      if (this.envF > 2 * this.envS + 0.02 && this.ref <= 0) { this.swell = 0; this.ref = 0.08 * sr; }
      this.ref--; if (this.swell < 1) this.swell = Math.min(1, this.swell + 1 / swT);
      // pre-delay, then the diffusers
      const preM = this.preL.length - 1; this.preL[this.pw] = xL; this.preR[this.pw] = xR;
      let dL = this.preL[(this.pw - this.pd) & preM], dR = this.preR[(this.pw - this.pd) & preM];
      this.pw = (this.pw + 1) & preM;
      for (let k = 0; k < 4; k++) {
        let q = ap[0][k], o = q.b[q.i], v = dL + 0.62 * o; q.b[q.i] = v; dL = o - 0.62 * v; q.i = q.i + 1 === q.b.length ? 0 : q.i + 1;
        q = ap[1][k]; o = q.b[q.i]; v = dR + 0.62 * o; q.b[q.i] = v; dR = o - 0.62 * v; q.i = q.i + 1 === q.b.length ? 0 : q.i + 1;
      }
      // read the eight lines (each drifting), damp them, mix by Hadamard, write back
      for (let i = 0; i < 8; i++) {
        const c = this.c[i], sn = this.s[i]; this.c[i] = c * rot[i][0] - sn * rot[i][1]; this.s[i] = sn * rot[i][0] + c * rot[i][1];
        const d = REV_LINES[i] * 1e-3 * this.scale * sr + MOD * (1 + sn);
        const v = this.read(buf[i], d); raw[i] = v;
        lp[i] += (v - lp[i]) * xk; const hi = v - lp[i];
        const gl = g[i] + (1 - g[i]) * fz, gh = g[8 + i] + (1 - g[8 + i]) * fz;
        y[i] = gl * lp[i] + gh * hi;
      }
      if ((s & 255) === 0) for (let i = 0; i < 8; i++) { const r = 1 / Math.hypot(this.c[i], this.s[i]); this.c[i] *= r; this.s[i] *= r; }
      // fast 8-point Walsh-Hadamard, scaled to keep energy
      let a0 = y[0] + y[1], a1 = y[0] - y[1], a2 = y[2] + y[3], a3 = y[2] - y[3], a4 = y[4] + y[5], a5 = y[4] - y[5], a6 = y[6] + y[7], a7 = y[6] - y[7];
      let b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3, b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
      const H = 0.35355339059327373, h = [b0 + b4, b1 + b5, b2 + b6, b3 + b7, b0 - b4, b1 - b5, b2 - b6, b3 - b7];
      const w = this.w;
      for (let i = 0; i < 8; i++) {
        let v = h[i] * H + (i & 1 ? dR : dL) * inG * REV_IN[i];
        dc[i] += (v - dc[i]) * dck * (1 - fz); v -= dc[i];                  // keeps DC out of the loop
        const av = v < 0 ? -v : v; if (av > 2) v = (v < 0 ? -1 : 1) * (2 + Math.tanh(av - 2));   // only if something is wrong
        buf[i][w] = v;
      }
      this.w = (w + 1) & msk;
      // out: each side taps all eight lines with its own signs (mostly its own input's lines); low cut on the wet
      let oL = 0, oR = 0; for (let i = 0; i < 8; i++) { oL += REV_TL[i] * raw[i]; oR += REV_TR[i] * raw[i]; }   // taken before the loop gain, so the first pass is heard whatever DECAY
      this.hpL += (oL - this.hpL) * hk; this.hpR += (oR - this.hpR) * hk; oL -= this.hpL; oR -= this.hpR;
      // GRAVITY: during the swell the wet is lifted against the tail's own decay and starts 24 dB down, so it
      // rises; at the end it drops back over about 60 ms, like a reversed tail cut off
      const sT = this.swell < 1 ? grav * Math.min(12, 60 / rtE * this.swell * swT / sr - 24 * (1 - this.swell)) : 0;
      this.swDb += (sT - this.swDb) * (this.swell < 1 ? swk : cutk);
      const sw = this.swDb === 0 ? 1 : Math.pow(10, this.swDb / 20), m = this.wet, dg = Math.min(1, 2 - 2 * m), wg = Math.min(1, 2 * m) * 0.7 * sw;
      L[s] = xL * dg + oL * wg; R[s] = xR * dg + oR * wg;
    }
  }
}

// Passes knob values to the synth engine , the chorus or the echo, so the knob
// sequencer can drive both through the one setParam it knows.
class FxRack {
  constructor(engine, fx, ch, rv) { this.e = engine; this.fx = fx; this.ch = ch; this.rv = rv; }
  setParam(id, v) { if (id in this.fx.p) this.fx.set(id, v); else if (this.ch && id in this.ch.p) this.ch.set(id, v); else if (this.rv && id in this.rv.p) this.rv.set(id, v); else this.e.setParam(id, v); }
  noteOn(n, vel) { this.e.noteOn(n, vel); }
  // the mod sources KnobSeq reads (it holds this rack, not the engine)
  get envN() { return this.e.envN; } get env2N() { return this.e.env2N; } get lfoV() { return this.e.lfoV; } get vel() { return this.e.vel; } get key() { return this.e.key; }
  noteOff(n) { this.e.noteOff(n); }
  allOff() { this.e.allOff(); }
  setPrio(last) { this.e.setPrio(last); }
  setFmMod(on) { this.e.setFmMod(on); }
  setBend(v) { this.e.setBend(v); }
  setModWheel(v) { this.e.setModWheel(v); }
  setBendRange(st) { this.e.setBendRange(st); }
  render(out, n) { this.e.render(out, n); }
}

// Output level for the page (not circuit): RMS of both channels over the
// last 0.2 s, kept as twelve 1/60 s slices so it is a true moving window.
class Level {
  constructor(sr) { this.chunk = Math.round(sr / 60); this.slices = new Float64Array(12); this.counts = new Float64Array(12); this.k = 0; this.acc = 0; this.n = 0; this.rms = 0; }
  // returns true each time a slice completes (about 60 times a second)
  add(L, R, n) {
    let a = 0; for (let i = 0; i < n; i++) a += L[i] * L[i] + R[i] * R[i];
    this.acc += a / 2; this.n += n;
    if (this.n < this.chunk) return false;
    this.slices[this.k] = this.acc; this.counts[this.k] = this.n; this.k = (this.k + 1) % 12; this.acc = 0; this.n = 0;
    let s = 0, c = 0; for (let j = 0; j < 12; j++) { s += this.slices[j]; c += this.counts[j]; }
    this.rms = Math.sqrt(s / Math.max(c, 1)); return true;
  }
}

if (typeof module !== 'undefined') module.exports = { JunoChorus, CH_LFO, CH_DEPTH, CH_DMIN, CH_DMAX, CH_TRIM, TapeEcho, FxRack, Level, SoftClip, ECHO_DEFAULTS, ECHO_DIVS, ECHO_FB_MAX, BlackHole, REV_DEFAULTS, REV_RT };
