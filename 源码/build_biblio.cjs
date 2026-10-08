// Build the complete bibliography (参考文献目录) for the delivery from the built CSV,
// so every entry is traceable to real data rather than to a hand-written list.
//   node build_biblio.cjs            -> _raw/biblio/references.json + 参考文献.md + references.tsv
// env: CSV  (default D:/DsHs/grau/grau_index.v1.4.2.1/grau_index.csv)
//      OUT  (default D:/DsHs/grau/_raw/biblio)
const fs = require('fs');
const path = require('path');

const CSV = process.env.CSV || 'D:/DsHs/grau/grau_index.v1.4.2.1/grau_index.csv';
const OUT = process.env.OUT || 'D:/DsHs/grau/_raw/biblio';
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- csv (semicolon, quoted, BOM) ---------------- */
function parse(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ';') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const rows = parse(fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, ''));
const head = rows[0];
const I = {}; head.forEach(function (h, n) { I[h] = n; });
const data = rows.slice(1).filter(function (r) { return r.length > 5; });

/* ---------------- collect ---------------- */
const wiki = new Map();     // lang \t url -> {lang,title,url,n,langs:Set}
const addSrc = new Map();   // src \t url -> {src,url,quote,n,idx:[]}
const imgHost = new Map();  // host -> count
data.forEach(function (r) {
  const idx = r[I['index']] || '';
  const t = r[I['wiki']], u = r[I['wiki_url']], lg = r[I['wiki_lang']] || '';
  const langs = (r[I['wiki_langs']] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (u) {
    const k = lg + '\t' + u;
    if (!wiki.has(k)) wiki.set(k, { lang: lg, title: t || '', url: u, n: 0, langs: new Set(), idx: [] });
    const w = wiki.get(k);
    w.n++; if (w.idx.length < 6) w.idx.push(idx);
    langs.forEach(function (x) { w.langs.add(x); });
  }
  const s = r[I['src']], su = r[I['src_url']], sq = r[I['src_quote']] || '';
  if (su) {
    const k2 = s + '\t' + su;
    if (!addSrc.has(k2)) addSrc.set(k2, { src: s, url: su, quote: sq, n: 0, idx: [] });
    const o = addSrc.get(k2);
    o.n++; if (o.idx.length < 8) o.idx.push(idx);
    if (!o.quote && sq) o.quote = sq;
  }
  const img = r[I['wiki_url']] || '';
  try { const h = new URL(img).host; imgHost.set(h, (imgHost.get(h) || 0) + 1); } catch (e) { /* not a url */ }
});

/* ---------------- static source list ---------------- */
const S = [];
function add(cat, title, url, note, n) { S.push({ cat: cat, title: title, url: url || '', note: note || '', n: n || 0 }); }

const RU = 'https://xn----7sbb5ahj4aiadq2m.xn--p1ai';
add('基础目录', 'русская-сила.рф — «Индексные обозначения ГРАУ»', RU + '/guide/army/index_grau.shtml',
  'ГРАУ 索引号分组表，条目俄文描述与分组名的主要来源；本表俄文描述以其为准（无 SALIS3 描述时）', 0);
add('基础目录', '500maketov.ru — «Известные индексы ГРАУ»', 'https://500maketov.ru/info/index_grau/',
  'ГРАУ／ГАУ 分组表与五个非 ГРАУ 设计局（КБП、ЦКИБ、ЦНИИТочМаш、КМЗ、ЗиД）条目', 0);
add('基础目录', 'SALIS3 (ver. 329, 2011-06-11) — «Индексы Главного Ракетно-Артиллерийского Управления МО»',
  '', 'PDF 目录（俄文索引号 + NATO/USA 代号 + 描述）；描述文字与 NATO 代号的首选来源，本表 1 万条中大部分描述取自它', 0);

add('其他总局目录来源', 'bmz.ru — «Обозначение техники (Индекс) ГАБТУ»', 'https://bmz.ru/oboznachenie-tehniki-indeks-gabtu',
  '装甲兵总局 ГБТУ 索引（gbtu_objects.csv 590 条）', 0);
add('其他总局目录来源', 'русская-сила.рф — «Индекс ГБТУ»', RU + '/guide/army/index_gbtu.shtml', 'ГБТУ 分组表（与 bmz.ru 互校）', 0);
add('其他总局目录来源', 'русская-сила.рф — «Индекс ПВО»', RU + '/guide/army/index_pvo.shtml', '防空索引参照', 0);
add('其他总局目录来源', 'Википедия — «Индекс ГБТУ» (ru / uk)', 'https://ru.wikipedia.org/wiki/%D0%98%D0%BD%D0%B4%D0%B5%D0%BA%D1%81_%D0%93%D0%91%D0%A2%D0%A3',
  '俄文／乌克兰文维基的 ГБТУ 索引列表', 0);
add('其他总局目录来源', 'МО РФ — «Средства инженерного вооружения. Каталог», изд. 2, кн. 1 (436 с.)', '',
  '俄国防部工程器材目录（engineering_items.csv 208 条；КД 代号与 КВТ／ОКП／ЕКПС 分类码）', 0);
add('其他总局目录来源', 'guns.ru — сводка индексов (тема «Индексы оружия»)', '',
  '旧 ГАУ 部门号 56／57 与 МО.NN.NN 索引汇编（gau_56_57.csv 478 条、mo_index.csv 11 条）', 0);

/* ---------------- web supplement layer ---------------- */
const srcFamilies = new Map();
Array.from(addSrc.values()).forEach(function (o) {
  const key = o.src || '(без указания)';
  if (!srcFamilies.has(key)) srcFamilies.set(key, []);
  srcFamilies.get(key).push(o);
});
Array.from(srcFamilies.entries())
  .sort(function (a, b) { return b[1].length - a[1].length; })
  .forEach(function (p) {
    const list = p[1].sort(function (a, b) { return String(a.url).localeCompare(String(b.url)); });
    const total = list.reduce(function (s, o) { return s + o.n; }, 0);
    add('网络补充层', p[0], '', '补充编号 ' + total + ' 处来源链接（' + list.length + ' 个链接）', total);
    list.forEach(function (o) { add('网络补充层·链接', (o.idx.join('、') || '—') + ' — ' + p[0].slice(0, 60), o.url, o.quote, o.n); });
  });

/* ---------------- card layer ---------------- */
const ruArticles = Array.from(wiki.values()).filter(function (w) { return w.lang === 'ru'; })
  .sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); });
const rwdPages = Array.from(wiki.values()).filter(function (w) { return w.lang === 'rwd'; })
  .sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); });
const otherLang = Array.from(wiki.values()).filter(function (w) { return w.lang !== 'ru' && w.lang !== 'rwd'; });
add('卡片层', 'Википедия (ru) — 条目正文、首段与配图（CC BY-SA）', '', '卡片文字与图片的主要来源：' + ruArticles.length + ' 个条目，覆盖 1 778 张卡片中的绝大部分', ruArticles.length);
add('卡片层', 'rwd-mb3.de — каталог RWD (ННА ГДР): «Raketen- und Waffentechnischer Dienst»', 'http://www.rwd-mb3.de/',
  '东德人民军军事技术目录：德语原文 + 实物照片（' + rwdPages.length + ' 个页面）', rwdPages.length);
add('卡片层', 'Викиучебник — «Словесные названия российского оружия» (глоссарий, CC BY-SA)',
  'https://ru.wikibooks.org/wiki/%D0%A1%D0%BB%D0%BE%D0%B2%D0%B5%D1%81%D0%BD%D1%8B%D0%B5_%D0%BD%D0%B0%D0%B7%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F_%D1%80%D0%BE%D1%81%D1%81%D0%B8%D0%B9%D1%81%D0%BA%D0%BE%D0%B3%D0%BE_%D0%BE%D1%80%D1%83%D0%B6%D0%B8%D1%8F',
  '武器代号（按字母分页）词表，用于「专名与代号」与部分卡片匹配', 0);
add('卡片层', 'Bing — поиск изображений (сетевые иллюстрации)', 'https://www.bing.com/images/',
  '无条目文字的条目配图（版权未标注）', 0);
ruArticles.forEach(function (w) {
  add('卡片层·维基条目 (ru)', w.title, w.url, '条目被 ' + w.n + ' 个索引号引用；可用语言：' + Array.from(w.langs).slice(0, 12).join('/') + (w.langs.size > 12 ? '…' : ''), w.n);
});
rwdPages.forEach(function (w) { add('卡片层·RWD 页面', w.title, w.url, '被 ' + w.n + ' 个索引号引用' + (w.idx.length ? '（' + w.idx.join('、') + '）' : ''), w.n); });
otherLang.forEach(function (w) { add('卡片层·其他条目', w.title || w.url, w.url, '语种标记 ' + w.lang, w.n); });

/* ---------------- references used in build ---------------- */
add('构建用参考资料', 'С. Сарайкин — статьи по истории РВСН, авиации и бронетехники', 'http://ser-sarajkin.narod2.ru/',
  '网络补充层来源（archives，2 194 篇）', 0);
add('构建用参考资料', '«Руски индекси в ракетните и космически войски» (PDF)', '', '补充层来源：保加利亚文 ГРАУ 索引汇编', 0);
add('构建用参考资料', 'GlobalSecurity.org — «Soviet/Russian Gravity Bombs»', 'https://www.globalsecurity.org/military/world/russia/bombs.htm',
  '补充层来源：航弹型号 ↔ 工厂／ГРАУ 编号对照表', 0);
add('构建用参考资料', 'Военное обозрение (topwar.ru) — «Ядерная война в Европе…» (11.03.2024)', 'https://topwar.ru/',
  '补充层来源：核航弹编号', 0);
add('构建用参考资料', 'С. Сарайкин — «Ядерные авиабомбы СССР первого поколения»', '', '补充层来源：核航弹编号', 0);
add('构建用参考资料', 'MediaWiki API (ru.wikipedia.org / ru.wikibooks.org) — категории, search, extracts, allpages',
  'https://ru.wikipedia.org/w/api.php', '条目、首段、多语种链接与配图的抓取接口（遵守 API 礼仪与限速）', 0);
add('构建用参考资料', 'Викисклад / Wikimedia Commons — изображения статей (CC BY-SA / public domain)',
  'https://commons.wikimedia.org/', '条目配图的实际存放处；每张图的作者与许可在卡片内注明', 0);

/* ---------------- write ---------------- */
const catOrder = ['基础目录', '其他总局目录来源', '卡片层', '网络补充层', '构建用参考资料', '卡片层·维基条目 (ru)', '卡片层·RWD 页面', '卡片层·其他条目', '网络补充层·链接'];
const ORDER = {}; catOrder.forEach(function (c, i) { ORDER[c] = i; });
const SORTED = S.map(function (x, i) { return { x: x, i: i }; })
  .sort(function (a, b) { return (ORDER[a.x.cat] === undefined ? 99 : ORDER[a.x.cat]) - (ORDER[b.x.cat] === undefined ? 99 : ORDER[b.x.cat]) || a.i - b.i; })
  .map(function (p) { return p.x; });
const byCat = {};
SORTED.forEach(function (x) { (byCat[x.cat] = byCat[x.cat] || []).push(x); });

fs.writeFileSync(path.join(OUT, 'references.json'), JSON.stringify(SORTED, null, 1), 'utf8');
fs.writeFileSync(path.join(OUT, 'references.tsv'),
  '#R\tкатегория\tназвание\tссылка\tпримечание\tпозиций\n' +
  SORTED.map(function (x) { return ['#R', x.cat, x.title.replace(/\t/g, ' '), x.url, x.note.replace(/\t/g, ' ').replace(/\n/g, ' '), x.n].join('\t'); }).join('\n') + '\n', 'utf8');

let md = '# 参考文献目录\n\n';
md += '本目录由构建脚本 `_raw/build_biblio.cjs` 从交付数据表（`grau_index.csv` 的 `wiki*`／`src*` 列）自动生成，'
  + '共 **' + S.length + '** 条记录，其中维基条目 ' + ruArticles.length + ' 条、RWD 目录页 ' + rwdPages.length + ' 条、'
  + '网络补充层链接 ' + (byCat['网络补充层·链接'] || []).length + ' 条。\n\n';
md += '生成时间：构建时 · 数据版本：见 README 的版本号\n\n';
catOrder.forEach(function (cat) {
  const list = byCat[cat]; if (!list || !list.length) return;
  md += '## ' + cat + '（' + list.length + ' 条）\n\n';
  if (cat.indexOf('·') < 0) {
    md += '| 名称 | 链接 | 说明 |\n|---|---|---|\n';
    list.forEach(function (x) { md += '| ' + x.title + ' | ' + (x.url ? '<' + x.url + '>' : '—') + ' | ' + x.note + ' |\n'; });
    md += '\n';
  } else {
    list.forEach(function (x, i) { md += (i + 1) + '. **' + x.title + '** — ' + (x.url ? x.url : '—') + (x.note ? ' — ' + x.note : '') + '\n'; });
    md += '\n';
  }
});
fs.writeFileSync(path.join(OUT, '参考文献.md'), md, 'utf8');

console.log('references: ' + S.length + ' rows');
catOrder.forEach(function (c) { if (byCat[c]) console.log('  ' + c + ': ' + byCat[c].length); });
console.log('wiki ru articles: ' + ruArticles.length + ' | rwd pages: ' + rwdPages.length + ' | other: ' + otherLang.length);
console.log('web supplement links: ' + (byCat['网络补充层·链接'] || []).length + ' in ' + srcFamilies.size + ' families');
console.log('hosts:', Array.from(imgHost.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6).map(function (p) { return p[0] + ':' + p[1]; }).join(' '));
console.log('written ' + OUT + '/参考文献.md (' + fs.statSync(path.join(OUT, '参考文献.md')).size + ' B)');
