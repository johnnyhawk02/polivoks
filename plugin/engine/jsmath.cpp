// FILTH plugin: JavaScript's Math as current Chrome computes it (V8 15.3,
// Chrome 153, src/base/ieee754.cc and src/numbers/ieee754.cc):
//   exp, log, log1p, log2, sin, cos, tan   LLVM libc (llvm-libc/, vendored:
//                                          V8 calls the same code); these are
//                                          correctly rounded, so the same bits
//                                          on every OS and CPU
//   pow                                     std::pow, after V8's special cases
//   tanh                                    std::tanh
// V8 itself calls the platform's pow and tanh, so Chrome's Math.pow and
// Math.tanh differ slightly between macOS, Windows and Linux; calling the same
// functions here gives the same bits as Chrome on the same computer
// (test/mathcheck.js checks each function against Chromium).
// V8's licence: V8-LICENSE.  LLVM libc's: llvm-libc/LICENSE.TXT.
#include "jsmath.h"

#include "shared/math/exp.h"
#include "shared/math/log.h"
#include "shared/math/log1p.h"
#include "shared/math/log2.h"
#include "shared/math/sin.h"
#include "shared/math/cos.h"
#include "shared/math/tan.h"
#include "shared/math/tanh.h"
#include "shared/math/pow.h"

#include <cmath>
#include <limits>

namespace jsm {
namespace L = LIBC_NAMESPACE::shared;
// The platform's pow and tanh, called through a pointer so the compiler
// cannot swap in its own inline versions.  On Windows the C runtime is linked
// statically (CMakeLists.txt), as in Chrome: the DLL's versions differ.
using F1 = double (*)(double);
using F2 = double (*)(double, double);
static F1 sysTanh() { static volatile F1 f = [](double x) { return std::tanh(x); }; return f; }
static F2 sysPow() { static volatile F2 f = [](double x, double y) { return std::pow(x, y); }; return f; }

double exp(double x) { return L::exp(x); }
double log(double x) { return L::log(x); }
double log1p(double x) { return L::log1p(x); }
double log2(double x) { return L::log2(x); }
double sin(double x) { return L::sin(x); }
double cos(double x) { return L::cos(x); }
double tan(double x) { return L::tan(x); }
double tanh(double x) { return sysTanh()(x); }
// v8::internal::math::pow's special cases, then f
static double v8pow(double x, double y, F2 f) {
  if (std::isnan(y)) return std::numeric_limits<double>::quiet_NaN();
  if (std::isinf(y) && (x == 1 || x == -1)) return std::numeric_limits<double>::quiet_NaN();
  if (std::isnan(x)) x = std::numeric_limits<double>::quiet_NaN();
  if (y == 2) return x * x;
  if (y == 0.5) return std::isinf(x) ? std::numeric_limits<double>::infinity() : std::sqrt(x + 0);
  return f(x, y);
}
// candidates, for test/mathcheck.js (which pow / tanh a platform's Chrome uses)
double variant(int k, double x, double y) {
  switch (k) {
    case 0: return L::tanh(x);
    case 1: return v8pow(x, y, [](double a, double b) { return L::pow(a, b); });
    case 2: case 4: return sysTanh()(x);
    default: return v8pow(x, y, sysPow());
  }
}
double pow(double x, double y) { return v8pow(x, y, sysPow()); }
}  // namespace jsm
