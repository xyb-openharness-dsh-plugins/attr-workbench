# SCHEMA · ATTR 工作台数据模型

日期：2026-10-22。权威文件：`schema/0001_initial.sql` + `schema/0002_rhythm_last.sql` + `schema/0003_import.sql`（结构）+ 本文件（语义与边界）。冻结后 sha256 落 `schema/freeze-contract.md`，**改结构只能新增 `0004_*.sql`**。

## 0. 四层事实（不合并，是契约不是风格）

```
文档层 documents        原件：谁传的、什么时候、什么类型、文件哈希与落盘路径
任务层 parse_jobs       一次解析尝试：引擎/模型/批次/页数/起止时间/错误码（只增不改，重试新增行）
候选层 candidate_fields 从文档里抽出来的"可能是事实"的字段，未经用户核对
记录层 各 *_rows      用户核对后的记录（一条记录 = 一次观察/一次决定/一次用药）
指标层 metrics/metric_points 可画曲线的数值与分类序列（派生自记录，但不回写记录）
```

四条契约：

1. **看法恒不为结论**：`viewpoints` 只有 `text` 与 `mood`，没有 `is_conclusion`；读模型固定输出 `isConclusion:false`。
2. **空 ≠ 阴性**：所有"未做/未检/待出"用 `state ∈ {done, not_done, pending}` 表达；`not_done` 与 `negative` 在数据层就是两个值，任何地方不得用空字符串代替。
3. **更正只新增版本**：用药段（`drug_rows`）、型别（`genotype_rows`）、分期（`stage_rows`）都以"新行 + 起止"表达变化，不 UPDATE 旧行。
4. **事实四层不合并**：候选字段不得直接写入 `*_rows`；`metrics` 不得承载结论性文字。

## 1. 表清单

### 档案级（1 张）

| 表 | 主键 | 作用 | 关键字段 |
| --- | --- | --- | --- |
| `subjects` | `profile_key` | 一个患者（或演示档案）的档案级标量 | `name/sex/age/meta/headline/mindset`、`dash_keys`(JSON)、`path`(JSON)、`activity`、`family_talk`、各节 `*_title` |

`*_title` 约定：读模型里每一节都返回 `{title, rows}`，因此每节必须有对应 `*_title` 列；**NULL 表示该档案没有这一节**（例如野生型档案没有 `genotype_title`），空字符串表示"有这一节但没填标题"。

### 指标层（3 张）

| 表 | 说明 |
| --- | --- |
| `metrics` | 指标定义：`key/name/unit/cat/color/dec/kind/band_low/band_high/note`。`dec IS NULL` ⇔ 分类指标，且 `kind ∈ {grade, qual}` |
| `metric_points` | 采样点：`d/v_num/v_text/src/ord`。数值写 `v_num`，分类写 `v_text`，两者互斥 |
| `metric_groups` | 指标分组（心脏 / 肾脏 / 血液 / 神经），决定「检查与指标」二级页签顺序 |

### 通用（7 张）

`events`（时间轴节点）· `rhythm`（复诊节奏）· `monitor_rows`（随访安排）· `viewpoints`（我的看法）· `documents` · `candidate_fields` · `demo_meta`。

### 解析（1 张，`0003_import.sql`）

| 表 | 说明 |
| --- | --- |
| `parse_jobs` | 一次解析尝试：`status ∈ {queued,running,succeeded,failed}`、`engine`、`model`、`batch_id`、`pages`、`error_code`、`error_message`、`started_at`、`finished_at`、`ord`。**重试新增行、旧行留着**：失败记录是复盘依据，不是垃圾 |

`0003` 同时扩了列（只增不改）：`documents` 补 `sha256/rel_path/pages`（按文件哈希去重、能找到原件、页数）；`candidate_fields` 补 `doc_id/metric_key/unit/value_num/value_text`（候选能追到来源文档、能带单位和数值、文本与数值互斥）。

### ATTR 专属（14 张）

| 表 | 语义 | ATTR 独有理由 |
| --- | --- | --- |
| `genotype_rows` | TTR 变异原文、检测方法、机构、报告日期、医生原话、`state` | 野生型/遗传型的唯一依据；空 ≠ 未检测 |
| `phenotype_rows` | 表型（心脏为主/神经为主/混合）、起病年龄、首发症状 | 同一变异可有不同表型 |
| `stage_rows` | 分期记录：`scheme ∈ {NYHA, Gillmore/NAC, FAP}` + 值 + 日期 + `by='doctor'` | 分期只能由医生给；工作台不算 |
| `diagnosis_rows` | 确诊四步：警示征 / PYP / 轻链与免疫固定电泳 / 基因；`step` + `state` + `finding` + `d` | 确诊是一条链，不是一个字段 |
| `cardiac_rows` | 心衰症状与体征（呼吸困难、水肿、活动耐量、晕厥） | 心脏线主数据 |
| `echo_rows` | 心超/CMR：`IVSd/LVPWd/LVEF/GLS/LGE` 等，抄报告原文 | 影像按真实频率，不加密 |
| `rhythm_events` | 房颤、传导阻滞、起搏器/ICD 植入等事件 | 与"复诊节奏"不同，是事件 |
| `bp_rows` | 血压（含体位：卧/坐/立）+ 当时症状 + 当时用药 | 体位性低血压是特征性难题 |
| `neuro_rows` | 感觉/运动症状自查序列，`self=1` 固定标注 | 自查 ≠ 分级 |
| `autonomic_rows` | 自主神经分块：胃肠、泌尿、出汗、体位 | 独立负担，不能只做"症状列表" |
| `redflag_rows` | 腕管/脊柱/肱二头肌腱/白内障，带 `phase ∈ {before, after}` | 确诊前线索与确诊后事件要分开 |
| `drug_rows` | 用药方案段：`name/mechanism/dose/start/end/status/reason` | 方案段可并行，不覆盖 |
| `tolerance_rows` | 耐受事件：`d/kind/detail/action` | 停药原因的证据链 |
| `family_rows` / `counsel_rows` | 家系成员（`private=1` 默认）与遗传咨询记录 | 最高敏感级，默认不进 AI 上下文 |
| `daily_rows` | 饮食/体重/活动/出行记录 | 生活侧唯一入口（不设营养处方） |

### 试验

`trials`（工作台内收藏的登记摘录）与 `research/attr/attr_trials_2026.sqlite`（完整库）分开：**工作台只存收藏与备注，不复制全量库**（避免版本漂移）。

## 2. 实体关系

```
subjects 1─n documents 1─n parse_jobs
subjects 1─n documents 1─n candidate_fields
subjects 1─n metrics 1─n metric_points
subjects 1─n events / viewpoints / monitor_rows / rhythm
subjects 1─n genotype_rows / phenotype_rows / stage_rows / diagnosis_rows
subjects 1─n cardiac_rows / echo_rows / rhythm_events / bp_rows
subjects 1─n neuro_rows / autonomic_rows / redflag_rows
subjects 1─n drug_rows 1─n tolerance_rows
subjects 1─n family_rows / counsel_rows / daily_rows
```

没有跨档案外键：一个 `profile_key` 就是一份独立档案，家系成员**不是**第二个 `subjects` 行（未发病者没有病程数据，建档案会污染指标统计）。

## 3. 写入语义（每条都有对应断言）

| 场景 | 写法 | 断言 |
| --- | --- | --- |
| 新增用药 | `INSERT drug_rows`（`start` 必填，`end` NULL 表示在用） | 同一 `name+start` 唯一；旧段不被 UPDATE |
| 停药 | 给旧段补 `end` + `status='stopped'` + `reason` | `end >= start` |
| 换药 | 旧段结束 + 新段开始，两行都在 | 时间不重叠校验在读取时算，不落库 |
| 更正型别 | 新增 `genotype_rows` 行（`revision_of` 指向旧行） | 旧行 `superseded=0 → 1` 由触发器维护，不删 |
| 记录 PYP | `diagnosis_rows(step='pyp', state='done', finding='2 级')` | `state='not_done'` 时 `finding` 必须 NULL |
| 家系成员 | `family_rows(private=1)` | 默认查询 `private=0` 才返回；导出需显式勾选 |
| 指标 | `metric_points` 只写 `v_num` 或 `v_text` 之一 | CHECK 约束：两者不得同时非空 |
| 试验收藏 | `trials` 存 `record_id` + 备注 | 不存疗效字段 |
| 解析一次报告 | 新增 `parse_jobs` 行 + 候选写入 + `documents.status` 同事务 | 失败整体回滚：候选 0 条、原件保留、`job.status='failed'` 带错误码 |
| 接受候选 | `metric_points` 新增 + 候选 `status='accepted'` | 不写任何审核字段（接受 ≠ 审核）；`metric_key` 为空的只提示项不许接受 |
| 重解析 | 新增 `parse_jobs` 行；未确认候选清理，已 `accepted` 的保留 | 候选 id 必须带 `jobId`，否则已接受的行会撞主键 |

## 4. 变化矩阵（改这些地方要同步哪些文件）

| 变更 | 必须同步 | 不许怎样 |
| --- | --- | --- |
| 加表/加列 | 新增 `0004_*.sql`（下一个序号）+ `docs/SCHEMA.md` §1 + `demo/build-demo-data.mjs` + 读模型 + `schema/freeze-contract.md` 追加哈希 | 改已冻结的 0001/0002/0003；只改 SQL 不改生成器 |
| 改指标口径（如 hgb 单位） | `metrics` 种子 + `docs/CLINICAL-DATA-2026.md` + 页面文案 | 在渲染层换算 |
| 改分期规则 | **不改代码**，只改"医生给出"的记录位 | 在任何地方自动算 Gillmore 分期 |
| 加一级页 | `SPEC.md` §3/§4 + `DIFF-MATRIX.md` + `app.js` PAGES + 无头页签穷举 | 只加页面不加场景 |
| 加药物 | `drug_rows` 种子 + `CLINICAL-DATA` 药物卡片 | 只加名字不写机制 |

## 5. 命名与单位约定

- `using` 是 SQLite 保留字 → 列名用 `in_use`；`order` → `ord`；`group` → `grp`。
- 单位写进 `metrics.unit`，不在页面写死：NT-proBNP `pg/mL`、eGFR `mL/min/1.73m²`、肌钙蛋白 T `ng/L`、体重 `kg`、收缩压 `mmHg`。
- 日期一律 `YYYY-MM-DD` 文本；时间点不需要。
- 布尔用 `INTEGER 0/1`，不用 `TEXT 'true'`。

## 6. 与演示数据的关系

`demo/build-demo-data.mjs` 是**唯一数据源**：它同时产出 `demo/demo-data.sqlite` 与 `prototypes/v0.2/demo-data.js`。原型里不手改 `demo-data.js`；开发版读模型必须还原成 `demo-data.js` 的**同一形状**（parity 是读模型唯一验收标准）。

为满足 parity：

- 复合主键表裸 `SELECT` 必须 `ORDER BY rowid`（`metrics`、`trials`、`metric_groups`）。
- 手写"最新在前"的数组（`tolerance_rows`、`bp_rows`）入库带 `ord`，读出来只 `ORDER BY ord`，不再叠 `DESC`。
- 可选字段（`band_low/band_high`、`end`、`reason`）生成时显式写 `null`，不省略键。
