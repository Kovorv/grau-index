// Assemble build_v1.cjs = (head of the current file, up to the v1 banner) + build_v1_tail.cjs
const fs = require('fs');
const DIR = 'D:/DsHs/grau/_raw/';
const cur = fs.readFileSync(DIR + 'build_v1.cjs', 'utf8');
const marker = '//  v1 page: ONE self-contained file';
const i = cur.indexOf(marker);
if (i < 0) throw new Error('v1 banner not found in build_v1.cjs');
const head = cur.slice(0, i);
const tail = fs.readFileSync(DIR + 'build_v1_tail.cjs', 'utf8');
fs.writeFileSync(DIR + 'build_v1.cjs', head + tail, 'utf8');
console.log('assembled: head', head.split('\n').length, 'lines + tail', tail.split('\n').length, 'lines');
