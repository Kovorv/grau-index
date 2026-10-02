// ---------------------------------------------------------------------------------------
// v1 client: bilingual (中文 / Русский) inside one file, two views (索引总表 / 详查索引),
// with the reference view held to the same standard as the main table.
// ---------------------------------------------------------------------------------------
var S = JSON.parse(document.getElementById('grau-data').textContent);
var SER = S.S, ALL = S.E, W = S.W || {}, WL = S.WL || {}, OTH = S.O || null, TZ = S.TZ || null, DZ = S.DZ || null;
var REFS = JSON.parse(document.getElementById('grau-refs-data').textContent);
// v1.4.2.1: 字头含义层——每个索引字头（1ПН／2А／Р…）与每个序列（局号）一句解释，逐条带来源。
var PGL = (S.PG && S.PG.letters) || {}, PGD = (S.PG && S.PG.depts) || {}, PGGEN = (S.PG && S.PG.generic) || [];

var LANG = 'zh', latMode = false, q = '', F = { series: 'all', fam: 'all', type: 'all', org: 'all', lit: 'all', wiki: 'all' };
var familyOpen = {}, lastGroups = [], VIEW = 'index';
var refsSort = { abbr: 'count', nick: 'count', org: 'count', type: 'count' };
var refsOpen = { abbr: true, nick: true, org: true, type: true };

function tt(k) { return STR[LANG][k]; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function typeLabel(id) { return LANG === 'zh' ? (TYPE_ZH[id] || id) : (TYPE_RU[id] || id); }
function orgLabel(id) { return LANG === 'zh' ? (ORG_ZH[id] || id) : (ORG_RU[id] || id); }
function seriesLabel(i) { var s = SER[i]; return s ? (LANG === 'zh' ? s.zh : s.ru) : ''; }
function seriesShort(i) {
  var s = SER[i]; if (!s) return '';
  // v1.4.5: 大类＝索引体系，短标签由数据层给出（«ПВО 反序6»、«第1类»、«产品代号»…）
  if (s.shortZh) return LANG === 'zh' ? s.shortZh : (s.shortRu || s.shortZh);
  return s.kind === 'num' ? (LANG === 'zh' ? '第' + s.n + '类' : 'Гр.' + s.n)
    : (LANG === 'zh' ? '字母族 ' + s.letter : 'Серия ' + s.letter);
}
function natCmp(a, b) { return String(a).localeCompare(String(b), 'ru', { numeric: true }); }
// 每个条目的一句显眼中文：中文说明的第一句（无中文时退回俄文），过长则截断
function zhPhrase(e) {
  var s = String(e[4] || e[3] || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  var m = s.match(/^[^。；;]{4,140}?[。；;]/);
  if (m) s = m[0];
  if (s.length > 52) s = s.slice(0, 52).replace(/[\s,，、.。;；:：\-—]+$/, '') + '…';
  return s;
}
function serChipHTML(e) {
  var s = SER[e[8]]; if (!s) return '';
  return '<i class="sern" title="' + esc(seriesLabel(e[8])) + '">' + esc(seriesShort(e[8])) + '</i>';
}
// ---------- v1.4.2.1: 字头含义 ----------
// prefRec: 先查逐字头词条，再查序列（局号）词条——老 ГАУ 的字头就是局号 51…58——最后退回 generic 规则
function prefRec(p) {
  if (PGL[p]) return PGL[p];
  if (PGD[p]) return PGD[p];
  for (var i = 0; i < PGGEN.length; i++) {
    try { if (new RegExp(PGGEN[i].pattern).test(p)) return PGGEN[i]; } catch (e) {}
  }
  return null;
}
function prefMean(p) {
  var r = prefRec(p); if (!r) return '';
  return LANG === 'zh' ? (r.zh || r.ru || '') : (r.ru || r.zh || '');
}
function prefSrc(p) { var r = prefRec(p); if (!r) return ''; return (r.src || '') + (r.quote ? '：' + r.quote : ''); }
// v1.4.2.1: 字头含义的「短形」——只在足够短时内联到字头按钮上（长句/待考长文只留悬停提示）
function prefShort(p) {
  var r = prefRec(p); if (!r) return '';
  var s = LANG === 'zh' ? (r.zh || r.ru || '') : (r.ru || r.zh || '');
  if (!s || s.length > (LANG === 'zh' ? 14 : 30)) return '';
  return s;
}
// chip / 行的 title：字头 — 含义（来源）
function prefTip(p) {
  var r = prefRec(p); if (!r) return '';
  var out = p + ' — ' + prefMean(p);
  if (r.conf === 'C') out += LANG === 'zh' ? '（整理者推断，未见公开来源）' : ' (предположение составителя)';
  if (r.src) out += '\n' + r.src + (r.quote ? '\n' + r.quote : '');
  return out;
}
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

// ---------- filters ----------
function setFilter(kind, val) {
  F[kind] = val;
  var box = document.getElementById('f-' + kind);
  if (box) [].slice.call(box.querySelectorAll('.fk')).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === val); });
  if (kind === 'series' || kind === 'type' || kind === 'org') populateFams();
  updateRowVals();
  if (typeof renderFilterBar === 'function') renderFilterBar();
  render();
}
var famBox, famFilter = '', famGrpOpen = {};
function famKey(sk, p) { return sk + '\u0001' + p; }
function seriesFamilyCounts() {
  var out = {};
  ALL.forEach(function (e) {
    var k = SER[e[8]].key;
    if (F.series !== 'all' && k !== F.series) return;
    if (F.type !== 'all' && e[5] !== F.type) return;
    if (F.org !== 'all' && (' ' + e[6] + ' ').indexOf(' ' + F.org + ' ') < 0) return;
    out[famKey(k, e[7])] = (out[famKey(k, e[7])] || 0) + 1;
  });
  return out;
}
// 字头不再平铺：按大类分组，先只看到大类，展开后才列出该类的字头
function populateFams() {
  if (!famBox) return;
  var counts = seriesFamilyCounts();
  var groups = [];
  SER.forEach(function (s, i) {
    var items = (s.prefixes || []).filter(function (p) { return counts[famKey(s.key, p)]; });
    if (famFilter) items = items.filter(function (p) { return p.toLowerCase().indexOf(famFilter) >= 0; });
    if (!items.length) return;
    items.sort(natCmp);
    var n = 0; items.forEach(function (p) { n += counts[famKey(s.key, p)]; });
    groups.push({ i: i, s: s, items: items, n: n });
  });
  var openAll = !!famFilter && groups.length <= 8;
  var html = '', lastGrp = '';
  groups.forEach(function (g) {
    var gk = g.s.grp || '';
    if (gk !== lastGrp) {                                  // v1.4.6: 第一级＝索引体系组（ГРАУ / Р 无线电 / ПВО / …）
      lastGrp = gk;
      html += '<span class="grptag">' + esc(LANG === 'zh' ? (g.s.grpZh || gk) : (g.s.grpRu || gk)) + '</span>';
    }
    var open = famGrpOpen[g.s.key] !== undefined ? famGrpOpen[g.s.key] : (F.series === g.s.key || openAll);
    var out = '<span class="famgrp"><button type="button" class="fk grp' + (F.series === g.s.key ? ' on' : '') +
      '" data-g="' + esc(g.s.key) + '" title="' + esc(seriesLabel(g.i)) + '"><i class="car">' + (open ? '▾' : '▸') + '</i>' +
      esc(seriesShort(g.i)) + '<em>' + g.n + '</em></button>';
    if (open) out += g.items.map(function (p) {
      var pt = prefTip(p), ps = prefShort(p);
      return '<button type="button" class="fk sub' + (F.fam === p ? ' on' : '') + '" data-f="fam" data-v="' + esc(p) + '"' +
        (pt ? ' title="' + esc(pt) + '"' : '') + '>' +
        esc(p) + (ps ? '<i class="pfs">' + esc(ps) + '</i>' : '') + '<em>' + counts[famKey(g.s.key, p)] + '</em></button>';
    }).join('');
    html += out + '</span>';
  });
  if (F.fam !== 'all' && html.indexOf('data-v="' + F.fam + '"') < 0) {
    html = '<button type="button" class="fk sub on" data-f="fam" data-v="' + esc(F.fam) + '">' + esc(F.fam) + '</button>' + html;
  }
  famBox.innerHTML = html || '<span style="color:var(--dim);font-size:12px">—</span>';
}
famBox = document.getElementById('famchips');
if (famBox) famBox.parentNode.addEventListener('click', function (ev) {
  var b = ev.target.closest ? ev.target.closest('.fk') : null;
  if (!b) return;
  if (b.hasAttribute('data-g')) {                       // 大类：展开/收起，同时作为大类筛选
    var gk = b.getAttribute('data-g');
    var open = famGrpOpen[gk] !== undefined ? famGrpOpen[gk] : (F.series === gk);
    famGrpOpen[gk] = !open;
    if (!open) F.series = gk;
    populateFams(); updateRowVals();
    if (typeof renderFilterBar === 'function') renderFilterBar();
    render();
    return;
  }
  var v = b.getAttribute('data-v');
  setFilter('fam', F.fam === v && v !== 'all' ? 'all' : v);
});
document.querySelectorAll('.fk[data-f]:not([data-f="fam"])').forEach(function (b) {
  b.addEventListener('click', function () {
    var kind = b.getAttribute('data-f'), val = b.getAttribute('data-v');
    setFilter(kind, F[kind] === val && val !== 'all' ? 'all' : val);
  });
});
document.getElementById('qfam').addEventListener('input', function () { famFilter = this.value.trim().toLowerCase(); populateFams(); });

// ---------- filter rows: folding keeps the toggle visible --------------------------------
function setRowCollapsed(id, collapsed) {
  var row = document.getElementById(id); if (!row) return;
  row.classList.toggle('collapsed', collapsed);
  var car = document.querySelector('.flabel.ftoggle[data-row="' + id + '"] .car');
  if (car) car.textContent = collapsed ? '▸' : '▾';
  updateRowVals();
  try { var st = JSON.parse(load('grauRows') || '{}'); st[id] = collapsed; store('grauRows', JSON.stringify(st)); } catch (e) {}
}
function rowVal(kind) {
  var box = document.getElementById('f-' + kind); if (!box) return '';
  var on = box.querySelector('.fk.on'); if (!on) return '';
  if ((on.getAttribute('data-v') || 'all') === 'all') return '';
  var first = on.childNodes.length ? String(on.childNodes[0].nodeValue || '').trim() : '';
  return first || on.textContent.trim();
}
function updateRowVals() {
  ['series', 'fam', 'type', 'org'].forEach(function (k) {
    var el = document.getElementById('fval-' + k); if (!el) return;
    var row = document.getElementById('frow-' + k), v = rowVal(k);
    el.textContent = (row && row.classList.contains('collapsed') && v) ? '· ' + v : '';
  });
}
document.querySelectorAll('.flabel.ftoggle').forEach(function (l) {
  l.addEventListener('click', function () {
    var id = l.getAttribute('data-row'), row = document.getElementById(id);
    if (!row) return;
    setRowCollapsed(id, !row.classList.contains('collapsed'));
    document.getElementById('fbtn').classList.toggle('on', !document.getElementById('frow-type').classList.contains('collapsed'));
  });
});
document.getElementById('fbtn').addEventListener('click', function () {
  var hide = !document.getElementById('frow-type').classList.contains('collapsed');
  ['frow-type', 'frow-org'].forEach(function (id) { setRowCollapsed(id, hide); });
  this.classList.toggle('on', !hide);
});

// ---------- compact filter bar (comboboxes) ------------------------------------------------
var SERIDX = {};
SER.forEach(function (s, i) { SERIDX[s.key] = i; });
var TYPE_COUNT = {}, ORG_COUNT = {};
ALL.forEach(function (e) {
  TYPE_COUNT[e[5]] = (TYPE_COUNT[e[5]] || 0) + 1;
  String(e[6] || '').split(' ').filter(Boolean).forEach(function (o) { ORG_COUNT[o] = (ORG_COUNT[o] || 0) + 1; });
});
function seriesCount(key) { var i = SERIDX[key]; var n = 0; for (var k = 0; k < ALL.length; k++) if (ALL[k][8] === i) n++; return n; }
function cbOptions(kind) {
  var out = [];
  if (kind === 'series') {
    // 保持数据层给的顺序（体系 → 局号），不要按 n 重排
    SER.forEach(function (s) {
      out.push({ v: s.key, label: seriesShort(SERIDX[s.key]) + ' ' + (LANG === 'zh' ? s.zh : s.ru), grp: tt('series'), n: seriesCount(s.key) });
    });
  } else if (kind === 'fam') {
    var counts = seriesFamilyCounts();
    SER.forEach(function (s, i) {
      var items = (s.prefixes || []).filter(function (p) { return counts[famKey(s.key, p)]; }).sort(natCmp);
      if (!items.length) return;
      var gl = seriesShort(i) + (LANG === 'zh' ? ' · ' + s.zh : ' · ' + s.ru);
      items.forEach(function (p) { out.push({ v: p, label: p, grp: gl, n: counts[famKey(s.key, p)] }); });
    });
  } else if (kind === 'type') {
    TYPE_META.forEach(function (t) { if (TYPE_COUNT[t[0]]) out.push({ v: t[0], label: LANG === 'zh' ? t[1] : t[2], grp: '', n: TYPE_COUNT[t[0]] }); });
  } else if (kind === 'org') {
    ORG_META.forEach(function (o) { if (ORG_COUNT[o[0]]) out.push({ v: o[0], label: LANG === 'zh' ? o[1] : o[2], grp: o[3], n: ORG_COUNT[o[0]] }); });
  }
  return out;
}
function cbValue(kind) {
  var v = F[kind];
  if (v === 'all') return '';
  var opt = cbOptions(kind).filter(function (o) { return o.v === v; })[0];
  return opt ? opt.label : v;
}
function renderFilterBar() {
  document.querySelectorAll('.cbbtn').forEach(function (b) {
    var k = b.getAttribute('data-cb'), v = cbValue(k);
    var name = k === 'series' ? tt('series') + ' / ' + tt('letters') : (k === 'fam' ? tt('fam') : (k === 'type' ? tt('type') : tt('org')));
    b.innerHTML = esc(name) + (v ? ' <b>' + esc(v) + '</b>' : '') + ' <i>▾</i>';
    b.classList.toggle('on', !!v);
  });
  var chipBtn = document.getElementById('fchips');
  if (chipBtn) chipBtn.classList.toggle('on', document.body.classList.contains('chips'));
  paintLitBtn();
  paintWikiBtn();
}
function litCount() { var n = 0; for (var i = 0; i < ALL.length; i++) if (ALL[i][10]) n++; return n; }
function wikiCount() { var n = 0; for (var i = 0; i < ALL.length; i++) if (W[ALL[i][0]]) n++; return n; }
function paintWikiBtn() {
  var b = document.getElementById('fwiki');
  if (!b) return;
  b.textContent = F.wiki === 'has' ? tt('wikiHas') + ' · ' + wikiCount()
    : (F.wiki === 'none' ? tt('wikiNone') + ' · ' + (ALL.length - wikiCount()) : tt('wikiAll'));
  b.classList.toggle('on', F.wiki !== 'all');
}
function paintLitBtn() {
  var b = document.getElementById('flit');
  if (!b) return;
  b.textContent = F.lit === 'lit' ? tt('litOnly') + ' · ' + litCount()
    : (F.lit === 'core' ? tt('litCore') + ' · ' + (ALL.length - litCount()) : tt('litAll'));
  b.classList.toggle('on', F.lit !== 'all');
}
var cbKind = null, cbList = [], cbAct = -1;
function cbClose() {
  cbKind = null;
  document.getElementById('cbdrop').classList.remove('on');
  document.querySelectorAll('.cbbtn').forEach(function (b) { b.classList.remove('on'); });
  renderFilterBar();
}
function cbRender(filter) {
  var drop = document.getElementById('cbdrop');
  var f = String(filter || '').trim().toLowerCase();
  cbList = cbOptions(cbKind).filter(function (o) { return !f || o.label.toLowerCase().indexOf(f) >= 0; }).slice(0, 250);
  var all = { v: 'all', label: tt('pickAll'), n: ALL.length };
  var rows = ['<div class="o' + (F[cbKind] === 'all' ? ' sel' : '') + '" data-v="all">' + esc(all.label) + '<em>' + all.n + '</em></div>'];
  var lastGrp = null;
  cbList.forEach(function (o) {
    if (o.grp && o.grp !== lastGrp) { rows.push('<div class="grp">' + esc(o.grp) + '</div>'); lastGrp = o.grp; }
    rows.push('<div class="o' + (F[cbKind] === o.v ? ' sel' : '') + '" data-v="' + esc(o.v) + '">' + esc(o.label) + '<em>' + o.n + '</em></div>');
  });
  if (!cbList.length) rows.push('<div class="o" style="color:var(--dim)">—</div>');
  drop.innerHTML = '<input type="text" id="cbin" autocomplete="off" placeholder="' + esc(tt('dropSearch')) + '">' + rows.join('');
  var inp = document.getElementById('cbin');
  inp.value = f;
  inp.addEventListener('input', function () { cbRender(inp.value); });
  inp.addEventListener('keydown', cbKey);
  drop.classList.add('on');
  setTimeout(function () { inp.focus(); }, 0);
}
function cbKey(ev) {
  var rows = [].slice.call(document.querySelectorAll('#cbdrop .o[data-v]'));
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    cbAct = (cbAct + (ev.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    rows.forEach(function (r, i) { r.classList.toggle('act', i === cbAct); });
    if (rows[cbAct]) rows[cbAct].scrollIntoView({ block: 'nearest' });
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    var r = rows[cbAct >= 0 ? cbAct : 0];
    if (r) cbPick(r.getAttribute('data-v'));
  } else if (ev.key === 'Escape') cbClose();
}
function cbPick(v) {
  var k = cbKind;
  cbClose();
  setFilter(k, v);
  renderFilterBar();
}
document.getElementById('fbar').addEventListener('click', function (ev) {
  var b = ev.target.closest('.cbbtn');
  if (b) {
    var k = b.getAttribute('data-cb');
    if (cbKind === k) { cbClose(); return; }
    cbKind = k; cbAct = -1;
    document.querySelectorAll('.cbbtn').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    cbRender('');
    return;
  }
  var o = ev.target.closest('#cbdrop .o[data-v]');
  if (o) cbPick(o.getAttribute('data-v'));
});
document.addEventListener('click', function (ev) {
  if (!cbKind) return;
  if (ev.target.closest && (ev.target.closest('#fbar') || ev.target.closest('.sugg'))) return;
  cbClose();
});
document.getElementById('freset').addEventListener('click', function () {
  ['series', 'fam', 'type', 'org'].forEach(function (k) { F[k] = 'all'; });
  F.lit = 'all'; store('grauLit', 'all'); paintLitBtn();
  F.wiki = 'all'; store('grauWiki', 'all'); paintWikiBtn();
  ['f-series', 'f-letters', 'f-fam', 'f-type', 'f-org'].forEach(function (id) {
    var box = document.getElementById(id);
    if (box) [].slice.call(box.querySelectorAll('.fk')).forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === 'all'); });
  });
  populateFams(); updateRowVals(); renderFilterBar(); render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.getElementById('fchips').addEventListener('click', function () {
  var on = !document.body.classList.contains('chips');
  document.body.classList.toggle('chips', on);
  store('grauChips', on ? '1' : '0');
  this.classList.toggle('on', on);
  if (on) { populateFams(); updateRowVals(); }
});
// source filter: cycle 全部 → 仅网络补充 → 仅三源 → 全部
document.getElementById('flit').addEventListener('click', function () {
  F.lit = F.lit === 'all' ? 'lit' : (F.lit === 'lit' ? 'core' : 'all');
  store('grauLit', F.lit);
  paintLitBtn();
  render();
});
// wikipedia filter: cycle 全部 → 有条目 → 无条目 → 全部
document.getElementById('fwiki').addEventListener('click', function () {
  F.wiki = F.wiki === 'all' ? 'has' : (F.wiki === 'has' ? 'none' : 'all');
  store('grauWiki', F.wiki);
  paintWikiBtn();
  render();
});

// ---------- index view --------------------------------------------------------------------
function match(e) {
  if (F.lit === 'lit' && !e[10]) return false;
  if (F.lit === 'core' && e[10]) return false;
  if (F.wiki === 'has' && !W[e[0]]) return false;
  if (F.wiki === 'none' && W[e[0]]) return false;
  if (F.series !== 'all' && SER[e[8]].key !== F.series) return false;
  if (F.fam !== 'all' && e[7] !== F.fam) return false;
  if (F.type !== 'all' && e[5] !== F.type) return false;
  if (F.org !== 'all' && (' ' + e[6] + ' ').indexOf(' ' + F.org + ' ') < 0) return false;
  return true;
}
// search: latin/cyrillic folding, token AND, relevance ranking, highlight
var FOLDMAP = { '\u0430': 'a', '\u0432': 'b', '\u0435': 'e', '\u0451': 'e', '\u043a': 'k', '\u043c': 'm', '\u043d': 'h', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0442': 't', '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0458': 'j', '\u0455': 's' };
var SPACECH = /[\u00ab\u00bb\u2018\u2019\u201c\u201d\u201e"'\u0060()\[\]{},.;:!?\/\\|*_+=\u2010-\u2015\u00a0\t\r\n]/;
function fold(s) {
  s = String(s == null ? '' : s).toLowerCase();
  var o = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    o += SPACECH.test(ch) ? ' ' : (FOLDMAP[ch] || ch);
  }
  return o;
}
function sq(s) { return fold(s).replace(/ +/g, ' ').replace(/^ | $/g, ''); }
var HAY = {};
function hayOf(e) {
  var k = e[0];
  if (HAY[k] === undefined) {
    HAY[k] = sq(k + ' ' + tr(k) + ' ' + trGost(k) + ' ' + (e[2] || '') + ' ' + (e[3] || '') + ' ' +
      tr(e[3] || '') + ' ' + trGost(e[3] || '') + ' ' + (e[4] || ''));
  }
  return HAY[k];
}
var qtok = [], qtokSrc = null;
function queryTokens() {
  if (qtokSrc === q) return qtok;
  qtokSrc = q;
  qtok = [];
  var parts = String(q || '').match(/"[^"]*"|\u00ab[^\u00bb]*\u00bb|[^\s]+/g) || [];
  for (var i = 0; i < parts.length; i++) {
    var t = sq(parts[i]).replace(/^"|"$/g, '');
    if (t && qtok.indexOf(t) < 0) qtok.push(t);
  }
  return qtok;
}
function scoreOf(e) {
  var tk = queryTokens();
  if (!tk.length) return 1;
  var idx = sq(e[0]), nato = sq(e[4] || ''), zh = sq(e[3] || ''), ru = sq(e[2] || '');
  // alternative designations (aka) of the row: a reader looks up "АПН-2", the row is keyed 51-ИК-210
  var aka = '';
  function akaAdd(v) { var s = sq(v); if (s) { aka += (aka ? ' ' : '') + s; var l = sq(tr(v)); if (l && l !== s) aka += ' ' + l; var g = sq(trGost(v)); if (g && g !== s && g !== l) aka += ' ' + g; } }
  if (e[11] && e[11].length) for (var a = 0; a < e[11].length; a++) akaAdd(e[11][a]);
  // relation layer (the equipment a part fits / the parts of a row): searching "9С13" also lists its
  // sub-units, searching "Т-72" the optics and units fitted to it
  var rel = '';
  function relAdd(v) { var s = sq(v); if (s) { rel += (rel ? ' ' : '') + s; var l = sq(tr(v)); if (l && l !== s) rel += ' ' + l; var g = sq(trGost(v)); if (g && g !== s && g !== l) rel += ' ' + g; } }
  if (e[12] && e[12].length) for (var u = 0; u < e[12].length; u++) relAdd(e[12][u]);
  if (e[13] && e[13].length) for (var p = 0; p < e[13].length; p++) relAdd(e[13][p]);
  var total = 0;
  for (var i = 0; i < tk.length; i++) {
    var t = tk[i], s = 0;
    if (idx === t) s = 4000;
    else if (idx.indexOf(t) === 0) s = 2000;
    else if (aka && aka.indexOf(t) === 0) s = 1800;
    else if (idx.indexOf(t) >= 0) s = 900;
    else if (aka && aka.indexOf(t) >= 0) s = 800;
    else if (rel && rel.indexOf(t) === 0) s = 700;
    else if (rel && rel.indexOf(t) >= 0) s = 600;
    else if (nato.indexOf(t) >= 0) s = 500;
    else if (sq(e[7] || '').indexOf(t) === 0) s = 150;
    else if (zh.indexOf(t) >= 0) s = 40;
    else if (ru.indexOf(t) >= 0) s = 30;
    else if (hayOf(e).indexOf(t) >= 0) s = 10;
    else return -1;
    total += s;
  }
  return total;
}
function searchMatch(e) { return scoreOf(e) >= 0; }
function rankRows(rows) {
  var order = [], byKey = {};
  for (var i = 0; i < rows.length; i++) {
    var e = rows[i], k = e[7], g = byKey[k];
    if (!g) { g = byKey[k] = { best: -1, items: [] }; order.push(g); }
    var s = scoreOf(e);
    g.items.push({ e: e, s: s });
    if (s > g.best) g.best = s;
  }
  order.sort(function (a, b) { return b.best - a.best; });
  var out = [];
  for (var j = 0; j < order.length; j++) {
    order[j].items.sort(function (a, b) { return b.s !== a.s ? b.s - a.s : String(a.e[0]).localeCompare(String(b.e[0]), 'ru', { numeric: true }); });
    for (var m = 0; m < order[j].items.length; m++) out.push(order[j].items[m].e);
  }
  return out;
}
function hl(s) {
  var tk = queryTokens();
  var txt = String(s == null ? '' : s);
  if (!tk.length) return esc(txt);
  var f = fold(txt), spans = [];
  for (var i = 0; i < tk.length; i++) {
    var from = 0, cnt = 0, p;
    while (cnt < 6 && (p = f.indexOf(tk[i], from)) >= 0) { spans.push([p, tk[i].length]); from = p + tk[i].length; cnt++; }
  }
  if (!spans.length) return esc(txt);
  spans.sort(function (a, b) { return a[0] - b[0]; });
  var out = '', last = 0;
  for (var j = 0; j < spans.length; j++) {
    var a = spans[j][0], b = a + spans[j][1];
    if (a < last) continue;
    out += esc(txt.slice(last, a)) + '<mark>' + esc(txt.slice(a, b)) + '</mark>';
    last = b;
  }
  return out + esc(txt.slice(last));
}
function litBadge(L) {
  if (!L) return '';
  var kinds = ['litAdd', 'litEnrich', 'litFix'], marks = ['补', '+', '改'];
  var k = L[4] || 0;
  var tip = tt('litSrc') + ': ' + (S.LS[L[0]] || L[0]) + '\n' + tt(kinds[k]);
  if (L[3]) tip += '\n' + L[3];
  if (L[2]) tip += '\n' + tt('litQuote') + ': ' + L[2];
  if (L[1]) tip += '\n' + tt('litLink') + ': ' + L[1];
  return '<span class="litb k' + k + '" title="' + esc(tip) + '">' + marks[k] + '</span>';
}
// ---------- wikipedia layer: badge + article card -----------------------------------------
// W[idx] = [title, url, intro extract, local thumbnail, licence, author, tier]
// tier: 'v' text-verified article, 'p' article matched by name, 'g' wikibooks glossary line,
// 'r' RWD (east german NVA) catalogue page, 'w' picture found by a search engine
function wikiTier(k) {
  return k === 'p' ? tt('wikiByName') : (k === 'g' ? tt('wikiGloss')
    : (k === 'r' ? tt('wikiRwd') : (k === 'w' ? tt('wikiWeb') : tt('wikiVerified'))));
}
function wikiBadge(idx) {
  var w = W[idx];
  if (!w) return '';
  var tip = tt('wikiBadge') + ': ' + w[0] + '\n' + wikiTier(w[6]) +
    (w[2] ? '\n' + w[2].slice(0, 240) + '…' : '');
  var cls = (w[6] === 'p' || w[6] === 'g' || w[6] === 'r' || w[6] === 'w') ? ' ' + w[6] : '';
  return '<button type="button" class="wb' + cls + '" data-w="' + esc(idx) + '" title="' + esc(tip) + '">W</button>';
}
// language editions of one topic: W[idx] is the primary record, WL[idx] the others
var LANGNAME = {
  ru: 'Русский', en: 'English', zh: '中文', uk: 'Українська', de: 'Deutsch', fr: 'Français',
  pl: 'Polski', ja: '日本語', ko: '한국어', es: 'Español', it: 'Italiano', tr: 'Türkçe',
  cs: 'Čeština', fi: 'Suomi', he: 'עברית', ar: 'العربية', nl: 'Nederlands', sv: 'Svenska', pt: 'Português',
  rwd: 'RWD (NVA)', web: '网络图片',
};
function wikiLangOf(r) { return r[7] || 'ru'; }
function wikiPick(idx, lang) {
  var alts = WL[idx] || {};
  if (lang && alts[lang]) return { rec: alts[lang], lang: lang, alt: true };
  var w = W[idx];
  return w ? { rec: w, lang: wikiLangOf(w), alt: false } : null;
}
function openWiki(idx, lang) {
  var w = W[idx], box = document.getElementById('wcard');
  if (!w || !box) return;
  // start in the interface language when that edition exists, otherwise keep the primary one
  var want = lang || (WL[idx] && WL[idx][LANG] ? LANG : null);
  var pick = wikiPick(idx, want);
  var r = pick.rec, lg = pick.lang;
  box.querySelector('.wc-id').textContent = idx;
  var a = box.querySelector('.wc-link');
  a.textContent = r[0];
  a.href = r[1] || '#';
  a.title = tt('wikiOpen');
  var img = box.querySelector('.wc-img');
  // the chosen edition may have no picture of its own — then show the russian
  // article's picture, or any other edition's (web picture / RWD photo), and credit
  // the licence of whichever picture is displayed
  var imgRec = r[3] ? r : (r !== w && w[3] ? w : null);
  if (!imgRec && WL[idx]) {
    for (var k in WL[idx]) if (WL[idx][k] && WL[idx][k][3]) { imgRec = WL[idx][k]; break; }
  }
  if (imgRec) { img.onerror = function () { this.style.display = 'none'; }; img.src = imgRec[3]; img.style.display = ''; }
  else { img.removeAttribute('src'); img.style.display = 'none'; }
  var isRwd = r[6] === 'r' || w[6] === 'r';
  var dzh = isRwd && LANG === 'zh' && DZ && DZ[idx] ? DZ[idx] : '';
  WDE = dzh ? (r[2] || '') : '';
  WZH = dzh;
  var wtext = box.querySelector('.wc-text');
  wtext.textContent = dzh || r[2] || (LANG === 'zh' ? '（该条目暂无简介）' : '(в статье нет вступления)');
  wtext.setAttribute('data-v', dzh ? 'zh' : 'de');
  // edition switch: primary + every language that has its own article
  var langs = [wikiLangOf(w)].concat(Object.keys(WL[idx] || {}));
  var seen = {};
  langs = langs.filter(function (l) { return l && !seen[l] && (seen[l] = 1); });
  var lbox = box.querySelector('.wc-langs');
  var lbtns = '';
  if (langs.length > 1) {
    lbtns = '<span>' + esc(tt('wikiLangs')) + '</span>' + langs.map(function (l) {
      return '<button type="button" data-l="' + esc(l) + '"' + (l === lg ? ' class="on"' : '') + '>' + esc(LANGNAME[l] || l) + '</button>';
    }).join('');
  }
  if (dzh) lbtns += '<button type="button" id="wtr">' + esc(tt('wikiDeOrig')) + '</button>';
  if (lbtns) { lbox.style.display = ''; lbox.innerHTML = lbtns; } else { lbox.style.display = 'none'; lbox.innerHTML = ''; }
  var tb = document.getElementById('wtr');
  if (tb) tb.addEventListener('click', function () {
    if (wtext.getAttribute('data-v') === 'zh') {
      wtext.textContent = WDE; wtext.setAttribute('data-v', 'de'); tb.textContent = tt('wikiZhTrans');
    } else {
      wtext.textContent = WZH; wtext.setAttribute('data-v', 'zh'); tb.textContent = tt('wikiDeOrig');
    }
  });
  var foot = [];
  if (imgRec) {
    // credit whichever picture is shown: licence/author for a wiki image, the source name
    // for an RWD photo or a search-engine picture. When the picture belongs to another
    // edition than the displayed text, name that edition too.
    var lic = [imgRec[4], imgRec[5]].filter(Boolean).join(' ');
    var iln = LANGNAME[wikiLangOf(imgRec)] || wikiLangOf(imgRec);
    if (imgRec !== r) foot.push(tt('wikiImgFrom') + ' ' + iln + (lic ? ' · ' + lic : ''));
    else if (lic) foot.push(tt('wikiPic') + ': ' + lic);
  }
  if (!imgRec && r[6] !== 'g') foot.push(tt('wikiNoImg'));
  foot.push(wikiTier(r[6]));
  foot.push(r[6] === 'g' ? tt('wikiCreditWB')
    : (r[6] === 'r' ? tt('wikiCreditRwd')
      : (r[6] === 'w' ? tt('wikiCreditWeb') : tt('wikiCredit') + ' · ' + (LANGNAME[lg] || lg))));
  box.querySelector('.wc-foot').textContent = foot.join(' · ');
  box.hidden = false;
  box.setAttribute('data-w', idx);
  box.setAttribute('data-l', lg);
}
function closeWiki() { var b = document.getElementById('wcard'); if (b) b.hidden = true; }

// ---------- other directorate catalogues (ГБТУ / инженерные войска / ГАУ 56-57) ----------
var OTHTAB = 'b', OTHQ = '', OTHENG = 0;
var OTH_SEC_ZH = {
  'Средства инженерной разведки': '工程侦察器材',
  'Средства преодоления заграждений': '克服障碍器材',
  'Средства преодоления разрушений и препятствий': '克服破坏与障碍物器材',
  'Средства преодоления водных преград': '克服江河障碍器材',
  'Инженерные боеприпасы': '工程弹药',
  'Средства механизации устройства минно-взрывных заграждений': '机械化布设地雷与爆破障碍器材',
  'Средства механизации земляных работ': '机械化土工作业器材'
};
function secLabel(s) { return LANG === 'zh' ? (OTH_SEC_ZH[s] || s) : s; }
function othLow(s) { return String(s == null ? '' : s).toLowerCase(); }
// TZ: {source string -> Chinese} for the non-GRAU catalogues; normalised keys, lazy copy.
var TZN = null;
function tz(s) {
  if (!TZ || LANG !== 'zh') return s;
  var k = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!k) return s;
  if (!TZN) { TZN = {}; for (var t in TZ) TZN[t.replace(/\s+/g, ' ').trim()] = TZ[t]; }
  return TZN[k] || s;
}
function dx(idx) { return LANG === 'zh' && DZ && DZ[idx] ? DZ[idx] : ''; }
var WDE = '', WZH = '';   // German original / Chinese body of the RWD card currently shown
var OTH_SRC = { sila: 'русская-сила', bmz: 'bmz.ru', ruwiki: 'ru.wiki', ukwiki: 'uk.wiki' };
function srcName(s) { return OTH_SRC[s] || s; }
// index links: a ГБТУ designation that also exists in the main table becomes clickable
var IDX_NORM = null;
function idxKey(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase().replace(/Ё/g, 'Е'); }
function masterIdx(d) {
  if (!d) return null;
  if (!IDX_NORM) { IDX_NORM = {}; for (var i = 0; i < ALL.length; i++) IDX_NORM[idxKey(ALL[i][0])] = ALL[i][0]; }
  return IDX_NORM[idxKey(d)] || null;
}
// one ГБТУ row: designation + description grouped per source, so a designation never
// gets attached to another source's description
function gbtuSegs(r) {
  var srcs = r[3] || [], segs = [], seen = {}, i, k;
  for (i = 0; i < srcs.length; i++) {
    if (!srcs[i][1] && !srcs[i][2]) continue;   // source contributed nothing usable
    k = othLow(srcs[i][1] + '\u0001' + srcs[i][2]);
    if (seen[k] !== undefined) { segs[seen[k]][0].push(srcs[i][0]); continue; }
    seen[k] = segs.length;
    segs.push([[srcs[i][0]], srcs[i][1], srcs[i][2]]);
  }
  if (!segs.length) segs.push([[], r[1] || '', r[2] || '']);
  return segs;
}
function segHTML(seg, sub) {
  var t = '<span class="osrc">' + esc(seg[0].map(srcName).join(' ')) + '</span>';
  if (seg[1]) {
    var mi = masterIdx(seg[1]);
    t += mi
      ? '<b class="od lnk" data-g="' + esc(mi) + '" title="' + esc(tt('othJump')) + '">' + esc(seg[1]) + '</b>'
      : '<b class="od">' + esc(seg[1]) + '</b>';
  }
  if (seg[2]) t += '<span class="on2">' + esc(tz(seg[2])) + '</span>';
  return sub ? '<div class="osub">' + t + '</div>' : '<span class="oseg">' + t + '</span>';
}
function objLabel(k) { return LANG === 'zh' ? k + ' 号工程' : 'Объект ' + k; }
function othRender() {
  if (!OTH) return;
  var body = document.getElementById('othbody');
  if (!body) return;
  var q = othLow(OTHQ), n = 0, out = '', i, r;
  if (OTHTAB === 'b') {
    for (i = 0; i < OTH.b.length; i++) {
      r = OTH.b[i];
      var segs = gbtuSegs(r), k, hay = 'Объект ' + r[0] + ' ' + r[1] + ' ' + r[2];
      for (k = 0; k < segs.length; k++) hay += ' ' + segs[k][1] + ' ' + segs[k][2] + ' ' + tz(segs[k][2]);
      if (q && othLow(hay).indexOf(q) < 0) continue;
      n++;
      var li = '<li class="oi"><span class="ok">' + esc(objLabel(r[0])) + '</span>' + segHTML(segs[0], 0);
      for (k = 1; k < segs.length; k++) li += segHTML(segs[k], 1);
      out += li + '</li>';
    }
  } else if (OTHTAB === 'i') {
    for (i = 0; i < OTH.i.length; i++) {
      r = OTH.i[i];
      var hayI = r.join(' ') + ' ' + tz(r[0]) + ' ' + tz(r[3]) + ' ' + tz(r[6]) + ' ' + tz(r[7]) + ' ' + tz(r[8]);
      if (q && othLow(hayI).indexOf(q) < 0) continue;
      n++;
      var codes = [];
      if (r[4]) codes.push('КВТ МО ' + r[4]);
      if (r[5]) codes.push('ОКП ' + r[5]);
      if (r[6]) codes.push(tz(r[6]));
      out += '<li class="oi"><b class="od">' + esc(tz(r[0])) + '</b>' +
        (r[1] ? '<span class="ok">' + esc(r[1]) + '</span>' : '') +
        '<span class="osec">' + esc(secLabel(r[2])) + '</span>' +
        (codes.length ? '<span class="ocodes">' + esc(codes.join(' · ')) + '</span>' : '') +
        (r[3] ? '<div class="on2">' + esc(tz(r[3])) + '</div>' : '') +
        ((r[7] || r[8]) ? '<span class="oap">' + (r[7] ? esc(/列装|列入供应|принят|на вооружение/i.test(tz(r[7])) ? '' : tt('othAdopted')) + esc(tz(r[7])) : '') +
          (r[8] ? (r[7] ? ' · ' : '') + esc(tt('othDev')) + esc(tz(r[8])) : '') + '</span>' : '') + '</li>';
    }
  } else if (OTHTAB === 'a') {
    for (i = 0; i < OTH.a.length; i++) {
      r = OTH.a[i];
      if (OTHENG && !r[2]) continue;
      if (q && othLow(r[0] + ' ' + r[1] + ' ' + tz(r[1])).indexOf(q) < 0) continue;
      n++;
      out += '<li class="oi"><span class="ok">' + esc(r[0]) + '</span>' +
        (r[2] ? '<span class="ocodes">инж.</span> ' : '') +
        '<span class="on2">' + esc(tz(r[1])) + '</span></li>';
    }
  } else {
    for (i = 0; i < OTH.m.length; i++) {
      r = OTH.m[i];
      if (q && othLow(r[0] + ' ' + r[1] + ' ' + tz(r[1])).indexOf(q) < 0) continue;
      n++;
      out += '<li class="oi"><span class="ok">' + esc(r[0]) + '</span><span class="on2">' + esc(tz(r[1])) + '</span></li>';
    }
  }
  body.innerHTML = out || '<li class="oi empty">' + esc(tt('othEmpty')) + '</li>';
  var cnt = document.getElementById('othcnt');
  if (cnt) cnt.textContent = n + ' ' + tt('othUnit');
  var eb = document.getElementById('othEng');
  if (eb) eb.style.display = OTHTAB === 'a' ? '' : 'none';
}
function openOth() {
  var b = document.getElementById('othcard');
  if (!b || !OTH) return;
  b.hidden = false;
  othRender();
  var qb = document.getElementById('othq');
  if (qb) qb.focus();
}
function closeOth() { var b = document.getElementById('othcard'); if (b) b.hidden = true; }
(function othWire() {
  var ob = document.getElementById('othbtn');
  if (ob) ob.addEventListener('click', function () { openOth(); });
  var card = document.getElementById('othcard');
  if (!card) return;
  card.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t) return;
    if (t === card || (t.className === 'wc-x')) { closeOth(); return; }
    var g = t.getAttribute ? t.getAttribute('data-g') : null;
    if (g) {
      closeOth();
      var qe = document.getElementById('q');
      if (qe) { qe.value = g; qe.dispatchEvent(new Event('input')); }
      window.scrollTo(0, 0);
      return;
    }
    var tab = t.getAttribute ? t.getAttribute('data-ot') : null;
    if (!tab) return;
    OTHTAB = tab;
    var bs = card.querySelectorAll('.oc-tab');
    for (var k = 0; k < bs.length; k++) bs[k].className = 'oc-tab' + (bs[k].getAttribute('data-ot') === tab ? ' on' : '');
    othRender();
  });
  var qi = document.getElementById('othq');
  if (qi) qi.addEventListener('input', function () { OTHQ = this.value; othRender(); });
  var eb = document.getElementById('othEng');
  if (eb) eb.addEventListener('click', function () {
    OTHENG = OTHENG ? 0 : 1;
    this.className = 'oc-eng' + (OTHENG ? ' on' : '');
    othRender();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeOth(); });
})();
function rowHTML(e, lat, showLat) {
  var idx = lat ? tr(e[0]) : e[0];
  var nato = lat ? tr(e[2]) : e[2];
  var raw = LANG === 'zh'
    ? (e[4] ? hl(e[4]) : (e[3] ? '<i class="miss">' + esc(tt('missZh')) + '</i>' : '<i class="miss">' + esc(tt('missRu')) + '</i>'))
    : (e[3] ? hl(e[3]) : '<i class="miss">' + esc(tt('missRu')) + '</i>');
  var tags = '<span class="tag" data-t="' + e[5] + '">' + esc(typeLabel(e[5])) + '</span>';
  if (e[6]) {
    var ids = e[6].split(' ').filter(Boolean), roles = String(e[9] || '');
    var o = ids[0], chassis = roles.charAt(0) === 'c';
    tags += '<span class="tag org' + (chassis ? ' chassis' : '') + '" data-o="' + esc(o) + '"' +
      (chassis ? ' title="' + esc(tt('chassisTag')) + '"' : '') + '>' +
      (chassis ? esc(tt('chassisShort')) + ' ' : '') + esc(orgLabel(o)) + '</span>';
  }
  var ph = zhPhrase(e);
  var phrase = '<b class="zh-line">' + serChipHTML(e) +
    (ph ? hl(ph) : '<i class="miss">' + esc(tt('missZh')) + '</i>') + '</b>';
  var prefT = e[7] ? prefTip(e[7]) : '';
  return '<li class="' + (showLat ? 'e lat' : 'e') + (nato ? '' : ' nont') + '"><span class="id"' +
    (prefT ? ' title="' + esc(prefT) + '"' : '') + '>' + (lat ? esc(idx) : hl(idx)) + litBadge(e[10]) + wikiBadge(e[0]) + '</span>' +
    '<span class="nt">' + esc(nato || '') + '</span><span class="d">' + phrase + tags + raw + relLine(e) + '</span></li>';
}
// two-way links of the component layer: alternative designations, the equipment a part is
// installed on, and the parts an equipment row carries. Every chip is a click = a new search.
function relLink(v, cls) {
  return '<a href="#" class="rel' + (cls ? ' ' + cls : '') + '" data-r="' + esc(v) + '">' + esc(v) + '</a>';
}
function relLine(e) {
  var out = '';
  var aka = e[11] || [], used = e[12] || [], made = e[13] || [];
  if (aka.length) out += '<span class="rel-line"><i>' + esc(tt('akaLbl')) + '</i> ' + aka.map(function (v) { return relLink(v); }).join(' · ') + '</span>';
  if (used.length) out += '<span class="rel-line"><i>' + esc(tt('usedLbl')) + '</i> ' + used.map(function (v) { return relLink(v); }).join(' · ') + '</span>';
  if (made.length) out += '<span class="rel-line"><i>' + esc(tt('partsLbl')) + '</i> ' + made.map(function (v) { return relLink(v); }).join(' · ') + '</span>';
  return out;
}
function famBody(p) {
  for (var i = 0; i < lastGroups.length; i++) {
    if (lastGroups[i].p === p) return lastGroups[i].items.map(function (e) { return rowHTML(e, 0, false) + rowHTML(e, 1, true); }).join('');
  }
  return '';
}
function render() {
  var rows = ALL.filter(match);
  if (q) rows = rows.filter(searchMatch);
  rows.sort(function (a, b) { return a[8] === b[8] ? String(a[0]).localeCompare(String(b[0]), 'ru', { numeric: true }) : a[8] - b[8]; });
  if (q && rows.length > 1) rows = rankRows(rows);
  var box = document.getElementById('content'), head = document.getElementById('shead');
  var label = F.series === 'all' ? esc(tt('allSeriesH'))
    : (function () { var i = 0; for (var k = 0; k < SER.length; k++) if (SER[k].key === F.series) i = k; return esc(SER[i].zh) + ' <span class="ru">' + esc(SER[i].ru) + '</span>'; })();
  var extra = [];
  if (F.fam !== 'all') extra.push(esc(F.fam));
  if (F.type !== 'all') extra.push(esc(typeLabel(F.type)));
  if (F.org !== 'all') extra.push(esc(orgLabel(F.org)));
  head.innerHTML = '<h2>' + label + '</h2>' +
    (extra.length ? '<span class="cnt">' + extra.join(' · ') + '</span>' : '') +
    '<span class="cnt">' + esc(tt('hits')) + ' ' + rows.length + ' / ' + ALL.length + '</span>' +
    (rows.length && !q ? '<span class="rng">' + esc(rows[0][0]) + ' — ' + esc(rows[rows.length - 1][0]) + '</span>' : '');
  var groups = [], cur = null;
  rows.forEach(function (e) {
    if (!cur || cur.p !== e[7]) { cur = { p: e[7], items: [] }; groups.push(cur); }
    cur.items.push(e);
  });
  lastGroups = groups;
  box.innerHTML = groups.map(function (g, gi) {
    var isOpen = (familyOpen[g.p] !== undefined) ? familyOpen[g.p] : (gi < 5 || F.fam === g.p || groups.length <= 3);
    var body = isOpen ? g.items.map(function (e) { return rowHTML(e, 0, false) + rowHTML(e, 1, true); }).join('') : '';
    return '<div class="fam-block' + (isOpen ? ' open' : '') + '" data-fam="' + esc(g.p) + '">' +
      '<div class="bhead"><span class="caret">' + (isOpen ? '▾' : '▸') + '</span>' +
      '<span class="pfx" data-p="' + esc(g.p) + '">' + esc(g.p) + '</span><em>' + g.items.length + '</em>' +
      '<span class="rng">' + esc(g.items[0][0]) + ' — ' + esc(g.items[g.items.length - 1][0]) + '</span></div>' +
      '<ul class="list"' + (isOpen ? '' : ' style="display:none"') + '>' + body + '</ul></div>';
  }).join('');
  document.getElementById('none').style.display = rows.length ? 'none' : 'block';
  document.getElementById('hits').textContent = (q ? (LANG === 'zh' ? '搜索 ' : 'поиск ') : '') + rows.length + ' ' + tt('unit');
  document.body.classList.toggle('showlat', latMode);
}
document.addEventListener('click', function (ev) {
  if (!ev.target || !ev.target.closest) return;
  var rl = ev.target.closest('.rel');
  if (rl) {
    ev.preventDefault();
    var rv = rl.getAttribute('data-r'), qe = document.getElementById('q');
    if (rv && qe) { qe.value = rv; qe.dispatchEvent(new Event('input')); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    return;
  }
  var wb = ev.target.closest('.wb');
  if (wb) { openWiki(wb.getAttribute('data-w')); return; }
  var p = ev.target.closest('.pfx');
  if (p && VIEW === 'index') { setFilter('fam', p.getAttribute('data-p')); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  var t = ev.target.closest('#view-index .tag');
  if (t) {
    if (t.getAttribute('data-t')) setFilter('type', t.getAttribute('data-t'));
    else if (t.getAttribute('data-o')) setFilter('org', t.getAttribute('data-o'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  var head = ev.target.closest('#view-index .bhead');
  if (head) {
    var blk = head.closest('.fam-block'); if (!blk) return;
    var ul = blk.querySelector('ul.list'), open = blk.classList.toggle('open');
    if (ul) {
      if (open && !ul.childNodes.length) ul.innerHTML = famBody(blk.getAttribute('data-fam'));
      ul.style.display = open ? '' : 'none';
    }
    var c = blk.querySelector('.caret'); if (c) c.textContent = open ? '▾' : '▸';
    familyOpen[blk.getAttribute('data-fam')] = open;
  }
});

// ---------- search + suggestions -----------------------------------------------------------
var qEl = document.getElementById('q'), suggBox = document.getElementById('sugg'), act = -1, list = [], SUG = [];
function buildSug() {
  SUG = [];
  SER.forEach(function (s, i) {
    SUG.push({ v: s.ru, k: tt('kindSeries'), d: s.zh, n: ALL.filter(function (e) { return e[8] === i; }).length, f: function () { setFilter('series', s.key); } });
  });
  SUG.push({ v: '', k: '', d: '', n: 0, f: function () {} });
  document.querySelectorAll('#f-fam .fk').forEach(function (b) {
    var v = b.getAttribute('data-v'); if (v === 'all') return;
    SUG.push({ v: v, k: tt('kindFam'), d: v, n: Number((b.querySelector('em') || {}).textContent || 0), f: function () { setFilter('fam', v); } });
  });
  TYPE_META.forEach(function (t) { SUG.push({ v: t[1], k: tt('kindType'), d: t[2], n: 0, f: function () { setFilter('type', t[0]); } }); });
  ORG_META.forEach(function (o) {
    SUG.push({ v: o[2], k: tt('kindOrg'), d: o[1] + '（' + o[3] + '）', n: 0, f: function () { setFilter('org', o[0]); } });
    SUG.push({ v: o[1], k: tt('kindOrg'), d: o[2] + '（' + o[3] + '）', n: 0, f: function () { setFilter('org', o[0]); } });
  });
  REFS.abbr.forEach(function (a) { SUG.push({ v: a.a, k: tt('kindAbbr'), d: a.zh, n: a.n, f: function () { qEl.value = a.a; q = key2(a.a); render(); } }); });
  var seen = {};
  ALL.forEach(function (e) {
    if (seen[e[0]]) return; seen[e[0]] = 1;
    SUG.push({ v: e[0], k: tt('kindIndex'), d: (e[4] || e[3] || '').slice(0, 70), n: 1, f: function () { setFilter('fam', e[7]); qEl.value = e[0]; q = key2(e[0]); render(); } });
  });
}
function hideSugg() { suggBox.classList.remove('on'); act = -1; }
function showSugg() {
  var t = qEl.value.trim().toLowerCase();
  if (!t) { hideSugg(); return; }
  var starts = [], contains = [];
  for (var i = 0; i < SUG.length; i++) {
    var s = SUG[i]; if (!s.v) continue;
    var v = s.v.toLowerCase();
    if (v.indexOf(t) === 0) starts.push(s); else if (v.indexOf(t) > 0) contains.push(s);
    if (starts.length >= 30 && contains.length >= 15) break;
  }
  list = starts.concat(contains).slice(0, 40);
  if (!list.length) { hideSugg(); return; }
  act = 0;
  suggBox.innerHTML = list.map(function (s, i) {
    return '<div class="s" data-i="' + i + '"><span class="sv">' + esc(s.v) + '</span><span class="sk">' + esc(s.k) + '</span>' +
      '<span class="sd">' + esc(s.d) + '</span><span class="sn">' + (s.n || '') + '</span></div>';
  }).join('');
  suggBox.classList.add('on');
}
qEl.addEventListener('input', function () {
  q = key2(qEl.value.trim());
  if (q && (F.fam !== 'all' || F.type !== 'all' || F.org !== 'all')) {
    F.fam = 'all'; F.type = 'all'; F.org = 'all';
    ['f-fam', 'f-type', 'f-org'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) [].slice.call(b.querySelectorAll('.fk')).forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === 'all'); });
    });
    populateFams(); updateRowVals();
  }
  render(); showSugg();
});
qEl.addEventListener('focus', showSugg);
qEl.addEventListener('blur', function () { setTimeout(hideSugg, 150); });
suggBox.addEventListener('mousedown', function (ev) {
  var d = ev.target.closest('.s'); if (!d) return; ev.preventDefault();
  var s = list[Number(d.getAttribute('data-i'))]; if (s && s.f) s.f(); hideSugg();
});
qEl.addEventListener('keydown', function (ev) {
  if (!suggBox.classList.contains('on')) return;
  var rs = [].slice.call(suggBox.querySelectorAll('.s'));
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    act = (act + (ev.key === 'ArrowDown' ? 1 : -1) + rs.length) % rs.length;
    rs.forEach(function (r, i) { r.classList.toggle('act', i === act); });
    if (rs[act]) rs[act].scrollIntoView({ block: 'nearest' });
  } else if (ev.key === 'Enter') { if (list[act] && list[act].f) { ev.preventDefault(); list[act].f(); hideSugg(); } }
  else if (ev.key === 'Escape') hideSugg();
});

// ---------- reference view (same standard as the table above) -------------------------------
var refsRendered = false;
function rtab(cols, rows) {
  return '<table class="rtab"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + cols.length + '" class="d">—</td></tr>') + '</tbody></table>';
}
function rsec(id, title, n, table) {
  return '<section class="rsec' + (refsOpen[id] ? ' open' : '') + '" id="sec-' + id + '">' +
    '<div class="rhead" data-sec="' + id + '"><span class="caret">' + (refsOpen[id] ? '▾' : '▸') + '</span>' +
    '<h3>' + esc(title) + '</h3><span class="cnt">' + n + '</span>' +
    '<span class="hint">' + esc(tt('clickHint')) + '</span></div>' +
    '<div class="rbody">' + table + '</div></section>';
}
function sortRows(rows, key, nameOf) {
  var by = refsSort[key];
  return rows.slice().sort(function (a, b) {
    return by === 'count' ? (b.n - a.n || String(nameOf(a)).localeCompare(String(nameOf(b)), 'ru'))
      : (String(nameOf(a)).localeCompare(String(nameOf(b)), 'ru') || b.n - a.n);
  });
}
function renderRefs() {
  var box = document.getElementById('rbody'); if (!box) return;
  var f = (document.getElementById('rq').value || '').trim().toLowerCase();
  function hit() {
    if (!f) return true;
    for (var i = 0; i < arguments.length; i++) if (String(arguments[i] || '').toLowerCase().indexOf(f) >= 0) return true;
    return false;
  }
  var A = REFS.abbr.filter(function (x) { return hit(x.a, x.zh); });
  var N = REFS.nicks.filter(function (x) { return hit(x.s, tr(x.s), x.zh); });
  var O = REFS.orgs.filter(function (x) { return hit(x.zh, x.ru, x.city); });
  var T = REFS.types.filter(function (x) { return hit(x.t, x.zh, x.ru); });
  var nav = document.getElementById('rnav');
  var sortMode = refsSort.abbr === 'count' ? 'count' : 'name';
  nav.innerHTML = '<span class="rlab">' + esc(tt('sortBy')) + '</span>' +
    '<button type="button" id="rsortbtn">' + esc(sortMode === 'count' ? tt('sortCount') : tt('sortName')) + '</button>' +
    ['abbr', 'nick', 'org', 'type'].map(function (k) {
      return '<button type="button"' + (refsOpen[k] ? ' class="on"' : '') + ' data-sec="' + k + '">' +
        ({ abbr: tt('secAbbr'), nick: tt('secNick'), org: tt('secOrg'), type: tt('secType') })[k].replace(/（.*?）|\(.*?\)/g, '') +
        ' · ' + ({ abbr: A, nick: N, org: O, type: T })[k].length + '</button>';
    }).join('');
  box.innerHTML =
    rsec('abbr', tt('secAbbr'), A.length, rtab(STR[LANG].thAbbr,
      sortRows(A, 'abbr', function (x) { return x.a; }).map(function (a) {
        return '<tr data-jump="abbr" data-v="' + esc(a.a) + '"><td class="k">' + esc(a.a) + '</td><td>' + esc(a.zh) + '</td><td class="n">' + a.n + '</td></tr>';
      }))) +
    rsec('nick', tt('secNick'), N.length, rtab(STR[LANG].thNick,
      sortRows(N, 'nick', function (x) { return x.s; }).map(function (n) {
        return '<tr data-jump="nick" data-v="' + esc(n.s) + '"><td class="k">' + esc(n.s) + '</td><td>' + esc(n.zh || '') + '</td><td class="d">' + esc(tr(n.s)) + '</td><td class="n">' + n.n + '</td></tr>';
      }))) +
    rsec('org', tt('secOrg'), O.length, rtab(STR[LANG].thOrg,
      sortRows(O, 'org', function (x) { return x.zh; }).map(function (o) {
        return '<tr data-jump="org" data-v="' + esc(o.id) + '"><td class="k">' + esc(o.zh) + '</td><td>' + esc(o.ru) + '</td>' +
          '<td class="d">' + esc(o.city) + '</td><td class="n">' + o.n + '</td></tr>';
      }))) +
    rsec('type', tt('secType'), T.length, rtab(STR[LANG].thType,
      sortRows(T, 'type', function (x) { return LANG === 'zh' ? x.zh : x.ru; }).map(function (t) {
        return '<tr data-jump="type" data-v="' + esc(t.t) + '"><td class="k">' + esc(LANG === 'zh' ? t.zh : t.ru) + '</td>' +
          '<td class="d">' + esc(LANG === 'zh' ? t.ru : t.zh) + '</td><td class="d">' + esc(t.t) + '</td><td class="n">' + t.n + '</td></tr>';
      })));
  document.getElementById('rcount').textContent = (f ? (LANG === 'zh' ? '筛选 ' : 'фильтр ') : '') +
    (A.length + N.length + O.length + T.length) + ' ' + tt('refsUnit');
}
document.getElementById('rnav').addEventListener('click', function (ev) {
  if (ev.target.closest('#rsortbtn')) {
    var flip = refsSort.abbr === 'count' ? 'name' : 'count';
    ['abbr', 'nick', 'org', 'type'].forEach(function (k) { refsSort[k] = flip; });
    refsRendered = true; renderRefs();
    return;
  }
  var b = ev.target.closest('[data-sec]'); if (!b) return;
  var k = b.getAttribute('data-sec');
  refsOpen[k] = !refsOpen[k];
  try { store('grauRefSecs', JSON.stringify(refsOpen)); } catch (e) {}
  refsRendered = true; renderRefs();
});
document.getElementById('rbody').addEventListener('click', function (ev) {
  var head = ev.target.closest('.rhead');
  if (head) {
    var k = head.getAttribute('data-sec');
    refsOpen[k] = !refsOpen[k];
    try { store('grauRefSecs', JSON.stringify(refsOpen)); } catch (e) {}
    var sec = document.getElementById('sec-' + k);
    sec.classList.toggle('open', refsOpen[k]);
    head.querySelector('.caret').textContent = refsOpen[k] ? '▾' : '▸';
    return;
  }
  var tr2 = ev.target.closest('tr[data-jump]');
  if (!tr2) return;
  var kind = tr2.getAttribute('data-jump'), v = tr2.getAttribute('data-v');
  setView('index');
  if (kind === 'abbr' || kind === 'nick') { qEl.value = v; q = key2(v); render(); }
  else if (kind === 'org') setFilter('org', v);
  else if (kind === 'type') setFilter('type', v);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.getElementById('rq').addEventListener('input', function () { refsRendered = true; renderRefs(); });

// ---------- bibliography view (complete list of sources, generated at build time) ------------
var bibRendered = false, bibCat = '';
var BIB_CAT_RU = {
  '基础目录': 'Основные каталоги', '其他总局目录来源': 'Каталоги других управлений',
  '卡片层': 'Слой карточек', '网络补充层': 'Сетевой слой', '构建用参考资料': 'Материалы сборки',
  '卡片层·维基条目 (ru)': 'Слой карточек · статьи Википедии (ru)',
  '卡片层·RWD 页面': 'Слой карточек · страницы RWD',
  '卡片层·其他条目': 'Слой карточек · прочие записи',
  '网络补充层·链接': 'Сетевой слой · ссылки'
};
function catLabel(c) { return LANG === 'zh' ? c : (BIB_CAT_RU[c] || c); }
function bibData() {
  try { return JSON.parse(document.getElementById('grau-bib-data').textContent) || []; } catch (e) { return []; }
}
function renderBib() {
  var box = document.getElementById('bbody'); if (!box) return;
  var data = bibData(), q = (document.getElementById('bq').value || '').trim().toLowerCase();
  var cats = [], map = {};
  data.forEach(function (r) {
    if (!map[r.cat]) { map[r.cat] = []; cats.push(r.cat); }
    map[r.cat].push(r);
  });
  var nav = document.getElementById('bnav');
  nav.innerHTML = '<button type="button" class="' + (bibCat ? '' : 'on') + '" data-bc="">' + esc(tt('bibAll')) +
    '<em>' + data.length + '</em></button>' + cats.map(function (c) {
      return '<button type="button" class="' + (bibCat === c ? 'on' : '') + '" data-bc="' + esc(c) + '">' +
        esc(catLabel(c)) + '<em>' + map[c].length + '</em></button>';
    }).join('');
  var html = '', shown = 0;
  cats.forEach(function (c) {
    if (bibCat && bibCat !== c) return;
    var list = map[c].filter(function (r) {
      if (!q) return true;
      return (r.title + ' ' + r.url + ' ' + r.note).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) return;
    shown += list.length;
    var isTable = c.indexOf('·') < 0;
    html += '<section class="bcat"><h3>' + esc(catLabel(c)) + '<em>' + list.length + '</em></h3>';
    if (isTable) {
      html += '<table><tbody>' + list.map(function (r) {
        return '<tr><td class="n">' + esc(r.title) + '</td><td>' +
          (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url) + '</a>' : '—') +
          '</td><td>' + esc(r.note || '') + (r.n ? ' <span class="bnote">' + r.n + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
    } else {
      html += '<ol>' + list.map(function (r) {
        return '<li><b>' + esc(r.title) + '</b>' +
          (r.url ? ' — <a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url) + '</a>' : '') +
          (r.note ? ' — ' + esc(r.note) : '') + '</li>';
      }).join('') + '</ol>';
    }
    html += '</section>';
  });
  box.innerHTML = html || '<p class="d">' + esc(tt('none')) + '</p>';
  var cnt = document.getElementById('bcount');
  if (cnt) cnt.textContent = shown + ' ' + tt('bibUnit');
}
document.getElementById('bnav').addEventListener('click', function (ev) {
  var b = ev.target.closest ? ev.target.closest('button[data-bc]') : null;
  if (!b) return;
  bibCat = b.getAttribute('data-bc') || '';
  renderBib();
});
document.getElementById('bq').addEventListener('input', function () { bibRendered = true; renderBib(); });

// ---------- v1.4.2.1: 字头含义视图 ------------------------------------------------------------
var prefGrp = 'all', prefSortBy = 'name', prefRendered = false, _famAll = null, _serAll = null;
function allFamCounts() {                      // 全库（不受筛选影响）的「大类×字头」条数
  if (_famAll) return _famAll;
  var out = {};
  ALL.forEach(function (e) {
    var s = SER[e[8]]; if (!s) return;
    var k = famKey(s.key, e[7]); out[k] = (out[k] || 0) + 1;
  });
  _famAll = out; return out;
}
function allSeriesCounts() {
  if (_serAll) return _serAll;
  var out = {};
  ALL.forEach(function (e) { out[e[8]] = (out[e[8]] || 0) + 1; });
  _serAll = out; return out;
}
function prefGroupList() {
  var out = [], map = {}, counts = allFamCounts();
  SER.forEach(function (s) {
    var g = s.grp || '';
    if (!map[g]) { map[g] = { g: g, zh: s.grpZh || g, ru: s.grpRu || g, n: 0, k: 0 }; out.push(map[g]); }
    map[g].k++;
    (s.prefixes || []).forEach(function (p) { map[g].n += counts[famKey(s.key, p)] || 0; });
  });
  return out;
}
function prefGrpLabel(g) { return LANG === 'zh' ? (g.zh || g.g) : (g.ru || g.g); }
function prefDeptNote(s) {
  var k = s.kind === 'num' ? String(s.n) : (s.key || '');
  var rec = PGD[k] || PGD[s.key];
  if (rec) return rec;
  // 合并后的大类（老 ГАУ = 一个大类，其字头就是 51…58 局号）：把各局号的含义拼起来
  var parts = [], srcs = [], quotes = [];
  (s.prefixes || []).forEach(function (p) {
    var r = PGD[p]; if (!r) return;
    parts.push(p + ' — ' + (LANG === 'zh' ? (r.zh || r.ru || '') : (r.ru || r.zh || '')));
    if (r.src) srcs.push(r.src);
    if (r.quote) quotes.push(r.quote);
  });
  if (!parts.length) return null;
  return { zh: parts.join('；'), ru: parts.join('; '), src: srcs.join(' '), quote: quotes.join(' ') };
}
function prefRowCells(r) {
  var mean = prefMean(r.p);
  var rec = prefRec(r.p);
  var src = rec ? (rec.src || '') : '';
  var conf = rec ? String(rec.conf || 'B') : 'C';
  var confLbl = { A: tt('prefConfA'), B: tt('prefConfB'), C: tt('prefConfC') }[conf] || conf;
  var meanHtml = mean
    ? '<span class="pmean">' + esc(mean) + '</span> <i class="pconf p' + conf + '" title="' + esc(confLbl) + '">' + esc(confLbl) + '</i>'
    : '<i class="miss">' + esc(tt('prefNone')) + '</i>';
  return '<tr><td class="k">' + esc(r.p) + '</td><td>' + esc(seriesShort(r.i)) + '</td><td class="n">' + r.n + '</td>' +
    '<td>' + meanHtml + '</td><td class="d">' + (src ? esc(src) : '—') + '</td></tr>';
}
function renderPref() {
  var box = document.getElementById('pbody'); if (!box) return;
  var f = (document.getElementById('pq').value || '').trim().toLowerCase();
  function hit() {
    if (!f) return true;
    for (var i = 0; i < arguments.length; i++) if (String(arguments[i] || '').toLowerCase().indexOf(f) >= 0) return true;
    return false;
  }
  var counts = allFamCounts(), serN = allSeriesCounts();
  var groups = prefGroupList();
  var nav = document.getElementById('pnav');
  if (nav) {
    nav.innerHTML = '<button type="button" class="' + (prefGrp === 'all' ? 'on' : '') + '" data-pg="">' + esc(tt('pickAll')) +
      '<em>' + groups.reduce(function (a, g) { return a + g.n; }, 0) + '</em></button>' +
      groups.map(function (g) {
        return '<button type="button" class="' + (prefGrp === g.g ? 'on' : '') + '" data-pg="' + esc(g.g) + '">' +
          esc(prefGrpLabel(g)) + '<em>' + g.n + '</em></button>';
      }).join('') +
      '<button type="button" id="psortbtn">' + esc(prefSortBy === 'count' ? tt('sortCount') : tt('sortName')) + '</button>';
  }
  // 序列（局号 / 大类）含义
  var drows = [];
  SER.forEach(function (s, i) {
    if (prefGrp !== 'all' && (s.grp || '') !== prefGrp) return;
    var rec = prefDeptNote(s), mean = rec ? (LANG === 'zh' ? (rec.zh || rec.ru || '') : (rec.ru || rec.zh || '')) : '';
    if (!hit(s.shortZh, s.shortRu, s.zh, s.ru, mean, rec && rec.src, rec && rec.quote)) return;
    drows.push('<tr><td class="k">' + esc(LANG === 'zh' ? (s.shortZh || s.zh) : (s.shortRu || s.ru)) + '</td>' +
      '<td class="n">' + (serN[i] || 0) + '</td><td>' + (mean ? esc(mean) : '<i class="miss">' + esc(tt('prefNone')) + '</i>') + '</td>' +
      '<td class="d">' + (rec && rec.src ? esc(rec.src) : '—') + '</td></tr>');
  });
  // 字头含义
  var rows = [];
  SER.forEach(function (s, i) {
    if (prefGrp !== 'all' && (s.grp || '') !== prefGrp) return;
    (s.prefixes || []).forEach(function (p) {
      var n = counts[famKey(s.key, p)] || 0; if (!n) return;
      var rec = prefRec(p), mean = prefMean(p);
      if (!hit(p, tr(p), mean, rec && rec.src, rec && rec.quote, seriesShort(i), seriesLabel(i))) return;
      rows.push({ p: p, i: i, n: n });
    });
  });
  rows.sort(function (a, b) {
    if (prefSortBy === 'count') return b.n - a.n || a.i - b.i || natCmp(a.p, b.p);
    return a.i - b.i || natCmp(a.p, b.p);
  });
  box.innerHTML =
    '<section class="bcat"><h3>' + esc(tt('prefDeptSec')) + '<em>' + drows.length + '</em></h3>' +
    rtab(STR[LANG].thPrefDept, drows) + '</section>' +
    '<section class="bcat"><h3>' + esc(tt('prefLettSec')) + '<em>' + rows.length + '</em></h3>' +
    rtab(STR[LANG].thPrefLett, rows.map(prefRowCells)) + '</section>';
  var cnt = document.getElementById('pcount');
  if (cnt) cnt.textContent = (f ? (LANG === 'zh' ? '筛选 ' : 'фильтр ') : '') + (drows.length + rows.length) + ' ' + tt('prefUnit');
}
(function () {
  var nav = document.getElementById('pnav');
  if (nav) nav.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('#psortbtn')) {
      prefSortBy = prefSortBy === 'count' ? 'name' : 'count';
      prefRendered = true; renderPref(); return;
    }
    var b = ev.target.closest ? ev.target.closest('[data-pg]') : null;
    if (!b) return;
    prefGrp = b.getAttribute('data-pg') || 'all';
    prefRendered = true; renderPref();
  });
  var pq = document.getElementById('pq');
  if (pq) pq.addEventListener('input', function () { prefRendered = true; renderPref(); });
})();

// ---------- views ---------------------------------------------------------------------------
function setView(v) {
  VIEW = v;
  var isRefs = v === 'refs', isBib = v === 'bib', isPref = v === 'pref';
  document.body.classList.toggle('view-refs', isRefs);
  document.body.classList.toggle('view-bib', isBib);
  document.body.classList.toggle('view-pref', isPref);
  document.getElementById('view-index').hidden = isRefs || isBib || isPref;
  document.getElementById('view-refs').hidden = !isRefs;
  document.getElementById('view-bib').hidden = !isBib;
  document.getElementById('view-pref').hidden = !isPref;
  document.getElementById('btn-view-index').classList.toggle('on', !isRefs && !isBib && !isPref);
  document.getElementById('btn-view-refs').classList.toggle('on', isRefs);
  document.getElementById('btn-view-bib').classList.toggle('on', isBib);
  document.getElementById('btn-view-pref').classList.toggle('on', isPref);
  if (isRefs && !refsRendered) { renderRefs(); refsRendered = true; }
  if (isBib && !bibRendered) { renderBib(); bibRendered = true; }
  if (isPref && !prefRendered) { renderPref(); prefRendered = true; }
  store('grauView', v);
  window.scrollTo(0, 0);
}
document.getElementById('btn-view-index').addEventListener('click', function () { setView('index'); });
document.getElementById('btn-view-refs').addEventListener('click', function () { setView('refs'); });
document.getElementById('btn-view-bib').addEventListener('click', function () { setView('bib'); });
document.getElementById('btn-view-pref').addEventListener('click', function () { setView('pref'); });

// ---------- language (the Russian version is a sub-page of this same file) -------------------
function applyLang() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'ru';
  document.title = STR[LANG].docTitle;
  function setLabel(el, v) {
    if (el.querySelector('em') && el.childNodes.length) el.childNodes[0].nodeValue = v;
    else el.textContent = v;
  }
  document.querySelectorAll('[data-t]').forEach(function (el) { setLabel(el, STR[LANG][el.getAttribute('data-t')]); });
  document.querySelectorAll('[data-th]').forEach(function (el) { el.innerHTML = STR[LANG][el.getAttribute('data-th')]; });
  document.querySelectorAll('.fk[data-zh], .grptag[data-zh]').forEach(function (el) {
    setLabel(el, LANG === 'zh' ? el.getAttribute('data-zh') : el.getAttribute('data-ru'));
  });
  document.querySelectorAll('[data-tp]').forEach(function (el) { el.placeholder = STR[LANG][el.getAttribute('data-tp')]; });
  document.querySelectorAll('[data-t-title]').forEach(function (el) { el.title = STR[LANG][el.getAttribute('data-t-title')]; });
  document.getElementById('qfam').placeholder = tt('famFilter');
  document.getElementById('tot').textContent = STR[LANG].total.replace('%N%', ALL.length);
  document.getElementById('btn-lang-zh').classList.toggle('on', LANG === 'zh');
  document.getElementById('btn-lang-ru').classList.toggle('on', LANG === 'ru');
  document.documentElement.style.fontFamily = LANG === 'zh'
    ? '"Microsoft YaHei","PingFang SC","Noto Sans SC","Segoe UI",Roboto,system-ui,sans-serif'
    : '"Segoe UI",Roboto,"Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  buildSug(); populateFams(); updateRowVals(); renderFilterBar(); render(); renderPhotos();
  var wc = document.getElementById('wcard');
  if (wc && !wc.hidden && wc.getAttribute('data-w')) openWiki(wc.getAttribute('data-w'));
  var oc = document.getElementById('othcard');
  if (oc && !oc.hidden) othRender();
  if (refsRendered) renderRefs();
  if (bibRendered) renderBib();
  if (prefRendered) renderPref();
  store('grauLang', LANG);
}
function setLang(l) { LANG = l; applyLang(); }
document.getElementById('btn-lang-zh').addEventListener('click', function () { setLang('zh'); });
document.getElementById('btn-lang-ru').addEventListener('click', function () { setLang('ru'); });

// ---------- cyrillic / latin ----------------------------------------------------------------
document.getElementById('btn-cyr').addEventListener('click', function () { latMode = false; this.classList.add('on'); document.getElementById('btn-lat').classList.remove('on'); render(); });
document.getElementById('btn-lat').addEventListener('click', function () { latMode = true; this.classList.add('on'); document.getElementById('btn-cyr').classList.remove('on'); render(); });

// ---------- theme ----------------------------------------------------------------------------
var th = document.getElementById('theme');
function setTheme(light) {
  document.body.classList.toggle('light', light);
  store('grauTheme', light ? 'light' : 'dark');
}
th.addEventListener('click', function () { setTheme(!document.body.classList.contains('light')); });

// ---------- background image: fitting, tone, readability ---------------------------------------
// BG holds every background setting; the CSS layers read them as custom properties:
//   body::before  the picture itself (size / position / repeat / attachment / colour filters)
//   body::after   the readability veil (dim, tint, vignette, blur)
var BG = { u: '', d: 62, b: 2, n: '', size: 'cover', pos: 'center center', fix: true,
  bright: 1, contrast: 1, sat: 1, gray: 0, vig: false, tint: 'neutral', card: false,
  wrap: 1300, panelA: 0.92, align: 'center', rot: 0 };
var bgEls = {}, bgRotEl = null;
function bgNum(id, fallback) { var e = document.getElementById(id); return e ? Number(e.value) / 100 : fallback; }
function bgMsg(s) {
  var m = document.getElementById('bgmsg');
  if (!m) return;
  m.hidden = !s; m.textContent = s || '';
}
function applyBgState(patch, opts) {
  patch = patch || {};
  Object.keys(patch).forEach(function (k) { if (patch[k] !== undefined) BG[k] = patch[k]; });
  var b = document.body;
  b.classList.toggle('al-left', BG.align === 'left');
  b.classList.toggle('al-right', BG.align === 'right');
  b.style.setProperty('--wrap-max', String(BG.wrap) === '100' ? '100%' : (BG.wrap + 'px'));
  b.style.setProperty('--panel-a', String(BG.panelA));
  if (!BG.u) {
    b.classList.remove('bgimg', 'vig', 'bgcard');
    b.style.removeProperty('--bgimg');
    persistBg();
    syncBgControls();
    renderPhotos();
    return;
  }
  b.style.setProperty('--bgimg', 'url("' + BG.u.replace(/"/g, '%22') + '")');
  b.classList.add('bgimg');
  b.classList.toggle('vig', !!BG.vig);
  b.classList.toggle('bgcard', !!BG.card);
  b.style.setProperty('--bgsize', BG.size);
  b.style.setProperty('--bgpos', BG.pos);
  b.style.setProperty('--bgrep', BG.size === 'repeat' ? 'repeat' : 'no-repeat');
  b.style.setProperty('--bgatt', BG.fix ? 'fixed' : 'scroll');
  b.style.setProperty('--bgbright', BG.bright);
  b.style.setProperty('--bgcontrast', BG.contrast);
  b.style.setProperty('--bgsat', BG.sat);
  b.style.setProperty('--bggray', BG.gray);
  b.style.setProperty('--bgdim-c', BG.tint === 'cool' ? '8,14,26' : (BG.tint === 'warm' ? '26,16,8' : '8,11,15'));
  b.style.setProperty('--bgdim-a', (BG.d / 100).toFixed(2));
  b.style.setProperty('--bgdim-la', (BG.d / 100 * 0.82).toFixed(2));
  b.style.setProperty('--bgblur', BG.b + 'px');
  persistBg();
  syncBgControls();
  if (BG.rot !== undefined) { if (bgRotEl && bgRotEl.value !== String(BG.rot)) bgRotEl.value = String(BG.rot); applyRotation(Number(BG.rot) || 0); }
  if (!opts || opts.recent !== false) renderPhotos();
}
function persistBg() {
  try {
    // layout (width / panel opacity) is independent of the picture, so it keeps its own key
    store('grauLayout', JSON.stringify({ wrap: BG.wrap, panelA: BG.panelA, align: BG.align, rot: BG.rot }));
    if (BG.u) store('grauBg', JSON.stringify(BG));
    else localStorage.removeItem('grauBg');
  } catch (e) {}
}
function syncBgControls() {
  var set = function (id, v) { var e = document.getElementById(id); if (e) e.value = String(v); };
  set('bgwrap', String(BG.wrap)); set('bgpane', Math.round(BG.panelA * 100));
  ['al-left', 'al-center', 'al-right'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) e.classList.toggle('on', id === 'al-' + BG.align);
  });
  set('bgdim', BG.d); set('bgblur', BG.b);
  set('bgbright', Math.round(BG.bright * 100)); set('bgcontrast', Math.round(BG.contrast * 100));
  set('bgsat', Math.round(BG.sat * 100)); set('bggray', Math.round(BG.gray * 100));
  var sel = document.getElementById('bgsize'); if (sel) sel.value = BG.size === 'repeat' ? 'repeat' : BG.size;
  var tin = document.getElementById('bgtint'); if (tin) tin.value = BG.tint;
  var fx = document.getElementById('bgfix'); if (fx) fx.checked = !!BG.fix;
  var vg = document.getElementById('bgvig'); if (vg) vg.checked = !!BG.vig;
  var cd = document.getElementById('bgcard'); if (cd) cd.checked = !!BG.card;
  document.querySelectorAll('#bgpos button').forEach(function (btn) {
    btn.classList.toggle('on', btn.getAttribute('data-pos') === BG.pos);
  });
}
// 3x3 position picker
(function () {
  var box = document.getElementById('bgpos');
  if (!box) return;
  var xs = ['left', 'center', 'right'], ys = ['top', 'center', 'bottom'], html = '';
  ys.forEach(function (y) { xs.forEach(function (x) { html += '<button type="button" data-pos="' + x + ' ' + y + '"></button>'; }); });
  box.innerHTML = html;
  box.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    applyBgState({ pos: b.getAttribute('data-pos') });
  });
})();
// ---------- photo bar: a small showcase of background pictures ----------
// IndexedDB is unavailable for file:// pages, so the gallery lives in localStorage with a byte
// budget: each entry keeps a shrunk JPEG plus a tiny thumbnail.
var PHOTO_BUDGET = 3.4 * 1024 * 1024;
function photos() { try { return JSON.parse(load('grauPhotos') || '[]'); } catch (e) { return []; } }
function savePhotos(list) {
  var total = 0, kept = [];
  for (var i = 0; i < list.length; i++) {
    total += (list[i].full || '').length;
    if (total > PHOTO_BUDGET && kept.length) { bgMsg(tt('photoUse') + ' ' + (total / 1048576).toFixed(1) + ' MB — ' + tt('remove')); break; }
    kept.push(list[i]);
  }
  try { store('grauPhotos', JSON.stringify(kept)); } catch (e) { bgMsg('localStorage: ' + (e && e.name || 'error')); }
  return kept;
}
function shrinkTo(url, max, quality, cb) {
  var im = new Image();
  im.onload = function () {
    try {
      var w = im.width, h = im.height;
      if (w > max) { h = Math.round(h * max / w); w = max; }
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      cb(cv.toDataURL('image/jpeg', quality), w, h);
    } catch (e) { cb('', 0, 0); }
  };
  im.onerror = function () { cb('', 0, 0); };
  im.src = url;
}
function photoAdd(full, name) {
  if (!full) return;
  shrinkTo(full, 240, 0.6, function (thumb) {
    var list = photos().filter(function (x) { return x.full !== full; });
    list.unshift({ id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), n: name || '', t: thumb, full: full });
    savePhotos(list);
    renderPhotos();
  });
}
function renderPhotos() {
  var box = document.getElementById('photobar');
  if (!box) return;
  var list = photos(), used = 0;
  list.forEach(function (x) { used += (x.full || '').length; });
  var strip = list.map(function (x, i) {
    return '<span class="ph' + (x.full === BG.u ? ' on' : '') + '" data-id="' + esc(x.id) + '" title="' + esc(x.n || '') + '">' +
      '<img src="' + (x.t || x.full) + '" alt="">' +
      '<i class="no">' + (i + 1) + '</i>' +
      '<button type="button" class="z" data-zoom="' + esc(x.id) + '" title="' + esc(tt('preview')) + '">⤢</button>' +
      '<button type="button" class="x" data-del="' + esc(x.id) + '" title="' + esc(tt('remove')) + '">×</button></span>';
  }).join('');
  box.innerHTML = (list.length ? strip : '<span class="empty">' + esc(tt('photoEmpty')) + '</span>') +
    (list.length ? '<span class="cnt">' + list.length + ' · ' + (used / 1048576).toFixed(1) + ' MB</span>' : '');
}
document.getElementById('photobar').addEventListener('click', function (ev) {
  var del = ev.target.closest('[data-del]');
  if (del) {
    var id = del.getAttribute('data-del');
    savePhotos(photos().filter(function (x) { return x.id !== id; }));
    renderPhotos();
    return;
  }
  var zoom = ev.target.closest('[data-zoom]');
  if (zoom) {
    var z = photos().filter(function (x) { return x.id === zoom.getAttribute('data-zoom'); })[0];
    if (z) { var lb = document.getElementById('lbox'); lb.querySelector('img').src = z.full; lb.querySelector('.cap').textContent = z.n || ''; lb.hidden = false; }
    return;
  }
  var ph = ev.target.closest('.ph');
  if (!ph) return;
  var it = photos().filter(function (x) { return x.id === ph.getAttribute('data-id'); })[0];
  if (!it) return;
  bgUrl.value = it.full.indexOf('http') === 0 ? it.full : '';
  bgName.textContent = it.n || '';
  applyBgState({ u: it.full, n: it.n || '' });
});
document.getElementById('lbox').addEventListener('click', function () { this.hidden = true; });
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') document.getElementById('lbox').hidden = true; });
var wcardEl = document.getElementById('wcard');
if (wcardEl) {
  wcardEl.addEventListener('click', function (ev) {
    var lb = ev.target.closest('.wc-langs button[data-l]');
    if (lb) { openWiki(wcardEl.getAttribute('data-w'), lb.getAttribute('data-l')); return; }
    if (!ev.target.closest('.wc-in')) closeWiki();
  });
  document.getElementById('wcClose').addEventListener('click', closeWiki);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeWiki(); });
}
// adding several files at once
document.getElementById('bgfile2').addEventListener('change', function () {
  var fs2 = this.files; if (!fs2 || !fs2.length) return;
  [].slice.call(fs2).forEach(function (f) {
    var fr = new FileReader();
    fr.onload = function () { shrinkTo(fr.result, 1920, 0.78, function (full, w, h) { if (full) photoAdd2(full, f.name, w, h); }); };
    fr.readAsDataURL(f);
  });
  this.value = '';
});
function photoAdd2(full, name, w, h) {
  shrinkTo(full, 240, 0.6, function (thumb) {
    var list = photos();
    list.unshift({ id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), n: name || '', t: thumb, full: full });
    list = savePhotos(list);
    renderPhotos();
    if (list.length === 1 || !BG.u) { bgName.textContent = name || ''; applyBgState({ u: full, n: name || '' }); }
  });
}
// rotation through the gallery
var rotTimer = null;
function applyRotation(sec) {
  if (rotTimer) { clearInterval(rotTimer); rotTimer = null; }
  if (!sec) return;
  rotTimer = setInterval(function () {
    var list = photos();
    if (list.length < 2) return;
    var i = 0;
    for (var k = 0; k < list.length; k++) if (list[k].full === BG.u) { i = k; break; }
    var nx = list[(i + 1) % list.length];
    applyBgState({ u: nx.full, n: nx.n || '' });
  }, sec * 1000);
}
var bgRot = document.getElementById('bgrot');
if (bgRot) bgRot.addEventListener('change', function () { applyBgState({ rot: Number(this.value) }); });
// read the picture's average brightness and pick readable settings for it
function autoFit() {
  if (!BG.u) return;
  bgMsg('');
  var im = new Image();
  if (BG.u.indexOf('http') === 0) im.crossOrigin = 'anonymous';
  im.onload = function () {
    var data;
    try {
      var cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
      var ctx = cv.getContext('2d');
      ctx.drawImage(im, 0, 0, 32, 32);
      data = ctx.getImageData(0, 0, 32, 32).data;
    } catch (e) { bgMsg(tt('bgNoRead')); return; }
    var sum = 0, n = 0;
    for (var i = 0; i < data.length; i += 4) { sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++; }
    var lum = sum / n / 255;
    var dim = lum > 0.62 ? 60 : (lum > 0.38 ? 48 : 28);
    if (lum > 0.78) { setTheme(true); dim = 42; }           // very bright photo: light theme + white veil
    else setTheme(false);
    var blur = lum > 0.62 ? 4 : 2;
    applyBgState({ d: dim, b: blur, bright: lum > 0.5 ? 0.95 : 1.05, contrast: 1.05, sat: 1, gray: 0 });
  };
  im.onerror = function () { bgMsg(tt('bgNoRead')); };
  im.src = BG.u;
}
var bgBtn = document.getElementById('bgbtn'), bgUrl = document.getElementById('bgurl'), bgFile = document.getElementById('bgfile'),
  bgName = document.getElementById('bgname');
bgBtn.addEventListener('click', function () { document.getElementById('hdr').classList.toggle('openbg'); this.classList.toggle('on'); });
bgFile.addEventListener('change', function () {
  var f = bgFile.files && bgFile.files[0]; if (!f) return;
  bgName.textContent = f.name;
  var fr = new FileReader();
  fr.onload = function () {
    var im = new Image();
    im.onload = function () {
      var w = im.width, h = im.height, max = 1600;
      if (w > max) { h = Math.round(h * max / w); w = max; }
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      var u = cv.toDataURL('image/jpeg', 0.78);
      bgUrl.value = '';
      photoAdd(u, f.name);
      applyBgState({ u: u, n: f.name });
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(f);
});
document.getElementById('bgapply').addEventListener('click', function () {
  var v = bgUrl.value.trim();
  if (!v) return;
  photoAdd(v, v.slice(-40));
  applyBgState({ u: v, n: v.slice(-40) });
});
document.getElementById('bgclear').addEventListener('click', function () {
  applyBgState({ u: '' }); bgUrl.value = ''; bgName.textContent = ''; bgMsg('');
});
document.getElementById('bgauto').addEventListener('click', autoFit);
bgRotEl = document.getElementById('bgrot');
['al-left', 'al-center', 'al-right'].forEach(function (id) {
  var e = document.getElementById(id);
  if (e) e.addEventListener('click', function () { applyBgState({ align: id.replace('al-', '') }); });
});
var bgWrap = document.getElementById('bgwrap');
if (bgWrap) bgWrap.addEventListener('change', function () { applyBgState({ wrap: this.value === '100' ? '100' : Number(this.value) }); });
var bgPane = document.getElementById('bgpane');
if (bgPane) bgPane.addEventListener('input', function () { applyBgState({ panelA: Number(this.value) / 100 }, { recent: false }); });
['bgbright', 'bgcontrast', 'bgsat', 'bggray', 'bgdim', 'bgblur'].forEach(function (id) {
  var e = document.getElementById(id);
  if (!e) return;
  e.addEventListener('input', function () {
    var patch = {};
    patch.bright = bgNum('bgbright', 1); patch.contrast = bgNum('bgcontrast', 1);
    patch.sat = bgNum('bgsat', 1); patch.gray = bgNum('bggray', 0);
    patch.d = Number(document.getElementById('bgdim').value);
    patch.b = Number(document.getElementById('bgblur').value);
    applyBgState(patch, { recent: false });
  });
});
[['bgsize', 'size', function (v) { return v; }], ['bgtint', 'tint', function (v) { return v; }]].forEach(function (p) {
  var e = document.getElementById(p[0]);
  if (e) e.addEventListener('change', function () { var patch = {}; patch[p[1]] = p[2](e.value); applyBgState(patch); });
});
['bgfix', 'bgvig', 'bgcard'].forEach(function (id) {
  var e = document.getElementById(id);
  if (!e) return;
  e.addEventListener('change', function () {
    var patch = {};
    patch[id === 'bgfix' ? 'fix' : (id === 'bgvig' ? 'vig' : 'card')] = e.checked;
    applyBgState(patch);
  });
});
[['bgread', { d: 72, b: 8, bright: 0.92, contrast: 1.06, sat: 0.9, gray: 0, vig: true, card: true }],
 ['bgphoto', { d: 18, b: 0, bright: 1.06, contrast: 1.04, sat: 1.12, gray: 0, vig: false, card: false }],
 ['bgnight', { d: 58, b: 3, bright: 0.85, contrast: 1.05, sat: 0.85, gray: 0.15, vig: true, card: false, tint: 'cool' }]
].forEach(function (p) {
  var e = document.getElementById(p[0]);
  if (e) e.addEventListener('click', function () { if (p[0] === 'bgnight') setTheme(false); applyBgState(p[1]); });
});

// ---------- back to top ------------------------------------------------------------------------
var topBtn = document.getElementById('top');
window.addEventListener('scroll', function () { topBtn.classList.toggle('on', window.scrollY > 400); }, { passive: true });
topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

// ---------- boot -------------------------------------------------------------------------------
try {
  LANG = load('grauLang') === 'ru' || location.hash === '#ru' ? 'ru' : 'zh';
  F.lit = load('grauLit') || 'all';
  F.wiki = load('grauWiki') || 'all';
  document.body.classList.toggle('chips', load('grauChips') === '1');
  setTheme(load('grauTheme') === 'light');
  try {
    var rs = JSON.parse(load('grauRows') || '{}');
    Object.keys(rs).forEach(function (id) { setRowCollapsed(id, !!rs[id]); });
  } catch (e) {}
  try {
    var ro = JSON.parse(load('grauRefSecs') || 'null');
    if (ro) Object.keys(ro).forEach(function (k) { refsOpen[k] = !!ro[k]; });
  } catch (e) {}
  try {
    var lay = JSON.parse(load('grauLayout') || 'null');
    if (lay) { ['wrap', 'panelA', 'align', 'rot'].forEach(function (k) { if (lay[k] !== undefined) BG[k] = lay[k]; }); }
  } catch (e) {}
  try {
    var sb = JSON.parse(load('grauBg') || 'null');
    if (sb && sb.u) {
      Object.keys(sb).forEach(function (k) { if (BG[k] !== undefined) BG[k] = sb[k]; });
      if (sb.u.indexOf('http') === 0) bgUrl.value = sb.u;
      bgName.textContent = sb.n || '';
    }
  } catch (e) {}
  applyLang();                       // fills every label, then renders
  applyBgState({}, { recent: false });// applies the restored background (or none)
  renderPhotos();
  if (bgRotEl) bgRotEl.value = String(BG.rot || 0);
  var sv = load('grauView');
  setView(sv === 'refs' ? 'refs' : (sv === 'bib' ? 'bib' : 'index'));
  document.getElementById('fbtn').classList.toggle('on', !document.getElementById('frow-type').classList.contains('collapsed'));
} catch (err) {
  var box = document.getElementById('content');
  if (box) box.innerHTML = '<p style="color:#e06c75;padding:18px 4px">' + STR[LANG].bootFail + String(err && err.message || err) + '</p>';
  if (window.console && console.error) console.error(err);
}
