// ============================================================================
//  FILTH: the web app's AudioWorklet (index.html PolivoksProc) in C++.
//  engine (dsp.h) -> knob sequencer (seq.js KnobSeq, ported here) ->
//  chorus -> echo -> reverb -> soft clip (fx.h), with the page's messages
//  ({t:'p'}, {t:'seq'}, {t:'on'} ...) as plain structs.
// ============================================================================
#pragma once
#include <cstring>
#include <string>
#include <vector>
#include "dsp.h"
#include "fx.h"
#include "json.h"

namespace filth {

// ---------------------------------------------------------------- ids
// every control id the page can send: the engine's knobs, then the echo's,
// the chorus and the reverb's (FxRack routes them)
enum { ID_ECHO0 = P_COUNT, ID_CHORUS = ID_ECHO0 + E_COUNT, ID_REV0 = ID_CHORUS + 1, ID_COUNT = ID_REV0 + R_COUNT };
inline const char* idName(int id) {
  static const char* const fx[] = {"eTime", "eFb", "eTone", "eMix", "eSpread", "eSync", "chorus", "rSize", "rDecay", "rGrav", "rDark", "rMix", "rFreeze"};
  if (id < 0 || id >= ID_COUNT) return "";
  return id < P_COUNT ? paramNames()[id] : fx[id - P_COUNT];
}
inline int idOf(const std::string& s) { for (int i = 0; i < ID_COUNT; i++) if (s == idName(i)) return i; return -1; }

// ---------------------------------------------------------------- sequences
struct Seq {
  static const int MAXSTEPS = 64;
  bool on = false, eOn = false, lOn = false, e2On = false, vOn = false, kOn = false, rt = false;
  double len = 16, div = 1, depth = 0, slew = 0, drift = 0;
  double eDepth = 0, lDepth = 0, e2Depth = 0, vDepth = 0, kDepth = 0;
  int nSteps = 0; double steps[MAXSTEPS] = {0};
  bool act() const { return on || eOn || lOn || e2On || vOn || kOn; }
  double step(double i) const { const int k = (int)i; return k >= 0 && k < nSteps ? steps[k] : NAN; }
  static Seq fromJson(const Json& j) {
    Seq s;
    s.on = j.flag("on"); s.eOn = j.flag("eOn"); s.lOn = j.flag("lOn"); s.e2On = j.flag("e2On"); s.vOn = j.flag("vOn"); s.kOn = j.flag("kOn"); s.rt = j.flag("rt");
    s.len = j.numOr("len", NAN); s.div = j.numOr("div", NAN); s.depth = j.numOr("depth", NAN); s.slew = j.numOr("slew", 0);
    s.drift = j.orZero("drift");
    s.eDepth = j.orZero("eDepth"); s.lDepth = j.orZero("lDepth"); s.e2Depth = j.orZero("e2Depth"); s.vDepth = j.orZero("vDepth"); s.kDepth = j.orZero("kDepth");
    if (const Json* st = j.get("steps")) for (const Json& v : st->a) { if (s.nSteps >= MAXSTEPS) break; s.steps[s.nSteps++] = v.numv(); }
    return s;
  }
};

// ---------------------------------------------------------------- messages
struct Msg {
  enum Type { P, SEQ, BPM, CLK, CSTART, CSTOP, ON, OFF, ALL, PRIO, FMMOD, BEND, MODW, BENDST, NONE } t = NONE;
  int id = -1; double v = 0; int n = 0; bool hasV = true;
  Seq seq; bool hasRange = false; double range[2] = {0, 1};
  // a page message ({t:'p', id, v} ...); false if it is not one the engine takes
  static bool fromJson(const Json& d, Msg& m) {
    const std::string t = d.strOr("t", "");
    m = Msg();
    if (t == "p") { m.t = P; m.id = idOf(d.strOr("id", "")); const Json* v = d.get("v"); m.v = v ? v->numv() : NAN; return m.id >= 0; }
    if (t == "seq") {
      m.t = SEQ; m.id = idOf(d.strOr("id", "")); const Json* s = d.get("s"); if (!s || m.id < 0) return false;
      m.seq = Seq::fromJson(*s);
      if (const Json* r = d.get("range")) if (r->t == Json::Arr && r->a.size() == 2) { m.hasRange = true; m.range[0] = r->a[0].numv(); m.range[1] = r->a[1].numv(); }
      return true;
    }
    if (t == "bpm") { m.t = BPM; m.v = d.numOr("v", 120); return true; }
    if (t == "clk") { m.t = CLK; return true; }
    if (t == "cstart") { m.t = CSTART; return true; }
    if (t == "cstop") { m.t = CSTOP; return true; }
    if (t == "on") { m.t = ON; m.n = (int)d.numOr("n", 60); const Json* v = d.get("v"); m.hasV = v && v->t != Json::Null; m.v = m.hasV ? v->numv() : 1; return true; }
    if (t == "off") { m.t = OFF; m.n = (int)d.numOr("n", 60); return true; }
    if (t == "all") { m.t = ALL; return true; }
    if (t == "prio") { m.t = PRIO; m.v = d.flag("v") ? 1 : 0; return true; }
    if (t == "fmmod") { m.t = FMMOD; m.v = d.flag("v") ? 1 : 0; return true; }
    if (t == "bend") { m.t = BEND; m.v = d.numOr("v", 0); return true; }
    if (t == "modw") { m.t = MODW; m.v = d.numOr("v", 0); return true; }
    if (t == "bendst") { m.t = BENDST; m.v = d.numOr("v", 2); return true; }
    return false;
  }
};

// seq.js reports where each sequence is about 30 times a second
struct SeqReport {
  double pos = 0; bool ext = false;
  double ph[ID_COUNT]; bool hasPh[ID_COUNT];
  bool hasV = false; double val[ID_COUNT]; bool hasVal[ID_COUNT];
};
// and the page's meter / LED / panel-edge message ({t:'lfo'})
struct LfoReport { double v = 0, a = 0, vco[6] = {0}, clip = 0; };

// ---------------------------------------------------------------- the rack
struct Synth {
  double sr;
  Engine e; TapeEcho fx; JunoChorus ch; BlackHole rv; Level lev; SoftClip clip;

  // KnobSeq state (seq.js), one slot per id
  struct Slot { bool hasSeq = false; Seq s; bool hasRange = false; double range[2] = {0, 1}; bool hasBase = false; double base = 0;
                bool hasCur = false; double cur = 0; bool hasVal = false; double val = 0; bool hasPh = false; double ph = 0; bool hasOrg = false; double org = 0; };
  Slot slot[ID_COUNT];
  std::vector<int> order;     // ids in the order their sequences were first set (for (id in this.seq))
  double bpm = 120, pos = 0, prevPos = 0; bool trig = false; double time = 0;
  double pulses = 0, extT = -1; std::vector<double> clkT; double extBpm = 0; double repT = 0;
  int tickLeft = 0;           // samples until the next 64-sample control tick (seq.js render's chunks)

  SeqReport rep; bool repReady = false;
  LfoReport lrep; bool lfoReady = false;

  explicit Synth(double sampleRate) : sr(sampleRate), e(sampleRate), fx(sampleRate), ch(sampleRate), rv(sampleRate), lev(sampleRate) { clkT.reserve(64); order.reserve(ID_COUNT); }

  // FxRack.setParam
  void rackSet(int id, double v) {
    if (id < P_COUNT) e.setParam(id, v);
    else if (id < ID_CHORUS) fx.set(id - ID_ECHO0, v);
    else if (id == ID_CHORUS) ch.set(v);
    else rv.set(id - ID_REV0, v);
  }
  // the current knob value as the rack sees it (for the plugin's parameter readback)
  bool extActive() const { return extT >= 0 && time - extT < 0.5; }
  void param(int id, double v) { Slot& s = slot[id]; s.hasBase = true; s.base = v; if (!(s.hasSeq && s.s.act())) rackSet(id, v); }
  void setSeq(int id, const Seq& sq, const double* range) {
    Slot& sl = slot[id];
    const bool was = sl.hasSeq && sl.s.act(), wasOn = sl.hasSeq && sl.s.on;
    if (!sl.hasSeq) order.push_back(id);
    sl.hasSeq = true; sl.s = sq; if (range) { sl.hasRange = true; sl.range[0] = range[0]; sl.range[1] = range[1]; }
    if (sq.on && !wasOn) { sl.hasCur = true; sl.cur = 0; sl.hasPh = false; }
    if (!sq.rt) sl.hasOrg = false;
    if (!sq.act() && was && sl.hasBase) { rackSet(id, sl.base); sl.hasVal = false; }
  }
  void setBpm(double b) { bpm = jm::max(20, jm::min(300, b)); }
  void clock() {
    if (!extActive()) { pulses = jm::round(pos * 6); clkT.clear(); }
    pulses++; pos = pulses / 6; extT = time;
    clkT.push_back(time); if (clkT.size() > 49) clkT.erase(clkT.begin());
    if (clkT.size() >= 13) {
      double b = 60 / ((clkT.back() - clkT[0]) / (double)(clkT.size() - 1) * 24);
      if (jm::abs(b - jm::round(b)) < 0.3) b = jm::round(b);
      extBpm = jm::max(20, jm::min(300, b));
    }
  }
  void start() { pulses = 0; pos = 0; extT = time; for (auto& s : slot) s.hasOrg = false; }
  void stop() { extT = -1; clkT.clear(); }
  double tempo() const { return extActive() && extBpm ? extBpm : bpm; }

  // the plugin's host transport, standing in for MIDI clock: a pulse every
  // 1/24 beat at the host's own tempo (not measured from the pulses)
  void hostStart(double ppq) { start(); pulses = jm::floor(ppq * 24); pos = pulses / 6; }
  void hostPulse(double hostBpm) { pulses++; pos = pulses / 6; extT = time; extBpm = jm::max(20, jm::min(300, hostBpm)); }

  void tick(double dt) {
    time += dt;
    if (!extActive()) pos += dt * bpm / 15;
    bool any = false;
    const double dpos = pos - prevPos; prevPos = pos;
    for (int i = 0; i < ID_COUNT; i++) rep.hasPh[i] = false;
    for (const int id : order) {
      Slot& sl = slot[id]; const Seq& s = sl.s; if (!s.act()) continue; any = true;
      double c = 0;
      if (s.on) {
        const double dr = s.drift;
        if (!dr || dpos < 0) { sl.ph = pos; sl.hasPh = true; }
        else { sl.ph = (!sl.hasPh ? pos - dpos : sl.ph) + dpos * (1 + dr / 100); sl.hasPh = true; }
        if (s.rt && trig) { sl.org = sl.ph; sl.hasOrg = true; }
        const double p = sl.ph - (s.rt && sl.hasOrg ? sl.org : 0);
        if (dr || p != sl.ph) { rep.hasPh[id] = true; rep.ph[id] = jm::floor(p); }
        const double n = jm::floor(p / s.div), step = jm::mod(jm::mod(n, s.len) + s.len, s.len);
        const double k = s.slew > 0 ? 1 - jm::exp(-dt / s.slew) : 1;
        const double cur0 = sl.hasCur ? sl.cur : 0;
        sl.cur = cur0 + (s.step(step) - cur0) * k; sl.hasCur = true;
        c = sl.cur * s.depth;
      }
      if (s.eOn) c += s.eDepth * e.envN;
      if (s.e2On) c += s.e2Depth * e.env2N;
      if (s.vOn) c += s.vDepth * (e.velSet ? e.vel : 1);
      if (s.kOn) c += s.kDepth * jm::max(-1, jm::min(1, ((e.keySet ? e.key : 60) - 60) / 24));
      if (s.lOn) c += s.lDepth * jm::max(-1, jm::min(1, e.lfoV / 1.43));
      const double r0 = sl.hasRange ? sl.range[0] : 0, r1 = sl.hasRange ? sl.range[1] : 1, b = sl.hasBase ? sl.base : r0;
      const double v = jm::max(r0, jm::min(r1, b + c * (r1 - r0)));
      if (!sl.hasVal || v != sl.val) { sl.val = v; sl.hasVal = true; rackSet(id, v); }
    }
    trig = false;
    repT += dt;
    if (repT >= 1.0 / 30) {
      repT = 0;
      rep.pos = jm::floor(pos); rep.ext = extActive(); rep.hasV = any;
      for (int i = 0; i < ID_COUNT; i++) { rep.hasVal[i] = slot[i].hasVal; rep.val[i] = slot[i].val; }
      repReady = true;
    }
  }

  void msg(const Msg& d) {
    switch (d.t) {
      case Msg::P: param(d.id, d.v); break;
      case Msg::SEQ: setSeq(d.id, d.seq, d.hasRange ? d.range : nullptr); break;
      case Msg::BPM: setBpm(d.v); break;
      case Msg::CLK: clock(); break;
      case Msg::CSTART: start(); break;
      case Msg::CSTOP: stop(); break;
      case Msg::ON: e.noteOn(d.n, d.v, d.hasV); trig = true; break;
      case Msg::OFF: e.noteOff(d.n); break;
      case Msg::ALL: e.allOff(); break;
      case Msg::PRIO: e.setPrio(d.v != 0); break;
      case Msg::FMMOD: e.setFmMod(d.v != 0); break;
      case Msg::BEND: e.setBend(d.v); break;
      case Msg::MODW: e.setModWheel(d.v); break;
      case Msg::BENDST: e.setBendRange(d.v); break;
      default: break;
    }
  }

  // KnobSeq.render: the engine in 64-sample control chunks, kept on the
  // same grid across calls, so a call can stop anywhere (a MIDI event)
  // and the ticks still fall where the web app's do
  void renderSynth(float* out, int n) {
    while (n > 0) {
      if (tickLeft == 0) { tick(64 / sr); tickLeft = 64; }
      const int m = n < tickLeft ? n : tickLeft;
      e.render(out, m); out += m; n -= m; tickLeft -= m;
    }
  }
  // the worklet's process() after the synth: chorus, echo, reverb, clip and the page's meter
  void renderFx(float* L, float* R, int n) {
    ch.process(L, R, n); fx.bpm = tempo(); fx.process(L, R, n); rv.process(L, R, n); clip.process(L, R, n);
    if (lev.add(L, R, n)) { lrep.v = e.lfoV; lrep.a = lev.rms; vcoInfo(lrep.vco); lrep.clip = clip.read(); lfoReady = true; }
  }
  // one AudioWorklet quantum (128 samples in the browser)
  void process(float* L, float* R, int n) { renderSynth(L, n); renderFx(L, R, n); }

  // index.html vcoInfo(): each VCO's level and pitch, the filter's corner, for the panel
  void vcoInfo(double* o) const {
    static const double Rg[5] = {-2, -1, 0, 1, 2};
    const double lfo = e.lfoV, tune = e.ps[P_tune] * 2 / 12;
    const int r1 = jm::i32(e.p[P_o1range]), r2 = jm::i32(e.p[P_o2range]);
    const double o1 = (53 - 69) / 12.0 - e.kb.cv1 / 1.5 + (r1 >= 0 && r1 < 5 ? Rg[r1] : 0) + tune + modOct(e.ps[P_o1mod], lfo) + pitchOct(e.ps[P_o1pitch]) + fineOct(e.ps[P_o1fine]);
    const double o2 = (53 - 69) / 12.0 - e.kb.cv2 / 1.5 + (r2 >= 0 && r2 < 5 ? Rg[r2] : 0) + tune + modOct(e.ps[P_o2mod], lfo) + pitchOct(e.ps[P_o2pitch]) + fineOct(e.ps[P_o2fine]);
    const double env = e.p[P_vcaHold] >= 0.5 ? 1 : jm::max(0, e.egA.v / e.egA.Vpk);
    const double vol = jm::min(1, (e.p[P_outSel] >= 0.5 ? e.ps[P_phones] : e.ps[P_volume]) * 1.3) * e.powerLevel;
    o[0] = e.ps[P_mix1] * env * vol; o[1] = e.ps[P_mix2] * env * vol; o[2] = o1; o[3] = o2; o[4] = e.fcHz(); o[5] = e.ps[P_res];
  }
};

}  // namespace filth
