# FILTH plugin (VST3 / AU / standalone)

The web app as a plugin, with the same sound and the same panel.

- **Sound**: `engine/` is a line-for-line C++ port of `dsp.js`, `seq.js` and `fx.js`. Its maths (`engine/jsmath.cpp`) is what Chrome's V8 runs for `Math.exp`, `Math.sin` ... (LLVM libc, vendored in `engine/llvm-libc`, correctly rounded) and, as V8 does, the platform's own `pow` and `tanh`. It is built without fused multiply-add, so it gives the web app's samples **bit for bit**, as played by Chrome on the same computer. (Safari and Firefox have their own maths libraries, so the web app itself sounds a hair different in those, and cross-FM patches drift apart there.) `test/null.js` checks this against the web app's JavaScript running in headless Chromium (Playwright; `FILTH_REF=node` uses Node instead, whose older V8 has different maths) on 21 stress cases (high drive and resonance, self-oscillation, cross FM, knob sequences with drift and retrig, MIDI clock, chorus, echo, reverb freeze and gravity, at 44.1, 48 and 96 kHz); `test/null-plugin.js` checks the built plugin itself, loaded in a host, with notes, automation, bend and mod wheel.
- **Panel**: the plugin window shows the site's own page (`index.html`, `view3d.js`, `factory.json`), built by `web/build.js` with three.js and the fonts bundled so it works offline. `web/bridge.js` stands in for the browser: the page's messages go to the C++ engine instead of the AudioWorklet, its settings are kept by the plugin (saved with the DAW project), and the preset library is shared between instances (`FILTH/library.json` in the user's application data folder).
- **Host**: all 55 panel controls are automatable parameters (the page's ids); the knob moves when the DAW automates it. MIDI as on the site (all channels, sustain pedal, pitch bend, mod wheel, CC121, CC120/123, MIDI clock). While the DAW's transport plays, its tempo and position drive the knob sequencer and the synced echo, as MIDI clock does on the site. The Bass Station II auto-mapping is not in the plugin (a plugin cannot see which device a note came from).
- **Latency**: 128 samples (reported to the host). The effects run in the AudioWorklet's 128-sample blocks, exactly as in the browser, so the engine needs one block in hand.

## Build

Needs CMake 3.22+, a C++17 compiler and node. JUCE 9.0.5 is fetched from GitHub, or pass a checkout with `-DFILTH_JUCE_DIR=...`.

```
cmake -S plugin -B build -DCMAKE_BUILD_TYPE=Release            # macOS universal: -G Xcode -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
cmake --build build --config Release
```

Linux needs `libwebkit2gtk-4.1-dev libgtk-3-dev libasound2-dev`; Windows needs the WebView2 NuGet package (see `.github/workflows/plugin.yml`).

Tests: `npm install playwright && npx playwright install chromium`, configure with `-DFILTH_TESTS=ON`, then `node plugin/test/null.js build/filth-render` and `node plugin/test/null-plugin.js <filth-host> <FILTH.vst3>`.

When the page's controls change (a knob added or renamed), run `node plugin/web/build.js && node plugin/tools/probe.js --write && node plugin/tools/params.js` to refresh `src/controls.json`, `src/DefaultState.json` and `src/Params.h`. A changed engine file (`dsp.js`, `seq.js`, `fx.js`) needs the same change in `engine/`; the null test says whether it still matches.

GitHub Actions (`.github/workflows/plugin.yml`) builds macOS (universal), Windows and Linux on every change, runs both null tests, runs `auval` on the AU, and publishes a release `filth-vX.Y.Z` from `main`.

## Signing

The builds are unsigned (macOS ones are signed ad hoc, which Apple Silicon needs to load them at all). To ship signed builds:

- **macOS**: an Apple Developer account (99 USD a year), a "Developer ID Application" certificate, and an app-specific password or API key for notarisation. Then `codesign --timestamp --options runtime -s "Developer ID Application: ..."` each bundle, `xcrun notarytool submit`, and `xcrun stapler staple`.
- **Windows**: a code-signing certificate (OV or EV, or Azure Trusted Signing), then `signtool sign` on the `.vst3` and `.exe`.

## Licences

JUCE is used under the AGPLv3 (this repository is public); a closed-source release would need a commercial JUCE licence. LLVM libc (`engine/llvm-libc/LICENSE.TXT`, Apache 2.0 with LLVM exception), V8's `pow` rules (`engine/V8-LICENSE`, BSD) and three.js (MIT) are bundled with their licences; the fonts are SIL Open Font License.
