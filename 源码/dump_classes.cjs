const fs = require('fs');
const dir = process.argv[2] || 'D:/DsHs/grau/grau_index.v1.4.2.1';
const f = fs.readdirSync(dir).filter((n) => /grau_index.*\.html$/.test(n)).sort((a, b) => a.length - b.length)[0];
const h = fs.readFileSync(dir + '/' + f, 'utf8');
console.log('file', f, 'len', h.length);
const i = h.indexOf('id="grau-data"');
console.log('payload at', i);
const st = h.indexOf('>', i) + 1, en = h.indexOf('</script>', st);
const D = JSON.parse(h.slice(st, en));
console.log('classes', D.S.length, 'entries', D.E.length);
for (const s of D.S) {
  console.log(String(s.n).padStart(4), String(s.key).padEnd(5), String(s.sys || '').padEnd(8),
    String(s.shortZh || '-').padEnd(12), '|', s.zh, '| heads:', (s.prefixes || []).length, (s.prefixes || []).slice(0, 8).join(','));
}
