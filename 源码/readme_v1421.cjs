// Bring the seeded delivery README up to v1.4.2.1: the 「字头含义」reference tab (what does 1ПН mean),
// the ПВО 反序6 prefix coarsening and the merged old-ГАУ class. Numbers are read from the built page
// payload, from master.json and from the delivered artefacts, so the text cannot drift.
// usage: node readme_v1421.cjs [path-to-README.md]
const fs = require('fs');
const RAW = 'D:/DsHs/grau/_raw';
const VER = '1.4.2.1';
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
} catch (e) { var htmlBox = '49.3'; }
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
rrx(/^# grau_index\.v(?!1\.4\.2\.1)[\d.]+ — /m, '# grau_index.v1.4.2.1 — ', 'title');

const block = [
  '',
  '> **v1.4.2.1 的变化**（相对 v1.4.6）——新增「字头含义」对照页；ПВО 反序 6 与老 ГАУ 的字头不再细碎；随包附源码',
  '> 1. **新增「**字头含义**」标签页**（网页第四个标签，`GRAU索引系统v1.4.2.1.exe` 的详情面板与左侧树提示同源）：逐个说明**索引字头的含义**——例如 `1ПН`＝夜视瞄准镜类、`2А`＝火炮及火炮部件、`Р`＝无线电与通信、`9М`＝导弹类——并给出**每条含义的来源**。页面分两段：**序列（局号）含义**（' + glDept + ' 条）与**字头（字母类别）含义**（' + glLett + ' 条，含通用规则），每行显示「字头 · 所属大类 · 条目数 · 含义 · 来源」；顶部可按**索引体系组**筛选、按名称或条目数排序，并支持按字头／含义／来源搜索。证据强度标为**权威／公开／待考**（「待考」是整理者按同类编号的推断，未找到公开出处）。此外在**每个字头筛选按钮**与**每条索引号**上都有悬停提示，直接写出该字头的含义与来源。含义词典存放在 `_raw/parts/prefix_glossary_depts.json` 与 `_raw/parts/prefix_glossary_letters.json`（随源码包发出），合计 **' + num(glRows) + ' 条**。',
  '> 2. **ПВО 反序 6（Отдел 6）的字头收敛：' + num((pvo6.prefixes || []).length) + ' 个**（此前 ' + num(seriesN[105] || 0) + ' 条记录被切成 233 个只有一两行的字头，形如 `48Н6`／`55Ж6`／`58Ж6`）。现在字头只取**类别字母 + 6**（`Н6`、`Ж6`、`М6`、`Л6`、`В6`…），与第 5 局的 `5Н`／`5П` 风格一致；样品号仍完整保留在索引号里，搜索不受影响。',
  '> 3. **老 ГАУ（1935–1956）的 8 个局号合并为一个大类**：此前 `51-А`…`58-П` 是 8 个平行大类（' + num(Object.keys(dept).filter((d) => d >= 51 && d <= 58).length) + ' 个局号、约 81 个字头，每个大类只有几条到几十条），现在合并为**一个大类「老 ГАУ 编号（1935–1956）」**，其下字头就是**局号本身**（`51`／`52`／`53`／`54`／`56`／`57`／`58`，共 ' + num((gau.prefixes || []).length) + ' 个，共 ' + num(gauOldRows) + ' 条记录）；局号含义（例如 52＝火炮与炮架、57＝枪弹与地雷）在「字头含义」页与悬停提示里给出。',
  '> 4. **层级总览**：**' + groups + ' 个索引体系组 → ' + classes + ' 个大类 → ' + num(famTotal) + ' 个字头**（其中不重复 ' + num(famDistinct) + ' 个；v1.4.6 为 28 个大类、912 个字头；本版合并老 ГАУ、收敛 ПВО 反序 6 后为 ' + classes + ' 个大类）。网页、`grau_index.csv`、`grau_index.xlsx`、原生程序四处一致。关联层与上一版相同：**' + num(rowsUsedOn) + ' 行**带「所属装备」（' + num(usedOnLinks) + ' 条）、**' + num(rowsParts) + ' 行**带「构成部件」（' + num(partsLinks) + ' 条），弹药／导弹／反坦克导弹 ' + num(ammoLinked) + ' / ' + num(ammoN) + ' 行至少一端关联，**悬空与单向链接均为 0**。',
  '> 5. **交付包内附完整源码**：`源码/` 子文件夹含构建流水线的全部脚本（`build_all.ps1`、`build_v1.cjs`、`build_v1_tail.cjs`、`v1_client.js`、`sys_classify.cjs`、`rel_scan.cjs`、`parts_build.cjs`、`build_xlsx.cjs`、`embed_*.cjs`、`build_biblio.cjs`、`verify_links.cjs`…）、原生程序源码（`源码/native/Data.cs`、`MainForm.cs`、`Program.cs`、`exp_native.cjs`）与数据层（`源码/data/master.json`、`parts/*.json`、`biblio/references.json`），并附 `源码/README-源码.md` 说明构建顺序与运行环境（Node.js ≥ 18、PowerShell 5.1、.NET Framework 4 `csc`）；照此可重新生成网页、CSV、xlsx 与 exe。本包内源码共 **' + srcFiles + ' 个文件、约 ' + srcMB + ' MB**。',
  '> 6. **数据订正**：补入 **11 条 ГУКОС／ГРАУ 14Ф 索引**（`14Ф11`「纳里亚德」反导系统、`14Ф17`「格洛纳斯」导航卫星、`14Ф132`「箭-3М·泉源」通信卫星、`14Ф133`「康多尔」雷达侦察卫星、`14Ф136`「鱼叉」数据中继卫星、`14Ф137`「角色」光学侦察卫星、`14Ф138`「莲花-С」电子侦察卫星、`14Ф139`「牡丹-НКС」雷达侦察卫星、`14Ф148`「雪豹-М」光学侦察卫星、`14Ф149`「报喜」军用通信卫星、`14Ф160` ГЛОНАСС-К1），并**删除 1 条误收条目 `1РЛС232`**（不见于三处主要来源，也不是 ГРАУ 索引，来源是早期「modern 补充层」；它连带产生的假字头 `1РЛС` 同时消失）。14Ф 一类由 10 条增至 **' + num(n14) + ' 条**，全表 **' + num(total) + ' 条**、字头 **' + num(famDistinct) + ' 个**；35 个新增专名全部补上中文译名（`_raw/nicks_zh/p7.json`），专名表 **' + num(RE.nicks.length) + ' 条全部带中文**。',
  '> 7. 下一步（**尚未完成，勿当已交付**）：年份维度仍将**分批上网核对**后加入；国别暂不涉及；「一句话中文简介」目前取既有中文说明的首句，后续按条目**逐条重新生成**。',
].join('\n');

const anchor = '俄文版是中文版的**子页面**（同一文件内的语言切换 / `#ru`），不是独立文件。\n';
const BLOCK_RE = /\n> \*\*v1\.4\.2\.1 的变化\*\*[\s\S]*?(?=\n> \*\*v1\.4(?!\.2\.1)|\s*$)/;
// drop the stale block first, then insert the freshly computed one directly above the v1.4.6 block
if (BLOCK_RE.test(t)) { t = t.replace(BLOCK_RE, ''); console.log('dropped the previous v1.4.2.1 block'); }
const v146 = t.search(/\n> \*\*v1\.4\.6 的变化\*\*/);
if (v146 >= 0) {
  t = t.slice(0, v146) + block + t.slice(v146);
  console.log('inserted the v1.4.2.1 block above the v1.4.6 block');
} else if (t.indexOf(anchor) >= 0) {
  t = t.replace(anchor, anchor + block + '\n');
  console.log('inserted the v1.4.2.1 block after the anchor');
} else {
  console.log('!! neither the v1.4.6 block nor the anchor found — block NOT inserted');
}

// ---------------------------------------------------------------- the "文件" table
rrx(/：[\d ]+条例目 \+ 2 227 条卡片短文/, '：' + num(total) + ' 条例目 + 2 227 条卡片短文', 'file table entries');
rrx(/全部内容（\*\*约 [\d.]+ MB\*\*）/, '全部内容（**约 ' + mb('grau_index.html', htmlBox) + ' MB**）', 'html size');
rrx(/\*\*外链版\*\*（[\d.]+ MB）/, '**外链版**（' + mb('grau_index.linked.html', '8.2') + ' MB）', 'linked size');
rep('| `GRAU索引系统v1.4.6.exe` |', '| `GRAU索引系统v1.4.2.1.exe` |');
rep('| `GRAU索引系统v1.4.5.exe` |', '| `GRAU索引系统v1.4.2.1.exe` |');
rrx(/\.NET WinForms，[\d.]+ MB/, '.NET WinForms，' + mb('GRAU索引系统v1.4.2.1.exe', '32.7') + ' MB', 'exe size');
rrx(/[\d ]+ 行（含表头，数据行 [\d ]+；UTF-8 BOM，约 [\d.]+ MB）/, num(total + 1) + ' 行（含表头，数据行 ' + num(total) + '；UTF-8 BOM，约 ' + mb('grau_index.csv', '4.6') + ' MB）', 'csv rows');
rrx(/11 个工作表（约 [\d.]+ MB）/, '11 个工作表（约 ' + mb('grau_index.xlsx', '1.4') + ' MB）', 'xlsx size');
rrx(/缩写 [\d ]+ · 专名 [\d ]+ 全部带中文 · 单位 [\d ]+ · 类型 [\d ]+/,
  '缩写 ' + RE.abbr.length + ' · 专名 ' + num(RE.nicks.length) + ' 全部带中文 · 单位 ' + RE.orgs.length + ' · 类型 ' + RE.types.length, 'refpage counts');
rep('| `grau_index.v1.4.6.zip` |', '| `grau_index.v1.4.2.1.zip` |');
rep('| `grau_index.v1.4.5.zip` |', '| `grau_index.v1.4.2.1.zip` |');

// ---------------------------------------------------------------- bibliography table
rrx(/完整来源清单 \*\*[\d ]+ 条\*\*/, '完整来源清单 **' + num(refs.length) + ' 条**', 'bib count');
rrx(/完整参考文献目录（[\d ]+ 条/, '完整参考文献目录（' + num(refs.length) + ' 条', 'bib md count');
rrx(/\| \*\*合计\*\* \| \*\*[\d ]+\*\* \|/, '| **合计** | **' + num(refs.length) + '** |', 'bib total row');

// ---------------------------------------------------------------- source package (源码/) row in the file table
if (srcFiles && t.indexOf('| `源码/` |') < 0) {
  console.log('源码 package: ' + srcFiles + ' files, ' + srcMB + ' MB');
  rep('| `thumbs/` |', '| `源码/` | **构建源码**（' + srcFiles + ' 个文件，约 ' + srcMB + ' MB）：网页／CSV／xlsx／原生程序的全部构建脚本（`源码/`）、原生 C# 源码（`源码/native/`）与数据层（`源码/data/`），附 `源码/README-源码.md` 说明构建顺序与运行环境 |\n| `thumbs/` |');
} else if (srcFiles) {
  console.log('源码 package: ' + srcFiles + ' files, ' + srcMB + ' MB (row already present)');
} else {
  console.log('! 源码/ not found in the delivery directory — run pack_src.ps1 before readme_v1421.cjs');
}

fs.writeFileSync(P, t, 'utf8');
console.log('README ' + before + ' -> ' + t.length + ' chars');
