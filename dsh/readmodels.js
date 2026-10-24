/* 读模型（ATTR）：把库里的行还原成**前端要的形状**。
 *
 * 契约：`GET /api/bootstrap` 的 payload 必须与 prototypes/v0.2/demo-data.js 里的同名对象
 * 逐字段一致（test/store.test.mjs ③ 号断言是 deepStrictEqual）。所以这里不做任何"顺手优化"：
 * 字段名、数组/对象的嵌套层级、null 与缺失的语义都跟着 demo-data.js 走。
 *
 * ATTR 与食管癌读模型的五处差异（勿互相抄回）：
 * 1. **绝大多数业务表在原型里是定长数组，不是对象**：genotype 是唯一的一张单行对象表
 *    （`{kind, variant, zygosity, method, lab, reportDate, doctorText, state}`）；
 *    phenotype / stages / diagnosis / cardiac / echo / rhythmEvents / bp / neuro / autonomic /
 *    redflags / drugs / tolerance / family / counsel / daily 都是 `[a, b, c…]` 元组数组。
 *    直接返回行对象会让 parity 断言当场红，前端 `r[1]` 也会拿到 undefined。
 * 2. 指标列名是 `band_low` / `band_high`（**不是**食管癌的 `band: [low, high]`），
 *    且两个键永远存在（null 也算一个键）；points 里是 `v_num` / `v_text`（不是 `v`）。
 * 3. `kind` 键永远存在（数值指标也写 'numeric'）——食管癌是只在非 numeric 时才还原。
 * 4. `unit` 允许是空字符串（NYHA 心功能就是 `''`），不能因为"空"就省掉这个键。
 * 5. `rhythm` 表在 0002 迁移里补了 `last` 列；`events` 表有 `kind` 列但原型只要
 *    `[日期, 名称]` 两位，读出来必须切掉，不能多带一位。
 *
 * 排序口径：有 `ord` 的表按 `ord`（＝原型数组下标，**不是**日期）；
 * `events` 没有 ord，按 `rowid`（插入顺序）。复合主键表裸 SELECT 会按索引字母序返回，
 * 必须显式 ORDER BY rowid / ord。
 */

import { AGENT_PANE, PANEL } from '../lib/layout.js';

const jp = (s, fallback = null) => {
  if (s === null || s === undefined) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};
/* node:sqlite 返回的是 null-prototype 行对象，直接拿去和 JSON.parse 的结果 deepStrictEqual 会
   因为原型不同而不相等（parity 断言踩过）。这里统一摊平成普通对象。 */
const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((r) => ({ ...r }));

function readMetrics(db, key) {
  /* 必须 ORDER BY rowid：metrics 的主键是 (profile_key, key)，直接 SELECT 会按索引
     （＝指标 key 字母序）返回，egfr 排到 ntprobnp 前面，parity 断言当场红。 */
  const list = rows(db, 'SELECT * FROM metrics WHERE profile_key = ? ORDER BY rowid', key);
  return list.map((m) => ({
    key: m.key,
    name: m.name,
    /* 分类指标（NYHA）的 unit 是空字符串，不是 null；两个键都要原样带出去 */
    unit: m.unit,
    cat: m.cat,
    color: m.color,
    dec: m.dec,
    kind: m.kind,
    band_low: m.band_low,
    band_high: m.band_high,
    note: m.note,
    /* ord = 原型数组下标。演示数据的点是倒序存的（新 → 旧），所以按 ord 排即等于复现原型，
       日期升序由前端在加载时统一做（见 prototypes/v0.2/app.js 的 PROFILES 归一化）。 */
    points: rows(db, 'SELECT d, v_num, v_text, src FROM metric_points WHERE profile_key = ? AND metric_key = ? ORDER BY ord', key, m.key)
      .map((p) => ({ d: p.d, v_num: p.v_num, v_text: p.v_text, src: p.src })),
  }));
}

function readGenotype(db, key) {
  /* 野生型档案在表里也有一行（kind='wildtype'，各列为 NULL），所以不能靠"有行"判断有没有基因记录；
     没有行时才返回 null（＝"这条档案没有任何型别记录"）。 */
  const r = rows(db, 'SELECT kind, variant, zygosity, method, lab, report_date, doctor_text, state FROM genotype_rows WHERE profile_key = ? ORDER BY rowid LIMIT 1', key)[0];
  if (!r) return null;
  return {
    kind: r.kind,
    variant: r.variant,
    zygosity: r.zygosity,
    method: r.method,
    lab: r.lab,
    reportDate: r.report_date,
    doctorText: r.doctor_text,
    state: r.state,
  };
}

function readProfile(db, key) {
  const found = db.prepare('SELECT * FROM subjects WHERE profile_key = ?').get(key);
  if (!found) return null;
  const s = { ...found };

  /* 元组数组：顺序与 demo/build-demo-data.mjs 的 PROFILE_A / PROFILE_B 一致。
     每个 map 的返回数组长度就是原型里的元组长度，多一位少一位都会让 parity 红。 */
  const tuple = (sql, cols) => rows(db, sql, key).map((r) => cols.map((c) => r[c]));

  return {
    name: s.name,
    sex: s.sex,
    age: s.age,
    meta: s.meta,
    headline: s.headline,
    stage: s.stage,
    mindset: s.mindset,
    dash_keys: jp(s.dash_keys, []),
    path: jp(s.path, []),
    activity: s.activity,
    familyTalk: s.family_talk,
    genotype: readGenotype(db, key),
    phenotype: tuple('SELECT item, value, note FROM phenotype_rows WHERE profile_key = ? ORDER BY ord', ['item', 'value', 'note']),
    stages: tuple('SELECT scheme, value, d, by_who, doctor_text FROM stage_rows WHERE profile_key = ? ORDER BY ord', ['scheme', 'value', 'd', 'by_who', 'doctor_text']),
    diagnosis: tuple('SELECT step, state, finding, d, institution, doctor_text FROM diagnosis_rows WHERE profile_key = ? ORDER BY ord', ['step', 'state', 'finding', 'd', 'institution', 'doctor_text']),
    cardiac: tuple('SELECT d, symptom, severity, note FROM cardiac_rows WHERE profile_key = ? ORDER BY ord', ['d', 'symptom', 'severity', 'note']),
    echo: tuple('SELECT d, kind, ivsd, lvpwd, lvef, gls, lge, finding, institution FROM echo_rows WHERE profile_key = ? ORDER BY ord',
      ['d', 'kind', 'ivsd', 'lvpwd', 'lvef', 'gls', 'lge', 'finding', 'institution']),
    rhythmEvents: tuple('SELECT d, kind, detail, action FROM rhythm_events WHERE profile_key = ? ORDER BY ord', ['d', 'kind', 'detail', 'action']),
    bp: tuple('SELECT d, position, sys, dia, pulse, symptom, drug_note FROM bp_rows WHERE profile_key = ? ORDER BY ord',
      ['d', 'position', 'sys', 'dia', 'pulse', 'symptom', 'drug_note']),
    neuro: tuple('SELECT d, domain, symptom, severity, note FROM neuro_rows WHERE profile_key = ? ORDER BY ord', ['d', 'domain', 'symptom', 'severity', 'note']),
    autonomic: tuple('SELECT d, domain, symptom, detail FROM autonomic_rows WHERE profile_key = ? ORDER BY ord', ['d', 'domain', 'symptom', 'detail']),
    redflags: tuple('SELECT phase, item, year, side, note FROM redflag_rows WHERE profile_key = ? ORDER BY ord', ['phase', 'item', 'year', 'side', 'note']),
    drugs: tuple('SELECT name, mechanism, dose, schedule, start, end, status, reason, doctor_text FROM drug_rows WHERE profile_key = ? ORDER BY ord',
      ['name', 'mechanism', 'dose', 'schedule', 'start', 'end', 'status', 'reason', 'doctor_text']),
    tolerance: tuple('SELECT d, drug, kind, detail, action FROM tolerance_rows WHERE profile_key = ? ORDER BY ord', ['d', 'drug', 'kind', 'detail', 'action']),
    family: tuple('SELECT rel, label, tested, result, note, private FROM family_rows WHERE profile_key = ? ORDER BY ord',
      ['rel', 'label', 'tested', 'result', 'note', 'private']),
    counsel: tuple('SELECT d, institution, who, topic, doctor_text FROM counsel_rows WHERE profile_key = ? ORDER BY ord', ['d', 'institution', 'who', 'topic', 'doctor_text']),
    /* daily 在 schema 里多一个 note 列（真实录入用），原型只有 5 位，这里切掉 */
    daily: tuple('SELECT d, kind, detail, amount, symptom FROM daily_rows WHERE profile_key = ? ORDER BY ord', ['d', 'kind', 'detail', 'amount', 'symptom']),
    viewpoints: tuple('SELECT d, mood, text FROM viewpoints WHERE profile_key = ? ORDER BY ord', ['d', 'mood', 'text']),
    /* rhythm 的 last 列由 0002 迁移追加；原型 rhythmRows 是 [项目, 频率, 依据, 上次, 下次] 五位 */
    rhythmRows: tuple('SELECT item, freq, guideline, last, next FROM rhythm WHERE profile_key = ? ORDER BY ord', ['item', 'freq', 'guideline', 'last', 'next']),
    monitor: tuple('SELECT item, freq, last, next FROM monitor_rows WHERE profile_key = ? ORDER BY ord', ['item', 'freq', 'last', 'next']),
    docs: tuple('SELECT id, name, date, type, status FROM documents WHERE profile_key = ? ORDER BY ord', ['id', 'name', 'date', 'type', 'status']),
    candidates: tuple('SELECT id, name, value, source, status FROM candidate_fields WHERE profile_key = ? ORDER BY ord', ['id', 'name', 'value', 'source', 'status']),
    /* events 表有 kind 列（诊断/治疗/检查/事件），原型只要两位，切掉 */
    events: tuple('SELECT d, label FROM events WHERE profile_key = ? ORDER BY rowid', ['d', 'label']),
    metrics: readMetrics(db, key),
  };
}

export function listSubjects(db) {
  return rows(db, 'SELECT profile_key, name, meta FROM subjects ORDER BY profile_key');
}

export function getProfile(db, key) {
  return readProfile(db, key);
}

/**
 * 某个档案的血压记录（7 位元组，与原型 `p.bp` 同形）。
 * 单独导出是为了让**写入后立刻回读**走同一份形状：接口返回什么，界面就按哪个下标渲染，
 * 不用在前端再映射一遍列名（多一处映射就多一处错位）。
 */
export function bpRows(db, key) {
  return rows(db, 'SELECT d, position, sys, dia, pulse, symptom, drug_note FROM bp_rows WHERE profile_key = ? ORDER BY ord', key)
    .map((r) => [r.d, r.position, r.sys, r.dia, r.pulse, r.symptom, r.drug_note]);
}

/** 演示元信息（时间窗等）：前端 `D.meta` 直接用它，形状与 demo-data.js 的 meta 一致。 */
function readDemoMeta(db) {
  const meta = {};
  for (const r of rows(db, 'SELECT k, v FROM demo_meta')) meta[r.k] = r.v;
  return {
    version: meta.version ?? null,
    build: meta.build ?? null,
    windowStart: meta.windowStart ?? null,
    windowEnd: meta.windowEnd ?? null,
    note: meta.note ?? null,
  };
}

/** `/api/bootstrap` 的 payload。version/build 由调用方注入（唯一来源 lib/version.js）。 */
export function bootstrap(db, { version, build, agent } = {}) {
  const profiles = {};
  for (const s of listSubjects(db)) profiles[s.profile_key] = readProfile(db, s.profile_key);
  const trials = rows(db, 'SELECT record_id AS id, source, title, status, note, saved FROM trials ORDER BY ord')
    .map((t) => ({ record_id: t.id, source: t.source, title: t.title, status: t.status, note: t.note, saved: t.saved }));
  return {
    version: version ?? null,
    build: build ?? null,
    meta: readDemoMeta(db),
    profiles,
    trials,
    /* 会话形态由调用方声明（workbench.js 的 fromDatabase 选项）：
       - 本地 dev-server / 原型：页面内自带挂载位，available:true；
       - 装进 Desktop（customFrame=true）：原生会话由面板外壳排版，页面**不许再画第二份**，
         否则屏幕右边会同时出现两个「AI 对话」——2026-10-24 真机反馈的"位置错误"就是这个。
       前端只读这一处，不在客户端猜第二个入口（20 号交互合同）。 */
    agent: agent || { available: true, mode: 'dev-mount' },
    /* 面板宽度档位与业务分栏参数同源（lib/layout.js），客户端不再写第二份数字。
       注意 customFrame 由 layout.js 唯一决定：本项目阶段 2 是 false（标准分栏，
       宿主管原生会话排版）；改 true 前先看 layout.js 头注释里记的阶段 3 升级路径。 */
    layout: { agentPane: AGENT_PANE, panel: PANEL },
  };
}
