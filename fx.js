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

// Passes knob values to the synth engine , the chorus or the echo, so the knob
// sequencer can drive both through the one setParam it knows.
class FxRack {
  constructor(engine, fx, ch) { this.e = engine; this.fx = fx; this.ch = ch; }
  setParam(id, v) { if (id in this.fx.p) this.fx.set(id, v); else if (this.ch && id in this.ch.p) this.ch.set(id, v); else this.e.setParam(id, v); }
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

if (typeof module !== 'undefined') module.exports = { JunoChorus, CH_LFO, CH_DEPTH, CH_DMIN, CH_DMAX, CH_TRIM, TapeEcho, FxRack, Level, SoftClip, ECHO_DEFAULTS, ECHO_DIVS, ECHO_FB_MAX };
