// Collect every thumbs/... reference from the v1.2 page, in first-seen order.
//   node _raw/embed_list.cjs  ->  _raw/embed_items.txt (one reference per line)
const fs = require('fs');
const DIR = process.env.GRAU_DIR || 'D:/DsHs/grau/grau_index.v1.4.2';
const SRC = process.argv[2] || DIR + '/grau_index.linked.html';
const h = fs.readFileSync(SRC, 'utf8');
const seen = new Set();
const list = [];
const re = /thumbs\/[^"'\s\]]+/g;
let m;
while ((m = re.exec(h))) {
  if (seen.has(m[0])) continue;
  seen.add(m[0]);
  list.push(m[0]);
}
fs.writeFileSync('D:/DsHs/grau/_raw/embed_items.txt', list.join('\n') + '\n');
console.log('distinct references: ' + list.length);
const missing = list.filter((r) => !fs.existsSync(DIR + '/' + r));
console.log('missing on disk: ' + missing.length);
missing.slice(0, 5).forEach((r) => console.log('  ' + r));
