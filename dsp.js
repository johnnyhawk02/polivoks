// ============================================================================
//  Polivoks circuit model — DSP core
//  Every block is solved from the equations of its circuit, not from
//  "musical" approximations. Values come from the factory schematics
//  (sheets 1, 3, 5, 7, 8, 9, 10, 11) and the uA776 / К140УД12 datasheet.
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
    this.tC9 = 5;                    // C9 50 µF into the mixer pot (≈100k)
    // Output stages as they meet the mixer pots (open-circuit volts and the
    // resistance behind them): saw = S through R24 20k (≈ ±4 V); triangle =
    // A8 through C9, 0 Ω (≈ 3.4 V p-p); pulse = A10 ±11 V through R35 30k with
    // R36 20k to ground: 0.4·V behind 12k.  R35 is barely legible and R36
    // unreadable on the scan: EST.
    this.Rout = [0, 20e3, 12e3, 12e3];
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
    this.saw = S;
    // A8 precision rectifier: −(|S| − Vf) with a soft knee, then C9
    const a = S < 0 ? -S : S, u = (a - this.Vf) / this.wf;
    const y = -this.wf * (u > 30 ? u : Math.log1p(Math.exp(u)));
    this.tdc += (y - this.tdc) * (h / this.tC9);
    this.tri = y - this.tdc;
    // A10 comparator, slew-limited
    const target = -this.Vsat + 2 * this.Vsat * (low / h), dp = this.SR10 * h;
    this.pulse += clamp(target - this.pulse, -dp, dp);
    this.sq = this.pulse * 0.4;
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
//  Mixer (sheet 9, У6; panel pots on sheet 1).  Each source drives a 100k
//  panel pot (R104 Генер. I, R103 Генер. II, R105 Шум, R106 Внеш.) wired as a
//  divider; the wiper feeds A2's virtual earth through 22k (R7, R17, R8, R9)
//  and R10 22k closes the loop, so each channel is
//      out = −V·W,   W = 1 / (1 + (Ra + Rs)·(1/Rb + 1/22k))
//  with Ra = 100k(1−t), Rb = 100k·t and Rs the source's own resistance
//  (saw R24 20k, triangle 0, pulse R35 30k ∥ R36 20k EST).  Checked against
//  ngspice in spice/mixer/.  A2's output goes through C2 0.22 µF and R85 39k
//  into the filter (≈1 k to ground there): an 18 Hz high-pass.
//  Pot taper: linear (group А) EST.
// ============================================================================
function mixGain(t, Rs) {
  const Ra = 100e3 * (1 - t) + 1, Rb = 100e3 * t + 1, G = 1 / Rb + 1 / 22e3;
  return 1 / (1 + (Ra + Rs) * G);
}

// ============================================================================
//  VCA (sheet 8, У5): two К118УД1Б differential pairs, each followed by a
//  КР140УД8Б that turns the collector currents into a voltage,
//      Vout = 200k · α·Itail · tanh(Vd / 2VT)        (R9 / R20 200k)
//  Stage 1 (A1/A2): filter output via C1 10 µF, R2 20k / R4 200 Ω (÷101);
//  its tail is set from the modulation input (X5 pin 4, R6 100k into pin 12)
//  with R7 27k from the current-source emitter to −12.5 V, so it idles at
//  ≈58 µA, shuts off below −0.4 V and reaches ≈400 µA above +1 V.
//  Stage 2 (A3/A4): A2 output via R13 20k / R16 200 Ω; tail from the envelope
//  (A6, 0…6 V) through R18 100k into the chip's own mirror (R5 1.7k + diode,
//  R2 1.8k): nothing below ≈0.6 V, then ≈9.3 µA per volt.
//  Output through C3 50 µF.  The tail currents come from the chip's
//  datasheet schematic (R1/R3 4k, R2 1.8k, R4 4k, R5 1.7k), solved below;
//  checked against a transistor-level ngspice model in spice/vca/.
//  Transistor IS 1e-15, β 120 EST; offset residual after the factory trims
//  (R1, R14) EST.
// ============================================================================
class K118Tail {
  // r7: external resistor from pin 2 to −12.5 V (stage 1) or 0 (stage 2)
  constructor(r7) {
    const VT = VT_OF(300.15), Is = 1e-15, bf = 120, ie = (v) => Is * (1 + 1 / bf) * Math.exp(v / VT);
    const N = 400, lo = -1.0, hi = 0.85; this.lo = lo; this.dv = (hi - lo) / (N - 1); this.N = N;
    this.iin = new Float64Array(N); this.it = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const vb = lo + k * this.dv;
      // diode-connected transistor + R5 1.7k: vd + 1.7k·Id = vb
      let a = -2, b = vb; for (let i = 0; i < 80; i++) { const m = 0.5 * (a + b); if (m + 1.7e3 * ie(m) > vb) b = m; else a = m; }
      const Id = Math.max(0, (vb - 0.5 * (a + b)) / 1.7e3);
      // current source: emitter node ve, Ie = ie(vb − ve) = ve/1.8k + (ve + 12.5)/r7
      a = -13; b = vb;
      for (let i = 0; i < 100; i++) { const m = 0.5 * (a + b), f = ie(vb - m) - m / 1.8e3 - (r7 ? (m + 12.5) / r7 : 0); if (f > 0) a = m; else b = m; }
      const Ie = ie(vb - 0.5 * (a + b));
      this.iin[k] = Id + Ie / (bf + 1); this.it[k] = Ie * bf / (bf + 1);
    }
  }
  // tail current for a source V behind resistance R driving pin 12
  tail(V, R) {
    let a = 0, b = this.N - 1;
    const g = (k) => this.lo + k * this.dv + R * this.iin[k] - V;
    if (g(a) >= 0) return 0;
    if (g(b) <= 0) return this.it[b];
    while (b - a > 1) { const m = (a + b) >> 1; if (g(m) > 0) b = m; else a = m; }
    const ga = g(a), gb = g(b), f = ga / (ga - gb);
    return this.it[a] + f * (this.it[b] - this.it[a]);
  }
}
class VCA {
  constructor(h) {
    this.h = h; this.VT = VT_OF(300.15);
    this.s1 = new K118Tail(27e3); this.s2 = new K118Tail(0);
    this.I1 = 58e-6; this.I2 = 0;
    this.k1 = h / (10e-6 * 20.2e3);       // C1 into R2 + R4
    this.k3 = h / (50e-6 * 10e3);         // C3 into the volume pot (R112 10k)
    this.vos1 = 0.1e-3; this.vos2 = 0.2e-3;   // residual offsets after trim  EST
    this.c1 = 0; this.c3 = 0; this.out = 0;
  }
  // vmod: Thevenin voltage and resistance at X5 pin 4; venv: A6 output
  control(vmod, rmod, venv) {
    this.I1 = this.s1.tail(vmod, 100e3 + rmod);
    this.I2 = this.s2.tail(venv, 100e3);
  }
  step(vin) {
    const c = 1 / (2 * this.VT), a = 0.9917;  // α = β/(β+1)
    this.c1 += (vin - this.c1) * this.k1;
    const d1 = (vin - this.c1) / 101 + this.vos1;
    const v2 = rail(200e3 * a * this.I1 * Math.tanh(d1 * c), 11);
    const d2 = v2 / 101 + this.vos2;
    const v4 = rail(200e3 * a * this.I2 * Math.tanh(d2 * c), 11);
    this.c3 += (v4 - this.c3) * this.k3;
    this.v2 = v2; this.v4 = v4;
    return (this.out = v4 - this.c3);
  }
}

// ============================================================================
//  Modulator (sheet 10, У7; "Частота" R107 and "Режим" S58 on sheet 1).
//  A5 is a Schmitt trigger (R13 100k / R14 15k: thresholds ±Vsat·15/115) that
//  charges C7 10 µF through R21 4.3k + R107 100k (rheostat), so the
//  "triangle" is an RC ramp between ±1.43 V (A6 buffers it, X7 pin 6) and
//      f = 1 / (2RC·ln((Vsat + Vth)/(Vsat − Vth)))  ≈ 1.9 … 46 Hz.
//  Square (X7 pin 7): V6 + R16 100k / R17 15k + A7, i.e. 0 / +1.36 V.
//  Noise: V1 КТ315Б junction → A1 (×3.5) → A2 (×100), ≈±1.5 V wideband to
//  the mixer (X7 pin 1).  The same noise through C4/R7/C5/R8 and A3 (×57)
//  is the control noise (X7 pin 2), a band around 160 Hz.  A3's output is
//  sampled onto C6 0.22 µF by the КП303В switch V3 for 0.2 ms after each
//  falling edge of A5 (V4 pulse shaper), A4 buffers it (X7 pin 3).
//  Checked against ngspice in spice/lfo/.  Pot taper (log) EST, noise level
//  EST (0.25 V rms at A2: the sheet draws ±1.5 V at both A2 and A3, which the ×20 band gain between them cannot both meet), V3 on-resistance 300 Ω EST, the sampling edge EST.
// ============================================================================
class Modulator {
  constructor(h, rng) {
    this.h = h; this.rng = rng; this.C = 10e-6; this.Vsat = 10.95; this.vth = 15 / 115;
    this.vc = 0; this.vo = this.Vsat;
    this.n1 = 0; this.n2 = 0; this.ctl = 0; this.sh = 0; this.pulse = 0;
    this.wide = 0;
  }
  // noise: the wideband noise (V at A2's output) averaged over this sample
  step(R, mode, noise) {
    const h = this.h, vo = this.vo;
    this.vc += (vo - this.vc) * (1 - Math.exp(-h / (R * this.C)));
    const th = vo * this.vth;
    if ((vo > 0 && this.vc >= th) || (vo < 0 && this.vc <= th)) {
      this.vo = -vo;
      if (vo > 0) this.pulse = 0.2e-3;          // falling edge of A5 → sample
    }
    // C4 / R7 / C5 / R8 ladder (backward Euler), then A3 ×57
    const C4 = 0.01e-6, C5 = 0.01e-6, R7 = 82e3, R8 = 100e3;
    // states: n1 = voltage across C4, n2 = voltage across C5 (= A3 input)
    const a = h / C4, b = h / C5;
    // i7 = (noise − n1 − n2)/R7 ; n1' = i7/C4 ; n2' = (i7 − n2/R8)/C5
    const m11 = 1 + a / R7, m12 = a / R7, m21 = b / R7, m22 = 1 + b / R7 + b / R8;
    const r1 = this.n1 + a * noise / R7, r2 = this.n2 + b * noise / R7;
    const det = m11 * m22 - m12 * m21;
    this.n1 = (r1 * m22 - m12 * r2) / det; this.n2 = (m11 * r2 - m21 * r1) / det;
    this.ctl = rail(57 * this.n2, 11);
    if (this.pulse > 0) { this.sh += (this.ctl - this.sh) * (1 - Math.exp(-Math.min(h, this.pulse) / (300 * 0.22e-6))); this.pulse -= h; }
    switch (mode) {
      case 0: return this.vc;                                          // triangle, A6
      case 1: return this.vo > 0 ? (this.vo - 0.53) * 15 / 115 : 0;    // square, A7 (V6 КД521 ≈0.53 V)
      case 2: return this.sh;                                          // random steps, A4
      default: return this.ctl;                                        // noise, A3
    }
  }
}

// ============================================================================
//  Keyboard (sheet 3, У1, with the key string and panel from sheet 1).
//  The 48 keys tap a string of R1…R47 100 Ω.  R5 10k (0.5 %) from +12.5 V
//  feeds 1.25 mA into the top of the string, which A2 holds at 0 V by
//  sinking the current at the bottom, so key k sits at −0.125·k V
//  (1.5 V/octave, the same scale as the "Регистры" ladder and the 100k CV
//  inputs).  All key contacts share one bus.  Two keys short the string
//  between them, so the bus reads the lower key (voice 1) and the bottom of
//  the string rises by 0.125 V per shorted step; A4 (all 22.1k, C11 0.01 µF)
//  outputs voice 1 − (bottom − its single-key value), i.e. the upper key
//  (voice 2).  A3/R6 trims that offset.
//  Key detect: A1 runs a ≈16…23 kHz pilot (R3 100k / C1 1000 pF, R4/R2
//  hysteresis) into the string through R1 100k; a pressed key puts it on the
//  bus, A6 (×36 through C5) and V1/V2/R20/C10 rectify it and A8 flips
//  ("Имп. запуск": −12 V pressed).  SPICE: gate on within 8…31 µs, off 262 µs
//  after the last key lifts.
//  Track-and-hold: bus → R21 1k → C9 0.22 µF → V6 КП303В (gate bootstrapped by
//  R29 to A7 while a key is down, pulled to −12 V by V7/V3 when not) → C12
//  0.22 µF → A7.  It settles in ≈0.4 ms half-way, 2.3 ms to 1 % (SPICE).
//  With no key down both outputs hold, and since the bottom of the string is
//  back at its single-key value, voice 2 falls to voice 1.
//  Panel: VCO I is always fed through the glide RC (R24 1k + "Глиссандо"
//  R48 1 MΩ rheostat, C4 0.22 µF, A5); S49 gives VCO II voice 1 ("1-ГОЛ.")
//  or voice 2 ("2-ГОЛ."), both without glide.
//  EST: the A2 input wiring (the scan draws it as positive feedback; the
//  stable reading is used, checked in spice/kybd/), КП303В on-resistance
//  333 Ω, key contact resistance, R48 taper (log).
//  Voltages here are string volts; a MIDI note n is key n − 53 (F).
// ============================================================================
class Keyboard {
  constructor(h) {
    this.h = h; this.held = [];
    this.v9 = 0; this.v12 = 0; this.d2 = 0; this.c4 = 0;
    this.gate = false; this.offT = 0;
    this.lo = 0; this.hi = 0;
  }
  static volts(n) { return -0.125 * (n - 53); }
  press(n) { const i = this.held.indexOf(n); if (i >= 0) this.held.splice(i, 1); this.held.push(n); }
  release(n) { const i = this.held.indexOf(n); if (i >= 0) this.held.splice(i, 1); }
  // rGlide: R48 setting in ohms; returns nothing, read cv1 / cv2 / gate
  step(rGlide, twoVoice) {
    const H = this.held, h = this.h, keys = H.length > 0;
    if (keys) {
      let lo = 1e9, hi = -1e9; for (const n of H) { if (n < lo) lo = n; if (n > hi) hi = n; }
      this.lo = lo; this.hi = hi; this.gate = true; this.offT = 262e-6;
    } else if (this.gate) { this.offT -= h; if (this.offT <= 0) this.gate = false; }
    // C9 / V6 / C12, backward Euler in 4 substeps
    const C = 0.22e-6, g1 = keys ? 1 / 1e3 : 0, gJ = this.gate ? 1 / 333 : 0, vb = Keyboard.volts(this.lo);
    const hs = h / 4, k = C / hs;
    for (let i = 0; i < 4; i++) {
      const a11 = k + g1 + gJ, a22 = k + gJ, b1 = k * this.v9 + g1 * vb, b2 = k * this.v12;
      const det = a11 * a22 - gJ * gJ;
      this.v9 = (b1 * a22 + gJ * b2) / det; this.v12 = (a11 * b2 + gJ * b1) / det;
    }
    // A4: the shorted steps come through R11 with C11 across R13 (221 µs)
    const d = keys ? -0.125 * (this.hi - this.lo) : 0;
    this.d2 += (d - this.d2) * (1 - Math.exp(-h / 221e-6));
    // glide: R24 1k + R48 into C4 0.22 µF, A5 follower
    this.c4 += (this.v12 - this.c4) * (1 - Math.exp(-h / ((1e3 + rGlide) * 0.22e-6)));
    this.cv1 = this.c4;
    this.cv2 = twoVoice ? this.v12 + this.d2 : this.v12;
  }
}

// ============================================================================
//  VCO CV summer (sheet 5, A1/A2) and its panel inputs (sheet 1).
//  A2's inverting input (X2 pins 3/4, "Вход эксп.") sums currents; R2 22.1k
//  turns them into the expo drive.  The keyboard and register inputs are
//  100k at 1.5 V/octave, so 15 µA into the node is one octave and positive
//  current lowers the pitch (32' sits at the positive end of the ladder).
//  Checked in spice/vco/summer.cir (summer.js).
//    "Модуляция" R67 / R80 100k: bus on the top, wiper through R62 / R76 47k
//    "Генератор II" (VCO I): VCO II triangle through R64 100k onto R66 100k,
//        wiper through R63* 100k (* = selected on test, EST)
//    "Расстройка" (VCO II): R79 100k across ±12.5 V, wiper through R77 1.0 MΩ
//  Pot tapers linear EST; which way the detune turns is EST (kept sharp to
//  the right).
// ============================================================================
const I_OCT = 1.5 / 100e3;
// wiper at a (0…1 from the ground end) of a 100k pot with v on top, then rs
function modOct(a, v) { return -(a * v) / (47e3 + 100e3 * a * (1 - a)) / I_OCT; }
function fmOctPerVolt(a) { const rth = a * 100e3 * (200e3 - a * 100e3) / 200e3; return -(a / 2) / (100e3 + rth) / I_OCT; }
function detuneOct(d) { const ad = (1 - d) / 2, rth = 100e3 * ad * (1 - ad); return -(-12.5 + 25 * ad) / (1e6 + rth) / I_OCT; }

// ============================================================================
//  Engine
// ============================================================================
const OUT_SCALE = 1 / 6;
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
    this.lfo = new Modulator(hb, new Rng(4242)); this.nzAvg = 0;
    this.vca = new VCA(ho); this.mixHp = 0;
    this.fcv = new FilterCV();
    this.p = Object.assign({}, PARAM_DEFAULTS); this.ps = Object.assign({}, PARAM_DEFAULTS);
    this.Tchip = 303;
    this.kb = new Keyboard(hb); this.kb.lo = this.kb.hi = 57;
    this.kb.v9 = this.kb.v12 = this.kb.c4 = Keyboard.volts(57);
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

  // keys go to the keyboard board; the envelopes follow its gate
  noteOn(n) { this.kb.press(n); }
  noteOff(n) { this.kb.release(n); }
  allOff() { this.kb.held.length = 0; }
  get held() { return this.kb.held; }

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
      //   R21 4.3k + "Частота" R107 100k rheostat; lfo = modulation bus volts
      const lfoR = 4.3e3 + potA(1 - ps.lfoRate, 0, 100e3);
      const lfo = this.lfo.step(lfoR, p.lfoMode | 0, this.nzAvg);

      // keyboard board: gate, track-and-hold, voice 2, glide (sheet 3)
      const kb = this.kb;
      kb.step(potA(ps.glide, 0, 1e6), p.voice >= 0.5);
      this.gate = kb.gate;

      // envelopes
      const ef = this.egF.step(this.gate, potA(p.fA, 200, 1e6), potA(p.fD, 1e3, 2e6), ps.fS, potA(p.fR, 1e3, 2e6), p.fEgMode >= 0.5);
      const ea = this.egA.step(this.gate, potA(p.aA, 200, 1e6), potA(p.aD, 1e3, 2e6), ps.aS, potA(p.aR, 1e3, 2e6), p.aEgMode >= 0.5);

      // slow thermal drift of each expo pair (±0.3 K random walk)
      this.drift1 += (rng.g() * 0.02 - this.drift1 * 1e-4); this.drift2 += (rng.g() * 0.02 - this.drift2 * 1e-4);
      const T1 = this.Tchip + clamp(this.drift1 * 0.01, -0.3, 0.3), T2 = this.Tchip + clamp(this.drift2 * 0.01, -0.3, 0.3);

      // pitch CVs (octaves relative to A4 at 8')
      const tune = ps.tune * 2 / 12;
      //   key CV −1.5 V/oct (key 53 − 69 = −16 semitones at 0 V), summer inputs
      const oct1 = (53 - 69) / 12 - kb.cv1 / 1.5 + rangeOct[p.o1range | 0] + tune + modOct(ps.o1mod, lfo) + vco1.mismatch;
      const oct2 = (53 - 69) / 12 - kb.cv2 / 1.5 + rangeOct[p.o2range | 0] + tune + modOct(ps.o2mod, lfo) + detuneOct(ps.o2detune) + vco2.mismatch;
      const I1b = vco1.expo.current(oct1, T1), I2 = vco2.expo.current(oct2, T2);
      vco1.narrow = p.o1wave === 3; vco2.narrow = p.o2wave === 3;
      const w1 = p.o1wave | 0, w2 = p.o2wave | 0;
      const fmk = fmOctPerVolt(ps.o1fm) * LN2;      // nepers per volt of VCO II triangle

      // filter Iset: currents into A1's summing node (sheet 7 + panel, sheet 11)
      //   cutoff pot log taper EST; amount pots linear EST; modulation bus
      //   from sheet 10 (R91 100k pot → R86 100k)
      const tc = (Math.exp(5 * ps.cutoff) - 1) / (Math.exp(5) - 1);
      const vl = lfo;
      const Iin = 12.5 / 100e3 + FilterCV.wiper(tc, 12.5, 47e3)
                + FilterCV.wiper(ps.fEnv, ef * this.egF.Vpk, 100e3) + FilterCV.wiper(ps.fMod, vl, 100e3);
      const Iset = this.fcv.iset(Iin, this.Tchip);
      vcf.setRes(ps.res);
      const VTf = VT_OF(this.Tchip);
      const lp = p.fMode < 0.5;

      // VCA (sheet 8): stage 1 tail from the "Модуляция" pot (R97 100k) on the
      // modulation bus, stage 2 tail from the envelope (A6, 0…6 V; the
      // hold switch keeps it at the top)
      const venv = (p.vcaHold >= 0.5 ? 1 : ea) * this.egA.Vpk;
      this.vca.control(ps.aMod * lfo, 100e3 * ps.aMod * (1 - ps.aMod), venv);
      // mixer (sheet 9): per-channel gain into A2's virtual earth
      const g1 = mixGain(ps.mix1, vco1.Rout[p.o1wave | 0]), g2 = mixGain(ps.mix2, vco2.Rout[p.o2wave | 0]);
      const gn = mixGain(ps.mixN, 0), ge = mixGain(ps.mixE, 0);
      let ext = 0;
      if (this.ext && ge > 0.001) { ext = this.ext[this.extPos]; if (++this.extPos >= this.ext.length) this.extPos = 0; }   // 1 V peak line level EST

      // modulator noise: A2 bandwidth ≈15 kHz (КР140УД8Б GBW / 101), 0.25 V rms EST
      const nk = 1 - Math.exp(-ho * 2 * Math.PI * 15000);
      const kmix = ho / (0.22e-6 * 39.96e3);      // C2 into R85 + filter input
      let nzs = 0;
      for (let o = 0; o < OS; o++) {
        vco2.step(I2);
        const o2 = vco2.out(w2);
        vco1.step(I1b * Math.exp(fmk * vco2.tri));
        const o1 = vco1.out(w1);
        this.noiseLP += (rng.g() * 0.25 * Math.sqrt(1 / (nk * 0.5)) - this.noiseLP) * nk;
        nzs += this.noiseLP;
        const a2 = rail(-(g1 * o1 + g2 * o2 + gn * this.noiseLP + ge * ext), 11);
        this.mixHp += (a2 - this.mixHp) * kmix;
        vcf.step(a2 - this.mixHp, Iset, VTf);
        const vf = lp ? -vcf.y2 : -vcf.y1;          // both outputs invert
        const vca = this.vca.step(vf);
        const b = this.buf, i0 = this.bi;
        b[i0] = vca; b[i0 + N] = vca; this.bi = (i0 + 1) % N;
      }
      this.nzAvg = nzs / OS;
      // decimate
      let acc = 0; const b = this.buf, start = this.bi;
      for (let i = 0; i < N; i++) acc += fir[i] * b[start + i];
      // VCA output in volts (C3 is inside the VCA model); OUT_SCALE maps the
      // jack voltage to the digital full scale (not a circuit value)
      this.hpY = acc;
      const lvl = p.outSel >= 0.5 ? ps.phones : ps.volume;
      let y = this.hpY * OUT_SCALE * lvl * lvl * 1.3 * this.powerLevel;
      y = y / Math.sqrt(1 + y * y);
      out[s] = y;
      this.scope[this.scopeI] = this.hpY; this.scopeI = (this.scopeI + 1) & 511;
    }
  }
}

if (typeof module !== 'undefined') module.exports = { PolivoksEngine, Keyboard, modOct, fmOctPerVolt, detuneOct, VCO, K140VCF, FilterCV, EG, ExpoPair, VT_OF, VCA, K118Tail, Modulator, mixGain };
