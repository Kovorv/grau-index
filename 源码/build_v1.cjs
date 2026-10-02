const fs = require('fs');
const RAW = 'D:\\DsHs\\grau\\_raw';
const { translit } = require('./translit.cjs');
const { orgsFor, orgRolesFor } = require('./orgmatch.cjs');

const { typeOf, TYPE_ORDER, TYPE_LABEL } = require('./classify.cjs');
const ORGS = require('./orgs.cjs');
const ABBR = require('./abbr.cjs');

const master = JSON.parse(fs.readFileSync(RAW + '\\master.json', 'utf8'));

// ---------- Chinese glosses for the NATO reporting names (nicks_zh/nato.json) ----------
// The column keeps the original code and appends the Chinese rendering: "AT-2 Swatter（苍蝇拍）".
const NATO_ZH = fs.existsSync(RAW + '\\nicks_zh\\nato.json')
  ? JSON.parse(fs.readFileSync(RAW + '\\nicks_zh\\nato.json', 'utf8')) : {};
let natoZh = 0;
for (const e of master.entries) {
  if (e.nato && NATO_ZH[e.nato] && NATO_ZH[e.nato] !== e.nato) { e.nato = NATO_ZH[e.nato]; natoZh++; }
}
console.log('nato designators localised:', natoZh, 'rows |', Object.keys(NATO_ZH).length, 'mapped');

// ---------- reference inventory, merged into the same page ----------
const REFS = fs.existsSync(RAW + '\\refs.json')
  ? JSON.parse(fs.readFileSync(RAW + '\\refs.json', 'utf8'))
  : { abbr: [], nicks: [], orgs: [], types: [] };
console.log('reference inventory | abbr', (REFS.abbr || []).length, '| nicknames', (REFS.nicks || []).length,
  '| orgs', (REFS.orgs || []).length, '| types', (REFS.types || []).length);

// ---------- late Chinese translations (matched by designator per chunk) ----------
const zhExtra = new Map();
for (const pass of [
  { dir: 'i18n2', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n3', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n4', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n5', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n6', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n7', man: 'manifest.json', pre: 'zh-' },
]) {
  const mp = RAW + '\\' + pass.dir + '\\' + pass.man;
  if (!fs.existsSync(mp)) continue;
  const dirPath = RAW + '\\' + pass.dir;
  const allFiles = fs.readdirSync(dirPath).filter((f) => /\.txt$/.test(f));
  JSON.parse(fs.readFileSync(mp, 'utf8')).forEach((idxs, i) => {
    const n = String(i + 1).padStart(2, '0');
    let useFiles = allFiles.filter((f) => f === pass.pre + n + '.txt');
    if (!useFiles.length) useFiles = allFiles.filter((f) => /^zh.*\.txt$/.test(f));
    const byDesignator = new Map();
    for (const f of allFiles) {
      for (const line of fs.readFileSync(dirPath + '\\' + f, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
        const t = line.indexOf('\t');
        if (t <= 0) continue;
        const body = line.slice(t + 1);
        const bar = body.indexOf(' | ');
        if (bar <= 0) continue;
        const desig = body.slice(0, bar).trim();
        const zh = body.slice(bar + 3).trim();
        if (desig && zh) byDesignator.set(desig, zh);
      }
    }
    idxs.forEach((idx) => { const zh = byDesignator.get(idx); if (zh) zhExtra.set(idx, zh); });
  });
}
for (const e of master.entries) if (!e.zh && zhExtra.has(e.idx)) e.zh = zhExtra.get(e.idx);
// keep both sides consistent: no Russian source text => no translation
for (const e of master.entries) if (!e.ru && e.zh) e.zh = '';
// A translation is stale when it was produced from an older, merged text. Two independent symptoms,
// both required to coexist with a designator the Russian source does not contain:
//   * the Chinese repeats one of its own description phrases (several rows were glued together), or
//   * it is far longer than the Russian it is supposed to translate.
// Russian nicknames and abbreviations quoted inside the Chinese are legitimate and survive.
const DESIGRE = /[0-9A-Za-zА-ЯЁ][0-9A-Za-zА-ЯЁ]*[-,.][0-9А-ЯЁA-Za-z][0-9А-ЯЁA-Za-z,.\-()]*/g;
const KNOWN_IDX = new Set(master.entries.map((e) => String(e.idx).toLowerCase().replace(/\s/g, '')));
function repeatedCjk(s, n) {
  for (const run of (String(s).match(/[\u4e00-\u9fff]{3,}/g) || [])) {
    for (let i = 0; i + n <= run.length; i++) {
      const g = run.slice(i, i + n);
      if (String(s).split(g).length - 1 >= 2) return g;
    }
  }
  return null;
}
const staleDropped = [];
for (const e of master.entries) {
  if (!e.ru || !e.zh) continue;
  const clean = (d) => d.replace(/[,.()\-]+$/, '');
  const kk = (s) => String(s || '').toLowerCase().replace(/\s/g, '');
  const inRu = new Set((String(e.ru).match(DESIGRE) || []).map((d) => kk(clean(d))));
  inRu.add(kk(e.idx));
  const foreign = [...new Set((String(e.zh).match(DESIGRE) || []).map((d) => kk(clean(d))))]
    .filter((d) => d && KNOWN_IDX.has(d) && !inRu.has(d));
  if (!foreign.length) continue;
  const rep = repeatedCjk(e.zh, 5);
  if (rep || e.zh.length > e.ru.length * 2.5 + 60) {
    staleDropped.push({ idx: e.idx, rep, ratio: +(e.zh.length / Math.max(1, e.ru.length)).toFixed(2), ru: e.ru, zh: e.zh });
    e.zh = '';
  }
}
if (staleDropped.length) {
  fs.writeFileSync(RAW + '\\stale_translations.json', JSON.stringify(staleDropped, null, 1), 'utf8');
  console.log('stale translations withheld (see _raw/stale_translations.json):', staleDropped.length);
}

// ---------- classify + organisations ----------
const ORG_BY_ID = {};
for (const o of ORGS) ORG_BY_ID[o.id] = o;
// organisations extracted from Wikipedia infoboxes (see org_wiki_apply.cjs) are merged in on top
// of the source-text matching done by orgmatch.cjs
let WIKIORG = {};
try { WIKIORG = JSON.parse(fs.readFileSync(RAW + '\\wiki_orgs.json', 'utf8')); }
catch (err) { console.log('wiki org layer: none (' + err.code + ')'); }
let wikiOrgLinks = 0;
for (const e of master.entries) {
  e.type = typeOf(e);
  const hay = (e.idx + ' ' + (e.ru || '') + ' ' + (e.zh || '')).toLowerCase();
  e.orgs = orgsFor(e.idx, e.ru, e.zh);
  e.orgRoles = orgRolesFor(e.idx, e.ru, e.zh);
  const wo = WIKIORG[e.idx];
  if (wo) {
    for (const id in wo) {
      if (e.orgs.indexOf(id) < 0) { e.orgs.push(id); wikiOrgLinks++; }
      const r = wo[id];
      e.orgRoles[id] = (e.orgRoles[id] && e.orgRoles[id] !== r) || e.orgRoles[id] === 'dm' ? 'dm' : r;
    }
  }
}
console.log('organisations from the wiki infobox layer:', Object.keys(WIKIORG).length, 'rows |', wikiOrgLinks, 'links');

// ---------- index prefix / series ----------
// v1.4.5: 编号所属的索引体系（ГРАУ 常规 / ПВО / РВСН / 航天 / 老 ГАУ / ВВС / ВМФ / 产品代号）
const SYSC = require('./sys_classify.cjs');
// v1.4.2.1: 字头（索引前缀）含义对照层——读者问「1ПН 是什么意思」，所以每个字头配一句解释。
// 数据来自 _raw/parts/prefix_glossary_{depts,letters}.json（公开来源整理，逐条带 src/quote/conf）。
const PG = { letters: {}, depts: {}, generic: [] };
for (const gf of ['prefix_glossary_depts.json', 'prefix_glossary_letters.json']) {
  const gp = RAW + '\\parts\\' + gf;
  if (!fs.existsSync(gp)) { console.log('prefix glossary: ' + gf + ' missing — building without it'); continue; }
  const gj = JSON.parse(fs.readFileSync(gp, 'utf8'));
  Object.assign(PG.depts, gj.depts || {});
  Object.assign(PG.letters, gj.letters || {});
  if (Array.isArray(gj.generic)) PG.generic = PG.generic.concat(gj.generic);
}
console.log('prefix glossary:', Object.keys(PG.letters).length, 'prefixes |', Object.keys(PG.depts).length, 'departments');
function prefixOf(idx, ru) {
  const c = SYSC.classify(idx, ru);
  // v1.4.2.1: 反序 отдел 6 原来是「样品号＋末尾 6」整串作字头（48Н6、55Ж6、58Ж6、64Н6…），
  // 309 条被切成 233 个只有一两行的字头，太碎。现在只取「类别字母＋6」（Н6／Ж6／М6…，共 24 个），
  // 与第 5 局的 5Н／5П 风格一致：字头＝类别，样品号留在编号里。
  if (c.sys === 'pvo6') {
    const m = String(idx).match(/^\d{1,3}([А-ЯЁ]{1,4})6/);
    if (m) return m[1] + '6';
    const f = String(idx).match(/^(\d{1,3}[А-ЯЁ]{1,4}6)/);
    if (f) return f[1];
  }
  // v1.4.2.1: 老 ГАУ 的字头收缩成局号本身（51／52／…／58），8 个局号合成一个大类后不再细到 51-О 一级
  if (c.sys === 'gau_old') {
    const m = String(idx).match(/^(5\d)/);
    if (m) return m[1];
  }
  // 海军炮弹 А3-/А4-
  if (c.sys === 'vmf') {
    const m = String(idx).match(/^([А-ЯЁ][34])-/);
    if (m) return m[1];
  }
  if (/^[0-9]/.test(idx)) {
    const m = idx.match(/^([0-9]{1,2}-?[А-ЯЁ]{1,4}|[0-9]{1,2}[А-ЯЁ]{0,4})/);
    return m ? m[1] : idx.slice(0, 4);
  }
  if (/^[А-ЯЁ]/.test(idx)) {
    const m = idx.match(/^([А-ЯЁ]{1,4})(?=-)/);
    if (m) return m[1];
    // factory / design-office codes carry no hyphen ("АЕК 948", "РВ023", "СП1"): the family is
    // the letter run that precedes the number
    const t = idx.replace(/[0-9].*$/, '').trim();
    return t || idx.slice(0, 3);
  }
  return idx.slice(0, 4);
}
const NUM_TITLE = {
  '1': '火控、侦察、指挥与保障器材', '2': '火炮、迫击炮、火箭炮与发射装置', '3': '弹药与战斗部',
  '4': '发射装药、火药与烟火器材', '5': '防空与反导系统器材', '6': '轻武器与单兵装备',
  '7': '枪弹、引信与工程爆破器材', '8': '弹道导弹与运载火箭（原第8局，后归 РВСН）', '9': '导弹系统及其部件',
  '11': '运载火箭、航天器与配套器材', '13': '基建与供电供水（РВСН／航天对象）', '14': '特种器材',
  '15': '战略火箭军导弹系统', '16': '基建与供电供水（РВСН／航天对象）', '17': '特种器材',
};
const GAU_TITLE = {
  '50': 'ГАУ 旧体系装备与器材', '51': 'ГАУ 光学与观测器材', '52': 'ГАУ 火炮与炮架', '53': 'ГАУ 弹药与包装',
  '54': 'ГАУ 装药与火药', '55': 'ГАУ 引信与雷管', '56': 'ГАУ 轻武器与枪架', '57': 'ГАУ 枪弹与地雷', '58': 'ГАУ 其他器材',
};
// Russian names of the numbered sections (the source sites only give the group number).
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
// v1.4.5: 大类＝「索引体系」（ГРАУ 常规局号 / ПВО отдел5 / ПВО 反序 отдел6 / РВСН / 航天 / 基建 /
// 老 ГАУ / ВВС / ВМФ / 产品代号 / 其他），见 _raw/sys_classify.cjs 的判据与依据
function seriesOf(e) {
  const c = SYSC.classify(e.idx, e.ru);
  const g = SYSC.groupOf(c.dept);
  const dn = c.series || c.dept;      // v1.4.2.1: 老 ГАУ 的 51…58 共用一个大类（n50）
  return { kind: 'num', n: dn, key: 'n' + dn, sys: c.sys, grp: g.key, grpOrder: g.order, grpZh: g.zh, grpRu: g.ru };
}

// ---------- data model ----------
const DATA = { series: [], entries: [], litSources: {}, wiki: {}, wikiAlt: {} };
// A few designators are bare numbers, and Wikipedia answers those with articles about the
// number itself («8 (число)», «8 (eight) is the natural number…»). Reject those records.
const CARD_JUNK = /(натуральное число|натура́льное число́|natural number|自然数|is the number|ist die natürliche Zahl|nombre entier|число —|число,|Zahl\b)/i;
const cardOk = (rec) => !(rec && rec[2] && CARD_JUNK.test(String(rec[2])));
// Wikipedia layer (v1.1 task ①): a short intro, the article link, and its thumbnail.
// Built by _raw/wiki_pack.cjs; rows without an article simply stay absent.
const WIKI_FILE = RAW + '\\wiki\\wiki_payload.json';
if (fs.existsSync(WIKI_FILE)) {
  const wiki = JSON.parse(fs.readFileSync(WIKI_FILE, 'utf8'));
  const byIdx = new Map(master.entries.map((e) => [String(e.idx), e]));
  for (const [idx, rec] of Object.entries(wiki)) if (byIdx.has(idx) && cardOk(rec)) DATA.wiki[idx] = rec;
  console.log('wiki layer:', Object.keys(DATA.wiki).length, 'articles');
} else {
  console.log('wiki layer: _raw/wiki/wiki_payload.json not found — building without it');
}
// Other language editions of the same topics (task ① extension): built by
// _raw/wiki_merge_multi.cjs. Keyed by designator, then by language code.
const WIKI_ALT_FILE = RAW + '\\wiki\\wiki_alt.json';
if (fs.existsSync(WIKI_ALT_FILE)) {
  const alt = JSON.parse(fs.readFileSync(WIKI_ALT_FILE, 'utf8'));
  let n = 0;
  for (const [idx, rec] of Object.entries(alt)) if (DATA.wiki[idx]) {
    const keep = {};
    for (const [lang, r] of Object.entries(rec)) if (cardOk(r)) keep[lang] = r;
    if (Object.keys(keep).length) { DATA.wikiAlt[idx] = keep; n += Object.keys(keep).length; }
  }
  console.log('wiki alt layer:', Object.keys(DATA.wikiAlt).length, 'rows |', n, 'language records');
} else {
  console.log('wiki alt layer: _raw/wiki/wiki_alt.json not found — building without it');
}
// Extra card sources: the RWD (NVA) catalogue (m02085) and search-engine pictures (m02084).
// Built by _raw/rwd_merge.cjs and _raw/gimg_pick.cjs. Rows the wikipedia layer missed become
// the primary record (tier 'r' / 'w'); the rest gain one more edition.
for (const [name, file, label] of [['rwd', 'rwd_alt', 'RWD каталог'], ['web', 'webimg_alt', 'поиск картинок']]) {
  const p = RAW + '\\wiki\\' + file + '.json';
  if (!fs.existsSync(p)) { console.log(name + ' layer: ' + file + '.json not found — skipped'); continue; }
  const layer = JSON.parse(fs.readFileSync(p, 'utf8'));
  let added = 0, alt = 0;
  for (const [idx, rec] of Object.entries(layer)) {
    if (DATA.wiki[idx]) { (DATA.wikiAlt[idx] = DATA.wikiAlt[idx] || {})[name] = rec; alt++; }
    else { DATA.wiki[idx] = rec; added++; }
  }
  console.log(name + ' layer (' + label + '):', added, 'new rows |', alt, 'editions added');
}
// Other directorate catalogues (m03497): ГБТУ object numbers, the engineering troops'
// equipment catalogue (СИВ) and the old-ГАУ 56/57 and МО.NN.NN index lists.
// Built by _raw/gbtu_parse.cjs and _raw/giu_parse.cjs.
const OTH_DIR = RAW + '\\gbtu\\';
DATA.other = { b: [], i: [], a: [], m: [] };
const readOth = (f) => (fs.existsSync(OTH_DIR + f) ? JSON.parse(fs.readFileSync(OTH_DIR + f, 'utf8')) : null);
const knum = (k) => { const m = String(k).match(/^(\d+)/); return m ? +m[1] : 1e6; };
const oGbtu = readOth('gbtu.json');
if (oGbtu) {
  oGbtu.sort((x, y) => knum(x.key) - knum(y.key) || String(x.key).localeCompare(String(y.key), 'ru'));
  DATA.other.b = oGbtu.map((r) => [String(r.key), r.desig || '', (r.note || '').replace(/\s+/g, ' ').trim(),
    (r.srcs || []).map((s) => [s.s, s.desig || '', (s.note || '').replace(/\s+/g, ' ').trim()])]);
}
const oGiu = readOth('giu_items.json');
if (oGiu) {
  DATA.other.i = oGiu.map((r) => [r.title, r.desig || '', r.section || '', r.purpose || '',
    (r.kvt || []).join(' '), (r.okp || []).join(' '), (r.ekps || []).join(' '),
    r.adopted || '', r.dev || '']);
}
const oGau = readOth('gau5657.json');
if (oGau) DATA.other.a = oGau.map((r) => [r.key, r.note, r.eng ? 1 : 0]);
const oMo = readOth('mo_idx.json');
if (oMo) DATA.other.m = oMo.map((r) => [r.key, r.note]);
console.log('other catalogues:', DATA.other.b.length, 'ГБТУ objects |', DATA.other.i.length,
  'engineering items |', DATA.other.a.length, 'old-ГАУ 56/57 indices |', DATA.other.m.length, 'МО indices');

// ---------- Chinese translations: catalogue strings + German RWD card bodies ----------
// TZ is a {russian string: chinese} lookup applied at render time, DZ is {designator: chinese}
// for the RWD (NVA) card bodies. Both are optional: without the files the page falls back to
// the source language.
const readZh = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
DATA.tz = readZh(RAW + '\\oth_zh\\cat_zh.json');
DATA.dz = readZh(RAW + '\\rwd_zh\\rwd_zh.json');
console.log('translations: catalogue strings', DATA.tz ? Object.keys(DATA.tz).length : 0,
  '| RWD card bodies', DATA.dz ? Object.keys(DATA.dz).length : 0);
// short labels for the supplementary-layer source ids (shown in the row badge tooltip)
const LIT_KIND = { add: 0, enrich: 1, fix: 2 };
const seriesIndex = new Map();
for (const e of master.entries) {
  const s = seriesOf(e);
  let si = seriesIndex.get(s.key);
  if (si === undefined) {
    si = DATA.series.length;
    seriesIndex.set(s.key, si);
    const fc = SYSC.FIXED_CLASS[s.n];
    const label = fc
      ? { zh: fc.zh, ru: fc.ru, sz: fc.sz, sr: fc.sr }
      : (GAU_TITLE[s.n]
        ? { zh: GAU_TITLE[s.n], ru: GAU_TITLE_RU[s.n] || ('Группа ' + s.n + ' (ГАУ)'), sz: '老ГАУ ' + s.n, sr: 'ГАУ ' + s.n }
        : {
          zh: NUM_TITLE[s.n] || ('第' + s.n + '类器材'), ru: NUM_TITLE_RU[s.n] || ('Группа ' + s.n),
          sz: '第' + s.n + '类', sr: 'Гр.' + s.n,
        });
    DATA.series.push({
      key: s.key, kind: s.kind, n: s.n || 0, letter: s.letter || '', zh: label.zh, ru: label.ru,
      shortZh: label.sz, shortRu: label.sr, sys: s.sys, prefixes: [],
      grp: s.grp, grpZh: s.grpZh, grpRu: s.grpRu, grpOrder: s.grpOrder,
    });
  }
  const p = prefixOf(e.idx, e.ru);
  const ser = DATA.series[si];
  if (!ser.prefixes.includes(p)) ser.prefixes.push(p);
  if (e.lit) DATA.litSources[e.lit.src] = e.lit.srcName;
  DATA.entries.push([e.idx, e.alt || '', e.nato || '', e.ru || '', e.zh || '', e.type, e.orgs.join(' '), p, si,
    (e.orgs || []).map(function (id) { return (e.orgRoles && e.orgRoles[id] === 'c') ? 'c' : 'd'; }).join(''),
    e.lit ? [e.lit.src, e.lit.url, e.lit.q, e.lit.name || '', LIT_KIND[e.lit.kind] || 0] : 0,
    e.aka || [], e.usedOn || [], e.parts || []]);
}
for (const s of DATA.series) s.prefixes.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
// v1.4.5: 大类按「索引体系」排序（ГРАУ 常规 → ПВО от5 → ПВО 反序6 → РВСН → 航天 → 基建 → 老 ГАУ →
// ВВС → ВМФ → 产品代号 → 其他），体系内按局号/编号自然序；同时把条目里的序列下标与 seriesIndex
// 一起重映射过去，使网页侧栏、CSV/XLSX 与原生程序的顺序一致
const serOrder = DATA.series.map((s, i) => i).sort((ia, ib) => {
  const a = DATA.series[ia], b = DATA.series[ib];
  const ga = a.grpOrder || 99, gb = b.grpOrder || 99;      // v1.4.6: 先「索引体系组」，再「大类」
  if (ga !== gb) return ga - gb;
  const oa = (SYSC.CLASS[a.sys] || { order: 99 }).order, ob = (SYSC.CLASS[b.sys] || { order: 99 }).order;
  if (oa !== ob) return oa - ob;
  if (a.n !== b.n) return a.n - b.n;
  return String(a.key).localeCompare(String(b.key), 'ru');
});
const serRemap = new Array(DATA.series.length);
serOrder.forEach((oldI, newI) => { serRemap[oldI] = newI; });
DATA.series = serOrder.map((i) => DATA.series[i]);
for (const e of DATA.entries) e[8] = serRemap[e[8]];
for (const k of Array.from(seriesIndex.keys())) seriesIndex.set(k, serRemap[seriesIndex.get(k)]);
// v1.4.4: 交付前的规范顺序——先大类（序列），再索引自然序，使 1А2 排在 1А11 之前
DATA.entries.sort((a, b) => (a[8] - b[8]) || String(a[0]).localeCompare(String(b[0]), 'ru', { numeric: true }));

// v1.4.6: keep the data layer's order (索引体系组 → 大类 → 大类序号) instead of a bare numeric sort,
// otherwise the group headers in the series chip row repeat and come out jumbled
const numSeries = DATA.series.filter((s) => s.kind === 'num').sort((a, b) => (a.grpOrder || 99) - (b.grpOrder || 99) || a.n - b.n);
const letterSeries = DATA.series.filter((s) => s.kind === 'letter').sort((a, b) => a.letter.localeCompare(b.letter, 'ru'));

const typeCounts = {};
const orgCounts = {};
const prefixCounts = {};
for (const e of DATA.entries) {
  typeCounts[e[5]] = (typeCounts[e[5]] || 0) + 1;
  prefixCounts[e[7]] = (prefixCounts[e[7]] || 0) + 1;
  for (const o of e[6].split(' ')) if (o) orgCounts[o] = (orgCounts[o] || 0) + 1;
}
const types = TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => ({ id: t, zh: TYPE_LABEL[t], n: typeCounts[t] }));
const orgs = ORGS.filter((o) => orgCounts[o.id]).sort((a, b) => orgCounts[b.id] - orgCounts[a.id])
  .map((o) => ({ id: o.id, zh: o.zh, ru: o.ru, city: o.city, note: o.note, n: orgCounts[o.id] }));
const prefixes = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ p, n }));
const abbrList = require('./refs.json').abbr.filter((a) => a.zh).map((a) => [a.a, a.zh, a.n]);

const total = DATA.entries.length;
console.log('series:', numSeries.length, 'num +', letterSeries.length, 'letter | entries:', total,
  '| prefixes:', prefixes.length, '| types:', types.length, '| orgs:', orgs.length, '| abbr:', abbrList.length);


// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================

// =====================================================================================
//  v1 page: ONE self-contained file
//    * 索引总表 / 详查索引 — two views, same standard (sticky header, filters, suggestions,
//      folding, theme, background, back-to-top)
//    * 中文 / Русский     — the Russian version is a sub-page of the same file: every label,
//      placeholder, description and tag switches in place, no second document
// =====================================================================================
const OUT = process.env.OUT_DIR || 'D:\\DsHs\\grau\\grau_index.v1';
fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Russian names for the equipment types (classify.cjs only ships Chinese ones)
const TYPE_RU = {
  sam: 'Зенитные ракетные системы', atgm: 'Противотанковые ракетные комплексы', missile: 'Ракеты и снаряды (корпус)',
  mlrs: 'РСЗО и залповые системы', arty: 'Артиллерийские орудия и миномёты', ammo: 'Боеприпасы и снаряды',
  comp: 'Узлы, БЧ и взрыватели', smallarms: 'Стрелковое оружие и ближний бой', armor: 'Бронетанковая техника и шасси',
  air: 'Летательные аппараты и БЛА', ship: 'Корабли и корабельная техника', radar: 'РЛС и средства РЭБ',
  radio: 'Радиосредства и связь', optic: 'Оптика и приборы наблюдения', fcs: 'Приборы управления огнём и ЭВМ',
  recon: 'Разведка и метео', ground: 'Пусковое и наземное оборудование', engineer: 'Инженерная и специальная техника',
  support: 'Контроль, обучение и ремонт', gear: 'Снаряжение и защита',
  'part-opt': 'Комплектующие: оптика и наблюдение', 'part-mech': 'Комплектующие: электромеханика', other: 'Прочее',
};

const STR = {
  zh: {
    docTitle: 'ГРАУ / ГАУ 索引号总表 · 整理 @防空妖精哥特兰', title: 'ГРАУ / ГАУ 索引号总表', total: '共 %N% 条',
    series: '序列', letters: '字母族', fam: '索引族', type: '器材类型', org: '研制／生产单位',
    allSeries: '全部序列', allFam: '全部字头', allType: '全部类型', allOrg: '全部单位',
    search: '搜索索引号 / 名称 / 说明（拉丁、西里尔、中文均可）',
    viewIndex: '索引总表', viewRefs: '详查索引', viewBib: '参考文献', viewPref: '字头含义',
    prefTitle: '字头与序列含义', prefUnit: '项', prefSearch: '搜索字头、含义或来源…',
    prefHint: '本表逐个解释索引字头的含义（例：1ПН＝夜视瞄准镜、2А＝火炮及火炮部件、Р＝无线电），并逐一标注来源。证据强度：权威／公开／待考，「待考」是整理者按同类编号的推断。',
    prefDeptSec: '序列（局号）含义', prefLettSec: '字头（字母类别）含义',
    prefConfA: '权威', prefConfB: '公开', prefConfC: '待考', prefNone: '（暂无公开来源可考）',
    thPrefDept: ['序列', '条目', '含义', '来源'], thPrefLett: ['字头', '大类', '条目', '含义', '来源'],
    theme: '夜间／日间', bg: '背景图', top: '回到顶部', more: '更多', moreFam: '更多字头', lessFam: '收起',
    hint: '点标签可折叠筛选行；点任意筛选按钮即可过滤，再点一次取消。搜索框支持下拉建议（↑↓ 选择，Enter 确认）；搜索索引号或代号时也会带出关联条目（该装备的构成部件、该部件装在哪些装备上）。',
    byLine: '整理：@防空妖精哥特兰 · @Deepseek · 三陆问题研究中心',
    disTitle: '免责声明', disMore: '展开完整免责声明', disLess: '收起',
    disShort: '本索引为个人整理的非官方公开资料汇编，仅供检索参考，不代表任何官方名录；编号、描述与译名可能存在错漏，请以原始来源为准。图片与文字来自公开渠道，版权归原作者，如涉侵权或不宜公开内容请联系删除。',
    disBody: '<b>1. 性质与用途</b>　本索引是基于公开渠道整理的个人资料汇编，仅供检索、参考与研究使用，不构成任何官方名录、技术文件、采购或作战依据。整理者与俄罗斯国防部、总火箭炮兵部（ГРАУ／ГАУ）及任何军工企业、政府机构均无隶属或合作关系。<br>'
      + '<b>2. 数据来源</b>　内容来自公开渠道：russiansila.ru、500maketov.ru、SALIS3 公开 PDF 目录，以及维基百科（俄／英／中及其他语种）与公开网页；条目中的编号、名称、年份、研制单位等均为照录或转述，未使用任何非公开资料。<br>'
      + '<b>3. 准确性与完整性</b>　索引号、序列归属、器材类型、研制单位等可能存在错漏、重复、推断或过时之处；中文说明多为机器辅助翻译并经人工润色，转写亦可能存在偏差。一切以俄方原始来源与官方文件为准。<br>'
      + '<b>4. 图片与版权</b>　缩略图与卡片文字取自公开网页及维基百科（多为 CC 授权），版权归原作者／权利人所有，此处仅用于条目识别与说明；如权利人认为使用不当，请联系删除。转载本表请保留来源标注与整理者署名。<br>'
      + '<b>5. 使用限制与合规</b>　本表不提供任何制造、改装、操作或规避法律的技术指导，仅描述公开的型号与参数；使用者应自行遵守所在国家／地区的法律法规（含出口管制及武器相关法规）。若认为某条目不宜公开传播，请告知，将及时删除。<br>'
      + '<b>6. 责任限制</b>　本表按「现状」提供，不附带任何明示或默示担保；因使用或依赖本表内容造成的任何直接或间接损失，整理者不承担责任。<br>'
      + '<b>7. 纠错与署名</b>　欢迎指出错误、补充资料，将在后续版本中更正。整理：@防空妖精哥特兰（数据合并、翻译、排版与配图）· @Deepseek · 三陆问题研究中心。',
    bibTitle: '参考文献目录', bibHint: '本目录由构建脚本从交付数据表自动生成，逐条对应本表实际引用的来源。',
    bibSearch: '在来源名称／链接／说明中搜索…', bibAll: '全部分类', bibOpen: '在新窗口打开', bibUnit: '条',
    srcTitle: '参考源（点击展开）',
    srcList: '<b>基础目录</b>：русская-сила.рф「Индексные обозначения ГРАУ」、500maketov.ru（ГРАУ／ГАУ 分组表与五个非 ГРАУ 设计局）、SALIS3 PDF（2011-06-11）<br>'
      + '<b>网络补充层</b>：С. Сарайкин 专文存档（2 194 篇）、维基百科《Словесные названия российского оружия》、《Руски индекси в ракетните и космически войски》(PDF)、GlobalSecurity.org《Soviet/Russian Gravity Bombs》、topwar.ru（核航弹）、С. Сарайкин《Ядерные авиабомбы СССР первого поколения》<br>'
      + '<b>卡片层</b>：俄文维基百科条目正文与图片（CC BY-SA，逐图注明许可与作者）、维基教科书命名词表（CC BY-SA）、rwd-mb3.de（东德 NVA《RWD》军事技术目录，文字与照片）、Bing 图片检索（网络配图，版权未标注）<br>'
      + '<b>其他总局目录</b>：bmz.ru「ГАБТУ 索引」、русская-сила.рф（ГБТУ 分组表）、俄文／乌克兰文维基百科「Индекс ГБТУ」、俄国防部《Средства инженерного вооружения. Каталог》第二版第一册（436 页）、guns.ru 索引汇编<br>'
      + '<b>整理</b>：@防空妖精哥特兰（数据合并、翻译、排版与配图）· @Deepseek · 三陆问题研究中心。完整来源清单见页面上方「参考文献」标签。',
    none: '没有符合筛选条件的条目。', allSeriesH: '全部序列', hits: '命中', unit: '条',
    missZh: '（该条无中文译文）', missRu: '原文描述为空', latOn: '拉丁', latOff: '西里尔',
    refsTitle: '详查索引', refsUnit: '项', refsSearch: '在缩写／专名／单位／类型中搜索…',
    refsHint: '点击任意一行即可跳回总表并按该条筛选。',
    secAbbr: '缩写对照（俄文 → 中文）', secNick: '专名与代号（俄文 → 中文）',
    secOrg: '研制／生产单位（中文 · 俄文 · 城市）', secType: '器材类型',
    thAbbr: ['缩写', '中文', '条目'], thNick: ['俄文专名', '中文', '拉丁转写', '条目'],
    thOrg: ['单位', '俄文', '城市', '条目'], thType: ['类型', '俄文', '代码', '条目'],
    sortBy: '排序', sortName: '按名称', sortCount: '按条目数',
    kindSeries: '序列', kindFam: '字头', kindType: '类型', kindOrg: '单位', kindAbbr: '缩写', kindIndex: '索引',
    bgUrl: '背景图地址', bgFile: '本地图片', bgDim: '压暗', bgBlur: '模糊', bgApply: '应用', bgClear: '清除',
    bootFail: '初始化失败：', clickHint: '点击行 → 回到总表筛选', famFilter: '过滤字头…',
    bgAuto: '自适应', bgFit: '适配', fitCover: '填满', fitContain: '完整', fitAuto: '原始', fitRepeat: '平铺',
    bgPos: '位置', bgFix: '固定', bgVig: '暗角', bgCard: '内容底板', bgTint: '色调',
    tintNeutral: '中性', tintCool: '冷', tintWarm: '暖', bgBright: '亮度', bgContrast: '对比度', bgSat: '饱和', bgGray: '灰度',
    presetRead: '可读优先', presetPhoto: '图片优先', presetNight: '夜间',
    recent: '最近', bgNoRead: '该图无法读取像素（跨域限制），自适应已跳过；请改用本地图片。',
    resetAll: '重置筛选', chips: '芯片视图', pickAll: '全部', dropSearch: '输入以筛选…', activeFilters: '当前筛选',
    chassisTag: '仅底盘／载具供应，非研制单位', chassisShort: '底盘',
    akaLbl: '代号', usedLbl: '所属装备', partsLbl: '构成部件',
    layout: '版面', contentW: '内容宽度', w520: '极窄 520', w680: '窄 680', w860: '中小 860', w1040: '中 1040',
    w1300: '标准 1300', w1600: '宽 1600', wFull: '全宽',
    align: '左右位置', alignLeft: '靠左', alignCenter: '居中', alignRight: '靠右',
    photos: '照片栏', addPhoto: '添加图片', rotate: '自动轮换', rotOff: '不轮换', rot30: '30 秒', rot60: '1 分钟', rot300: '5 分钟',
    photoEmpty: '还没有照片：用“本地图片”或上面的地址添加。', photoUse: '已用', preview: '预览', remove: '移除',
    contentA: '内容不透明度', contentHint: '不透明度越低底图越明显；文字发虚时配合“压暗”。',
    litAll: '来源：全部', litOnly: '来源：仅补充', litCore: '来源：仅三源',
    litAdd: '网络补充编号', litEnrich: '补充说明', litFix: '已按出处订正',
    litSrc: '来源', litQuote: '原文', litLink: '链接',
    wikiAll: '维基：全部', wikiHas: '维基：有条目', wikiNone: '维基：无条目', wikiBadge: '维基百科条目',
    wikiOpen: '打开维基条目', wikiCredit: '文字与图片来自维基百科', wikiNoImg: '该条目没有配图', wikiClose: '关闭',
    wikiVerified: '匹配依据：条目正文出现该编号', wikiByName: '匹配依据：按条目名称对应（正文未出现该编号）', wikiGloss: '匹配依据：维基教科书词表（词条行）', wikiCreditWB: '词条文字来自维基教科书（CC BY-SA）', wikiImgFrom: '配图取自', wikiPic: '配图',
    wikiRwd: '来源：RWD 军事技术目录（东德 NVA）', wikiCreditRwd: '文字与图片来自 rwd-mb3.de', wikiWeb: '来源：网络图片检索（无条目文字）', wikiCreditWeb: '图片来自网络检索，版权未标注', wikiDeOrig: '德语原文', wikiZhTrans: '中文译文',
    othOpen: '其他总局目录', othTitle: '其他总局目录',
    othGbtu: '装甲兵总局 ГБТУ', othGiu: '工兵 工程器材（СИВ）', othAmmo: 'ГАУ 56/57 老索引', othMo: 'МО.NN.NN 索引',
    othSearch: '按编号／名称／说明筛选…', othEngOnly: '仅工程弹药', othEmpty: '没有匹配的条目', othUnit: '条',
    othAdopted: '列装：', othDev: '研制：', othJump: '在主表里查找这个索引',
    othFoot: '来源：bmz.ru「ГАБТУ 索引」、русская-сила.рф、乌克兰／德语维基百科、俄国防部《工程器材目录》第二版第一册（436 页）、guns.ru 索引汇编。工兵器材按 КД 代号与 КВТ／ОКП／ЕКПС 分类码编目，56/57 为旧 ГАУ 部门号（57 含工程弹药）。中文界面显示中文译文，俄文界面保留原文。',
  },
  ru: {
    docTitle: 'Индексные обозначения ГРАУ / ГАУ · составитель @防空妖精哥特兰', title: 'Индексные обозначения ГРАУ / ГАУ', total: 'всего %N%',
    series: 'Серия', letters: 'Буквы', fam: 'Семейство', type: 'Тип техники', org: 'Разработчик / завод',
    allSeries: 'все серии', allFam: 'все семейства', allType: 'все типы', allOrg: 'все организации',
    search: 'Поиск: индекс, название или описание (латиница, кириллица, иероглифы)',
    viewIndex: 'Указатель', viewRefs: 'Справочник', viewBib: 'Библиография', viewPref: 'Значения префиксов',
    prefTitle: 'Значения префиксов и серий', prefUnit: 'поз.', prefSearch: 'Поиск по префиксу, значению или источнику…',
    prefHint: 'Таблица объясняет значение каждого префикса индекса (например: 1ПН — ночные прицелы, 2А — артиллерийские орудия и их части, Р — радиотехника) и указывает источник. Надёжность: офиц. / открытый / предположение.',
    prefDeptSec: 'Значения серий (номеров отделов)', prefLettSec: 'Значения префиксов (буквенные категории)',
    prefConfA: 'офиц.', prefConfB: 'открытый', prefConfC: 'предположение', prefNone: '(в открытых источниках не найдено)',
    thPrefDept: ['Серия', 'Записей', 'Значение', 'Источник'], thPrefLett: ['Префикс', 'Раздел', 'Записей', 'Значение', 'Источник'],
    theme: 'Тёмная / светлая', bg: 'Фоновая картинка', top: 'Наверх', more: 'Ещё', moreFam: 'ещё семейства', lessFam: 'свернуть',
    hint: 'Метки сворачивают строки фильтров; кнопка фильтрует, повторный клик снимает выбор. В поиске есть подсказки (↑↓ и Enter); поиск по индексу или обозначению выводит и связанные записи (комплектующие изделия и техника, на которой изделие установлено).',
    byLine: 'составители: @防空妖精哥特兰 · @Deepseek · 三陆问题研究中心',
    disTitle: 'Отказ от ответственности', disMore: 'показать полный текст', disLess: 'свернуть',
    disShort: 'Неофициальный любительский свод открытых данных, только для справки; индексы, описания и переводы могут содержать ошибки — сверяйтесь с первоисточниками. Тексты и изображения взяты из открытых источников, права принадлежат их авторам.',
    disBody: '<b>1. Назначение</b>　Это неофициальный свод открытых данных, составленный частным лицом для поиска и справки. Он не является официальным перечнем, технической документацией или основанием для закупок. Составители не связаны с Министерством обороны РФ, ГРАУ/ГАУ, оборонными предприятиями или государственными органами.<br>'
      + '<b>2. Источники</b>　Использованы только открытые источники: russiansila.ru, 500maketov.ru, открытый PDF-каталог SALIS3, Википедия (рус., англ., кит. и др.) и открытые веб-страницы. Индексы, названия, годы и предприятия приведены по этим источникам; закрытые материалы не использовались.<br>'
      + '<b>3. Точность</b>　Индексы, принадлежность к сериям, типы техники и предприятия могут содержать ошибки, повторы, предположения и устаревшие данные; китайские описания в основном машинно переведены и отредактированы вручную. Приоритет всегда за первоисточником и официальными документами.<br>'
      + '<b>4. Изображения и права</b>　Иллюстрации и тексты карточек взяты из открытых источников и Википедии (в основном лицензия CC); права принадлежат авторам и правообладателям, изображения использованы только для опознания образца. При претензиях правообладателя материал будет удалён. При перепечатке сохраняйте ссылки на источники и имена составителей.<br>'
      + '<b>5. Ограничения и соответствие закону</b>　Свод не содержит инструкций по изготовлению, переделке или применению оружия и не помогает обходить закон; описаны только открытые образцы и характеристики. Пользователь сам отвечает за соблюдение законодательства своей страны (в том числе экспортного контроля). Если какая-то запись не подлежит публикации — сообщите, она будет удалена.<br>'
      + '<b>6. Ответственность</b>　Материал предоставляется «как есть», без каких-либо гарантий; составители не несут ответственности за прямые или косвенные последствия его использования.<br>'
      + '<b>7. Исправления и авторство</b>　Замечания и дополнения приветствуются и будут учтены в следующих версиях. Составители: @防空妖精哥特兰 (сведение данных, перевод, вёрстка, подбор иллюстраций) · @Deepseek · 三陆问题研究中心.',
    bibTitle: 'Библиография', bibHint: 'Каталог построен скриптом сборки из таблицы данных: каждая запись соответствует реально использованному источнику.',
    bibSearch: 'Поиск по названию, ссылке или примечанию…', bibAll: 'все категории', bibOpen: 'открыть в новом окне', bibUnit: 'зап.',
    srcTitle: 'Источники (нажмите, чтобы раскрыть)',
    srcList: '<b>Основные каталоги</b>: русская-сила.рф «Индексные обозначения ГРАУ», 500maketov.ru (таблицы ГРАУ/ГАУ и пять не-ГРАУ КБ), SALIS3 PDF (2011-06-11)<br>'
      + '<b>Сетевой слой</b>: архив статей С. Сарайкина (2 194 шт.), википедия «Словесные названия российского оружия», «Руски индекси в ракетните и космически войски» (PDF), GlobalSecurity.org «Soviet/Russian Gravity Bombs», topwar.ru (ядерные авиабомбы), С. Сарайкин «Ядерные авиабомбы СССР первого поколения»<br>'
      + '<b>Слой карточек</b>: тексты и изображения русской Википедии (CC BY-SA, лицензия и автор указаны для каждой картинки), глоссарий Викиучебника (CC BY-SA), rwd-mb3.de (каталог RWD, ННА ГДР — текст и фото), поиск картинок Bing (права не указаны)<br>'
      + '<b>Каталоги других управлений</b>: bmz.ru «ГАБТУ», русская-сила.рф (ГБТУ), Википедия «Индекс ГБТУ» (рус./укр.), «Средства инженерного вооружения. Каталог», изд. 2, кн. 1 (436 с., МО РФ), сводка индексов guns.ru<br>'
      + '<b>Составители</b>: @防空妖精哥特兰 (сведение данных, перевод, вёрстка и подбор иллюстраций) · @Deepseek · 三陆问题研究中心. Полный список источников — в разделе «Библиография».',
    none: 'Ничего не найдено по заданным фильтрам.', allSeriesH: 'все серии', hits: 'найдено', unit: 'поз.',
    missZh: '(перевода нет)', missRu: 'описание отсутствует', latOn: 'латиница', latOff: 'кириллица',
    refsTitle: 'Справочный указатель', refsUnit: 'поз.', refsSearch: 'поиск по сокращениям, названиям, организациям и типам…',
    refsHint: 'Клик по строке возвращает в указатель с этим фильтром.',
    secAbbr: 'Сокращения (рус. → кит.)', secNick: 'Названия и кодовые имена (рус. → кит.)',
    secOrg: 'Разработчики и заводы (кит. · рус. · город)', secType: 'Типы техники',
    thAbbr: ['Сокращение', 'Китайский', 'Записей'], thNick: ['Название', 'Китайский', 'Латиница', 'Записей'],
    thOrg: ['Организация', 'Русский', 'Город', 'Записей'], thType: ['Тип', 'Русский', 'Код', 'Записей'],
    sortBy: 'сортировка', sortName: 'по названию', sortCount: 'по числу записей',
    kindSeries: 'серия', kindFam: 'семейство', kindType: 'тип', kindOrg: 'организация', kindAbbr: 'сокращение', kindIndex: 'индекс',
    bgUrl: 'Адрес картинки', bgFile: 'Файл', bgDim: 'Затемнение', bgBlur: 'Размытие', bgApply: 'Применить', bgClear: 'Убрать',
    bootFail: 'Ошибка инициализации: ', clickHint: 'клик по строке → фильтр', famFilter: 'фильтр…',
    bgAuto: 'Авто', bgFit: 'Вписать', fitCover: 'заполнить', fitContain: 'целиком', fitAuto: 'как есть', fitRepeat: 'плиткой',
    bgPos: 'Позиция', bgFix: 'Фиксировать', bgVig: 'Виньетка', bgCard: 'Подложка', bgTint: 'Тон',
    tintNeutral: 'нейтральный', tintCool: 'холодный', tintWarm: 'тёплый', bgBright: 'Яркость', bgContrast: 'Контраст', bgSat: 'Насыщ.', bgGray: 'Ч/б',
    presetRead: 'Читаемость', presetPhoto: 'Картинка', presetNight: 'Ночь',
    recent: 'Недавние', bgNoRead: 'Пиксели картинки недоступны (ограничение источника) — авто пропущено; используйте локальный файл.',
    resetAll: 'Сбросить фильтры', chips: 'Плитки', pickAll: 'все', dropSearch: 'начните вводить…', activeFilters: 'фильтры',
    chassisTag: 'только шасси/носитель, не разработчик', chassisShort: 'шасси',
    akaLbl: 'обозначение', usedLbl: 'установлен на', partsLbl: 'комплектующие',
    layout: 'Раскладка', contentW: 'Ширина контента', w520: 'мин. 520', w680: 'узкая 680', w860: 'малая 860',
    w1040: 'средняя 1040', w1300: 'обычная 1300', w1600: 'широкая 1600', wFull: 'во всю ширину',
    align: 'Положение', alignLeft: 'влево', alignCenter: 'по центру', alignRight: 'вправо',
    photos: 'Фотополоса', addPhoto: 'Добавить', rotate: 'Смена фото', rotOff: 'выкл', rot30: '30 с', rot60: '1 мин', rot300: '5 мин',
    photoEmpty: 'пока пусто: добавьте файл или адрес.', photoUse: 'занято', preview: 'просмотр', remove: 'удалить',
    contentA: 'Непрозрачность панелей', contentHint: 'чем ниже, тем виднее картинка; если текст теряется — добавьте затемнение.',
    litAll: 'Источник: все', litOnly: 'Источник: только дополнения', litCore: 'Источник: только три сайта',
    litAdd: 'добавленный индекс', litEnrich: 'дополнение к описанию', litFix: 'исправлено по источнику',
    litSrc: 'Источник', litQuote: 'Цитата', litLink: 'Ссылка',
    wikiAll: 'Вики: все', wikiHas: 'Вики: только со статьёй', wikiNone: 'Вики: без статьи', wikiBadge: 'Статья в Википедии',
    wikiOpen: 'Открыть статью', wikiCredit: 'Текст и изображение — Википедия', wikiNoImg: 'в статье нет картинки', wikiClose: 'закрыть',
    wikiVerified: 'связь: индекс встречается в статье', wikiByName: 'связь: по названию (индекса в статье нет)', wikiGloss: 'связь: глоссарий Викиучебника', wikiCreditWB: 'текст — Викиучебник (CC BY-SA)', wikiImgFrom: 'картинка из', wikiPic: 'фото',
    wikiRwd: 'источник: каталог RWD (ННА ГДР)', wikiCreditRwd: 'текст и фото — rwd-mb3.de', wikiWeb: 'источник: картинка из поиска (текста нет)', wikiCreditWeb: 'картинка из поиска, права не указаны', wikiDeOrig: 'немецкий оригинал', wikiZhTrans: 'китайский перевод',
    othOpen: 'каталоги других управлений', othTitle: 'каталоги других управлений',
    othGbtu: 'ГБТУ (бронетанковое)', othGiu: 'инженерные войска (СИВ)', othAmmo: 'старые индексы ГАУ 56/57', othMo: 'индексы МО.NN.NN',
    othSearch: 'фильтр по номеру, названию, описанию…', othEngOnly: 'только инженерные', othEmpty: 'ничего не найдено', othUnit: 'записей',
    othAdopted: 'принят на вооружение: ', othDev: 'разработчик: ', othJump: 'найти этот индекс в основной таблице',
    othFoot: 'Источники: bmz.ru «Обозначение техники (Индекс) ГАБТУ», русская-сила.рф, uk/de Википедия, «Средства инженерного вооружения. Каталог, изд. 2, кн. 1» (436 с.), подборка индексов на guns.ru. Инженерная техника каталогизирована по обозначениям КД и кодам КВТ/ОКП/ЕКПС; 56/57 — отделы старой системы ГАУ (в 57 входят инженерные боеприпасы). В китайском интерфейсе показан китайский перевод, в русском — оригинал.',
  },
};

const TYPE_META = types.map((t) => [t.id, t.zh, TYPE_RU[t.id] || t.zh]);
const ORG_META = orgs.map((o) => [o.id, o.zh, o.ru, o.city]);
const REF_PAYLOAD = {
  abbr: REFS.abbr.filter((a) => a.zh),
  nicks: REFS.nicks,
  orgs: REFS.orgs.slice().sort((a, b) => b.n - a.n || String(a.zh || '').localeCompare(String(b.zh || ''))),
  types: REFS.types.map((t) => ({ t: t.t, zh: t.zh, ru: TYPE_RU[t.t] || t.zh, n: t.n })),
};

// complete bibliography: generated by _raw/build_biblio.cjs from the built CSV (wiki*/src* columns)
const BIBLIO_JSON = (function () {
  try { return fs.readFileSync((process.env.BIBLIO || 'D:/DsHs/grau/_raw/biblio/references.json'), 'utf8'); }
  catch (e) { console.log('bibliography payload missing:', e.message); return '[]'; }
})();

function chip(list, kind) {
  return list.map((x) => `<button type="button" class="fk" data-f="${kind}" data-v="${esc(x.id)}" data-zh="${esc(x.zh)}" data-ru="${esc(x.ru)}">${esc(x.zh)}<em>${x.n}</em></button>`).join('');
}
// v1.4.6: 序列（大类）也按「索引体系组」分层显示——字头 chips 的分层在 v1_client.js 的 populateFams()
const serChips = (function () {
  let out = '', last = '';
  for (const s of numSeries) {
    const g = s.grp || '';
    if (g !== last) {
      last = g;
      out += `<span class="grptag" data-zh="${esc(s.grpZh || g)}" data-ru="${esc(s.grpRu || g)}">${esc(s.grpZh || g)}</span>`;
    }
    out += chip([{ id: s.key, zh: s.shortZh || String(s.n), ru: s.shortRu || ('Гр.' + s.n), n: DATA.entries.filter((e) => e[8] === seriesIndex.get(s.key)).length }], 'series');
  }
  return out;
})();
const letChips = chip(letterSeries.map((s) => ({ id: s.key, zh: s.letter, ru: s.letter, n: DATA.entries.filter((e) => e[8] === seriesIndex.get(s.key)).length })), 'series');
const typChips = chip(types.map((t) => ({ id: t.id, zh: t.zh, ru: TYPE_RU[t.id] || t.zh, n: t.n })), 'type');
const orgChips = chip(orgs.map((o) => ({ id: o.id, zh: o.zh, ru: o.ru, n: o.n })), 'org');

function page() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${STR.zh.docTitle}</title>
<style>
  :root { --bg:#0f1216; --pn-rgb:21,26,33; --pn2-rgb:19,24,32; --panel-a:.92; --wrap-max:1300px;
    --bd:#242c37; --tx:#dde5ee; --dim:#8b98a8;
    --ac:#59d0ff; --hl:#ffcf6b; --hdbg:rgba(15,18,22,.95); --shadow:0 12px 30px rgba(0,0,0,.5); --bgimg:none; }
  /* declared on <body>, not :root, so a change of --panel-a re-resolves them */
  body { --pn:rgba(var(--pn-rgb),var(--panel-a)); --pn2:rgba(var(--pn2-rgb),var(--panel-a)); }
  body.light { --bg:#eef2f7; --pn-rgb:255,255,255; --pn2-rgb:247,249,252;
    --bd:#d5dde6; --tx:#1b2430; --dim:#67748a;
    --ac:#0f6f9c; --hl:#a86000; --hdbg:rgba(255,255,255,.96); --shadow:0 12px 30px rgba(0,0,0,.14); }
  * { box-sizing:border-box; }
  body { margin:0; background-color:var(--bg); color:var(--tx);
    font:15px/1.6 "Microsoft YaHei","PingFang SC","Noto Sans SC","Segoe UI",Roboto,system-ui,sans-serif; }
  body.bgimg::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none;
    background-image:var(--bgimg); background-size:var(--bgsize,cover);
    background-position:var(--bgpos,center center); background-repeat:var(--bgrep,no-repeat);
    background-attachment:var(--bgatt,fixed);
    filter:brightness(var(--bgbright,1)) contrast(var(--bgcontrast,1)) saturate(var(--bgsat,1)) grayscale(var(--bggray,0)); }
  /* readability overlay: flat veil, or a radial veil (vignette) that darkens the edges more */
  body.bgimg::after { content:''; position:fixed; inset:0; z-index:1; pointer-events:none;
    background:rgba(var(--bgdim-c,8,11,15), var(--bgdim-a,.62));
    backdrop-filter:blur(var(--bgblur,2px)); }
  body.bgimg.vig::after { background:radial-gradient(125% 95% at 50% 45%,
    rgba(var(--bgdim-c,8,11,15), var(--bgdim-a,.62)) 30%,
    rgba(var(--bgdim-c,8,11,15), calc(var(--bgdim-a,.62) + .3)) 100%); }
  body.bgimg.light::after { background:rgba(255,255,255, var(--bgdim-la,.5)); }
  body.bgimg.light.vig::after { background:radial-gradient(125% 95% at 50% 45%,
    rgba(255,255,255, var(--bgdim-la,.5)) 30%, rgba(255,255,255, calc(var(--bgdim-la,.5) + .3)) 100%); }
  body.bgimg main, body.bgimg footer { position:relative; z-index:2; }
  /* horizontal placement of the content column, so the picture can stay visible on one side */
  body.al-left main, body.al-left footer { margin-left:0; margin-right:auto; }
  body.al-right main, body.al-right footer { margin-left:auto; margin-right:0; }
  /* optional content backing: one translucent card behind the whole list */
  body.bgimg.bgcard main { background:var(--hdbg); backdrop-filter:blur(10px); border-radius:12px;
    border:1px solid var(--bd); padding:12px 14px; }
  header { position:sticky; top:0; z-index:6; background:var(--hdbg); backdrop-filter:blur(8px); border-bottom:1px solid var(--bd); }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:7px 14px; position:relative; }
  .row + .row { border-top:1px solid var(--bd); }
  h1 { margin:0; font-size:15px; font-weight:600; white-space:nowrap; }
  .tot { color:var(--dim); font-size:12.5px; white-space:nowrap; }
  input[type=search], input[type=text] { background:var(--pn); border:1px solid var(--bd); color:var(--tx);
    border-radius:8px; padding:6px 11px; font-size:13.5px; font-family:inherit; }
  input[type=search] { flex:1 1 260px; min-width:180px; }
  input[type=search]:focus, input[type=text]:focus { outline:none; border-color:var(--ac); }
  #hits { color:var(--dim); font-size:12.5px; white-space:nowrap; }
  .btn { background:var(--pn); color:var(--tx); border:1px solid var(--bd); border-radius:8px; padding:5px 11px;
    font-size:12.5px; cursor:pointer; font-family:inherit; text-decoration:none; white-space:nowrap; }
  .btn:hover { border-color:var(--ac); }
  .btn.on { background:var(--ac); border-color:var(--ac); color:#04121a; }
  .ico { width:32px; height:30px; border-radius:8px; background:var(--pn); color:var(--tx);
    border:1px solid var(--bd); cursor:pointer; font-size:14px; line-height:1; }
  .ico:hover { border-color:var(--ac); }
  .switch { display:flex; border:1px solid var(--bd); border-radius:999px; overflow:hidden; background:var(--pn); }
  .switch button { background:transparent; color:var(--dim); border:0; padding:5px 10px; font-size:12px; cursor:pointer; font-family:inherit; }
  .switch button.on { background:var(--ac); color:#04121a; }
  .frow { display:flex; gap:6px; align-items:center; padding:6px 14px; border-top:1px solid var(--bd); flex-wrap:wrap; }
  /* compact filter bar: one row of comboboxes instead of several rows of chips */
  .fbar { display:flex; gap:7px; align-items:center; flex-wrap:wrap; padding:7px 14px; border-top:1px solid var(--bd); position:relative; }
  .cbbtn { background:var(--pn); color:var(--tx); border:1px solid var(--bd); border-radius:8px; padding:4px 10px;
    font-size:12.5px; cursor:pointer; font-family:inherit; white-space:nowrap; }
  .cbbtn:hover { border-color:var(--ac); }
  .cbbtn.on { border-color:var(--ac); color:var(--ac); }
  .cbbtn b { color:var(--ac); font-weight:600; }
  .cbbtn i { color:var(--dim); font-style:normal; font-size:11px; margin-left:5px; }
  .cbdrop { position:absolute; top:100%; left:14px; min-width:min(440px,92vw); max-width:560px; max-height:56vh;
    overflow:auto; z-index:70; background:var(--pn); border:1px solid var(--ac); border-radius:12px;
    box-shadow:0 18px 44px rgba(0,0,0,.45); display:none; overscroll-behavior:contain; }
  body.light .cbdrop { box-shadow:0 18px 44px rgba(20,32,48,.22); }
  .cbdrop.on { display:block; }
  .cbdrop input { width:100%; border:0; border-bottom:1px solid var(--bd); border-radius:0; background:transparent;
    padding:8px 11px; font-size:13px; color:var(--tx); font-family:inherit; }
  .cbdrop input:focus { outline:none; }
  .cbdrop .o { display:flex; gap:10px; align-items:baseline; padding:5px 11px; cursor:pointer; font-size:13px; }
  .cbdrop .o:hover, .cbdrop .o.act { background:var(--pn2); }
  .cbdrop .o.act { box-shadow:inset 3px 0 0 var(--ac); }
  .cbdrop .o.sel { color:var(--ac); font-weight:600; }
  .cbdrop .o em { margin-left:auto; color:var(--dim); font-style:normal; font-size:11.5px; }
  .cbdrop .grp { color:var(--dim); font-size:11px; padding:6px 11px 2px; }
  body:not(.chips) .frow { display:none; }
  .fbar .spacer { margin-left:auto; }
  .frow.collapsed .fset { display:none; }
  .frow.collapsed { padding-top:5px; padding-bottom:5px; }
  .flabel { color:var(--dim); font-size:11.5px; width:52px; flex:0 0 52px; }
  .flabel.ftoggle { cursor:pointer; width:auto; flex:0 0 auto; padding-right:6px; user-select:none; -webkit-user-select:none; }
  .flabel.ftoggle:hover { color:var(--ac); }
  .flabel.ftoggle .car { color:var(--ac); font-size:11px; }
  .flabel .fval { color:var(--ac); font-size:11px; margin-left:5px; }
  .fset { display:flex; gap:5px; flex-wrap:wrap; max-height:76px; overflow:auto; padding:1px 0; flex:1 1 auto; scrollbar-width:thin; }
  .fk { background:var(--pn); color:var(--tx); border:1px solid var(--bd); border-radius:999px; padding:2px 10px;
    font-size:12px; cursor:pointer; font-family:inherit; white-space:nowrap; }
  .fk em { color:var(--dim); font-style:normal; font-size:10.5px; margin-left:5px; }
  .fk:hover { border-color:var(--ac); }
  .fk.on { background:var(--ac); border-color:var(--ac); color:#04121a; }
  .fk.on em { color:rgba(0,0,0,.55); }
  .fk.morefam { border-style:dashed; color:var(--ac); }
  /* v1.4.6: 第一级「索引体系组」标签；第二级大类 chip 加粗，第三级字头小 chip */
  .grptag { color:var(--ac); font-size:11px; font-weight:600; padding:2px 7px; border-radius:6px;
    border:1px dashed var(--bd); background:rgba(var(--pn-rgb),.55); white-space:nowrap; }
  .fk.grp { font-weight:600; }
  .fk.sub { font-size:11.5px; padding:1px 8px; }
  .fk.sub .pfs { font-style:normal; font-size:10.5px; color:var(--dim); margin-left:5px; }
  .frow input[type=text] { width:180px; padding:4px 9px; font-size:12.5px; }
  main { padding:12px 14px 70px; max-width:var(--wrap-max); margin:0 auto; }
  .shead { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin:0 0 10px;
    padding:9px 12px; border:1px solid var(--bd); border-radius:10px;
    background:rgba(var(--pn-rgb), calc(var(--panel-a) + .05)); backdrop-filter:blur(8px); }
  .shead h2 { font-size:16px; margin:0; }
  .shead .ru { color:var(--dim); font-size:12.5px; }
  .shead .cnt { color:var(--dim); font-size:11.5px; border:1px solid var(--bd); border-radius:999px; padding:1px 8px; }
  .shead .rng { color:var(--dim); font-size:11.5px; }
  .shead input[type=search] { flex:0 1 280px; min-width:150px; font-size:13px; }
  .shead .sub { color:var(--dim); font-size:12px; }
  .bhead { display:flex; gap:9px; align-items:baseline; flex-wrap:wrap; padding:7px 9px; border-radius:7px;
    background:var(--pn); border:1px solid var(--bd); cursor:pointer; user-select:none; -webkit-user-select:none; }
  .bhead:hover { background:var(--pn2); }
  .fam-block.open .bhead { background:var(--pn2); }
  .bhead .caret { flex:0 0 12px; color:var(--ac); font-size:11px; line-height:1.7; }
  .bhead .pfx { font-weight:600; font-size:13px; background:var(--pn2); border:1px solid var(--bd); border-radius:6px; padding:0 7px; cursor:pointer; }
  .bhead .pfx:hover { border-color:var(--ac); color:var(--ac); }
  .bhead em { color:var(--dim); font-style:normal; font-size:11.5px; }
  .bhead .rng { color:var(--dim); font-size:11.5px; }
  ul.list { list-style:none; margin:0; padding:0; border:1px solid var(--bd); border-radius:9px; overflow:hidden; }
  li.e { display:grid; grid-template-columns:var(--row-cols, minmax(92px,132px) minmax(86px,140px) 1fr); gap:9px; align-items:start;
    padding:5px 11px; border-bottom:1px solid var(--bd); background:var(--pn); }
  li.e:last-child { border-bottom:0; }
  li.e:nth-child(even) { background:var(--pn2); }
  li.e.nont { grid-template-columns:minmax(92px,132px) 1fr; }
  li.e.nont .nt { display:none; }
  li.e.lat { display:none; }
  body.showlat li.e { display:none; }
  body.showlat li.e.lat { display:grid; }
  .id { font-weight:600; color:var(--tx); word-break:break-word; }
  li.e.lat .id { color:var(--ac); }
  .nt { color:var(--hl); font-size:12.5px; }
  mark { background:rgba(255,207,107,.30); color:inherit; border-radius:2px; padding:0 1px; }
  .d { color:var(--tx); opacity:.9; font-size:13.5px; }
  .tag { display:inline-block; font-size:10.5px; border:1px solid var(--bd); border-radius:4px; padding:0 5px;
    margin-right:6px; vertical-align:1px; cursor:pointer; color:var(--dim); }
  .tag:hover { border-color:var(--ac); color:var(--ac); }
  .tag.org { color:#8fd0a8; border-color:#26402f; }
  .tag.org.chassis { color:var(--dim); border-style:dashed; }
  body.light .tag.org { color:#1f7a4d; border-color:#b8e0c8; }
  .miss { color:var(--dim); }
  /* component layer: alternative designations / the equipment a part fits / the parts of a row */
  .rel-line { display:block; margin-top:3px; font-size:12px; line-height:1.5; color:var(--dim); }
  .rel-line i { font-style:normal; color:#8fb4e0; margin-right:4px; }
  .rel { color:#9dc0ff; border-bottom:1px dashed rgba(157,192,255,.45); cursor:pointer; }
  .rel:hover { color:#cfe4ff; border-bottom-color:rgba(207,228,255,.8); }
  body.light .rel-line i { color:#3a6ea8; }
  body.light .rel { color:#1d4ea8; border-bottom-color:rgba(29,78,168,.4); }
  /* supplementary-layer badge: 补 = added number, + = extra wording, 改 = corrected wording */
  .litb { display:inline-block; margin-left:5px; padding:0 4px; border-radius:4px; font-size:10px; line-height:15px;
    vertical-align:1px; cursor:help; border:1px solid rgba(255,214,102,.55); background:rgba(255,214,102,.14); color:#ffd666; }
  .litb.k1 { border-color:rgba(120,220,160,.5); background:rgba(120,220,160,.14); color:#7fe0a8; }
  .litb.k2 { border-color:rgba(255,150,150,.5); background:rgba(255,150,150,.14); color:#ff9b9b; }
  body.light .litb { border-color:rgba(170,115,0,.5); background:rgba(255,196,0,.18); color:#7a5200; }
  body.light .litb.k1 { border-color:rgba(20,120,70,.4); background:rgba(60,190,120,.16); color:#12603a; }
  body.light .litb.k2 { border-color:rgba(180,40,40,.4); background:rgba(255,80,80,.14); color:#8f1f1f; }
  /* wikipedia link badge (W) and the article card */
  .wb { display:inline-block; margin-left:5px; padding:0 5px; border-radius:4px; font-size:10px; line-height:15px;
    vertical-align:1px; cursor:pointer; font-family:inherit; border:1px solid rgba(150,190,255,.5);
    background:rgba(120,170,255,.14); color:#9dc0ff; }
  .wb:hover { background:rgba(120,170,255,.3); }
  .wb.p { border-color:rgba(200,180,120,.5); background:rgba(210,180,90,.13); color:#d6c07a; }
  .wb.p:hover { background:rgba(210,180,90,.3); }
  .wb.g { border-color:rgba(160,200,160,.5); background:rgba(120,190,140,.13); color:#9ad3ab; }
  .wb.g:hover { background:rgba(120,190,140,.3); }
  .wb.r { border-color:rgba(220,150,110,.5); background:rgba(220,140,90,.13); color:#e0a97e; }
  .wb.r:hover { background:rgba(220,140,90,.3); }
  .wb.w { border-color:rgba(170,150,230,.5); background:rgba(150,130,230,.13); color:#b7a8f0; }
  .wb.w:hover { background:rgba(150,130,230,.3); }
  body.light .wb { border-color:rgba(20,70,160,.35); background:rgba(60,120,230,.12); color:#1d4ea8; }
  body.light .wb.p { border-color:rgba(140,110,20,.35); background:rgba(190,150,30,.14); color:#7a5c05; }
  body.light .wb.g { border-color:rgba(30,110,60,.35); background:rgba(40,140,80,.13); color:#14663a; }
  body.light .wb.r { border-color:rgba(150,70,20,.35); background:rgba(190,100,40,.14); color:#8a3d0b; }
  body.light .wb.w { border-color:rgba(80,60,170,.35); background:rgba(110,90,200,.14); color:#3d2a94; }
  #wcard[hidden] { display:none; }
  #wcard { position:fixed; inset:0; z-index:96; background:rgba(0,0,0,.72); display:flex; align-items:center;
    justify-content:center; padding:20px; }
  #wcard .wc-in { position:relative; width:min(760px,94vw); max-height:88vh; overflow:auto; border-radius:14px;
    padding:18px 20px 16px; background:var(--card,#141a22); color:var(--fg,#e6edf4); border:1px solid var(--line,#2a3543);
    box-shadow:0 26px 70px rgba(0,0,0,.6); }
  #wcard .wc-x { position:absolute; top:10px; right:12px; border:0; background:transparent; color:var(--dim,#8fa0b3);
    font-size:15px; cursor:pointer; }
  #wcard .wc-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; padding-right:26px; }
  #wcard .wc-id { font-weight:700; font-size:17px; letter-spacing:.3px; }
  #wcard .wc-link { color:#9dc0ff; font-size:14px; text-decoration:none; border-bottom:1px dashed rgba(157,192,255,.5); }
  body.light #wcard .wc-link { color:#1d4ea8; }
  #wcard .wc-body { margin-top:12px; }
  #wcard .wc-langs { margin-top:7px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  #wcard .wc-langs button { border:1px solid rgba(150,190,255,.35); background:transparent; color:var(--dim,#8fa0b3);
    font:inherit; font-size:11.5px; line-height:19px; padding:0 8px; border-radius:5px; cursor:pointer; }
  #wcard .wc-langs button:hover { background:rgba(120,170,255,.14); color:#cddffb; }
  #wcard .wc-langs button.on { border-color:rgba(150,190,255,.75); background:rgba(120,170,255,.2); color:#dceaff; }
  #wcard .wc-langs span { font-size:11.5px; color:var(--dim,#8fa0b3); margin-right:2px; }
  body.light #wcard .wc-langs button.on { background:rgba(60,120,230,.16); color:#123a80; }
  #wcard .wc-img { float:right; width:210px; max-height:170px; object-fit:contain; margin:2px 0 10px 16px; border-radius:9px;
    background:rgba(255,255,255,.05); }
  #wcard .wc-text { margin:0; font-size:13.5px; line-height:1.66; white-space:pre-line; }
  #wcard .wc-foot { clear:both; margin-top:12px; padding-top:9px; border-top:1px solid var(--line,#2a3543);
    font-size:11.5px; color:var(--dim,#8fa0b3); }
  /* other directorate catalogues (ГБТУ / инженерные войска) */
  #othcard[hidden] { display:none; }
  #othcard { position:fixed; inset:0; z-index:97; background:rgba(0,0,0,.74); display:flex; align-items:center;
    justify-content:center; padding:3vh 1vw; }
  #othcard .oc-in { position:relative; width:min(1080px,97vw); max-height:94vh; display:flex; flex-direction:column;
    background:var(--pn); border:1px solid var(--ac); border-radius:14px; box-shadow:0 28px 80px rgba(0,0,0,.6); }
  #othcard .oc-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:14px 42px 10px 16px;
    border-bottom:1px solid var(--bd); }
  #othcard .oc-t { font-size:14.5px; color:var(--tx); }
  #othcard .oc-tabs { display:flex; gap:6px; flex-wrap:wrap; }
  #othcard .oc-tab { border:1px solid var(--bd); background:transparent; color:var(--dim,#8fa0b3); font-size:12.5px;
    padding:4px 10px; border-radius:999px; cursor:pointer; font-family:inherit; }
  #othcard .oc-tab:hover { background:var(--pn2); color:var(--tx); }
  #othcard .oc-tab.on { border-color:var(--ac); background:rgba(120,170,255,.16); color:var(--tx); }
  #othcard #othq { flex:1 1 220px; min-width:160px; background:var(--pn2); border:1px solid var(--bd); color:var(--tx);
    border-radius:8px; padding:6px 10px; font-size:12.5px; font-family:inherit; }
  #othcard .oc-eng { border:1px solid var(--bd); background:transparent; color:var(--dim,#8fa0b3); font-size:12px;
    padding:4px 9px; border-radius:8px; cursor:pointer; font-family:inherit; }
  #othcard .oc-eng.on { border-color:var(--ac); color:var(--tx); background:rgba(120,170,255,.14); }
  #othcard .oc-cnt { font-size:11.5px; color:var(--dim,#8fa0b3); margin-left:auto; }
  #othcard .oc-body { margin:0; padding:8px 12px 4px; list-style:none; overflow:auto; flex:1 1 auto; }
  #othcard li.oi { padding:7px 6px; border-bottom:1px solid var(--bd); font-size:12.5px; line-height:1.6; }
  #othcard li.oi:last-child { border-bottom:0; }
  #othcard li.oi .ok { color:var(--ac); font-weight:600; margin-right:8px; white-space:nowrap; }
  #othcard li.oi .od { color:var(--tx); font-size:13.5px; margin-right:8px; }
  #othcard li.oi .on2 { color:var(--dim,#8fa0b3); }
  #othcard li.oi .osec { color:#8fb6e8; font-size:11.5px; margin-right:8px; }
  #othcard li.oi .od.lnk { cursor:pointer; border-bottom:1px dotted currentColor; }
  #othcard li.oi .oseg { display:inline; }
  #othcard li.oi .osub { margin:2px 0 0 14px; }
  #othcard li.oi .osrc { display:inline-block; color:#8fb6e8; font-size:10.5px; border:1px solid var(--bd);
    border-radius:4px; padding:0 4px; margin-right:6px; vertical-align:1px; }
  #othcard li.oi .ocodes { color:#b7a8f0; font-size:11.5px; margin-left:6px; }
  #othcard li.oi .oap { color:var(--dim,#8fa0b3); font-size:11.5px; display:block; }
  #othcard li.oi.empty { color:var(--dim,#8fa0b3); text-align:center; padding:24px 0; }
  #othcard .oc-foot { padding:8px 16px 12px; border-top:1px solid var(--bd); font-size:11px; color:var(--dim,#8fa0b3); }
  body.light #othcard { background:rgba(20,32,48,.5); }
  #none { display:none; color:var(--dim); padding:26px 4px; }
  .sugg { position:absolute; top:calc(100% + 4px); left:14px; right:14px; max-width:760px; max-height:52vh; overflow:auto;
    background:var(--pn); border:1px solid var(--ac); border-radius:12px; box-shadow:0 18px 44px rgba(0,0,0,.45);
    display:none; z-index:60; overscroll-behavior:contain; }
  body.light .sugg { box-shadow:0 18px 44px rgba(20,32,48,.22); }
  .sugg.on { display:block; }
  .sugg .s { display:flex; gap:10px; align-items:baseline; padding:5px 11px; cursor:pointer; border-bottom:1px solid var(--bd); }
  .sugg .s:last-child { border-bottom:0; }
  .sugg .s:hover, .sugg .s.act { background:var(--pn2); }
  .sugg .s.act { box-shadow:inset 3px 0 0 var(--ac); }
  .sugg .s .sv { color:var(--tx); font-weight:600; white-space:nowrap; }
  .sugg .s .sk { color:var(--ac); font-size:11px; white-space:nowrap; }
  .sugg .s .sd { color:var(--dim); font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sugg .s .sn { margin-left:auto; color:var(--dim); font-size:11.5px; white-space:nowrap; }
  body.view-refs .frow, body.view-refs #fbtn, body.view-refs #hits, body.view-refs #q { display:none; }
  body.view-bib .frow, body.view-bib #fbtn, body.view-bib #hits, body.view-bib #q { display:none; }
  .rnav { display:flex; gap:7px; flex-wrap:wrap; margin:0 0 12px; align-items:center; }
  .rnav .rlab { color:var(--dim); font-size:11.5px; }
  .rnav button { background:var(--pn); color:var(--tx); border:1px solid var(--bd); border-radius:999px;
    padding:3px 11px; font-size:12.5px; cursor:pointer; font-family:inherit; }
  .rnav button:hover { border-color:var(--ac); }
  .rnav button.on { background:var(--ac); border-color:var(--ac); color:#04121a; }
  .rsec { margin:0 0 22px; scroll-margin-top:14px; }
  .rsec .rhead { display:flex; gap:9px; align-items:baseline; padding:8px 11px; border:1px solid var(--bd);
    border-radius:9px; background:var(--pn); cursor:pointer; user-select:none; -webkit-user-select:none; }
  .rsec .rhead:hover { background:var(--pn2); }
  .rsec.open .rhead { background:var(--pn2); border-bottom-left-radius:0; border-bottom-right-radius:0; }
  .rsec .rhead .caret { color:var(--ac); font-size:11px; flex:0 0 11px; }
  .rsec .rhead h3 { font-size:14px; margin:0; font-weight:600; }
  .rsec .rhead .cnt { color:var(--dim); font-size:11.5px; border:1px solid var(--bd); border-radius:999px; padding:1px 8px; }
  .rsec .rhead .hint { color:var(--dim); font-size:11px; margin-left:auto; }
  .rsec .rbody { display:none; max-height:64vh; overflow:auto; }
  .rsec.open .rbody { display:block; }
  .rtab { width:100%; border-collapse:collapse; border:1px solid var(--bd); border-top:0;
    border-bottom-left-radius:9px; border-bottom-right-radius:9px; overflow:hidden; font-size:13.5px; }
  .rtab th, .rtab td { text-align:left; padding:5px 11px; border-bottom:1px solid var(--bd); background:var(--pn); }
  .rtab th { background:var(--pn2); color:var(--dim); font-weight:500; font-size:12px; position:sticky; top:0; z-index:1; }
  .rtab td.k { font-weight:600; white-space:nowrap; }
  .rtab td.n { color:var(--dim); text-align:right; white-space:nowrap; }
  .rtab td.d { color:var(--dim); font-size:12.5px; }
  .rtab tbody tr { cursor:pointer; }
  .rtab tbody tr:hover td { background:var(--pn2); }
  .rtab tbody tr:hover td:first-child { box-shadow:inset 3px 0 0 var(--ac); }
  #bgpanel { display:none; flex-direction:column; gap:6px; padding:8px 14px 10px; border-top:1px solid var(--bd); }
  header.openbg #bgpanel { display:flex; }
  #bgpanel .bgline { display:flex; gap:9px; align-items:center; flex-wrap:wrap; }
  #bgpanel label { color:var(--dim); font-size:12px; display:flex; gap:6px; align-items:center; }
  #bgpanel input[type=text] { min-width:220px; }
  #bgpanel input[type=range] { width:96px; }
  #bgpanel select { background:var(--pn); color:var(--tx); border:1px solid var(--bd); border-radius:7px;
    padding:3px 6px; font-size:12px; font-family:inherit; }
  #bgpanel input[type=checkbox] { accent-color:var(--ac); }
  #bgpanel .fname { color:var(--dim); font-size:11.5px; max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #bgmsg { color:var(--hl); font-size:11.5px; }
  .photobar { display:flex; gap:7px; align-items:center; flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden;
    flex:1 1 320px; min-width:220px; padding:2px 2px 5px; scrollbar-width:thin; }
  .photobar .ph { position:relative; width:86px; height:54px; border:1px solid var(--bd); border-radius:8px;
    overflow:hidden; cursor:pointer; background:var(--pn2); flex:0 0 auto; box-shadow:0 1px 4px rgba(0,0,0,.28); }
  .photobar .ph.on { border-color:var(--ac); box-shadow:0 0 0 2px rgba(89,208,255,.45); }
  .photobar .ph img { width:100%; height:100%; object-fit:cover; display:block; }
  .photobar .ph .no { position:absolute; left:0; bottom:0; font-style:normal; font-size:10px; line-height:1;
    padding:2px 5px; background:rgba(0,0,0,.6); color:#fff; border-radius:0 6px 0 0; }
  .photobar .ph .x, .photobar .ph .z { position:absolute; background:rgba(0,0,0,.66); color:#fff;
    border:0; border-radius:50%; font-size:11px; line-height:1; width:17px; height:17px; padding:0;
    cursor:pointer; opacity:.72; transition:opacity .15s; font-family:inherit; }
  .photobar .ph .x { top:2px; right:2px; }
  .photobar .ph .z { top:2px; left:2px; border-radius:4px; width:auto; height:auto; padding:1px 4px; }
  .photobar .ph:hover .x, .photobar .ph:hover .z,
  .photobar .ph .x:focus, .photobar .ph .z:focus { opacity:1; }
  .photobar .cnt { color:var(--dim); font-size:11.5px; }
  .photobar .empty { color:var(--dim); font-size:11.5px; }
  #lbox[hidden] { display:none; }
  #lbox { position:fixed; inset:0; z-index:95; background:rgba(0,0,0,.88); display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:10px; cursor:zoom-out; }
  #lbox img { max-width:94vw; max-height:84vh; border-radius:10px; box-shadow:0 24px 70px rgba(0,0,0,.65); }
  #lbox .cap { color:#e4ecf4; font-size:13px; }
  #lbox .tip { color:#9fb0c0; font-size:11.5px; }
  .bgpos { display:grid; grid-template-columns:repeat(3,18px); grid-template-rows:repeat(3,18px); gap:2px; }
  .bgpos button { width:18px; height:18px; padding:0; border:1px solid var(--bd); border-radius:4px;
    background:var(--pn2); cursor:pointer; }
  .bgpos button.on { background:var(--ac); border-color:var(--ac); }
  .recent { display:flex; gap:5px; align-items:center; }
  .recent .rlab { color:var(--dim); font-size:11.5px; }
  .recent img { width:46px; height:28px; object-fit:cover; border:1px solid var(--bd); border-radius:5px; cursor:pointer; }
  .recent img:hover { border-color:var(--ac); }
  .bpresets { display:flex; gap:6px; margin-left:auto; }
  #top { position:fixed; right:18px; bottom:18px; z-index:9; width:42px; height:42px; border-radius:50%;
    border:1px solid var(--bd); background:var(--pn); color:var(--ac); font-size:19px; cursor:pointer;
    display:none; box-shadow:var(--shadow); }
  #top.on { display:block; }
  #top:hover { border-color:var(--ac); }
  footer { color:var(--dim); font-size:12.5px; border-top:1px solid var(--bd); padding:14px; max-width:var(--wrap-max);
    margin:0 auto; line-height:1.8; }
  body.bgimg footer { background:var(--hdbg); backdrop-filter:blur(8px); border-radius:10px; }
  body.bgimg #none { background:var(--hdbg); backdrop-filter:blur(8px); border-radius:10px; padding:26px 14px; }
  footer .by, header .by { color:var(--dim); font-size:12.5px; }
  footer .by { margin:6px 0 0; }
  footer details.srcs { margin-top:8px; }
  footer details.srcs summary { cursor:pointer; color:var(--dim); }
  footer details.srcs>div { margin-top:6px; line-height:1.75; color:var(--dim); font-size:12px; }
  footer details.srcs b { color:var(--fg,#dbe4ee); font-weight:600; }
  footer .dis-line { color:var(--dim); font-size:11.5px; line-height:1.7; margin:8px 0 0; max-width:110ch; }
  /* --- bibliography view + disclaimer ------------------------------------------------------- */
  #view-bib .shead { position:static; }
  details.dis { background:var(--pn); border:1px solid var(--bd); border-radius:8px; padding:10px 14px; margin:12px 0 16px;
    font-size:12.5px; line-height:1.85; color:var(--dim); max-width:var(--wrap-max); }
  details.dis summary { cursor:pointer; }
  details.dis summary b { color:var(--fg,#dbe4ee); }
  details.dis summary .dis-more { color:var(--ac); margin-left:6px; white-space:nowrap; }
  details.dis[open] summary .dis-more { display:none; }
  details.dis .dis-body { margin-top:9px; border-top:1px solid var(--bd); padding-top:9px; }
  details.dis .dis-body b { color:var(--fg,#dbe4ee); font-weight:600; }
  #bnav { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 14px; max-width:var(--wrap-max); }
  #bnav button { background:var(--pn); border:1px solid var(--bd); color:var(--dim); border-radius:14px; padding:4px 11px;
    font-size:12px; cursor:pointer; }
  #bnav button.on { border-color:var(--ac); color:var(--fg,#dbe4ee); }
  #bbody { max-width:var(--wrap-max); }
  #bbody .bcat { margin:0 0 18px; }
  #bbody .bcat h3 { font-size:13.5px; margin:0 0 7px; color:var(--fg,#dbe4ee); font-weight:600; }
  #bbody .bcat h3 em { color:var(--dim); font-style:normal; font-weight:400; font-size:12px; margin-left:6px; }
  #bbody ol { margin:0; padding-left:24px; }
  #bbody li { font-size:12.5px; line-height:1.8; color:var(--dim); margin-bottom:2px; }
  #bbody li b { color:var(--fg,#dbe4ee); font-weight:600; }
  #bbody li a { color:var(--ac); text-decoration:none; word-break:break-all; }
  #bbody li a:hover { text-decoration:underline; }
  #bbody .bnote { color:var(--dim); }
  #bbody .bcat table { border-collapse:collapse; width:100%; font-size:12.5px; }
  #bbody .bcat td { border-bottom:1px solid var(--bd); padding:5px 8px 5px 0; color:var(--dim); vertical-align:top; }
  #bbody .bcat td.n { color:var(--fg,#dbe4ee); white-space:nowrap; }
  /* --- prefix glossary view (v1.4.2.1: 字头含义) ------------------------------------------- */
  body.view-pref .frow, body.view-pref #fbtn, body.view-pref #hits, body.view-pref #q { display:none; }
  #view-pref .shead { position:static; }
  #pnav { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 14px; max-width:var(--wrap-max); }
  #pnav button { background:var(--pn); border:1px solid var(--bd); color:var(--dim); border-radius:14px; padding:4px 11px;
    font-size:12px; cursor:pointer; }
  #pnav button.on { border-color:var(--ac); color:var(--fg,#dbe4ee); }
  #pnav button em { font-style:normal; color:var(--dim); font-size:11px; margin-left:5px; }
  #pbody { max-width:var(--wrap-max); }
  #pbody .bcat { margin:0 0 18px; }
  #pbody .bcat h3 { font-size:13.5px; margin:0 0 7px; color:var(--fg,#dbe4ee); font-weight:600; }
  #pbody .bcat h3 em { color:var(--dim); font-style:normal; font-weight:400; font-size:12px; margin-left:6px; }
  #pbody .rtab { font-size:12.5px; }
  #pbody .rtab tbody tr { cursor:default; }
  .pmean { color:var(--fg,#dbe4ee); }
  .pconf { font-style:normal; font-size:10.5px; padding:0 5px; border-radius:5px; border:1px solid var(--bd); color:var(--dim);
    white-space:nowrap; }
  .pconf.pA { color:#3f9e63; border-color:rgba(63,158,99,.45); }
  .pconf.pB { color:var(--ac); border-color:rgba(120,160,220,.45); }
  .pconf.pC { color:#c08a2e; border-color:rgba(192,138,46,.45); }
  @media (max-width:700px){ li.e, li.e.nont { grid-template-columns:1fr; } li.e .nt { grid-column:1; } .flabel { width:auto; flex:0 0 auto; } }
</style>
</head>
<body>
<header id="hdr">
  <div class="row">
    <h1 data-t="title">ГРАУ / ГАУ 索引号总表</h1>
    <span class="tot" id="tot"></span>
    <span class="by" data-t="byLine"></span>
    <input id="q" type="search" data-tp="search" autocomplete="off">
    <span id="hits"></span>
    <button type="button" class="btn" id="fbtn" data-t="more">更多</button>
    <span class="switch" id="lansw"><button type="button" id="btn-lang-zh" class="on">中文</button><button type="button" id="btn-lang-ru">Русский</button></span>
    <span class="switch"><button type="button" id="btn-cyr" class="on" data-t="latOff">西里尔</button><button type="button" id="btn-lat" data-t="latOn">拉丁</button></span>
    <span class="switch" id="viewsw"><button type="button" id="btn-view-index" class="on" data-t="viewIndex">索引总表</button><button type="button" id="btn-view-refs" data-t="viewRefs">详查索引</button><button type="button" id="btn-view-pref" data-t="viewPref">字头含义</button><button type="button" id="btn-view-bib" data-t="viewBib">参考文献</button></span>
    <button type="button" class="btn" id="othbtn" data-t="othOpen"></button>
    <button type="button" class="ico" id="theme" data-t-title="theme">◐</button>
    <button type="button" class="ico" id="bgbtn" data-t-title="bg">▣</button>
    <div id="sugg" class="sugg"></div>
  </div>
  <div class="fbar" id="fbar">
    <button type="button" class="cbbtn" data-cb="series"></button>
    <button type="button" class="cbbtn" data-cb="fam"></button>
    <button type="button" class="cbbtn" data-cb="type"></button>
    <button type="button" class="cbbtn" data-cb="org"></button>
    <button type="button" class="btn" id="freset" data-t="resetAll"></button>
    <button type="button" class="btn" id="flit" data-t="litAll"></button>
    <button type="button" class="btn" id="fwiki" data-t="wikiAll"></button>
    <button type="button" class="btn spacer" id="fchips" data-t="chips"></button>
    <div class="cbdrop" id="cbdrop"><input type="text" id="cbin" data-tp="dropSearch" autocomplete="off"></div>
  </div>
  <div class="frow" id="frow-series"><span class="flabel ftoggle" data-row="frow-series"><span data-t="series">序列</span><span class="fval" id="fval-series"></span> <span class="car">▾</span></span><div class="fset" id="f-series">
    <button type="button" class="fk on" data-f="series" data-v="all" data-zh="全部序列" data-ru="все серии" data-t="allSeries">全部序列</button>${serChips}
  </div></div>
  ${letChips ? `<div class="frow" id="frow-letters"><span class="flabel ftoggle" data-row="frow-letters"><span data-t="letters">字母族</span> <span class="car">▾</span></span><div class="fset" id="f-letters">
    ${letChips}
  </div></div>` : ''}
  <div class="frow" id="frow-fam"><span class="flabel ftoggle" data-row="frow-fam"><span data-t="fam">索引族</span><span class="fval" id="fval-fam"></span> <span class="car">▾</span></span><div class="fset" id="f-fam">
    <button type="button" class="fk on" data-f="fam" data-v="all" data-zh="全部字头" data-ru="все семейства" data-t="allFam">全部字头</button><span id="famchips"></span>
    <input type="text" id="qfam" autocomplete="off">
  </div></div>
  <div class="frow collapsed" id="frow-type"><span class="flabel ftoggle" data-row="frow-type"><span data-t="type">器材类型</span><span class="fval" id="fval-type"></span> <span class="car">▸</span></span><div class="fset" id="f-type">
    <button type="button" class="fk on" data-f="type" data-v="all" data-zh="全部类型" data-ru="все типы" data-t="allType">全部类型</button>${typChips}
  </div></div>
  <div class="frow collapsed" id="frow-org"><span class="flabel ftoggle" data-row="frow-org"><span data-t="org">研制／生产单位</span><span class="fval" id="fval-org"></span> <span class="car">▸</span></span><div class="fset" id="f-org">
    <button type="button" class="fk on" data-f="org" data-v="all" data-zh="全部单位" data-ru="все организации" data-t="allOrg">全部单位</button>${orgChips}
  </div></div>
  <div id="bgpanel">
    <div class="bgline">
      <label><span data-t="bgUrl"></span><input type="text" id="bgurl" placeholder="https://… .jpg"></label>
      <label class="btn" style="cursor:pointer"><span data-t="bgFile"></span><input type="file" id="bgfile" accept="image/*" style="display:none"></label>
      <span class="fname" id="bgname"></span>
      <button type="button" class="btn" id="bgapply" data-t="bgApply"></button>
      <button type="button" class="btn" id="bgauto" data-t="bgAuto"></button>
      <button type="button" class="btn" id="bgclear" data-t="bgClear"></button>
    </div>
    <div class="bgline">
      <span class="photobar" id="photobar"></span>
      <label class="btn" style="cursor:pointer"><span data-t="addPhoto"></span><input type="file" id="bgfile2" accept="image/*" multiple style="display:none"></label>
      <label><span data-t="rotate"></span>
        <select id="bgrot">
          <option value="0" data-t="rotOff"></option>
          <option value="30" data-t="rot30"></option>
          <option value="60" data-t="rot60"></option>
          <option value="300" data-t="rot300"></option>
        </select></label>
    </div>
    <div class="bgline">
      <label><span data-t="bgFit"></span>
        <select id="bgsize">
          <option value="cover" data-t="fitCover"></option>
          <option value="contain" data-t="fitContain"></option>
          <option value="auto" data-t="fitAuto"></option>
          <option value="repeat" data-t="fitRepeat"></option>
        </select></label>
      <span class="bgpos" id="bgpos"></span>
      <label><input type="checkbox" id="bgfix" checked><span data-t="bgFix"></span></label>
      <label><input type="checkbox" id="bgvig"><span data-t="bgVig"></span></label>
      <label><input type="checkbox" id="bgcard"><span data-t="bgCard"></span></label>
      <label><span data-t="bgTint"></span>
        <select id="bgtint">
          <option value="neutral" data-t="tintNeutral"></option>
          <option value="cool" data-t="tintCool"></option>
          <option value="warm" data-t="tintWarm"></option>
        </select></label>
    </div>
    <div class="bgline">
      <label><span data-t="bgBright"></span><input type="range" id="bgbright" min="40" max="140" value="100"></label>
      <label><span data-t="bgContrast"></span><input type="range" id="bgcontrast" min="60" max="150" value="100"></label>
      <label><span data-t="bgSat"></span><input type="range" id="bgsat" min="0" max="200" value="100"></label>
      <label><span data-t="bgGray"></span><input type="range" id="bggray" min="0" max="100" value="0"></label>
      <label><span data-t="bgDim"></span><input type="range" id="bgdim" min="0" max="90" value="62"></label>
      <label><span data-t="bgBlur"></span><input type="range" id="bgblur" min="0" max="20" value="2"></label>
      <span class="bpresets">
        <button type="button" class="btn" id="bgread" data-t="presetRead"></button>
        <button type="button" class="btn" id="bgphoto" data-t="presetPhoto"></button>
        <button type="button" class="btn" id="bgnight" data-t="presetNight"></button>
      </span>
    </div>
    <div class="bgline">
      <label><span data-t="contentW"></span>
        <select id="bgwrap">
          <option value="520" data-t="w520"></option>
          <option value="680" data-t="w680"></option>
          <option value="860" data-t="w860"></option>
          <option value="1040" data-t="w1040"></option>
          <option value="1300" data-t="w1300"></option>
          <option value="1600" data-t="w1600"></option>
          <option value="100" data-t="wFull"></option>
        </select></label>
      <label><span data-t="contentA"></span><input type="range" id="bgpane" min="25" max="100" value="92"></label>
      <label><span data-t="align"></span>
        <span class="switch" id="alsw">
          <button type="button" id="al-left" data-t="alignLeft"></button>
          <button type="button" id="al-center" class="on" data-t="alignCenter"></button>
          <button type="button" id="al-right" data-t="alignRight"></button>
        </span></label>
      <span class="hint" data-t="contentHint" style="color:var(--dim);font-size:11.5px"></span>
    </div>
    <div class="bgline" id="bgmsg" hidden></div>
  </div>
</header>
<main>
  <div id="view-index">
    <div class="shead" id="shead"></div>
    <div id="content"></div>
    <div id="none" data-t="none"></div>
  </div>
  <div id="view-refs" hidden>
    <div class="shead" id="rshead">
      <h2 data-t="refsTitle">详查索引</h2>
      <span class="cnt" id="rcount"></span>
      <input type="search" id="rq" data-tp="refsSearch" autocomplete="off">
      <span class="sub" data-t="refsHint"></span>
    </div>
    <div class="rnav" id="rnav"></div>
    <div id="rbody"></div>
  </div>
  <div id="view-pref" hidden>
    <div class="shead" id="pshead">
      <h2 data-t="prefTitle">字头与序列含义</h2>
      <span class="cnt" id="pcount"></span>
      <input type="search" id="pq" data-tp="prefSearch" autocomplete="off">
      <span class="sub" data-t="prefHint"></span>
    </div>
    <div id="pnav"></div>
    <div id="pbody"></div>
  </div>
  <div id="view-bib" hidden>
    <div class="shead" id="bshead">
      <h2 data-t="bibTitle">参考文献目录</h2>
      <span class="cnt" id="bcount"></span>
      <input type="search" id="bq" data-tp="bibSearch" autocomplete="off">
      <span class="sub" data-t="bibHint"></span>
    </div>
    <details class="dis" id="disbox">
      <summary><b data-t="disTitle"></b> <span data-t="disShort"></span> <span class="dis-more" data-t="disMore"></span></summary>
      <div class="dis-body" data-th="disBody"></div>
    </details>
    <div class="rnav" id="bnav"></div>
    <div id="bbody"></div>
    <p class="sub" style="margin-top:14px" data-t="bibHint"></p>
  </div>
</main>
<footer><p data-t="hint"></p><p class="dis-line" data-t="disShort"></p><p class="by" data-t="byLine"></p><details class="srcs"><summary data-t="srcTitle"></summary><div data-th="srcList"></div></details></footer>
<div id="lbox" hidden><img alt=""><div class="cap"></div><div class="tip">Esc / 点击任意处关闭</div></div>
<div id="wcard" hidden><div class="wc-in">
  <button type="button" class="wc-x" id="wcClose">✕</button>
  <div class="wc-head"><span class="wc-id"></span><a class="wc-link" target="_blank" rel="noopener"></a></div>
  <div class="wc-langs"></div>
  <div class="wc-body"><img class="wc-img" alt=""><p class="wc-text"></p></div>
  <div class="wc-foot"></div>
</div></div>
<div id="othcard" hidden><div class="oc-in">
  <button type="button" class="wc-x" id="othx">×</button>
  <div class="oc-head">
    <b class="oc-t" data-t="othTitle"></b>
    <span class="oc-tabs">
      <button type="button" class="oc-tab on" data-ot="b" data-t="othGbtu"></button>
      <button type="button" class="oc-tab" data-ot="i" data-t="othGiu"></button>
      <button type="button" class="oc-tab" data-ot="a" data-t="othAmmo"></button>
      <button type="button" class="oc-tab" data-ot="m" data-t="othMo"></button>
    </span>
    <input type="text" id="othq" data-tp="othSearch" autocomplete="off">
    <button type="button" class="oc-eng" id="othEng" data-t="othEngOnly"></button>
    <span class="oc-cnt" id="othcnt"></span>
  </div>
  <ul class="oc-body" id="othbody"></ul>
  <div class="oc-foot" data-t="othFoot"></div>
</div></div>
<button type="button" id="top" data-t-title="top">↑</button>
<script id="grau-data" type="application/json">${JSON.stringify({ S: DATA.series, E: DATA.entries, LS: DATA.litSources, W: DATA.wiki || {}, WL: DATA.wikiAlt || {}, O: DATA.other || null, TZ: DATA.tz || null, DZ: DATA.dz || null, PG: PG })}</script>
<script id="grau-refs-data" type="application/json">${JSON.stringify(REF_PAYLOAD)}</script>
<script id="grau-bib-data" type="application/json">${BIBLIO_JSON}</script>
<script>
var STR = ${JSON.stringify(STR)};
var TYPE_META = ${JSON.stringify(TYPE_META)};
var ORG_META = ${JSON.stringify(ORG_META)};
var TYPE_ZH = {}, TYPE_RU = {}, ORG_ZH = {}, ORG_RU = {};
TYPE_META.forEach(function(t){ TYPE_ZH[t[0]] = t[1]; TYPE_RU[t[0]] = t[2]; });
ORG_META.forEach(function(o){ ORG_ZH[o[0]] = o[1]; ORG_RU[o[0]] = o[2]; });
${fs.readFileSync(RAW + '\\translit_client.js', 'utf8')}
${fs.readFileSync(RAW + '\\v1_client.js', 'utf8')}
</script>
</body>
</html>
`;
}

const doc = page();
fs.writeFileSync(OUT + '\\grau_index.html', doc, 'utf8');
console.log('written', OUT + '\\grau_index.html', (doc.length / 1048576).toFixed(2) + ' MB');

// CSV alongside (same columns, plus the Wikipedia article when there is one)
const esc2 = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
const rows = [['group', 'series', 'prefix', 'type', 'org', 'index', 'nato', 'ru', 'zh', 'src', 'src_url', 'src_quote', 'wiki', 'wiki_url', 'wiki_intro', 'wiki_lang', 'wiki_tier', 'wiki_langs', 'aka', 'used_on', 'parts']];
for (const e of DATA.entries) {
  const s = DATA.series[e[8]];
  const L = e[10] || null;
  const Wr = DATA.wiki[e[0]] || null;
  // every edition available for this row (primary language + other-language articles + layers)
  const alt = DATA.wikiAlt && DATA.wikiAlt[e[0]] ? Object.keys(DATA.wikiAlt[e[0]]) : [];
  const langs = Wr ? [Wr[7] || 'ru'].concat(alt) : alt;
  rows.push([s.grpZh || '', s.ru, e[7], TYPE_LABEL[e[5]], e[6].split(' ').filter(Boolean).map((id) => (ORG_BY_ID[id] || {}).zh || id).join(' / '),
    e[0], e[2], e[3], e[4], L ? (DATA.litSources[L[0]] || L[0]) : '', L ? L[1] : '', L ? L[2] : '',
    Wr ? Wr[0] : '', Wr ? Wr[1] : '', Wr ? Wr[2] : '',
    Wr ? (Wr[7] || 'ru') : '', Wr ? (Wr[6] || 'v') : '',
    Array.from(new Set(langs)).join(','),
    (e[11] || []).join(' '), (e[12] || []).join(' '), (e[13] || []).join(' ')]);
}
fs.writeFileSync(OUT + '\\grau_index.csv', '\uFEFF' + rows.map((r) => r.map(esc2).join(';')).join('\r\n'), 'utf8');
console.log('written grau_index.csv rows:', rows.length - 1);

// data-quality + self-containment guards
{
  const flagged = DATA.entries.filter((e) => (e[3] || '').length > 1200);
  if (flagged.length) console.log('QUALITY WARNING: oversized rows:', flagged.length);
  else console.log('data quality: no oversized fields');
  const ext = [...doc.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  if (ext.length) console.log('SELF-CONTAINMENT WARNING: references', ext.length, 'external URLs');
  else console.log('self-contained: no external scripts, styles or images');
}
