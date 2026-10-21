/* 写入层：所有"往事实层写"的入口都收在这里，校验也在这里。
 *
 * 为什么单独一个文件：
 * 1. 读模型（readmodels.js）只负责还原形状，写入与读取的校验口径不一样，混在一起会互相污染；
 * 2. 四条契约要在**写入那一刻**落地，而不是靠读的时候补救：
 *    - 看法恒不为结论：本层不产出任何结论字段（没有"是否异常""是否耐受"）；
 *    - 空 ≠ 阴性：没填的字段一律存 NULL，不折算成 0、不填"正常""无"；
 *      「无症状」是用户明确勾选的答案（存 '无'），与"没记"（NULL）是两件事；
 *    - 更正只新增版本：本层只有 INSERT，没有 UPDATE（要更正就插新行 + 标 superseded）；
 *    - 事实四层不合并：文档/候选/记录/指标各写各的表，不跨层搬运。
 * 3. 校验失败抛 ValidationError（带字段），由 server.js 转成 400 + 字段名交回界面，
 *    不在这一层静默兜底——把 190/120 悄悄改成 0，界面上看着正常，回放时就是错的。
 *
 * 事务：调用方（server.js / import）负责开事务；这里的函数只管自己的一条语句。 */

/** 字段级校验失败。field 用于界面定位，不在消息里拼用户输入（避免日志注入）。 */
export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 校验 YYYY-MM-DD 且是真实存在的日期（2026-02-31 不认） */
function requireDate(v, field) {
  if (v === null || v === undefined || String(v).trim() === '') {
    throw new ValidationError(field, `${field} 不能为空（YYYY-MM-DD）`);
  }
  const s = String(v).trim();
  if (!DATE_RE.test(s)) throw new ValidationError(field, `${field} 必须是 YYYY-MM-DD，收到 ${s.length > 20 ? '超长输入' : s}`);
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new ValidationError(field, `${field} 不是真实日期：${s}`);
  }
  return s;
}

/** 可选整数：没填返回 null（不是 0）；填了必须在 [min,max] 内。 */
function optionalInt(v, field, min, max) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ValidationError(field, `${field} 必须是整数`);
  if (n < min || n > max) throw new ValidationError(field, `${field} 应在 ${min}–${max} 之间，收到 ${n}`);
  return n;
}

/** 可选文本：去空白后为空一律存 null（空 ≠ 阴性）。 */
function optionalText(v, field, maxLen = 200) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (s.length > maxLen) throw new ValidationError(field, `${field} 太长（上限 ${maxLen} 字）`);
  return s;
}

const BLANK = Object.freeze({ '': true, '—': true, '-': true, '未记录': true, '未填': true });
/** 界面常用占位符当成"没填"，不落库 */
function cleanText(v, field, maxLen) {
  const s = optionalText(v, field, maxLen);
  return s === null || BLANK[s] ? null : s;
}

/** 下一条 ord：现有最大 ord + 1（ord 是数组下标语义，新记录追加到末尾）。 */
function nextOrd(db, table, profileKey) {
  const row = db.prepare(`SELECT MAX(ord) AS m FROM ${table} WHERE profile_key = ?`).get(profileKey);
  return (row && Number.isFinite(row.m) ? row.m : -1) + 1;
}

function assertProfile(db, profileKey) {
  if (!profileKey || typeof profileKey !== 'string') throw new ValidationError('profileKey', 'profileKey 不能为空');
  const row = db.prepare('SELECT 1 FROM subjects WHERE profile_key = ?').get(profileKey);
  if (!row) throw new ValidationError('profileKey', `档案不存在：${profileKey}`);
  return profileKey;
}

/**
 * 写一条血压记录。
 *
 * ATTR 的血压不是"量个血压"，是**体位性低血压的记录**：体位（卧/坐/立）是这一行的关键字段，
 * 没有体位的那一行不参与卧-立对照（对照在读取时算，这里不存差值——缺体位就整行不参与，
 * 不折算成 0）。当时症状与当时用药同属一行，因为"站起来头晕"要和"那天在吃利尿剂"一起看。
 */
export function addBpRow(db, input = {}) {
  const profileKey = assertProfile(db, input.profileKey);
  const d = requireDate(input.d, 'd');

  /* 体位：schema 的 CHECK 只允许 卧/坐/立，或者不填（NULL）。
     不填不是"坐着量的"，是"这条没记体位"——参与不了卧立对照，但记录本身有效。 */
  let position = null;
  if (input.position !== null && input.position !== undefined && String(input.position).trim() !== '') {
    const p = String(input.position).trim();
    if (!['卧', '坐', '立'].includes(p)) throw new ValidationError('position', `position 只能是 卧/坐/立，收到 ${p}`);
    position = p;
  }

  if (input.sys === null || input.sys === undefined || String(input.sys).trim() === '') {
    throw new ValidationError('sys', '收缩压不能为空');
  }
  if (input.dia === null || input.dia === undefined || String(input.dia).trim() === '') {
    throw new ValidationError('dia', '舒张压不能为空');
  }
  const sys = optionalInt(input.sys, 'sys', 40, 300);
  const dia = optionalInt(input.dia, 'dia', 20, 200);
  if (!(sys > dia)) throw new ValidationError('sys', `收缩压应大于舒张压，收到 ${sys}/${dia}`);

  const pulse = optionalInt(input.pulse, 'pulse', 20, 250);
  const symptom = cleanText(input.symptom, 'symptom', 100);
  const drugNote = cleanText(input.drugNote ?? input.drug_note, 'drug_note', 200);

  const ord = nextOrd(db, 'bp_rows', profileKey);
  db.prepare(
    'INSERT INTO bp_rows (profile_key,d,position,sys,dia,pulse,symptom,drug_note,ord) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(profileKey, d, position, sys, dia, pulse, symptom, drugNote, ord);

  return { profileKey, d, position, sys, dia, pulse, symptom, drug_note: drugNote, ord };
}
