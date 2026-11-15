// ============================================================================
//  Preset names.  Never typed: each one is built from the word lists below and
//  then about half the time jumbled by splicing syllables (spoonerisms, half
//  swaps, portmanteaus, alien endings), keeping only results a mouth can say.
//  makeName(rnd) with rnd a () => [0,1) function, Math.random by default.
// ============================================================================

// sixteen lists; any two different ones are paired, then often jumbled
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
  // gods, worlds, beasts and gear of the Norse sagas
  norse: ['Odin', 'Thor', 'Loki', 'Freya', 'Frigg', 'Heimdall', 'Baldur', 'Tyr', 'Njord', 'Skadi', 'Idunn', 'Bragi',
    'Fenrir', 'Jormungandr', 'Sleipnir', 'Yggdrasil', 'Mjolnir', 'Valhalla', 'Asgard', 'Midgard', 'Jotunheim', 'Niflheim',
    'Muspelheim', 'Bifrost', 'Ragnarok', 'Valkyrie', 'Berserker', 'Huginn', 'Muninn', 'Gungnir', 'Draupnir', 'Ymir', 'Surtr',
    'Mimir', 'Hrungnir', 'Fafnir', 'Sigurd', 'Brynhild', 'Ginnungagap', 'Einherjar', 'Skald', 'Rune Stone', 'Longship',
    'Mead Hall', 'Jarl', 'Fjord', 'Kraken', 'Draugr', 'Norns', 'Ratatoskr', 'Nidhogg', 'Gjallarhorn', 'Skidbladnir', 'Vanir',
    'Aesir', 'Alfheim', 'Svartalfheim', 'Frost Giant', 'Ullr', 'Vidar'],
  // gods, heroes, monsters and thinkers of ancient Greece
  greek: ['Zeus', 'Hera', 'Athena', 'Apollo', 'Artemis', 'Ares', 'Hermes', 'Hephaestus', 'Dionysus', 'Poseidon', 'Hades',
    'Persephone', 'Demeter', 'Aphrodite', 'Prometheus', 'Pandora', 'Medusa', 'Minotaur', 'Cyclops', 'Hydra', 'Cerberus',
    'Pegasus', 'Icarus', 'Daedalus', 'Achilles', 'Odysseus', 'Hercules', 'Perseus', 'Theseus', 'Argonaut', 'Labyrinth',
    'Oracle', 'Delphi', 'Olympus', 'Sparta', 'Troy', 'Trojan Horse', 'Acropolis', 'Parthenon', 'Socrates', 'Plato',
    'Aristotle', 'Pythagoras', 'Archimedes', 'Hippocrates', 'Sisyphus', 'Tantalus', 'Narcissus', 'Orpheus', 'Eurydice',
    'Chimera', 'Siren', 'Harpy', 'Titan', 'Gorgon', 'Nemesis', 'Ambrosia', 'Amphora', 'Golden Fleece', 'Styx'],
  // medicine-cabinet words: generics, a few UK chemist-shelf brands, body chemicals
  pharma: ['Ibuprofen', 'Paracetamol', 'Aspirin', 'Amoxicillin', 'Codeine', 'Diazepam', 'Omeprazole', 'Simvastatin',
    'Metformin', 'Lisinopril', 'Atorvastatin', 'Salbutamol', 'Prednisolone', 'Ketamine', 'Lidocaine', 'Morphine', 'Tramadol',
    'Sertraline', 'Fluoxetine', 'Citalopram', 'Warfarin', 'Heparin', 'Insulin', 'Penicillin', 'Tetracycline', 'Doxycycline',
    'Ciprofloxacin', 'Loratadine', 'Cetirizine', 'Lansoprazole', 'Gabapentin', 'Naproxen', 'Diclofenac', 'Propranolol',
    'Amlodipine', 'Furosemide', 'Levothyroxine', 'Melatonin', 'Haloperidol', 'Lithium', 'Calpol', 'Lemsip', 'Gaviscon',
    'Strepsils', 'Imodium', 'Antihistamine', 'Placebo', 'Methadone', 'Nitrous Oxide', 'Adrenaline', 'Dopamine', 'Serotonin',
    'Oxytocin', 'Cortisone', 'Kaolin', 'Benzocaine', 'Clonazepam', 'Valproate', 'Mebeverine', 'Chloramphenicol'],
  // Buffy the Vampire Slayer: people, places, monsters, kit
  buffy: ['Buffy', 'Willow', 'Xander', 'Giles', 'Spike', 'Angel', 'Cordelia', 'Oz', 'Anya', 'Tara', 'Dawn', 'Faith',
    'Drusilla', 'Glory', 'The Master', 'Mayor Wilkins', 'Hellmouth', 'Sunnydale', 'Slayer', 'Watcher', 'The Bronze',
    'Mr Pointy', 'Scooby Gang', 'Magic Box', 'Initiative', 'Wishverse', 'Gentlemen', 'Bezoar', 'Moloch', 'Acathla',
    'Kakistos', 'Gachnar', 'Jonathan', 'Warren', 'Andrew', 'Principal Snyder', 'Riley', 'Kendra', 'Harmony', 'Clem',
    'Ethan Rayne', 'Big Bad', 'Stake', 'Holy Water', 'Crossbow', 'Vamp Face', 'Scythe', 'Turok-Han', 'First Evil',
    'Wesley', 'Jenny Calendar', 'Band Candy', 'Doublemeat Palace', 'Hellgod', 'Sineya', 'Chosen One', 'Mr Trick',
    'Amy the Rat', 'Hush', 'Restless'],
  // the Soviet side of the Polivoks's world: space, cars, kitchens, places
  soviet: ['Sputnik', 'Vostok', 'Soyuz', 'Mir', 'Lunokhod', 'Buran', 'Laika', 'Belka', 'Strelka', 'Gagarin', 'Tereshkova',
    'Lada', 'Volga', 'Moskvich', 'Tupolev', 'Ilyushin', 'Matryoshka', 'Samovar', 'Balalaika', 'Kvass', 'Borscht', 'Pelmeni',
    'Ushanka', 'Dacha', 'Kolkhoz', 'Politburo', 'Kremlin', 'Baikonur', 'Zenit', 'Elektronika', 'Kosmos', 'Salyut', 'Venera',
    'Luna', 'Polyot', 'Raketa', 'Kometa', 'Zarya', 'Pravda', 'Tetris', 'Babushka', 'Taiga', 'Tundra', 'Kamchatka',
    'Murmansk', 'Vladivostok', 'Kamaz', 'Ural', 'Tokamak', 'Theremin', 'Blini', 'Kefir', 'Shapka', 'Valenki', 'Troika',
    'Sobaka', 'Zhiguli', 'Chaika', 'Okroshka', 'Syrniki'],
  dinosaurs: ['Tyrannosaurus', 'Velociraptor', 'Triceratops', 'Stegosaurus', 'Brontosaurus', 'Diplodocus', 'Ankylosaurus',
    'Pterodactyl', 'Iguanodon', 'Allosaurus', 'Spinosaurus', 'Parasaurolophus', 'Megalodon', 'Mammoth', 'Archaeopteryx',
    'Compsognathus', 'Dimetrodon', 'Plesiosaur', 'Mosasaur', 'Ichthyosaur', 'Gallimimus', 'Oviraptor', 'Baryonyx',
    'Carnotaurus', 'Deinonychus', 'Therizinosaurus', 'Maiasaura', 'Troodon', 'Microraptor', 'Smilodon', 'Dodo', 'Trilobite',
    'Ammonite', 'Sabre Tooth', 'Woolly Rhino', 'Megatherium', 'Glyptodon', 'Quetzalcoatlus', 'Brachiosaurus',
    'Edmontosaurus', 'Coelacanth', 'Dilophosaurus', 'Giganotosaurus', 'Styracosaurus', 'Pachycephalosaurus', 'Raptor',
    'Protoceratops', 'Argentinosaurus', 'Dunkleosteus', 'Anomalocaris'],
  minerals: ['Obsidian', 'Feldspar', 'Quartz', 'Malachite', 'Pyrite', 'Gypsum', 'Basalt', 'Granite', 'Gneiss', 'Schist',
    'Mica', 'Garnet', 'Jasper', 'Onyx', 'Agate', 'Amethyst', 'Beryl', 'Topaz', 'Zircon', 'Bauxite', 'Galena', 'Magnetite',
    'Hematite', 'Cinnabar', 'Fluorite', 'Dolomite', 'Tourmaline', 'Lapis Lazuli', 'Chalcedony', 'Serpentine', 'Pumice',
    'Flint', 'Shale', 'Marble', 'Slate', 'Olivine', 'Peridot', 'Rhodochrosite', 'Vanadinite', 'Kyanite', 'Molybdenite',
    'Sphalerite', 'Cassiterite', 'Uraninite', 'Labradorite', 'Bismuth', 'Jet', 'Amber', 'Moonstone', 'Tiger Eye'],
  deepsea: ['Anglerfish', 'Gulper Eel', 'Vampire Squid', 'Blobfish', 'Giant Isopod', 'Oarfish', 'Viperfish', 'Hagfish',
    'Siphonophore', 'Barreleye', 'Dumbo Octopus', 'Sea Pig', 'Frilled Shark', 'Goblin Shark', 'Lanternfish', 'Nautilus',
    'Cuttlefish', 'Sea Cucumber', 'Moray', 'Lamprey', 'Krill', 'Narwhal', 'Beluga', 'Sea Butterfly', 'Comb Jelly',
    'Tube Worm', 'Hatchetfish', 'Fangtooth', 'Loosejaw', 'Cookiecutter Shark', 'Sea Angel', 'Pyrosome', 'Yeti Crab',
    'Snailfish', 'Tripod Fish', 'Sea Spider', 'Box Jelly', 'Man o War', 'Giant Squid', 'Sea Toad', 'Sixgill', 'Dragonfish',
    'Black Swallower', 'Sea Lily', 'Brittle Star', 'Lobster', 'Mantis Shrimp', 'Sea Urchin', 'Basket Star', 'Cusk Eel'],
  cocktails: ['Negroni', 'Mojito', 'Daiquiri', 'Margarita', 'Manhattan', 'Martini', 'Sazerac', 'Gimlet', 'Sidecar',
    'Mai Tai', 'Zombie', 'Caipirinha', 'Cosmopolitan', 'Old Fashioned', 'Bellini', 'Mimosa', 'Paloma', 'Aperol Spritz',
    'Bloody Mary', 'Pina Colada', 'Tom Collins', 'Moscow Mule', 'White Russian', 'Black Russian', 'Long Island', 'Mint Julep',
    'Pisco Sour', 'Whisky Sour', 'Grasshopper', 'Snowball', 'Harvey Wallbanger', 'Rusty Nail', 'Godfather', 'Boulevardier',
    'Americano', 'Hurricane', 'Singapore Sling', 'Espresso Martini', 'Kir Royale', 'Gin Fizz', 'Bramble', 'Painkiller',
    'Corpse Reviver', 'Vesper', 'Aviation', 'Last Word', 'Tequila Sunrise', 'Sea Breeze', 'Snakebite', 'Cuba Libre'],
  fungi: ['Chanterelle', 'Porcini', 'Morel', 'Truffle', 'Shiitake', 'Enoki', 'Oyster Mushroom', 'Puffball', 'Stinkhorn',
    'Death Cap', 'Fly Agaric', 'Liberty Cap', 'Jelly Ear', 'Earthstar', 'Inkcap', 'Shaggy Mane', 'Bracket', 'Lions Mane',
    'Reishi', 'Cordyceps', 'Mycelium', 'Spore', 'Toadstool', 'Russula', 'Bolete', 'Amanita', 'Penny Bun', 'Witches Butter',
    'Turkey Tail', 'Destroying Angel', 'Slime Mould', 'Yeast', 'Lichen', 'Portobello', 'Blewit', 'Waxcap', 'Girolle',
    'Matsutake', 'Maitake', 'Mildew', 'Cep', 'Deceiver', 'Parasol', 'Dryad Saddle', 'Ergot', 'Truffle Hound', 'Hedgehog Fungus',
    'Velvet Shank', 'King Oyster', 'Candlesnuff'],
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
// lists that suit "The One With the ..." and "... of <Welsh town>" (not the Friends titles themselves, nor Welsh twice)
const THE_ONE = ['food', 'tools', 'scifi', 'welsh', 'norse', 'greek', 'pharma', 'buffy', 'soviet', 'dinosaurs', 'minerals', 'deepsea', 'cocktails', 'fungi'];
const OF_CATS = ['food', 'tools', 'scifi', 'alien', 'norse', 'greek', 'pharma', 'buffy', 'soviet', 'dinosaurs', 'minerals', 'deepsea', 'cocktails', 'fungi'];

// raw name before any jumbling
function rawName() {
  const r = R(), c1 = pick(CATS); let c2 = pick(CATS); while (c2 === c1) c2 = pick(CATS);
  if (r < .1) return ['The', 'One', 'With', 'the'].concat(words(pick(NAME_WORDS[pick(THE_ONE)]))).join(' ');
  if (r < .2) return fromCat(pick(OF_CATS)) + ' of ' + pick(NAME_WORDS.welsh);
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
      if (r.length === 1) { if (j !== i + 1) continue; out.splice(j, 1); out[i] = r[0]; }   // a blend only joins words side by side, never across 'of' (that left 'Planelli Of') else { out[i] = r[0]; out[j] = r[1]; }
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
