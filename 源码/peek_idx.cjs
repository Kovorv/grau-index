// ad-hoc: inspect one index in master.json and in the built page payload
// usage: node peek_idx.cjs 1ОП50 [htmlPath]
const fs = require('fs');
const want = process.argv[2];
const html = process.argv[3] || 'D:/DsHs/grau/grau_index.v1.4.5/grau_index.linked.html';
const M = JSON.parse(fs.readFileSync('D:/DsHs/grau/_raw/master.json', 'utf8'));
for (const e of M.entries) {
  if (e.idx !== want) continue;
  console.log('master:', JSON.stringify({ idx: e.idx, aka: e.aka, part: e.part, srcs: e.srcs, withLit: !!e.lit, ru: String(e.ru || '').slice(0, 70) }));
}
const h = fs.readFileSync(html, 'utf8');
const i = h.indexOf('id="grau-data"');
const D = JSON.parse(h.slice(h.indexOf('>', i) + 1, h.indexOf('</script>', h.indexOf('>', i) + 1)));
console.log('payload header keys:', Object.keys(D));
for (const r of D.E) { if (r[0] === want) console.log('payload row:', JSON.stringify(r).slice(0, 700)); }
