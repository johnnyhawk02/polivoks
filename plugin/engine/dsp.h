// ============================================================================
//  FILTH / Polivoks circuit model: C++ port of dsp.js (PolivoksEngine).
//  Line for line the same equations, in the same order, in doubles, with
//  JavaScript's own Math (jsmath.h), so it gives the web app's samples bit
//  for bit.  The comments that explain the circuit live in dsp.js; this file
//  only marks where each piece comes from.  Change dsp.js first, then this,
//  then run plugin/test/null.js.
// ============================================================================
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include "jsmath.h"

namespace filth {

const double K_Q = 8.617333262e-5;
inline double VT_OF(double T) { return K_Q * T; }
const double LN2 = jm::LN2;

inline double clamp(double x, double lo, double hi) { return x < lo ? lo : x > hi ? hi : x; }

inline double rail(double x, double vs) {
  const double r = x / vs, a = r < 0 ? -r : r;
  if (a < 0.7) return x;
  const double a2 = a * a, a4 = a2 * a2, a8 = a4 * a4;
  return x / jm::pow(1 + a8, 0.125);
}

inline double EXP5M1() { static const double v = jm::exp(5) - 1; return v; }
inline double potA(double p, double rmin, double rmax) { return rmin + (rmax - rmin) * (jm::exp(5 * p) - 1) / EXP5M1(); }

struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed) { s = seed ? seed : 0x9e3779b9u; }
  double u() { uint32_t x = s; x ^= x << 13; x ^= x >> 17; x ^= x << 5; s = x; return s / 4294967296.0; }
  double g() { double a = u(); a += u(); a += u(); a += u(); return (a - 2) * 1.7320508; }
};

// ---------------------------------------------------------------- ExpoPair
struct ExpoPair {
  double Iref = 0, rb = 0, VTcal = 0, x = 0;
  ExpoPair() {}
  ExpoPair(double I, double r, double Tcal) : Iref(I), rb(r), VTcal(VT_OF(Tcal)), x(0) {}
  double current(double oct, double T) {
    const double dv = oct * VTcal * LN2;
    const double VT = VT_OF(T), k = rb * Iref;
    double xx = x;
    for (int i = 0; i < 3; i++) {
      const double e = jm::exp(xx);
      const double dx = (VT * xx + k * (e - 1) - dv) / (VT + k * e); xx -= dx;
      if (dx < 1e-12 && dx > -1e-12) break;
    }
    x = xx;
    return Iref * jm::exp(xx);
  }
};

// ---------------------------------------------------------------- VCO
struct VCO {
  double h, C, Vref, vcLow, tDump, tauD, SR7, SR10, GBW2pi, Vsat, Vf, wf, tC8, tC9;
  double Rout[3];
  double vpw = 0, vc = 0, ce = 0; bool dumping = false; double rem = 0, dA = 0;
  double o, dc, tdc, pulse, n10, vplus, S0;
  double mismatch;
  ExpoPair expo;
  double saw = 0, tri = 0, sq = 0;
  double lastI = NAN, lastDV = 0, Ed = 0;

  VCO(double hh, uint32_t seed) : h(hh) {
    C = 5.6e-9;
    Vref = 12.5 * 10 / 12.21;
    vcLow = 1.57; tDump = 0.35e-6; tauD = 0.08e-6; SR7 = 2e6; SR10 = 3e6;
    GBW2pi = 2 * jm::PI * 1e6; Vsat = 11; Vf = 0.6; wf = 0.04;
    tC8 = 30e-6 * 6.8e3; tC9 = 5;
    Rout[0] = 0; Rout[1] = 20e3; Rout[2] = 12e3;
    vpw = 0; vc = 0; ce = 0; dumping = false; rem = 0; dA = 0;
    o = Vref - 5; dc = Vref - 5; tdc = -1.4;
    pulse = -Vsat; n10 = -12; vplus = 0; S0 = 0;
    Rng rng(seed);
    mismatch = (rng.u() - 0.5) * 0.004;
    double I = 2e-5; for (int i = 0; i < 20; i++) I = C * dV(I) * 440;
    const double rb = 1 + (100 + 1e3 * 100 / 1100) / 150;
    expo = ExpoPair(I, rb, 303);
    saw = 0; tri = 0; sq = 0;
  }
  double dV(double I) const { return 7.948 + 35.51 * jm::pow(I, 0.73); }
  void step(double I) {
    const double lo = vcLow, tau = tauD;
    if (I != lastI) { lastI = I; lastDV = dV(I); }
    const double dv = lastDV, hi = lo + dv - I * tDump / C;
    vplus = vpw;
    const double SR = SR7;
    double t = h, acc = 0, v = vc, c = ce; int guard = 0;
    auto climbSpan = [&](double dt) { acc += c * dt - 0.5 * SR * dt * dt; c -= SR * dt; };
    while (t > 1e-14 && guard++ < 24) {
      if (dumping) {
        if (!Ed) Ed = jm::exp(-tDump / tau);
        const double E = Ed, A = dA;
        const double t1 = tDump - rem, dt = jm::min(t, rem), t2 = t1 + dt;
        v = lo + A * (jm::exp(-t2 / tau) - E);
        climbSpan(dt);
        if (c < v) c = v;
        rem -= dt; t -= dt;
        if (rem <= 1e-14) { dumping = false; v = lo; }
      } else {
        const double s = I / C, tc = (hi - v) / s;
        double dt = tc >= t ? t : jm::max(tc, 0);
        if (c > v) {
          const double tm = (c - v) / (s + SR);
          if (tm < dt) dt = tm;
          climbSpan(dt); v += s * dt; t -= dt;
          if (dt == tm) c = v;
        } else {
          acc += v * dt + 0.5 * s * dt * dt; v += s * dt; c = v; t -= dt;
        }
        if (tc <= dt && !dumping && v >= hi - 1e-12) { dumping = true; rem = tDump; dA = (v - lo) / (1 - jm::exp(-tDump / tau)); }
      }
    }
    vc = v; ce = c;
    o = Vref - acc / h;
    dc += (o - dc) * (h / tC8);
    const double S = o - dc;
    saw = S;
    const double a = S < 0 ? -S : S, u = (a - Vf) / wf;
    const double y = -wf * (u > 30 ? u : u < -20 ? 0 : jm::log1p(jm::exp(u)));
    tdc += (y - tdc) * (h / tC9);
    tri = y - tdc;
    const double k = SR10 / GBW2pi, hs = h / 4, s0 = S0;
    double n = n10, pa = 0;
    for (int i = 1; i <= 4; i++) {
      const double vd = vplus - (s0 + (S - s0) * (i - 0.5) / 4);
      const double n0 = n;
      if (!((n == 12 && vd >= 0) || (n == -12 && vd <= 0))) n = clamp(n + hs * SR10 * jm::tanh(vd / k), -12, 12);
      pa += clamp(0.5 * (n0 + n), -Vsat, Vsat);
    }
    n10 = n; S0 = S;
    pulse = pa / 4;
    sq = pulse * 0.4;
  }
  double out(int wave) const { return wave == 0 ? tri : wave == 1 ? saw : sq; }
};

// ---------------------------------------------------------------- VCF
struct K140VCF {
  double h, a3, C1, vos1, vos2, Vs, dsl, y1, y2, wIn, wL, wD;
  explicit K140VCF(double hh) : h(hh) {
    a3 = 1.0 / 48; C1 = 25e-12; vos1 = 0.0021; vos2 = -0.0014; Vs = 11.5; dsl = 0.1;
    y1 = 0; y2 = 0; wIn = 0; wL = 0; wD = 0;
    setRes(0);
  }
  void setRes(double res) {
    const double p = 1 - res, Rth = 100e3 * p * (1 - p);
    const double gIn = 1 / 39e3, gL = 1 / 47e3, gD = 1 / (47e3 + Rth), G = 1 / 1e3 + gIn + gL + gD;
    wIn = gIn / G; wL = gL / G;
    wD = p * gD / G - 0.005 * wL;
  }
  void step(double vin, double I, double VT) {
    const double c = 1 / (4 * VT), g = I / C1, d = dsl;
    const double x = g * c * jm::sqrt(wL * a3) * h, th = x < 1 ? 0.5 : x > 3 ? 1 : 0.25 + 0.25 * x;
    const double h2 = h * th, h1 = h - h2;
    const double Y1 = y1, Y2 = y2, o1 = vos1, o2 = vos2, u = wIn * vin + o1;
    const double ta = jm::tanh((u - wL * Y2 - wD * Y1) * c);
    const double F1n = g * ta * (1 + d * ta);
    const double tb = jm::tanh((a3 * Y1 + o2) * c);
    const double F2n = g * tb * (1 + d * tb);
    double z1 = Y1, z2 = Y2;
    for (int it = 0; it < 4; it++) {
      const double t1 = it == 0 ? ta : jm::tanh((u - wL * z2 - wD * z1) * c);
      const double t2 = it == 0 ? tb : jm::tanh((a3 * z1 + o2) * c);
      const double r1 = z1 - Y1 - h1 * F1n - h2 * g * t1 * (1 + d * t1);
      const double r2 = z2 - Y2 - h1 * F2n - h2 * g * t2 * (1 + d * t2);
      const double s1 = g * (1 - t1 * t1) * (1 + 2 * d * t1) * c, s2 = g * (1 - t2 * t2) * (1 + 2 * d * t2) * c * a3;
      const double j11 = 1 + h2 * s1 * wD, j12 = h2 * s1 * wL, j21 = -h2 * s2;
      const double det = j11 - j12 * j21;
      const double d1 = (r1 - j12 * r2) / det, d2 = (j11 * r2 - j21 * r1) / det;
      z1 -= d1 > 2 ? 2 : d1 < -2 ? -2 : d1;
      z2 -= d2 > 2 ? 2 : d2 < -2 ? -2 : d2;
      if (d1 < 1e-7 && d1 > -1e-7 && d2 < 1e-7 && d2 > -1e-7) break;
    }
    y1 = z1 > Vs ? Vs : z1 < -Vs ? -Vs : z1;
    y2 = z2 > Vs ? Vs : z2 < -Vs ? -Vs : z2;
    if (!(y1 == y1) || !(y2 == y2)) { y1 = 0; y2 = 0; }
  }
};

// ---------------------------------------------------------------- FilterCV
struct FilterCV {
  double Is = 2e-14, beta = 150, R2 = 3e3, x = 0.4;
  double lIin = NAN, lT = NAN, lOut = 0;
  static double wiper(double t, double V, double Rs) { return t * V / (Rs + 100e3 * t * (1 - t)); }
  double iset(double Iin, double T) { if (Iin == lIin && T == lT) return lOut; lIin = Iin; lT = T; return (lOut = solve(Iin, T)); }
  double solve(double Iin, double T) {
    const double VT = VT_OF(T), k = R2 * Is / beta;
    double v = x;
    for (int i = 0; i < 6; i++) {
      const double e = jm::exp(jm::min(v / VT, 60));
      const double dvv = (v - R2 * Iin + k * e) / (1 + k * e / VT); v -= dvv;
      if (dvv < 1e-9 && dvv > -1e-9) break;
    }
    x = v;
    const double Ic = Is * jm::exp(jm::min(v / VT, 60)), Imax = 224e-6;
    return 0.5 * Ic / jm::pow(1 + jm::pow(Ic / Imax, 4), 0.25) + 1e-11;
  }
};

// ---------------------------------------------------------------- EG
struct EG {
  double h, C = 5e-6, Vpk = 6, Vsup = 12.5, v = 0; int stage = 0; double Iw[3] = {1e-6, 1e-6, 1e-6};
  double nVT, Is = 2e-9, Rbleed = 10e6, Vloop = 0.6;
  explicit EG(double hh) : h(hh) { nVT = 1.9 * VT_OF(300); }
  double diodeI(double vd, double R, int w) {
    if (vd <= 0) return 0;
    double I = Iw[w]; if (!(I > 0)) I = vd / R;
    for (int i = 0; i < 4; i++) {
      const double f = I * R + nVT * jm::log(1 + I / Is) - vd;
      const double dI = f / (R + nVT / (Is + I)); I -= dI;
      if (I < 1e-15) I = 1e-15;
      if (dI < 1e-12 * I && dI > -1e-12 * I) break;
    }
    Iw[w] = I; return I;
  }
  double step(bool gate, double Ra, double Rd, double sus, double Rr, bool cycle) {
    const double Vs = sus * Vpk;
    double vv = v;
    if (gate && stage == 0) stage = 1;
    if (!gate) stage = 0;
    if (stage == 1) {
      vv += diodeI(Vsup - vv, Ra, 0) * h / C;
      if (vv >= Vpk) { vv = Vpk; stage = 2; }
    } else if (stage == 2) {
      if (vv > Vs) vv -= diodeI(vv - Vs, Rd, 1) * h / C;
      if (cycle && vv - Vs < Vloop) stage = 1;
    } else {
      vv -= diodeI(vv, Rr, 2) * h / C;
    }
    vv -= vv * h / (Rbleed * C);
    v = vv < 0 ? 0 : vv;
    return v / Vpk;
  }
};

inline double driveGain(double t) { return 1 + potA(t, 0, 150e3) / 22e3; }
inline double mixGain(double t, double Rs) {
  const double Ra = 100e3 * (1 - t) + 1, Rb = 100e3 * t + 1, G = 1 / Rb + 1 / 22e3;
  return 1 / (1 + (Ra + Rs) * G);
}

// ---------------------------------------------------------------- VCA
struct K118Tail {
  double lo, dv; int N;
  std::vector<double> iin, it;
  explicit K118Tail(double r7) {
    const double VT = VT_OF(300.15), Is = 1e-15, bf = 120;
    auto ie = [&](double v) { return Is * (1 + 1 / bf) * jm::exp(v / VT); };
    N = 400; const double l = -1.0, hi = 0.85; lo = l; dv = (hi - l) / (N - 1);
    iin.assign(N, 0); it.assign(N, 0);
    for (int k = 0; k < N; k++) {
      const double vb = l + k * dv;
      double a = -2, b = vb; for (int i = 0; i < 80; i++) { const double m = 0.5 * (a + b); if (m + 1.7e3 * ie(m) > vb) b = m; else a = m; }
      const double Id = jm::max(0, (vb - 0.5 * (a + b)) / 1.7e3);
      a = -13; b = vb;
      for (int i = 0; i < 100; i++) { const double m = 0.5 * (a + b), f = ie(vb - m) - m / 1.8e3 - (r7 ? (m + 12.5) / r7 : 0); if (f > 0) a = m; else b = m; }
      const double Ie = ie(vb - 0.5 * (a + b));
      iin[k] = Id + Ie / (bf + 1); it[k] = Ie * bf / (bf + 1);
    }
  }
  double tail(double V, double R) const {
    int a = 0, b = N - 1;
    auto g = [&](int k) { return lo + k * dv + R * iin[k] - V; };
    if (g(a) >= 0) return 0;
    if (g(b) <= 0) return it[b];
    while (b - a > 1) { const int m = (a + b) >> 1; if (g(m) > 0) b = m; else a = m; }
    const double ga = g(a), gb = g(b), f = ga / (ga - gb);
    return it[a] + f * (it[b] - it[a]);
  }
};
struct VCA {
  double h, VT; K118Tail s1, s2; double I1, I2, k1, k3, vos1, vos2, c1, c3, out, v2 = 0, v4 = 0;
  explicit VCA(double hh) : h(hh), VT(VT_OF(300.15)), s1(27e3), s2(0) {
    I1 = 58e-6; I2 = 0;
    k1 = hh / (10e-6 * 20.2e3);
    k3 = hh / (50e-6 * 10e3);
    vos1 = 0.1e-3; vos2 = 0.2e-3;
    c1 = 0; c3 = 0; out = 0;
  }
  void control(double vmod, double rmod, double venv) {
    I1 = s1.tail(vmod, 100e3 + rmod);
    I2 = s2.tail(venv, 100e3);
  }
  double step(double vin) {
    const double c = 1 / (2 * VT), a = 0.9917;
    c1 += (vin - c1) * k1;
    const double d1 = (vin - c1) / 101 + vos1;
    v2 = rail(200e3 * a * I1 * jm::tanh(d1 * c), 11);
    const double d2 = v2 / 101 + vos2;
    v4 = rail(200e3 * a * I2 * jm::tanh(d2 * c), 11);
    c3 += (v4 - c3) * k3;
    return (out = v4 - c3);
  }
};

// ---------------------------------------------------------------- Modulator
struct Modulator {
  double h, C = 10e-6, Vsat = 10.95, vth = 15.0 / 115, vc = 0, vo, n1 = 0, n2 = 0, ctl = 0, sh = 0, pulse = 0;
  explicit Modulator(double hh) : h(hh) { vo = Vsat; }
  double step(double R, int mode, double noise) {
    const double vo0 = vo;
    vc += (vo0 - vc) * (1 - jm::exp(-h / (R * C)));
    const double th = vo0 * vth;
    if ((vo0 > 0 && vc >= th) || (vo0 < 0 && vc <= th)) {
      vo = -vo0;
      if (vo0 > 0) pulse = 0.2e-3;
    }
    const double C4 = 0.01e-6, C5 = 0.01e-6, R7 = 82e3, R8 = 100e3;
    const double a = h / C4, b = h / C5;
    const double m11 = 1 + a / R7, m12 = a / R7, m21 = b / R7, m22 = 1 + b / R7 + b / R8;
    const double r1 = n1 + a * noise / R7, r2 = n2 + b * noise / R7;
    const double det = m11 * m22 - m12 * m21;
    n1 = (r1 * m22 - m12 * r2) / det; n2 = (m11 * r2 - m21 * r1) / det;
    ctl = rail(57 * n2, 11);
    if (pulse > 0) { sh += (ctl - sh) * (1 - jm::exp(-jm::min(h, pulse) / (300 * 0.22e-6))); pulse -= h; }
    switch (mode) {
      case 0: return vc;
      case 1: return vo > 0 ? (vo - 0.53) * 15 / 115 : 0;
      case 2: return sh;
      default: return ctl;
    }
  }
};

// ---------------------------------------------------------------- Keyboard
struct Keyboard {
  double h; std::vector<int> held;
  double v9 = 0, v12 = 0, d2 = 0, c4 = 0; bool gate = false; double offT = 0;
  double lo = 0, hi = 0; bool last = false; double cv1 = 0, cv2 = 0;
  explicit Keyboard(double hh) : h(hh) { held.reserve(128); }
  static double volts(double n) { return -0.125 * (n - 53); }
  void press(int n) { release(n); held.push_back(n); }
  void release(int n) { for (size_t i = 0; i < held.size(); i++) if (held[i] == n) { held.erase(held.begin() + (long)i); return; } }
  void step(double rGlide, bool twoVoice) {
    const bool keys = !held.empty();
    if (keys) {
      size_t from = 0;
      if (last) { const size_t k = twoVoice ? 2 : 1; from = held.size() > k ? held.size() - k : 0; }
      double l = 1e9, hh = -1e9; for (size_t i = from; i < held.size(); i++) { const double n = held[i]; if (n < l) l = n; if (n > hh) hh = n; }
      lo = l; hi = hh; gate = true; offT = 262e-6;
    } else if (gate) { offT -= h; if (offT <= 0) gate = false; }
    const double C = 0.22e-6, g1 = keys ? 1 / 1e3 : 0, gJ = gate ? 1 / 333.0 : 0, vb = volts(lo);
    const double hs = h / 4, k = C / hs;
    for (int i = 0; i < 4; i++) {
      const double a11 = k + g1 + gJ, a22 = k + gJ, b1 = k * v9 + g1 * vb, b2 = k * v12;
      const double det = a11 * a22 - gJ * gJ;
      v9 = (b1 * a22 + gJ * b2) / det; v12 = (a11 * b2 + gJ * b1) / det;
    }
    const double d = keys ? -0.125 * (hi - lo) : 0;
    d2 += (d - d2) * (1 - jm::exp(-h / 221e-6));
    c4 += (v12 - c4) * (1 - jm::exp(-h / ((1e3 + rGlide) * 0.22e-6)));
    cv1 = c4;
    cv2 = twoVoice ? v12 + d2 : v12;
  }
};

// ---------------------------------------------------------------- knob laws
const double I_OCT = 1.5 / 100e3;
inline double modOct(double a, double v) { return -(a * v) / (47e3 + 100e3 * a * (1 - a)) / I_OCT; }
inline double fmOctPerVolt(double a, bool mod) {
  if (mod) return -a / (47e3 + 100e3 * a * (1 - a)) / I_OCT;
  const double rth = a * 100e3 * (200e3 - a * 100e3) / 200e3; return -(a / 2) / (100e3 + rth) / I_OCT;
}
inline double pitchOct(double d) { const double ad = (1 - d) / 2, rth = 100e3 * ad * (1 - ad); return -(-12.5 + 25 * ad) / (12.5 / I_OCT + rth) / I_OCT; }
inline double vpwOf(double a) { return -12.5 * a * 20e3 / (76e3 + 100e3 * a * (1 - a)); }
inline double bendR(double st) { return 5 / (st / 12 * I_OCT); }
inline double bendOct(double b, double st) { const double ad = (1 - b) / 2, v = -5 + 10 * ad, rth = 10e3 * ad * (1 - ad); return -(v / (bendR(st) + rth)) / I_OCT; }
inline double wheelOct(double a, double v) { return -(a * v) / (470e3 + 100e3 * a * (1 - a)) / I_OCT; }
inline double FINE_R() { return 12.5 / (I_OCT / 12); }
inline double fineOct(double d) { const double ad = (1 - d) / 2, rth = 100e3 * ad * (1 - ad); return -(-12.5 + 25 * ad) / (FINE_R() + rth) / I_OCT; }

// ---------------------------------------------------------------- engine
// knob ids of PARAM_DEFAULTS, in its order
#define FILTH_ENGINE_PARAMS(X) \
  X(power, 0) X(lfoRate, 0.45) X(lfoMode, 0) X(lfoRange, 0) \
  X(phones, 0.6) X(tune, 0) X(glide, 0) X(voice, 1) X(volume, 0.7) X(outSel, 0) \
  X(o1range, 2) X(o1wave, 1) X(o1mod, 0) X(o1fm, 0) X(o1pitch, 0) X(o1pw, 0) X(o1fine, 0) \
  X(o2range, 2) X(o2wave, 2) X(o2mod, 0) X(o2fm, 0) X(o2pitch, 0) X(o2pw, 0) X(o2fine, 0) \
  X(mix1, 0.65) X(mix2, 0.5) X(mixN, 0) X(drive, 0) \
  X(fA, 0.05) X(fD, 0.45) X(fS, 0.3) X(fR, 0.35) X(cutoff, 0.59) X(res, 0.5) X(fMod, 0) X(fEnv, 0.45) X(fMode, 0) X(fEgMode, 0) \
  X(aA, 0.02) X(aD, 0.5) X(aS, 0.7) X(aR, 0.35) X(aEgMode, 0) X(aMod, 0) X(vcaHold, 0)

enum P {
#define X(n, d) P_##n,
  FILTH_ENGINE_PARAMS(X)
#undef X
  P_COUNT
};
inline const char* const* paramNames() {
  static const char* const n[] = {
#define X(n, d) #n,
    FILTH_ENGINE_PARAMS(X)
#undef X
  };
  return n;
}
inline int paramIndex(const std::string& id) { const char* const* n = paramNames(); for (int i = 0; i < P_COUNT; i++) if (id == n[i]) return i; return -1; }
inline double paramDefault(int i) {
  static const double d[] = {
#define X(n, d) d,
    FILTH_ENGINE_PARAMS(X)
#undef X
  };
  return d[i];
}
// SMOOTHED, in dsp.js order
static const int SMOOTHED[] = { P_lfoRate, P_phones, P_tune, P_glide, P_volume, P_o1mod, P_o1fm, P_o2mod, P_o2fm, P_o1pitch, P_o2pitch, P_o1fine, P_o2fine, P_o1pw, P_o2pw, P_mix1, P_mix2, P_mixN, P_drive, P_cutoff, P_res, P_fMod, P_fEnv, P_aMod, P_fS, P_aS };
const int N_SMOOTHED = sizeof(SMOOTHED) / sizeof(SMOOTHED[0]);
inline bool isSmoothed(int i) { for (int j = 0; j < N_SMOOTHED; j++) if (SMOOTHED[j] == i) return true; return false; }

struct Engine {
  double sr; int OS; double fs, hb, ho;
  Rng rng; VCO vco1, vco2; K140VCF vcf; EG egF, egA; Modulator lfo; double nzAvg = 0, lfoV = 0;
  VCA vca; double mixHp = 0; FilterCV fcv;
  double p[P_COUNT], ps[P_COUNT];
  double Tchip = 303; Keyboard kb; double T1 = 303, T2 = 303, drift1 = 0, drift2 = 0, noiseLP = 0, hpY = 0;
  double powerLevel = 0;
  double bend = 0, bendS = 0, modw = 0, modwS = 0, bendSt = 2;
  int firN; std::vector<double> fir, buf; int bi = 0;
  bool unsettled = true, kd = true, fmMod = false;
  bool gate = false; double envN = 0, env2N = 0, iset = 0;
  bool velSet = false; double vel = 1; bool keySet = false; double key = 60;
  struct Kc { double lfoR, rg, fA, fD, fR, aA, aD, aR, tune, p1, p2, pw1, pw2, fmk, fmk2, tc, dg, gn; } K{};
  bool smooth[P_COUNT];

  explicit Engine(double sampleRate)
    : sr(sampleRate), OS(4), fs(sampleRate * 4), hb(1 / sampleRate), ho(1 / (sampleRate * 4)), rng(12345),
      vco1(1 / (sampleRate * 4), 77), vco2(1 / (sampleRate * 4), 991), vcf(1 / (sampleRate * 4)), egF(1 / sampleRate), egA(1 / sampleRate),
      lfo(1 / sampleRate), vca(1 / (sampleRate * 4)), kb(1 / sampleRate) {
    vco1.vc = 3.1; vco2.vc = 7.3;
    for (int i = 0; i < P_COUNT; i++) { p[i] = ps[i] = paramDefault(i); smooth[i] = isSmoothed(i); }
    kb.lo = kb.hi = 57;
    kb.v9 = kb.v12 = kb.c4 = Keyboard::volts(57);
    const int N = 48; const double fc = 0.5 / OS * 0.92; firN = N;
    fir.assign(N, 0); double sum = 0;
    for (int i = 0; i < N; i++) {
      const double m = i - (N - 1) / 2.0;
      const double sinc = m == 0 ? 2 * fc : jm::sin(2 * jm::PI * fc * m) / (jm::PI * m);
      const double w = 0.42 - 0.5 * jm::cos(2 * jm::PI * i / (N - 1)) + 0.08 * jm::cos(4 * jm::PI * i / (N - 1));
      fir[i] = sinc * w; sum += fir[i];
    }
    for (int i = 0; i < N; i++) fir[i] /= sum;
    buf.assign(N * 2, 0); bi = 0;
  }

  double fcHz() const { return iset / (4 * VT_OF(Tchip) * vcf.C1) * jm::sqrt(vcf.wL * vcf.a3) / (2 * jm::PI); }
  void setParam(int id, double v) { if (id < 0 || id >= P_COUNT) return; unsettled = true; kd = true; p[id] = v; if (!smooth[id]) ps[id] = v; }
  void noteOn(int n, double v, bool hasVel = true) { kb.press(n); velSet = true; vel = hasVel ? v : 1; keySet = true; key = n; }
  void noteOff(int n) { kb.release(n); }
  void allOff() { kb.held.clear(); }
  void setPrio(bool l) { kb.last = l; }
  void setFmMod(bool on) { fmMod = on; kd = true; }
  void setBend(double v) { if (v != v) v = 0; bend = jm::max(-1, jm::min(1, v)); }
  void setModWheel(double v) { if (v != v) v = 0; modw = jm::max(0, jm::min(1, v)); }
  void setBendRange(double st) { if (!(st == st) || st == 0) st = 2; bendSt = jm::max(1, jm::min(24, st)); }

  void render(float* out, int n) {
    const int OSn = OS; const double h_o = ho, h_b = hb; const int N = firN;
    const double sm = 1 - jm::exp(-h_b / 0.012), smW = 1 - jm::exp(-h_b / 0.005);
    static const double rangeOct[5] = {-2, -1, 0, 1, 2};
    for (int s = 0; s < n; s++) {
      if (unsettled) {
        bool any = false;
        for (int j = 0; j < N_SMOOTHED; j++) { const int k = SMOOTHED[j]; const double v = ps[k], nv = v + (p[k] - v) * sm; if (nv != v) { ps[k] = nv; any = true; } }
        unsettled = any; if (any) kd = true;
      }
      powerLevel += ((p[P_power] ? 1 : 0) - powerLevel) * (p[P_power] ? 0.0004 : 0.002);
      const bool slow = p[P_lfoRange] >= 0.5;
      lfo.C = slow ? 160e-6 : 10e-6;
      if (kd) {
        K.lfoR = 4.3e3 + potA(1 - ps[P_lfoRate], 0, slow ? 1e6 : 100e3); K.rg = potA(ps[P_glide], 0, 1e6);
        K.fA = potA(p[P_fA], 200, 1e6); K.fD = potA(p[P_fD], 1e3, 2e6); K.fR = potA(p[P_fR], 1e3, 2e6); K.aA = potA(p[P_aA], 200, 1e6); K.aD = potA(p[P_aD], 1e3, 2e6); K.aR = potA(p[P_aR], 1e3, 2e6);
        K.tune = ps[P_tune] * 2 / 12; K.p1 = pitchOct(ps[P_o1pitch]) + fineOct(ps[P_o1fine]); K.p2 = pitchOct(ps[P_o2pitch]) + fineOct(ps[P_o2fine]); K.pw1 = vpwOf(ps[P_o1pw]); K.pw2 = vpwOf(ps[P_o2pw]);
        K.fmk = fmOctPerVolt(ps[P_o1fm], fmMod) * LN2; K.fmk2 = fmOctPerVolt(ps[P_o2fm], fmMod) * LN2; K.tc = (jm::exp(5 * ps[P_cutoff]) - 1) / (jm::exp(5) - 1); K.dg = driveGain(ps[P_drive]); K.gn = mixGain(ps[P_mixN], 0);
        vcf.setRes(ps[P_res]); kd = false;
      }
      const double lfoR = K.lfoR;
      const double lfoOut = lfo.step(lfoR, jm::i32(p[P_lfoMode]), nzAvg);
      lfoV = lfoOut;
      kb.step(K.rg, p[P_voice] >= 0.5);
      gate = kb.gate;
      const double ef = egF.step(gate, K.fA, K.fD, ps[P_fS], K.fR, p[P_fEgMode] >= 0.5);
      envN = ef;
      const double ea = egA.step(gate, K.aA, K.aD, ps[P_aS], K.aR, p[P_aEgMode] >= 0.5);
      env2N = ea;
      drift1 += (rng.g() * 0.02 - drift1 * 1e-4); drift2 += (rng.g() * 0.02 - drift2 * 1e-4);
      T1 = Tchip + clamp(drift1 * 0.01, -0.3, 0.3); T2 = Tchip + clamp(drift2 * 0.01, -0.3, 0.3);
      const double tune = K.tune;
      bendS += (bend - bendS) * smW; modwS += (modw - modwS) * smW;
      const double wheel = bendOct(bendS, bendSt) + wheelOct(modwS, lfoOut);
      const int r1 = jm::i32(p[P_o1range]), r2 = jm::i32(p[P_o2range]);
      const double ro1 = r1 >= 0 && r1 < 5 ? rangeOct[r1] : NAN, ro2 = r2 >= 0 && r2 < 5 ? rangeOct[r2] : NAN;
      const double oct1 = (53 - 69) / 12.0 - kb.cv1 / 1.5 + ro1 + tune + wheel + modOct(ps[P_o1mod], lfoOut) + K.p1 + vco1.mismatch;
      const double oct2 = (53 - 69) / 12.0 - kb.cv2 / 1.5 + ro2 + tune + wheel + modOct(ps[P_o2mod], lfoOut) + K.p2 + vco2.mismatch;
      const double I1b = vco1.expo.current(oct1, T1), I2 = vco2.expo.current(oct2, T2);
      vco1.vpw = K.pw1; vco2.vpw = K.pw2;
      const int w1 = std::min(2, std::max(0, (int)jm::i32(p[P_o1wave]))), w2 = std::min(2, std::max(0, (int)jm::i32(p[P_o2wave])));
      const double fmk = K.fmk, fmk2 = K.fmk2;
      const double tc = K.tc;
      const double vl = lfoOut;
      const double Iin = 12.5 / 100e3 + FilterCV::wiper(tc, 12.5, 47e3)
                + FilterCV::wiper(ps[P_fEnv], ef * egF.Vpk, 100e3) + FilterCV::wiper(ps[P_fMod], vl, 100e3);
      const double Iset = fcv.iset(Iin, Tchip); iset = Iset;
      const double VTf = VT_OF(Tchip);
      const bool lp = p[P_fMode] < 0.5;
      const double venv = (p[P_vcaHold] >= 0.5 ? 1 : ea) * egA.Vpk;
      vca.control(ps[P_aMod] * lfoOut, 100e3 * ps[P_aMod] * (1 - ps[P_aMod]), venv);
      const double g1 = mixGain(ps[P_mix1], vco1.Rout[w1]), g2 = mixGain(ps[P_mix2], vco2.Rout[w2]);
      const double gn = K.gn, dg = K.dg;
      const double nk = 1 - jm::exp(-h_o * 2 * jm::PI * 15000);
      const double kmix = h_o / (0.22e-6 * 39.96e3);
      double nzs = 0;
      for (int o = 0; o < OSn; o++) {
        vco2.step(fmk2 == 0 ? I2 : I2 * jm::exp(fmk2 * vco1.tri));
        const double o2 = vco2.out(w2);
        vco1.step(I1b * jm::exp(fmk * vco2.tri));
        const double o1 = vco1.out(w1);
        noiseLP += (rng.g() * 0.25 * jm::sqrt(1 / (nk * 0.5)) - noiseLP) * nk;
        nzs += noiseLP;
        const double a2 = rail(-(g1 * o1 + g2 * o2 + gn * noiseLP) * dg, 11);
        mixHp += (a2 - mixHp) * kmix;
        vcf.step(a2 - mixHp, Iset, VTf);
        const double vf = lp ? -vcf.y2 : -vcf.y1;
        const double v = vca.step(vf);
        const int i0 = bi;
        buf[i0] = v; buf[i0 + N] = v; bi = (i0 + 1) % N;
      }
      nzAvg = nzs / OSn;
      double acc = 0; const int start = bi;
      for (int i = 0; i < N; i++) acc += fir[i] * buf[start + i];
      hpY = acc;
      const double lvl = p[P_outSel] >= 0.5 ? ps[P_phones] : ps[P_volume];
      double y = hpY * (1.0 / 6) * lvl * lvl * 1.3 * powerLevel / jm::sqrt(dg);
      y = y / jm::sqrt(1 + y * y);
      out[s] = (float)y;
    }
  }
};

}  // namespace filth
