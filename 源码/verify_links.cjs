// audit the two-way component layer inside a delivery page payload.
// usage: node _raw/verify_links.cjs [path-to-grau_index.html]
const fs = require('fs');
const FILE = process.argv[2] || 'D:/DsHs/grau/grau_index.v1.4.2.2/grau_index.html';
const html = fs.readFileSync(FILE, 'utf8');
const m = html.match(/<script id="grau-data"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error('payload not found'); process.exit(1); }
const D = JSON.parse(m[1]);
const rows = D.E;
console.log('entries: ' + rows.length);

const idxOf = new Map();
rows.forEach(function (r) { idxOf.set(String(r[0]), r); });

// a clickable chip runs a search, so a link target does not have to equal a row key: any target the
// row's alias line answers to finds the row too. Fold both sides the way the page does
// (punctuation -> space, ё -> е) and compare squashed, so "АК74Н" meets the alias "АК-74Н".
const FOLDMAP = { а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's' };
function fold(s) {
  return String(s || '').toLowerCase()
    .replace(/[^\wа-яё\u0451]+/g, ' ')
    .replace(/[авеёкмнорстухіјѕ]/g, function (c) { return FOLDMAP[c] || c; })
    .replace(/\s+/g, ' ').trim();
}
const squash = function (s) { return fold(s).replace(/ /g, ''); };
const aliasOf = new Map();
rows.forEach(function (r) { (r[11] || []).forEach(function (a) { const k = squash(a); if (k && !aliasOf.has(k)) aliasOf.set(k, String(r[0])); }); });
let aliasResolved = 0;
function resolveTarget(v) {
  const s = String(v);
  if (idxOf.has(s)) return s;
  const hit = aliasOf.get(squash(s));
  if (hit) { aliasResolved++; return hit; }
  return null;
}

let withUsed = 0, withParts = 0, withAka = 0, usedN = 0, partsN = 0, akaN = 0;
let danglingUsed = 0, danglingParts = 0, selfRef = 0;
const asym = [];
rows.forEach(function (r) {
  const id = String(r[0]);
  const aka = r[11] || [], used = r[12] || [], made = r[13] || [];
  if (aka.length) { withAka++; akaN += aka.length; aka.forEach(function (v) { if (String(v) === id) selfRef++; }); }
  if (used.length) { withUsed++; usedN += used.length; }
  if (made.length) { withParts++; partsN += made.length; }
  used.forEach(function (v) {
    const t = resolveTarget(v);
    if (!t) { danglingUsed++; if (danglingUsed <= 12) console.log('  dangling usedOn: ' + id + ' -> ' + v); return; }
    const back = (idxOf.get(t)[13] || []).map(String);
    if (back.indexOf(id) < 0) asym.push(id + ' -> ' + v);
  });
  made.forEach(function (v) {
    const t = resolveTarget(v);
    if (!t) { danglingParts++; if (danglingParts <= 12) console.log('  dangling parts: ' + id + ' -> ' + v); return; }
    const back = (idxOf.get(t)[12] || []).map(String);
    if (back.indexOf(id) < 0) asym.push('(' + id + ' parts ' + v + ')');
  });
});
console.log('aka: rows ' + withAka + ' links ' + akaN + ' | self-referencing aliases ' + selfRef);
console.log('usedOn: rows ' + withUsed + ' links ' + usedN + ' | resolvable via alias ' + aliasResolved + ' | dangling ' + danglingUsed);
console.log('parts: rows ' + withParts + ' links ' + partsN + ' | dangling ' + danglingParts);
console.log('one-way links (no reciprocal entry): ' + asym.length);
asym.slice(0, 20).forEach(function (s) { console.log('  ' + s); });

// ammunition coverage: how many ballistic/high-explosive round rows point at a gun or vehicle
const ROUND = /^(?:3[А-ЯЁ]{1,3}\d|9М\d|4[ЖБГХ]\d|7П\d|УБР|5[3-8]-|А[34]-|ОФ-|Ф-\d|БР-\d)/;
const WEAPON = /^(?:2[АБС]\d|9К\d|9П\d|9А\d|6[ПГВ]\d|Т-|БМП|БМД|БТР|БРМ|БМ-|АГС|РПГ|ГМ-|МТ-|СПГ|ЗУ-)/;
const rounds = rows.filter(function (r) { return ROUND.test(String(r[0])); });
const roundsLinked = rounds.filter(function (r) { const u = r[12] || []; return u.some(function (v) { return WEAPON.test(String(v)); }); });
const weapons = rows.filter(function (r) { return WEAPON.test(String(r[0])); });
const weaponsLinked = weapons.filter(function (r) { const p = r[13] || []; return p.some(function (v) { return ROUND.test(String(v)); }); });
console.log('rounds ' + rounds.length + ' -> linked to a weapon: ' + roundsLinked.length + ' (' + Math.round(roundsLinked.length / rounds.length * 100) + '%)');
console.log('weapons ' + weapons.length + ' -> carrying a round: ' + weaponsLinked.length + ' (' + Math.round(weaponsLinked.length / weapons.length * 100) + '%)');
const unlinked = rounds.filter(function (r) { return !(r[12] || []).length && !(r[13] || []).length; });
console.log('rounds with no link at all: ' + unlinked.length + '  e.g. ' + unlinked.slice(0, 12).map(function (r) { return r[0]; }).join(', '));
