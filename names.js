// ============================================================================
//  Preset names.  Never typed: each one is built from the word lists below and
//  then about half the time jumbled by splicing syllables (spoonerisms, half
//  swaps, portmanteaus, alien endings), keeping only results a mouth can say.
//  makeName(rnd) with rnd a () => [0,1) function, Math.random by default.
// ============================================================================

const NAME_WORDS = {
  scifi: ['Nebula', 'Quasar', 'Photon', 'Plasma', 'Vortex', 'Ion Drive', 'Cyborg', 'Android', 'Warp Core', 'Hyperdrive',
    'Tachyon', 'Graviton', 'Nova', 'Pulsar', 'Orbit', 'Zenith', 'Nexus', 'Chronoton', 'Laser', 'Droid', 'Rocket', 'Cosmonaut',
    'Hologram', 'Neutron', 'Meteor', 'Galaxy', 'Robot', 'Starship', 'Teleporter', 'Quantum', 'Vector', 'Dynamo', 'Proton',
    'Comet', 'Eclipse', 'Turbine', 'Omega', 'Flux Capacitor', 'Beacon', 'Cryopod', 'Asteroid', 'Wormhole', 'Mothership',
    'Tractor Beam', 'Deflector', 'Reactor', 'Satellite', 'Supernova', 'Exoplanet', 'Antimatter', 'Raygun', 'Spacesuit',
    'Moonbase', 'Stargate', 'Ion Storm', 'Positron', 'Lunar Module', 'Nanobot', 'Forcefield', 'Gamma Ray'],
  food: ['Chorizo', 'Paella', 'Gazpacho', 'Tortilla', 'Churro', 'Sobrasada', 'Pimentón', 'Jamón', 'Manchego', 'Croqueta',
    'Albóndiga', 'Empanada', 'Salmorejo', 'Fabada', 'Pulpo', 'Calamares', 'Patatas Bravas', 'Alioli', 'Sofrito', 'Membrillo',
    'Turrón', 'Horchata', 'Sangría', 'Morcilla', 'Pisto', 'Migas', 'Cocido', 'Boquerones', 'Pimiento', 'Gambas', 'Tapas',
    'Pintxo', 'Romesco', 'Escabeche', 'Torrija', 'Flan', 'Ensaimada', 'Polvorón', 'Zarzuela', 'Fideuà', 'Txistorra',
    'Lentejas', 'Pan Tumaca', 'Bocadillo', 'Garbanzo', 'Chistorra', 'Picada', 'Rabo de Toro', 'Torreznos', 'Mojo Picón',
    'Papas Arrugadas', 'Queso', 'Aceituna', 'Almendra', 'Azafrán', 'Merluza', 'Bacalao', 'Callos', 'Caldereta', 'Huevos Rotos'],
  welsh: ['Cardiff', 'Swansea', 'Aberystwyth', 'Llandudno', 'Machynlleth', 'Penarth', 'Bangor', 'Caerphilly', 'Pontypridd',
    'Llanelli', 'Tenby', 'Wrexham', 'Conwy', 'Harlech', 'Rhyl', 'Merthyr', 'Abergavenny', 'Porthcawl', 'Dolgellau',
    'Betws-y-Coed', 'Llangollen', 'Aberdare', 'Ebbw Vale', 'Tregaron', 'Cwmbran', 'Bala', 'Beddgelert', 'Criccieth',
    'Pwllheli', 'Llanberis', 'Brecon', 'Crickhowell', 'Fishguard', 'Neath', 'Barry', 'Rhayader', 'Pembroke', 'Caernarfon',
    'Portmeirion', 'Ammanford', 'Bridgend', 'Mumbles', 'Llantwit', 'Tonypandy', 'Treorchy', 'Ystradgynlais', 'Aberaeron',
    'Cardigan', 'Llandrindod', 'Prestatyn', 'Holyhead', 'Rhosneigr', 'Llanidloes', 'Talgarth', 'Maesteg', 'Blaenavon',
    'Llandeilo', 'Mold', 'Ruthin', 'Penrhyndeudraeth'],
  // the memorable bits of Friends episode titles ("The One With the ...")
  friends: ['Holiday Armadillo', 'Unagi', 'Dozen Lasagnas', 'Apothecary Table', 'Hypnosis Tape', 'Jellyfish', 'Embryos',
    'Blackout', 'Thumb', 'Monkey', 'Prom Video', 'Chicken Pox', 'Ick Factor', 'Fake Monica', 'Kips', 'Yeti', 'Male Nanny',
    'Stoned Guy', 'Candy Hearts', 'Tea Leaves', 'Ride-Along', 'Cuffs', 'Sharks', 'Football', 'Routine', 'Jam', 'Rumor',
    'Bullies', 'Proposal', 'Old Yeller', 'Underdog', 'Ross\'s Teeth', 'Mugging', 'Couch', 'Flashback', 'Poking Device',
    'Metaphorical Tunnel', 'Baby on the Bus', 'Evil Orthodontist', 'Fake Party', 'Morning After', 'Joey\'s Fridge',
    'Halloween Party', 'Videotape', 'Soap Opera Party', 'Wedding Dress', 'Cat', 'Chick and the Duck', 'Ballroom Dancing',
    'Inappropriate Sister', 'Screamer', 'Invitation', 'Mrs. Bing', 'Dirty Girl', 'Ball', 'Cop', 'Bed', 'Vows', 'Truth About London'],
  tools: ['Drill', 'Angle Grinder', 'Jigsaw', 'Router', 'Belt Sander', 'Nail Gun', 'Circular Saw', 'Planer', 'Impact Driver',
    'Rotary Hammer', 'Heat Gun', 'Chainsaw', 'Leaf Blower', 'Hedge Trimmer', 'Band Saw', 'Mitre Saw', 'Biscuit Joiner',
    'Multitool', 'Reciprocating Saw', 'Glue Gun', 'Jackhammer', 'Wet Vac', 'Orbital Sander', 'Bench Grinder', 'Lathe',
    'Table Saw', 'Scroll Saw', 'Strimmer', 'Rivet Gun', 'Staple Gun', 'Torque Wrench', 'Plunge Router', 'SDS Drill',
    'Tile Cutter', 'Polisher', 'Soldering Iron', 'Grout Gun', 'Breaker', 'Nibbler', 'Floor Sander', 'Die Grinder',
    'Pillar Drill', 'Wallpaper Steamer', 'Paint Sprayer', 'Air Compressor', 'Pressure Washer', 'Chop Saw', 'Hammer Drill',
    'Detail Sander', 'Laser Level', 'Stud Finder', 'Rebar Cutter', 'Log Splitter', 'Concrete Mixer', 'Wood Chipper'],
  alien: ['Zorblax', 'Quexil', 'Vrennok', 'Thulgar', 'Xyphor', 'Glarnik', 'Oomvat', 'Krelloth', 'Zyzzog', 'Blorvu',
    'Yxtrel', 'Mmaluk', 'Querrith', 'Skavvo', 'Drezzik', 'Ulgoth', 'Fnorp', 'Zantheq', 'Oxlu', 'Vexxarine', 'Glimbo',
    'Throok', 'Kazzoo', 'Plimth', 'Zoggle', 'Quorbin', 'Yuzzith', 'Bleeb', 'Groznak', 'Vuul', 'Sklorch', 'Neebo',
    'Trazzik', 'Ommuk', 'Xalvor', 'Phlenge', 'Ruzzbo', 'Klaatoo', 'Zibbit', 'Wexnor', 'Ghuun', 'Splontra', 'Ixxa',
    'Morbulon', 'Treeble', 'Gorvex', 'Quazzle', 'Flubbix', 'Zhurn', 'Obblonk'],
};
// an alien word made up on the spot, for even more variety
const AL = { on: ['z', 'x', 'kr', 'vr', 'gl', 'th', 'q', 'bl', 'sk', 'dr', 'gr', 'zh', 'fl', 'k', 'v', 'pl', 'sn', 'y', ''],
  nu: ['a', 'o', 'u', 'e', 'i', 'oo', 'y', 'ee', 'au'], co: ['x', 'th', 'rk', 'zz', 'n', 'l', 'b', 'q', 'rg', 'sh', 'nk', 'mph', 'rb', ''] };
const ALIEN_END = ['zor', 'ulon', 'ix', 'orb', 'azz', 'onk', 'uux', 'ethra', 'oid', 'atron', 'eeble', 'ox', 'ungo', 'ak'];

const DIG = ['sch', 'll', 'dd', 'ff', 'ch', 'th', 'rh', 'ph', 'sh', 'ng', 'qu', 'zh', 'tx', 'ck'];
const ONSETS = new Set(['bl', 'br', 'ch', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'll', 'pl', 'pr', 'qu', 'sc', 'sk',
  'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'th', 'tr', 'tw', 'vr', 'zl', 'zr', 'gw', 'dw', 'rh', 'ph', 'sh', 'str', 'spr', 'scr', 'thr',
  'chr', 'cw', 'zh', 'shr', 'squ', 'spl', 'tx', 'phl', 'skl', 'fn', 'thl', 'gh']);
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isV = (u, i, us) => /^[aeiou]/.test(u) || (u === 'y' && i > 0) || (u === 'y' && i === 0 && us.length > 1 && !/^[aeiou]/.test(us[1])) ||
  (u === 'w' && i > 0 && !/^[aeiouy]/.test(us[i - 1]) && (i === us.length - 1 || !/^[aeiouy]/.test(us[i + 1])));
// letters -> units (Welsh/Spanish digraphs kept whole) -> syllables
function units(w) {
  const s = plain(w), us = []; let i = 0;
  while (i < s.length) { const d = DIG.find((g) => s.startsWith(g, i)); us.push(d || s[i]); i += d ? d.length : 1; }
  return us;
}
function syllables(w) {
  const us = units(w), v = us.map((u, i) => isV(u, i, us)), sy = []; let cur = '', i = 0;
  // leading consonants + first vowel run
  while (i < us.length) {
    while (i < us.length && !v[i]) cur += us[i++];
    while (i < us.length && v[i]) cur += us[i++];
    let j = i; while (j < us.length && !v[j]) j++;
    if (j === us.length) { cur += us.slice(i).join(''); sy.push(cur); break; }
    const gap = us.slice(i, j);
    // one consonant starts the next syllable; of several, a good onset pair goes on too
    let keep = gap.length <= 1 ? 0 : gap.length - 1;
    if (gap.length >= 2 && ONSETS.has(gap.slice(-2).join(''))) keep = gap.length - 2;
    cur += gap.slice(0, keep).join(''); sy.push(cur); cur = gap.slice(keep).join(''); i = j;
  }
  return sy.filter(Boolean);
}
const onsetOf = (w) => { const m = plain(w).match(/^(sch|squ|str|spr|scr|thr|chr|shr|spl|[^aeiouy]*)/); return m[1]; };
// can a mouth say it?  no long consonant pile-ups, no triple letters, a vowel somewhere, a sayable start
function sayable(w) {
  const s = plain(w).replace(/[^a-z]/g, '');
  if (s.length < 3 || s.length > 14 || !/[aeiouy]/.test(s) || /(.)\1\1/.test(s)) return false;
  if (/[aeiou]{4}/.test(s) || /[^aeiouyw]{4}/.test(s.replace(/ll|dd|ff|ch|th|sh|ph|rh|ng|ck/g, 'L'))) return false;
  const on = onsetOf(s); if (on.length >= 2 && !ONSETS.has(on)) return false;
  return true;
}
const cap = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// ---- splices: each takes words and returns new words, or null when it can't
const SPLICE = {
  // swap the opening consonants: Cardiff Drill -> Dardiff Crill
  spoon(a, b) {
    const oa = onsetOf(a), ob = onsetOf(b); if (oa === ob || !oa || !ob) return null;
    return [ob + plain(a).slice(oa.length), oa + plain(b).slice(ob.length)];
  },
  // swap back halves at syllable joints: Chorizo Laser -> Choser Larizo
  halves(a, b) {
    const sa = syllables(a), sb = syllables(b); if (sa.length < 2 || sb.length < 2) return null;
    const i = 1 + Math.floor(R() * (sa.length - 1)), j = 1 + Math.floor(R() * (sb.length - 1));
    return [sa.slice(0, i).join('') + sb.slice(j).join(''), sb.slice(0, j).join('') + sa.slice(i).join('')];
  },
  // one word into the next where they share a letter: Paella Laser -> Paelaser
  blend(a, b) {
    const A = plain(a), B = plain(b), opts = [];
    for (let i = 2; i < A.length - 1; i++) for (let j = 1; j < B.length - 2; j++) if (A[i] === B[j]) opts.push(A.slice(0, i) + B.slice(j));
    if (!opts.length) return null;
    const ok = opts.filter((w) => w.length >= 5 && w.length <= 11); const w = (ok.length ? ok : opts)[Math.floor(R() * (ok.length || opts.length))];
    return [w];
  },
  // its syllables back to front: Chorizo -> Zoricho
  flip(a) { const s = syllables(a); if (s.length < 2) return null; const t = s.slice(1).concat(s[0]); return [t.join('')]; },
  // an alien ending in place of the last syllable: Gazpacho -> Gazpachulon
  alien(a) {
    const s = syllables(a); if (s.length < 2) return null; const e = ALIEN_END[Math.floor(R() * ALIEN_END.length)];
    let st = s.slice(0, -1).join(''); if (/[aeiouy]$/.test(st) && /^[aeiou]/.test(e)) st = st.slice(0, -1);
    return [st + e];
  },
};
let R = Math.random;
const pick = (a) => a[Math.floor(R() * a.length)];
const words = (p) => p.split(' ');
function alienWord() {
  // one or two syllables; the middle one stays open so it reads easily (Zoobrak, Glyth)
  const w = pick(AL.on) + pick(AL.nu) + (R() < .6 ? pick(AL.on.filter((o) => o.length === 1)) + pick(AL.nu) : '') + pick(AL.co);
  return sayable(w) && !/(zh|y).*(zh|y)/.test(w) ? cap(w) : pick(NAME_WORDS.alien);
}
const fromCat = (c) => c === 'alien' && R() < .35 ? alienWord() : pick(NAME_WORDS[c]);
const CATS = Object.keys(NAME_WORDS);

// raw name before any jumbling
function rawName() {
  const r = R(), c1 = pick(CATS); let c2 = pick(CATS); while (c2 === c1) c2 = pick(CATS);
  if (r < .1) return ['The', 'One', 'With', 'the'].concat(words(pick(NAME_WORDS[pick(['food', 'tools', 'scifi', 'welsh'])]))).join(' ');
  if (r < .2) return fromCat(pick(['food', 'tools', 'scifi', 'alien'])) + ' of ' + pick(NAME_WORDS.welsh);
  return fromCat(c1) + ' ' + fromCat(c2);
}
// jumble: two-word splices on a neighbouring pair, one-word ones on a single word
function jumble(ws) {
  const free = ws.map((w, i) => (/^(the|one|with|of|on|and|de)$/i.test(w) || w.length < 3 ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return null;
  for (let t = 0; t < 12; t++) {
    const k = pick(['spoon', 'spoon', 'spoon', 'halves', 'halves', 'blend', 'blend', 'flip', 'alien']), out = ws.slice();
    if (SPLICE[k].length === 2) {
      const pairs = free.filter((i, n) => free[n + 1] !== undefined).map((i, n) => [i, free[n + 1]]); if (!pairs.length) continue;
      const [i, j] = pick(pairs), r = SPLICE[k](ws[i], ws[j]); if (!r || !r.every(sayable)) continue;
      if (r.length === 1) { out.splice(j, 1); out[i] = r[0]; } else { out[i] = r[0]; out[j] = r[1]; }
    } else {
      const i = pick(free), r = SPLICE[k](ws[i]); if (!r || !sayable(r[0])) continue; out[i] = r[0];
    }
    if (out.join(' ').toLowerCase() === ws.join(' ').toLowerCase()) continue;
    return out;
  }
  return null;
}
function makeName(rnd) {
  R = rnd || Math.random;
  for (let t = 0; t < 20; t++) {
    let ws = words(rawName());
    if (R() < .75) { const j = jumble(ws); if (j) ws = j; }
    const s = cap(ws.join(' ')).replace(/ (Of|The|On|And|De) /g, (m) => m.toLowerCase()).replace(/-Y-/g, '-y-');
    // short and snappy: three words at most, except the Friends-style titles
    if (s.length <= 28 && (ws.length <= 3 || /^The One/.test(s))) return s;
  }
  return pick(NAME_WORDS.alien) + ' ' + pick(NAME_WORDS.tools);
}

if (typeof module !== 'undefined') module.exports = { makeName, syllables, sayable, SPLICE, NAME_WORDS };
