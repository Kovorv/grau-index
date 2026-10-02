// list the series (大类) of a built page with their level-1 group, to verify the v1.4.6 hierarchy
// usage: node peek_series.cjs [htmlPath]
const fs = require('fs');
const p = process.argv[2] || 'D:/DsHs/grau/grau_index.v1/grau_index.html';
const h = fs.readFileSync(p, 'utf8');
const i = h.indexOf('id="grau-data"');
const j = h.indexOf('>', i) + 1;
const k = h.indexOf('</script>', j);
const D = JSON.parse(h.slice(j, k));
const S = D.S || [];
console.log('series: ' + S.length + ' | entries: ' + (D.E || []).length);
for (const s of S) {
  console.log(
    String(s.grpOrder).padStart(2) + ' ' + String(s.grp).padEnd(7) +
    ' n' + String(s.n).padEnd(4) + ' ' + String(s.shortZh || '').padEnd(20) +
    ' | ' + String(s.grpZh || '(none)').padEnd(28) +
    ' | ' + String(s.zh || '').slice(0, 26)
  );
}
console.log('grptag spans in markup: ' + (h.match(/class="grptag"/g) || []).length);
