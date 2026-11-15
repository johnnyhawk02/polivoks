// ============================================================================
// Knob step sequencer: a PERFORMANCE FEATURE added on top of the model.
// It is not part of the Polivoks circuit.  Each knob can have its own step
// sequence; the sequence is a ± offset around where the knob is set, so
// turning the knob moves the centre and the sequence rides on top.  It runs
// at control rate (every CHUNK samples) and only ever calls the engine's
// setParam, exactly as turning the knob would, so the circuit model is
// untouched.  With every sequence off the engine sees the plain knob values.
// ============================================================================
class KnobSeq {
  constructor(sr, engine, report) {
    this.sr = sr; this.e = engine; this.report = report || null;
    this.base = {};      // knob settings as turned on the panel
    this.range = {};     // id -> [lo, hi]
    this.seq = {};       // id -> { on, len, div, depth, slew, drift, steps[16], eOn, eDepth, lOn, lDepth, e2On, e2Depth, vOn, vDepth, kOn, kDepth }; drift = % faster (+) or slower (−) than the clock
                         // mod sources: eDepth × the filter envelope (ENV 2 on the panel, 0…1), e2Depth × the amp envelope (ENV 1), lDepth × the LFO (±1), vDepth × key velocity (0…1), each ± of the knob's travel
    this.cur = {};       // slewed step value, −1..+1
    this.val = {};       // value last sent to the engine
    this.bpm = 120;
    this.pos = 0;        // clock position in 16th notes
    this.prevPos = 0; this.ph = {};   // phase of each sequence with DRIFT (16ths)
    this.time = 0;
    this.pulses = 0; this.extT = -1;   // MIDI clock, 24 pulses per quarter
    this.clkT = []; this.extBpm = 0;    // tempo measured from the MIDI clock
    this.repT = 0;
  }
  extActive() { return this.extT >= 0 && this.time - this.extT < 0.5; }
  param(id, v) { this.base[id] = v; const s = this.seq[id]; if (!KnobSeq.act(s)) this.e.setParam(id, v); }
  static act(s) { return !!(s && (s.on || s.eOn || s.lOn || s.e2On || s.vOn || s.kOn)); }   // the knob is moved by any of its sources
  setSeq(id, s, range) {
    const was = KnobSeq.act(this.seq[id]), wasOn = this.seq[id] && this.seq[id].on;
    this.seq[id] = s; if (range) this.range[id] = range;
    if (s.on && !wasOn) { this.cur[id] = 0; delete this.ph[id]; }
    if (!KnobSeq.act(s) && was && id in this.base) { this.e.setParam(id, this.base[id]); delete this.val[id]; }
  }
  setBpm(b) { this.bpm = Math.max(20, Math.min(300, b)); }
  // MIDI clock: each pulse is 1/6 of a 16th; Start goes back to step 1
  clock() {
    if (!this.extActive()) { this.pulses = Math.round(this.pos * 6); this.clkT.length = 0; }
    this.pulses++; this.pos = this.pulses / 6; this.extT = this.time;
    const c = this.clkT; c.push(this.time); if (c.length > 49) c.shift();
    if (c.length >= 13) {
      let b = 60 / ((c[c.length - 1] - c[0]) / (c.length - 1) * 24);
      if (Math.abs(b - Math.round(b)) < 0.3) b = Math.round(b);   // DAW tempos are mostly whole
      this.extBpm = Math.max(20, Math.min(300, b));
    }
  }
  start() { this.pulses = 0; this.pos = 0; this.extT = this.time; }
  stop() { this.extT = -1; this.clkT.length = 0; }
  // the clock's tempo: MIDI clock while it runs, else the internal BPM
  tempo() { return this.extActive() && this.extBpm ? this.extBpm : this.bpm; }
  tick(dt) {
    this.time += dt;
    if (!this.extActive()) this.pos += dt * this.bpm / 15;   // 4 sixteenths per beat
    let any = false;
    const dpos = this.pos - this.prevPos; this.prevPos = this.pos;
    const ph = {};
    for (const id in this.seq) {
      const s = this.seq[id]; if (!KnobSeq.act(s)) continue; any = true;
      let c = 0;
      if (s.on) {
      // DRIFT: 0 plays exactly to the clock; otherwise the sequence keeps its own phase that
      // runs (1 + drift / 100) times as fast as the clock, so it slides against the grid
      const dr = s.drift || 0;
      if (!dr || dpos < 0) this.ph[id] = this.pos;
      else this.ph[id] = (this.ph[id] === undefined ? this.pos - dpos : this.ph[id]) + dpos * (1 + dr / 100);
      if (dr) ph[id] = Math.floor(this.ph[id]);
      const step = Math.floor(this.ph[id] / s.div) % s.len;
      const k = s.slew > 0 ? 1 - Math.exp(-dt / s.slew) : 1;
      c = (this.cur[id] = (this.cur[id] || 0) + (s.steps[step] - (this.cur[id] || 0)) * k) * s.depth;
      }
      if (s.eOn) c += (s.eDepth || 0) * (this.e.envN || 0);
      if (s.e2On) c += (s.e2Depth || 0) * (this.e.env2N || 0);
      if (s.vOn) c += (s.vDepth || 0) * (this.e.vel == null ? 1 : this.e.vel);
      // KEY: the last key played, 0 at middle C (60), ±1 two octaves either side (a performance source, not circuit)
      if (s.kOn) c += (s.kDepth || 0) * Math.max(-1, Math.min(1, ((this.e.key == null ? 60 : this.e.key) - 60) / 24));
      if (s.lOn) c += (s.lDepth || 0) * Math.max(-1, Math.min(1, (this.e.lfoV || 0) / 1.43));   // triangle swings ±1.43 V
      const r = this.range[id] || [0, 1], b = id in this.base ? this.base[id] : r[0];
      const v = Math.max(r[0], Math.min(r[1], b + c * (r[1] - r[0])));
      if (v !== this.val[id]) { this.val[id] = v; this.e.setParam(id, v); }
    }
    this.repT += dt;
    if (this.report && this.repT >= 1 / 30) { this.repT = 0; this.report({ t: 'seqpos', pos: Math.floor(this.pos), ph, ext: this.extActive(), v: any ? Object.assign({}, this.val) : null }); }
  }
  render(out, n) {
    const C = 64;
    for (let i = 0; i < n; i += C) {
      const m = Math.min(C, n - i);
      this.tick(m / this.sr);
      this.e.render(i === 0 && m === n ? out : out.subarray(i, i + m), m);
    }
  }
  msg(d) {
    if (d.t === 'p') this.param(d.id, d.v);
    else if (d.t === 'seq') this.setSeq(d.id, d.s, d.range);
    else if (d.t === 'bpm') this.setBpm(d.v);
    else if (d.t === 'clk') this.clock();
    else if (d.t === 'cstart') this.start();
    else if (d.t === 'cstop') this.stop();
    else if (d.t === 'on') this.e.noteOn(d.n, d.v);
    else if (d.t === 'off') this.e.noteOff(d.n);
    else if (d.t === 'all') this.e.allOff();
    else if (d.t === 'prio') this.e.setPrio(d.v);
    else if (d.t === 'fmmod') this.e.setFmMod(d.v);
    else if (d.t === 'bend') this.e.setBend(d.v);
    else if (d.t === 'modw') this.e.setModWheel(d.v);
    else if (d.t === 'bendst') this.e.setBendRange(d.v);
  }
}

if (typeof module !== 'undefined') module.exports = { KnobSeq };
