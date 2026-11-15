// FILTH plugin: the web app's engine (ported to C++, bit-identical, see
// engine/) and the web app's own page (hosted in the plugin window, see
// web/), joined the way the browser joins them: the page's messages drive
// the engine, the engine's reports drive the page's lights.
#pragma once
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <BinaryData.h>
#include <array>
#include <atomic>
#include <memory>
#include <vector>
#include "../engine/synth.h"
#include "Params.h"

class FilthEditor;

class FilthProcessor : public juce::AudioProcessor, private juce::Timer {
public:
  FilthProcessor();
  ~FilthProcessor() override;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override {}
  bool isBusesLayoutSupported(const BusesLayout& l) const override;
  void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
  using AudioProcessor::processBlock;

  juce::AudioProcessorEditor* createEditor() override;
  bool hasEditor() const override { return true; }
  const juce::String getName() const override { return JucePlugin_Name; }
  bool acceptsMidi() const override { return true; }
  bool producesMidi() const override { return false; }
  bool isMidiEffect() const override { return false; }
  double getTailLengthSeconds() const override { return 0; }
  int getNumPrograms() override { return 1; }
  int getCurrentProgram() override { return 0; }
  void setCurrentProgram(int) override {}
  const juce::String getProgramName(int) override { return {}; }
  void changeProgramName(int, const juce::String&) override {}
  void getStateInformation(juce::MemoryBlock&) override;
  void setStateInformation(const void*, int) override;

  // ---- from the page (message thread)
  void pageMessage(const juce::String& json);
  void pageStore(const juce::String& json);
  // the page's storage when it opens: this instance's keys and the shared library
  std::string initStoreJson();
  // ---- to the page (message thread): reports since the last call
  bool takeLfo(filth::LfoReport& r);
  bool takeSeq(filth::SeqReport& r);
  std::vector<std::pair<int, double>> takeHostMoves();
  std::atomic<FilthEditor*> editor{nullptr};
  std::atomic<int> stateGen{0};   // bumped by setStateInformation
  int editorW = 1280, editorH = 800;

private:
  void timerCallback() override;
  void drainMoves();
  juce::CriticalSection moveLock; std::vector<std::pair<int, double>> pageMoves;
  // engine messages
  void push(const filth::Msg& m);
  void remember(const filth::Json& msg);
  void replay(filth::Synth& s);
  std::unique_ptr<filth::Synth> buildSynth(double sr);
  // audio thread
  void apply(filth::Synth& s, const filth::Msg& m);
  void noteSrc(filth::Synth& s, int n, int src, bool on, double vel);
  void midi(filth::Synth& s, const juce::MidiMessage& m);
  void renderTo(filth::Synth& s, int count);
  // storage
  static bool isShared(const std::string& key);
  static juce::File libraryFile();
  void saveLibrary();

  // parameters: one per panel control (Params.h), the engine id of each
  std::vector<juce::RangedAudioParameter*> params;
  std::array<int, filth::N_PARAMS> engineId{};
  std::array<std::atomic<float>, filth::N_PARAMS> echo;   // value the page just set (not the host's)
  std::array<float, filth::N_PARAMS> seen{};              // audio thread: last value read
  std::array<bool, filth::N_PARAMS> gesture{};
  std::array<juce::uint32, filth::N_PARAMS> touched{};
  int paramOf(int id) const { for (int i = 0; i < filth::N_PARAMS; i++) if (engineId[(size_t)i] == id) return i; return -1; }

  // the engine (audio thread), and a replacement built on the message thread
  std::unique_ptr<filth::Synth> synth;
  std::atomic<filth::Synth*> fresh{nullptr}, retired{nullptr};
  double sr = 0;

  // page -> audio
  juce::CriticalSection pushLock;
  juce::AbstractFifo inFifo{4096};
  std::vector<filth::Msg> inMsgs = std::vector<filth::Msg>(4096);
  // audio -> page: knobs the host moved
  juce::AbstractFifo moveFifo{2048};
  std::vector<std::pair<int, double>> moves = std::vector<std::pair<int, double>>(2048);
  // audio -> page: the engine's reports
  juce::SpinLock repLock;
  filth::LfoReport lfo; bool lfoNew = false;
  filth::SeqReport seq; bool seqNew = false;

  // notes: which sources hold each (1 = the page's keys, 2 = MIDI), the sustain pedal
  std::array<juce::uint8, 128> held{};
  std::array<bool, 128> sustained{};
  bool pedal = false;
  bool wasPlaying = false; double ppqEnd = 0;

  // the worklet's 128-sample quanta: the synth fills pend, the effects run on
  // each full quantum, and the output is read 128 samples behind
  static const int Q = 128, RING = 1 << 16;
  std::vector<float> pendL = std::vector<float>(Q), pendR = std::vector<float>(Q); int pendN = 0;
  std::vector<float> ringL = std::vector<float>(RING), ringR = std::vector<float>(RING);
  int ringW = 0, ringR0 = 0;

  // what the engine has been told, to save and to replay (message thread)
  juce::CriticalSection stateLock;
  filth::Json engineState = filth::Json::object();   // "p:cutoff" -> {t:'p', ...}, "seq:cutoff", "bpm", "prio" ...
  filth::Json store = filth::Json::object();         // the page's own keys for this instance
  filth::Json library = filth::Json::object();       // shared presets and look, in libraryFile()
  bool libraryDirty = false; juce::uint32 libraryTouched = 0;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FilthProcessor)
};

class FilthEditor : public juce::AudioProcessorEditor, private juce::Timer {
public:
  explicit FilthEditor(FilthProcessor&);
  ~FilthEditor() override;
  void resized() override;
  void paint(juce::Graphics& g) override;   // the splash's background, until the page has drawn its splash

private:
  void timerCallback() override;
  std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String& url);
  void send(const char* event, const std::string& json);
  FilthProcessor& proc;
  std::unique_ptr<juce::ZipFile> zip;
  std::string initJson; int gen = 0, dbg = 0;
  juce::uint32 born = 0, shownAt = 0;   // the page is hidden until its splash is up (no white flash)
  std::unique_ptr<juce::WebBrowserComponent> web;
  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FilthEditor)
};
