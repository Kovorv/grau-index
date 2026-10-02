// sys_classify.cjs — 判定一条编号属于哪个「索引体系」。
// 依据 ru.wikipedia «Индекс ГРАУ»（原始 wikitext）：
//   新式 ГРАУ：首位单数字＝отдел 1 光学/雷达/火控、2 火炮/迫击炮/陆基导弹、3 弹药/导弹、
//              4 发射药、6 步兵武器、7 步兵弹药、9 火箭武器；
//   8＝火箭（原 ГРАУ，后 УРВ РВСН）；11/14/17＝ГУКОС（航天）；15＝УРВ РВСН；
//   13/16＝РВСН/航天对象的基建、供电供水；
//   5＝УВ ПВО（отдел 5）；УВ ПВО 的 отдел 6 为「反序」结构——отдел 号在末尾，样品号在前（48Н6）；
//   老式 ГАУ（1935–1956）为 `52-П-365`：50 材料、51 军用仪器、52 火炮、53 弹药、54 发射药、
//              55 航弹（后移交 ВВС，改用首位 7）、56 步兵武器、57 步兵弹药；
//   УВ ВВС 老式：`7-А-…`/`8-Д-…`/`9-А-624` 等「数字-字母-数字」；
//   УРАВ ВМФ：炮弹 `А3-`/`А4-`；导弹系统首位 3/4 ＋ 字母（К 导弹综合体、М 导弹、Д 发动机…）。
// 不属于以上任何编号的（ОЦ/ТКБ/АК/ФАБ… 产品与设计局代号）归 design，其余归 misc。
'use strict';

const DEPT = {
  1: 'grau', 2: 'grau', 3: 'grau', 4: 'grau', 6: 'grau', 7: 'grau', 9: 'grau',
  8: 'rvsn', 15: 'rvsn', 11: 'space', 14: 'space', 17: 'space', 13: 'build', 16: 'build',
};

// 反序 отдел 6 的例外：首位数字本身也是某局号，但实例属 ПВО/ПРО 体系
const PVO_EXC = new Set([
  '11Г6', '11Л6', '11М6', '11Ю6', '13К6', '13М6', '13Ю6', '14Г6', '14И6', '14Я6-5',
  '16Ж6', '17Ж6', '17Л6',
]);
// 数据修正：来源把西里尔字母 О 写成了数字 0
const IDX_FIX = { '10П50': '1ОП50' };

// 海军反潜导弹/火箭（РПК），俄文来源自称「индекс ГРАУ」，按体系归 ВМФ
const VMF_SET = new Set(['81Р', '82Р']);
const RE_VMF_ART = /^А[34]-/;                                    // А3-ЗС-42 / А4-ЖБ-55БП 海军炮弹与装药
const RE_OLD_GAU = /^5[0-8]-[А-ЯЁ]{1,5}-/;                       // 52-П-365 / 56-ШОЗТ-562 / 57-НЕ-УЧ
const RE_GAU5X = /^5[0-8]/;                                      // 56Х714（无连字符的老 ГАУ 形）
const RE_DASH1 = /^(\d)-([А-ЯЁ0-9]{1,5})-/;                      // 老式「单数字-字母(可含数字)-数字」：3-О-12 / 7-Ф-247 / 9-А-624 / 9-А1-467
const AVIA_RE = /авиабомб|авиационн|авиапушк|авиабаз|самолёт|самолет|вертолёт|ФАБ|ОФАБ|АНАБ|ННСАБ|ФотАБ|ПТАБ|аэродром/i;
const RE_PVO6 = /^\d{2,3}[А-ЯЁ]{1,4}6[А-ЯЁ0-9]{0,6}(?:[-–][А-ЯЁ0-9.]{1,12})*$/;  // 48Н6, 55Ж6У, 58Ж6-01
const RE_NUM = /^(\d{1,3})/;
// v1.4.6: Р 字头自成一类（用户 m12528「R字头也是个单独的子类，即无线电」）。苏军电台编号
// Р-012М/Р-105/Р-168/Р-330 与火箭导弹代号 Р-1/Р-5/Р-27/Р-300 同形，故按编号白名单＋说明文字判读：
const RE_RN = /^Р-\d/;                                    // Р- 后接数字
const RE_RN_MIS = /УРВВ|УПВВ|МБР|БРПЛ|баллистическ|авиационн[а-яё]+ ракет|ракет|ГСН|ОТБР|РСМ-|снаряд|авиабомб|турбореактив|крылат/i;
// 火箭/导弹专用号（后面若接非数字则可带后缀：Р-27ЭП、Р-36М2、Р-500）；Р-105/Р-130/Р-330 等电台不会命中
const RE_RN_MIS_IDX = /^Р-(?:1|2|5|7|9|11|12|13|14|15|16|17|21|23|27|29|30|31|33|36|37|39|40|46|56|60|73|77|80|98|111|300|400|500)(?:[^\d].*)?$/;

function classify(idx, ru) {
  const raw = String(idx == null ? '' : idx).trim();
  const s = IDX_FIX[raw] || raw;
  const t = String(ru == null ? '' : ru);
  if (VMF_SET.has(s)) return { sys: 'vmf', dept: 201 };
  if (RE_VMF_ART.test(s)) return { sys: 'vmf', dept: 201 };
  if (RE_RN.test(s) && !RE_RN_MIS.test(t) && !RE_RN_MIS_IDX.test(s)) return { sys: 'radio', dept: 300 };
  if (RE_OLD_GAU.test(s)) return { sys: 'gau_old', dept: Number(s.slice(0, 2)), series: 50 };
  // 老式「单数字-字母-数字」在артиллерия与ВВС之间同形：按说明文字与首位判读
  const d1 = RE_DASH1.exec(s);
  if (d1) {
    const lead = Number(d1[1]);
    if (AVIA_RE.test(t)) return { sys: 'vvs', dept: 200 };
    if (lead === 9) return { sys: 'vvs', dept: 200 };          // 9-А/9-Б/9-В/9-Н… 航空机炮、炸弹、导弹部件
    if (lead === 7) {
      // 7-* 主要是航空炸弹的字母组；带「патрон」的是 ГРАУ 第7类枪弹
      if (/патрон/i.test(t) && !/пиропатрон/i.test(t)) return { sys: 'grau', dept: 7 };
      // 说明缺失（来源只留了占位符）时按字组推断：7-З/7-ЗП 是枪弹族
      if (!/[А-ЯЁа-яё]/.test(t) && /^З/.test(d1[2])) return { sys: 'grau', dept: 7 };
      return { sys: 'vvs', dept: 200 };
    }
    if (lead === 3 || lead === 4) return { sys: 'grau', dept: lead };   // 3-О 迫击炮弹/3-З 燃烧弹、4-З 装药
    if (lead === 5) return { sys: 'pvo5', dept: 5 };                     // 5-ОП 雷达靶标
    if (DEPT[lead]) return { sys: DEPT[lead], dept: lead };
    return { sys: 'misc', dept: 203 };
  }
  if (PVO_EXC.has(s)) return { sys: 'pvo6', dept: 105 };
  const m = RE_NUM.exec(s);
  if (m) {
    const lead = m[1];
    const d = Number(lead);
    if (RE_PVO6.test(s)) {
      // 首位是「局号」的（8/11/13/14/15/16/17）按本局处理，其余（10/12/18…99）＝反序 отдел 6
      if (DEPT[d] && lead.length <= 2) return { sys: DEPT[d], dept: d, pvo6: false };
      return { sys: 'pvo6', dept: 105 };
    }
    if (d === 5 && lead.length === 1) return { sys: 'pvo5', dept: 5 };
    if (DEPT[d] && lead.length <= 2) return { sys: DEPT[d], dept: d };
    if (RE_GAU5X.test(s)) return { sys: 'gau_old', dept: Number(s.slice(0, 2)), series: 50 };
    return { sys: 'misc', dept: 203 };
  }
  if (/^[А-ЯЁ]/.test(s)) return { sys: 'design', dept: 202 };
  return { sys: 'misc', dept: 203 };
}

// 体系 → 大类标题
const CLASS = {
  grau: { order: 1 },
  radio: { order: 2, dept: 300 },
  pvo5: { order: 3, dept: 5 },
  pvo6: { order: 4, dept: 105 },
  rvsn: { order: 5 },
  space: { order: 6 },
  build: { order: 7 },
  gau_old: { order: 8 },
  vvs: { order: 9, dept: 200 },
  vmf: { order: 10, dept: 201 },
  design: { order: 11, dept: 202 },
  misc: { order: 12, dept: 203 },
};
const SYS_ZH = {
  grau: 'ГРАУ 常规编号', radio: '无线电与通信（Р 字头）', pvo5: '防空与反导（ПВО 第5局）',
  pvo6: '防空与反导（ПВО 反序编号）',
  rvsn: '战略火箭军（РВСН）', space: '航天与 ГУКОС', build: '基建与供电', gau_old: '老 ГАУ 编号',
  vvs: '空军（ВВС）编号', vmf: '海军（ВМФ）编号', design: '产品与设计局代号', misc: '其他部门编号（待考）',
};
const SYS_RU = {
  grau: 'Индексы ГРАУ', radio: 'Радио и связь (индексы Р)', pvo5: 'ПВО, отдел 5',
  pvo6: 'ПВО, отдел 6 (обратный индекс)',
  rvsn: 'РВСН', space: 'Космос и ГУКОС', build: 'Строительство и энергоснабжение', gau_old: 'Старая система ГАУ',
  vvs: 'ВВС', vmf: 'ВМФ', design: 'Изделия и КБ-обозначения', misc: 'Прочие ведомственные индексы',
};
// 固定大类（非局号体系）的标题
const FIXED_CLASS = {
  // v1.4.2.1: 老 ГАУ 的 8 个局号（51…58）合并成一个大类，字头保留局号本身（51／52／…），
  // 因为每局的字头只有 1–25 个、且互相之间没有共同前缀，展开成 8 个顶层节点过于细碎。
  50: { zh: '老 ГАУ 编号（1935–1956）', ru: 'Старая система ГАУ (1935–1956)', sz: '老ГАУ 编号', sr: 'ГАУ 1935–56' },
  5: { zh: '防空与反导器材（ПВО 第5局编号）', ru: 'Средства ПВО и ПРО (отдел 5)', sz: 'ПВО 第5局', sr: 'ПВО от.5' },
  105: { zh: '防空与反导 АСУ 与配套（反序编号·末尾 6）', ru: 'АСУ и средства ПВО/ПРО (отдел 6, обратный индекс)', sz: 'ПВО 反序6', sr: 'ПВО обр.6' },
  200: { zh: '空军编号（7-А / 8-Д / 9-А 老式航空编号）', ru: 'Авиационные индексы ВВС (7-А…, 8-Д…, 9-А…)', sz: 'ВВС 编号', sr: 'ВВС' },
  201: { zh: '海军编号（А3- / А4- / 反潜导弹等）', ru: 'Флотские индексы (А3-…, А4-…, ПЛРК)', sz: 'ВМФ 编号', sr: 'ВМФ' },
  202: { zh: '产品与设计局代号（非索引编号）', ru: 'Изделия и обозначения КБ', sz: '产品代号', sr: 'Изделия КБ' },
  203: { zh: '其他部门编号（待考）', ru: 'Прочие ведомственные индексы', sz: '其他部门', sr: 'Прочие' },
  300: { zh: '无线电与通信（Р 字头：电台 / 接收机 / КШМ / РЭБ）', ru: 'Радиостанции и аппаратура связи (индексы Р)', sz: 'Р 无线电', sr: 'Р радио' },
};

// 第一级子级＝「索引体系组」（用户 m12528：GRAU → Р 无线电 → PVO → VVS → VMF → 设计局 → 老 GAU；
// РВСН/航天与 13/16 基建单列一组放在 ВМФ 之后、设计局之前；见网页/原生三棵树）
const GROUP = [
  { key: 'grau', order: 1, zh: 'ГРАУ 常规编号', ru: 'Индексы ГРАУ', depts: [1, 2, 3, 4, 6, 7, 9] },
  { key: 'radio', order: 2, zh: '无线电与通信（Р 字头）', ru: 'Радио и связь (индексы Р)', depts: [300] },
  { key: 'pvo', order: 3, zh: '防空与反导（ПВО）', ru: 'ПВО и ПРО', depts: [5, 105] },
  { key: 'vvs', order: 4, zh: '空军（ВВС）', ru: 'ВВС', depts: [200] },
  { key: 'vmf', order: 5, zh: '海军（ВМФ）', ru: 'ВМФ', depts: [201] },
  { key: 'rvsn', order: 6, zh: '战略火箭军与航天（РВСН／ГУКОС）', ru: 'РВСН и космос (ГУКОС)', depts: [8, 15, 11, 14, 17, 13, 16] },
  { key: 'design', order: 7, zh: '设计局与产品代号', ru: 'КБ и обозначения изделий', depts: [202] },
  { key: 'gau', order: 8, zh: '老 ГАУ 编号（1935–1956）', ru: 'Старая система ГАУ', depts: [51, 52, 53, 54, 55, 56, 57, 58] },
  { key: 'misc', order: 9, zh: '其他部门（待考）', ru: 'Прочие ведомства', depts: [203] },
];
const GROUP_BY_DEPT = new Map();
for (const g of GROUP) for (const d of g.depts) GROUP_BY_DEPT.set(d, g);
function groupOf(dept) { return GROUP_BY_DEPT.get(Number(dept)) || GROUP[GROUP.length - 1]; }

module.exports = { classify, CLASS, SYS_ZH, SYS_RU, FIXED_CLASS, DEPT, IDX_FIX, GROUP, groupOf };

// ---- CLI: node sys_classify.cjs [--report] -------------------------------------------
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'master.json'), 'utf8'));
  const by = {}, fams = {};
  const misc = [];
  for (const e of M.entries) {
    const c = classify(e.idx, e.ru);
    const k = c.sys + '#' + c.dept;
    by[k] = (by[k] || 0) + 1;
    (fams[k] = fams[k] || new Set()).add(e.fam);
    if (c.sys === 'misc') misc.push(e);
  }
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of rows) {
    const [sys, dept] = k.split('#');
    const label = FIXED_CLASS[dept] ? FIXED_CLASS[dept].zh : (sys + ' · отдел ' + dept);
    console.log(String(n).padStart(6), ' 大类', String(dept).padStart(3), '|', sys.padEnd(8), '|',
      String(fams[k].size).padStart(4), '字头 |', label);
  }
  console.log('\nmisc 明细 (' + misc.length + '):');
  for (const e of misc) console.log('  ', e.idx, '|', String(e.ru || '').slice(0, 70));
}
