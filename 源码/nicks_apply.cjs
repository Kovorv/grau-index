// Merge the Chinese renderings of the code names into refs.json (nicks[].zh).
// Sources: the renderings already used in the descriptions (nicks_cover.json)
// plus the per-batch translation files written by the translators (nicks_zh/p*.json).
const fs = require('fs');
const RAW = 'D:/DsHs/grau/_raw';
const refs = JSON.parse(fs.readFileSync(RAW + '/refs.json', 'utf8'));
const cover = JSON.parse(fs.readFileSync(RAW + '/nicks_cover.json', 'utf8'));

const map = Object.assign({}, cover);
let files = 0;
for (const f of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) {
  const p = RAW + '/nicks_zh/' + f + '.json';
  if (!fs.existsSync(p)) { console.log('missing ' + f); continue; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  files++;
  for (const k of Object.keys(j)) {
    const v = String(j[k] || '').trim();
    if (v) map[k] = v;
  }
}
console.log('translation files: ' + files + ' | map entries: ' + Object.keys(map).length);

let withZh = 0;
const missing = [];
for (const n of refs.nicks) {
  const v = map[n.s] || '';
  if (v) { n.zh = v; withZh++; } else { delete n.zh; missing.push(n.s); }
}
console.log('nicks: ' + refs.nicks.length + ' | with zh: ' + withZh + ' | missing: ' + missing.length);
if (missing.length) console.log('missing sample: ' + missing.slice(0, 25).join(' | '));

if (process.argv.includes('--write')) {
  fs.writeFileSync(RAW + '/refs.json', JSON.stringify(refs, null, 1), 'utf8');
  console.log('wrote refs.json');
} else {
  console.log('(dry run — pass --write)');
}
