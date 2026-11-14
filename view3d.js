// FILTH 3D view.  Loaded by index.html when the 3D view is chosen.
//
// The 2D panel keeps running underneath, laid out but unseen.  This view
// draws that same panel in 3D, taking every position from the 2D layout,
// and works the app's own controls: knobs and switches through c.set, the
// lower panel's buttons, sliders and lists through their own elements.  So
// presets, RANDOMISE, the sequencer, MIDI and saving are the app's, not a copy.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const A = window.filthApp;
const PINK = '#fc0fc0', INK = '#0b0b0b', PAPER = '#ffffff';
const DISPLAY = '"Archivo Black", "Rubik", "Arial Black", sans-serif', MONO = '"Geist Mono", ui-monospace, Menlo, monospace';
const KR = 17, DEPTH = 26, S2 = 2;      // knob radius, slab thickness, texture pixels per panel pixel
const panel = document.getElementById('panel'), low = document.getElementById('low');

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);

// ---------------------------------------------------------------- 2D layout -> panel pixels
function rel(el, root) {
  const r = el.getBoundingClientRect(), R = root.getBoundingClientRect(), k = R.width / root.offsetWidth || 1;
  return { x: (r.left - R.left) / k, y: (r.top - R.top) / k, w: r.width / k, h: r.height / k };
}
const UW = panel.offsetWidth, UH = panel.offsetHeight, LH = low.offsetHeight;
const GAPY = rel(low, panel).y - UH, TOTALH = UH + GAPY + LH;

// ---------------------------------------------------------------- drawing helpers
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w * S2); c.height = Math.ceil(h * S2); const x = c.getContext('2d'); x.scale(S2, S2); return [c, x]; }
function text(x, s, px, py, font, col = INK, align = 'center', ls = 0) {
  x.font = font; x.fillStyle = col; x.textAlign = align; x.textBaseline = 'middle';
  if ('letterSpacing' in x) x.letterSpacing = ls + 'px';
  x.fillText(s, px, py);
}
const linesOf = (el) => el ? el.innerHTML.split(/<br\s*\/?>/i).map((t) => { const d = document.createElement('div'); d.innerHTML = t; return d.textContent.trim(); }) : [];
const IC = { tri: [[2, 10], [8, 2], [14, 10]], saw: [[2, 10], [12, 2], [12, 10]], sq: [[2, 10], [2, 3], [8, 3], [8, 10], [14, 10]],
  sh: [[1, 8], [4, 8], [4, 3], [7, 3], [7, 10], [10, 10], [10, 5], [14, 5]], nz: [[1, 6], [2.5, 3], [4, 9], [5.5, 2], [7, 8], [8.5, 4], [10, 10], [11.5, 3], [13, 7]] };
const ang = (u) => (-135 + 270 * u) * Math.PI / 180;
const selA = (c, i) => { const n = c.opts.length, span = n === 5 ? 140 : 130; return (-span / 2 + span * i / (n - 1)) * Math.PI / 180; };
const toU = (c, v) => c.scale === 'bip' ? (v + 1) / 2 : v;
const fromU = (c, u) => c.scale === 'bip' ? u * 2 - 1 : u;

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;    // lights never move: redo shadows only when something tall moves
const cv = renderer.domElement;
Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', touchAction: 'none', display: 'block' });
document.body.appendChild(cv);
document.body.style.background = 'radial-gradient(120% 90% at 50% 40%, #2a2a2a 0%, #0b0b0b 70%)';
// a corner note: the version, and the way back to the flat panel
const corner = document.createElement('div');
corner.innerHTML = `FILTH v${A.VERSION} · <a href="?view=2d" style="color:inherit">2D VIEW</a>`;
Object.assign(corner.style, { position: 'fixed', right: '12px', bottom: '8px', font: `600 11px ${MONO}`, letterSpacing: '.1em', color: PINK });
document.body.appendChild(corner);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;
// a long lens from far away: every knob is seen almost straight on, only the shadows show depth
const camera = new THREE.PerspectiveCamera(5, 1, 1000, 200000);
// soft white light from the front, then two coloured lamps low at the sides,
// each throwing its own soft shadow: left (blue) follows VCO I, right (amber) VCO II
const amb = new THREE.HemisphereLight(0xffffff, 0x220011, 0.36); scene.add(amb);
const front = new THREE.DirectionalLight(0xffffff, 0.32); front.position.set(0, 300, 2000); scene.add(front);
// The ambient light's colour is the two VCOs' wave shapes, mixed by their
// MIXER levels: triangle soft pink, sawtooth icy blue, pulse gold.
const WAVE_COL = [new THREE.Color(0xff6ec8), new THREE.Color(0x4f9cff), new THREE.Color(0xffbf3a)];
const ambCol = new THREE.Color(0xffffff), ambWant = new THREE.Color();
const byId = (id) => A.S.find((c) => c.id === id);
const AMB = { w1: byId('o1wave'), w2: byId('o2wave'), m1: byId('mix1'), m2: byId('mix2') };
function driveAmbient() {
  let a = AMB.m1 ? AMB.m1.v : 0.5, b = AMB.m2 ? AMB.m2.v : 0.5;
  if (a + b < 0.02) a = b = 0.5;                 // both off: an even blend
  const c1 = WAVE_COL[Math.min(2, AMB.w1 ? AMB.w1.v | 0 : 1)], c2 = WAVE_COL[Math.min(2, AMB.w2 ? AMB.w2.v | 0 : 2)];
  ambWant.setRGB((c1.r * a + c2.r * b) / (a + b), (c1.g * a + c2.g * b) / (a + b), (c1.b * a + c2.b * b) / (a + b));
  ambCol.lerp(ambWant, 0.15);                    // a short fade when a wave changes
  amb.color.copy(ambCol); front.color.copy(ambCol);
}
const side = (color, x) => {
  const l = new THREE.SpotLight(color, 0.6, 0, 0.62, 1, 0);
  l.position.set(x, 160, 700); l.castShadow = true;
  l.shadow.mapSize.set(2048, 2048); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.6; l.shadow.radius = 6;
  l.shadow.camera.near = 200; l.shadow.camera.far = 5000;
  l.target.position.set(Math.sign(x) * 380, -40, 0); scene.add(l, l.target); return l;
};
const lamps = [side(0x3d8bff, -1300), side(0xffa020, 1300)];
const LAMP = [{ base: new THREE.Color(0x2f7dff), hi: new THREE.Color(0xbfe4ff), b: 0.6, t: 0 },
              { base: new THREE.Color(0xff9a10), hi: new THREE.Color(0xfff0b0), b: 0.6, t: 0 }];
function driveLamps() {
  const v = A.vco || [0, 0, 0, 0];
  LAMP.forEach((L, k) => {
    const t = Math.max(0, Math.min(1, (v[2 + k] + 4) / 7));          // 32' low notes .. 2' high notes
    const want = 2 * (0.3 + 5 * v[k] * (0.55 + 0.45 * t));
    L.b += (want - L.b) * (want > L.b ? 0.5 : 0.1); L.t += (t - L.t) * 0.2;
    lamps[k].intensity = L.b; lamps[k].color.copy(L.base).lerp(L.hi, L.t * 0.6);
  });
}

const rig = new THREE.Group(); scene.add(rig);
const upper = new THREE.Group(), lower = new THREE.Group();
upper.position.set(-UW / 2, TOTALH / 2, 0); lower.position.set(-UW / 2, TOTALH / 2 - UH - GAPY, 0);
rig.add(upper, lower); front.target = rig;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 4000), new THREE.ShadowMaterial({ opacity: 0.45 }));
floor.position.z = -DEPTH - 30; floor.receiveShadow = true; rig.add(floor);

const pos = (px, py, z = 0) => new THREE.Vector3(px, -py, z);   // panel px -> group local
const mat = {
  ink: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.38, metalness: 0.15 }),
  knobMatt: new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.97, metalness: 0, envMapIntensity: 0.15 }),
  knobRim: new THREE.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.33, metalness: 1, envMapIntensity: 0.06 }),
  inkMatte: new THREE.MeshLambertMaterial({ color: 0x050505 }),
  edge: new THREE.MeshStandardMaterial({ color: 0xb30a8c, roughness: 0.6 }),
  lit: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};
// a pink slab whose face is a canvas that can be painted again
function slab(w, h, paint) {
  const [c, ctx] = canvas(w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH), [mat.edge, mat.edge, mat.edge, mat.edge, face, mat.edge]);
  m.position.set(w / 2, -h / 2, -DEPTH / 2); m.receiveShadow = true; m.castShadow = true;
  m.userData.repaint = () => { ctx.fillStyle = PINK; ctx.fillRect(0, 0, w, h); paint(ctx); tex.needsUpdate = true; };
  return m;
}
// a raised plate with its own lettering on top (section names, buttons, title)
function plate(w, h, d, draw, opts = {}) {
  const [c, ctx] = canvas(w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const top = opts.bg === PINK ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 }) : new THREE.MeshLambertMaterial({ map: tex });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat.inkMatte, mat.inkMatte, mat.inkMatte, mat.inkMatte, top, mat.inkMatte]);
  m.geometry.translate(w / 2, -h / 2, d / 2); m.castShadow = true; m.receiveShadow = true;
  m.userData.redraw = (f) => { ctx.fillStyle = opts.bg || INK; ctx.fillRect(0, 0, w, h); f(ctx, w, h); tex.needsUpdate = true; };
  m.userData.redraw(draw);
  return m;
}
const rimGeo = (() => {
  const p = [[KR + 0.06, 11.4], [KR - 0.2, 13.4], [KR - 1.5, 15.6], [KR - 3.0, 16.5], [KR - 3.6, 16.56]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(p, 64); g.rotateX(Math.PI / 2); return g;
})();
const knobGeo = (() => {
  const p = [[0, 0], [KR + 2.5, 0], [KR + 2.5, 2.5], [KR + 0.6, 4.5], [KR, 12], [KR - 1.6, 15.5], [KR - 3.5, 16.5], [0, 16.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(p, 48); g.rotateX(Math.PI / 2); return g;
})();
const pointerGeo = new THREE.BoxGeometry(3, KR - 4, 1.2); pointerGeo.translate(0, 3 + (KR - 4) / 2, 16.7);
const selBarGeo = new THREE.BoxGeometry(6, KR + 2, 1.4); selBarGeo.translate(0, (KR + 2) / 2, 16.9);
const selInGeo = new THREE.BoxGeometry(2, KR - 6, 1.6); selInGeo.translate(0, 2 + (KR - 6) / 2, 17.2);
const leverGeo = new THREE.BoxGeometry(14, 12, 9); leverGeo.translate(0, 0, 4.5);
const dotGeo = new THREE.SphereGeometry(3.4, 16, 12);
const hits = [];                      // things the pointer can grab
const ticks = [];                     // per-frame checks: each returns nothing, redraws what changed
const hitBox = (w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); m.position.copy(pos(x, y, z)); parent.add(m); hits.push(m); return m; };

// ---------------------------------------------------------------- upper panel
const CTL = A.S.filter((c) => c.el && panel.contains(c.el));
function paintCtl(ctx, c) {
  const svg = c.el.querySelector('svg'), lab = c.el.querySelector('.lab');
  if (lab) {
    const r = rel(lab, panel), lines = linesOf(lab), seq = lab.classList.contains('seq');
    if (seq && lines.length) {   // a running sequence: label on a black slab in pink, as on the 2D panel
      ctx.font = `600 10.5px ${MONO}`; const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
      ctx.fillStyle = INK; ctx.fillRect(r.x + r.w / 2 - w / 2, r.y - 1, w, lines.length * 12 + 2);
    }
    lines.forEach((l, i) => text(ctx, l, r.x + r.w / 2, r.y + 6 + i * 12, `600 10.5px ${MONO}`, seq ? PINK : INK, 'center', .7));
  }
  const r = rel(c.el, panel);
  if (c.kind === 'knob') {
    const s = rel(svg, panel), cx = s.x + s.w / 2, cy = s.y + 34, n = c.scale === 'bip' ? 5 : 7;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i++) { const a = ang(i / (n - 1)); ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * (KR + 5), cy - Math.cos(a) * (KR + 5)); ctx.lineTo(cx + Math.sin(a) * (KR + 9), cy - Math.cos(a) * (KR + 9)); ctx.stroke(); }
    const g = ctx.createRadialGradient(cx, cy, KR, cx, cy, KR + 5); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, KR + 5, 0, 7); ctx.fill();
    if (c.added) { ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6); ctx.setLineDash([]); }
  } else if (c.kind === 'sel') {
    const s = rel(svg, panel), cx = s.x + s.w / 2, cy = s.y + 34;
    c.opts.forEach((o, i) => {
      const a = selA(c, i), px = cx + Math.sin(a) * (KR + 11), py = cy - Math.cos(a) * (KR + 12);
      if (o.t) text(ctx, o.t, px, py, `600 10.5px ${MONO}`);
      else { ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); IC[o.i].forEach(([u, v], k) => ctx[k ? 'lineTo' : 'moveTo'](px - 8 + u, py - 6 + v)); ctx.stroke(); }
    });
  } else if (c.kind === 'sw') {
    for (const t of c.el.querySelectorAll('.t')) { const q = rel(t, panel); text(ctx, t.textContent, q.x + q.w / 2, q.y + q.h / 2, `500 10px ${MONO}`, INK, 'center', .6); }
    const q = rel(c.el.querySelector('.slot'), panel);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(q.x - 1, q.y - 1, q.w + 2, q.h + 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2);
  }
}
function paintResp(ctx, bp) {
  const k = 72 / 96, P2 = (pts, w, dash) => { ctx.lineWidth = w; ctx.setLineDash(dash ? [2, 2] : []); ctx.beginPath(); pts.forEach(([a, b], i) => ctx[i ? 'lineTo' : 'moveTo'](a * k, b * k)); ctx.stroke(); };
  ctx.strokeStyle = INK;
  P2([[6, 6], [6, 62], [92, 62]], 1.2); P2([[88, 59], [92, 62], [88, 65]], 1.2);
  P2([[6, 24], [44, 24], [52, 62]], bp ? 1 : 2.4, bp); P2([[40, 62], [52, 8], [62, 62]], bp ? 2.4 : 1, !bp); ctx.setLineDash([]);
  text(ctx, 'LP', 14 * k, 17 * k, `500 8.5px ${MONO}`, INK, 'left'); text(ctx, 'BP', 64 * k, 51 * k, `500 8.5px ${MONO}`, INK, 'left');
}
function paintUpper(ctx) {
  for (const b of panel.querySelectorAll('.box')) { const r = rel(b, panel); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
  for (const c of CTL) paintCtl(ctx, c);
}
const upSlab = slab(UW, UH, paintUpper); upSlab.userData.repaint(); upper.add(upSlab);
// a sequence starting or stopping changes a label: repaint the face then
const seqSig = () => CTL.map((c) => { const l = c.el.querySelector('.lab'); return l && l.classList.contains('seq') ? 1 : 0; }).join('');
{ let last = seqSig(); ticks.push(() => { const s = seqSig(); if (s !== last) { last = s; upSlab.userData.repaint(); } }); }
// section names: raised black slabs over the top edge of each box
function sectionNames(root, group) {
  for (const h of root.querySelectorAll('.box h2')) {
    const r = rel(h, root), t = h.textContent;
    const p = plate(r.w, r.h, 4, (ctx, w, hh) => text(ctx, t, w / 2, hh / 2 + .5, `400 14px ${DISPLAY}`, PAPER, 'center', .42));
    p.position.copy(pos(r.x, r.y, 0)); group.add(p);
  }
}
sectionNames(panel, upper);
// filter response sketch
const respEl = panel.querySelector('.resp');
if (respEl) {
  const r = rel(respEl.querySelector('svg') || respEl, panel), fm = A.S.find((c) => c.id === 'fMode');
  const rp = plate(r.w, r.h, 0.4, () => {}, { bg: PINK }); rp.castShadow = false; rp.position.copy(pos(r.x, r.y, 0.05)); upper.add(rp);
  let last = null;
  ticks.push(() => { const bp = fm && fm.v >= 0.5; if (bp !== last) { last = bp; rp.userData.redraw((ctx) => paintResp(ctx, bp)); } });
}

// knobs, selectors, switches
const levers = new Set();
for (const c of CTL) {
  if (c.kind === 'knob' || c.kind === 'sel') {
    const s = rel(c.el.querySelector('svg'), panel), cx = s.x + s.w / 2, cy = s.y + 34;
    const g = new THREE.Group(); g.position.copy(pos(cx, cy, 0));
    const body = new THREE.Mesh(knobGeo, mat.knobMatt); body.castShadow = true; g.add(body, new THREE.Mesh(rimGeo, mat.knobRim));
    if (c.kind === 'knob') g.add(new THREE.Mesh(pointerGeo, mat.lit));
    else { g.add(new THREE.Mesh(selBarGeo, mat.lit)); g.add(new THREE.Mesh(selInGeo, mat.ink)); }
    upper.add(g); body.userData.ctl = c; hits.push(body); c.obj3 = body;
    let last = null;
    ticks.push(() => { if (c.v !== last) { last = c.v; g.rotation.z = -(c.kind === 'knob' ? ang(toU(c, c.v)) : selA(c, c.v)); } });
    if (c.kind === 'knob') {
      // white dot on the scale: where the knob's step sequence has it right now
      const dot = new THREE.Mesh(dotGeo, mat.lit); dot.visible = false; upper.add(dot);
      const show = c.showMod;
      c.showMod = (v) => {
        show(v);
        if (v == null) { dot.visible = false; return; }
        const a = ang(Math.max(0, Math.min(1, toU(c, v))));
        dot.position.copy(pos(cx + Math.sin(a) * (KR + 7), cy - Math.cos(a) * (KR + 7), 2)); dot.visible = true;
      };
    }
  } else if (c.kind === 'sw') {
    const q = rel(c.el.querySelector('.slot'), panel), cx = q.x + q.w / 2;
    const lev = new THREE.Mesh(leverGeo, mat.ink); lev.castShadow = true; upper.add(lev);
    const hit = hitBox(c.el.offsetWidth - 10, 62, 10, cx, q.y + q.h / 2, 5, upper); hit.userData.ctl = c; c.obj3 = hit;
    const at = (v) => { const down = c.id === 'fMode' ? !v : !!v; return down ? q.y + q.h - 2 - 6 : q.y + 2 + 6; };
    let last = c.v; lev.userData = { y: at(c.v), target: at(c.v), place: () => lev.position.copy(pos(cx, lev.userData.y, 0)) }; lev.userData.place();
    ticks.push(() => { if (c.v !== last) { last = c.v; lev.userData.target = at(c.v); levers.add(lev); } });
  }
}

// ---------------------------------------------------------------- FILTH
// The letters sit on their own layer: pushed about by a fixed noise whose
// depth is the modulator's output times how loud the synth is (as on the 2D
// panel), and lit up by the output level.
let title = null, titleU = null;
{
  const r = rel(panel.querySelector('.ttl'), panel), w = r.w, h = r.h, TILT = 0.22;
  const p = plate(w, h, 18, () => {});
  const layer = (blur) => {
    const [c, ctx] = canvas(w, h); if (blur) ctx.filter = `blur(${blur}px)`;
    text(ctx, 'FILTH', w / 2, h / 2 + 4, `400 86px ${DISPLAY}`, PAPER, 'center', .9);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  };
  titleU = { tText: { value: layer(0) }, tGlow: { value: layer(9) }, amt: { value: 0 }, lvl: { value: 0 }, size: { value: new THREE.Vector2(w, h) } };
  const sm = new THREE.ShaderMaterial({
    uniforms: titleU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tText, tGlow; uniform float amt, lvl; uniform vec2 size; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { return .65 * vn(p) + .35 * vn(p * 2.); }
      void main() {
        vec2 px = vUv * size * .045;
        vec2 d = vec2(fbm(px), fbm(px + 17.3)) - .5;
        vec2 uv = vUv + d * amt / size;
        float t = texture2D(tText, uv).a, g = texture2D(tGlow, uv).a;
        gl_FragColor = vec4(vec3(.74 + .26 * lvl) * t + vec3(1., .62, .95) * g * lvl * 1.2, 1.);
      }`,
  });
  const fg = new THREE.PlaneGeometry(w, h); fg.translate(w / 2, -h / 2, 18.15);
  p.add(new THREE.Mesh(fg, sm));
  const hinge = new THREE.Group(); hinge.position.copy(pos(r.x, r.y + h, 0)); hinge.rotation.x = TILT;
  p.position.set(0, h, 0); hinge.add(p); upper.add(hinge);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.sin(TILT) * h + 18), mat.inkMatte);
  skirt.position.copy(pos(r.x + w / 2, r.y + h / 2, (Math.sin(TILT) * h + 18) / 2 - 18)); skirt.castShadow = true; upper.add(skirt);
  title = p; p.userData.title = true; hits.push(p);
}
function driveTitle() {
  const W = A.WOB, v = Math.max(-1, Math.min(1, A.lfoV / W.vmax)) * Math.min(1, A.outRms / W.ref), a = W.on ? W.A * v : 0;
  titleU.amt.value = Math.abs(a) < 0.05 ? 0 : a;
  const want = Math.max(0, Math.min(1, (20 * Math.log10(A.outRms + 1e-9) + 36) / 30)), l = titleU.lvl.value;
  titleU.lvl.value = l + (want - l) * (want > l ? 0.45 : 0.07);   // quick to light, slow to fade
}

// ---------------------------------------------------------------- lower panel
// Everything here is the 2D panel's own elements: buttons click themselves,
// sliders and lists take their value and fire their own events, read-outs are
// read back every few frames and painted again when they change.
// how faded an element is on the 2D panel (a greyed-out sequencer, bars past the last step)
function fade(el) { let o = 1; for (let e = el; e && e !== low; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; }
const fadeMat = (m, o) => { for (const x of [].concat(m)) { if (x.transparent !== o < 1) { x.transparent = o < 1; x.needsUpdate = true; } x.opacity = o; } };
const lowEls = {
  boxes: [...low.querySelectorAll('.box')],
  texts: [...low.querySelectorAll('.f > span, .val, .pre-name')],
  ranges: [...low.querySelectorAll('input[type=range]')],
};
function paintLower(ctx) {
  for (const b of lowEls.boxes) { const r = rel(b, low); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
  for (const e of lowEls.texts) {
    if (!e.offsetParent && getComputedStyle(e).display === 'none') continue;
    const r = rel(e, low); ctx.globalAlpha = fade(e);
    if (e.classList.contains('pre-name')) {
      if (e.classList.contains('kept')) { ctx.fillStyle = PAPER; ctx.fillRect(r.x, r.y, r.w, r.h); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      const i = e.querySelector('i'), b = e.querySelector('b');
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + 4, r.y, r.w - 60, r.h); ctx.clip();
      text(ctx, i.textContent.toUpperCase(), r.x + 9, r.y + r.h / 2 + .5, `400 13px ${DISPLAY}`, INK, 'left', .26); ctx.restore();
      text(ctx, b.textContent, r.x + r.w - 9, r.y + r.h / 2 + .5, `600 11px ${MONO}`, INK, 'right');
    } else if (e.classList.contains('val')) {
      const left = e.style.textAlign === 'left';
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y - 4, r.w, r.h + 8); ctx.clip();
      text(ctx, e.textContent.toUpperCase(), left ? r.x : r.x + r.w / 2, r.y + r.h / 2, `600 12px ${MONO}`, INK, left ? 'left' : 'center', .5); ctx.restore();
    } else text(ctx, e.textContent.replace(/ /g, ' ').trim(), r.x, r.y + r.h / 2, `600 10.5px ${MONO}`, INK, 'left', .7);
  }
  ctx.globalAlpha = 1;
  for (const e of lowEls.ranges) { const r = rel(e, low); ctx.globalAlpha = fade(e); ctx.fillStyle = INK; ctx.fillRect(r.x, r.y + r.h / 2 - 2, r.w, 4); }
  ctx.globalAlpha = 1;
}
const lowSlab = slab(UW, LH, paintLower); lowSlab.userData.repaint(); lower.add(lowSlab);
{
  const sig = () => lowEls.texts.map((e) => e.textContent + (e.classList.contains('kept') ? '*' : '')).join('|') + lowEls.ranges.map(fade).join();
  let last = sig(), n = 0;
  ticks.push(() => { if (++n % 5) return; const s = sig(); if (s !== last) { last = s; lowSlab.userData.repaint(); } });
}
sectionNames(low, lower);
// buttons
for (const el of low.querySelectorAll('button')) {
  if (el.closest('[hidden]')) continue;
  const r = rel(el, low); if (!r.w) continue;
  const draw = (ctx, w, h) => text(ctx, el.textContent.toUpperCase(), w / 2, h / 2 + .5, `400 12px ${DISPLAY}`, el.classList.contains('lit') ? PINK : PAPER);
  const p = plate(r.w, r.h, 6, draw); p.position.copy(pos(r.x, r.y, 0)); lower.add(p);
  p.userData.btn = el; hits.push(p);
  let last = el.textContent + el.className, lastF = 1, n = 0;
  ticks.push(() => {
    const s = el.textContent + el.className; if (s !== last) { last = s; p.userData.redraw(draw); }
    if (++n % 5 === 0) { const f = fade(el); if (f !== lastF) { lastF = f; p.material = p.material.map((m) => m.clone()); fadeMat(p.material, f); p.castShadow = f > 0.5; renderer.shadowMap.needsUpdate = true; } }
  });
}
// lists (which knob to sequence, saved presets)
for (const el of low.querySelectorAll('select')) {
  const r = rel(el, low);
  const label = () => { const o = el.selectedOptions[0]; return (o ? o.textContent : '').toUpperCase() + ' ▾'; };
  const draw = (ctx, w, h) => { ctx.save(); ctx.beginPath(); ctx.rect(4, 0, w - 8, h); ctx.clip(); text(ctx, label(), w / 2, h / 2 + .5, `400 13px ${DISPLAY}`, PAPER); ctx.restore(); };
  const p = plate(r.w, r.h, 6, draw); p.position.copy(pos(r.x, r.y, 0)); lower.add(p);
  p.userData.sel = el; hits.push(p);
  let last = label();
  ticks.push(() => { const s = label(); if (s !== last) { last = s; p.userData.redraw(draw); } });
}
// open a list: the browser's own picker where it can, otherwise the next entry
function openList(el) {
  try { el.style.visibility = 'visible'; el.style.opacity = '0'; el.showPicker(); return; } catch (e) { /* fall through */ }
  const ok = [...el.options].filter((o) => !o.disabled);
  if (!ok.length) return;
  const i = ok.indexOf(el.selectedOptions[0]); el.value = ok[(i + 1) % ok.length].value;
  el.dispatchEvent(new Event('change'));
}
// sliders
for (const el of lowEls.ranges) {
  const r = rel(el, low), min = +el.min || 0, max = +el.max || 100;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 7, 24), mat.ink.clone()); t.rotation.x = Math.PI / 2; t.castShadow = true; lower.add(t);
  const hit = hitBox(r.w + 16, 26, 14, r.x + r.w / 2, r.y + r.h / 2, 3, lower); hit.userData.range = { el, r, min, max };
  let last = null, n = 0;
  ticks.push(() => { if (++n % 5 === 0) fadeMat(t.material, fade(el)); if (el.value !== last) { last = el.value; t.position.copy(pos(r.x + (el.value - min) / (max - min) * r.w, r.y + r.h / 2, 3.5)); renderer.shadowMap.needsUpdate = true; } });
}
// step bars of the knob being sequenced
const gridEl = low.querySelector('.sq-grid');
if (gridEl) {
  const R = rel(gridEl, low), barEls = [...gridEl.children];
  const frameTex = (kind) => {
    const b = rel(barEls[0], low), [c, ctx] = canvas(b.w, b.h);
    ctx.fillStyle = kind === 'now' ? PAPER : PINK; ctx.fillRect(0, 0, b.w, b.h);
    ctx.globalAlpha = kind === 'off' ? 0.25 : 1;
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(1, 1, b.w - 2, b.h - 2);
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, b.h / 2); ctx.lineTo(b.w, b.h / 2); ctx.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const tex = { on: frameTex('on'), now: frameTex('now'), off: frameTex('off') };
  const glowTex = (() => {
    const b = rel(barEls[0], low), w = b.w + 28, h = b.h + 28, [c, ctx] = canvas(w, h);
    ctx.filter = 'blur(9px)'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(14, 14, b.w, b.h);
    ctx.filter = 'none'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.strokeRect(12.5, 12.5, b.w + 3, b.h + 3);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const bars = barEls.map((be) => {
    const b = rel(be, low);
    const fm = new THREE.MeshStandardMaterial({ map: tex.on, roughness: 0.78 });
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), fm); frame.position.copy(pos(b.x + b.w / 2, b.y + b.h / 2, 0.3)); lower.add(frame);
    const bm = new THREE.MeshLambertMaterial({ color: 0x050505, transparent: true });
    const blk = new THREE.Mesh(new THREE.BoxGeometry(b.w - 4, 1, 10), bm); blk.castShadow = true; lower.add(blk);
    // the running light: a soft white glow over the step playing now, fading behind it
    const gm = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 28, b.h + 28), gm); glow.position.copy(pos(b.x + b.w / 2, b.y + b.h / 2, 11)); lower.add(glow);
    bm.emissive = new THREE.Color(0xff3fd0); bm.emissiveIntensity = 0;
    return { b, fm, bm, blk, gm, g: 0, sig: '' };
  });
  const hit = hitBox(R.w, R.h, 14, R.x + R.w / 2, R.y + R.h / 2, 6, lower); hit.userData.grid = R;
  let glowT = 0;
  ticks.push(() => {
    const c = A.edC; if (!c) return;
    const s = A.seqOf(c.id), p = A.lastPos, now = s.on && p ? Math.floor(p.pos / s.div) % s.len : -1, gf = s.on ? 1 : 0.35;
    let moved = false;
    bars.forEach((B, i) => {
      const v = s.steps[i], kind = i === now ? 'now' : i >= s.len ? 'off' : 'on', sig = v + kind + gf;
      if (sig === B.sig) return; B.sig = sig; moved = true;
      B.fm.map = tex[kind]; B.fm.needsUpdate = true; fadeMat(B.fm, gf); B.bm.opacity = (kind === 'off' ? 0.25 : 1) * gf;
      const h = Math.max(0.01, Math.abs(v) * (B.b.h / 2));
      B.blk.scale.y = h; B.blk.visible = Math.abs(v) > 0.005;
      B.blk.position.copy(pos(B.b.x + B.b.w / 2, B.b.y + B.b.h / 2 - (v >= 0 ? h / 2 : -h / 2), 5.3));
    });
    if (moved) renderer.shadowMap.needsUpdate = true;
    const t = performance.now(), k = Math.exp(-(t - (glowT || t)) / 110); glowT = t;   // fades with a 0.11 s time constant
    bars.forEach((B, i) => {   // glow: full on the step playing now, then a quick fade
      B.g = i === now ? 1 : B.g * k; if (B.g < 0.01) B.g = 0;
      B.gm.opacity = 0.55 * B.g; B.bm.emissiveIntensity = 0.9 * B.g;
    });
  });
}
// paint steps by dragging across the bars (as on the 2D panel: drawing switches the sequence on)
let paint = null;
function paintAt(R, lp) {
  const i = Math.max(0, Math.min(15, Math.floor((lp.x - R.x) / R.w * 16)));
  let v = Math.max(-1, Math.min(1, 1 - 2 * (-lp.y - R.y) / R.h)); if (Math.abs(v) < 0.06) v = 0; v = Math.round(v * 100) / 100;
  const [i0, v0] = paint || [i, v];
  A.change((s) => { const n = Math.abs(i - i0); for (let k = 0; k <= n; k++) { const j = i0 + Math.sign(i - i0) * k; s.steps[j] = n ? v0 + (v - v0) * k / n : v; } s.on = true; });
  paint = [i, v];
}

// ---------------------------------------------------------------- camera: face on, fixed
let dist = 2000;
const target = new THREE.Vector3(0, -10, 0);
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  rig.updateMatrixWorld(true);
  const pts = [];
  for (const x of [-UW / 2, UW / 2]) for (const y of [TOTALH / 2, -TOTALH / 2]) for (const z of [0, -DEPTH]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(rig.matrixWorld));
  for (dist = 2000; dist < 200000; dist *= 1.02) {
    camera.position.set(target.x, target.y, target.z + dist); camera.lookAt(target); camera.updateMatrixWorld();
    if (pts.every((p) => { const q = p.clone().project(camera); return Math.abs(q.x) < 0.96 && Math.abs(q.y) < 0.93; })) break;
  }
}
addEventListener('resize', fit); fit();

// ---------------------------------------------------------------- pointer
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const aim = (e) => { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); };
function pick(e) { aim(e); const h = ray.intersectObjects(hits, false)[0]; return h ? h.object : null; }
function onLower(e) {
  aim(e);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0).applyMatrix4(lower.matrixWorld);
  const p = ray.ray.intersectPlane(plane, new THREE.Vector3()); return p ? lower.worldToLocal(p) : null;
}
let grab = null;
const pressed = (o) => { o.position.z = -3; setTimeout(() => { o.position.z = 0; }, 120); };
cv.addEventListener('pointerdown', (e) => {
  const o = pick(e); grab = null;
  if (!o) return;
  cv.setPointerCapture(e.pointerId); e.preventDefault();
  const u = o.userData;
  if (u.title) { grab = { note: true }; A.on(48, 'ui'); }
  else if (u.ctl) {
    const c = u.ctl; grab = { c, y0: e.clientY, v0: c.v, moved: false, scale: 220 * Math.min(1, innerWidth / 1400) + 80 };
    if (c.kind === 'knob' && e.button === 0) A.pickSeq(c);
  } else if (u.btn) { pressed(o); u.btn.click(); }
  else if (u.sel) { pressed(o); openList(u.sel); }
  else if (u.range) { grab = { range: u.range }; slide(e); }
  else if (u.grid) { paint = null; grab = { grid: u.grid }; const lp = onLower(e); if (lp) paintAt(u.grid, lp); }
});
function slide(e) {
  const { el, r, min, max } = grab.range, lp = onLower(e); if (!lp) return;
  const u = Math.max(0, Math.min(1, (lp.x - r.x) / r.w)), v = Math.round(min + u * (max - min));
  if (+el.value !== v) { el.value = v; el.dispatchEvent(new Event('input')); }
}
cv.addEventListener('pointermove', (e) => {
  if (!grab || !e.buttons) return;
  if (grab.c) {
    const c = grab.c, dy = grab.y0 - e.clientY;
    if (Math.abs(dy) > 4) grab.moved = true;
    if (c.kind === 'knob') c.set(fromU(c, Math.max(0, Math.min(1, toU(c, grab.v0) + dy / (e.shiftKey ? 1200 : grab.scale)))));
    else if (c.kind === 'sel') c.set(grab.v0 + Math.round(dy / 22));
  } else if (grab.range) slide(e);
  else if (grab.grid) { const lp = onLower(e); if (lp) paintAt(grab.grid, lp); }
});
function release() {
  if (grab && grab.c && !grab.moved) {
    const c = grab.c;
    if (c.kind === 'sw') c.set(c.v ? 0 : 1);
    else if (c.kind === 'sel') c.set((c.v + 1) % c.opts.length);
  }
  if (grab && grab.note) A.off(48, 'ui');
  grab = null; paint = null;
}
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('dblclick', (e) => { const o = pick(e); if (o && o.userData.ctl && o.userData.ctl.kind === 'knob') o.userData.ctl.set(o.userData.ctl.def); });

// ---------------------------------------------------------------- frame
renderer.shadowMap.needsUpdate = true;
function frame() {
  for (const t of ticks) t();
  for (const lev of levers) {
    const d = lev.userData.target - lev.userData.y; lev.userData.y += d * 0.35;
    if (Math.abs(d) < 0.2) { lev.userData.y = lev.userData.target; levers.delete(lev); }
    lev.userData.place(); renderer.shadowMap.needsUpdate = true;
  }
  driveLamps(); driveTitle(); driveAmbient();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
// for headless checks: where a control is on screen
window.filth3d = {
  ready: true,
  where(o) { const v = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
  ctl(id) { return this.where(A.S.find((c) => c.id === id).obj3); },
  // centre of a lower-panel element (button, list, slider, bars) on screen
  el(sel) { const e = low.querySelector(sel), r = rel(e, low); const v = pos(r.x + r.w / 2, r.y + r.h / 2, 3).applyMatrix4(lower.matrixWorld).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
  lamps: () => lamps.map((l) => +l.intensity.toFixed(2)),
  ambient: () => '#' + amb.color.getHexString(),
  probe(x, y) { const lp = onLower({ clientX: x, clientY: y }); const o = pick({ clientX: x, clientY: y }); return [lp && lp.x, lp && lp.y, o && Object.keys(o.userData)]; },
};
