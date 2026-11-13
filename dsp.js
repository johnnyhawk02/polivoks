// ============================================================================
//  Polivoks circuit model — DSP core
//  Every block is solved from the equations of its circuit, not from
//  "musical" approximations. Values come from the factory schematics
//  (sheets 5, 7, 8, 10) and the uA776 / К140УД12 datasheet.
//  Where a value is unreadable or unpublished it is marked EST (estimated).
// ============================================================================

const K_Q = 8.617333262e-5;            // Boltzmann / electron charge  [V/K]
const VT_OF = (T) => K_Q * T;          // thermal voltage kT/q
const LN2 = Math.LN2;

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

// Op-amp output stage: linear until close to the rail, then saturates.
function rail(x, vs) {
  const r = x / vs, a = r < 0 ? -r : r;
  if (a < 0.7) return x;
  const a2 = a * a, a4 = a2 * a2, a8 = a4 * a4;
  return x / Math.pow(1 + a8, 0.125);
}

// Pot tapers ----------------------------------------------------------------
// 'A' (log) taper resistance, p in 0..1
function potA(p, rmin, rmax) { const k = 5; return rmin + (rmax - rmin) * (Math.exp(k * p) - 1) / (Math.exp(k) - 1); }

// Small fast RNG (xorshift32) ------------------------------------------------
class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  u() { let s = this.s; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.s = s >>> 0; return this.s / 4294967296; }
  g() { return (this.u() + this.u() + this.u() + this.u() - 2) * 1.7320508; } // ~N(0,1)
}

// ============================================================================
//  Exponential converter: matched NPN pair (КР198НТ1А) with bulk emitter
//  resistance rb.  ΔVbe = VT·ln(I/Iref) + rb·(I − Iref)   solved by Newton.
//  The divider is calibrated at Tcal; when the chip is at T≠Tcal the scaling
//  drifts exactly as a real uncompensated converter does.
// ============================================================================
class ExpoPair {
  constructor(Iref, rb, Tcal) { this.Iref = Iref; this.rb = rb; this.VTcal = VT_OF(Tcal); this.x = 0; }
  // octaves -> collector current at chip temperature T
  current(oct, T) {
    const dv = oct * this.VTcal * LN2;          // calibrated 1 V/oct divider output
    const VT = VT_OF(T), k = this.rb * this.Iref;
    let x = this.x;
    for (let i = 0; i < 3; i++) {
      const e = Math.exp(x);
      x -= (VT * x + k * (e - 1) - dv) / (VT + k * e);
    }
    this.x = x;
    return this.Iref * Math.exp(x);
  }
}

// ============================================================================
//  VCO (sheet 5, У2/У3).  Transcribed and checked in ngspice (spice/vco/).
//  C5 5600 pF hangs from Vref (A6: 12.5 V·10k/12.21k = 10.24 V) to node X;
//  the expo collector sinks I from X, so X ramps DOWN and the cap voltage
//  vc = Vref − X ramps up.  A7 buffers X (saw test point, 0 … +10 V).
//  Reset: V1 (КТ361Г) + V5 (КТ315Г) form a PNP/NPN latch across C5, gated
//  through V6 by Z (R18/R19 6.19k off Vref).  V7, fed from A7 through R21
//  3.3k, holds Z near 0 V while the ramp is high; near 0.6 V it lets go, Z
//  rises and the latch fires.  The latch dumps C5 to ≈1.6 V in ≈0.35 µs,
//  then A7 slews back up (2 V/µs) and V7 shuts the gate again.
//
//  From the SPICE sweep (spice/vco/sweep.json), the cap swing per cycle,
//  including the dump time and A7's lag at the trigger, is
//      ΔV(I) = 7.948 + 35.51·I^0.73  V      (fit within 0.15 cents, 1 µA–1.3 mA)
//  so the period is C·ΔV(I)/I.  This is the high-note flattening of the core:
//  −2.5 cents at 440 Hz … −13 at 3.5 kHz … −35 at 14 kHz (vs 22 Hz).
//
//  Shapers (sheet 5):
//    saw   A7 out → C8 30 µF / R29 6.8k (AC coupling, 0.2 s)          = S
//    tri   A8 precision rectifier, V3/V4 КД521Б, R28 = R31 = 100k,
//          R27 100k:  out = −(|S| − Vf), flat near S = 0;  C9 50 µF out
//    pulse A10 comparator, S into (−) via R33 20k, (+) to R34 20k / panel
// ============================================================================
class VCO {
  constructor(h, seed) {
    this.h = h;
    this.C = 5.6e-9;                 // C5 5600 pF
    this.Vref = 12.5 * 10 / 12.21;   // A6 output, R15 2.21k / R16 10k
    this.vcLow = 1.57;               // C5 voltage left after the dump (SPICE)
    this.tDump = 0.35e-6;            // latch dump time (SPICE)
    this.tauD = 0.08e-6;             // dump time constant (SPICE)
    this.SR7 = 2e6;                  // A7 КР140УД8Б slew 2 V/µs   EST
    this.SR10 = 3e6;                 // A10 slew                   EST
    this.Vsat = 11;                  // op-amp swing on ±12.5 V
    this.Vf = 0.6; this.wf = 0.04;   // КД521Б drop and knee in A8  EST
    this.tC8 = 30e-6 * 6.8e3;        // C8·R29
    this.tC9 = 5;                    // C9 50 µF into the mixer (load EST 100k)
    // Output levels into the mixer depend on sheet 9 (not transcribed yet);
    // each wave is scaled back to the previous nominal ±5 V so the mixer and
    // filter drive are unchanged.  Circuit levels: saw ≈ 8 V p-p at A7,
    // triangle ≈ 3.4 V p-p at A8, pulse ±11 V at A10.
    this.kSaw = 1.25; this.kTri = 10 / 3.4; this.kSq = 5 / 11;
    this.narrow = false;             // pulse switch: square or narrow pulse
    this.narrowRef = 0.37;           // narrow pulse level, fraction of ΔV below the mean (13 % duty)  EST
    this.vc = 0; this.dumping = false; this.rem = 0; this.dA = 0;
    this.o = this.Vref - 5; this.dc = this.Vref - 5; this.tdc = -1.4;
    this.pulse = -this.Vsat;
    const rng = new Rng(seed);
    this.mismatch = (rng.u() - 0.5) * 0.004;    // pair ΔVbe mismatch in octaves
    // Factory trim: reference current that gives A4 = 440 Hz on this core.
    let I = 2e-5; for (let i = 0; i < 20; i++) I = this.C * this.dV(I) * 440;
    // Expo transistor series resistance seen from the emitter: its bulk RE
    // plus the base-side resistance over β.  The base (A4 pin 11) is fed from
    // R4 1k / R5 100 Ω, i.e. 90.9 Ω.  RE 1 Ω, rbb' 100 Ω, β 150 for the
    // КР198НТ1А are EST (no datasheet values to hand).
    const rb = 1 + (100 + 1e3 * 100 / 1100) / 150;
    this.expo = new ExpoPair(I, rb, 303);
    this.saw = 0; this.tri = 0; this.sq = 0;
  }
  dV(I) { return 7.948 + 35.51 * Math.pow(I, 0.73); }
  step(I) {
    const C = this.C, h = this.h, Vref = this.Vref, lo = this.vcLow, tau = this.tauD;
    const dv = this.dV(I), hi = lo + dv - I * this.tDump / C;
    // comparator level on X: mean of the ramp, or near its bottom (narrow)
    const xr = this.dc - (this.narrow ? this.narrowRef * dv : 0);
    const vr = Vref - xr;                       // same level as cap voltage
    let t = h, acc = 0, low = 0, vc = this.vc, guard = 0;
    while (t > 1e-14 && guard++ < 16) {
      if (this.dumping) {
        // vc = lo + A·(e^(−τd/τ) − E): exponential that lands on lo exactly
        // at the end of the dump
        const E = Math.exp(-this.tDump / tau), A = this.dA;
        const t1 = this.tDump - this.rem, dt = Math.min(t, this.rem), t2 = t1 + dt;
        const e1 = Math.exp(-t1 / tau), e2 = Math.exp(-t2 / tau);
        acc += lo * dt + A * (tau * (e1 - e2) - E * dt);
        const v0 = vc; vc = lo + A * (e2 - E);
        // pulse is high while X < xr, i.e. vc > vr
        if (v0 > vr) low += vc >= vr ? dt : -tau * Math.log((vr - lo) / A + E) - t1;
        this.rem -= dt; t -= dt;
        if (this.rem <= 1e-14) { this.dumping = false; vc = lo; }
      } else {
        const s = I / C, tc = (hi - vc) / s;
        const dt = tc >= t ? t : Math.max(tc, 0);
        if (vc >= vr) low += dt; else { const tx = (vr - vc) / s; if (tx < dt) low += dt - tx; }
        acc += vc * dt + 0.5 * s * dt * dt; vc += s * dt; t -= dt;
        if (tc <= dt) { this.dumping = true; this.rem = this.tDump; this.dA = (vc - lo) / (1 - Math.exp(-this.tDump / tau)); }
      }
    }
    this.vc = vc;
    const x = Vref - acc / h;                   // box-filtered X over the step
    // A7: follower, slew-limited
    const dm = this.SR7 * h;
    this.o += clamp(x - this.o, -dm, dm);
    // C8 / R29 coupling
    this.dc += (this.o - this.dc) * (h / this.tC8);
    const S = this.o - this.dc;
    this.saw = S * this.kSaw;
    // A8 precision rectifier: −(|S| − Vf) with a soft knee, then C9
    const a = S < 0 ? -S : S, u = (a - this.Vf) / this.wf;
    const y = -this.wf * (u > 30 ? u : Math.log1p(Math.exp(u)));
    this.tdc += (y - this.tdc) * (h / this.tC9);
    this.tri = (y - this.tdc) * this.kTri;
    // A10 comparator, slew-limited
    const target = -this.Vsat + 2 * this.Vsat * (low / h), dp = this.SR10 * h;
    this.pulse += clamp(target - this.pulse, -dp, dp);
    this.sq = this.pulse * this.kSq;
  }
  out(wave) { return wave === 0 ? this.tri : wave === 1 ? this.saw : this.sq; }
}

// ============================================================================
//  VCF (sheet 7, У4): two К140УД12 (uA776) programmable op-amps used open-loop.
//  Each is an OTA charging its own internal compensation capacitor C1:
//     dV/dt = (Iset/C1) · tanh( Vdiff / 4VT )
//  (CC–CB input stage Q1–Q4 of the uA776 → 4 junctions → 4VT; tail current
//  = Iset through the Q14/Q15/Q19 loop).  Checked against a transistor-level
//  ngspice model of the SGS-Thomson UA776 schematic (spice/, see README there).
//
//  A2 (inverting input) sums, through a resistor network:
//     mixer  → R85 39k,   LP (A3 out) → R3 47k,   R4 1k to ground,
//     BP (A2 out) → R89 100k pot → wiper → R54 47k   ("Резонанс", sheet 11).
//  Knob up moves the wiper to the ground end, removing the damping.
//  A3 (non-inverting) gets BP through R6 47k / R7 1k.
//  State: y1 = −V(A2) = BP, y2 = −V(A3) = LP (both circuit outputs invert).
//  Solved implicitly (trapezoidal + Newton).
// ============================================================================
class K140VCF {
  constructor(h) {
    this.h = h; this.a3 = 1 / 48;          // R7/(R6+R7)
    this.C1 = 25e-12;          // uA776 C1: fits datasheet SR 0.8 V/µs @15 µA and GBW 0.1 MHz @1.5 µA  EST
    this.vos1 = 0.0021; this.vos2 = -0.0014;   // input offset voltages (datasheet typ 2 mV)
    this.Vs = 11.5;            // output swing on ±12.5 V (datasheet: ±13–14 V on ±15 V)
    // slew asymmetry of the uA776: in the transistor model the output falls
    // ~20 % faster than it rises (0.045 vs 0.037 V/µs at Iset 1 µA).  This
    // rectifies hard-driven signals and shifts LP's DC level.  From SPICE, EST
    this.dsl = 0.1;
    this.y1 = 0; this.y2 = 0;
    this.wIn = 0; this.wL = 0; this.wD = 0;
    this.setRes(0);
  }
  // Resonance network weights at A2's inverting input (exact node equation).
  //   res 0..1 → wiper fraction p = 1 − res (linear taper EST)
  //   excess: negative damping from the op-amps' excess phase, as a fraction
  //   of wL.  SPICE puts the real loop right at the edge at full travel; this
  //   small value lets the last ~0.5 % of the knob self-oscillate.          EST
  setRes(res) {
    const p = 1 - res, Rth = 100e3 * p * (1 - p);
    const gIn = 1 / 39e3, gL = 1 / 47e3, gD = 1 / (47e3 + Rth), G = 1 / 1e3 + gIn + gL + gD;
    this.wIn = gIn / G; this.wL = gL / G;
    this.wD = p * gD / G - 0.005 * this.wL;
  }
  step(vin, I, VT) {
    const h = this.h, c = 1 / (4 * VT), g = I / this.C1, d = this.dsl;
    const wIn = this.wIn, wL = this.wL, wD = this.wD, a3 = this.a3;
    // θ-method: trapezoidal (θ = ½) while the small-signal ω0·h < 1, sliding to
    // backward Euler above, so the >20 kHz range V1 can reach (to ~130 kHz)
    // is damped instead of ringing at Nyquist.
    const x = g * c * Math.sqrt(wL * a3) * h, th = x < 1 ? 0.5 : x > 3 ? 1 : 0.25 + 0.25 * x;
    const h2 = h * th, h1 = h - h2;
    const y1 = this.y1, y2 = this.y2, o1 = this.vos1, o2 = this.vos2, u = wIn * vin + o1;
    // OTA current: Iset·tanh(x), scaled 1±d for the two slew directions
    let t = Math.tanh((u - wL * y2 - wD * y1) * c);
    const F1n = g * t * (1 + d * t);
    t = Math.tanh((a3 * y1 + o2) * c);
    const F2n = g * t * (1 + d * t);
    // Newton from the previous state; steps limited so the saturating tanh
    // can't throw it into a limit cycle when g·h is large
    let z1 = y1, z2 = y2;
    for (let it = 0; it < 4; it++) {
      const t1 = Math.tanh((u - wL * z2 - wD * z1) * c);
      const t2 = Math.tanh((a3 * z1 + o2) * c);
      const r1 = z1 - y1 - h1 * F1n - h2 * g * t1 * (1 + d * t1);
      const r2 = z2 - y2 - h1 * F2n - h2 * g * t2 * (1 + d * t2);
      const s1 = g * (1 - t1 * t1) * (1 + 2 * d * t1) * c, s2 = g * (1 - t2 * t2) * (1 + 2 * d * t2) * c * a3;
      const j11 = 1 + h2 * s1 * wD, j12 = h2 * s1 * wL, j21 = -h2 * s2;
      const det = j11 - j12 * j21;
      const d1 = (r1 - j12 * r2) / det, d2 = (j11 * r2 - j21 * r1) / det;
      z1 -= d1 > 2 ? 2 : d1 < -2 ? -2 : d1;
      z2 -= d2 > 2 ? 2 : d2 < -2 ? -2 : d2;
    }
    const Vs = this.Vs;
    this.y1 = z1 > Vs ? Vs : z1 < -Vs ? -Vs : z1;
    this.y2 = z2 > Vs ? Vs : z2 < -Vs ? -Vs : z2;
    if (!(this.y1 === this.y1) || !(this.y2 === this.y2)) { this.y1 = 0; this.y2 = 0; }
  }
}

// ============================================================================
//  VCF control converter (sheet 7: A1 КР140УД8Б, V1 КТ315Г, R2 3k; panel
//  network sheet 11).  A1 holds V1's base (the summing node) at 0 V and drives
//  the emitter; R2 sits across base–emitter, so
//      Vbe = R2·(Iin − Ic/β),   Ic = Is·exp(Vbe/VT)
//  i.e. the cutoff is exponential in the summed input current
//  (VT·ln2/R2 ≈ 6 µA per octave, uncompensated for temperature).
//  Iin = 12.5 V/R1 100k + cutoff pot R90 → R87 47k + envelope pot R96 →
//        R88 100k + modulation pot R91 → R86 100k.
//  V1's collector feeds both Iset pins through R5/R8 110k; V1 saturates at
//  about 224 µA total (2 × 11.8 V / 110k), which is the top of the range.
// ============================================================================
class FilterCV {
  constructor() { this.Is = 2e-14; this.beta = 150; this.R2 = 3e3; this.x = 0.4; }   // КТ315Г Is, β  EST
  // pot wiper source: fraction t of Vsrc with Thevenin 100k·t(1−t), into Rs
  static wiper(t, V, Rs) { return t * V / (Rs + 100e3 * t * (1 - t)); }
  // returns Iset per op-amp
  iset(Iin, T) {
    const VT = VT_OF(T), R2 = this.R2, k = R2 * this.Is / this.beta;
    let v = this.x;
    for (let i = 0; i < 6; i++) {
      const e = Math.exp(Math.min(v / VT, 60));
      v -= (v - R2 * Iin + k * e) / (1 + k * e / VT);
    }
    this.x = v;
    const Ic = this.Is * Math.exp(Math.min(v / VT, 60)), Imax = 224e-6;
    return 0.5 * Ic / Math.pow(1 + Math.pow(Ic / Imax, 4), 0.25) + 1e-11;
  }
}

// ============================================================================
//  Envelope generator (on the VCF board, sheet 7 — same design used for the
//  VCA): a 5 µF capacitor charged/discharged through the pots and КД521
//  diodes; comparator A5 ends the attack at +6 V.  The diode is solved with
//  the Shockley equation, which gives the real curve shapes and tails.
// ============================================================================
class EG {
  constructor(h) {
    this.h = h; this.C = 5e-6; this.Vpk = 6; this.Vsup = 12.5;
    this.v = 0; this.stage = 0; this.Iw = [1e-6, 1e-6, 1e-6];
    this.nVT = 1.9 * VT_OF(300); this.Is = 2e-9; this.Rbleed = 10e6;
  }
  diodeI(vd, R, w) {
    if (vd <= 0) return 0;
    let I = this.Iw[w]; if (!(I > 0)) I = vd / R;
    for (let i = 0; i < 4; i++) {
      const f = I * R + this.nVT * Math.log(1 + I / this.Is) - vd;
      I -= f / (R + this.nVT / (this.Is + I));
      if (I < 1e-15) I = 1e-15;
    }
    this.Iw[w] = I; return I;
  }
  trigger() { this.stage = 1; }
  step(gate, Ra, Rd, sus, Rr, cycle) {
    const C = this.C, h = this.h, Vs = sus * this.Vpk;
    let v = this.v;
    if (gate && this.stage === 0) this.stage = 1;
    if (!gate) this.stage = 0;
    if (this.stage === 1) {
      v += this.diodeI(this.Vsup - v, Ra, 0) * h / C;
      if (v >= this.Vpk) { v = this.Vpk; this.stage = 2; }
    } else if (this.stage === 2) {
      if (v > Vs) v -= this.diodeI(v - Vs, Rd, 1) * h / C;
      if (cycle && v - Vs < 0.03 * this.Vpk) this.stage = 1;
    } else {
      v -= this.diodeI(v, Rr, 2) * h / C;
    }
    v -= v * h / (this.Rbleed * C);
    this.v = v < 0 ? 0 : v;
    return this.v / this.Vpk;
  }
}

// ============================================================================
//  Modulator (sheet 10): op-amp integrator + Schmitt comparator.
//  Triangle ±5 V, square ±11 V, f = 1/(4RC·Vth/Vsat).
//  Extra modes: sample&hold of the noise source clocked by the square, and
//  filtered noise.
// ============================================================================
class LFO {
  constructor(h, rng) { this.h = h; this.C = 1e-6; this.vt = 0; this.vs = 11; this.Vth = 5; this.sh = 0; this.nz = 0; this.rng = rng; }
  step(R, mode) {
    this.vt -= this.vs * this.h / (R * this.C);
    if (this.vt > this.Vth && this.vs < 0) { this.vs = 11; this.vt = this.Vth; }
    else if (this.vt < -this.Vth && this.vs > 0) { this.vs = -11; this.vt = -this.Vth; this.sh = clamp(this.rng.g() * 0.5, -1, 1); }
    const fc = 11 / (20 * R * this.C) * 6;
    this.nz += (this.rng.g() * 1.6 - this.nz) * Math.min(1, 6.283 * fc * this.h);
    switch (mode) {
      case 0: return -this.vt / 5;
      case 1: return this.vs / 11;
      case 2: return this.sh;
      default: return clamp(this.nz, -1, 1);
    }
  }
}

// ============================================================================
//  Engine
// ============================================================================
const PARAM_DEFAULTS = {
  power: 0,
  lfoRate: 0.45, lfoMode: 0,
  phones: 0.6, tune: 0, glide: 0, voice: 1, volume: 0.7, outSel: 0,
  o1range: 2, o1wave: 1, o1mod: 0, o1fm: 0,
  o2range: 2, o2wave: 2, o2mod: 0, o2detune: 0.0,
  mix1: 0.65, mix2: 0.5, mixN: 0, mixE: 0,
  fA: 0.05, fD: 0.45, fS: 0.3, fR: 0.35, cutoff: 0.59, res: 0.5, fMod: 0, fEnv: 0.45, fMode: 0, fEgMode: 0,
  aA: 0.02, aD: 0.5, aS: 0.7, aR: 0.35, aEgMode: 0, aMod: 0, vcaHold: 0,
};
const SMOOTHED = ['lfoRate','phones','tune','glide','volume','o1mod','o1fm','o2mod','o2detune','mix1','mix2','mixN','mixE','cutoff','res','fMod','fEnv','aMod','fS','aS'];

class PolivoksEngine {
  constructor(sr) {
    this.sr = sr; this.OS = 4; this.fs = sr * this.OS;
    const hb = 1 / sr, ho = 1 / this.fs; this.hb = hb; this.ho = ho;
    this.rng = new Rng(12345);
    this.vco1 = new VCO(ho, 77); this.vco2 = new VCO(ho, 991);
    this.vco1.vc = 3.1; this.vco2.vc = 7.3;
    this.vcf = new K140VCF(ho);
    this.egF = new EG(hb); this.egA = new EG(hb);
    this.lfo = new LFO(hb, new Rng(4242));
    this.fcv = new FilterCV();
    this.p = Object.assign({}, PARAM_DEFAULTS); this.ps = Object.assign({}, PARAM_DEFAULTS);
    this.Tchip = 303;
    this.held = []; this.gate = false; this.n1 = 57; this.n2 = 57;
    this.cv1 = 57; this.cv2 = 57;
    this.T1 = 303; this.T2 = 303; this.drift1 = 0; this.drift2 = 0;
    this.noiseLP = 0;
    this.hpX = 0; this.hpY = 0; this.vcaHpX = 0; this.vcaHpY = 0;
    this.ext = null; this.extPos = 0;
    this.lastVal = 0;
    this.powerLevel = 0;
    // decimation FIR (Blackman windowed sinc)
    const N = 48, fc = 0.5 / this.OS * 0.92; this.firN = N;
    this.fir = new Float64Array(N); let sum = 0;
    for (let i = 0; i < N; i++) {
      const m = i - (N - 1) / 2;
      const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
      const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (N - 1));
      this.fir[i] = sinc * w; sum += this.fir[i];
    }
    for (let i = 0; i < N; i++) this.fir[i] /= sum;
    this.buf = new Float64Array(N * 2); this.bi = 0;
    this.scope = new Float32Array(512); this.scopeI = 0;
  }

  setParam(id, v) { if (id in this.p) { this.p[id] = v; if (SMOOTHED.indexOf(id) < 0) this.ps[id] = v; } }
  setExt(data) { this.ext = data; this.extPos = 0; }

  // Keyboard assignment: 1-ГОЛ → both VCOs follow the last key;
  // 2-ГОЛ → Generator I takes the lowest held key, Generator II the highest.
  assign() {
    const H = this.held;
    if (!H.length) { this.gate = false; return; }
    this.gate = true;
    if (this.p.voice >= 0.5) {
      let lo = 1e9, hi = -1e9; for (const n of H) { if (n < lo) lo = n; if (n > hi) hi = n; }
      this.n1 = lo; this.n2 = hi;
    } else { this.n1 = this.n2 = H[H.length - 1]; }
  }
  noteOn(n) { const i = this.held.indexOf(n); if (i >= 0) this.held.splice(i, 1); this.held.push(n); this.assign(); this.egF.trigger(); this.egA.trigger(); }
  noteOff(n) { const i = this.held.indexOf(n); if (i >= 0) this.held.splice(i, 1); this.assign(); }
  allOff() { this.held.length = 0; this.assign(); }

  render(out, n) {
    const p = this.p, ps = this.ps, OS = this.OS, ho = this.ho, hb = this.hb;
    const vco1 = this.vco1, vco2 = this.vco2, vcf = this.vcf, rng = this.rng, fir = this.fir, N = this.firN;
    const sm = 1 - Math.exp(-hb / 0.012);
    const rangeOct = [-2, -1, 0, 1, 2];
    for (let s = 0; s < n; s++) {
      for (let j = 0; j < SMOOTHED.length; j++) { const k = SMOOTHED[j]; ps[k] += (p[k] - ps[k]) * sm; }
      // power supply ramps like rail capacitors charging
      this.powerLevel += ((p.power ? 1 : 0) - this.powerLevel) * (p.power ? 0.0004 : 0.002);

      // modulator
      const lfoR = potA(1 - ps.lfoRate, 10e3, 2.2e6);
      const lfo = this.lfo.step(lfoR, p.lfoMode | 0);

      // glide: RC lag on the key CV (R = pot, C = 0.47 µF)
      const tg = potA(ps.glide, 100, 2.2e6) * 0.47e-6;
      const gk = 1 - Math.exp(-hb / tg);
      this.cv1 += (this.n1 - this.cv1) * gk; this.cv2 += (this.n2 - this.cv2) * gk;

      // envelopes
      const ef = this.egF.step(this.gate, potA(p.fA, 200, 1e6), potA(p.fD, 1e3, 2e6), ps.fS, potA(p.fR, 1e3, 2e6), p.fEgMode >= 0.5);
      const ea = this.egA.step(this.gate, potA(p.aA, 200, 1e6), potA(p.aD, 1e3, 2e6), ps.aS, potA(p.aR, 1e3, 2e6), p.aEgMode >= 0.5);

      // slow thermal drift of each expo pair (±0.3 K random walk)
      this.drift1 += (rng.g() * 0.02 - this.drift1 * 1e-4); this.drift2 += (rng.g() * 0.02 - this.drift2 * 1e-4);
      const T1 = this.Tchip + clamp(this.drift1 * 0.01, -0.3, 0.3), T2 = this.Tchip + clamp(this.drift2 * 0.01, -0.3, 0.3);

      // pitch CVs (octaves relative to A4 at 8')
      const tune = ps.tune * 2 / 12;
      const oct1 = (this.cv1 - 69) / 12 + rangeOct[p.o1range | 0] + tune + lfo * ps.o1mod * ps.o1mod + vco1.mismatch;
      const oct2 = (this.cv2 - 69) / 12 + rangeOct[p.o2range | 0] + tune + lfo * ps.o2mod * ps.o2mod + ps.o2detune * 7 / 12 + vco2.mismatch;
      const I1b = vco1.expo.current(oct1, T1), I2 = vco2.expo.current(oct2, T2);
      vco1.narrow = p.o1wave === 3; vco2.narrow = p.o2wave === 3;
      const w1 = p.o1wave | 0, w2 = p.o2wave | 0;
      const fmk = ps.o1fm * ps.o1fm * 2 * LN2 / 5;

      // filter Iset: currents into A1's summing node (sheet 7 + panel, sheet 11)
      //   cutoff pot log taper EST; amount pots linear EST; LFO bus level EST
      const tc = (Math.exp(5 * ps.cutoff) - 1) / (Math.exp(5) - 1);
      const vl = lfo * ((p.lfoMode | 0) === 1 ? 11 : 5);
      const Iin = 12.5 / 100e3 + FilterCV.wiper(tc, 12.5, 47e3)
                + FilterCV.wiper(ps.fEnv, ef * this.egF.Vpk, 100e3) + FilterCV.wiper(ps.fMod, vl, 100e3);
      const Iset = this.fcv.iset(Iin, this.Tchip);
      vcf.setRes(ps.res);
      const VTf = VT_OF(this.Tchip);
      const lp = p.fMode < 0.5;

      // VCA: differential pair, tail current from EG (or held open)
      let env = p.vcaHold >= 0.5 ? 1 : ea;
      env *= Math.max(0, 1 + lfo * ps.aMod * 0.9);
      const g1 = ps.mix1 * ps.mix1 * 1.6, g2 = ps.mix2 * ps.mix2 * 1.6, gn = ps.mixN * ps.mixN * 1.4, ge = ps.mixE * ps.mixE * 3;
      let ext = 0;
      if (this.ext && ge > 0) { ext = this.ext[this.extPos] * 5; if (++this.extPos >= this.ext.length) this.extPos = 0; }

      const nk = 1 - Math.exp(-ho * 2 * Math.PI * 12000);
      const vcaAtt = 0.005 / (2 * VT_OF(300));
      for (let o = 0; o < OS; o++) {
        vco2.step(I2);
        const o2 = vco2.out(w2);
        vco1.step(I1b * Math.exp(fmk * vco2.tri));
        const o1 = vco1.out(w1);
        this.noiseLP += (rng.g() * 3.2 - this.noiseLP) * nk;
        const vmix = rail(g1 * o1 + g2 * o2 + gn * this.noiseLP + ge * ext, 11);
        vcf.step(vmix, Iset, VTf);
        const vf = lp ? -vcf.y2 : -vcf.y1;          // both outputs invert
        const vca = env * Math.tanh(vf * vcaAtt) * 1.05 + env * 0.004; // + CV bleed (pair mismatch)
        const b = this.buf, i0 = this.bi;
        b[i0] = vca; b[i0 + N] = vca; this.bi = (i0 + 1) % N;
      }
      // decimate
      let acc = 0; const b = this.buf, start = this.bi;
      for (let i = 0; i < N; i++) acc += fir[i] * b[start + i];
      // output coupling capacitor (≈1.6 Hz HPF)
      const hpk = 1 - 2 * Math.PI * 1.6 * hb;
      this.hpY = hpk * (this.hpY + acc - this.hpX); this.hpX = acc;
      const lvl = p.outSel >= 0.5 ? ps.phones : ps.volume;
      let y = this.hpY * lvl * lvl * 1.3 * this.powerLevel;
      y = y / Math.sqrt(1 + y * y);
      out[s] = y;
      this.scope[this.scopeI] = this.hpY; this.scopeI = (this.scopeI + 1) & 511;
    }
  }
}

if (typeof module !== 'undefined') module.exports = { PolivoksEngine, VCO, K140VCF, FilterCV, EG, ExpoPair, VT_OF };
