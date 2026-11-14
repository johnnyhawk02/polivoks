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
const KR = 22, DEPTH = 26, S2 = 2;      // knob radius (the 2D panel's is 17), slab thickness, texture pixels per panel pixel
const panel = document.getElementById('panel'), low = document.getElementById('low');

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);

// ---------------------------------------------------------------- 2D layout -> panel pixels
function rel(el, root) {
  const r = el.getBoundingClientRect(), R = root.getBoundingClientRect(), k = R.width / root.offsetWidth || 1;
  return { x: (r.left - R.left) / k, y: (r.top - R.top) / k, w: r.width / k, h: r.height / k };
}
const UW = panel.offsetWidth, UH = panel.offsetHeight, LH = low.offsetHeight;
const TOTALH = UH + LH;   // the two panels meet: no gap between them in 3D

// ---------------------------------------------------------------- drawing helpers
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w * S2); c.height = Math.ceil(h * S2); const x = c.getContext('2d'); x.scale(S2, S2); return [c, x]; }
function text(x, s, px, py, font, col = INK, align = 'center', ls = 0) {
  x.font = font; x.fillStyle = col; x.textAlign = align; x.textBaseline = 'middle';
  if ('letterSpacing' in x) x.letterSpacing = ls + 'px';
  x.fillText(s, px, py);
}
const fs = (el) => parseFloat(getComputedStyle(el).fontSize) || 12;
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
const vignette = document.createElement('div');
Object.assign(vignette.style, { position: 'fixed', inset: '0', pointerEvents: 'none', background: 'radial-gradient(130% 110% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)' });
document.body.appendChild(vignette);
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
const amb = new THREE.HemisphereLight(0xffffff, 0x220011, 1.0); scene.add(amb);
const front = new THREE.DirectionalLight(0xffffff, 0.4); front.position.set(0, 300, 2000); scene.add(front);
let bgHex = '';
// the pink of every face is swapped for this colour in the shader (black ink and white stay as they are)
const tintMats = [], TINT = { uTint: { value: new THREE.Color(0xff1fa8) }, uAmt: { value: 0.9 }, uInk: { value: new THREE.Color(0, 0, 0) }, uDark: { value: 0 }, uInkAmt: { value: 1 } };
function tintable(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = TINT.uTint; sh.uniforms.uAmt = TINT.uAmt; sh.uniforms.uInk = TINT.uInk; sh.uniforms.uDark = TINT.uDark; sh.uniforms.uInkAmt = TINT.uInkAmt;
    // lettering and rules (the dark parts of the painted face) are drawn last in pure black, or
    // white on a dark panel, so neither the panel colour nor the coloured lights ever tint them
    sh.fragmentShader = 'uniform vec3 uTint; uniform float uAmt; uniform vec3 uInk; uniform float uDark; uniform float uInkAmt;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      float inkK = clamp(1.0 - diffuseColor.r * 1.1, 0., 1.);
      float paperK = clamp((min(diffuseColor.r, diffuseColor.g) - 0.6) * 2.5, 0., 1.) * uDark;   // white parts turn black on a dark panel
      { float pinkness = clamp((diffuseColor.r - diffuseColor.g) * 1.05, 0., 1.);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.2 + 0.4 * diffuseColor.r), uAmt * pinkness); }`)
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb = mix(mix(gl_FragColor.rgb, uInk, inkK * uInkAmt), vec3(0.), paperK * uInkAmt);\n#include <dithering_fragment>');
  };
  tintMats.push(m); return m;
}
// steady too: the ambient and front light as set in OPTIONS, the pink of the
// faces swapped for the PANEL COLOUR, and a glow of it in the room behind
const panelCol = new THREE.Color();
// matt: no shine at all; plastic: a soft gloss; metallic: anodised metal, the colour in the reflections
const FINISH = { matt: { r: 0.95, m: 0, e: 0.2 }, plastic: { r: 0.42, m: 0, e: 0.55 }, metal: { r: 0.5, m: 0.6, e: 1.1, brushed: true } };
// metallic panels are brushed: fine horizontal streaks in how rough the surface is
const brushed = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 90 | 0; x.fillStyle = `rgba(${v},${v},${v},.35)`; x.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 220, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
})();
function driveAmbient() {
  const L = A.look.lights, sig = [A.look.hue, A.look.sat, A.look.lit, A.look.finish, A.look.text].join() + JSON.stringify(L);
  if (sig === bgHex) return; bgHex = sig;
  amb.color.set(L.amb.c); amb.groundColor.copy(amb.color).multiplyScalar(0.25); amb.intensity = 0.45 * L.amb.i;
  front.color.set(L.amb.c); front.intensity = 0.35 * L.amb.i;
  panelCol.setHSL(A.look.hue, A.look.sat, A.look.lit); TINT.uTint.value.copy(panelCol);
  const dark = A.look.lit < 0.22; TINT.uInk.value.setScalar(dark ? 1 : 0); TINT.uDark.value = dark ? 1 : 0; TINT.uInkAmt.value = A.look.text;   // white lettering on a dark panel, and its black labels turn white
  // FINISH: how the panel faces take the light
  const F = FINISH[A.look.finish] || FINISH.matt;
  for (const m of tintMats) { m.roughness = F.r; m.metalness = F.m; m.envMapIntensity = F.e; const rm = F.brushed ? brushed : null; if (m.roughnessMap !== rm) { m.roughnessMap = rm; m.needsUpdate = true; } }
  const c = panelCol.clone().multiplyScalar(0.45);
  document.body.style.background = `radial-gradient(120% 90% at 50% 40%, #${c.getHexString()} 0%, #0b0b0b 75%)`;
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
// the side lamps are steady: colour and brightness as set in OPTIONS
function driveLamps() {
  const L = A.look.lights;
  lamps[0].color.set(L.left.c); lamps[0].intensity = 1.6 * L.left.i;
  lamps[1].color.set(L.right.c); lamps[1].intensity = 1.6 * L.right.i;
}

const rig = new THREE.Group(); scene.add(rig);
const upper = new THREE.Group(), lower = new THREE.Group();
// the top panel sits on a hinge along the join, so ANGLE (OPTIONS) tips it up toward you
const hinge = new THREE.Group(); hinge.position.set(-UW / 2, TOTALH / 2 - UH, 0);
upper.position.set(0, UH, 0); hinge.add(upper);
// and the bottom panel on its own hinge at the same join: BOTTOM ANGLE brings its front edge toward you
const hingeLow = new THREE.Group(); hingeLow.position.set(-UW / 2, TOTALH / 2 - UH, 0); hingeLow.add(lower);
rig.add(hinge, hingeLow); front.target = rig;
{ // the join: a dark rounded spine along the seam, seen as the top panel tips up
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(DEPTH / 2, DEPTH / 2, UW, 32), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }));
  spine.rotation.z = Math.PI / 2; spine.position.set(0, TOTALH / 2 - UH, -DEPTH / 2); spine.castShadow = true; rig.add(spine);
}
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
  const face = tintable(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 }));
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
  if (opts.bg === PINK) tintable(top);
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
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });   // knob value rings: lit, like the pointers
const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
const hits = [];                      // things the pointer can grab
const ticks = [];                     // per-frame checks: each returns nothing, redraws what changed
const hitBox = (w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); m.position.copy(pos(x, y, z)); parent.add(m); hits.push(m); return m; };

// ---------------------------------------------------------------- upper panel
const CTL = A.S.filter((c) => c.el && panel.contains(c.el));
function paintCtl(ctx, c) {
  const svg = c.el.querySelector('svg'), lab = c.el.querySelector('.lab');
  if (lab) {
    const r = rel(lab, panel), seq = lab.classList.contains('seq'), size = fs(lab), lh = size + 2, font = `600 ${size}px ${MONO}`;
    const cell = rel(c.el, panel).w - 4;
    ctx.font = font; if ('letterSpacing' in ctx) ctx.letterSpacing = '.5px';
    // wrap at spaces where a line is wider than the cell
    const lines = [];
    for (const l of linesOf(lab)) {
      let cur = '';
      for (const w of l.split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(t).width > cell) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
    }
    if (seq && lines.length) {   // a running sequence: label on a black slab in pink, as on the 2D panel
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
      ctx.fillStyle = INK; ctx.fillRect(r.x + r.w / 2 - w / 2, r.y - 1, w, lines.length * lh + 2);
    }
    lines.forEach((l, i) => text(ctx, l, r.x + r.w / 2, r.y + lh / 2 + i * lh, font, seq ? PINK : INK, 'center', .5));
  }
  const r = rel(c.el, panel);
  if (c.kind === 'knob') {
    const s = rel(svg, panel), cx = s.x + s.w / 2, cy = s.y + 40, n = c.scale === 'bip' ? 5 : 7;
    // the value ring's track: a dark groove from min to max, ticks just outside it
    ctx.strokeStyle = 'rgba(11,11,11,.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, KR + 5.2, -Math.PI / 2 + ang(0), -Math.PI / 2 + ang(1)); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
    for (let i = 0; i < n; i++) { const a = ang(i / (n - 1)); ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * (KR + 8.5), cy - Math.cos(a) * (KR + 8.5)); ctx.lineTo(cx + Math.sin(a) * (KR + 11), cy - Math.cos(a) * (KR + 11)); ctx.stroke(); }
    const g = ctx.createRadialGradient(cx, cy, KR, cx, cy, KR + 5); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, KR + 5, 0, 7); ctx.fill();
    if (c.added) { ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6); ctx.setLineDash([]); }
  } else if (c.kind === 'sel') {
    const s = rel(svg, panel), cx = s.x + s.w / 2, cy = s.y + 40;
    c.opts.forEach((o, i) => {
      const a = selA(c, i), px = cx + Math.sin(a) * (KR + 11), py = cy - Math.cos(a) * (KR + 12);
      if (o.t) text(ctx, o.t, px, py, `600 12px ${MONO}`);
      else { ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); IC[o.i].forEach(([u, v], k) => ctx[k ? 'lineTo' : 'moveTo'](px - 8 + u, py - 6 + v)); ctx.stroke(); }
    });
  } else if (c.kind === 'sw') {
    // the side the switch is set to: its word on a black slab in white; the other side faded
    const down = c.id === 'fMode' ? !c.v : !!c.v;
    [...c.el.querySelectorAll('.t')].forEach((t, i) => {
      const q = rel(t, panel), on = (i === 1) === down, font = `600 ${fs(t)}px ${MONO}`;
      if (on) { ctx.font = font; const w = ctx.measureText(t.textContent).width + 10; ctx.fillStyle = INK; ctx.fillRect(q.x + q.w / 2 - w / 2, q.y - 1, w, q.h + 2); }
      ctx.globalAlpha = on ? 1 : 0.4; text(ctx, t.textContent, q.x + q.w / 2, q.y + q.h / 2, font, on ? PAPER : INK, 'center', .6); ctx.globalAlpha = 1;
    });
    const q = rel(c.el.querySelector('.slot'), panel);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(q.x - 1, q.y - 1, q.w + 2, q.h + 2);
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
// a section: a plain black rule, flat
function recess(ctx, r) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
function paintUpper(ctx) {
  for (const b of panel.querySelectorAll('.box')) recess(ctx, rel(b, panel));
  for (const c of CTL) paintCtl(ctx, c);
  // CLIP LED: its label, and a black bezel the lamp sits in
  for (const el of panel.querySelectorAll('.ledc')) {
    const lab = el.querySelector('.lab'), l = rel(lab, panel), d = rel(el.querySelector('.led'), panel);
    text(ctx, lab.textContent, l.x + l.w / 2, l.y + (fs(lab) + 2) / 2, `600 ${fs(lab)}px ${MONO}`, INK, 'center', .5);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(d.x + d.w / 2, d.y + d.h / 2, d.w / 2 + 3, 0, 7); ctx.fill();
  }
  if (respEl) { const r = rel(respEl.querySelector('svg') || respEl, panel); ctx.save(); ctx.translate(r.x, r.y); paintResp(ctx, fmCtl && fmCtl.v >= 0.5); ctx.restore(); }
}
const respEl = panel.querySelector('.resp'), fmCtl = A.S.find((c) => c.id === 'fMode');
const upSlab = slab(UW, UH, paintUpper); upSlab.userData.repaint(); upper.add(upSlab);
// a sequence starting or stopping changes a label: repaint the face then
const seqSig = () => CTL.map((c) => { const l = c.el.querySelector('.lab'); return (l && l.classList.contains('seq') ? 1 : 0) + (c.kind === 'sw' ? 's' + c.v : ''); }).join('');
{ let last = seqSig(); ticks.push(() => { const s = seqSig(); if (s !== last) { last = s; upSlab.userData.repaint(); } }); }
// section names: raised black slabs over the top edge of each box
function sectionNames(root, group) {
  for (const h of root.querySelectorAll('.box h2')) {
    const r = rel(h, root), t = h.textContent;
    const size = fs(h), p = plate(r.w, r.h, 4, (ctx, w, hh) => text(ctx, t, w / 2, hh / 2 + .5, `400 ${size}px ${DISPLAY}`, PAPER, 'center', .42));
    p.position.copy(pos(r.x, r.y, 0)); group.add(p);
  }
}
sectionNames(panel, upper);
// filter response sketch: painted into the panel face, which is repainted when the filter type changes
{ let last = fmCtl && fmCtl.v; ticks.push(() => { if (fmCtl && fmCtl.v !== last) { last = fmCtl.v; upSlab.userData.repaint(); } }); }

// knobs, selectors, switches
const levers = new Set();
for (const c of CTL) {
  if (c.kind === 'knob' || c.kind === 'sel') {
    const s = rel(c.el.querySelector('svg'), panel), cx = s.x + s.w / 2, cy = s.y + 40;
    const g = new THREE.Group(); g.position.copy(pos(cx, cy, 0));
    const body = new THREE.Mesh(knobGeo, mat.knobMatt); body.castShadow = true; g.add(body, new THREE.Mesh(rimGeo, mat.knobRim));
    if (c.kind === 'knob') g.add(new THREE.Mesh(pointerGeo, mat.lit));
    else { g.add(new THREE.Mesh(selBarGeo, mat.lit)); g.add(new THREE.Mesh(selInGeo, mat.ink)); }
    upper.add(g); body.userData.ctl = c; hits.push(body); c.obj3 = body;
    let last = null;
    let arc = null, halo = null;
    if (c.kind === 'knob') {
      arc = new THREE.Mesh(new THREE.BufferGeometry(), ringMat); arc.position.copy(pos(cx, cy, 0.4)); upper.add(arc);
      halo = new THREE.Mesh(new THREE.BufferGeometry(), haloMat); halo.position.copy(pos(cx, cy, 0.3)); upper.add(halo);
    }
    ticks.push(() => {
      if (c.v === last) return; last = c.v;
      g.rotation.z = -(c.kind === 'knob' ? ang(toU(c, c.v)) : selA(c, c.v));
      if (arc) {
        const a0 = c.scale === 'bip' ? 0 : ang(0), a1 = ang(toU(c, c.v)), lo = Math.min(a0, a1), hi = Math.max(a0, a1);
        arc.geometry.dispose();
        arc.geometry = new THREE.RingGeometry(KR + 3.4, KR + 7, 48, 1, Math.PI / 2 - hi, Math.max(0.0001, hi - lo));
        halo.geometry.dispose(); halo.geometry = new THREE.RingGeometry(KR + 1.5, KR + 10, 48, 1, Math.PI / 2 - hi, Math.max(0.0001, hi - lo));
        arc.visible = halo.visible = hi - lo > 0.01;
      }
    });
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
    const lev = new THREE.Mesh(leverGeo, mat.lit); lev.castShadow = true; upper.add(lev);   // white, so its position reads at a glance
    const hit = hitBox(c.el.offsetWidth - 10, 62, 10, cx, q.y + q.h / 2, 5, upper); hit.userData.ctl = c; c.obj3 = hit;
    const at = (v) => { const down = c.id === 'fMode' ? !v : !!v; return down ? q.y + q.h - 2 - 6 : q.y + 2 + 6; };
    let last = c.v; lev.userData = { y: at(c.v), target: at(c.v), place: () => lev.position.copy(pos(cx, lev.userData.y, 0)) }; lev.userData.place();
    ticks.push(() => { if (c.v !== last) { last = c.v; lev.userData.target = at(c.v); levers.add(lev); } });
  }
}

// ---------------------------------------------------------------- CLIP LED
// a red lamp that lights when the output reaches the soft clipper
{
  const el = panel.querySelector('.ledc .led');
  if (el) {
    const d = rel(el, panel), r = d.w / 2, cx = d.x + r, cy = d.y + r;
    const lm = new THREE.MeshBasicMaterial({ color: 0x3a0008 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 4, 32), lm); lamp.rotation.x = Math.PI / 2; lamp.position.copy(pos(cx, cy, 2)); upper.add(lamp);
    const [gc, gx] = canvas(64, 64), gr = gx.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,60,40,1)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    const hm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(r * 7, r * 7), hm); halo.position.copy(pos(cx, cy, 4.5)); upper.add(halo);
    const off = new THREE.Color(0x3a0008), on = new THREE.Color(0xff3020);
    ticks.push(() => { const v = Math.min(1, A.clip || 0); lm.color.copy(off).lerp(on, Math.min(1, v * 1.6)); hm.opacity = 0.9 * v; });
  }
}

// ---------------------------------------------------------------- FILTH
// The letters sit on their own layer: pushed about by a fixed noise whose
// depth is the modulator's output times how loud the synth is (as on the 2D
// panel), and lit up by the output level.
let title = null, titleU = null;
{
  const r = rel(panel.querySelector('.ttl'), panel), w = r.w, h = r.h, TILT = 0;   // flat, raised plate
  const p = plate(w, h, 8, () => {});   // a thin plate, so tipping the top panel up never lets it cover the AMPLIFIER name
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
  const fg = new THREE.PlaneGeometry(w, h); fg.translate(w / 2, -h / 2, 8.15);
  p.add(new THREE.Mesh(fg, sm));
  const hinge = new THREE.Group(); hinge.position.copy(pos(r.x, r.y + h, 0)); hinge.rotation.x = TILT;
  p.position.set(0, h, 0); hinge.add(p); upper.add(hinge);
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
  for (const b of lowEls.boxes) recess(ctx, rel(b, low));
  for (const e of lowEls.texts) {
    if (!e.offsetParent && getComputedStyle(e).display === 'none') continue;
    const r = rel(e, low); ctx.globalAlpha = fade(e);
    if (e.classList.contains('pre-name')) {
      if (e.classList.contains('kept')) { ctx.fillStyle = PAPER; ctx.fillRect(r.x, r.y, r.w, r.h); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      const i = e.querySelector('i'), b = e.querySelector('b');
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + 4, r.y, r.w - 60, r.h); ctx.clip();
      text(ctx, i.textContent.toUpperCase(), r.x + 9, r.y + r.h / 2 + .5, `400 ${fs(e)}px ${DISPLAY}`, INK, 'left', .26); ctx.restore();
      text(ctx, b.textContent, r.x + r.w - 9, r.y + r.h / 2 + .5, `600 ${fs(b)}px ${MONO}`, INK, 'right');
    } else if (e.classList.contains('val')) {
      const left = e.style.textAlign === 'left';
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y - 4, r.w, r.h + 8); ctx.clip();
      text(ctx, e.textContent.toUpperCase(), left ? r.x : r.x + r.w / 2, r.y + r.h / 2, `600 ${fs(e)}px ${MONO}`, INK, left ? 'left' : 'center', .5); ctx.restore();
    } else text(ctx, e.textContent.replace(/ /g, ' ').trim(), r.x, r.y + r.h / 2, `600 ${fs(e)}px ${MONO}`, INK, 'left', .7);
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
  const draw = (ctx, w, h) => text(ctx, el.textContent.toUpperCase(), w / 2, h / 2 + .5, `400 ${fs(el)}px ${DISPLAY}`, el.classList.contains('lit') ? PINK : PAPER);
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
  const draw = (ctx, w, h) => { ctx.save(); ctx.beginPath(); ctx.rect(4, 0, w - 8, h); ctx.clip(); text(ctx, label(), w / 2, h / 2 + .5, `400 ${fs(el)}px ${DISPLAY}`, PAPER); ctx.restore(); };
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
    ctx.fillStyle = PINK; ctx.fillRect(0, 0, b.w, b.h);
    if (kind === 'now') { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(0, 0, b.w, b.h); }   // a soft wash, not solid white
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
    const fm = tintable(new THREE.MeshStandardMaterial({ map: tex.on, roughness: 0.78 }));
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
      B.gm.opacity = 0.2 * B.g; B.bm.emissiveIntensity = 0.3 * B.g;
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
  // the corners of both panels as they sit now (the top one may be tipped up), framed snugly
  const box = new THREE.Box3().setFromObject(upSlab).union(new THREE.Box3().setFromObject(lowSlab)), pts = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
  box.getCenter(target); target.z = 0;
  for (dist = 2000; dist < 200000; dist *= 1.01) {
    camera.position.set(target.x, target.y, target.z + dist); camera.lookAt(target); camera.updateMatrixWorld();
    if (pts.every((p) => { const q = p.clone().project(camera); return Math.abs(q.x) < 0.985 && Math.abs(q.y) < 0.975; })) break;
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
  if (u.title) { A.openOptions(); }   // tapping FILTH opens OPTIONS
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
  grab = null; paint = null;
}
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('dblclick', (e) => { const o = pick(e); if (o && o.userData.ctl && o.userData.ctl.kind === 'knob') o.userData.ctl.set(o.userData.ctl.def); });

// ---------------------------------------------------------------- frame
renderer.shadowMap.needsUpdate = true;
let angleNow = null;
function driveAngle() {
  const a = A.look.angle || 0, b = A.look.angleLow || 0, key = a + ',' + b; if (key === angleNow) return; angleNow = key;
  hinge.rotation.x = a * Math.PI / 180; hingeLow.rotation.x = -b * Math.PI / 180; renderer.shadowMap.needsUpdate = true; fit();
}
// PARALLAX (OPTIONS): the camera swings a little with the pointer; 0 keeps it fixed
let pxT = 0, pyT = 0, pxC = 0, pyC = 0;
addEventListener('pointermove', (e) => { pxT = e.clientX / innerWidth * 2 - 1; pyT = e.clientY / innerHeight * 2 - 1; });
document.addEventListener('pointerleave', () => { pxT = pyT = 0; });
function driveParallax() {
  const P = A.look.parallax || 0;
  const tx = pxT * P, ty = pyT * P;
  if (Math.abs(tx - pxC) + Math.abs(ty - pyC) < 1e-4) return;
  pxC += (tx - pxC) * 0.08; pyC += (ty - pyC) * 0.08;
  const yaw = 0.16 * pxC, pitch = -0.1 * pyC;
  camera.position.set(target.x + dist * Math.sin(yaw) * Math.cos(pitch), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(target);
}
function frame() {
  driveAngle(); driveParallax();
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
