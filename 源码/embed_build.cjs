// Build the self-contained page: every thumbs/... reference is replaced by an inline
// data: URI, so the single HTML file shows all pictures without the thumbs folder.
//   node _raw/embed_build.cjs
// In : D:/DsHs/grau/grau_index.v1.2/grau_index.linked.html  (folder-based page)
//      D:/DsHs/grau/_raw/embed512/<NNNN>.jpg                (re-encoded small copies)
//      D:/DsHs/grau/_raw/embed_items.txt                    (reference order)
// Out: D:/DsHs/grau/grau_index.v1.2/grau_index.html         (self-contained page)
const fs = require('fs');
const path = require('path');
const DIR = process.env.GRAU_DIR || 'D:/DsHs/grau/grau_index.v1.4.2';
const CACHE = 'D:/DsHs/grau/_raw/embed512';
const SRC = DIR + '/grau_index.linked.html';
const OUT = DIR + '/grau_index.html';

const items = fs.readFileSync('D:/DsHs/grau/_raw/embed_items.txt', 'utf8').split('\n').filter((s) => s.trim());
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const uri = new Map();
let small = 0;
let raw = 0;
// the cache is keyed by file name (never by position: the reference order changes
// whenever the wiki layer grows, which used to shift every cached picture by a slot)
items.forEach((ref) => {
  const c = path.join(CACHE, ref.split('/').pop().replace(/\.[^.]+$/, '') + '.jpg');
  if (fs.existsSync(c)) {
    uri.set(ref, 'data:image/jpeg;base64,' + fs.readFileSync(c).toString('base64'));
    small++;
  } else {
    const ext = path.extname(ref).toLowerCase();
    const b = fs.readFileSync(path.join(DIR, ref));
    uri.set(ref, 'data:' + (MIME[ext] || 'application/octet-stream') + ';base64,' + b.toString('base64'));
    raw++;
  }
});

let html = fs.readFileSync(SRC, 'utf8');
let hits = 0;
let unknown = 0;
html = html.replace(/thumbs\/[^"'\s\]]+/g, (m) => {
  const u = uri.get(m);
  if (!u) { unknown++; return m; }
  hits++;
  return u;
});
fs.writeFileSync(OUT, html, 'utf8');

const left = (html.match(/thumbs\//g) || []).length;
console.log('inlined (re-encoded): ' + small + ' | inlined (original bytes): ' + raw);
console.log('replacements: ' + hits + ' | unresolved: ' + unknown + ' | thumbs/ left: ' + left);
console.log('written ' + OUT + ' ' + (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB');
