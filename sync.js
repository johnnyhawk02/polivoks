// Copy dsp.js and seq.js into their <script type="text/plain"> blocks of
// index.html so the files never drift apart.  Run after every change to
// either:  node sync.js
const fs = require('fs');
let html = fs.readFileSync(__dirname + '/index.html', 'utf8');
for (const [file, id] of [['dsp.js', 'dsp-src'], ['seq.js', 'seq-src']]) {
  const src = fs.readFileSync(__dirname + '/' + file, 'utf8');
  const tag = `<script type="text/plain" id="${id}">`;
  const a = html.indexOf(tag) + tag.length, b = html.indexOf('</script>', a);
  if (a < tag.length || b < 0) throw new Error(id + ' block not found');
  html = html.slice(0, a) + src + html.slice(b);
  console.log('index.html: ' + id + ' updated (' + src.length + ' chars)');
}
fs.writeFileSync(__dirname + '/index.html', html);
