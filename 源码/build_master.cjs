const fs = require('fs');
const RAW = 'D:\\DsHs\\grau\\_raw';

const merged = JSON.parse(fs.readFileSync(RAW + '\\merged.json', 'utf8'));   // sites 1+2 (ru)
const salis = JSON.parse(fs.readFileSync(RAW + '\\salis3\\parsed.json', 'utf8')); // pdf (ru + NATO)

// ---------- Chinese lookup built from the already translated sources ----------
const zhLookup = new Map(); // normalized Russian description -> Chinese
const readMap = (f) => {
  const p = RAW + '\\i18n\\' + f;
  if (!fs.existsSync(p)) return null;
  const m = new Map();
  for (const line of fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const t = line.indexOf('\t');
    if (t > 0) m.set(line.slice(0, t).trim(), line.slice(t + 1).trim());
  }
  return m;
};
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"'“”]/g, '"').replace(/\s+/g, ' ').trim();

const meta = JSON.parse(fs.readFileSync(RAW + '\\i18n\\meta.json', 'utf8'));
const byGroup = {};
for (const e of merged.entries) (byGroup[e.g] = byGroup[e.g] || []).push(e);

let zhPairs = 0;
for (const m of meta) {
  const key = String(m.group);
  const zh = readMap(`zh-${key}.txt`);
  if (!zh) continue;
  (byGroup[key] || []).forEach((e, i) => {
    const id = String(i + 1).padStart(5, '0');
    const z = zh.get(id);
    if (z && e.desc) { zhLookup.set(norm(e.desc), z); zhPairs++; }
  });
}
console.log('Chinese lookup pairs from GRAU groups:', zhPairs);

// ---------- merge ----------
const recs = new Map();
function key(idx) { return norm(idx).replace(/\s/g, ''); }

function addRu(idx, desc, src, nato) {
  const k = key(idx);
  if (!k) return;
  let r = recs.get(k);
  if (!r) { r = { idx, ru: '', nato: '', srcs: [], web: '', salis: '' }; recs.set(k, r); }
  if (!r.srcs.includes(src)) r.srcs.push(src);
  const d = String(desc || '').replace(/\s+/g, ' ').trim();
  if (d && d.length > r.ru.length) r.ru = d;
  if (d && src === 'web' && d.length > r.web.length) r.web = d;
  if (d && src === 'salis3' && d.length > r.salis.length) r.salis = d;
  if (nato && !r.nato) r.nato = nato;
}

for (const e of merged.entries) addRu(e.idx, e.desc, 'web');
for (const e of salis.entries) addRu(e.idx, e.desc, 'salis3', e.nato);

// ---------- non-GRAU design bureaus (factory / design-office codes) ----------
// ТКБ / ОЦ / ЦКИБ / АЕК … come from their own parsed section with their own translation chunks.
const nongrau = fs.existsSync(RAW + '\\nongrau.json')
  ? JSON.parse(fs.readFileSync(RAW + '\\nongrau.json', 'utf8')) : [];
const ngZh = new Map();      // normalized designator -> Chinese
const ngBureau = new Map();  // normalized designator -> bureau (Chinese name)
let ngItems = 0, ngZhItems = 0;
for (const g of nongrau) {
  // translations are keyed by designator, never by row position: the row numbering in the
  // chunk files and in nongrau.json can drift apart when the parser is improved
  const p = RAW + '\\i18n\\zh-x-' + g.key + '.txt';
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
      const t = line.indexOf('\t');
      if (t <= 0) continue;
      const body = line.slice(t + 1).trim();
      const dash = body.indexOf(' - ');
      if (dash <= 0) continue;
      const desig = body.slice(0, dash).trim();
      const zhDesc = body.slice(dash + 3).trim();
      if (desig && zhDesc) { ngZh.set(key(desig), zhDesc); ngZhItems++; }
    }
  }
  for (const it of g.items) {
    ngItems++;
    addRu(it.idx, it.desc, 'nongrau');
    if (g.zh) ngBureau.set(key(it.idx), g.zh);
  }
}
console.log('non-GRAU bureau records:', ngItems, '| translations available:', ngZh.size,
  '| bureaus:', nongrau.map((g) => g.key).join(', '));

// SALIS3 is authoritative for wording: prefer it when present
for (const e of salis.entries) {
  const r = recs.get(key(e.idx));
  if (r && e.desc) r.ru = e.desc.replace(/\s+/g, ' ').trim();
  if (r && e.nato) r.nato = e.nato;
}

// ---------- family titles from SALIS3 ----------
const familyTitle = {};
for (const g of salis.groups) if (g.code && g.title && !familyTitle[g.code]) familyTitle[g.code] = g.title;

// ---------- supplementary web layer (webadd.json) ----------
// A fourth, clearly marked layer: designators found in specialised articles and reference
// glossaries outside the three primary sites. Every row keeps its source name, URL and a
// verbatim quote, so a reader can check it against the original.
const litInfo = new Map();
const litFix = new Map();
const litAdd = new Map();
const splitZh = new Map();
let litAdded = 0, litEnriched = 0, litFixed = 0, splitAdded = 0;
if (fs.existsSync(RAW + '\\webadd.json')) {
  const wa = JSON.parse(fs.readFileSync(RAW + '\\webadd.json', 'utf8'));
  const S = (wa.meta && wa.meta.sources) || {};
  const srcName = (id) => (S[id] && S[id].name) || id;
  const mk = (e, kind) => ({ kind, ru: e.ru, zh: e.zh, src: e.src, srcName: srcName(e.src), url: e.url, q: e.q || '', name: e.name || '' });
  for (const [idx, e] of Object.entries(wa.add || {})) {
    addRu(idx, e.ru, 'lit');
    litAdd.set(key(idx), mk(e, 'add'));
    litInfo.set(key(idx), mk(e, 'add'));
    litAdded++;
  }
  // Records pulled back out of a merged description: they belong to the three primary sources,
  // so they carry no supplementary badge — only their wording and translation are added here.
  for (const [idx, e] of Object.entries(wa.split || {})) {
    addRu(idx, e.ru, 'web');
    splitZh.set(key(idx), e.zh || '');
    splitAdded++;
  }
  // a correction replaces the wording, an enrichment appends — a row may carry both (and an
  // add as well), so they are kept apart and applied in order: add -> fix -> enrich
  for (const [idx, e] of Object.entries(wa.fix || {})) { litFix.set(key(idx), mk(e, 'fix')); litInfo.set(key(idx), mk(e, 'fix')); litFixed++; }
  for (const [idx, e] of Object.entries(wa.enrich || {})) { litInfo.set(key(idx), mk(e, 'enrich')); litEnriched++; }
  console.log('supplementary web layer:', litAdded, 'added |', litEnriched, 'enriched |', litFixed, 'corrected');
}

// ---------- group them ----------
const all = [...recs.values()].map((r) => {
  const top = (r.idx.match(/^([0-9]{1,2}(?=[0-9А-ЯЁ]|$)|[А-ЯЁ]{1,5})/) || [])[1] || '?';
  const fam = (r.idx.match(/^([0-9]{1,2}[А-ЯЁ]{0,5}|[А-ЯЁ]{1,5})/) || [])[1] || r.idx;
  return { idx: r.idx, ru: r.ru, nato: r.nato, srcs: r.srcs, top, fam, famTitle: familyTitle[fam] || '', web: r.web, salis: r.salis, lit: litInfo.get(key(r.idx)) || null };
});

// ---------- Chinese by index (reliable) + by description (fallback) ----------
const zhByIdx = new Map();
for (const m of meta) {
  const key2 = String(m.group);
  const zh = readMap(`zh-${key2}.txt`);
  if (!zh) continue;
  (byGroup[key2] || []).forEach((e, i) => {
    const id = String(i + 1).padStart(5, '0');
    const z = zh.get(id);
    if (z) zhByIdx.set(key(e.idx), z);
  });
}
console.log('Chinese lookup by index:', zhByIdx.size);
// ---------- web-researched descriptions (persisted, survives pipeline reruns) ----------
{
  const rp = RAW + '\\research.json';
  if (fs.existsSync(rp)) {
    const research = JSON.parse(fs.readFileSync(rp, 'utf8'));
    const byIdx = new Map(all.map((e) => [key(e.idx), e]));
    let filled = 0;
    for (const [idx, desc] of Object.entries(research)) {
      const e = byIdx.get(key(idx));
      if (e && desc && (!e.ru || e.ru.length < 4)) { e.ru = desc; e.ruSource = 'web-research'; filled++; }
    }
    console.log('web-research descriptions merged:', filled);
  }
}
for (const e of all) {
  const byIdx = zhByIdx.get(key(e.idx));
  e.zh = byIdx || zhLookup.get(norm(e.ru)) || '';
  e.zhFromIdx = !!byIdx;
}
// pulled-out records bring their own translation with them
for (const e of all) {
  const z = splitZh.get(key(e.idx));
  if (z) { e.zh = z; e.zhFromIdx = true; }
  if (splitZh.has(key(e.idx)) && !z) e.zh = '';
}
if (splitAdded) console.log('records pulled out of merged descriptions:', splitAdded);
// Keep the Russian and the Chinese of a row describing the same thing: when the Chinese came
// from the website-based chunks but the Russian shown is the terser SALIS3 wording (a one-word
// "процессор" next to a detailed Chinese), restore the website wording.
let realigned = 0;
// a description that repeats one of its own fragments was glued from several source rows —
// never prefer such a text over the clean SALIS3 wording
function looksMerged(d) {
  const w = String(d).split(/\s+/);
  for (let i = 0; i + 2 < w.length; i++) {
    const g = w.slice(i, i + 3).join(' ');
    if (g.length >= 18 && d.indexOf(g) !== d.lastIndexOf(g)) return true;
  }
  return false;
}
for (const e of all) {
  if (!e.zhFromIdx || !e.web) continue;
  if (e.web.length > String(e.ru || '').length + 10 && !looksMerged(e.web)) { e.ru = e.web; realigned++; }
}
if (realigned) console.log('rows realigned to the source their Chinese was translated from:', realigned);
// non-GRAU bureau translations, and their bureau as the family title
for (const e of all) {
  const k = key(e.idx);
  if (!e.zh && ngZh.has(k)) e.zh = ngZh.get(k);
  if (!e.famTitle && ngBureau.has(k)) e.famTitle = ngBureau.get(k);
}
// SALIS3-only entries covered by the dedicated translation passes.
// Chunk files may number their rows from their own offset, so translations are
// matched by designator, and each chunk is read from its own file.
for (const pass of [
  { dir: 'i18n', man: 'todo-manifest.json', pre: 'zh-salis-' },
  { dir: 'i18n2', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n3', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n4', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n5', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n6', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n7', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n8', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n9', man: 'manifest.json', pre: 'zh-' },
  { dir: 'i18n10', man: 'manifest.json', pre: 'zh-' },
]) {
  const man = RAW + '\\' + pass.dir + '\\' + pass.man;
  if (!fs.existsSync(man)) continue;
  const dirPath = RAW + '\\' + pass.dir;
  const allFiles = fs.existsSync(dirPath) ? fs.readdirSync(dirPath).filter((f) => /\.txt$/.test(f)) : [];
  const manifest = JSON.parse(fs.readFileSync(man, 'utf8'));
  const byIdx = new Map(all.map((e) => [key(e.idx), e]));
  let applied = 0;
  manifest.forEach((idxs, i) => {
    const n = String(i + 1).padStart(2, '0');
    let useFiles = allFiles.filter((f) => f === pass.pre + n + '.txt');
    if (!useFiles.length) useFiles = allFiles.filter((f) => /^zh.*\.txt$/.test(f));
    const byDesignator = new Map();
    // every chunk file of this pass is pooled, so a single-chunk manifest still sees all rows
    for (const f of allFiles) {
      for (const line of fs.readFileSync(dirPath + '\\' + f, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
        const t = line.indexOf('\t');
        if (t <= 0) continue;
        const body = line.slice(t + 1);
        const bar = body.indexOf(' | ');
        if (bar <= 0) continue;
        const desig = body.slice(0, bar).trim();
        const zh = body.slice(bar + 3).trim();
        if (desig && zh) byDesignator.set(key(desig), zh);
      }
    }
    idxs.forEach((idx) => {
      const zh = byDesignator.get(key(idx));
      const e = byIdx.get(key(idx));
      if (e && zh && e.zh !== zh) { e.zh = zh; applied++; }
    });
  });
  console.log('translations merged from ' + pass.dir + ':', applied);
}
// a row with no Russian source text cannot legitimately carry a translation
for (const e of all) if (!e.ru && e.zh) e.zh = '';

// ---------- Chinese surface cleanup ----------
// Older translation passes kept the Russian "152-мм" style; normalise units and spacing so the
// Chinese column reads as Chinese. Purely mechanical, applied on every build.
function stripTagJunk(s) {
  return String(s)
    .replace(/<[a-z\/][^>]*>/gi, ' ')     // complete tags
    .replace(/\s*<[a-z\/][^>]*$/i, '')    // a tag the source cut in half at the end
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function cleanZh(s) {
  let z = stripTagJunk(s);
  z = z.replace(/(\d)\s*-\s*мм(?![а-яё])/g, '$1 毫米');
  z = z.replace(/(\d)\s*-\s*см(?![а-яё])/g, '$1 厘米');
  z = z.replace(/(\d)\s*-\s*км(?![а-яё])/g, '$1 公里');
  z = z.replace(/(\d)\s*-\s*кг(?![а-яё])/g, '$1 公斤');
  z = z.replace(/(\d)\s*-\s*т(?![а-яё])/g, '$1 吨');
  z = z.replace(/(\d)\s*-\s*л(?![а-яё])/g, '$1 升');
  z = z.replace(/(\d),(\d+)(?=\s*(?:毫米|厘米|公里|公斤|吨|升))/g, '$1.$2');
  z = z.replace(/(毫米|厘米|公里|公斤|吨|升)\s+(?=[\u4e00-\u9fff])/g, '$1');
  z = z.replace(/\s+([，。；：、）】》」！？])/g, '$1');
  z = z.replace(/\s{2,}/g, ' ');
  // the sources carry unbalanced brackets; keep the Chinese readable by closing what is open.
  // A standalone Cyrillic list marker ("а)", "б)") brackets itself and is excluded.
  const zf = z.replace(/(^|[\s，。；、])([абвгдеАБВГДЕ])[)）](?=[\s，。；、]|$)/g, '$1$2 ');
  const opens = (zf.match(/[（(]/g) || []).length, closes = (zf.match(/[）)]/g) || []).length;
  if (opens > closes) z += '）'.repeat(opens - closes);
  return z.trim();
}
let zhCleaned = 0;
// ---------- curated corrections for source blocks that glued several designators together ----------
{
  const fp = RAW + '\\desc_fixes.json';
  if (fs.existsSync(fp)) {
    const fixes = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const byIdx = new Map(all.map((e) => [key(e.idx), e]));
    let applied = 0;
    for (const [idx, f] of Object.entries(fixes)) {
      if (idx.startsWith('_')) continue;
      const e = byIdx.get(key(idx));
      if (!e) { console.log('  desc fix: no such row ' + idx); continue; }
      if (typeof f.ru === 'string') e.ru = f.ru;
      if (typeof f.zh === 'string') e.zh = f.zh;
      applied++;
    }
    console.log('curated description corrections applied:', applied);
  }
}
// ---------- apply the supplementary layer (its own wording wins for its own rows) ----------
for (const e of all) {
  const k = key(e.idx);
  const A = litAdd.get(k) || null;      // 1) the wording declared by the `add` block
  if (A) { e.ru = A.ru; e.zh = A.zh; }
  const F = litFix.get(k) || null;      // 2) a correction replaces it
  if (F) { e.ru = F.ru; e.zh = F.zh; }
  const L = e.lit;                      // 3) the enrichment is appended
  if (!L || L.kind !== 'enrich') continue;
  if (L.ru && e.ru && e.ru.indexOf(L.ru) < 0) e.ru = e.ru.replace(/[\s;.]+$/, '') + '; ' + L.ru;
  if (L.zh && e.zh && e.zh.indexOf(L.zh) < 0) e.zh = e.zh.replace(/[\s；。]+$/, '') + '；' + L.zh;
  else if (L.zh && !e.zh) e.zh = L.zh;
}
// ---------- component layer (parts.json) ----------
// The primary sources index weapons by their ГРАУ number, while a reader often looks up a
// *product designation* (ТПН-3, БУ-25-2С). Those designators become ordinary rows here — each
// one carrying the source it was verified against — plus two-way links to the equipment:
//   row.usedOn  designations of the equipment this part belongs to
//   row.parts   reverse link: parts that belong to this equipment row
//   row.aka     alternative designations of an existing row (searchable like its index)
{
  const pp = RAW + '\\parts.json';
  if (fs.existsSync(pp)) {
    const P = JSON.parse(fs.readFileSync(pp, 'utf8'));
    const srcName = (P.meta && P.meta.srcName) || 'Комплектующие';
    const byKey = new Map(all.map((e) => [key(e.idx), e]));
    let added = 0, aliasN = 0, linkN = 0, miss = 0;
    const aliasOf = new Map();
    for (const target of Object.keys(P.aliases || {})) {
      const e = byKey.get(key(target));
      if (!e) continue;                       // a target may be a row this layer is about to create
      const arr = aliasOf.get(key(target)) || [];
      for (const a of P.aliases[target]) if (arr.indexOf(a) < 0) { arr.push(a); aliasN++; }
      aliasOf.set(key(target), arr);
    }
    for (const target of Object.keys(P.usedOn || {})) {
      const e = byKey.get(key(target));
      if (!e) continue;                       // counted below, once every new row exists
      const arr = e.usedOn || (e.usedOn = []);
      for (const u of P.usedOn[target]) if (arr.indexOf(u) < 0) { arr.push(u); linkN++; }
    }
    for (const r of (P.newRows || [])) {
      const k = key(r.code);
      const prev = byKey.get(k);
      const links = (r.usedOn || []).filter(Boolean);
      if (prev) {                                   // the row already exists: keep it, add the links
        const arr = prev.usedOn || (prev.usedOn = []);
        for (const u of links) if (arr.indexOf(u) < 0) { arr.push(u); linkN++; }
        if (!prev.zh && r.zh) { prev.zh = r.zh; prev.zhFromIdx = true; }
        // an index row that the primary sources already describe keeps its own wording, but the
        // component layer is authoritative for its *kind*: the layer opened the manual pages, and
        // without this the type filter would file e.g. 2Э58 (a stabiliser) under an unrelated group.
        prev.partRef = r.part;
        prev.part = r.part;
        continue;
      }
      const top = (r.code.match(/^([0-9]{1,2}(?=[0-9А-ЯЁ]|$)|[А-ЯЁ]{1,5})/) || [])[1] || '?';
      const fam = (r.code.match(/^([0-9]{1,2}[А-ЯЁ]{0,5}|[А-ЯЁ]{1,5})/) || [])[1] || r.code;
      const e = {
        idx: r.code, ru: r.ru || '', nato: '', srcs: ['part'], web: '', salis: '',
        top: top, fam: fam, famTitle: familyTitle[fam] || '', zh: r.zh || '', zhFromIdx: !!r.zh,
        part: r.part, usedOn: links, aka: (r.aka || []).slice(),
        lit: { kind: 'add', ru: r.ru || '', zh: r.zh || '', src: 'parts', srcName: srcName, url: r.src || '', q: r.note || '', name: '' },
      };
      all.push(e);
      byKey.set(k, e);
      added++;
    }
    // an alias or a link may target a row this very layer just created (БРМ-1К), so both maps are
    // re-applied once every new row exists — the index lookups above only saw the previous master
    for (const target of Object.keys(P.aliases || {})) {
      if (!byKey.has(key(target))) { miss++; continue; }
      const arr = aliasOf.get(key(target)) || [];
      for (const a of P.aliases[target]) if (arr.indexOf(a) < 0) { arr.push(a); aliasN++; }
      aliasOf.set(key(target), arr);
    }
    for (const target of Object.keys(P.usedOn || {})) {
      const e = byKey.get(key(target));
      if (!e) { miss++; continue; }
      const arr = e.usedOn || (e.usedOn = []);
      for (const u of P.usedOn[target]) if (arr.indexOf(u) < 0) { arr.push(u); linkN++; }
    }
    // dangling-target map: the catalogue sometimes spells a target differently from the row key
    // ("АК74Н" vs the row 6П20Н, "МТ-12" vs 2А29) — rewrite it onto the row key so the click lands
    // and the reverse `parts` link is built; `drop` removes prose that is not a designation.
    // master.json accumulates usedOn over runs, so stale spellings from earlier builds are fixed here.
    const DMAP = (() => { try { return JSON.parse(fs.readFileSync(RAW + '\\parts\\dangling_map.json', 'utf8')); } catch (e) { return { normalize: {}, drop: [], dropEdges: [] }; } })();
    const DROPS = new Set((DMAP.drop || []).map((d) => key(d)));
    const DEDGES = new Set((DMAP.dropEdges || []).map((p) => key(String(p).replace('|', '\u0001'))));
    let normN = 0, dropN = 0, edgeN = 0;
    for (const e of all) {
      if (!e.usedOn || !e.usedOn.length) continue;
      const keep = [];
      for (const u of e.usedOn) {
        if (DROPS.has(key(u))) { dropN++; continue; }
        if (DEDGES.has(key(e.idx) + '\u0001' + key(u))) { edgeN++; continue; }
        const to = (DMAP.normalize || {})[u];
        const v = to || u;
        if (DEDGES.has(key(e.idx) + '\u0001' + key(v))) { edgeN++; continue; }
        if (to && to !== u) normN++;
        if (keep.indexOf(v) < 0) keep.push(v);
      }
      e.usedOn = keep;
    }
    // reverse links: every equipment row learns which parts belong to it
    const partsByKey = new Map();
    for (const e of all) {
      if (!e.usedOn || !e.usedOn.length) continue;
      const seen = [];
      for (const u of e.usedOn) {
        if (!u || seen.indexOf(u) >= 0) continue;
        seen.push(u);
        const arr = partsByKey.get(key(u)) || [];
        if (arr.indexOf(e.idx) < 0) arr.push(e.idx);
        partsByKey.set(key(u), arr);
      }
      e.usedOn = seen;
    }
    for (const e of all) { const p = partsByKey.get(key(e.idx)); if (p) e.parts = p; else delete e.parts; }
    for (const k of aliasOf.keys()) {
      const e = byKey.get(k);
      if (!e) continue;
      const arr = e.aka || (e.aka = []);
      for (const a of aliasOf.get(k)) if (arr.indexOf(a) < 0) arr.push(a);
    }
    console.log('component layer (parts.json):', added, 'new rows |', aliasN, 'aliases on', aliasOf.size,
      'rows |', linkN, 'usedOn links |', partsByKey.size, 'rows carry parts | dangling rewrites:', normN, 'drops:', dropN, 'bogus edges:', edgeN, '| missing targets:', miss);
  }
}

// one surface-cleanup pass over the final text (both columns, hand corrections included)
for (const e of all) {
  if (e.ru) e.ru = stripTagJunk(e.ru);
  if (e.zh) {
    const c = cleanZh(e.zh);
    if (c !== e.zh) { e.zh = c; zhCleaned++; }
  }
}
console.log('Chinese rows normalised (units/spacing):', zhCleaned);
console.log('with Chinese by index:', all.filter((e) => e.zh).length);
console.log('still untranslated:', all.filter((e) => !e.zh && e.ru).length);

// ---- 去重：把「同一装备被误写成另一个索引号」的重复行并回真索引（v1.4.5）------------------
// 例：10П50 —— 来源（ru.wikipedia «СПП (прицел)»）把西里尔字母 О 写成了数字 0，而真索引 1ОП50
// 已在主源里；这里删除重复行、把误写号并入 aka，并在真行还没有补充层描述时把 lit 描述接过去。
const ALIAS_ONLY = { '10П50': '1ОП50' };
let aliasMerged = 0;
for (const dup of Object.keys(ALIAS_ONLY)) {
  const keep = ALIAS_ONLY[dup];
  const ai = all.findIndex((e) => key(e.idx) === key(dup));
  if (ai < 0) { console.log('alias-only: ' + dup + ' not present (skip)'); continue; }
  const ki = all.findIndex((e) => key(e.idx) === key(keep));
  if (ki < 0) { console.log('alias-only: target ' + keep + ' missing, keeping ' + dup); continue; }
  const d = all[ai], k = all[ki];
  const aka = k.aka || (k.aka = []);
  if (aka.indexOf(dup) < 0) aka.push(dup);
  for (const a of (d.aka || [])) if (aka.indexOf(a) < 0) aka.push(a);
  if (d.lit && !k.lit) k.lit = d.lit;
  all.splice(ai, 1);
  aliasMerged++;
  console.log('alias-only merged:', dup, '->', keep, '| aka now:', aka.join('/'));
}
if (aliasMerged) console.log('alias-only rows merged:', aliasMerged, '| records now:', all.length);

const tops = {};
for (const e of all) (tops[e.top] = tops[e.top] || []).push(e);

const ORDER = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','26','27','28','29','30','31','32','33','34','35','36','38','39','40','41','42','44','45','46','48','49','50','51','52','53','54','55','56','57','58','59','60','61','63','64','65','66','67','68','69','70','71','72','73','74','75','76','77','79','80','81','82','83','84','85','88','89','90','91','92','93','94','95','96','97','98','99'];
const present = ORDER.filter((t) => tops[t] && tops[t].length);
const extra = Object.keys(tops).filter((t) => !ORDER.includes(t));

console.log('total merged records:', all.length);
console.log('top-level groups present:', present.length, '| extras:', extra.join(',') || '-');
console.log('records with NATO:', all.filter((e) => e.nato).length);
console.log('records from SALIS3 only:', all.filter((e) => e.srcs.length === 1 && e.srcs[0] === 'salis3').length);
console.log('records from web only:', all.filter((e) => e.srcs.length === 1 && e.srcs[0] === 'web').length);
console.log('records in both:', all.filter((e) => e.srcs.length === 2).length);
console.log('with Russian description:', all.filter((e) => e.ru).length);
console.log('Chinese already known:', all.filter((e) => zhLookup.has(norm(e.ru))).length);
console.log('family titles known:', Object.keys(familyTitle).length);

// top-level titles
const topTitle = {
  '1': '火控、侦察、指挥与保障器材', '2': '火炮、迫击炮、火箭炮与发射装置', '3': '弹药与战斗部',
  '4': '发射装药、火药与烟火器材', '5': '（第5类）航空与特种器材', '6': '轻武器、单兵装备',
  '7': '枪弹、引信与工程爆破器材', '8': '第8类：弹道导弹、运载火箭及其地面／发射设备', '9': '导弹系统及其部件',
  '11': '（第11类）特种器材', '14': '（第14类）其他器材', '15': '战略火箭军导弹系统',
  '17': '（第17类）其他器材', '30': '（第30类）其他器材', '51': '第51组（ГАУ）光学与观测器材',
  '52': '第52组（ГАУ）火炮与炮架', '53': '第53组（ГАУ）弹药与包装', '54': '第54组（ГАУ）装药与火药',
  '55': '第55组（ГАУ）引信与雷管', '56': '第56组（ГАУ）轻武器与枪架', '57': '第57组（ГАУ）枪弹与地雷',
  '58': '第58组（ГАУ）其他器材',
};

fs.writeFileSync(RAW + '\\master.json', JSON.stringify({
  groups: present.map((t) => ({ id: t, title: topTitle[t] || ('第' + t + '类'), count: tops[t].length })),
  zhLookupPairs: zhPairs,
  entries: all,
}, null, 1), 'utf8');
console.log('\nwritten master.json');
console.table(present.slice(0, 20).map((t) => ({ group: t, count: tops[t].length, title: topTitle[t] || '' })));
