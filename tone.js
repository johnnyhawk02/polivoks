// ============================================================================
// TONE: a random patch that is meant to be PLAYABLE, for the RANDOM row.
// Not part of the Polivoks circuit; it only picks knob and switch settings.
// Unlike PATCH (every control anywhere) it first picks a kind of sound
// (pluck, bass, lead, keys or pad), then sets each control from a range
// that suits that kind, using the knob laws of dsp.js:
//   - draws lean to the middle of each range (average of three throws) and
//     about one control in seven gets a bolder pick from a wider range
//   - VCO II sits in unison (a few cents of detune), an octave or a fifth,
//     using the exact PITCH knob positions for those intervals
//   - one shared LFO does at most one job, and gently: vibrato of a few
//     cents, a slow filter sway, a light tremolo or a soft random sparkle
//   - the VCA always follows its envelope (never HOLD), sustains and
//     releases stay short enough that nothing drones, resonance stays below
//     the screaming zone and is lowered when the cutoff is low
//   - the echo stays synced, on musical note values, with modest repeats
// Level knobs (VOLUME, PHONES) and the output switch are never touched.
// makeTone(rand) returns { kind, k: { id: value } } for every other control.
// ============================================================================
// PITCH knob positions for exact intervals (inverse of pitchOct in dsp.js)
const TONE_PITCH = { 0: 0, 3: 0.257, 4: 0.34216, 5: 0.42689, 7: 0.59465, 12: 1, '-5': -0.42689, '-7': -0.59465, '-12': -1 };
const TONE_CENT = 0.001025;     // DETUNE knob travel for one cent (detuneOct is linear here)
// LFO RATE knob for a few rates: 0 = 1.8 Hz (slowest), 0.2 = 4.7 Hz, 0.27 ≈ 6.3 Hz
const TONE_KINDS = ['pluck', 'bass', 'lead', 'keys', 'pad'];

function makeTone(rand) {
  const R = rand || Math.random;
  const mid = (a, b) => a + (b - a) * (R() + R() + R()) / 3;
  const bold = () => R() < 0.15;
  // a range that is sometimes widened toward [lo, hi]
  const rng = (a, b, lo, hi) => (bold() ? mid(lo, hi) : mid(a, b));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const wpick = (o) => { let t = 0; for (const k in o) t += o[k]; let r = R() * t; for (const k in o) if ((r -= o[k]) < 0) return k; return Object.keys(o)[0]; };
  const kind = wpick({ pluck: 3, bass: 3, lead: 3, keys: 2, pad: 2 });
  const k = {
    tune: 0, glide: 0, voice: 1, o1mod: 0, o1fm: 0, o1pitch: 0, o2mod: 0, o2detune: 0, o2pitch: 0,
    mixN: 0, mixE: 0, fEgMode: 0, fMode: 0, fMod: 0, aEgMode: 0, aMod: 0, vcaHold: 0, lfoMode: 0, lfoRate: 0.2,
  };

  // ---- oscillators: waves, ranges, interval
  const wave = () => +wpick({ 1: 4, 2: 3, 3: 2, 0: 1 });        // saw, square, pulse, triangle
  k.o1wave = wave(); k.o2wave = R() < 0.5 ? k.o1wave : wave();
  k.o1range = kind === 'bass' ? +wpick({ 1: 3, 0: 1 }) : kind === 'lead' ? +wpick({ 2: 3, 3: 1 }) : +wpick({ 2: 3, 1: 1 });
  let iv = wpick({ uni: 6, octUp: 2, octDown: kind === 'bass' ? 0 : 1, fifth: 2, fourth: bold() ? 1 : 0, twelfth: bold() ? 1 : 0 });
  k.o2range = k.o1range;
  if (iv === 'octUp') { if (k.o1range < 4) k.o2range++; else iv = 'uni'; }
  if (iv === 'octDown') { if (k.o1range > 0) k.o2range--; else iv = 'uni'; }
  if (iv === 'fifth') k.o2pitch = TONE_PITCH[7];
  if (iv === 'fourth') k.o2pitch = TONE_PITCH[5];
  if (iv === 'twelfth') { k.o2pitch = TONE_PITCH[7]; if (k.o1range < 4) k.o2range++; }
  // detune in cents: a slow beat in unison, a hair otherwise; sign at random
  const cents = iv === 'uni' ? rng(2, 7, 1, 12) : mid(0, 3);
  k.o2detune = (R() < 0.5 ? -1 : 1) * cents * TONE_CENT;
  // mixer: VCO I leads, VCO II a bit lower when it is on another interval
  k.mix1 = mid(0.5, 0.72);
  k.mix2 = iv === 'uni' ? mid(0.35, 0.55) : mid(0.3, 0.5);         // under VCO I so unison beats stay soft
  if (R() < 0.12) k.mix2 = 0;                                 // now and then one oscillator only
  if (R() < 0.12) k.mixN = mid(0.04, 0.14);                   // a breath of noise
  if (bold() && kind !== 'pad') k.o1fm = mid(0.01, 0.04);     // a little cross-mod grit

  // ---- envelopes (knob → time: ATTACK 0.25 ≈ 40 ms, 0.5 ≈ 250 ms; DECAY 0.3 ≈ 0.25 s, 0.5 ≈ 0.75 s time constant)
  const env = {
    pluck: { aA: [0, 0.04], aD: [0.3, 0.45], aS: [0, 0.2], aR: [0.25, 0.4] },
    bass: { aA: [0, 0.04], aD: [0.3, 0.5], aS: [0.5, 0.85], aR: [0.15, 0.3] },
    lead: { aA: [0, 0.1], aD: [0.35, 0.55], aS: [0.65, 0.95], aR: [0.25, 0.4] },
    keys: { aA: [0.02, 0.15], aD: [0.4, 0.55], aS: [0.35, 0.65], aR: [0.3, 0.42] },
    pad: { aA: [0.4, 0.6], aD: [0.45, 0.6], aS: [0.65, 0.9], aR: [0.36, 0.47] },
  }[kind];
  k.aA = mid(...env.aA); k.aD = mid(...env.aD); k.aS = mid(...env.aS); k.aR = mid(...env.aR);
  // filter envelope: snappier than the VCA for plucks and basses, slower for pads
  k.fA = kind === 'pad' ? mid(0.3, 0.55) : kind === 'keys' ? mid(0.02, 0.2) : mid(0, 0.08);
  k.fD = kind === 'pluck' || kind === 'bass' ? mid(0.25, 0.42) : mid(0.35, 0.55);
  k.fS = kind === 'pad' || kind === 'lead' ? mid(0.3, 0.7) : mid(0.05, 0.4);
  k.fR = Math.min(k.aR + 0.05, mid(0.2, 0.45));

  // ---- filter: low-pass (band-pass swings from silent to shrill); cutoff and envelope amount trade off so the note speaks
  k.fEnv = kind === 'pluck' || kind === 'bass' ? rng(0.35, 0.6, 0.2, 0.75) : rng(0.15, 0.45, 0.05, 0.6);
  const cBase = { pluck: [0.47, 0.6], bass: [0.44, 0.56], lead: [0.56, 0.7], keys: [0.53, 0.66], pad: [0.53, 0.66] }[kind];
  k.cutoff = rng(cBase[0], cBase[1], cBase[0] - 0.04, cBase[1] + 0.15);
  // resonance: moderate, lower when the cutoff is low
  k.res = rng(0.15, 0.55, 0.05, 0.8);
  if (k.cutoff < 0.5) k.res = Math.min(k.res, 0.45);
  if (bold() && (kind === 'pluck' || kind === 'bass')) k.fEgMode = 1;   // repeating filter envelope

  // ---- one gentle modulation job for the shared LFO (or none)
  const job = wpick({ none: 3, vibrato: kind === 'lead' || kind === 'pad' ? 4 : 2, sway: kind === 'pad' || kind === 'keys' ? 3 : 2, tremolo: 1, sparkle: 1 });
  if (job === 'vibrato') {
    k.lfoMode = 0; k.lfoRate = mid(0.17, 0.27);
    k.o1mod = k.o2mod = mid(4, 12) * 0.000428;                  // ≈ cents of vibrato (modOct ≈ 2335 cents per unit at 1.43 V)
  } else if (job === 'sway') {
    k.lfoMode = 0; k.lfoRate = mid(0, 0.08); k.fMod = mid(0.03, 0.09);
  } else if (job === 'tremolo') {
    k.lfoMode = 0; k.lfoRate = mid(0.12, 0.25); k.aMod = mid(0.02, 0.06);
  } else if (job === 'sparkle') {
    k.lfoMode = 2; k.lfoRate = mid(0.1, 0.25); k.fMod = mid(0.02, 0.06);
  }
  if (kind === 'lead' && R() < 0.35) k.glide = mid(0.05, 0.22);

  // ---- echo: synced to the clock on 1/8, dotted 1/8 or 1/4, modest repeats
  k.eSync = 1; k.eTime = +wpick({ 2: 3, 3: 3, 4: 2, 5: 1 }) / 6;
  k.eFb = kind === 'pad' ? mid(0.3, 0.5) : rng(0.15, 0.4, 0.05, 0.55);
  k.eMix = R() < 0.2 ? 0 : kind === 'pad' ? mid(0.18, 0.32) : mid(0.08, 0.25);
  k.eTone = mid(0.3, 0.6); k.eSpread = mid(0.5, 0.9);
  for (const id in k) k[id] = Math.round(k[id] * 1e5) / 1e5;
  return { kind, k };
}

if (typeof module !== 'undefined') module.exports = { makeTone, TONE_PITCH, TONE_CENT, TONE_KINDS };
