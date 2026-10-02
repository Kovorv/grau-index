// Merge the component-layer sources into _raw/parts.json:
//   _raw/parts/manual.json     — curated starter records and hand-made links
//   _raw/parts/res_optics.json — researched optical devices
//   _raw/parts/res_mech.json   — researched electromechanical units
//
// Rules
//   * every new row must carry a source URL (公开来源可查即收);
//   * a researched code whose ГРАУ index already has a master row does NOT become a
//     second row: it turns into an alias of that row and its usedOn links are attached there;
//   * duplicates are merged by normalised code, keeping the best confidence and all links.
const fs = require('fs');
const RAW = 'D:/DsHs/grau/_raw';
const { typeOf } = require('./classify.cjs');

const KEY = (s) => String(s || '').toLowerCase().replace(/[\s\u00a0]/g, '').replace(/ё/g, 'е');
// a designation worth its own row: Cyrillic + at least one digit (ТПН-3, ТКН-1СМ, 1ПН96МТ-02,
// ТШС-32ПВ, БУ-25-2С). Pure words (НСПУ, Сосна-У) and calibre forms (АПО-14,5) are not keys —
// they reach the reader as aliases of the row that carries their ГРАУ index instead.
// index-shaped codes (ТПН-3, 1ПН51, 2Э28М) plus *named* designations the research verified
// against a real source («Сосна-У», «Плиса», ТКН-ХХ, НСПУМ). Pure short words like НСПУ or the
// calibre-style АПО-14,5 stay out: as row keys they would match ordinary prose too often.
const SHAPE = /^(?=[^А-ЯЁ]*[А-ЯЁ])(?=.*\d)[А-ЯЁ0-9][А-ЯЁ0-9-]{1,17}$/i;
const SHAPE_NAME = /^(?:[А-ЯЁ]{1,6}-[А-ЯЁ]{1,3}|[А-ЯЁ][а-яё]{2,12}(?:-[А-ЯЁа-яё0-9]{1,3})?|[А-ЯЁ]{4,8}|[А-ЯЁ0-9]{1,4}\.[0-9]{2,3}\.[0-9]{2,3})$/;
// three-letter designations the generic rules above are too strict for, each one confirmed by an
// opened source: МТУ — танковый мостоукладчик (объект 421, ru.wikipedia).
const SHAPE_ALLOW = ['МТУ'];
const shaped = (c) => {
  const s = String(c || '');
  if (SHAPE_ALLOW.indexOf(s.toUpperCase()) >= 0) return true;
  return SHAPE.test(s) || SHAPE_NAME.test(s);
};
// "Т-62 (модернизированные)" is a note, not a searchable name — drop the qualifier so the
// clickable usedOn chip actually finds the equipment.
const san = (t) => String(t || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

const masterIdx = new Set();
const partIdx = new Set();                 // rows this layer created on an earlier run
const M = loadJson(RAW + '/master.json', { entries: [] });
for (const e of M.entries) { masterIdx.add(KEY(e.idx)); if (e.part) partIdx.add(KEY(e.idx)); }

const MANUAL = loadJson(RAW + '/parts/manual.json', { newRows: [], aliases: {}, usedOn: {} });
// `unit` items are whole pieces of equipment (БРМ-1К, СД-44), `optic`/`mech` are their sub-units.
// All of them are keyed by the product designation the reader actually searches for; only the
// kind differs, and the type column follows the ordinary keyword rules for `unit`.
const files = [
  { name: 'manual.json', items: MANUAL.newRows || [] },
  { name: 'res_optics.json', items: (loadJson(RAW + '/parts/res_optics.json', {}).items) || [] },
  { name: 'res_mech.json', items: (loadJson(RAW + '/parts/res_mech.json', {}).items) || [] },
  { name: 'res_equip.json', items: (loadJson(RAW + '/parts/res_equip.json', {}).items) || [] },
  { name: 'res_guns.json', items: (loadJson(RAW + '/parts/res_guns.json', {}).items) || [] },
  { name: 'res_9s13.json', items: (loadJson(RAW + '/parts/res_9s13.json', {}).items) || [] },
  { name: 'res_links.json', items: (loadJson(RAW + '/parts/res_links.json', {}).items) || [] },
  { name: 'res_platforms.json', items: (loadJson(RAW + '/parts/res_platforms.json', {}).items) || [] },
];
// relations the research files established for rows that already exist:
//   { "<existing idx>": ["<equipment it is mounted on>"] }
const fileLinks = {};
for (const f of files) {
  const L = (loadJson(RAW + '/parts/' + f.name, {}).links) || {};
  for (const t of Object.keys(L)) (fileLinks[t] || (fileLinks[t] = [])).push(...(L[t] || []));
}

const rows = new Map();   // KEY(code) -> row
const alias = {};         // target idx -> [aliases]
const links = {};         // target idx -> [usedOn]
const skipped = [];
let read = 0;

function addAlias(target, a) {
  if (!target || !a) return;
  const arr = alias[target] || (alias[target] = []);
  if (arr.indexOf(a) < 0) arr.push(a);
}
// link targets that no row answers to are a dead click (`_raw/parts/dangling_map.json`, built by
// auditing the delivered page): `normalize` rewrites a target onto the row that really exists,
// `drop` removes a "target" that is not a designation at all (e.g. «машины управления»).
const DMAP = loadJson(RAW + '/parts/dangling_map.json', { normalize: {}, drop: [], dropEdges: [] });
const NORM = DMAP.normalize || {};
const DROPS = new Set((DMAP.drop || []).map((d) => KEY(d)));
// `dropEdges` kills one specific bogus relation ("<owner>|<target>") without touching the rest of
// that target's links — e.g. 3М30 (Булава) writes «ракета комплекса Д-30», where Д-30 is the same
// missile complex, while every other row that says Д-30 means the 122-mm howitzer (row 2А18).
const DEDGES = new Set((DMAP.dropEdges || []).map((p) => KEY(String(p).replace('|', '\u0001'))));
let normN = 0, dropN = 0, edgeN = 0;
function normTarget(u) {
  if (NORM[u]) { normN++; return String(NORM[u]); }
  if (DROPS.has(KEY(u))) { dropN++; return ''; }
  return u;
}
function addLinks(target, list) {
  if (!target || !list || !list.length) return;
  const arr = links[target] || (links[target] = []);
  for (const raw of list) {
    let u = san(raw);
    if (!u) continue;
    if (DEDGES.has(KEY(target) + '\u0001' + KEY(u))) { edgeN++; continue; }
    u = normTarget(u);
    if (!u) continue;
    if (DEDGES.has(KEY(target) + '\u0001' + KEY(u))) { edgeN++; continue; }
    if (KEY(u) === KEY(target)) continue;          // a row never belongs to itself
    if (arr.indexOf(u) < 0) arr.push(u);
  }
}

for (const file of files) {
  console.log('  ' + file.name + ': ' + file.items.length + ' items');
  for (const r of file.items) {
    read++;
    const code = String(r.code || '').trim();
    if (!code) { skipped.push('(empty)'); continue; }
    const cat = String(r.part || r.cat || '').toLowerCase();
    const part = cat === 'optic' ? 'optic' : cat === 'mech' ? 'mech' : cat === 'unit' ? 'unit' : '';
    const src = String(r.src || '').trim();
    const grau = String(r.grau || '').trim();
    const akas = (r.aka || []).map((a) => String(a).trim()).filter(Boolean);
    // a code whose ГРАУ index already owns a row becomes an alias of that row — word-shaped
    // designations (НСПУ -> 1ПН51) included; it never creates a second row for the same hardware.
    // Two exceptions stay rows: the item's own index (1ПН27А is both index and designation) and a
    // target that is itself a component row from an earlier run (that row must not vanish).
    if (grau && masterIdx.has(KEY(grau)) && KEY(grau) !== KEY(code) && !partIdx.has(KEY(grau))) {
      if (/[А-ЯЁ]/i.test(code) && code.length >= 2) addAlias(grau, code);
      for (const a of akas) addAlias(grau, a);
      addLinks(grau, r.usedOn || []);
      continue;
    }
    if (!shaped(code)) { skipped.push(code + ' (shape)'); continue; }
    if (!part) { skipped.push(code + ' (cat?)'); continue; }
    if (!/^https?:\/\//.test(src)) { skipped.push(code + ' (no source)'); continue; }
    const k = KEY(code);
    const usedOn = (r.usedOn || []).map(san).filter(Boolean);
    const uniq = [];
    for (const u of usedOn) if (uniq.indexOf(u) < 0) uniq.push(u);
    const prev = rows.get(k);
    if (prev) {
      for (const u of uniq) if (prev.usedOn.indexOf(u) < 0) prev.usedOn.push(u);
      for (const a of akas) if (prev.aka.indexOf(a) < 0) prev.aka.push(a);
      if (String(r.conf).toUpperCase().slice(0, 1) === 'A') { prev.src = src; prev.conf = 'A'; prev.note = r.note || prev.note; }
      if (!prev.ru && (r.name_ru || r.ru)) prev.ru = String(r.name_ru || r.ru).trim();
      if (!prev.zh && (r.name_zh || r.zh)) prev.zh = String(r.name_zh || r.zh).trim();
      continue;
    }
    const nameRu = String(r.name_ru || r.ru || '').trim();
    const fnRu = String(r.function || '').trim();
    // the researched function text is real sourced content and belongs in the Russian
    // description: it is what makes «привод наведения …» findable as text, not just as a code.
    const ruFull = fnRu && nameRu.indexOf(fnRu) < 0 ? nameRu + ' — ' + fnRu : (nameRu || fnRu);
    // a row keyed by its product designation (СД-44) also answers to its own ГРАУ index (52-П-367С):
    // the index only reaches the reader as a searchable alias when it differs from the row key,
    // otherwise (1ПН27А) it is already the key and an alias would be self-referential.
    const akaRow = grau && KEY(grau) !== k ? akas.concat([grau]) : akas;
    rows.set(k, {
      code: code,
      ru: ruFull,
      zh: String(r.name_zh || r.zh || '').trim(),
      part: part,
      subcat: String(r.subcat || '').trim(),
      fn: fnRu,
      usedOn: uniq,
      aka: akaRow,
      grau: grau,
      maker: String(r.maker || '').trim(),
      years: String(r.years || '').trim(),
      src: src,
      src2: String(r.src2 || '').trim(),
      conf: String(r.conf || 'C').toUpperCase().slice(0, 1),
      note: String(r.note || '').trim(),
    });
  }
}
for (const target of Object.keys(MANUAL.aliases || {})) {
  for (const a of MANUAL.aliases[target]) addAlias(target, a);
}
for (const target of Object.keys(MANUAL.usedOn || {})) addLinks(target, MANUAL.usedOn[target]);
// relations the research files recorded for rows that already exist in the master table
// (`links` in res_*.json: an existing row -> the equipment it is mounted on / based on)
let fileLinkN = 0;
for (const target of Object.keys(fileLinks)) {
  if (!masterIdx.has(KEY(target))) continue;
  const before = (links[target] || []).length;
  addLinks(target, fileLinks[target]);
  fileLinkN += (links[target] || []).length - before;
}

// relations recovered from our own sourced descriptions (parts_alias_scan.cjs):
// "артиллерийский прицел ночной АПН-2" -> 51-ИК-210 also answers to АПН-2
const SCAN = loadJson(RAW + '/parts/alias_scan.json', { aka: {}, usedOn: {} });
let scanAka = 0, scanUsed = 0;
for (const target of Object.keys(SCAN.aka || {})) {
  if (!masterIdx.has(KEY(target))) continue;                    // attach to a row that exists
  for (const a of SCAN.aka[target]) { addAlias(target, a); scanAka++; }
}
for (const target of Object.keys(SCAN.usedOn || {})) {
  if (!masterIdx.has(KEY(target))) continue;
  const before = (links[target] || []).length;
  addLinks(target, SCAN.usedOn[target]);
  scanUsed += (links[target] || []).length - before;
}

// relations recovered from the wording of our own sourced descriptions (rel_scan.cjs):
// "122-мм гаубица Д-32 для САУ 2С1", "МТУ (объект 421, на базе Т-54)", "прицельный комплекс
// в составе СУО 1А33", "ЗУР В-600П для С-125" — the catalogue itself says what belongs to what,
// so a row that names another row must be linked to it. Only strict wording is written; every
// platform row that names a sub-unit gets the edge turned around (see rel_scan.cjs).
const REL = loadJson(RAW + '/parts/rel_scan.json', { usedOn: {} });
let relUsed = 0, relRows = 0;
for (const target of Object.keys(REL.usedOn || {})) {
  if (!masterIdx.has(KEY(target))) continue;
  const before = (links[target] || []).length;
  addLinks(target, REL.usedOn[target]);
  const gained = (links[target] || []).length - before;
  relUsed += gained;
  if (gained) relRows++;
}

// relations recovered from the proper names the catalogue itself quotes (nick_links.cjs):
// «ЗУР комплекса "Панцирь-С1"», «РЛС сопровождения "Роман" ЗПРК "Панцирь-С1"», «станция наведения
// ракет ЗРК "Круг"» — a name always denotes the whole system, so the naming row belongs to it.
const NAMES = loadJson(RAW + '/parts/rel_names.json', { usedOn: {} });
let nickUsed = 0, nickRows = 0;
for (const target of Object.keys(NAMES.usedOn || {})) {
  if (!masterIdx.has(KEY(target))) continue;
  const before = (links[target] || []).length;
  addLinks(target, NAMES.usedOn[target]);
  const gained = (links[target] || []).length - before;
  nickUsed += gained;
  if (gained) nickRows++;
}

// ammunition research (parts/ammo_links_*.json, one file per research round):
//   { "links": { "<idx>": ["<idx>", …] } } — every pair is a real "this round is fired by that
// gun / this missile belongs to that complex / this complex sits on that tank" statement with a
// source in the file's own `sources` map. The files mix the written directions (a gun page lists
// its rounds, a round page names its gun), so every pair is added as written and the final
// direction pass below turns weapon→round pairs around (usedOn always means "this row belongs to
// the other row", see rel_scan.cjs). Row types are NOT used for this: the keyword type column
// files 3ОФ26 under 装甲车辆 and 3ВБК27 under 火炮, so the index shape decides.
const WEAPON_IDX = /^(?:2[АБС]\d|9К\d|9П\d|9А\d|6[ПГВ]\d|Т-|БМП|БМД|БТР|БРМ|БМ-|БМД|АГС|РПГ|ГМ-|МТ-|СПГ|ПТРК|ЗУ-)/;
const ROUND_IDX = /^(?:3[А-ЯЁ]{1,3}\d|9М\d|4[ЖБГХ]\d|7П\d|УБР|5[3-8]-|А[34]-|ОФ-|Ф-\d|БР-\d)/;
const typeByIdx = new Map(M.entries.map((e) => [e.idx, typeOf(e)]));
const AMMO_FILES = fs.readdirSync(RAW + '/parts').filter((f) => /^ammo_links_.*\.json$/.test(f)).sort();
let ammoUsed = 0, ammoRows = 0, ammoDup = 0, ammoBad = 0;
for (const f of AMMO_FILES) {
  const A = loadJson(RAW + '/parts/' + f, { links: {} });
  for (const left of Object.keys(A.links || {})) {
    if (!masterIdx.has(KEY(left))) { ammoBad++; continue; }
    for (const right of A.links[left] || []) {
      if (!masterIdx.has(KEY(right))) { ammoBad++; continue; }
      if (KEY(left) === KEY(right)) continue;
      const before = (links[left] || []).length;
      addLinks(left, [right]);
      const gained = (links[left] || []).length - before;
      if (gained) { ammoUsed += gained; ammoRows++; } else ammoDup++;
    }
  }
}

// final direction pass over every source: a weapon (gun / tank / launcher / complex) never belongs
// to a round — the round is the row that carries the "used on / fired by" edge (the cards show the
// same chip either way, but the columns swap: the gun shows its rounds under 构成部件, the round
// shows its guns under 所属装备).
let dirFlip = 0;
for (const a of Object.keys(links)) {
  if (!WEAPON_IDX.test(a)) continue;
  for (const b of [...links[a]]) {
    if (!ROUND_IDX.test(b)) continue;
    links[a].splice(links[a].indexOf(b), 1);
    addLinks(b, [a]);
    dirFlip++;
  }
  if (!links[a].length) delete links[a];
}

// a row never needs to carry its own index as an alias (the scan does match "прицел 1К13" inside
// the 1К13 row itself) — drop those before they reach the page
let selfAlias = 0;
for (const target of Object.keys(alias)) {
  const kept = alias[target].filter((a) => KEY(a) !== KEY(target));
  selfAlias += alias[target].length - kept.length;
  if (kept.length) alias[target] = kept; else delete alias[target];
}

const newRows = [...rows.values()].sort((a, b) => (a.part === b.part ? a.code.localeCompare(b.code, 'ru') : a.part.localeCompare(b.part)));
const newIdx = new Set(newRows.map((r) => KEY(r.code)));
let dangling = 0;
for (const target of Object.keys(links)) {
  if (masterIdx.has(KEY(target)) || newIdx.has(KEY(target))) continue;
  delete links[target];
  dangling++;
}
const noZh = newRows.filter((r) => !r.zh);
fs.writeFileSync(RAW + '/parts.json', JSON.stringify({
  meta: {
    note: 'Equipment and component layer: whole vehicles/systems (unit), armoured-vehicle optics (optic) and electromechanical sub-units (mech). Row key = the product designation the reader searches for; usedOn lists the equipment a row belongs to.',
    srcName: 'Открытые источники: оборудование и комплектующие',
    built: new Date().toISOString().slice(0, 10),
  },
  newRows: newRows,
  aliases: alias,
  usedOn: links,
}, null, 1), 'utf8');

console.log('parts: read ' + read + ' | new rows ' + newRows.length +
  ' (unit ' + newRows.filter((r) => r.part === 'unit').length +
  ', optic ' + newRows.filter((r) => r.part === 'optic').length +
  ', mech ' + newRows.filter((r) => r.part === 'mech').length + ')' +
  ' | aliases ' + Object.values(alias).reduce((n, a) => n + a.length, 0) + ' on ' + Object.keys(alias).length + ' rows' +
  ' | usedOn links for ' + Object.keys(links).length + ' rows' +
  ' | from descriptions ' + scanAka + ' aliases / ' + scanUsed + ' usedOn' +
  ' | from research links ' + fileLinkN +
  ' | from catalogue wording ' + relUsed + ' edges on ' + relRows + ' rows' +
  ' | from proper names ' + nickUsed + ' edges on ' + nickRows + ' rows' +
  ' | from ammunition research ' + ammoUsed + ' edges on ' + ammoRows + ' rows (' + AMMO_FILES.length + ' file(s), ' + ammoDup + ' already known, ' + ammoBad + ' unknown idx)' +
  ' | weapon→round edges turned around ' + dirFlip +
  ' | link targets normalized ' + normN + ' / dropped ' + dropN + ' / bogus edges dropped ' + edgeN +
  ' | self-aliases dropped ' + selfAlias + ' | dangling usedOn targets dropped ' + dangling);
console.log('  conf A ' + newRows.filter((r) => r.conf === 'A').length + ' / B ' + newRows.filter((r) => r.conf === 'B').length + ' / C ' + newRows.filter((r) => r.conf === 'C').length);
console.log('  from our own descriptions: ' + scanAka + ' aliases, ' + scanUsed + ' usedOn links');
if (noZh.length) console.log('  without Chinese (' + noZh.length + '): ' + noZh.slice(0, 40).map((r) => r.code).join(', '));
if (skipped.length) console.log('  skipped (' + skipped.length + '): ' + skipped.slice(0, 30).join(', '));
console.log('  written _raw/parts.json');
