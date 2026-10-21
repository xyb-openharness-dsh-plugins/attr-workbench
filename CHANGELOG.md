# CHANGELOG

## 0.1.0 — 2026-10-21

阶段 1（调研 + SPEC + Schema + 临床库 + 原型）首个交付版本。**未接 DSH、未装机。**

### 新增

- 12 个一级页 / 41 个页签的交互原型（`prototypes/v0.2/`）：看板 / 病情整理 / 我的分型 / 治疗历程 / 心脏受累 / 神经与自主神经 / 检查与指标 / 病情一图秀 / 家族与遗传 / 生活与照护 / 复诊准备 / 临床研究。
- 2 套演示档案（`demo/build-demo-data.mjs`）：陈志远 61 岁遗传型 `TTR c.349G>T (p.Ala117Ser)`、周德昌 77 岁野生型（基因步骤 `not_done`，`finding` 为 NULL）。
- 28 张表的 schema（`schema/0001_initial.sql`）：型别版本化、确诊四步可空、心脏/神经双线、家系默认私密、四项契约以 CHECK 落地。
- 临床试验库 434 条（`research/attr/attr_trials_2026.sqlite`）：CT.gov API v2 418 + CDE 16；逐通道终态写入 `source_coverage`。
- 设计文档：`SPEC` / `PATIENT-FLOW` / `DIFF-MATRIX` / `CLINICAL-DATA-2026` / `USER-RESEARCH` / `SCHEMA` / `DEV-REQUIREMENTS-2026-10-21` / `DEV-PLAN` / `HVT-REVIEW` / `schema/freeze-contract`。

### 修复（原型自测阶段发现）

- 一图秀末点标签落在最左侧：演示数据的指标点按日期倒序存储，而标签取数组末元素。现在加载时统一按日期升序，末点 = 最新一条。
- 「正在用的药」卡片为空：用药行是数组，代码按对象取 `d.status`，改为 `d[6]`。
- 「接下来」把复查频率当成了日期显示；改为「下一次{项目} = next 日期」，频率放右侧 pill。
- 切页后 `#main.scrollIntoView` 把页签顶到 sticky 顶栏下面，**真实鼠标点不到第一排页签**（用 `el.click()` 的测试全绿、真实用户全挂）。加 `scroll-margin-top:96px`，测试改用真实鼠标点击。
- AI 面板收起时没清掉内联 `grid-template-columns`，面板宽度停在 320px；收起分支现在同时清样式与 `hidden`。
- 一图秀双纵轴 + 长单位导致末点标签压曲线：画布 `CW 980 → 1000`，末点标签进右侧 36px 槽，长单位省略（单位在图例）。

### 明确未做

患者访谈（H1–H5）、ChiCTR / WHO ICTRP 检索、逐条试验状态核实、真实文件解析、DSH 装机与市场发布、卫生经济学层。
