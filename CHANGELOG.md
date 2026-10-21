# CHANGELOG

## 未发布 — 阶段 2 开发版移植（2026-10-21 晚）

ZERO-TO-DEV 阶段 2 的六步移植完成前四项：数据层 / 工程骨架 / 前端 / 测试。**仍未接 DSH 宿主、未装机。**

### 新增

- `dsh/`：`store.js`（开库 + 迁移执行 + 台账）、`server.js`（`/api/health`、`/api/bootstrap`、静态文件、JSON 404、路径穿越拦截、资料目录校验）、`readmodels.js`（12 页读模型）、`demo.js`（幂等播种）、`workbench.js`（实例门面）、`index.js`（DSH 入口，`API_PREFIX = /api/attr`）。
- `public/`：开发版骨架（三段式顶栏 + 可拖 AI 面板分隔条 + 五态文案），数据改由 `GET /api/bootstrap` 提供，不再引 `demo-data.js`；AI 面板从「布尔开合 + 写死像素」换成五态 + 比例宽度（25%–45%，拖动/键盘/三档预设/松手记忆）。
- `lib/layout.js`：面板参数唯一来源（`PANEL` / `AGENT_PANE` / `assertPanelConfig`），`dsh/readmodels.js` 的 bootstrap 下发与客户端注册同源。
- `lib/client.js`：iframe 挂载（`businessSide:left / businessWidth:0.65 / customFrame:false`）。
- `test/` 三件套：`store.test.mjs`（5 条，含与 `demo-data.js` 的逐字段 parity）、`server.test.mjs`（6 条，起真实服务）、`ui-parity.test.mjs`（10 条，82 组视图 HTML 逐字符比对）。
- `schema/0002_rhythm_last.sql`：`rhythm` 补 `last TEXT`（原型五位元组的「上次」位原来被丢进 `next`）。
- `docs/screenshots/`：无头实测 9 张（1440 宽，12 视图 / 40 页签全点）。

### 修复

- 演示数据 `autonomic` 第一行赘余第 5 位（schema 无 `note` 列），删除后 parity 通过。
- bootstrap 的 `trials[].saved` 不再强转布尔，保持 SQLite 原值 1/0。
- `dsh/readmodels.js` 的 `layout.panel` 硬编码 `customFrame:true` 与 `lib/layout.js` 的 `false` 矛盾，改为从 layout.js 导入。
- AI 面板键盘 ←/→ 步长把比例（0.02）当像素除了 `gridWidth`，每按一次只动 0.0017% 等于没反应；改为直接用比例步长。**食管癌 `public/app.js:1119` 有同一处 bug，待回流修复。**

### 实测数字（2026-10-21，dev-server + 真实 Chrome）

- `npm run check`：21 条单测全过；冻结合同 / 文案红线 / 版本一致（8 处）/ 包结构全通过。
- 无头实测：12 视图 × 40 页签全部独立渲染、`body.scrollWidth ≤ innerWidth`（1440 宽，字号三档均不溢出）、控制台 0 error、0 个 4xx。
- 一图秀：2 条线 × 8 段单调三次贝塞尔、18 个数据点、事件竖虚线 2 条、分类序列只点不连线（3 个分类点）。
- AI 面板：idle → connecting（600ms，按钮禁用）→ open → closed → reopen 草稿保留；三档 25/35/45%；键盘 ← 35→37、Home→25；字号 15 / 17.25 / 19.8px。
- 档案切换：A（遗传型 A97S）↔ B（野生型，家族导航不显示计数角标）。

### 明确未做（阶段 2 剩余）

MinerU 解析链路、四点位血压录入、导出、AI 草稿接原生输入框、DSH 装机、市场发布。

---

## 未发布 — 品牌定名

### 变更

- 品牌定为「**小甲宝 / ATTR-Pal**」（用户 2026-10-21 决定）。命名沿革：小淀宝 / AmyPal → 淀粉宝宝 / ATTR-Pal → 小甲宝 / ATTR-Pal，当日三次。「甲」取自**转甲状腺素蛋白（TTR）**，三字格与家族一致。
- 侧栏品牌标识从文字徽标换成形象图 `prototypes/v0.2/brand-icon.png`；副标题收为「ATTR-Pal · 型别与两条线」，避免窄侧栏折行。
- **形象采用用户提供的外部参考稿**（奶油 3D 角色 + 金色缠丝 + 盾牌），废弃本项目此前生成的扁平机器人。侧栏小标改用角色特写裁切，48px 下仍可读。
- 仓库名与包名仍为 `attr-workbench`；改名只涉及展示字符串，不动工程标识。

### 新增

- `assets/brand/`：`attr-logo.png`（1024 主 lockup）/ `attr-mascot.png`（1024 纯形象）/ `attr-icon-512.png`（512 应用图标）/ `attr-mark-512.png`（512 侧栏小标），源图留档 `raw-ref-jiabao-2026-10-21.png`。
- `docs/BRAND.md`：命名沿革与取舍依据、颜色表、形象规则、与家族的偏离清单、资产清单、文字重排参数、使用红线 8 条。

### 采用外部参考稿时做的两处修正

1. **副标题本地重排**。参考稿中文字形实测干净（逐字放大核对无错笔），但源图是 JPEG 有损、字距不可调；副标题按「宽度不超过字标」反算字号（46px，宽 881px，字标 898px），用 PingFang SC Semibold 重排，墨色取原稿采样 `(48,113,133)`。字标 `ATTR小甲宝` 保留原稿。
2. **副标题「公益AI助手」改为「患者记录助手」**。本台不是公益组织，「公益」构成身份承诺，与「只提供信息、不做诊断」的立场摩擦。若确实以公益身份运营可改回，但需先确认资质与口径。

### 记录在案的品牌风险（`docs/BRAND.md` §1 / §3，任何对外材料不得删除）

- **「小甲宝」的两处保留意见**：① ATTR 不是甲状腺疾病（TTR 由肝细胞合成，病变在蛋白错误折叠沉积），叫「甲宝」会把品牌往内分泌科带偏，而 ATTR 患者分散在心内/神内/血液/肾内；对冲办法是品牌名永不单独成句，同屏必须给出病名全称。② 「甲」的日常第一义是指甲，「甲宝」一词已被美甲配件与输送机械厂商占用；品牌名不做检索入口，对外主关键词恒为 ATTR / 淀粉样变性。
- **「小A宝」永久弃用**：「A友」是艾滋病感染者社群既有的自称（A = AIDS，中国新闻网 2013 年报道原文，多地疾控「艾友会」活动简称同源），会被读成 HIV 相关形象。
- **「淀粉宝宝」弃用原因**：幼儿园课程与婴儿辅食问答占满搜索结果，易被误解为母婴内容。
- **与家族风格的五处偏离（已接受）**：渲染风格（扁平矢量 → 3D 奶油）、腮红（禁 → 有）、盾牌（无 → 有）、星芒（无 → 有）、胸口橙心白圆牌（有 → 盾牌内人形 + 心）。ATTR 台是家族第一个不用扁平机器人体系的成员，日后家族统一视觉时它是唯一需要重画的那个。
- **盾牌使用限制**：不得与「保护 / 预防 / 不得病 / 避免恶化」类文案同屏；形象不用于募捐、众筹、赞助鸣谢场景。

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
