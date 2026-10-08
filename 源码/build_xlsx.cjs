// Export the built page data to XLSX (OOXML) with no third-party dependencies:
// a small ZIP writer plus the minimal set of workbook parts.
const fs = require('fs');
const zlib = require('zlib');
const RAW = 'D:/DsHs/grau/_raw';
const { translit } = require('./translit.cjs');

// ---------------------------------------------------------------- ZIP
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const comp = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cd, eocd]);
}

// ---------------------------------------------------------------- sheet XML
const xesc = (s) => String(s == null ? '' : s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function colName(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const STYLE_HEAD = 1, STYLE_WRAP = 2;
function cell(ref, val, style) {
  const st = style ? ' s="' + style + '"' : '';
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') return '<c r="' + ref + '"' + st + '><v>' + val + '</v></c>';
  return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(val) + '</t></is></c>';
}
function sheetXml(headers, rows, widths, wrapFrom) {
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  out.push('<dimension ref="A1:' + colName(headers.length - 1) + (rows.length + 1) + '"/>');
  out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  out.push('<sheetFormatPr defaultRowHeight="14.5"/>');
  out.push('<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>');
  out.push('<sheetData>');
  out.push('<row r="1">' + headers.map((h, i) => cell(colName(i) + '1', h, STYLE_HEAD)).join('') + '</row>');
  rows.forEach((r, ri) => {
    const cells = r.map((v, ci) => cell(colName(ci) + (ri + 2), v, ci >= wrapFrom ? STYLE_WRAP : 0)).join('');
    out.push('<row r="' + (ri + 2) + '">' + cells + '</row>');
  });
  out.push('</sheetData>');
  out.push('<autoFilter ref="A1:' + colName(headers.length - 1) + (rows.length + 1) + '"/>');
  out.push('</worksheet>');
  return out.join('');
}

// ---------------------------------------------------------------- data
const html = fs.readFileSync(process.env.XLSX_IN || 'D:/DsHs/grau/grau-index-zh.html', 'utf8');
const take = (id) => JSON.parse(html.match(new RegExp('<script id="' + id + '"[^>]*>([\\s\\S]*?)</script>'))[1]);
const D = take('grau-data');
const R = take('grau-refs-data');
const TYPE_ZH = {};
for (const t of R.types) TYPE_ZH[t.t] = t.zh;
const ORG_ZH = {};
for (const o of R.orgs) ORG_ZH[o.id] = o.zh;
// language codes -> Chinese names (mirrors LANGNAME in the page client)
const LANG_ZH = {
  ru: '俄文', en: '英文', zh: '中文', uk: '乌克兰文', de: '德文', fr: '法文', pl: '波兰文',
  ja: '日文', ko: '韩文', es: '西班牙文', it: '意大利文', tr: '土耳其文', cs: '捷克文',
  fi: '芬兰文', he: '希伯来文', ar: '阿拉伯文', nl: '荷兰文', sv: '瑞典文', pt: '葡萄牙文',
  rwd: 'RWD 目录', web: '网络图片', g: '维基教科书',
};

const idxRows = D.E.map((e) => {
  const L = e[10] || null;
  const W = (D.W || {})[e[0]] || null;
  return [
    D.S[e[8]] ? (D.S[e[8]].grpZh || '') : '',  // v1.4.6: 体系组（第一级：ГРАУ / Р 无线电 / ПВО / ВВС / ВМФ / РВСН / 设计局 / 老 ГАУ / 其他）
    D.S[e[8]] ? D.S[e[8]].zh : '',            // 序列（中文）
    e[7],                                      // 字头
    TYPE_ZH[e[5]] || e[5],                     // 器材类型
    String(e[6] || '').split(' ').filter(Boolean).map((id) => ORG_ZH[id] || id).join(' / '),
    e[0],                                      // 索引
    e[2] || '',                                // 北约代号
    e[3] || '',                                // 俄文说明
    e[4] || '',                                // 中文说明
    L ? ((D.LS || {})[L[0]] || L[0]) : '',     // 补充来源
    L ? (L[4] === 0 ? '补充编号' : (L[4] === 1 ? '补充说明' : '按出处订正')) : '',
    L ? L[1] : '',                             // 来源链接
    L ? L[2] : '',                             // 原文片段
    W ? W[0] : '',                             // 维基条目
    W ? W[1] : '',                             // 维基链接
    W ? W[2] : '',                             // 维基简介
    W ? (W[7] || 'ru') : '',                   // 语种 / 来源层 (ru,en,zh…,rwd,web)
    W ? ({ v: '维基正文', p: '维基按名', g: '维基教科书', r: 'RWD 目录', w: '网络图片' }[W[6]] || W[6]) : '',
    (function () {                              // 全部可用版本（主条目语言 + 其他语言／图层）
      const alt = D.WL && D.WL[e[0]] ? Object.keys(D.WL[e[0]]) : [];
      const all = W ? [W[7] || 'ru'].concat(alt) : alt;
      return Array.from(new Set(all)).map((l) => LANG_ZH[l] || l).join(', ');
    })(),
    (e[11] || []).join(' '),                    // 代号（aka）
    (e[12] || []).join(' '),                    // 所属装备
    (e[13] || []).join(' '),                    // 构成部件
  ];
});
const abbrRows = R.abbr.filter((a) => a.zh).map((a) => [a.a, a.zh, a.n]);
const nickRows = R.nicks.map((n) => [n.s, n.zh || '', translit(n.s), n.n]);
const orgRows = R.orgs.slice().sort((a, b) => b.n - a.n).map((o) => [o.zh, o.ru, o.city, o.note || '', o.n]);
const typeRows = R.types.map((t) => [t.zh, t.t, t.n]);

// other directorate catalogues (m03497): ГБТУ objects, engineering equipment, old-ГАУ 56/57, МО
const SRCN = { sila: 'русская-сила.рф', bmz: 'bmz.ru', ruwiki: 'ru.wikipedia', ukwiki: 'uk.wikipedia' };
const rdOth = (f) => { const p = RAW + '/gbtu/' + f; return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; };
// Chinese lookup produced by oth_merge.cjs (+ oth_fixnick.cjs for leftover nicknames)
const CAT_ZH = (() => {
  const p = RAW + '/oth_zh/cat_zh.json';
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')), norm = {};
  for (const k of Object.keys(raw)) norm[k.replace(/\s+/g, ' ').trim()] = raw[k];
  return norm;
})();
const tz = (s) => {
  if (!CAT_ZH) return '';
  const k = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return k ? (CAT_ZH[k] || '') : '';
};
const gbtuRows = [];
for (const r of rdOth('gbtu.json')) {
  const srcs = (r.srcs || []).filter((s) => s.desig || s.note);
  if (!srcs.length) { gbtuRows.push([r.key, r.desig || '', r.note || '', '', tz(r.note || '')]); continue; }
  for (const s of srcs) gbtuRows.push([r.key, s.desig || '', s.note || '', SRCN[s.s] || s.s, tz(s.note || '')]);
}
gbtuRows.sort((a, b) => (parseInt(a[0], 10) || 1e6) - (parseInt(b[0], 10) || 1e6) || String(a[0]).localeCompare(String(b[0]), 'ru'));
const giuRows = rdOth('giu_items.json').map((r) => [r.title, r.desig || '', r.section || '', r.purpose || '',
  (r.kvt || []).join(' '), (r.okp || []).join(' '), (r.ekps || []).join(' '), r.adopted || '', r.dev || '', r.page || '',
  tz(r.title), tz(r.section || ''), tz(r.purpose || ''), tz(r.adopted || ''), tz(r.dev || '')]);
const gauRows = rdOth('gau5657.json').map((r) => [r.key, r.note || '', r.eng ? '是' : '', tz(r.note || '')]);
const moRows = rdOth('mo_idx.json').map((r) => [r.key, r.note || '', tz(r.note || '')]);

// ---------------------------------------------------------------- v1.4.1 additions
// Complete bibliography (generated by _raw/build_biblio.cjs) and the disclaimer sheet.
let refRows = [];
let refCount = 0;
try {
  const refs = JSON.parse(fs.readFileSync(process.env.BIBLIO || 'D:/DsHs/grau/_raw/biblio/references.json', 'utf8'));
  refCount = refs.length;
  refRows = refs.map((r) => [r.cat, r.title, r.url || '', r.note || '', r.n || 0]);
} catch (e) { console.log('bibliography not available: ' + e.message); }

const DIS_ZH = [
  ['性质与用途', '本索引是基于公开渠道整理的个人资料汇编，仅供检索、参考与研究使用，不构成任何官方名录、技术文件、采购或作战依据；与俄罗斯国防部、总火箭炮兵部（ГРАУ／ГАУ）及任何军工企业、政府机构均无隶属或合作关系。'],
  ['数据来源', 'russiansila.ru（русская-сила.рф）、500maketov.ru、SALIS3 公开 PDF 目录，以及维基百科（俄／英／中及其他语种）与公开网页；未使用任何非公开资料。'],
  ['准确性与完整性', '索引号、序列归属、器材类型、研制单位等可能存在错漏、重复、推断或过时之处；中文说明多为机器辅助翻译并经人工润色，代号转写亦可能有偏差。一切以俄方原始来源与官方文件为准。'],
  ['图片与版权', '缩略图与卡片文字取自公开网页及维基百科（多为 CC 授权），版权归原作者／权利人所有，此处仅用于条目识别与说明；如权利人认为使用不当，请联系删除。转载本表请保留来源标注与整理者署名。'],
  ['使用限制与合规', '本表不提供任何制造、改装、操作或规避法律的技术指导，仅描述公开的型号与参数；使用者应自行遵守所在国家／地区的法律法规（含出口管制及武器相关法规）。'],
  ['责任限制', '本表按「现状」提供，不附带任何明示或默示担保；因使用或依赖本表内容造成的任何直接或间接损失，整理者不承担责任。'],
  ['纠错与署名', '欢迎指出错误、补充资料，将在后续版本中更正。整理：@科夫罗夫机械（防空妖精哥特羊） · @Deepseek · 三陆问题研究中心。'],
];
const noteRows = [
  ['版本', 'GRAU / ГРАУ 索引系统 v' + (process.env.VER || '1.4.2.2')],
  ['整理', '@科夫罗夫机械（防空妖精哥特羊） · @Deepseek · 三陆问题研究中心'],
  ['索引条目', String(idxRows.length) + ' 条'],
  ['参考文献', String(refCount) + ' 条来源'],
  ['卡片／图片', (process.env.CARDS || '2227') + ' 张卡片 · ' + (process.env.IMGS || '1785') + ' 张缩略图'],
  ['部件层', (process.env.PARTS || '0') + ' 条光学／机电部件条目，与所属装备双向关联（代号／所属装备／构成部件三列）'],
  ['装备层', (process.env.UNITS || '0') + ' 条按产品代号收录的整机装备条目（火炮、车辆等），与所属系统及部件双向关联'],
  ['免责声明', ''],
].concat(DIS_ZH.map((r) => ['  ' + r[0], r[1]])).filter((r) => !(r[0] === '装备层' && (process.env.UNITS || '0') === '0'));

const sheets = [
  { name: '索引总表', headers: ['体系组', '序列', '字头', '器材类型', '研制／生产单位', '索引', '北约代号', '俄文说明', '中文说明', '补充来源', '来源类型', '来源链接', '原文片段', '维基条目', '维基链接', '维基简介', '语种', '条目来源', '全部版本', '代号', '所属装备', '构成部件'], rows: idxRows, widths: [20, 22, 12, 18, 26, 14, 16, 60, 60, 30, 12, 40, 60, 32, 48, 70, 10, 14, 30, 20, 24, 24], wrapFrom: 4 },
  { name: '缩写对照', headers: ['缩写', '中文', '条目数'], rows: abbrRows, widths: [14, 40, 10], wrapFrom: 9 },
  { name: '专名与代号', headers: ['俄文专名', '中文', '拉丁转写', '条目数'], rows: nickRows, widths: [30, 22, 30, 10], wrapFrom: 9 },
  { name: '研制生产单位', headers: ['单位', '俄文', '城市', '备注', '条目数'], rows: orgRows, widths: [34, 34, 14, 40, 10], wrapFrom: 9 },
  { name: '器材类型', headers: ['类型', '代码', '条目数'], rows: typeRows, widths: [26, 18, 10], wrapFrom: 9 },
  { name: 'ГБТУ 对象目录', headers: ['对象号', '军事代号', '说明（按来源）', '来源', '说明（中文）'], rows: gbtuRows, widths: [12, 18, 90, 20, 90], wrapFrom: 2 },
  { name: '工程器材目录', headers: ['名称', '代号', '类别', '用途', 'КВТ МО', 'ОКП', 'ЕКПС', '列装', '研制单位', '页', '名称（中文）', '类别（中文）', '用途（中文）', '列装（中文）', '研制单位（中文）'], rows: giuRows, widths: [42, 16, 22, 70, 14, 14, 22, 40, 40, 8, 42, 22, 70, 40, 40], wrapFrom: 3 },
  { name: 'ГАУ 56-57 老索引', headers: ['索引', '说明', '工程弹药', '说明（中文）'], rows: gauRows, widths: [20, 80, 10, 80], wrapFrom: 1 },
  { name: 'МО 索引', headers: ['索引', '说明', '说明（中文）'], rows: moRows, widths: [20, 80, 80], wrapFrom: 1 },
  { name: '说明', headers: ['项目', '内容'], rows: noteRows, widths: [26, 130], wrapFrom: 1 },
  { name: '参考文献', headers: ['分类', '名称／标题', '链接', '说明', '引用条目'], rows: refRows, widths: [22, 60, 60, 60, 10], wrapFrom: 1 },
];

const CT = (n) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
  '</Types>';

const files = [
  { name: '[Content_Types].xml', data: Buffer.from(CT(), 'utf8') },
  { name: '_rels/.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>', 'utf8') },
  { name: 'xl/workbook.xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => '<sheet name="' + xesc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
      '</sheets></workbook>', 'utf8') },
  { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>', 'utf8') },
  { name: 'xl/styles.xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>', 'utf8') },
];
sheets.forEach((s, i) => {
  files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: Buffer.from(sheetXml(s.headers, s.rows, s.widths, s.wrapFrom), 'utf8') });
});

const outPath = process.env.XLSX_OUT || 'D:/DsHs/grau/grau-index-zh.xlsx';
fs.writeFileSync(outPath, zip(files));
console.log('xlsx written:', outPath, (fs.statSync(outPath).size / 1048576).toFixed(2) + ' MB');
for (const s of sheets) console.log('  sheet "' + s.name + '": ' + s.rows.length + ' rows x ' + s.headers.length + ' cols');
