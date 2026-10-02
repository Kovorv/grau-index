// count the sections of the native TSV payload
const fs = require('fs'), zlib = require('zlib');
const f = process.argv[2] || 'D:\\DsHs\\grau\\_raw\\native\\grau_data.tsv.gz';
const txt = zlib.gunzipSync(fs.readFileSync(f)).toString('utf8');
const c = {};
for (const ln of txt.split('\n')) {
  if (!ln || ln[0] !== '#') continue;
  const k = ln.split('\t')[0];
  c[k] = (c[k] || 0) + 1;
}
console.log(JSON.stringify(c));
console.log('bytes(gz)=' + fs.statSync(f).size);
