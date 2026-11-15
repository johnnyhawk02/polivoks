// JavaScript's Math as Chrome computes it, bit for bit (see jsmath.cpp).  The engine calls these
// instead of <cmath> so the plugin and the web app give the same numbers.
// Build with floating-point contraction off (no fused multiply-add) and
// without fast-math: CMakeLists.txt sets that for every compiler.
#pragma once
#include <cmath>
#include <cstdint>

namespace jsm {   // jsmath.cpp
double exp(double x);
double log(double x);
double log1p(double x);
double log2(double x);
double sin(double x);
double cos(double x);
double tan(double x);
double tanh(double x);
double pow(double x, double y);
double variant(int k, double x, double y);   // test candidates (jsmath.cpp)
}  // namespace jsm

namespace jm {
inline double exp(double x) { return jsm::exp(x); }
inline double tanh(double x) { return jsm::tanh(x); }
inline double log(double x) { return jsm::log(x); }
inline double log1p(double x) { return jsm::log1p(x); }
inline double log2(double x) { return jsm::log2(x); }
inline double sin(double x) { return jsm::sin(x); }
inline double cos(double x) { return jsm::cos(x); }
inline double tan(double x) { return jsm::tan(x); }
inline double pow(double x, double y) { return jsm::pow(x, y); }
inline double sqrt(double x) { return std::sqrt(x); }   // IEEE, exact everywhere
inline double abs(double x) { return std::fabs(x); }
inline double floor(double x) { return std::floor(x); }
inline double ceil(double x) { return std::ceil(x); }
// Math.round: the nearest integer, halves upward
inline double round(double x) { double r = std::floor(x); return (x - r >= 0.5) ? r + 1 : r; }
// Math.min / Math.max of two (NaN in -> NaN out)
inline double min(double a, double b) { if (a != a || b != b) return NAN; return a < b ? a : b; }
inline double max(double a, double b) { if (a != a || b != b) return NAN; return a > b ? a : b; }
// Math.hypot (V8's Torque builtin: scale by the largest, Kahan sum)
inline double hypot(double a, double b) {
  a = std::fabs(a); b = std::fabs(b);
  if (std::isinf(a) || std::isinf(b)) return INFINITY;
  double m = a > b ? a : b; if (m != m) return NAN; if (m == 0) return 0;
  double sum = 0, comp = 0; const double v[2] = {a, b};
  for (double x : v) { double n = x / m, s = n * n - comp, p = sum + s; comp = (p - sum) - s; sum = p; }
  return std::sqrt(sum) * m;
}
// x | 0 (ToInt32)
inline int32_t i32(double x) {
  if (!std::isfinite(x)) return 0;
  double t = std::trunc(x); double m = std::fmod(t, 4294967296.0); if (m < 0) m += 4294967296.0;
  uint32_t u = (uint32_t)m; return (int32_t)u;
}
// a % b for doubles (sign of a, like fmod)
inline double mod(double a, double b) { return std::fmod(a, b); }
const double PI = 3.141592653589793, LN2 = 0.6931471805599453, SQRT1_2 = 0.7071067811865476;
}  // namespace jm
