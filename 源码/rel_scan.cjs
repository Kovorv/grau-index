// v1.4.3.1: relation recovery from our own sourced Russian descriptions.
//
// The catalogue text itself says where a thing belongs:
//   "122-мм гаубица Д-32 для САУ 2С1 «Гвоздика»"            -> 2А31 is mounted on 2С1
//   "танковый мостоукладчик МТУ (объект 421, на базе Т-54)" -> МТУ stands on Т-54
//   "прицельный комплекс в составе СУО 1А33"                -> this row belongs to 1А33
//   "3БК2 — выстрел ... для пушки Д-44 (52-П-367)"          -> the round belongs to that gun
//
// Every mention of another row's index or alias is classified:
//   * by the words in front of it (rules below) — "для", "на базе", "в составе СУО" …
//   * otherwise by what the two rows are: a vehicle row that names a non-vehicle row contains it
//     (reverse edge), everything else belongs to the mentioned complex.
// Direction of an edge is always "this row is part of / mounted on the other row"; build_master
// turns the whole set around to fill the parts column, so both cards get their chips.
// usage: node rel_scan.cjs [--write] [--mentions]
const fs = require('fs');
const RAW = 'D:/DsHs/grau/_raw';
const { typeOf } = require('./classify.cjs');
const J = JSON.parse(fs.readFileSync(RAW + '/master.json', 'utf8'));
const entries = J.entries || J;
const WRITE = process.argv.indexOf('--write') >= 0;

const KEY = (s) => String(s || '').toLowerCase().replace(/[\s\u00a0]/g, '').replace(/ё/g, 'е');
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

// every designation the reader can search for: the row key and all of its aliases
// `ambiguousTokens` (from _raw/parts/dangling_map.json) lists names that also stand for something
// else in ordinary prose — «РПК» is both the РПК machine gun (6П2) and «радиоприборный комплекс»,
// so resolving it as a row reference invents edges (1РЛ21/1РЛ144М1 → 6П2). The alias stays for
// search; the relation scanner ignores it.
const AMBIG = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(RAW + '/parts/dangling_map.json', 'utf8'));
    return new Set((j.ambiguousTokens || []).map((t) => KEY(t)));
  } catch (e) { return new Set(); }
})();
const tokenTo = new Map();
for (const e of entries) {
  const own = KEY(e.idx);
  if (!tokenTo.has(own)) tokenTo.set(own, []);
  tokenTo.get(own).push(e.idx);
  for (const a of e.aka || []) {
    const k = KEY(a);
    if (!k || k === own || /\s/.test(String(a).trim())) continue;
    if (AMBIG.has(k)) continue;
    if (!tokenTo.has(k)) tokenTo.set(k, []);
    if (tokenTo.get(k).indexOf(e.idx) < 0) tokenTo.get(k).push(e.idx);
  }
}
const idxByKey = new Map(entries.map((e) => [KEY(e.idx), e]));
const typeByIdx = new Map(entries.map((e) => [e.idx, typeOf(e)]));

// a vehicle/launcher/radar row that names a sub-unit contains it; the reverse never holds
const PLATFORM = new Set(['armor', 'air', 'ship', 'sam', 'mlrs', 'radar']);

// explicit phrases: what the words in front of the mention mean
const RULES = [
  { id: 'base', re: /(?:^|\s)на\s+базе\s*$/, note: 'на базе' },
  { id: 'chassis', re: /(?:^|\s)на\s+шасси\s*$/, note: 'на шасси' },
  { id: 'mount', re: /(?:^|\s)(?:для|под)\s+установки\s+(?:в|на)\s*$/, note: 'для установки в/на' },
  { id: 'mounted', re: /(?:^|\s)(?:устанавливается|установлен|установлена|монтируется|размещается|смонтирован|крепится)\s+(?:на|в|под)\s*$/, note: 'устанавливается на' },
  { id: 'forfire', re: /(?:^|\s)(?:для|из)\s+стрельбы\s+(?:из|с)\s*$/, note: 'для стрельбы из' },
  // v1.4.6: 武器/弹药类别名词——「115-мм патрон … для пушек 2А20」「снаряд для гаубицы Д-30」「патрон для пулемёта ПК」。
  // 旧表只认裸「для」，于是最常见的弹药↔火炮句式整批漏掉（弹药关联差的直接原因）。词干按 _raw\tmp_marker_probe.cjs
  // 的普查结果补全，注意俄语复数第二格的「流音元音」形：пушек（非 пушк-）、винтовок（非 винтовк-）、
  // установок（非 установк-），以及 ЗУР/ПТУР/МБР/БРДД/ОТР(К)/ПГРК/РСЗО/ЗРС/РГЧ 等类别缩写。
  { id: 'forgun', re: /(?:^|\s)(?:для|под|к|из)\s+(?:пушк[а-яё]*|пушек|оруди[а-яё]*|гаубиц[а-яё]*|миномёт[а-яё]*|миномет[а-яё]*|мортир[а-яё]*|пулемёт[а-яё]*|пулемет[а-яё]*|автомат[а-яё]*|винтовк[а-яё]*|винтовок|карабин[а-яё]*|пистолет[а-яё]*|гранатомёт[а-яё]*|гранатомет[а-яё]*|станк[а-яё]*|прицел[а-яё]*|запал[а-яё]*|гильз[а-яё]*|гранат[а-яё]*|выстрел[а-яё]*|ракет[а-яё]*|установк[а-яё]*|установок|систем[а-яё]* залпового|рсзо|зрс|зур|птур|мбр|брдд|отрк|отр|пгрк|ргч)\s*$/, note: 'для пушек/орудий/гаубиц/миномётов/выстрелов/ЗУР/…' },
  { id: 'for', re: /(?:^|\s)(?:для|под)\s*$/, note: 'для' },
  // NOTE: \w never matches Cyrillic in JS — every stem uses [а-яё]*
  { id: 'in', re: /(?:^|\s)(?:в\s+)?(?:составе|комплекс[а-яё]*|систем[а-яё]*|установк[а-яё]*|машин[а-яё]*|танк[а-яё]*|издели[а-яё]*|блок[а-яё]*|комплект[а-яё]*|объект[а-яё]*|семейств[а-яё]*|модификац[а-яё]*|башн[а-яё]*|вооружени[а-яё]*|оруж[а-яё]*|суо|ксауо|ксау|зпрк|зрк|зсу|сау|спу|рпмк|армк|рпк|кув|ксу|рлс)\s*$/, note: 'в составе/СУО' },
  // "блок сопротивлений в 9Б149" — a bare «в» only when it really names a container; «с», «от»,
  // «на» and «рядом с» turned out to mean "next to / compatible with / replaced by", never membership
  { id: 'since', re: /(?:^|\s)(?:в|во)\s*$/, note: 'в …' },
];
const TOKEN = /[А-ЯЁа-яёA-Za-z0-9][А-ЯЁа-яёA-Za-z0-9.\-]{2,}/g;

const hits = [];   // { row, target, rule, dir }
const edge = {};   // "<attached row>" -> Set("<the row it belongs to>")
const mention = {};// plain cross references, reported only
let own = 0;
let guarded = 0;
for (const e of entries) {
  const ru = String(e.ru || '');
  if (!ru) continue;
  const self = KEY(e.idx);
  const toks = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(ru)) !== null) toks.push({ t: m[0], i: m.index });
  for (let i = 0; i < toks.length; i++) {
    const targets = tokenTo.get(KEY(toks[i].t));
    if (!targets) continue;
    const before = norm(ru.slice(Math.max(0, toks[i].i - 46), toks[i].i));
    // "ЗУР комплекса 2К12М4, 9К37" — a list of designations still belongs to the word that
    // governs the list, so the wording test runs on the window with the other designations and
    // bare separators removed ("зур комплекса" -> the marker «комплекса» is found).
    const keep = [];
    for (let j = Math.max(0, i - 8); j < i; j++) {
      const t = toks[j].t;
      if (tokenTo.has(KEY(t)) && KEY(t) !== self) continue;
      if (/^(?:и|или|с|со)$/i.test(t)) continue;
      keep.push(t);
    }
    const slim = norm(keep.join(' '));
    // the row's own designation standing right in front means the sentence is about the
    // neighbouring entry of a merged heading ("основной танк Т-64БМ Т-72 основной танк Т-72")
    let selfNear = false;
    for (let j = Math.max(0, i - 8); j < i; j++) if (KEY(toks[j].t) === self) { selfNear = true; break; }
    const after = norm(ru.slice(toks[i].i + toks[i].t.length, toks[i].i + toks[i].t.length + 26));
    let rule = null;
    for (const r of RULES) if (r.re.test(slim)) { rule = r; break; }
    if (!rule && /^(?:устанавливается|монтируется|базируется|размещается|крепится|устанавливают|входит|входил)(?:\s|$)/.test(after)) rule = { id: 'ahead' };
    if (rule && rule.id === 'in' && selfNear) { guarded++; continue; }
    for (const target of targets) {
      if (KEY(target) === self) { own++; continue; }
      const tp = typeByIdx.get(target);
      const rp = PLATFORM.has(typeByIdx.get(e.idx));
      // Every wording rule reads the same way: the row that writes the sentence is the one that
      // belongs to the mentioned equipment («122-мм гаубица Д-32 для САУ 2С1», «на шасси БТР-80»,
      // «прицельный комплекс в составе СУО 1А33»). The opposite direction — a vehicle listing its
      // own weapons — is never marked with these prepositions, and the earlier "platform contains
      // what it names" branch only produced inversions (ЗРК 96К6 "belonging to" its own radar
      // 1Л36). build_master inverts usedOn into parts, so both cards still get a chip.
      const dir = 'usedOn';
      const rec = { row: e.idx, target: target, rule: rule ? rule.id : 'plain', dir: dir, before: before.slice(-30), slim: slim.slice(-30), rp: rp, tp: tp };
      hits.push(rec);
      if (rule) {
        const a = e.idx;
        const b = target;
        (edge[a] = edge[a] || new Set()).add(b);
      } else {
        (mention[e.idx] = mention[e.idx] || new Set()).add(target);
      }
    }
  }
}

// what the master table already knows
const known = new Set();
for (const e of entries) for (const u of e.usedOn || []) known.add(KEY(e.idx) + '|' + KEY(u));

const byRule = {};
const pairs = [];
let dup = 0;
for (const h of hits) {
  if (h.rule === 'plain') continue;
  const k = KEY(h.row) + '|' + KEY(h.dir === 'parts' ? h.target : h.target) + '|' + h.dir;
  if (pairs.indexOf(k) >= 0) { dup++; continue; }
  pairs.push(k);
  (byRule[h.rule] = byRule[h.rule] || []).push(h);
}
const edgePairs = [];
for (const a of Object.keys(edge)) for (const b of edge[a]) edgePairs.push({ a: a, b: b, known: known.has(KEY(a) + '|' + KEY(b)) });
const fresh = edgePairs.filter((p) => !p.known);
console.log('rows scanned: ' + entries.length + ' | mentions of another row: ' + hits.length + ' (self ' + own + ')');
console.log('edges from explicit wording: ' + edgePairs.length + ' distinct | already in master: ' + (edgePairs.length - fresh.length) + ' | NEW: ' + fresh.length);
console.log('rows gaining a NEW edge: ' + new Set(fresh.map((p) => KEY(p.a))).size);
console.log('plain cross references (not written): ' + Object.keys(mention).length + ' rows, ' + Object.values(mention).reduce((n, s) => n + s.size, 0) + ' pairs, ' + dup + ' duplicate hits ignored');
for (const id of Object.keys(byRule).sort((a, b) => byRule[b].length - byRule[a].length)) {
  const arr = byRule[id];
  const nw = arr.filter((h) => { const a = h.dir === 'parts' ? h.target : h.row, b = h.dir === 'parts' ? h.row : h.target; return !known.has(KEY(a) + '|' + KEY(b)); }).length;
  console.log('  rule ' + id.padEnd(9) + String(arr.length).padStart(5) + ' hits (' + nw + ' new)  e.g. ' + arr.slice(0, 3).map((h) => h.row + ' [' + h.dir + '] → ' + h.target + ' «…' + h.before.slice(-16) + '»').join('   '));
}
if (process.argv.indexOf('--mentions') >= 0) {
  const seen2 = {};
  let k2 = 0;
  console.log('\n==== sample of plain cross references ====');
  for (const h of hits) {
    if (h.rule !== 'plain') continue;
    const k = KEY(h.row) + '|' + KEY(h.target);
    if (seen2[k]) continue;
    seen2[k] = 1;
    console.log('  ' + h.row.padEnd(14) + ' ~ ' + h.target.padEnd(14) + '  «…' + h.before + ' ' + h.target + '»');
    if (++k2 >= 40) break;
  }
}
const wantRule = (process.argv.filter((a) => a.indexOf('--rule=') === 0)[0] || '').replace('--rule=', '');
const wantRow = (process.argv.filter((a) => a.indexOf('--row=') === 0)[0] || '').replace('--row=', '');
if (wantRow) {
  console.log('\n==== every hit of row ' + wantRow + ' ====');
  for (const h of hits) if (KEY(h.row) === KEY(wantRow)) console.log('  → ' + h.target.padEnd(14) + ' [' + h.rule + '/' + h.dir + ']  before=«' + h.before + '»  slim=«' + h.slim + '»');
}
if (wantRule) {
  console.log('\n==== every hit of rule ' + wantRule + ' ====');
  for (const h of hits) if (h.rule === wantRule) console.log('  ' + h.row.padEnd(14) + ' [' + h.dir + '] → ' + h.target.padEnd(14) + '  «…' + h.before + ' ' + h.target + '»');
}

console.log('\n==== sample of NEW edges ====');
let n = 0;
const seen = {};
for (const p of fresh) {
  const k = KEY(p.a) + '|' + KEY(p.b);
  if (seen[k]) continue;
  seen[k] = 1;
  const h = hits.find((x) => (x.dir === 'parts' ? x.target : x.row) === p.a && x.target && (x.dir === 'parts' ? x.row : x.target) === p.b && x.rule !== 'plain');
  console.log('  ' + p.a.padEnd(14) + ' → ' + p.b.padEnd(14) + ' [' + (h ? h.rule : '?') + ']  «…' + (h ? h.before + ' ' + h.target : '') + '»');
  if (++n >= 45) break;
}

if (WRITE) {
  const out = {};
  for (const a of Object.keys(edge)) {
    const list = [...edge[a]].filter((t) => idxByKey.has(KEY(t)) && KEY(t) !== KEY(a));
    if (list.length) out[idxByKey.get(KEY(a)).idx] = list;
  }
  fs.writeFileSync(RAW + '/parts/rel_scan.json', JSON.stringify({ note: 'relations recovered from the sourced descriptions by rel_scan.cjs (explicit wording + vehicle/component direction)', usedOn: out }, null, 1), 'utf8');
  const mout = {};
  for (const r of Object.keys(mention)) mout[r] = [...mention[r]];
  fs.writeFileSync(RAW + '/parts/rel_mentions.json', JSON.stringify({ note: 'plain cross references recovered from the descriptions (row text names another row)', mentions: mout }, null, 1), 'utf8');
  let tot = 0;
  for (const r of Object.keys(out)) tot += out[r].length;
  let mtot = 0;
  for (const r of Object.keys(mout)) mtot += mout[r].length;
  console.log('\nwritten _raw/parts/rel_scan.json: ' + Object.keys(out).length + ' rows, ' + tot + ' edges');
  console.log('written _raw/parts/rel_mentions.json: ' + Object.keys(mout).length + ' rows, ' + mtot + ' cross references');
}
