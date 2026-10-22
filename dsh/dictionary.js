/* ATTR 指标词典：**只认这几个名字**，其余一律不抽。
 *
 * 两条边界（与 docs/18-MINERU-PARSING.md §4 一致）：
 * 1. 抽取层只做抄写，不做医学判断。所以这里没有"正常范围""是否异常"，
 *    也没有"这个值说明什么"——那属于读模型与用户自己的看法。
 * 2. 词表是**白名单**。报告上认不出的项目宁可不抽（用户在核对页手填），
 *    也不做模糊匹配：ATTR 报告里同时出现「肌酐」与「肌酸激酶」，
 *    按前缀相似去猜会把 CK 写成 Cr，两码事。
 *
 * `key` 非空 = 本工作台 metrics 表里有这一项，接受候选后可入档、进一图秀；
 * `key` 为 null = 只做**提示**（报告里有、本工作台暂不建趋势），核对页会写清
 * 「暂不纳入趋势」，不允许接受入档——免得在事实层里凭空长出一列没有读模型的指标。
 *
 * 词表顺序有意义：matcher 按声明顺序取第一个命中，所以 `NT-proBNP` 必须排在
 * 更短的 `BNP` 之前（`BNP` 是另一项，本工作台不收，但不要让它抢先命中）。
 */

/** 入档的四项：与 demo/build-demo-data.mjs 的 metrics 一一对应，key 不许改。 */
export const ATTR_METRICS = [
  {
    key: 'ntprobnp',
    name: 'NT-proBNP',
    unit: 'pg/mL',
    kind: 'numeric',
    dec: 0,
    names: ['NT-proBNP', 'NTproBNP', 'N末端B型利钠肽原', 'N端B型利钠肽原', '氨基末端脑钠肽前体', '氨基末端B型利钠肽前体'],
  },
  {
    key: 'egfr',
    name: 'eGFR',
    unit: 'mL/min/1.73m²',
    kind: 'numeric',
    dec: 0,
    names: ['eGFR', 'e-GFR', '估算肾小球滤过率', '肾小球滤过率'],
  },
  {
    key: 'weight',
    name: '体重',
    unit: 'kg',
    kind: 'numeric',
    dec: 1,
    names: ['体重', 'Weight', 'BW'],
  },
  {
    key: 'nyha',
    name: 'NYHA 心功能',
    unit: '',
    kind: 'grade',
    dec: null,
    /* 分级不是化验值：报告结论里常写「心功能 III 级」「NYHA class III」。 */
    names: ['NYHA', '纽约心功能分级', '纽约心脏病学会心功能分级'],
  },
];

/** 只提示、不入档的常见项。ATTR 报告一定会有，但本工作台没有对应趋势位。 */
export const NOTE_ONLY_METRICS = [
  { code: 'cr', name: '肌酐', unit: 'μmol/L', names: ['肌酐', '血清肌酐', 'SCr', 'Creatinine'] },
  { code: 'hsTnT', name: '高敏肌钙蛋白T', unit: 'ng/L', names: ['高敏肌钙蛋白T', 'hs-cTnT', 'hs-TnT', '肌钙蛋白T'] },
  { code: 'alt', name: '丙氨酸氨基转移酶', unit: 'U/L', names: ['丙氨酸氨基转移酶', '谷丙转氨酶', 'ALT'] },
  { code: 'albumin', name: '白蛋白', unit: 'g/L', names: ['白蛋白', 'ALB', 'Albumin'] },
  { code: 'hb', name: '血红蛋白', unit: 'g/L', names: ['血红蛋白', 'HGB', 'Hb'] },
  { code: 'plt', name: '血小板', unit: '10⁹/L', names: ['血小板计数', '血小板', 'PLT'] },
  { code: 'ua', name: '尿酸', unit: 'μmol/L', names: ['尿酸', 'UA'] },
  { code: 'k', name: '血钾', unit: 'mmol/L', names: ['血钾', '血清钾', 'K⁺'] },
];

/** matcher 的输入形状：{ key|code, names }。入档项 key 非空，提示项 key 为 null + code。 */
export function dictionaryEntries() {
  return [
    ...ATTR_METRICS.map((m) => ({ code: m.key, key: m.key, name: m.name, kind: m.kind, dec: m.dec, unit: m.unit, names: m.names })),
    ...NOTE_ONLY_METRICS.map((m) => ({ code: m.code, key: null, name: m.name, kind: 'numeric', dec: 2, unit: m.unit, names: m.names })),
  ];
}

/** 按 key/code 查词条（接受候选、渲染核对页都用这一份，避免两处各写一张表）。 */
export function metricByCode(code) {
  return dictionaryEntries().find((e) => e.code === code) || null;
}

/** 报告日期识别：只认三种明确写法，`2026-02-31` 这种不认（不替用户改日期）。 */
export function isRealDate(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}
