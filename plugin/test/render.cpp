// Offline render for the null test: reads a script (sample rate, quanta,
// and page messages at quantum numbers) and writes L then R as float32.
//   render script.json out.f32
//   render --math in.f64 out.f64     (for test/mathcheck.js: jm:: on pairs x, y)
#include "../engine/synth.h"
#include <cstdio>
#include <fstream>
#include <sstream>
using namespace filth;
static int mathMode(const char* in, const char* out) {
  FILE* f = std::fopen(in, "rb"); if (!f) return 1;
  std::vector<double> v; double d; while (std::fread(&d, 8, 1, f) == 1) v.push_back(d); std::fclose(f);
  const size_t n = v.size() / 2; std::vector<double> o; o.reserve(n * 9);
  for (int fn = 0; fn < 9; fn++) for (size_t i = 0; i < n; i++) {
    const double x = v[2 * i], y = v[2 * i + 1];
    switch (fn) {
      case 0: o.push_back(jm::exp(x)); break;      case 1: o.push_back(jm::log(x)); break;
      case 2: o.push_back(jm::log1p(x)); break;    case 3: o.push_back(jm::log2(x)); break;
      case 4: o.push_back(jm::sin(x)); break;      case 5: o.push_back(jm::cos(x)); break;
      case 6: o.push_back(jm::tan(x)); break;      case 7: o.push_back(jm::tanh(x)); break;
      default: o.push_back(jm::pow(x, y)); break;
    }
  }
  FILE* g = std::fopen(out, "wb"); std::fwrite(o.data(), 8, o.size(), g); std::fclose(g); return 0;
}
int main(int argc, char** argv) {
  if (argc == 4 && std::string(argv[1]) == "--math") return mathMode(argv[2], argv[3]);
  if (argc < 3) { std::fprintf(stderr, "render script.json out.f32\n"); return 2; }
  std::ifstream f(argv[1]); std::stringstream ss; ss << f.rdbuf(); bool ok; Json sc = Json::parse(ss.str(), &ok);
  if (!ok) { std::fprintf(stderr, "bad script\n"); return 1; }
  const double sr = sc.numOr("sr", 48000); const int Q = (int)sc.numOr("quanta", 1000), B = (int)sc.numOr("block", 128);
  Synth s(sr);
  const Json* ev = sc.get("events"); size_t k = 0;
  std::vector<float> L((size_t)Q * B), R((size_t)Q * B);
  for (int q = 0; q < Q; q++) {
    while (ev && k < ev->a.size() && ev->a[k].numOr("q", 0) <= q) { Msg m; if (const Json* mj = ev->a[k].get("m")) if (Msg::fromJson(*mj, m)) s.msg(m); k++; }
    s.process(&L[(size_t)q * B], &R[(size_t)q * B], B);
  }
  FILE* o = std::fopen(argv[2], "wb"); std::fwrite(L.data(), 4, L.size(), o); std::fwrite(R.data(), 4, R.size(), o); std::fclose(o);
}
