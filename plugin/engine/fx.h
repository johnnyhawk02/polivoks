// ============================================================================
//  FILTH effects: C++ port of fx.js (TapeEcho, SoftClip, JunoChorus,
//  BlackHole, Level), same equations and order, float32 buffers where the JS
//  uses Float32Array.  The explanations are in fx.js.
// ============================================================================
#pragma once
#include <cstdint>
#include <vector>
#include "jsmath.h"

namespace filth {

inline uint32_t xorshift(uint32_t& s) { uint32_t x = s; x ^= x << 13; x ^= x >> 17; x ^= x << 5; s = x; return s; }

// ---------------------------------------------------------------- echo
enum EchoP { E_eTime, E_eFb, E_eTone, E_eMix, E_eSpread, E_eSync, E_COUNT };
static const double ECHO_DEFAULTS[E_COUNT] = {0.5, 0.35, 0.45, 0.25, 0.8, 1};
static const double ECHO_DIVS[7] = {1, 4.0 / 3, 2, 3, 4, 6, 8};
const double ECHO_FB_MAX = 0.94;

struct SoftClipF {
  static double lim(double x) { const double a = x < 0 ? -x : x; if (a <= 0.7) return x; const double y = 0.7 + 0.3 * jm::tanh((a - 0.7) / 0.3); return x < 0 ? -y : y; }
};

struct TapeEcho {
  double sr; int size, mask; std::vector<float> bL, bR; int w = 0;
  double p[E_COUNT], ps[E_COUNT];
  double bpm = 120, d;
  double lpL = 0, lpR = 0, lp2L = 0, lp2R = 0, hpL = 0, hpR = 0, yL = 0, yR = 0;
  double ph[4] = {0, 0.37, 0.11, 0.6};
  uint32_t rs = 0x2545f491u; double drift = 0, driftT = 0;
  explicit TapeEcho(double sampleRate) : sr(sampleRate) {
    size = 1 << (int)jm::ceil(jm::log2(sr * 4 + 8)); mask = size - 1;
    bL.assign(size, 0.f); bR.assign(size, 0.f);
    for (int i = 0; i < E_COUNT; i++) p[i] = ps[i] = ECHO_DEFAULTS[i];
    d = target();
  }
  void set(int id, double v) { p[id] = v; if (id == E_eSync) ps[id] = v; }
  double target() const {
    const double u = jm::max(0, jm::min(1, p[E_eTime]));
    double s;
    if (p[E_eSync] >= 0.5) s = ECHO_DIVS[(int)jm::min(6, jm::round(u * 6))] * 15 / bpm;
    else s = 0.04 * jm::pow(30, u);
    return jm::max(0.01, jm::min(3.6, s)) * sr;
  }
  double rnd() { xorshift(rs); return rs / 4294967296.0 - 0.5; }
  double read(const std::vector<float>& b, double dd) const {
    const double pos = w - dd, fi = jm::floor(pos), f = pos - fi; const int i = (int)fi, m = mask;
    const double y0 = b[(i - 1) & m], y1 = b[i & m], y2 = b[(i + 1) & m], y3 = b[(i + 2) & m];
    const double c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * f + c2) * f + c1) * f + y1;
  }
  void process(float* L, float* R, int n) {
    const double sm = 1 - jm::exp(-1 / (0.02 * sr));
    const double glide = 1 - jm::exp(-1 / (0.12 * sr));
    const double tgt = target();
    const double hpk = 1 - jm::exp(-2 * jm::PI * 90 / sr);
    const double TW = 2 * jm::PI / sr;
    for (int s = 0; s < n; s++) {
      ps[E_eFb] += (p[E_eFb] - ps[E_eFb]) * sm; ps[E_eTone] += (p[E_eTone] - ps[E_eTone]) * sm;
      ps[E_eMix] += (p[E_eMix] - ps[E_eMix]) * sm; ps[E_eSpread] += (p[E_eSpread] - ps[E_eSpread]) * sm;
      d += (tgt - d) * glide;
      ph[0] += 0.53 * TW; ph[1] += 0.61 * TW; ph[2] += 6.3 * TW; ph[3] += 6.9 * TW;
      if (ph[0] > 6.2832) { ph[0] -= 6.2832; } if (ph[1] > 6.2832) ph[1] -= 6.2832;
      if (ph[2] > 6.2832) ph[2] -= 6.2832; if (ph[3] > 6.2832) ph[3] -= 6.2832;
      if (--driftT <= 0) { driftT = 64; drift += (rnd() * 0.6 - drift * 0.002); }
      const double dr = drift * 0.00002 * sr;
      const double wL = (0.0009 * jm::sin(ph[0]) + 0.00007 * jm::sin(ph[2])) * sr + dr;
      const double wR = (0.0009 * jm::sin(ph[1]) + 0.00007 * jm::sin(ph[3])) * sr - dr;
      const double dL = jm::max(4, d + wL), dR = jm::max(4, d + wR);
      const double yl = read(bL, dL), yr = read(bR, dR);
      const double x = L[s], xR = R[s], sp = ps[E_eSpread], fb = ECHO_FB_MAX * jm::min(1, jm::max(0, ps[E_eFb]));
      double iL = x + fb * ((1 - sp) * yl + sp * yr);
      double iR = xR * (1 - sp) + fb * ((1 - sp) * yr + sp * yl);
      const double fc = 650 * jm::pow(2, 4.2 * jm::min(1, jm::max(0, ps[E_eTone])));
      const double lk = 1 - jm::exp(-TW * fc);
      lpL += (iL - lpL) * lk; lp2L += (lpL - lp2L) * lk;
      lpR += (iR - lpR) * lk; lp2R += (lpR - lp2R) * lk;
      hpL += (lp2L - hpL) * hpk; hpR += (lp2R - hpR) * hpk;
      iL = lp2L - hpL; iR = lp2R - hpR;
      bL[w] = (float)(jm::tanh(iL * 1.25 + 0.04) / 1.25 - 0.032);
      bR[w] = (float)(jm::tanh(iR * 1.25 + 0.04) / 1.25 - 0.032);
      w = (w + 1) & mask;
      const double m = jm::min(1, jm::max(0, ps[E_eMix])), dg = jm::min(1, 2 - 2 * m), wg = jm::min(1, 2 * m);
      L[s] = (float)(x * dg + yl * wg);
      R[s] = (float)(xR * dg + yr * wg);
    }
  }
};

struct SoftClip {
  double hit = 0;
  void process(float* L, float* R, int n) {
    double pk = 0;
    for (int i = 0; i < n; i++) {
      const double a = L[i] < 0 ? -(double)L[i] : (double)L[i], b = R[i] < 0 ? -(double)R[i] : (double)R[i];
      if (a > pk) pk = a; if (b > pk) pk = b;
      L[i] = (float)SoftClipF::lim(L[i]); R[i] = (float)SoftClipF::lim(R[i]);
    }
    if (pk > 0.7) hit = jm::max(hit, jm::min(1, (pk - 0.7) / 0.5));
  }
  double read() { const double h = hit; hit = 0; return h; }
};

// ---------------------------------------------------------------- chorus
static const double CH_LFO[4] = {0, 0.5, 0.8, 9.75};
static const double CH_DEPTH[4] = {0, 1, 1, 0.08};
const double CH_DMIN = 1.66e-3, CH_DMAX = 5.35e-3;
const int CH_STAGES = 256; const double CH_FC = 9000, CH_NOISE = 1.6e-4, CH_TRIM = 0.72;

struct Biquad2 {
  double b0, b1, a1, a2, z1 = 0, z2 = 0;
  Biquad2(double fc, double sr) {
    const double k = jm::tan(jm::PI * fc / sr), q = jm::SQRT1_2, n = 1 / (1 + k / q + k * k);
    b0 = k * k * n; b1 = 2 * b0; a1 = 2 * (k * k - 1) * n; a2 = (1 - k / q + k * k) * n;
  }
  double run(double x) { const double y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b0 * x - a2 * y; return y; }
  void reset() { z1 = z2 = 0; }
};
struct BBD {
  int N; std::vector<float> buf; int i = 0; double ph = 0, hold = 0; Biquad2 pre, post; double xp = 0;
  explicit BBD(double sr) : N(CH_STAGES / 2), buf(CH_STAGES / 2, 0.f), pre(CH_FC, sr), post(CH_FC, sr) {}
  void reset() { std::fill(buf.begin(), buf.end(), 0.f); i = 0; ph = 0; hold = 0; xp = 0; pre.reset(); post.reset(); }
  double step(double x, double inc, double noise) {
    const double a = pre.run(x), a0 = xp; xp = a;
    double p = ph + inc, acc = 0, t0 = 0;
    while (p >= 1) {
      p -= 1; const double t = 1 - p / inc;
      acc += hold * (t - t0); t0 = t;
      const double v = a0 + (a - a0) * t;
      hold = buf[i];
      buf[i] = (float)(v > 1.5 || v < -1.5 ? 1.5 * jm::tanh(v / 1.5) : v);
      i = i + 1 == N ? 0 : i + 1;
    }
    ph = p; acc += hold * (1 - t0);
    return post.run(acc + noise);
  }
};
struct JunoChorus {
  double sr; int chorus = 0; int mode = 0; BBD l1, l2; double lph = 0, g = 0; uint32_t rs = 0x1234567u;
  explicit JunoChorus(double sampleRate) : sr(sampleRate), l1(sampleRate), l2(sampleRate) {}
  void set(double v) { chorus = (int)jm::max(0, jm::min(3, jm::round(v))); }
  double rnd() { xorshift(rs); return rs / 4294967296.0 - 0.5; }
  void process(float* L, float* R, int n) {
    const int want = chorus;
    if (want == 0 && g == 0) { for (int i = 0; i < n; i++) R[i] = L[i]; return; }
    if (want != 0) { if (g == 0) { l1.reset(); l2.reset(); } mode = want; }
    const int m = mode; const double fl = CH_LFO[m] / sr, dep = CH_DEPTH[m]; const bool inv = m != 3;
    const double mid = (CH_DMIN + CH_DMAX) / 2, half = (CH_DMAX - CH_DMIN) / 2 * dep; const int N = CH_STAGES / 2;
    const double gT = want ? 1 : 0, gk = 1 / (0.005 * sr), nz = CH_NOISE * 3.4641;
    for (int s = 0; s < n; s++) {
      double p = lph + fl; if (p >= 1) p -= 1; lph = p;
      const double lf = m == 3 ? jm::sin(2 * jm::PI * p) : (p < 0.5 ? 4 * p - 1 : 3 - 4 * p);
      const double d1 = mid + half * lf, d2 = mid + half * (inv ? -lf : lf);
      const double x = L[s];
      const double w1 = l1.step(x, N / (d1 * sr), nz * rnd());
      const double w2 = l2.step(x, N / (d2 * sr), nz * rnd());
      g += gT > g ? jm::min(gk, gT - g) : -jm::min(gk, g - gT);
      const double gg = g, t = 1 + (CH_TRIM - 1) * gg;
      L[s] = (float)((x + gg * w1) * t); R[s] = (float)((x + gg * w2) * t);
    }
  }
};

// ---------------------------------------------------------------- reverb
enum RevP { R_rSize, R_rDecay, R_rGrav, R_rDark, R_rMix, R_rFreeze, R_COUNT };
static const double REV_DEFAULTS[R_COUNT] = {0.6, 0.5, 0, 0.6, 0, 0};
static const double REV_LINES[8] = {57.3, 71.1, 89.7, 103.9, 131.3, 149.1, 173.9, 199.7};
static const double REV_DIFF[2][4] = {{4.71, 3.59, 12.73, 9.31}, {5.27, 3.11, 13.69, 8.43}};
static const double REV_RATES[8] = {0.071, 0.093, 0.117, 0.139, 0.163, 0.199, 0.241, 0.297};
const double REV_IN_G = 3;
static const double REV_IN[8] = {1, 1, -1, 1, 1, -1, 1, -1};
static const double REV_TL0[8] = {1, 0.3, -1, 0.3, 1, -0.3, 1, 0.3}, REV_TR0[8] = {0.3, 1, -0.3, 1, 0.3, -1, -0.3, -1};
inline double REV_RT(double u) { return 0.5 * jm::pow(120, jm::max(0, jm::min(1, u))); }
inline double REV_SCALE(double u) { return 0.35 + 4.65 * jm::pow(jm::max(0, jm::min(1, u)), 1.5); }

struct BlackHole {
  struct AP { std::vector<float> b; int i = 0; };
  double sr; double p[R_COUNT], ps[R_COUNT];
  int len, mask; std::vector<float> buf[8]; int w = 0;
  std::vector<float> preL, preR; int pw = 0, pd;
  AP ap[2][4];
  double lp[8] = {0}, dc[8] = {0}, y[8] = {0}, raw[8] = {0}, g[16] = {0}, c[8], s[8];
  double scale, wet = 0, frz = 0; bool idle = true;
  double hpL = 0, hpR = 0, envF = 0, envS = 0, swell = 1, ref = 0, swDb = 0;
  double TL[8], TR[8];
  explicit BlackHole(double sampleRate) : sr(sampleRate) {
    for (int i = 0; i < R_COUNT; i++) p[i] = ps[i] = REV_DEFAULTS[i];
    len = 1 << (int)jm::ceil(jm::log2(sr * 1.08)); mask = len - 1;
    for (int i = 0; i < 8; i++) buf[i].assign(len, 0.f);
    const int pl = 1 << (int)jm::ceil(jm::log2(sr * 0.04)); preL.assign(pl, 0.f); preR.assign(pl, 0.f); pd = (int)jm::round(0.03 * sr);
    for (int sd = 0; sd < 2; sd++) for (int k = 0; k < 4; k++) ap[sd][k].b.assign((size_t)jm::ceil(REV_DIFF[sd][k] * sr / 1000) + 1, 0.f);
    for (int i = 0; i < 8; i++) { c[i] = jm::cos(i * 0.9); s[i] = jm::sin(i * 0.9); TL[i] = REV_TL0[i] / 2; TR[i] = REV_TR0[i] / 2; }
    scale = REV_SCALE(p[R_rSize]);
  }
  void set(int id, double v) { p[id] = v; }
  void reset() {
    for (auto& b : buf) std::fill(b.begin(), b.end(), 0.f);
    std::fill(preL.begin(), preL.end(), 0.f); std::fill(preR.begin(), preR.end(), 0.f);
    for (auto& sd : ap) for (auto& a : sd) std::fill(a.b.begin(), a.b.end(), 0.f);
    for (int i = 0; i < 8; i++) { lp[i] = 0; dc[i] = 0; }
    hpL = hpR = 0; envF = envS = 0; swell = 1; swDb = 0;
  }
  double read(const std::vector<float>& b, double d) const {
    const double pos = w - d, fi = jm::floor(pos), f = pos - fi; const int i = (int)fi, m = mask;
    const double y0 = b[(i - 1) & m], y1 = b[i & m], y2 = b[(i + 1) & m], y3 = b[(i + 2) & m];
    const double c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * f + c2) * f + c1) * f + y1;
  }
  void process(float* L, float* R, int n) {
    const bool on = p[R_rMix] > 0 || p[R_rFreeze] >= 0.5;
    if (!on && wet == 0) { idle = true; return; }
    if (idle) { reset(); idle = false; }
    const double sm = 1 - jm::exp(-1 / (0.02 * sr)), slow = 1 - jm::exp(-1 / (0.6 * sr));
    const double mix = jm::max(0, jm::min(1, p[R_rMix])), frzT = p[R_rFreeze] >= 0.5 ? 1 : 0, fk = 1 / (0.05 * sr);
    ps[R_rDecay] += (p[R_rDecay] - ps[R_rDecay]) * jm::min(1, sm * n); ps[R_rDark] += (p[R_rDark] - ps[R_rDark]) * jm::min(1, sm * n); ps[R_rGrav] += (p[R_rGrav] - ps[R_rGrav]) * jm::min(1, sm * n);
    const double rt = REV_RT(ps[R_rDecay]), dark = jm::max(0, jm::min(1, ps[R_rDark])), rtH = rt * (1 - 0.9 * dark);
    const double xk = 1 - jm::exp(-2 * jm::PI * 8000 * jm::pow(0.1, dark) / sr), dck = 2 * jm::PI * 12 / sr, hk = 1 - jm::exp(-2 * jm::PI * 110 / sr);
    const double tgtScale = REV_SCALE(p[R_rSize]);
    for (int i = 0; i < 8; i++) { const double Ls = REV_LINES[i] * 1e-3 * scale * sr; g[i] = jm::pow(10, -3 * Ls / (rt * sr)); g[8 + i] = jm::pow(10, -3 * Ls / (rtH * sr)); }
    const double rtE = jm::sqrt(rt * rtH), grav = jm::max(0, jm::min(1, ps[R_rGrav])), swT = (0.4 + 2.6 * grav) * sr, swk = 1 - jm::exp(-1 / (0.005 * sr)), cutk = 1 - jm::exp(-1 / (0.06 * sr)), ink = REV_IN_G / jm::sqrt(1 + rt / 4);
    const double MOD = 0.0016 * sr; const int msk = mask;
    double rot[8][2];
    for (int i = 0; i < 8; i++) { rot[i][0] = jm::cos(2 * jm::PI * REV_RATES[i] / sr); rot[i][1] = jm::sin(2 * jm::PI * REV_RATES[i] / sr); }
    for (int smp = 0; smp < n; smp++) {
      wet += (mix - wet) * sm; if (!on && wet < 1e-5) wet = 0;
      frz += frzT > frz ? jm::min(fk, frzT - frz) : -jm::min(fk, frz - frzT);
      scale += (tgtScale - scale) * slow;
      const double xL = L[smp], xR = R[smp], fz = frz, inG = ink * (1 - fz);
      const double a = jm::abs(xL) + jm::abs(xR);
      envF += (a - envF) * 0.01; envS += (a - envS) * 0.0004;
      if (envF > 2 * envS + 0.02 && ref <= 0) { swell = 0; ref = 0.08 * sr; }
      ref--; if (swell < 1) swell = jm::min(1, swell + 1 / swT);
      const int preM = (int)preL.size() - 1; preL[pw] = (float)xL; preR[pw] = (float)xR;
      double dL = preL[(pw - pd) & preM], dR = preR[(pw - pd) & preM];
      pw = (pw + 1) & preM;
      for (int k = 0; k < 4; k++) {
        AP* q = &ap[0][k]; double o = q->b[q->i], v = dL + 0.62 * o; q->b[q->i] = (float)v; dL = o - 0.62 * v; q->i = q->i + 1 == (int)q->b.size() ? 0 : q->i + 1;
        q = &ap[1][k]; o = q->b[q->i]; v = dR + 0.62 * o; q->b[q->i] = (float)v; dR = o - 0.62 * v; q->i = q->i + 1 == (int)q->b.size() ? 0 : q->i + 1;
      }
      for (int i = 0; i < 8; i++) {
        const double ci = c[i], sn = s[i]; c[i] = ci * rot[i][0] - sn * rot[i][1]; s[i] = sn * rot[i][0] + ci * rot[i][1];
        const double d = REV_LINES[i] * 1e-3 * scale * sr + MOD * (1 + sn);
        const double v = read(buf[i], d); raw[i] = v;
        lp[i] += (v - lp[i]) * xk; const double hi = v - lp[i];
        const double gl = g[i] + (1 - g[i]) * fz, gh = g[8 + i] + (1 - g[8 + i]) * fz;
        y[i] = gl * lp[i] + gh * hi;
      }
      if ((smp & 255) == 0) for (int i = 0; i < 8; i++) { const double r = 1 / jm::hypot(c[i], s[i]); c[i] *= r; s[i] *= r; }
      const double a0 = y[0] + y[1], a1 = y[0] - y[1], a2 = y[2] + y[3], a3 = y[2] - y[3], a4 = y[4] + y[5], a5 = y[4] - y[5], a6 = y[6] + y[7], a7 = y[6] - y[7];
      const double b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3, b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
      const double H = 0.35355339059327373, h[8] = {b0 + b4, b1 + b5, b2 + b6, b3 + b7, b0 - b4, b1 - b5, b2 - b6, b3 - b7};
      const int ww = w;
      for (int i = 0; i < 8; i++) {
        double v = h[i] * H + (i & 1 ? dR : dL) * inG * REV_IN[i];
        dc[i] += (v - dc[i]) * dck * (1 - fz); v -= dc[i];
        const double av = v < 0 ? -v : v; if (av > 2) v = (v < 0 ? -1 : 1) * (2 + jm::tanh(av - 2));
        buf[i][ww] = (float)v;
      }
      w = (ww + 1) & msk;
      double oL = 0, oR = 0; for (int i = 0; i < 8; i++) { oL += TL[i] * raw[i]; oR += TR[i] * raw[i]; }
      hpL += (oL - hpL) * hk; hpR += (oR - hpR) * hk; oL -= hpL; oR -= hpR;
      const double sT = swell < 1 ? grav * jm::min(12, 60 / rtE * swell * swT / sr - 24 * (1 - swell)) : 0;
      swDb += (sT - swDb) * (swell < 1 ? swk : cutk);
      const double sw = swDb == 0 ? 1 : jm::pow(10, swDb / 20), m = wet, dg = jm::min(1, 2 - 2 * m), wg = jm::min(1, 2 * m) * 0.7 * sw;
      L[smp] = (float)(xL * dg + oL * wg); R[smp] = (float)(xR * dg + oR * wg);
    }
  }
};

// ---------------------------------------------------------------- level meter
struct Level {
  int chunk; double slices[12] = {0}, counts[12] = {0}; int k = 0; double acc = 0, n = 0, rms = 0;
  explicit Level(double sr) { chunk = (int)jm::round(sr / 60); }
  bool add(const float* L, const float* R, int cnt) {
    double a = 0; for (int i = 0; i < cnt; i++) a += (double)L[i] * L[i] + (double)R[i] * R[i];
    acc += a / 2; n += cnt;
    if (n < chunk) return false;
    slices[k] = acc; counts[k] = n; k = (k + 1) % 12; acc = 0; n = 0;
    double s = 0, c = 0; for (int j = 0; j < 12; j++) { s += slices[j]; c += counts[j]; }
    rms = jm::sqrt(s / jm::max(c, 1)); return true;
  }
};

}  // namespace filth
