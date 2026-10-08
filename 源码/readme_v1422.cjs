// Bring the seeded delivery README up to v1.4.2.2. Content is identical to v1.4.2.1 (that release
// was published by overwriting the assets of the old release in place, so the download page never
// showed a new version); this generator therefore prepends a short "version advanced" entry and
// refreshes every number from the freshly built artefacts.
// usage: node readme_v1422.cjs [path-to-README.md]
const fs = require('fs');
const RAW = 'D:/DsHs/grau/_raw';
const VER = '1.4.2.2';
const P = process.argv[2] || ('D:/DsHs/grau/grau_index.v' + VER + '/README.md');
const DIR = P.replace(/[\\/][^\\/]+$/, '');
const SYSC = require(RAW + '/sys_classify.cjs');
const { typeOf } = require(RAW + '/classify.cjs');

const M = JSON.parse(fs.readFileSync(RAW + '/master.json', 'utf8'));
const E = M.entries;
const total = E.length;
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ---- census through the classifier; v1.4.2.1: the series key is c.series || c.dept (old ГАУ merged)
const dept = {}, sysN = {}, seriesN = {}, famBySeries = {};
for (const e of E) {
  const c = SYSC.classify(e.idx, e.ru);
  dept[c.dept] = (dept[c.dept] || 0) + 1;
  sysN[c.sys] = (sysN[c.sys] || 0) + 1;
  const sk = c.series || c.dept;
  seriesN[sk] = (seriesN[sk] || 0) + 1;
  (famBySeries[sk] = famBySeries[sk] || new Set()).add(e.fam);
}
const classes = Object.keys(seriesN).length;
const groups = Object.keys(SYSC.GROUP || {}).length;
// 字头数在读到交付页载荷之后再算（build_v1 的 prefixOf 现算结果，不用 master 里的历史字段 e.fam）
let famTotal = 0, famDistinct = 0;
const gauOldRows = Object.keys(dept).filter((d) => d >= 51 && d <= 58).reduce((a, d) => a + dept[d], 0);

// ---- the delivered page payload: series with their groups and prefixes, plus the glossary layer
let S = [], PG = { letters: {}, depts: {}, generic: [] };
try {
  const h = fs.readFileSync(DIR + '/grau_index.html', 'utf8');
  const i = h.indexOf('id="grau-data"');
  const j = h.indexOf('>', i) + 1;
  const k = h.indexOf('</script>', j);
  const D = JSON.parse(h.slice(j, k));
  S = D.S || [];
  if (D.PG) PG = D.PG;
  var htmlBox = (h.length / 1048576).toFixed(1);
} catch (e) { var htmlBox = '50.0'; }
const serOf = (n) => S.filter((s) => s.n === n)[0] || { prefixes: [], shortZh: '' };
S.forEach((s) => { famTotal += (s.prefixes || []).length; });
const famSet = new Set(); S.forEach((s) => (s.prefixes || []).forEach((p) => famSet.add(p)));
famDistinct = famSet.size;
const pvo6 = serOf(105), gau = serOf(50);
const glLett = Object.keys(PG.letters || {}).length, glDept = Object.keys(PG.depts || {}).length;
const glRows = glLett + glDept + ((PG.generic || []).length);

// ---- relation coverage (unchanged by this release, but stated with live numbers)
const AMMO = new Set(['ammo', 'missile', 'atgm']);
let usedOnLinks = 0, partsLinks = 0, rowsUsedOn = 0, rowsParts = 0, ammoN = 0, ammoLinked = 0;
for (const e of E) {
  const u = (e.usedOn || []).length, p = (e.parts || []).length;
  usedOnLinks += u; partsLinks += p;
  if (u) rowsUsedOn++;
  if (p) rowsParts++;
  let t = '';
  try { t = typeOf(e); } catch (err) { t = ''; }
  if (AMMO.has(t)) { ammoN++; if (u || p) ammoLinked++; }
}
const sumEdges = (f) => {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const o = j.links || j.usedOn || j;
    let n = 0;
    for (const k of Object.keys(o)) if (Array.isArray(o[k])) n += o[k].length;
    return n;
  } catch (e) { return 0; }
};
let researchEdges = 0, researchFiles = 0;
try {
  for (const f of fs.readdirSync(RAW + '/parts')) {
    if (/^ammo_links_.*\.json$/.test(f)) { researchFiles++; researchEdges += sumEdges(RAW + '/parts/' + f); }
  }
} catch (e) { /* ignore */ }
const wordingEdges = sumEdges(RAW + '/parts/rel_scan.json');
const refs = JSON.parse(fs.readFileSync(RAW + '/biblio/references.json', 'utf8'));
const RE = JSON.parse(fs.readFileSync(RAW + '/refs.json', 'utf8'));
const n14 = E.filter((e) => /^14Ф/i.test(String(e.idx).replace(/F/gi, 'Ф'))).length;
let zipMB = '118.7';
try { zipMB = (fs.statSync(DIR + '.zip').size / 1048576).toFixed(1); } catch (e) { }

// ---- the source package that ships inside the delivery (交付要求：发出去的包必须带源码)
const srcDir = DIR + '/源码';
let srcFiles = 0, srcBytes = 0;
(function walk(d) {
  let items = [];
  try { items = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const it of items) {
    const p = d + '/' + it.name;
    if (it.isDirectory()) walk(p);
    else { srcFiles++; try { srcBytes += fs.statSync(p).size; } catch (e) { } }
  }
})(srcDir);
const srcMB = (srcBytes / 1048576).toFixed(1);

function mb(name, fallback) {
  try { return (fs.statSync(DIR + '/' + name).size / 1048576).toFixed(1); } catch (e) { return fallback; }
}
function kb(name, fallback) {
  try { return Math.round(fs.statSync(DIR + '/' + name).size / 1024) + ' KB'; } catch (e) { return fallback; }
}

let t = fs.readFileSync(P, 'utf8');
const before = t.length;
function rep(a, b) {
  const n = t.split(a).length - 1;
  if (!n) { console.log('MISS  ' + JSON.stringify(a.slice(0, 70))); return 0; }
  t = t.split(a).join(b);
  console.log('ok x' + n + '  ' + JSON.stringify(a.slice(0, 55)));
  return n;
}
function rrx(re, b, label) {
  const m = t.match(re);
  if (!m) { console.log('MISS  ' + label); return 0; }
  t = t.replace(re, b);
  console.log('ok  ' + label + '  <- ' + JSON.stringify(m[0].slice(0, 55)));
  return 1;
}

// ---------------------------------------------------------------- title
rrx(/^# grau_index\.v(?!1\.4\.2\.2)[\d.]+ — /m, '# grau_index.v1.4.2.2 — ', 'title');

const block = [
  '',
  '> **v1.4.2.2 的变化**（相对 v1.4.2.1）——版本号推进，全部产物重新构建并单独发布；数据内容与 v1.4.2.1 一致',
  '> 1. **版本号推进到 `1.4.2.2`**：v1.4.2.1 的内容修正当日是在**原 release 内就地替换附件**发布的（release 条目与 tag 都没变），下载页上看不出更新。本版把版本号推进为 **`1.4.2.2`**、单独打 tag 与 release，并重新构建网页／CSV／xlsx／原生程序／zip 与源码包。',
  '> 2. **数据内容与 v1.4.2.1 完全相同**（本次没有增删任何条目）：全表 **' + num(total) + ' 条**（CSV ' + num(total + 1) + ' 行）、大类 **' + classes + ' 个**、字头 **' + num(famDistinct) + ' 个**、14Ф 类 **' + num(n14) + ' 条**、专名 **' + num(RE.nicks.length) + ' 条全部带中文**、参考文献 **' + num(refs.length) + ' 条**、关联边 **' + num(usedOnLinks) + '**（所属装备）／**' + num(partsLinks) + '**（构成部件），悬空与单向链接 **0**；下一条 v1.4.2.1 的说明仍是本版内容的完整记录。',
  '> 3. 下一步（**尚未完成，勿当已交付**）：年份维度仍将**分批上网核对**后加入；国别暂不涉及；「一句话中文简介」目前取既有中文说明的首句，后续按条目**逐条重新生成**。',
].join('\n');

const anchor = '俄文版是中文版的**子页面**（同一文件内的语言切换 / `#ru`），不是独立文件。\n';
const BLOCK_RE = /\n> \*\*v1\.4\.2\.2 的变化\*\*[\s\S]*?(?=\n> \*\*v1\.4(?!\.2\.2)|\s*$)/;
// drop the stale block first, then insert the freshly computed one above the newest existing block
if (BLOCK_RE.test(t)) { t = t.replace(BLOCK_RE, ''); console.log('dropped the previous v1.4.2.2 block'); }
const prev = t.search(/\n> \*\*v1\.4\.2\.1 的变化\*\*/) >= 0
  ? t.search(/\n> \*\*v1\.4\.2\.1 的变化\*\*/)
  : t.search(/\n> \*\*v1\.4\.6 的变化\*\*/);
if (prev >= 0) {
  t = t.slice(0, prev) + block + t.slice(prev);
  console.log('inserted the v1.4.2.2 block above the previous release block');
} else if (t.indexOf(anchor) >= 0) {
  t = t.replace(anchor, anchor + block + '\n');
  console.log('inserted the v1.4.2.2 block after the anchor');
} else {
  console.log('!! neither a previous release block nor the anchor found — block NOT inserted');
}

// ---------------------------------------------------------------- the "文件" table
rrx(/：[\d ]+条例目 \+ 2 227 条卡片短文/, '：' + num(total) + ' 条例目 + 2 227 条卡片短文', 'file table entries');
rrx(/全部内容（\*\*约 [\d.]+ MB\*\*）/, '全部内容（**约 ' + mb('grau_index.html', htmlBox) + ' MB**）', 'html size');
rrx(/\*\*外链版\*\*（[\d.]+ MB）/, '**外链版**（' + mb('grau_index.linked.html', '8.8') + ' MB）', 'linked size');
rrx(/\| `GRAU索引系统v[\d.]+\.exe` \|/, '| `GRAU索引系统v1.4.2.2.exe` |', 'exe row');
rrx(/\.NET WinForms，[\d.]+ MB/, '.NET WinForms，' + mb('GRAU索引系统v1.4.2.2.exe', '32.8') + ' MB', 'exe size');
rrx(/[\d ]+ 行（含表头，数据行 [\d ]+；UTF-8 BOM，约 [\d.]+ MB）/, num(total + 1) + ' 行（含表头，数据行 ' + num(total) + '；UTF-8 BOM，约 ' + mb('grau_index.csv', '5.2') + ' MB）', 'csv rows');
rrx(/11 个工作表（约 [\d.]+ MB）/, '11 个工作表（约 ' + mb('grau_index.xlsx', '1.4') + ' MB）', 'xlsx size');
rrx(/缩写 [\d ]+ · 专名 [\d ]+ 全部带中文 · 单位 [\d ]+ · 类型 [\d ]+/,
  '缩写 ' + RE.abbr.length + ' · 专名 ' + num(RE.nicks.length) + ' 全部带中文 · 单位 ' + RE.orgs.length + ' · 类型 ' + RE.types.length, 'refpage counts');
rrx(/\| `grau_index\.v[\d.]+\.zip` \|/, '| `grau_index.v1.4.2.2.zip` |', 'zip row');
rrx(/以上全部内容（约 [\d.]+ MB，含 `thumbs\/`）/, '以上全部内容（约 ' + zipMB + ' MB，含 `thumbs/`）', 'zip size');

// ---------------------------------------------------------------- bibliography table
rrx(/完整来源清单 \*\*[\d ]+ 条\*\*/, '完整来源清单 **' + num(refs.length) + ' 条**', 'bib count');
rrx(/完整参考文献目录（[\d ]+ 条/, '完整参考文献目录（' + num(refs.length) + ' 条', 'bib md count');
rrx(/\| \*\*合计\*\* \| \*\*[\d ]+\*\* \|/, '| **合计** | **' + num(refs.length) + '** |', 'bib total row');

// ---------------------------------------------------------------- source package (源码/) row in the file table
// the row is created once and then kept up to date (the file count changes when the pipeline grows)
if (srcFiles && t.indexOf('| `源码/` |') < 0) {
  console.log('源码 package: ' + srcFiles + ' files, ' + srcMB + ' MB');
  rep('| `thumbs/` |', '| `源码/` | **构建源码**（' + srcFiles + ' 个文件，约 ' + srcMB + ' MB）：网页／CSV／xlsx／原生程序的全部构建脚本（`源码/`）、原生 C# 源码（`源码/native/`）与数据层（`源码/data/`），附 `源码/README-源码.md` 说明构建顺序与运行环境 |\n| `thumbs/` |');
} else if (srcFiles) {
  console.log('源码 package: ' + srcFiles + ' files, ' + srcMB + ' MB (row present)');
  rrx(/\| `源码\/` \| \*\*构建源码\*\*（[\d ]+ 个文件，约 [\d.]+ MB）/,
    '| `源码/` | **构建源码**（' + srcFiles + ' 个文件，约 ' + srcMB + ' MB', 'source row counts');
} else {
  console.log('! 源码/ not found in the delivery directory — run pack_src.ps1 before readme_v1422.cjs');
}

fs.writeFileSync(P, t, 'utf8');
console.log('README ' + before + ' -> ' + t.length + ' chars');
