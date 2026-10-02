const fs = require('fs');
const RAW = 'D:\\DsHs\\grau\\_raw';
const { translit } = require('./translit.cjs');
const { orgsFor, orgRolesFor } = require('./orgmatch.cjs');

const { classify, typeOf, TYPE_ORDER, TYPE_LABEL } = require('./classify.cjs');
const ORGS = require('./orgs.cjs');
const ABBR = require('./abbr.cjs');

const master = JSON.parse(fs.readFileSync(RAW + '\\master.json', 'utf8'));

// late Chinese translations
const zhExtra = new Map();
for (const [dir, man, pad] of [['i18n2', 'manifest.json', 4], ['i18n3', 'manifest.json', 4]]) {
  const p = RAW + '\\' + dir + '\\' + man;
  if (!fs.existsSync(p)) continue;
  JSON.parse(fs.readFileSync(p, 'utf8')).forEach((idxs, i) => {
    const f = RAW + '\\' + dir + '\\zh-' + String(i + 1).padStart(2, '0') + '.txt';
    if (!fs.existsSync(f)) return;
    const m = new Map();
    for (const line of fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
      const t = line.indexOf('\t');
      if (t > 0) m.set(line.slice(0, t).trim(), line.slice(t + 1).trim());
    }
    idxs.forEach((idx, k) => {
      const v = m.get(String(k + 1).padStart(pad, '0'));
      if (!v) return;
      const bar = v.indexOf(' | ');
      zhExtra.set(idx, bar >= 0 ? v.slice(bar + 3).trim() : v.trim());
    });
  });
}
for (const e of master.entries) if (!e.zh && zhExtra.has(e.idx)) e.zh = zhExtra.get(e.idx);

// classify + organisations + abbreviations + nicknames
// wiki-derived organisations (Wikipedia infoboxes, see org_wiki_apply.cjs) are merged in;
// text matching stays authoritative for roles it already decided.
let WIKIORG = {};
try { WIKIORG = JSON.parse(require('fs').readFileSync(__dirname + '/wiki_orgs.json', 'utf8')); }
catch (e) { console.log('wiki org layer: none (' + e.code + ')'); }
let wikiAdded = 0;
for (const e of master.entries) {
  e.type = typeOf(e);
  const hay = (e.idx + ' ' + (e.ru || '') + ' ' + (e.zh || '')).toLowerCase();
  e.orgs = orgsFor(e.idx, e.ru, e.zh);
  e.orgRoles = orgRolesFor(e.idx, e.ru, e.zh);
  const wo = WIKIORG[e.idx];
  if (wo) {
    e.wikiOrgs = Object.keys(wo);
    for (const id of e.wikiOrgs) {
      if (e.orgs.indexOf(id) < 0) { e.orgs.push(id); wikiAdded++; }
      const r = wo[id];
      e.orgRoles[id] = e.orgRoles[id] === 'dm' || (e.orgRoles[id] && r !== e.orgRoles[id]) ? 'dm' : r;
    }
  }
  const set = new Set();
  for (const mm of (e.ru || '').matchAll(/[«"<]([А-ЯЁ][А-Яа-яЁё0-9\-\s]{2,24})[»">]/g)) set.add(mm[1].trim());
  e.nicks = [...set];
  const abs = new Set();
  for (const mm of (e.ru || '').matchAll(/[^0-9А-ЯЁ]([А-ЯЁ]{2,6})(?![0-9А-ЯЁа-яё])/g)) {
    const a = mm[1];
    if (ABBR[a]) abs.add(a);
  }
  e.abbrs = [...abs];
}

const stats = {
  withOrg: master.entries.filter((e) => e.orgs.length).length,
  withNick: master.entries.filter((e) => e.nicks.length).length,
  withAbbr: master.entries.filter((e) => e.abbrs.length).length,
};
console.log('entries:', master.entries.length, '| with org:', stats.withOrg, '| with nickname:', stats.withNick, '| with known abbr:', stats.withAbbr);
console.log('organisations from the wiki infobox layer:', Object.keys(WIKIORG).length, 'rows |', wikiAdded, 'additional links');

const byOrg = {};
for (const o of ORGS) byOrg[o.id] = master.entries.filter((e) => e.orgs.includes(o.id));
console.log('\ntop organisations:');
for (const o of ORGS.slice().sort((a, b) => byOrg[b.id].length - byOrg[a.id].length).slice(0, 18)) {
  console.log('  ' + o.id.padEnd(16), String(byOrg[o.id].length).padStart(5), o.zh, '(' + o.city + ')');
}

// abbreviation frequency, verified against the data
const abFreq = {};
for (const e of master.entries) for (const a of e.abbrs) abFreq[a] = (abFreq[a] || 0) + 1;
console.log('\ntop abbreviations in data:');
console.log(Object.entries(abFreq).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => k + '(' + v + ')').join(' '));

// nickname inventory
const nickFreq = {};
for (const e of master.entries) for (const n of e.nicks) nickFreq[n] = (nickFreq[n] || 0) + 1;
console.log('\nnicknames found:', Object.keys(nickFreq).length);
console.log(Object.entries(nickFreq).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + '(' + v + ')').join(' '));

fs.writeFileSync(RAW + '\\refs.json', JSON.stringify({
  orgs: ORGS.map((o) => ({ id: o.id, zh: o.zh, ru: o.ru, city: o.city, note: o.note, n: byOrg[o.id].length })),
  abbr: Object.entries(abFreq).sort((a, b) => b[1] - a[1]).map(([a, n]) => ({ a, zh: ABBR[a] || '', n })),
  nicks: Object.entries(nickFreq).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ s, n })),
  types: TYPE_ORDER.filter((t) => master.entries.some((e) => e.type === t)).map((t) => ({ t, zh: TYPE_LABEL[t], n: master.entries.filter((e) => e.type === t).length })),
}, null, 1), 'utf8');
console.log('\nwrote refs.json');
