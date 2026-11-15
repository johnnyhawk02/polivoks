// Builds the plugin's copy of the web app into plugin/web/dist: the same
// index.html, view3d.js, factory.json and icons as the site, with
//   - bridge.js put first in <head> (storage and audio come from the plugin)
//   - three.js and the fonts loaded from vendor/ instead of a CDN, so the
//     plugin works offline and always draws with the same files
// Nothing else in the page changes, so the plugin's panel is the site's.
//   node plugin/web/build.js [outDir]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..'), out = process.argv[2] || path.join(__dirname, 'dist');
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const must = (s, a, b) => { if (!s.includes(a)) throw new Error('build.js: not found in index.html: ' + a.slice(0, 80)); return s.split(a).join(b); };

let html = rd('index.html');
const bridge = fs.readFileSync(path.join(__dirname, 'bridge.js'), 'utf8');
// right after <meta charset> (which must stay in the first 1024 bytes), before the page's first script
const CS = '<meta charset="utf-8">';
if (!html.includes(CS) || html.indexOf(CS) > html.indexOf('<script')) throw new Error('build.js: <meta charset> not before the first script');
html = html.replace(CS, () => CS + '\n<script>\n' + bridge + '</script>');
html = must(html, 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', './vendor/three/three.module.js');
html = must(html, 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/', './vendor/three/addons/');
html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '');
html = html.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/, '<link href="./vendor/fonts/fonts.css" rel="stylesheet">');
if (/https:\/\/(fonts\.googleapis|cdn\.jsdelivr)/.test(html)) throw new Error('build.js: a CDN link is left in index.html');
// no service worker or install manifest inside a plugin
html = html.replace(/<link rel="manifest"[^>]*>\n?/g, '');

// Everything served as plain ASCII: a plugin's web view may not honour <meta charset> for
// pages from the plugin itself (WebKitGTK decodes them as windows-1252), so each non-ASCII
// character is written as an escape that means the same in its place: \\uXXXX in scripts
// (strings, regexes, comments), \\XXXX in CSS, &#xXXXX; in HTML.
const u4 = (n) => '\\u' + n.toString(16).padStart(4, '0');
const asciiJs = (t) => t.replace(/[^\x00-\x7f]/g, (c) => u4(c.charCodeAt(0)));   // per UTF-16 unit: astral characters become surrogate pairs
const asciiCss = (t) => t.replace(/[^\x00-\x7f]/gu, (c) => '\\' + c.codePointAt(0).toString(16) + ' ');
const asciiHtml = (t) => t.replace(/[^\x00-\x7f]/gu, (c) => '&#x' + c.codePointAt(0).toString(16) + ';');
const asciiPage = (t) => {
  let out = '', last = 0; const re = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/g; let m;
  while ((m = re.exec(t))) { out += asciiHtml(t.slice(last, m.index)) + asciiHtml(m[1]) + (m[2] === 'style' ? asciiCss(m[3]) : asciiJs(m[3])) + m[4]; last = re.lastIndex; }
  return out + asciiHtml(t.slice(last));
};
html = asciiPage(html);
if (/[^\x00-\x7f]/.test(html)) throw new Error('build.js: non-ASCII left in index.html');

const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'view3d.js'), asciiJs(rd('view3d.js')));
copy(path.join(root, 'factory.json'), path.join(out, 'factory.json'));
for (const f of fs.readdirSync(path.join(root, 'icons'))) copy(path.join(root, 'icons', f), path.join(out, 'icons', f));
const walk = (d, rel) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel + '/' + f; if (fs.statSync(p).isDirectory()) walk(p, r); else if (!/LICENSE$/.test(f)) copy(p, path.join(out, r)); } };
walk(path.join(__dirname, 'vendor'), 'vendor');
const n = []; const count = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) count(p); else n.push(p); } }; count(out);
console.log('plugin web bundle: ' + n.length + ' files in ' + out);
