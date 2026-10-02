// parts_add_aliases.cjs — merge reader-facing designations into _raw/parts/manual.json aliases.
// A designation whose row is keyed by its ГРАУ index must answer to the name a reader searches for;
// parts_build.cjs then attaches these to the existing rows. Targets are checked against master.json.
const fs = require('fs');
const RAW = 'D:/DsHs/grau/_raw';
const P = RAW + '/parts/manual.json';
const M = JSON.parse(fs.readFileSync(RAW + '/master.json', 'utf8'));
const KEY = (s) => String(s || '').toLowerCase().replace(/[\s\u00a0]/g, '').replace(/ё/g, 'е');
const known = new Set(M.entries.map((e) => e.idx));
const byKey = new Map(M.entries.map((e) => [KEY(e.idx), e.idx]));

const ADD = {
  '6П20': ['АК-74'],
  '6П34': ['АК-74М'],
  '6П43': ['АК-101'],
  '6П47': ['АК-105'],
  '6П20Н2': ['АК-74Н2'],
  '6П1': ['АКМ', 'АК'],
  '6П1Н': ['АКМН'],
  '6П1Н2': ['АКМН2'],
  '6П6': ['ПК'],
  '6П6МН': ['ПКМН'],
  '6П6МН2': ['ПКМН2'],
  '6П2': ['РПК'],
  '6П2Н': ['РПКН'],
  '6П2Н2': ['РПКН2'],
  '6П18Н': ['РПК-74Н'],
  '6П18Н2': ['РПК-74Н2'],
  '6В1': ['СВД'],
  '6В1Н': ['СВДН'],
  '6В1Н2': ['СВДН2'],
  '6Г1': ['РПГ-7'],
  '6Г3': ['РПГ-7В'],
  '6Г3Н2': ['РПГ-7Н2'],
  '6П33': ['АН-94'],
  '6П41': ['Печенег'],
  '6П29': ['ВСС'],
  '6П30': ['АС', 'АС «Вал»'],
  '2А19': ['Т-12'],
  '2А29': ['МТ-12'],
  '9К37': ['Бук'],
  '9К330': ['Тор'],
  '2А6': ['ЗСУ-23-4', 'Шилка'],
  'С-60': ['52-П-281'],
  'ИС-3М': ['ИС-3'],
};

const J = JSON.parse(fs.readFileSync(P, 'utf8'));
J.aliases = J.aliases || {};
let added = 0, missing = 0;
for (const target of Object.keys(ADD)) {
  const real = known.has(target) ? target : byKey.get(KEY(target));
  if (!real) { console.log('!! target row missing in master: ' + target); missing++; continue; }
  const arr = J.aliases[real] || (J.aliases[real] = []);
  for (const a of ADD[target]) if (arr.indexOf(a) < 0) { arr.push(a); added++; }
}
fs.writeFileSync(P, JSON.stringify(J, null, 2) + '\n', 'utf8');
console.log('aliases added: ' + added + ' | unknown targets: ' + missing + ' | rows in alias map: ' + Object.keys(J.aliases).length);
