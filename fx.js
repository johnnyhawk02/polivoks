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
// The synth engine is untouched: this runs on its mono output.
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
  // in: mono synth output (left buffer); writes the stereo result to L and R
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

      const x = L[s], sp = ps.eSpread, fb = ECHO_FB_MAX * Math.min(1, Math.max(0, ps.eFb));
      // ping-pong routing: the dry signal enters on the left (and on the right
      // too as SPREAD comes down); SPREAD of each repeat crosses sides
      let iL = x + fb * ((1 - sp) * yL + sp * yR);
      let iR = x * (1 - sp) + fb * ((1 - sp) * yR + sp * yL);
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
      L[s] = TapeEcho.lim(x * dg + yL * wg);
      R[s] = TapeEcho.lim(x * dg + yR * wg);
    }
  }
  // transparent below 0.7, then a soft knee up to 1
  static lim(x) { const a = x < 0 ? -x : x; if (a <= 0.7) return x; const y = 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3); return x < 0 ? -y : y; }
}

// Passes knob values to the synth engine or to the echo, so the knob
// sequencer can drive both through the one setParam it knows.
class FxRack {
  constructor(engine, fx) { this.e = engine; this.fx = fx; }
  setParam(id, v) { if (id in this.fx.p) this.fx.set(id, v); else this.e.setParam(id, v); }
  noteOn(n) { this.e.noteOn(n); }
  noteOff(n) { this.e.noteOff(n); }
  allOff() { this.e.allOff(); }
  setExt(d) { this.e.setExt(d); }
  render(out, n) { this.e.render(out, n); }
}

if (typeof module !== 'undefined') module.exports = { TapeEcho, FxRack, ECHO_DEFAULTS, ECHO_DIVS, ECHO_FB_MAX };
