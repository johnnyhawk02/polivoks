// Copy dsp.js into the <script id="dsp-src"> block of index.html so the two
// never drift apart.  Run after every dsp.js change:  node sync.js
const fs = require('fs');
const tag = '<script type="text/plain" id="dsp-src">';
const html = fs.readFileSync(__dirname + '/index.html', 'utf8'), dsp = fs.readFileSync(__dirname + '/dsp.js', 'utf8');
const a = html.indexOf(tag) + tag.length, b = html.indexOf('</script>', a);
if (a < tag.length || b < 0) throw new Error('dsp-src block not found');
fs.writeFileSync(__dirname + '/index.html', html.slice(0, a) + dsp + html.slice(b));
console.log('index.html: dsp-src updated (' + dsp.length + ' chars)');
