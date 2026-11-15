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
// functions here gives the same bits as Chrome on the same computer.
// V8's licence: V8-LICENSE.  LLVM libc's: llvm-libc/LICENSE.TXT.
#include "jsmath.h"

#include "shared/math/exp.h"
#include "shared/math/log.h"
#include "shared/math/log1p.h"
#include "shared/math/log2.h"
#include "shared/math/sin.h"
#include "shared/math/cos.h"
#include "shared/math/tan.h"

#include <cmath>
#include <limits>

namespace jsm {
namespace L = LIBC_NAMESPACE::shared;
double exp(double x) { return L::exp(x); }
double log(double x) { return L::log(x); }
double log1p(double x) { return L::log1p(x); }
double log2(double x) { return L::log2(x); }
double sin(double x) { return L::sin(x); }
double cos(double x) { return L::cos(x); }
double tan(double x) { return L::tan(x); }
double tanh(double x) { return std::tanh(x); }
// v8::internal::math::pow
double pow(double x, double y) {
  if (std::isnan(y)) return std::numeric_limits<double>::quiet_NaN();
  if (std::isinf(y) && (x == 1 || x == -1)) return std::numeric_limits<double>::quiet_NaN();
  if (std::isnan(x)) x = std::numeric_limits<double>::quiet_NaN();
  if (y == 2) return x * x;
  if (y == 0.5) return std::isinf(x) ? std::numeric_limits<double>::infinity() : std::sqrt(x + 0);
  return std::pow(x, y);
}
}  // namespace jsm
