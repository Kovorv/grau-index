const fs = require('fs');
const f = process.argv[2] || 'D:/DsHs/grau/_raw/webprobe.dom';
let s = fs.readFileSync(f, 'utf8');
const m = s.match(/<pre id="__[a-z]+">([\s\S]*?)<\/pre>/);
if (!m) { console.log('NO PROBE OUTPUT'); process.exit(0); }
const dec = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
console.log(dec);
