#include "Plugin.h"

using filth::Json;
using filth::Msg;

namespace {
const char* const STORE_KEY = "polivoks-model-v1";   // the page's knob values (index.html STORE)
juce::String text(const std::string& s) { return juce::String::fromUTF8(s.c_str(), (int)s.size()); }
std::string utf8(const juce::String& s) { return s.toStdString(); }
}

// ============================================================================
//  processor
// ============================================================================
FilthProcessor::FilthProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
  for (int i = 0; i < filth::N_PARAMS; i++) {
    const auto& d = filth::PARAMS[i];
    engineId[(size_t)i] = filth::idOf(d.id);
    jassert(engineId[(size_t)i] >= 0);
    juce::RangedAudioParameter* p;
    if (d.knob) p = new juce::AudioParameterFloat(juce::ParameterID{d.id, 1}, d.name, juce::NormalisableRange<float>((float)d.lo, (float)d.hi), (float)d.def);
    else { juce::StringArray l; for (int k = 0; k < d.nLabels; k++) l.add(d.labels[k]); p = new juce::AudioParameterChoice(juce::ParameterID{d.id, 1}, d.name, l, (int)d.def); }
    addParameter(p); params.push_back(p);
    echo[(size_t)i] = -1; seen[(size_t)i] = p->getValue();
  }
  // first run: what the page tells a new engine with nothing saved (src/DefaultState.json, from tools/probe.js)
  bool ok = false;
  Json d = Json::parse(std::string(BinaryData::DefaultState_json, (size_t)BinaryData::DefaultState_jsonSize), &ok);
  for (const Json& m : d.a) remember(m);
  // the shared preset library
  ok = false; Json lib = Json::parse(utf8(libraryFile().loadFileAsString()), &ok);
  if (ok && lib.t == Json::Obj) library = lib;
  setLatencySamples(Q);
  startTimerHz(30);
}

FilthProcessor::~FilthProcessor() {
  stopTimer();
  if (libraryDirty) saveLibrary();
  delete fresh.exchange(nullptr); delete retired.exchange(nullptr);
}

bool FilthProcessor::isBusesLayoutSupported(const BusesLayout& l) const {
  return l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo() || l.getMainOutputChannelSet() == juce::AudioChannelSet::mono();
}

// ---------------------------------------------------------------- engine state
void FilthProcessor::remember(const Json& m) {
  const std::string t = m.strOr("t", "");
  juce::ScopedLock sl(stateLock);
  if (t == "p" || t == "seq") engineState.set(t + ":" + m.strOr("id", ""), m);
  else if (t == "bpm" || t == "prio" || t == "fmmod" || t == "bendst") engineState.set(t, m);
}
void FilthProcessor::replay(filth::Synth& s) {
  juce::ScopedLock sl(stateLock);
  for (const auto& kv : engineState.o) { Msg m; if (Msg::fromJson(kv.second, m)) s.msg(m); }
}
std::unique_ptr<filth::Synth> FilthProcessor::buildSynth(double rate) {
  auto s = std::make_unique<filth::Synth>(rate);
  replay(*s);
  return s;
}
void FilthProcessor::push(const Msg& m) {
  juce::ScopedLock sl(pushLock);
  const auto w = inFifo.write(1);
  if (w.blockSize1 > 0) inMsgs[(size_t)w.startIndex1] = m;
}

void FilthProcessor::prepareToPlay(double sampleRate, int) {
  if (!synth || sampleRate != sr) {
    sr = sampleRate;
    delete fresh.exchange(nullptr);
    synth = buildSynth(sr);
    held.fill(0); sustained.fill(false); pedal = false;
    pendN = 0;
    std::fill(ringL.begin(), ringL.end(), 0.f); std::fill(ringR.begin(), ringR.end(), 0.f);
    ringR0 = 0; ringW = Q;   // the output runs one quantum behind the synth
  }
  setLatencySamples(Q);
}

// ---------------------------------------------------------------- the page
void FilthProcessor::pageMessage(const juce::String& json) {
  bool ok = false; Json d = Json::parse(utf8(json), &ok); if (!ok) return;
  Msg m; if (!Msg::fromJson(d, m)) return;
  if (m.t == Msg::P) {
    const int i = paramOf(m.id);
    if (i >= 0 && m.v == m.v) {
      auto* p = params[(size_t)i];
      const float norm = p->convertTo0to1((float)m.v);
      if (std::abs(p->getValue() - norm) > 1e-6f) {
        echo[(size_t)i] = norm;
        if (!gesture[(size_t)i]) { p->beginChangeGesture(); gesture[(size_t)i] = true; }
        touched[(size_t)i] = juce::Time::getMillisecondCounter();
        p->setValueNotifyingHost(norm);
        echo[(size_t)i] = p->getValue();
      }
    }
  }
  remember(d);
  push(m);   // the engine gets the page's exact value, not the parameter's float
}

bool FilthProcessor::isShared(const std::string& k) {
  return k == "polivoks-presets-v1" || k == "polivoks-preset-favs" || k == "polivoks-look" || k == "polivoks-factory-seen" || k == "polivoks-preset-show";
}
juce::File FilthProcessor::libraryFile() {
  return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("FILTH").getChildFile("library.json");
}
void FilthProcessor::saveLibrary() {
  std::string s; { juce::ScopedLock sl(stateLock); s = library.dump(); libraryDirty = false; }
  auto f = libraryFile(); f.getParentDirectory().createDirectory();
  f.replaceWithText(text(s), false, false, nullptr);
}
void FilthProcessor::pageStore(const juce::String& json) {
  bool ok = false; Json d = Json::parse(utf8(json), &ok); if (!ok) return;
  const std::string k = d.strOr("k", ""); const Json* v = d.get("v"); if (k.empty()) return;
  juce::ScopedLock sl(stateLock);
  Json& target = isShared(k) ? library : store;
  if (!v || v->t != Json::Str) target.erase(k); else target.set(k, *v);
  if (isShared(k)) { libraryDirty = true; libraryTouched = juce::Time::getMillisecondCounter(); }
}
std::string FilthProcessor::initStoreJson() {
  juce::ScopedLock sl(stateLock);
  // the knob values the page opens with are the engine's (the DAW may have moved some while it was shut)
  bool ok = false; const Json* cur = store.get(STORE_KEY);
  Json knobs = cur ? Json::parse(cur->s, &ok) : Json::object(); if (!ok || knobs.t != Json::Obj) knobs = Json::object();
  for (const auto& kv : engineState.o)
    if (kv.second.strOr("t", "") == "p") { const std::string id = kv.second.strOr("id", ""); if (id != "power" && kv.second.get("v")) knobs.set(id, *kv.second.get("v")); }
  store.set(STORE_KEY, Json::str(knobs.dump()));
  Json all = Json::object();
  for (const auto& kv : library.o) all.set(kv.first, kv.second);
  for (const auto& kv : store.o) all.set(kv.first, kv.second);
  Json init = Json::object(); init.set("store", all);
  return init.dump();
}

// ---------------------------------------------------------------- message thread pump
void FilthProcessor::timerCallback() {
  delete retired.exchange(nullptr);
  const auto now = juce::Time::getMillisecondCounter();
  for (int i = 0; i < filth::N_PARAMS; i++)
    if (gesture[(size_t)i] && now - touched[(size_t)i] > 300) { params[(size_t)i]->endChangeGesture(); gesture[(size_t)i] = false; }
  if (libraryDirty && now - libraryTouched > 1000) saveLibrary();
  drainMoves();
}
// knobs the host moved: remembered (so a saved project has them) and kept for the page while it is open
void FilthProcessor::drainMoves() {
  juce::ScopedLock sl(moveLock);
  std::vector<std::pair<int, double>> got;
  const auto r = moveFifo.read(moveFifo.getNumReady());
  for (int k = 0; k < r.blockSize1; k++) got.push_back(moves[(size_t)(r.startIndex1 + k)]);
  for (int k = 0; k < r.blockSize2; k++) got.push_back(moves[(size_t)(r.startIndex2 + k)]);
  for (auto& mv : got) {
    Json m = Json::object(); m.set("t", Json::str("p")); m.set("id", Json::str(filth::idName(mv.first))); m.set("v", Json::num(mv.second));
    remember(m);
    if (editor.load() != nullptr) pageMoves.push_back(mv);
  }
}
std::vector<std::pair<int, double>> FilthProcessor::takeHostMoves() {
  drainMoves();
  juce::ScopedLock sl(moveLock);
  std::vector<std::pair<int, double>> out; out.swap(pageMoves); return out;
}
bool FilthProcessor::takeLfo(filth::LfoReport& r) { juce::SpinLock::ScopedLockType l(repLock); if (!lfoNew) return false; r = lfo; lfoNew = false; return true; }
bool FilthProcessor::takeSeq(filth::SeqReport& r) { juce::SpinLock::ScopedLockType l(repLock); if (!seqNew) return false; r = seq; seqNew = false; return true; }

// ---------------------------------------------------------------- state
void FilthProcessor::getStateInformation(juce::MemoryBlock& dest) {
  drainMoves();   // knobs the host moved that the pump has not collected yet
  Json st = Json::object();
  { juce::ScopedLock sl(stateLock);
    st.set("filth", Json::num(1)); st.set("version", Json::str(JucePlugin_VersionString));
    Json eng = Json::array(); for (const auto& kv : engineState.o) eng.a.push_back(kv.second);
    st.set("engine", eng); st.set("store", store);
    Json ed = Json::array(); ed.a.push_back(Json::num(editorW)); ed.a.push_back(Json::num(editorH)); st.set("editor", ed); }
  const std::string s = st.dump();
  dest.replaceAll(s.data(), s.size());
}
void FilthProcessor::setStateInformation(const void* data, int size) {
  bool ok = false; Json st = Json::parse(std::string((const char*)data, (size_t)size), &ok);
  if (!ok || st.t != Json::Obj || !st.get("engine")) return;
  { juce::ScopedLock sl(stateLock);
    engineState = Json::object();
    store = st.get("store") && st.get("store")->t == Json::Obj ? *st.get("store") : Json::object();
    if (const Json* ed = st.get("editor")) if (ed->a.size() == 2) { editorW = juce::jlimit(640, 4096, (int)ed->a[0].numv(1280)); editorH = juce::jlimit(400, 2560, (int)ed->a[1].numv(800)); } }
  for (const Json& m : st.get("engine")->a) remember(m);
  // the host's parameters follow; the engine gets the exact values from a fresh build
  { juce::ScopedLock sl(stateLock);
    for (const auto& kv : engineState.o) {
      if (kv.second.strOr("t", "") != "p") continue;
      const int i = paramOf(filth::idOf(kv.second.strOr("id", ""))); if (i < 0) continue;
      auto* p = params[(size_t)i]; const float norm = p->convertTo0to1((float)kv.second.numOr("v", 0));
      echo[(size_t)i] = norm; p->setValueNotifyingHost(norm); echo[(size_t)i] = p->getValue();
    } }
  if (sr > 0) delete fresh.exchange(buildSynth(sr).release());
  ++stateGen;   // an open window reloads the page with the new state
}

// ============================================================================
//  audio thread
// ============================================================================
void FilthProcessor::noteSrc(filth::Synth& s, int n, int src, bool on, double vel) {
  if (n < 0 || n > 127) return;
  auto& h = held[(size_t)n];
  Msg m;
  if (on) { if (h) { h |= (juce::uint8)src; return; } h = (juce::uint8)src; m.t = Msg::ON; m.n = n; m.v = vel; s.msg(m); }
  else { if (!(h & src)) return; h &= (juce::uint8)~src; if (!h) { m.t = Msg::OFF; m.n = n; s.msg(m); } }
}
void FilthProcessor::apply(filth::Synth& s, const Msg& m) {
  if (m.t == Msg::ON) noteSrc(s, m.n, 1, true, m.hasV ? m.v : 1);
  else if (m.t == Msg::OFF) noteSrc(s, m.n, 1, false, 0);
  else if (m.t == Msg::ALL) { held.fill(0); sustained.fill(false); s.msg(m); }
  else s.msg(m);
}
// index.html midiMsg(): every channel; notes, sustain pedal, bend, wheel, CC121, CC120/123, MIDI clock
void FilthProcessor::midi(filth::Synth& s, const juce::MidiMessage& mm) {
  Msg m;
  if (mm.isMidiClock()) { m.t = Msg::CLK; s.msg(m); return; }
  if (mm.isMidiStart()) { m.t = Msg::CSTART; s.msg(m); return; }
  if (mm.isMidiStop()) { m.t = Msg::CSTOP; s.msg(m); return; }
  if (mm.isNoteOn()) { const int n = mm.getNoteNumber(); sustained[(size_t)n] = false; noteSrc(s, n, 2, true, mm.getVelocity() / 127.0); return; }
  if (mm.isNoteOff()) { const int n = mm.getNoteNumber(); if (pedal) sustained[(size_t)n] = true; else noteSrc(s, n, 2, false, 0); return; }
  if (mm.isController()) {
    const int cc = mm.getControllerNumber(), v = mm.getControllerValue();
    if (cc == 64) { pedal = v >= 64; if (!pedal) { for (int n = 0; n < 128; n++) if (sustained[(size_t)n]) noteSrc(s, n, 2, false, 0); sustained.fill(false); } }
    else if (cc == 1) { m.t = Msg::MODW; m.v = v / 127.0; s.msg(m); }
    else if (cc == 121) { m.t = Msg::BEND; m.v = 0; s.msg(m); m.t = Msg::MODW; s.msg(m); }
    else if (cc == 120 || cc == 123) { pedal = false; sustained.fill(false); for (int n = 0; n < 128; n++) if (held[(size_t)n] & 2) noteSrc(s, n, 2, false, 0); }
    return;
  }
  if (mm.isPitchWheel()) { const int b = mm.getPitchWheelValue() - 8192; m.t = Msg::BEND; m.v = b < 0 ? b / 8192.0 : b / 8191.0; s.msg(m); }
}
void FilthProcessor::renderTo(filth::Synth& s, int count) {
  while (count > 0) {
    const int m = juce::jmin(count, Q - pendN);
    s.renderSynth(pendL.data() + pendN, m); pendN += m; count -= m;
    if (pendN == Q) {
      s.renderFx(pendL.data(), pendR.data(), Q);
      for (int i = 0; i < Q; i++) { ringL[(size_t)((ringW + i) & (RING - 1))] = pendL[(size_t)i]; ringR[(size_t)((ringW + i) & (RING - 1))] = pendR[(size_t)i]; }
      ringW = (ringW + Q) & (RING - 1); pendN = 0;
      if (s.lfoReady || s.repReady) {
        juce::SpinLock::ScopedTryLockType l(repLock);
        if (l.isLocked()) {
          if (s.lfoReady) { lfo = s.lrep; lfoNew = true; s.lfoReady = false; }
          if (s.repReady) { seq = s.rep; seqNew = true; s.repReady = false; }
        }
      }
    }
  }
}

void FilthProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiIn) {
  juce::ScopedNoDenormals nd;
  const int total = buffer.getNumSamples();
  if (auto* f = fresh.exchange(nullptr)) {   // a loaded state: a fresh engine, as when the page reloads
    delete retired.exchange(synth.release());
    synth.reset(f); held.fill(0); sustained.fill(false); pedal = false;
  }
  if (!synth) { buffer.clear(); return; }
  auto& s = *synth;
  // the page's messages
  { const auto r = inFifo.read(inFifo.getNumReady());
    for (int k = 0; k < r.blockSize1; k++) apply(s, inMsgs[(size_t)(r.startIndex1 + k)]);
    for (int k = 0; k < r.blockSize2; k++) apply(s, inMsgs[(size_t)(r.startIndex2 + k)]); }
  // the host's automation: a parameter that moved, and not by the page
  for (int i = 0; i < filth::N_PARAMS; i++) {
    const float nv = params[(size_t)i]->getValue();
    if (nv == seen[(size_t)i]) continue;
    seen[(size_t)i] = nv;
    const float e = echo[(size_t)i].load();
    if (e >= 0 && std::abs(nv - e) < 1e-6f) { echo[(size_t)i] = -1; continue; }
    const double v = params[(size_t)i]->convertFrom0to1(nv);
    Msg m; m.t = Msg::P; m.id = engineId[(size_t)i]; m.v = v; s.msg(m);
    const auto w = moveFifo.write(1); if (w.blockSize1 > 0) moves[(size_t)w.startIndex1] = {engineId[(size_t)i], v};
  }
  // host transport in place of MIDI clock: a pulse every 1/24 beat while it plays
  bool playing = false; double ppq0 = 0, bpm = 120;
  if (auto* ph = getPlayHead()) if (auto pos = ph->getPosition()) {
    playing = pos->getIsPlaying();
    if (auto p = pos->getPpqPosition()) ppq0 = *p; else playing = false;
    if (auto b = pos->getBpm()) bpm = *b; else playing = false;
  }
  if (bpm <= 0) playing = false;
  if (playing && (!wasPlaying || std::abs(ppq0 - ppqEnd) > 0.1)) s.hostStart(ppq0);
  if (!playing && wasPlaying) s.stop();
  double k = std::floor(ppq0 * 24) + 1;
  const double spb = 60.0 / bpm * sr;   // samples per beat
  int pos = 0;
  auto until = [&](int t) { if (t > pos) { renderTo(s, t - pos); pos = t; } };
  auto pulsesTo = [&](int t) { while (playing) { const int at = (int)std::ceil((k / 24 - ppq0) * spb); if (at > t || at >= total) break; until(juce::jmax(at, 0)); s.hostPulse(bpm); k++; } };
  for (const auto meta : midiIn) {
    const int t = juce::jlimit(0, juce::jmax(0, total - 1), meta.samplePosition);
    pulsesTo(t); until(t); midi(s, meta.getMessage());
  }
  pulsesTo(total - 1); until(total);
  ppqEnd = ppq0 + total / spb; wasPlaying = playing;
  // out, one quantum behind
  auto* L = buffer.getWritePointer(0); auto* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : nullptr;
  for (int i = 0; i < total; i++) {
    const size_t j = (size_t)((ringR0 + i) & (RING - 1));
    if (R) { L[i] = ringL[j]; R[i] = ringR[j]; } else L[i] = 0.5f * (ringL[j] + ringR[j]);
  }
  ringR0 = (ringR0 + total) & (RING - 1);
  for (int c = 2; c < buffer.getNumChannels(); c++) buffer.clear(c, 0, total);
}

juce::AudioProcessorEditor* FilthProcessor::createEditor() { return new FilthEditor(*this); }

// ============================================================================
//  editor: the web app's page
// ============================================================================
FilthEditor::FilthEditor(FilthProcessor& p) : AudioProcessorEditor(p), proc(p) {
  zip = std::make_unique<juce::ZipFile>(new juce::MemoryInputStream(BinaryData::web_zip, (size_t)BinaryData::web_zipSize, false), true);
  initJson = proc.initStoreJson();
  using WBC = juce::WebBrowserComponent;
  auto webData = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("FILTH").getChildFile("WebView2");
  auto opts = WBC::Options{}
                  .withBackend(WBC::Options::Backend::webview2)
                  .withWinWebView2Options(WBC::Options::WinWebView2{}.withUserDataFolder(webData).withStatusBarDisabled().withBackgroundColour(juce::Colour(0xff0b0b0b)))
                  .withNativeIntegrationEnabled()
                  .withKeepPageLoadedWhenBrowserIsHidden()
                  .withEventListener("filthMsg", [this](juce::var v) { proc.pageMessage(v.toString()); })
                  .withEventListener("filthStore", [this](juce::var v) { proc.pageStore(v.toString()); })
                  .withEventListener("filthReady", [](juce::var) {})
                  .withEventListener("filthShown", [this](juce::var) { if (!shownAt) shownAt = juce::Time::getMillisecondCounter(); })
                  .withResourceProvider([this](const juce::String& url) { return resource(url); });
  web = std::make_unique<WBC>(opts);
  addChildComponent(*web);   // shown once the page's splash is drawn (timerCallback): no white flash before it
  born = juce::Time::getMillisecondCounter();
  web->goToURL(WBC::getResourceProviderRoot());
  const int w = proc.editorW, h = proc.editorH;   // (setResizeLimits resizes, and resized() records the size)
  setResizable(true, true);
  setResizeLimits(640, 400, 4096, 2560);
  setSize(w, h);
  gen = proc.stateGen.load();
  proc.editor = this;
  startTimerHz(60);
}
FilthEditor::~FilthEditor() { stopTimer(); proc.editor = nullptr; }
void FilthEditor::resized() { if (web) web->setBounds(getLocalBounds()); proc.editorW = getWidth(); proc.editorH = getHeight(); }

static const char* mimeOf(const juce::String& path) {
  const auto e = path.fromLastOccurrenceOf(".", false, false).toLowerCase();
  if (e == "html") return "text/html; charset=utf-8";
  if (e == "js" || e == "mjs") return "text/javascript; charset=utf-8";
  if (e == "json") return "application/json; charset=utf-8";
  if (e == "css") return "text/css; charset=utf-8";
  if (e == "woff2") return "font/woff2";
  if (e == "png") return "image/png";
  if (e == "svg") return "image/svg+xml";
  return "application/octet-stream";
}
std::optional<juce::WebBrowserComponent::Resource> FilthEditor::resource(const juce::String& url) {
  auto path = url.upToFirstOccurrenceOf("?", false, false).upToFirstOccurrenceOf("#", false, false);
  path = path == "/" || path.isEmpty() ? juce::String("index.html") : path.fromFirstOccurrenceOf("/", false, false);
  auto* entry = zip->getEntry(path);
  if (!entry) return std::nullopt;
  std::unique_ptr<juce::InputStream> in(zip->createStreamForEntry(*entry));
  if (!in) return std::nullopt;
  juce::MemoryBlock mb; in->readIntoMemoryBlock(mb);
  std::vector<std::byte> bytes((const std::byte*)mb.getData(), (const std::byte*)mb.getData() + mb.getSize());
  if (path == "index.html") {
    // this instance's storage, in place of bridge.js's placeholder ("</" escaped so it cannot end the <script>)
    std::string html((const char*)mb.getData(), mb.getSize()), init;
    for (size_t i = 0; i < initJson.size(); i++) { if (initJson[i] == '<' && i + 1 < initJson.size() && initJson[i + 1] == '/') init += "<\\"; else init += initJson[i]; }
    const std::string mark = "/*FILTH_INIT*/null";
    const auto at = html.find(mark);
    if (at != std::string::npos) html.replace(at, mark.size(), init);
    bytes.assign((const std::byte*)html.data(), (const std::byte*)html.data() + html.size());
  }
  return juce::WebBrowserComponent::Resource{std::move(bytes), mimeOf(path)};
}
void FilthEditor::send(const char* event, const std::string& json) { if (web) web->emitEventIfBrowserIsVisible(event, juce::var(text(json))); }

void FilthEditor::paint(juce::Graphics& g) {
  // the page's splash background (#splash in index.html), so the window is never white while the page loads
  const auto b = getLocalBounds().toFloat();
  g.setGradientFill(juce::ColourGradient(juce::Colour(0xff2a2a2a), b.getWidth() * 0.5f, b.getHeight() * 0.4f,
                                         juce::Colour(0xff0b0b0b), b.getWidth() * 0.5f + b.getWidth() * 0.84f, b.getHeight() * 0.4f, true));
  g.fillAll();
}

void FilthEditor::timerCallback() {
  if (!web->isVisible()) {
    const auto now = juce::Time::getMillisecondCounter();
    if ((shownAt && now - shownAt > 150) || now - born > 4000) web->setVisible(true);
  }
  if (juce::SystemStats::getEnvironmentVariable("FILTH_DEBUG", {}).isNotEmpty() && ++dbg % 120 == 0)
    web->evaluateJavascript("JSON.stringify({ mode: window.filthTest && window.filthTest.mode(), canvas: !!document.querySelector('canvas'), errors: window.__errs || [], w: innerWidth, h: innerHeight })",
                            [](juce::WebBrowserComponent::EvaluationResult r) { if (auto* v = r.getResult()) std::fprintf(stderr, "FILTH_DEBUG page %s\n", v->toString().toRawUTF8()); });
  if (gen != proc.stateGen.load()) {   // a project or preset was loaded by the host: reopen the page on it
    gen = proc.stateGen.load(); initJson = proc.initStoreJson(); proc.takeHostMoves();
    web->goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    return;
  }
  filth::LfoReport l;
  if (proc.takeLfo(l)) {
    Json m = Json::object(); m.set("t", Json::str("lfo")); m.set("v", Json::num(l.v)); m.set("a", Json::num(l.a));
    Json vco = Json::array(); for (double x : l.vco) vco.a.push_back(Json::num(x)); m.set("vco", vco); m.set("clip", Json::num(l.clip));
    send("filthEngine", m.dump());
  }
  filth::SeqReport r;
  if (proc.takeSeq(r)) {
    Json m = Json::object(); m.set("t", Json::str("seqpos")); m.set("pos", Json::num(r.pos));
    Json ph = Json::object(); for (int i = 0; i < filth::ID_COUNT; i++) if (r.hasPh[i]) ph.set(filth::idName(i), Json::num(r.ph[i]));
    m.set("ph", ph); m.set("ext", Json::boolean(r.ext));
    if (r.hasV) { Json v = Json::object(); for (int i = 0; i < filth::ID_COUNT; i++) if (r.hasVal[i]) v.set(filth::idName(i), Json::num(r.val[i])); m.set("v", v); }
    else m.set("v", Json());
    send("filthEngine", m.dump());
  }
  auto mv = proc.takeHostMoves();
  if (!mv.empty()) {
    Json a = Json::array();
    for (auto& x : mv) { Json p = Json::array(); p.a.push_back(Json::str(filth::idName(x.first))); p.a.push_back(Json::num(x.second)); a.a.push_back(p); }
    send("filthHost", a.dump());
  }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new FilthProcessor(); }
