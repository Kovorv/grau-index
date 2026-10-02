// Unify the nickname glosses that p1..p6 rendered differently for the same Russian base word.
// Rule = [base word, old Chinese head, new Chinese head]; the suffix is preserved verbatim.
const fs = require('fs');
const RAW = 'D:\\DsHs\\grau\\_raw';

const RULES = [
  ['Рубеж', '界线', '边界'],
  ['Точка', '点', '圆点'],
  ['Скат', '鳐鱼', '鳐'],
  ['Купол', '圆顶', '穹顶'],
  ['Луч', '射线', '光束'],
  ['Кристалл', '晶体', '水晶'],
  ['Барк', '树皮', '巴克'],
  ['Фуркэ', '富尔克', '富尔凯'],
  ['Багет', '线脚', '巴格特'],
  ['Тракт', '轨迹', '路径'],
  ['Контроль', '监察', '监督'],
];

const refs = JSON.parse(fs.readFileSync(RAW + '\\refs.json', 'utf8'));

function base(s) {
  let b = s;
  for (let i = 0; i < 3; i++) {
    const t = b.replace(/-[^-]*$/, '');
    if (!t || t === b) break;
    b = t;
  }
  return b.replace(/[\s\-]+$/, '');
}
function head(zh) {
  return String(zh || '').split(/[-–—\s]/)[0].replace(/[0-9]+$/, '');
}

let changed = 0;
for (const [b, oldHead, newHead] of RULES) {
  for (const n of refs.nicks) {
    if (base(n.s) !== b || head(n.zh) !== oldHead) continue;
    const h = head(n.zh);
    n.zh = String(n.zh).replace(h, newHead);
    changed++;
  }
}
console.log('unified glosses: ' + changed + ' entries over ' + RULES.length + ' base words');
if (process.argv.includes('--write')) {
  fs.writeFileSync(RAW + '\\refs.json', JSON.stringify(refs));
  console.log('wrote refs.json');
} else {
  console.log('(dry run — pass --write)');
}
