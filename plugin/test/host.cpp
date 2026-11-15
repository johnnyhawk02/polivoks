// A minimal plugin host for the null test of the built plugin itself: loads
// FILTH.vst3 (or the AU), plays a script of MIDI notes and parameter moves at
// 128-sample block starts, and writes L then R as float32.
//   filth-host path/to/FILTH.vst3 script.json out.f32
// Script: { sr, quanta, events: [{ q, m: {t:'on', n, v} | {t:'off', n} | {t:'p', id, v} | {t:'bend', v} | {t:'modw', v} }] }
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_events/juce_events.h>
#include "../engine/json.h"
#include "../src/Params.h"
#include <fstream>
#include <sstream>

int main(int argc, char** argv) {
  juce::ScopedJuceInitialiser_GUI gui;
  if (argc < 4) { std::fprintf(stderr, "filth-host plugin script.json out.f32\n"); return 2; }
  std::ifstream f(argv[2]); std::stringstream ss; ss << f.rdbuf(); bool ok = false;
  filth::Json sc = filth::Json::parse(ss.str(), &ok); if (!ok) { std::fprintf(stderr, "bad script\n"); return 1; }
  const double sr = sc.numOr("sr", 48000); const int Q = (int)sc.numOr("quanta", 100), B = 128;

  juce::AudioPluginFormatManager fm; juce::addDefaultFormatsToManager(fm);
  juce::OwnedArray<juce::PluginDescription> found;
  for (auto* fmt : fm.getFormats()) fmt->findAllTypesForFile(found, argv[1]);
  if (found.isEmpty()) { std::fprintf(stderr, "no plugin in %s\n", argv[1]); return 1; }
  juce::String err;
  auto inst = fm.createPluginInstance(*found[0], sr, B, err);
  if (!inst) { std::fprintf(stderr, "load failed: %s\n", err.toRawUTF8()); return 1; }
  inst->enableAllBuses();
  inst->setPlayConfigDetails(0, 2, sr, B);
  inst->prepareToPlay(sr, B);
  std::fprintf(stderr, "%s %s, latency %d\n", inst->getName().toRawUTF8(), found[0]->version.toRawUTF8(), inst->getLatencySamples());
  std::map<juce::String, juce::AudioProcessorParameter*> byId;
  // hosts see the parameters by name (a VST3's ids are numbers): map the page's ids through Params.h
  for (auto* p : inst->getParameters())
    for (const auto& d : filth::PARAMS) if (p->getName(100) == d.name) byId[d.id] = p;
  std::fprintf(stderr, "%d of %d parameters found\n", (int)byId.size(), filth::N_PARAMS);

  const filth::Json* ev = sc.get("events"); size_t k = 0;
  std::vector<float> L((size_t)Q * B), R((size_t)Q * B);
  juce::AudioBuffer<float> buf(2, B); juce::MidiBuffer midi;
  for (int q = 0; q < Q; q++) {
    midi.clear();
    while (ev && k < ev->a.size() && ev->a[k].numOr("q", 0) <= q) {
      const filth::Json* m = ev->a[k].get("m"); k++; if (!m) continue;
      const std::string t = m->strOr("t", "");
      if (t == "on") midi.addEvent(juce::MidiMessage::noteOn(1, (int)m->numOr("n", 60), (juce::uint8)juce::roundToInt(m->numOr("v", 1) * 127)), 0);
      else if (t == "off") midi.addEvent(juce::MidiMessage::noteOff(1, (int)m->numOr("n", 60)), 0);
      else if (t == "bend") { const double v = m->numOr("v", 0); midi.addEvent(juce::MidiMessage::pitchWheel(1, 8192 + (int)std::round(v < 0 ? v * 8192 : v * 8191)), 0); }
      else if (t == "modw") midi.addEvent(juce::MidiMessage::controllerEvent(1, 1, (int)std::round(m->numOr("v", 0) * 127)), 0);
      else if (t == "p") {
        auto it = byId.find(juce::String(m->strOr("id", "")));
        if (it == byId.end()) { std::fprintf(stderr, "no parameter %s\n", m->strOr("id", "").c_str()); continue; }
        float norm = 0; const double v = m->numOr("v", 0);
        for (const auto& d : filth::PARAMS) if (m->strOr("id", "") == d.id) norm = (float)((v - d.lo) / (d.hi - d.lo));
        it->second->setValue(norm);
      }
    }
    buf.clear();
    inst->processBlock(buf, midi);
    std::memcpy(&L[(size_t)q * B], buf.getReadPointer(0), sizeof(float) * B);
    std::memcpy(&R[(size_t)q * B], buf.getReadPointer(1), sizeof(float) * B);
  }
  inst->releaseResources();
  FILE* o = std::fopen(argv[3], "wb"); std::fwrite(L.data(), 4, L.size(), o); std::fwrite(R.data(), 4, R.size(), o); std::fclose(o);
  return 0;
}
