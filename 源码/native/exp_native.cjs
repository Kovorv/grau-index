// Export the v1.2 page payload into files for the native WinForms app.
//   grau_data.tsv.gz  - all data, tab separated (fields are tab/newline sanitised)
//   img.bin           - the 512px thumbnails, keyed by file name
// In : D:/DsHs/grau/grau_index.v1.2/grau_index.linked.html
//      D:/DsHs/grau/_raw/embed512/<NNNN>.jpg + _raw/embed_items.txt
// Out: D:/DsHs/grau/_raw/native/grau_data.tsv.gz , D:/DsHs/grau/_raw/native/img.bin
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = process.env.GRAU_DIR || 'D:/DsHs/grau/grau_index.v1.4.2';
const PAGE = DIR + '/grau_index.linked.html';
const CACHE = 'D:/DsHs/grau/_raw/embed512';
const ITEMS = 'D:/DsHs/grau/_raw/embed_items.txt';
const OUT = 'D:/DsHs/grau/_raw/native';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const html = fs.readFileSync(PAGE, 'utf8');
function grab(id) {
  const i = html.indexOf('id="' + id + '"');
  if (i < 0) throw new Error('script not found: ' + id);
  const a = html.indexOf('>', i) + 1;
  const b = html.indexOf('</script>', a);
  return JSON.parse(html.slice(a, b));
}
const D = grab('grau-data');
const R = grab('grau-refs-data');
const S = D.S, E = D.E, LS = D.LS || {}, W = D.W || {}, WL = D.WL || {};
const O = D.O || { b: [], i: [], a: [], m: [] }, TZ = D.TZ || {}, DZ = D.DZ || {};

const clean = (s) => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const out = [];
const put = (...f) => out.push(f.map(clean).join('\t'));

put('#T', 'ГРАУ / ГАУ 索引号总表');
put('#L', '整理：@防空妖精哥特兰 · @Deepseek · 三陆问题研究中心');
// Russian names of the numbered sections: the payload only carries the group number,
// which would render as a bare "Группа 5" in the native tree.
const NUM_TITLE_RU = {
  '1': 'Приборы управления огнём, разведка, связь и обеспечение',
  '2': 'Орудия, миномёты, РСЗО и пусковые установки',
  '3': 'Боеприпасы и боевые части',
  '4': 'Метательные заряды, пороха и пиротехника',
  '5': 'Средства ПВО и противоракетной обороны',
  '6': 'Стрелковое оружие и снаряжение военнослужащих',
  '7': 'Патроны, взрыватели и инженерные средства подрыва',
  '8': 'Ракеты и ракеты-носители (отдел 8, позднее УРВ РВСН)',
  '9': 'Ракетные комплексы и их составные части',
  '11': 'Ракеты-носители, космические аппараты и их части',
  '13': 'Строительство, энерго- и водоснабжение (РВСН/космос)',
  '14': 'Специальное имущество',
  '15': 'Ракетные комплексы РВСН',
  '16': 'Строительство, энерго- и водоснабжение (РВСН/космос)',
  '17': 'Специальное имущество',
};
const GAU_TITLE_RU = {
  '50': 'Изделия и имущество старой системы ГАУ',
  '51': 'Оптика и приборы наблюдения (ГАУ)',
  '52': 'Орудия и лафеты (ГАУ)',
  '53': 'Боеприпасы и укупорка (ГАУ)',
  '54': 'Заряды и пороха (ГАУ)',
  '55': 'Взрыватели и капсюли (ГАУ)',
  '56': 'Стрелковое оружие и станки (ГАУ)',
  '57': 'Патроны и мины (ГАУ)',
  '58': 'Прочие изделия (ГАУ)',
};
function seriesRu(s) {
  const n = String(s.n);
  const m = /^Группа\s+(\d+)(\s*\(ГАУ\))?$/.exec(s.ru || '');
  if (!m) return s.ru || '';
  if (m[2]) return GAU_TITLE_RU[m[1]] || s.ru;
  return NUM_TITLE_RU[m[1]] || s.ru;
}
for (const s of S) put('#S', s.key, s.kind === 'letter' ? 'l' : 'n', s.n, s.letter, s.zh, seriesRu(s), (s.prefixes || []).join(' '), s.shortZh || '', s.shortRu || '', s.grpZh || '', s.grpRu || '');
// v1.4.2.1: 字头含义层——原生详情面板与左侧树的提示都读这一段。
// kind: D=序列（局号）含义、L=字头（字母类别）含义、X=通用规则（正则）
const PG = D.PG || {};
for (const k of Object.keys(PG.depts || {})) { const r = PG.depts[k]; put('#G', k, 'D', r.zh || '', r.ru || '', r.src || '', r.quote || '', r.conf || 'B'); }
for (const k of Object.keys(PG.letters || {})) { const r = PG.letters[k]; put('#G', k, 'L', r.zh || '', r.ru || '', r.src || '', r.quote || '', r.conf || 'B'); }
for (const r of (PG.generic || [])) put('#G', r.pattern, 'X', r.zh || '', r.ru || '', r.src || '', r.quote || '', r.conf || 'B');
for (const t of (R.types || [])) put('#C', t.t, t.zh, t.ru, t.n);
for (const o of (R.orgs || [])) put('#O', o.id, o.zh, o.ru, o.city, o.note, o.n);
for (const e of E) {
  const lit = e[10];
  const orgs = (e[6] || '').split(' ').filter(Boolean).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(' ');
  // component layer: aka (alternative designations) / usedOn (equipment it fits) / parts (reverse)
  put('#E', e[0], e[5], orgs, e[7] || '', e[8], e[9] || '', e[2] || '', e[3] || '', e[4] || '',
    lit ? (lit[4] === 2 ? 'fix' : lit[4] === 1 ? 'enrich' : 'add') : '',
    lit ? (lit[0] || '') : '', lit ? (lit[1] || '') : '', lit ? (lit[2] || '') : '',
    (e[11] || []).join(';'), (e[12] || []).join(';'), (e[13] || []).join(';'));
}
for (const k of Object.keys(W)) { const w = W[k]; put('#W', k, w[0], w[1], w[2], w[3] || '', w[4] || '', w[5] || '', w[6] || ''); }
for (const k of Object.keys(WL)) {
  const eds = WL[k];
  for (const lang of Object.keys(eds)) { const w = eds[lang]; put('#WL', k, lang, w[0], w[1], w[2], w[3] || '', w[4] || '', w[5] || '', w[6] || ''); }
}
for (const k of Object.keys(LS)) put('#K', k, LS[k]);
for (const r of O.b) {
  const srcs = r[3] || [];
  const flat = [];
  for (const s of srcs) { flat.push(s[0], s[1] || '', s[2] || ''); }
  put('#B', r[0], r[1] || '', r[2] || '', flat.length / 3, ...flat);
}
for (const r of O.i) put('#I', r[0], r[1] || '', r[2] || '', r[3] || '', r[4] || '', r[5] || '', r[6] || '', r[7] || '', r[8] || '');
for (const r of O.a) put('#A', r[0], r[1] || '', r[2] ? 1 : 0);
for (const r of O.m) put('#M', r[0], r[1] || '');
for (const k of Object.keys(TZ)) put('#Z', k, TZ[k]);
for (const k of Object.keys(DZ)) put('#D', k, DZ[k]);
for (const a of (R.abbr || [])) put('#N', a.a, a.zh || '', a.n || 0);
for (const n of (R.nicks || [])) put('#P', n.s, n.zh || '', n.n || 0);

// complete bibliography (generated by _raw/build_biblio.cjs) -> its own tab in the native program
{
  const BIB = process.env.BIBLIO || 'D:/DsHs/grau/_raw/biblio/references.json';
  if (fs.existsSync(BIB)) {
    const refs = JSON.parse(fs.readFileSync(BIB, 'utf8'));
    for (const x of refs) put('#R', x.cat, x.title, x.url || '', x.note || '', x.n || 0);
    console.log('bibliography rows: ' + refs.length);
  } else {
    console.log('bibliography rows: 0 (references.json not found)');
  }
}

const tsv = out.join('\n') + '\n';
const gz = zlib.gzipSync(Buffer.from(tsv, 'utf8'), { level: 9 });
fs.writeFileSync(OUT + '/grau_data.tsv.gz', gz);
fs.writeFileSync(OUT + '/grau_data.tsv', tsv);
console.log('tsv lines: ' + out.length + ' | raw ' + (tsv.length / 1048576).toFixed(2) + ' MB | gz ' + (gz.length / 1048576).toFixed(2) + ' MB');

// ---- images -------------------------------------------------------------
const items = fs.readFileSync(ITEMS, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const chunks = [];
const index = [];
let total = 0;
items.forEach((ref) => {
  const name = ref.replace(/^thumbs\//, '');
  // name-keyed cache (position-keyed files drift as soon as the reference list grows)
  const cached = path.join(CACHE, name.replace(/\.[^.]+$/, '') + '.jpg');
  let bytes = null;
  if (fs.existsSync(cached)) bytes = fs.readFileSync(cached);
  else {
    const orig = path.join(DIR, ref);
    if (fs.existsSync(orig)) { bytes = fs.readFileSync(orig); console.log('  raw fallback: ' + name + ' (' + bytes.length + ' B)'); }
  }
  if (!bytes) { console.log('  MISSING: ' + name); return; }
  const nm = Buffer.from(name, 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(nm.length, 0);
  head.writeInt32LE(bytes.length, 4);
  chunks.push(head, nm, bytes);
  total += bytes.length;
  index.push([name, bytes.length]);
});
const imgBuf = Buffer.concat(chunks);
const magic = Buffer.alloc(14);
magic.write('GRIMG1', 0, 'ascii');
magic.writeInt32LE(index.length, 6);
magic.writeInt32LE(total, 10);
fs.writeFileSync(OUT + '/img.bin', Buffer.concat([magic, imgBuf]));
console.log('images: ' + index.length + ' | payload ' + (total / 1048576).toFixed(2) + ' MB | img.bin ' + ((total + imgBuf.length + 14) / 1048576).toFixed(2) + ' MB');
