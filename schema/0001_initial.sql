/* ATTR 工作台 · 初始数据模型（0001）
 *
 * 家族四条契约（与肠癌/胃癌/食管癌/FSHD 同源，改这里等于改契约）：
 *   1. 看法恒不为结论（viewpoints 只记录，没有 is_conclusion 列，读模型固定 false）；
 *   2. 空 ≠ 阴性：state 三态（done / not_done / pending），不用空字符串代替"未做"；
 *   3. 更正只新增版本（drug_rows / genotype_rows / stage_rows 用新行 + 起止表达变化，不 UPDATE 旧行）；
 *   4. 事实四层不合并（documents / candidate_fields / *_rows / metrics 分表）。
 *
 * 迁移只增不改：本文件冻结后（sha256 见 freeze-contract.md）要加结构只能新增 0002_*.sql。
 *
 * 与食管癌样板的差异（勿互相抄回）：
 *   - 删除 swallow_rows / access_rows / dilation_rows / access_events / nutrition_rows / supplement_rows /
 *     segment_rows / surgery_rows / pathway_rows / cycles / treatment_lines / molecular / endoscopy_rows；
 *   - 新增 genotype / phenotype / stage / diagnosis / cardiac / echo / rhythm_events / bp / neuro /
 *     autonomic / redflag / drug / tolerance / family / counsel / daily 十六张 ATTR 专属表；
 *   - 保留 events / rhythm / monitor_rows / viewpoints / documents / candidate_fields / demo_meta / trials。
 */

/* ---------- 档案级 ---------- */

CREATE TABLE subjects (
  profile_key      TEXT PRIMARY KEY,
  name             TEXT,
  sex              TEXT,
  age              INTEGER,
  meta             TEXT,            -- 侧栏第二行：年龄 · 型别 · 表型
  headline         TEXT,
  stage            TEXT,            -- 医生写的那一句（含 NYHA / FAP 原话）
  mindset          TEXT,
  dash_keys        TEXT,            -- JSON 数组：看板指标卡顺序
  path             TEXT,            -- JSON 数组：型别条（野生型/遗传型 · 表型 · 分期 · 当前方案）
  activity         TEXT,
  family_talk      TEXT,
  /* 分节标题：NULL = 该档案没有这一节（野生型没有 genotype_title），空串 = 有节但未填标题 */
  genotype_title   TEXT,
  phenotype_title  TEXT,
  stage_title      TEXT,
  diagnosis_title  TEXT,
  cardiac_title    TEXT,
  echo_title       TEXT,
  bp_title         TEXT,
  neuro_title      TEXT,
  autonomic_title  TEXT,
  redflag_title    TEXT,
  drug_title       TEXT,
  tolerance_title  TEXT,
  family_title     TEXT,
  counsel_title    TEXT,
  daily_title      TEXT
);

/* ---------- 指标层 ---------- */

CREATE TABLE metrics (
  profile_key TEXT,
  key         TEXT,
  name        TEXT,
  unit        TEXT,
  cat         TEXT,             -- 分组：heart / kidney / blood / neuro
  color       TEXT,
  dec         INTEGER,          -- 小数位；NULL 表示分类指标
  kind        TEXT,             -- 'numeric' | 'grade' | 'qual'
  band_low    REAL,
  band_high   REAL,
  note        TEXT,
  PRIMARY KEY (profile_key, key),
  CHECK (kind IN ('numeric','grade','qual')),
  /* 分类指标必须 dec IS NULL，数值指标必须有小数位：这条 CHECK 是 A8 的数据侧保证 */
  CHECK ((kind = 'numeric' AND dec IS NOT NULL) OR (kind <> 'numeric' AND dec IS NULL))
);

CREATE TABLE metric_points (
  profile_key TEXT,
  metric_key  TEXT,
  d           TEXT,             -- YYYY-MM-DD
  v_num       REAL,
  v_text      TEXT,
  src         TEXT,             -- 报告名 / 场合
  ord         INTEGER,
  PRIMARY KEY (profile_key, metric_key, d, ord),
  /* 数值与文字互斥；两个都空是脏数据，两个都填也是脏数据 */
  CHECK ((v_num IS NULL) <> (v_text IS NULL))
);

CREATE TABLE metric_groups (
  profile_key TEXT,
  grp         TEXT,             -- heart / kidney / blood / neuro
  label       TEXT,
  ord         INTEGER
);

/* ---------- 通用 ---------- */

CREATE TABLE events (
  profile_key TEXT,
  d           TEXT,
  label       TEXT,
  kind        TEXT              -- 'diagnosis' | 'treatment' | 'exam' | 'event'
);

CREATE TABLE rhythm (
  profile_key TEXT,
  item        TEXT,
  freq        TEXT,
  guideline   TEXT,             -- 依据（医生说的 / 报告建议的），不改写成我们的建议
  next        TEXT,
  ord         INTEGER
);

CREATE TABLE monitor_rows (
  profile_key TEXT,
  item        TEXT,             -- 心超 / NT-proBNP / 肾功能 / 基因复查
  freq        TEXT,
  last        TEXT,
  next        TEXT,
  note        TEXT,
  ord         INTEGER
);

CREATE TABLE viewpoints (
  profile_key TEXT,
  d           TEXT,
  mood        TEXT,
  text        TEXT,
  private     INTEGER DEFAULT 0, -- 1 = 仅本机、不进摘要、不进 AI 草稿
  ord         INTEGER
);

CREATE TABLE documents (
  profile_key TEXT,
  id          TEXT,
  name        TEXT,
  date        TEXT,
  type        TEXT,             -- 化验 / 心超 / 核素 / 基因 / 出院小结
  status      TEXT,             -- 待解析 / 已解析 / 已核对 / 解析失败
  ord         INTEGER,
  PRIMARY KEY (profile_key, id)
);

CREATE TABLE candidate_fields (
  profile_key TEXT,
  id          TEXT,
  name        TEXT,
  value       TEXT,
  source      TEXT,
  status      TEXT,             -- candidate / accepted / edited
  ord         INTEGER,
  PRIMARY KEY (profile_key, id)
);

/* ---------- ATTR 专属 ---------- */

/* 型别与基因（A1/A2）：野生型档案没有本表记录，但 subjects.genotype_title 也为 NULL。
   state: done（已检测）/ not_done（没做）/ pending（等结果）。变异原文抄报告，不解读致病性。 */
CREATE TABLE genotype_rows (
  profile_key TEXT,
  kind        TEXT,             -- 'wildtype' | 'variant'
  variant     TEXT,             -- 报告原文，如 "TTR c.349G>T (p.Ala117Ser)"；未检测时为 NULL
  zygosity    TEXT,             -- 杂合 / 纯合 / 未报告
  method      TEXT,             -- Sanger / NGS / 未报告
  lab         TEXT,
  report_date TEXT,
  doctor_text TEXT,             -- 医生原话
  state       TEXT,
  revision_of TEXT,             -- 更正时指向旧行 id（字符串，跨版本留痕）
  superseded  INTEGER DEFAULT 0,
  ord         INTEGER,
  CHECK (state IN ('done','not_done','pending'))
);

/* 表型与分期（A3/A4） */
CREATE TABLE phenotype_rows (
  profile_key TEXT,
  item        TEXT,             -- 表型 / 起病年龄 / 首发症状 / 目前主要负担
  value       TEXT,
  note        TEXT,
  ord         INTEGER
);

CREATE TABLE stage_rows (
  profile_key TEXT,
  scheme      TEXT,             -- 'NYHA' | 'Gillmore/NAC' | 'FAP'
  value       TEXT,             -- 医生写的值（如 "Ⅱ"）
  d           TEXT,
  by_who      TEXT,             -- 固定 'doctor'；自查不进本表
  doctor_text TEXT,
  ord         INTEGER,
  CHECK (by_who IN ('doctor'))
);

/* 确诊路径（A5）：四步各自可空，not_done ≠ negative。
   step: warning（警示征）/ pyp / flc（轻链+免疫固定电泳）/ gene */
CREATE TABLE diagnosis_rows (
  profile_key TEXT,
  step        TEXT,
  state       TEXT,             -- done / not_done / pending
  finding     TEXT,             -- 报告原文（"Perugini 3 级" / "κ/λ 1.2" / "M 蛋白阴性"）
  d           TEXT,
  institution TEXT,
  doctor_text TEXT,
  ord         INTEGER,
  CHECK (step IN ('warning','pyp','flc','gene')),
  CHECK (state IN ('done','not_done','pending')),
  /* 未做/待出时不允许有结论文字：空 ≠ 阴性，这条是数据侧硬保证 */
  CHECK (state = 'done' OR finding IS NULL)
);

/* 心脏线 */
CREATE TABLE cardiac_rows (
  profile_key TEXT,
  d           TEXT,
  symptom     TEXT,             -- 呼吸困难 / 水肿 / 活动耐量 / 晕厥前兆
  severity    TEXT,             -- 患者自述程度（不是分级）
  note        TEXT,
  self        INTEGER DEFAULT 1,
  ord         INTEGER
);

CREATE TABLE echo_rows (
  profile_key TEXT,
  d           TEXT,
  kind        TEXT,             -- 心超 / CMR
  ivsd        REAL,             -- 室间隔厚度 mm
  lvpwd       REAL,             -- 左室后壁厚度 mm
  lvef        REAL,             -- %
  gls         REAL,             -- 整体纵向应变 %
  lge         TEXT,             -- 延迟强化描述原文
  finding     TEXT,
  institution TEXT,
  ord         INTEGER
);

CREATE TABLE rhythm_events (
  profile_key TEXT,
  d           TEXT,
  kind        TEXT,             -- 房颤 / 传导阻滞 / 起搏器植入 / ICD 植入 / 晕厥
  detail      TEXT,
  action      TEXT,             -- 医生做了什么（只抄，不建议）
  ord         INTEGER
);

/* 血压与用药耐受（T5）：体位是关键字段，缺体位则该行不参与"体位性"对照 */
CREATE TABLE bp_rows (
  profile_key TEXT,
  d           TEXT,
  position    TEXT,             -- 卧 / 坐 / 立
  sys         INTEGER,
  dia         INTEGER,
  pulse       INTEGER,
  symptom     TEXT,             -- 头晕 / 眼前发黑 / 无
  drug_note   TEXT,             -- 当时在用的降压药/利尿剂（自述）
  ord         INTEGER,
  CHECK (position IN ('卧','坐','立') OR position IS NULL)
);

/* 神经线（A4）：自查序列固定 self=1，渲染层必须标注"自查，不是医生评估" */
CREATE TABLE neuro_rows (
  profile_key TEXT,
  d           TEXT,
  domain      TEXT,             -- 感觉 / 运动 / 疼痛 / 平衡
  symptom     TEXT,
  severity    TEXT,
  note        TEXT,
  self        INTEGER DEFAULT 1,
  ord         INTEGER
);

CREATE TABLE autonomic_rows (
  profile_key TEXT,
  d           TEXT,
  domain      TEXT,             -- 胃肠 / 泌尿 / 出汗 / 体位
  symptom     TEXT,
  detail      TEXT,
  self        INTEGER DEFAULT 1,
  ord         INTEGER
);

/* 红旗线索（T7）：确诊前线索与确诊后事件分开，避免回溯推断 */
CREATE TABLE redflag_rows (
  profile_key TEXT,
  phase       TEXT,             -- 'before' | 'after'
  item        TEXT,             -- 腕管松解 / 腰椎管狭窄 / 肱二头肌腱断裂 / 白内障
  year        TEXT,
  side        TEXT,
  note        TEXT,
  ord         INTEGER,
  CHECK (phase IN ('before','after'))
);

/* 治疗（A6）：方案段，可并行；end IS NULL = 在用。停药给旧段补 end + status + reason。 */
CREATE TABLE drug_rows (
  profile_key TEXT,
  name        TEXT,
  mechanism   TEXT,             -- 稳定剂 / siRNA / ASO / 支持治疗 / 其他
  dose        TEXT,
  schedule    TEXT,
  start       TEXT,
  end         TEXT,
  status      TEXT,             -- active / stopped / paused
  reason      TEXT,             -- 停/换原因（患者或医生原话）
  doctor_text TEXT,
  ord         INTEGER,
  CHECK (status IN ('active','stopped','paused'))
);

CREATE TABLE tolerance_rows (
  profile_key TEXT,
  d           TEXT,
  drug        TEXT,
  kind        TEXT,             -- 头晕 / 腹泻 / 注射部位反应 / 血小板下降 / 其他
  detail      TEXT,
  action      TEXT,             -- 医生怎么处理（只抄）
  ord         INTEGER
);

/* 家系与遗传（A7）：private 默认 1；读模型默认不返回，导出需显式勾选 */
CREATE TABLE family_rows (
  profile_key TEXT,
  rel         TEXT,             -- 父亲 / 母亲 / 兄弟 / 姐妹 / 子女 / 其他
  label       TEXT,             -- 患者自己给的称呼（可匿名，如"大姐"）
  tested      TEXT,             -- 已检测 / 未检测 / 不确定
  result      TEXT,             -- 阳性 / 阴性 / 未告知（默认不展开）
  note        TEXT,
  private     INTEGER DEFAULT 1,
  ord         INTEGER
);

CREATE TABLE counsel_rows (
  profile_key TEXT,
  d           TEXT,
  institution TEXT,
  who         TEXT,             -- 遗传咨询师 / 医生（只记角色，不记姓名）
  topic       TEXT,
  doctor_text TEXT,
  ord         INTEGER
);

/* 生活与照护（A19）：饮食/体重/活动/出行，不做热量换算、不给食谱 */
CREATE TABLE daily_rows (
  profile_key TEXT,
  d           TEXT,
  kind        TEXT,             -- 饮食 / 体重 / 活动 / 出行
  detail      TEXT,
  amount      TEXT,             -- 自述份量或体重
  symptom     TEXT,
  note        TEXT,
  ord         INTEGER,
  CHECK (kind IN ('饮食','体重','活动','出行'))
);

/* 试验收藏：只存 record_id 与备注，不复制全量库、不存疗效字段 */
CREATE TABLE trials (
  record_id   TEXT PRIMARY KEY, -- 与 research/attr/attr_trials_2026.sqlite 的 record_id 一致
  source      TEXT,
  title       TEXT,
  status      TEXT,
  note        TEXT,             -- 患者自己的备注（"离家近""已问过医生"）
  saved       INTEGER DEFAULT 0,
  ord         INTEGER
);

CREATE TABLE demo_meta (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE INDEX idx_points      ON metric_points (profile_key, metric_key);
CREATE INDEX idx_docs        ON documents     (profile_key);
CREATE INDEX idx_drug        ON drug_rows     (profile_key, start);
CREATE INDEX idx_diag        ON diagnosis_rows(profile_key, step);
CREATE INDEX idx_family      ON family_rows   (profile_key, private);
