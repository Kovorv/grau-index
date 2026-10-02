// Export the catalogue layers as stand-alone CSV files next to the page (UTF-8 with BOM).
// usage: node _raw/build_oth_csv.cjs [outdir]
const fs = require('fs');
const OUT = process.argv[2] || 'D:/DsHs/grau/grau_index.v1.1';
const SRCN = { sila: 'русская-сила.рф', bmz: 'bmz.ru', ruwiki: 'ru.wikipedia', ukwiki: 'uk.wikipedia' };
const rd = (f) => { const p = 'D:/DsHs/grau/_raw/gbtu/' + f; return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; };
// Chinese lookup produced by oth_merge.cjs (+ oth_fixnick.cjs for leftover nicknames)
const CAT = (() => {
  const p = 'D:/DsHs/grau/_raw/oth_zh/cat_zh.json';
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')), norm = {};
  for (const k of Object.keys(raw)) norm[k.replace(/\s+/g, ' ').trim()] = raw[k];
  return norm;
})();
const tz = (s) => {
  if (!CAT) return '';
  const k = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return k ? (CAT[k] || '') : '';
};
const q = (v) => {
  let s = String(v == null ? '' : v).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (/[;"\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
};
function write(name, header, rows) {
  const body = [header.map(q).join(';')].concat(rows.map((r) => r.map(q).join(';'))).join('\r\n');
  fs.writeFileSync(OUT + '/' + name, '\ufeff' + body + '\r\n', 'utf8');
  console.log(name + ': ' + rows.length + ' rows');
}

const gbtu = [];
for (const r of rd('gbtu.json')) {
  const srcs = (r.srcs || []).filter((s) => s.desig || s.note);
  if (!srcs.length) { gbtu.push([r.key, r.desig || '', r.note || '', '', tz(r.note || '')]); continue; }
  for (const s of srcs) gbtu.push([r.key, s.desig || '', s.note || '', SRCN[s.s] || s.s, tz(s.note || '')]);
}
gbtu.sort((a, b) => (parseInt(a[0], 10) || 1e6) - (parseInt(b[0], 10) || 1e6) || String(a[0]).localeCompare(String(b[0]), 'ru'));
write('gbtu_objects.csv', ['对象号', '军事代号', '说明', '来源', '说明(中文)'], gbtu);

write('engineering_items.csv', ['名称', '代号', '类别', '用途', 'КВТ МО', 'ОКП', 'ЕКПС', '列装', '研制单位', '页',
  '名称(中文)', '类别(中文)', '用途(中文)', '列装(中文)', '研制单位(中文)'],
  rd('giu_items.json').map((r) => [r.title, r.desig || '', r.section || '', r.purpose || '', (r.kvt || []).join(' '),
    (r.okp || []).join(' '), (r.ekps || []).join(' '), r.adopted || '', r.dev || '', r.page || '',
    tz(r.title), tz(r.section || ''), tz(r.purpose || ''), tz(r.adopted || ''), tz(r.dev || '')]));

write('gau_56_57.csv', ['索引', '说明', '工程弹药', '说明(中文)'], rd('gau5657.json').map((r) => [r.key, r.note || '', r.eng ? '是' : '', tz(r.note || '')]));
write('mo_index.csv', ['索引', '说明', '说明(中文)'], rd('mo_idx.json').map((r) => [r.key, r.note || '', tz(r.note || '')]));
