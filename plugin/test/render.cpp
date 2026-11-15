// Offline render for the null test: reads a script (sample rate, quanta,
// and page messages at quantum numbers) and writes L then R as float32.
//   render script.json out.f32
#include "../engine/synth.h"
#include <cstdio>
#include <fstream>
#include <sstream>
using namespace filth;
int main(int argc, char** argv) {
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
