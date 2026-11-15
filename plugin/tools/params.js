// Writes src/Params.h, the plugin's automatable parameters, from the page's
// own control list (src/controls.json, written by probe.js): one parameter per
// panel control, with the page's id, range and default.  Host-facing names
// and switch labels are below.
//   node plugin/tools/params.js
const fs = require('fs'), path = require('path');
const S = require('../src/controls.json');
const NAME = {
  lfoRate: 'LFO Rate', lfoRange: 'LFO Range', lfoMode: 'LFO Mode', tune: 'Tune', glide: 'Glide', voice: 'Voice', volume: 'Volume',
  o1range: 'VCO I Range', o1wave: 'VCO I Wave', o1pw: 'VCO I Pulse Width', o1fm: 'VCO I FM', o1pitch: 'VCO I Pitch', o1fine: 'VCO I Fine',
  o2range: 'VCO II Range', o2wave: 'VCO II Wave', o2pw: 'VCO II Pulse Width', o2fm: 'VCO II FM', o2pitch: 'VCO II Pitch', o2fine: 'VCO II Fine',
  mix1: 'Mixer VCO I', mix2: 'Mixer VCO II', mixN: 'Mixer Noise', drive: 'Drive', cutoff: 'Cutoff', res: 'Resonance', fMode: 'Filter Type',
  fEnv: 'Env 2 Amount', fMod: 'Filter LFO Mod', o1mod: 'VCO I LFO Mod', o2mod: 'VCO II LFO Mod', chorus: 'Chorus', eSync: 'Delay Sync', rFreeze: 'Reverb Freeze',
  fA: 'Env 2 Attack', fD: 'Env 2 Decay', fS: 'Env 2 Sustain', fR: 'Env 2 Release', fEgMode: 'Env 2 Loop',
  aA: 'Env 1 Attack', aD: 'Env 1 Decay', aS: 'Env 1 Sustain', aR: 'Env 1 Release', aEgMode: 'Env 1 Loop', aMod: 'VCA LFO Mod', vcaHold: 'VCA Hold',
  eTime: 'Delay Time', eFb: 'Delay Feedback', eMix: 'Delay Mix', eTone: 'Delay Tone', eSpread: 'Delay Spread',
  rSize: 'Reverb Size', rDecay: 'Reverb Decay', rGrav: 'Reverb Gravity', rDark: 'Reverb Dark', rMix: 'Reverb Mix',
};
const LABELS = {
  lfoRange: ['Fast', 'Slow'], lfoMode: ['Triangle', 'Square', 'Random', 'Noise'], voice: ['Mono', 'Duo'],
  o1range: ["32'", "16'", "8'", "4'", "2'"], o2range: ["32'", "16'", "8'", "4'", "2'"], o1wave: ['Triangle', 'Saw', 'Pulse'], o2wave: ['Triangle', 'Saw', 'Pulse'],
  fMode: ['LP', 'BP'], chorus: ['Off', 'I', 'II', 'I+II'], eSync: ['Free', 'Sync'], rFreeze: ['Off', 'On'], fEgMode: ['Once', 'Loop'], aEgMode: ['Once', 'Loop'], vcaHold: ['Env', 'Hold'],
};
const rows = S.map((c) => {
  if (!NAME[c.id]) throw new Error('no name for ' + c.id);
  const labels = c.kind === 'knob' ? [] : LABELS[c.id];
  if (c.kind !== 'knob' && (!labels || labels.length !== (c.kind === 'sw' ? 2 : c.n))) throw new Error('labels for ' + c.id);
  const lo = c.kind === 'knob' ? (c.scale === 'bip' ? -1 : 0) : 0, hi = c.kind === 'knob' ? 1 : labels.length - 1;
  return `  { "${c.id}", "${NAME[c.id]}", ${c.kind === 'knob' ? 'true' : 'false'}, ${lo}, ${hi}, ${c.def}, ${labels.length}, { ${labels.map((l) => JSON.stringify(l)).join(', ') || 'nullptr'} } },`;
});
fs.writeFileSync(path.join(__dirname, '../src/Params.h'), `// Written by plugin/tools/params.js from the page's controls (src/controls.json): do not edit by hand.
// One automatable parameter per panel control, in the page's order.  The id is the page's.
#pragma once
namespace filth {
struct ParamDef { const char* id; const char* name; bool knob; double lo, hi, def; int nLabels; const char* labels[5]; };
static const ParamDef PARAMS[] = {
${rows.join('\n')}
};
static const int N_PARAMS = (int)(sizeof(PARAMS) / sizeof(PARAMS[0]));
}  // namespace filth
`);
console.log('src/Params.h: ' + rows.length + ' parameters');
