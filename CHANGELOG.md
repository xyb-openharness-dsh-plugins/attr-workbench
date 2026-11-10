## 0.6.5（2026-11-11，AI 对话面板激活修复）

- 会话判定改用宿主归属 `ownedSession()`（`ownsSession(currentSession())`），不再用 `Boolean(conversation)`（customFrame 下没会话也会传隐藏容器 → 判断恒为真 → 点了没反应）。
- 创建路径改 `service.newSession(workspaceId)`，工作区取 `service.defaultWorkspace?.()?.workspaceId`；无可用工作区时由宿主提示选目录；不再用 `ensureSession({})`。
- 取消目录选择不留空会话并提示可重试；创建失败在工作台内显示原因；订阅会话变化触发重渲染；草稿仍只填不发。
- 版本与生成物同步 0.6.5；新增 `scripts/check-agent-pane-contract.mjs` 入 check 链。
- **界面加载与真机点击待人工**（需退出重开 DSH Desktop 后新建会话走查）。

## 0.6.3 — 2026-10-27

- 分隔线交互统一：AI 面板分隔线加宽抓取区，悬停显示本工作台同色系增亮色与拖动把手（⠿）；拖动改用指针捕获，越过业务 iframe 不再丢事件。

# CHANGELOG

## 0.6.2 — 2026-10-27（闸门与文档修正，无功能变更）

- **`probe:primer` 默认目标修正**：脚本从 starter 复制过来时默认指向 `examples/disease-primer.html`，
  本仓没有这个文件，直接 `npm run probe:primer` 必定 404 并报 7 条 FAIL（看着像浮窗坏了，其实是量错了页）。
  改为显式指向 `prototypes/v0.2/index.html`，实测 **9/9 通过**。
- **联网检查移出 check 链**：`check-primer-links` 要用真浏览器访问外网，留在 `npm run check` 里会让
  离线与 CI 出现与代码无关的假红。改为 `npm run check:primer-links` 单独执行；本轮 11/11 通过。
- **文档订正**：0.6.1 条目把脚本名写成 `verify-links.mjs`（不存在），改为 `check-primer-links.mjs`；
  「追加到 `npm run check`」一并改成实际口径。

## 0.6.1 — 2026-10-27（36 号 v2 补齐：指南可点 + 状态卡）

### 疾病概要：指南原件可点（§2.5）

- `prototypes/v0.2/primer-data.js`：evidence 表「原件」列 3 行由纯文字改为 `{ text, url }`，
  渲染为可点链接；四段 `sources` 共 8 处 `original: false` 补 `secondaryUrl`。
- 链接共 11 处引用 / 2 个唯一 URL，逐条用 `scripts/check-primer-links.mjs` 真浏览器验活，均 `OK`：
  - 中华医学会心血管病学分会心力衰竭学组《转甲状腺素蛋白心脏淀粉样变诊断与治疗中国专家共识》
    （中华心血管病杂志 2021;49(4):324-332，DOI 10.3760/cma.j.cn112148-20201217-00993）
    → 中华医学期刊网官方全文页。
  - ASNC/AHA/ASE/EANM/HFSA/ISA/SCMR/SNMMI 2021 年 PYP 显像补充说明
    （J Nucl Cardiol 2021;28(4):1769-1774，DOI 10.1007/s12350-020-02455-z）
    → Springer 出版方页。
- 未取得项：共识与补充说明的 **PDF 原件仍未存档**，卷期页已核、小节起始页与页码待核；
  NMPA 氯苯唑酸批件未取得（该行据共识转述，链接指向共识全文页）。本轮 **0 条 nolink**，
  但「链接可达」不等于「原件已存档」，口径写在数据文件头注释里。

### 看板状态卡（§2.6）

- `prototypes/v0.2/app.js` 看板首卡补四件：eyebrow「状态卡 · 待初始化」／大字「待初始化」28px
  （不手填天数）／现状行「尚无锚点日；完成三步初始化后自动派生」＋三步说明／出口按钮排
  （主「开始三步初始化 →」进设置，副「疾病概要：ATTR 是什么？」打开浮窗）。
- 本台尚无锚点日字段，整卡走「待初始化」兜底；未造任何临床锚点、不改数据模型。
- `prototypes/v0.2/style.css`：`.status-card` 四件样式。

### 模式层与闸门

- `primer.js` / `primer.css` 同步 starter `assets/patterns/disease-primer.js/.css`（逐字节 SAME）。
- `prototypes/v0.2/index.html`：顶栏 `.top-actions` 补「?」入口（版本 chip 左侧），
  供模块接管并挂 a11y 属性。
- 新增 `scripts/check-primer-links.mjs`（通用 L1–L6 断言）：
  本轮 11 项 11 通过 0 失败。**不在 `npm run check` 链里**（要联网，离线/CI 会假红），
  改由 `npm run check:primer-links` 单独跑；0.6.2 起口径与乳腺仓一致。

## 0.6.0 — 2026-10-24（照护者那块补上了：第 30 张表）

0.4.0 留的那块空位，页面上写着「现有 29 张表里没有它，要加得新建 `0004_*.sql`」。
维护者一句「G1通过，可以推进后续开发」授权推进，本轮把它补上。

### 新增

- **`schema/0004_caregiver.sql`**：新建 `caregiver_rows`
  （`profile_key / d / who / relation / burden / backup / need / private / ord`）。
  除 `private` 默认 1 外全部可空、无默认值；**没有任何 ALTER**，不动已冻结的 0001/0002/0003。
- **`GET /api/caregiver?profile=A`** 与 **`POST /api/caregiver`**：7 位元组返回，
  写入后回读整段（前端不自己拼行，避免与读模型列顺序错位）。
- **写入层 `addCaregiverRow`**：日期必填；`who/burden/backup/need` 至少一样，
  否则 400 + 字段名 `burden`（只填日期的空行没有意义）；`private` 只接受 0/1。
- **界面**：`生活与照护 → 情绪与照护者` 的「照护者」卡从"空位说明"换成真记录位——
  一条一条按日期倒序列出，右上一个「共几条」，下面一张录入表单。

### 为什么单独一张表、单独一个接口

- 不塞 `daily_rows`：`kind` 的 CHECK 只允许「饮食 · 体重 · 活动 · 出行」，写不进照护；
  放宽 CHECK 就是改 0001 的字节（冻结第一条）。
- 不塞 `viewpoints`：那是一行一个心境片段，没有位置放"谁在照顾我、能不能替手"。
- 不塞 `family_rows`：那张表记的是家系成员的**检测状态**，不是每天的照护负担。
- **不进 bootstrap**：bootstrap 的 profiles 必须与原型 `demo-data.js` 逐字段
  `deepStrictEqual`（`test/store.test.mjs` ③），原型快照冻结在 v0.1.0，多一个键 parity 就红。
  与 `/api/import/*` 同一个做法：同一份库，不同界面给不同形状。

### 口径

- **空 ≠ 阴性**：「能不能替手」留空存 NULL（没记）；明确选「没有」才存「没有」。
  界面上两者显示不同（`没记` / `没有`），测试 ⑦ 盯死这一条。
- **不打分、不判定**：没有"负担重/轻""要不要请护工"这类字段；页面出口是
  「由医生和社工判断」。
- **导出按构造排除**：`dsh/export.js` 是只读白名单，`caregiver_rows` 不在名单里；
  `excluded` 元数据从两层扩到三层（`family_rows / viewpoints / caregiver_rows`）。

### 关于「原型没动」

`prototypes/v0.2/` 一行未改（D37 冻结在 v0.1.0）。新增的表与卡片都只在开发版；
`test/ui-parity.test.mjs` ① 仍逐字符比对，⑪ 补了照护者的断言
（表单在、空态如实、字段齐、出口回医生与社工、且**不许**再出现「这一块还没有位置」）。

### 验证

- `NODE_OPTIONS= npm run check` → 全部通过，退出码 0（93 条单测）。
  其中新增：`writes.test` ⑦⑧⑨（空≠阴性 / 校验失败不留半条 / 同日并存）、
  `server.test` ⑨（单独端点、bootstrap 不得多出 caregiver 键、写入回读、400 带字段名）。
- `npm run probe:mind` → 真 Chrome 点开「情绪与照护者」，**填表提交一条**，
  断言新记录回到页面上（`夜里起来三次` + 「1 条」+ 空态消失）；
  4 宽度 × 3 字号无横向溢出、无竖排单字、无内容被裁；console 0 错误。
  截图 `docs/screenshots/v0.6.0-caregiver-record.png`。
- 表数断言 `scripts/check-attr.mjs` 29 → 30，同步 `docs/SCHEMA.md`、`schema/freeze-contract.md`
  （含新迁移 sha256 `bacf5ce3…`）。

---

## 0.5.0 — 2026-10-24（治疗那半句指南也接上了）

0.4.0 只补了**确诊**的出处；维护者原话要的是「确诊、治疗指南」，治疗那半句还没落地。本轮补上。

### 新增

- **治疗历程 → 当前方案** 底部第二张出处卡（`<!--dev-only-->` 包裹，原型仍不动）：
  - **治疗三分类**（共识口径）：对症治疗（缓解心衰症状；原文：对疾病进展本身无明显影响）/
    对因治疗（TTR 四聚体稳定剂、基因沉默）/ 器官移植（药物无效的晚期）。
  - **已上市与未上市**（共识原文）：「基因沉默三种（patisiran / vutrisiran / inotersen）均未在中国上市」；
    中国上市的是氯苯唑酸，口服小分子 TTR 稳定剂。
  - **ATTR-ACT 关键数字**：441 例、30 个月，全因死亡 29.5%（78/264）vs 安慰剂 42.9%（76/177），
    HR 0.70（95%CI 0.51–0.96）；心血管住院 0.48 vs 0.70 次/年。
    Maurer MS, et al. *N Engl J Med* 2018;379(11):1007-1016，DOI `10.1056/NEJMoa1805689`，NCT01994889。
  - **共识里的延展期数字**：59 个月全因死亡降低 41%，不良事件与安慰剂相似（共识原文）。
  - 共识出处沿用：中华心血管病杂志 2021;49(4):324-332（卷期页已核，小节起始页待核）。

### 发现（未擅自改，摆出来并列）

- **批准时间两处对不上**：本工作台「生活与照护 → 出行与资源」写「**2020-09** 获 NMPA 批准用于
  ATTR-CM」；共识原文写「中国药品监督管理局也于 **2020 年 10 月**批准氯苯唑酸用于治疗 ATTR-CA」。
  差一个月，两边都没核到批准文件原件 → 新卡里并列呈现、标「待核批准文件」，
  **不挑一个写死**，也没去动原型里那句（冻结）。

### 验证

- `NODE_OPTIONS= npm run check` → 全部通过，退出码 0。
- `npm run probe:mind` → 4 个页签 / console 0 错误 / 情绪页 4 宽度 × 3 字号无溢出 /
  治疗页 940 与 780 两档无溢出。截图 `docs/screenshots/v0.5.0-treatment-source.png`。
- `test/ui-parity.test.mjs` 新增第 ⑫ 条：治疗卡必须带试验出处与页码、冲突并列标待核、
  整卡不出现处置建议、摘掉 `<!--dev-only-->` 后不残留。

---

## 0.4.0 — 2026-10-24（心理有位置了；屏幕上那句话有出处了）

维护者指出两件事：**「ATTR 患者的生活，心理板块缺失」**、**「这个罕见病确诊、治疗指南不是有吗」**。
两句都成立，根因不同：一句是「有字段、没板块」，一句是「指南存在、工作台没地方装」。

### 新增

- **生活与照护 → 情绪与照护者**（页签 40 → 41）。三块：
  1. **你写下的**：从 `viewpoints`（`d / mood / text / private`）读，原话照登、日期倒序；
     明确写出「不进趋势、不进摘要事实区、不进导出、不自动进 AI 草稿」——这是代码里本来就有的
     （`dsh/export.js` 的 `excluded` 里就有 `viewpoints`），页面上得说出来。
  2. **三个常被记下来的时刻**：确诊那天 / 要跟家里人说之前 / 复诊前一晚。来自探索性访谈的
     待验证假设，**不是医学阈值**；页内明写「没有「多久该记一次」这回事」。
  3. **照护者**：**故意留空**，写明缺 `caregiver_rows` 表（谁在照顾你 / 这一周最累的一件事 /
     有没有人可以替手 / 你自己需要什么），并说明 `daily_rows.kind` 的 CHECK 只允许
     饮食·体重·活动·出行四值——情绪**写不进去是数据库拒绝，不是界面少画一个按钮**。
     要加得新建 `0004_*.sql` 并重新确认范围；在那之前不假装有。
- **我的分型 → 确诊路径** 底部补一张指南出处卡。原先页面写着「PYP 阳性 + 轻链阴性在**公开共识**里
  被认为特异度很高」——「哪个共识、哪一版、哪一页」三样全没有，属于第②层解释裸奔。现在给到：
  中华医学会心血管病学分会心力衰竭学组《转甲状腺素蛋白心脏淀粉样变诊断与治疗中国专家共识》
  （中华心血管病杂志 2021;49(4):324-332，DOI `10.3760/cma.j.cn112148-20201217-00993`，
  位置：诊断 → 二、辅助检查 → 5. 放射性核素骨闪烁扫描术）+ 原文 + 原始研究
  （Gillmore, Circulation 2016;133(24):2404-2412）。
  **并列**给出另一套口径（ASNC/AHA/ASE/EANM/HFSA/ISA/SCMR/SNMMI 2021 补充说明改为要求
  「断层图像显示弥漫 2–3 级摄取」，J Nucl Cardiol 2021;28:1769-1774），两套不换算、不取舍。
  **只核到卷期页，小节起始页未核到原件**，页内如实标注，不算「能点回原文」。

### 修复

- **`npm run check` 一直是红的（`staticPass: false`）**：`check-workbench-package.mjs` 用正则静态读
  客户端描述符，要求 `repository: 'https://github.com/…'` 是字面量；而 `src/client.js` 写的是
  `const REPOSITORY = '__REPOSITORY__'` + `repository: REPOSITORY`，中转一次就被判
  `Canonical repository required (manual review if dynamic)`。→ 改成在 `register()` 描述符里直接写
  占位符（值仍由 `scripts/build-client.mjs` 从 `package.json` 注入，单一来源不变）。
  现在 `npm run check` 全绿（88 个单测 / 29 张表可重放 / 文案红线 0 命中 / 版本 8 处一致）。

### 关于「原型没动」

`prototypes/v0.2/` 是 G1/G2 签认过的快照，**冻结在 v0.1.0（D37），本次一行未改**。
上面两处属**开发版先行**：`test/ui-parity.test.mjs` 新增第 ⑪ 条单独断言它们真的在，
比对时只摘掉多出来的那一个页签按钮与 `<!--dev-only-->` 包裹的出处卡，
其余任何字符变化仍按逐字符比对失败。原型下次升版时应把这两处合并回去，
并把「公开共识」那句本身改准。

### 验证

- `NODE_OPTIONS= npm run check` → **全部通过**，退出码 0。
- `npm run probe:mind`（新增 `scripts/probe-mind.mjs`，真 Chrome）→
  4 个页签、console 0 错误、4 档宽度（1300/1100/940/780）× 3 档字号（1 / 1.15 / 1.32）
  无横向溢出、无竖排单字、无内容被裁。截图：`docs/screenshots/v0.4.0-mind-caregiver.png`、
  `docs/screenshots/v0.4.0-guideline-source.png`。

---

## 0.3.1 — 2026-10-24（开库失败不再锁死）

### 修复

- **装好 0.3.0 仍报同一个「打不开数据库」**：根因不是 0.3.0 的 `mkdirSync` 没生效，而是
  `apply()` **只在插件加载那一刻试开一次库**，失败就把 `failure` 写死到进程生命周期；
  而宿主进程是**安装前**启动的（跑的还是 0.2.3 的代码），所以界面刷几次都是同一句。
  → `dsh/index.js` 把一次性开库改成 `ensureRoute()` 懒重试：每次请求前若还没有路由就再试一次，
  1s 防抖（避免坏盘时空转），成功即清 `failure`。以后同类故障（目录被清、外置盘掉线）
  用户刷新页面就能恢复，不必再靠「完全退出重开」。
- 顺带把这次的真机结论写进注释：`dshHomePath()` 只拼路径、不建目录；宿主 `apply()`
  里任何「一次性初始化失败」都不能定死，否则排障成本极高。

---

## 0.3.0 — 2026-10-24（装机首跑两处故障）

按真机反馈修两件事：**装进去打不开库**、**AI 对话位置错（两条会话栏并排）**。

### 修复

- **打不开数据库**：`~/Library/Application Support/dsh-desktop/harness/attr-workbench/xyb-attr.sqlite`
  报 `data_unavailable`。根因不是权限也不是加密：宿主的 `dshHomePath('attr-workbench')` 只**拼路径**，
  不会建目录，而 `harness/` 下并没有 `attr-workbench/` 这一层，SQLite 在不存在的目录里建不了文件。
  → `dsh/index.js` 开库前 `mkdirSync(dir, { recursive: true })`；建不动时报清是哪一层（带 `error.code`），
  不把 ENOENT 原样抛给用户。本地 `Workbench.open()` 本来就有这一步，宿主那条路漏了。
- **AI 对话位置错**：0.2.x 走标准分栏，业务页面自己画了一条会话栏，宿主又在右边给了一块原生会话区——
  屏幕上同时出现两个「AI 对话」，且都不能拖、不能关（标准分栏下宿主根本没有拖宽/收起的接口）。
  → `customFrame` 改 `true`，原生会话节点作为 `conversation` prop 交给面板外壳排版；
  页面侧靠 bootstrap 的 `agent.mode = 'host'` 把整组会话控件收起，不留一个灰按钮。

### 新增

- **`src/client.js` + `scripts/build-client.mjs`**：客户端从"手写单文件"改成"源码 + 生成"，
  注入包名/仓库/UI 前缀/版本/面板参数（唯一来源 `lib/layout.js`、`dsh/index.js`、`lib/version.js`、`package.json`）。
  `npm run check` 里加 `build-client.mjs --check`，改一处漏一处会红。
  外壳按乳腺癌 0.12.0 样板：语义 `<header>` + `--dsh-frame-leading-clearance` 避让、splitter 拖动/键盘、
  收起不结束会话、宽度记忆、窄屏改抽屉、`conversation` 始终挂载只切 display。
- **草稿交付闭环**：页面「整理本页要点」→ `postMessage({type:'pinky:agent-draft'})` → 外壳校验 source/origin →
  `ensureSession({ folder })` 调起原生会话 → 草稿填入输入框，**不自动发送**。
- `/api/attr/health` 增 `dir` 字段（`ensureSession` 的 folder 靠它，否则会话会落到默认目录、与资料目录脱钩）。

### 变更

- `test/server.test.mjs`：bootstrap 断言从「customFrame 必须 false」改为「必须 true」，
  并新增 `agent.mode === 'dev-mount'`（dev-server 没有宿主外壳，页面自带挂载位）。
- `public/shell.css`：补 `[hidden]` 强制隐藏规则（`.tb-agent` 有显式 `display`，会盖过 hidden 默认样式）。
- 版本 0.2.3 → 0.3.0（改包必升版：客户端形态变了）。

### 未验证

- Desktop 真机走查（点「AI 对话」是否落到右侧、splitter 拖动、收起重开、重启后数据是否留在
  `harness/attr-workbench/xyb-attr.sqlite`）——本轮只做到静态全绿 + 单测 82/82，装机结论待用户确认。

## 未发布 — 2026-10-24（M8 暂缓发布，改走本地 tgz 自测）

M8「回填组织 BACKLOG」按用户要求**先不发布**：不碰 `.github/BACKLOG.md`、不提 PR、不推 tag。改为用打出来的 tgz 直接装进 Desktop 的 profile 做一轮自测。

### 新增

- **`scripts/install-local.mjs`**（`npm run install:local`）：一条命令走完 pack → 装进 `profiles/web` → 逐文件比对 → 对装机副本跑探针。`--dry-run` 只打包列文件，`--no-probe` 跳过探针，`DSH_PROFILE` 可换 profile。
- 支持 `--dry-run` / `--no-probe` / `DSH_PROFILE` 三个开关。

### 修复（安装侧，不是包本身的问题）

- **同版本重打包后副本不换**：`pnpm add -w file:<tgz>` 打印 `Already up to date`，lockfile 的 `integrity` 已更新但 `node_modules` 下文件仍是旧的。两次版本号都是 `0.2.3`，从 `package.json` 分辨不出来——**探针会对着上一轮的代码报绿**。→ `install:local` 装完先删副本目录再 `pnpm install` 强制重链，然后逐文件比对包与副本，对不上直接退出 1、不跑探针。

### 变更

- `docs/RELEASE.md` 增「本地 tgz 自测」一节（五步 + 为什么必须重链 + shasum 不等于版本号）。
- `package.json` `files` 不变（`scripts/` 本来就在白名单里），包内文件 45 → 46。

### 本轮实测

| 项 | 结果 |
| --- | --- |
| 包 | 432.5 kB / 46 文件 |
| 副本一致性 | 46 个文件逐个对上；`dsh/server.js` 与仓库逐字节一致 |
| 副本静态自查 | 新版检查器跑副本本身：`staticPass: true`、0 errors、2 warnings（预期） |
| 探针 | 45/45 全过 |
| `npm run check` | 全绿 |

## 0.2.3 — 2026-10-24（M6 装机 + M7 发布）

G1/G2/G3 三个闸口签认（`docs/SIGNOFF-2026-10-24.md`），装机三层验收通过，仓库打 tag `v0.2.3`。
装机过程抓出两个**只有装进 Desktop 才暴露**的故障，都已修 + 加回归。

### 新增

- **装机验收探针** `scripts/probe-install.mjs`（`npm run probe:install`）：默认加载**装机副本**（`profiles/web/node_modules/@xyb-community/attr-workbench`），用假宿主（`webServer.register` / `connection.requestRejection` / `effect`）把插件跑起来，再让真 Chrome 走 12 页。45 项断言覆盖 L0 包元数据 / L1 模块图 / L2 接口与落库 / L3 交互。
- **宿主挂载合同测试** `test/host-mount.test.mjs`（3 条）：`/api/attr/ui/*` 的相对资源必须落到 `public/`、接口两种前缀都接、前缀之外一律 404。
- **窄宽自适应规则与探针**：`docs/RESPONSIVE-RULES.md`（六条硬规则 + 1180/900/600 三档）+ `scripts/probe-responsive.mjs` + `test/responsive.test.mjs`（6 条锁 CSS 声明）。实测 296 视图 0 问题。
- **`LICENSE`**（专有许可：允许本机自用与社区内协作，禁止再分发/商用；含第三方归属与免责声明），`package.json` 的 `license` 改 `SEE LICENSE IN LICENSE`。
- **`docs/RELEASE.md`** 装机与回滚记录（三版逐项原因 + 五要素 + 三层验收 + 待用户项）。

### 修复（都是装机才暴露的）

- **装机副本 import 失败**：`dsh/demo.js` 引 `../demo/build-demo-data.mjs`，而 `files` 白名单没有 `demo/`。开发版能跑是因为仓库里有那个目录，装进 Desktop 立刻 `Cannot find module`。→ `files` 加 `demo/build-demo-data.mjs`（只加这一个，不带 188 kB 的演示 sqlite）。
- **装机后业务区全白（`Unexpected token '<'`）**：iframe 指向 `/api/attr/ui/index.html`，页面里 `<script src="app.js">` 是相对路径 → 浏览器请求 `/api/attr/ui/app.js` → 剥掉 prefix 后是 `/ui/app.js` → 静态层找不到文件就**兜底回 index.html**，浏览器拿 HTML 当 JS 解析。→ 静态段先把 `/ui` 前缀剥掉再解析；`test/host-mount.test.mjs` ① 钉死。**本地 dev-server 挂在根上，这个故障本地永远看不到。**
- **`Config.root` 缺失不再退内存库**：`dsh/index.js` 的 `openDataSource` 缺 root 直接抛错，`Config.root` 改 `Schema.string().required()`，patch 里补 `config.root: !!js dshHomePath('attr-workbench')`。漏这条的症状是「装机能打开、每次重启回到内存库」，用户以为数据丢了。
- **`npm run check` 与渠道对不上**：`build:version` 默认 `prototype`，装机版要走 `beta`；`check` 里补 `ATTR_CHANNEL=beta` 前缀，避免 bump 版本后必红。

### 变更

- `public/app.js:19` / `public/index.html` 的版本字面量随 VERSION 前移（0.2.1 → 0.2.3）。
- `package.json` `files` 去掉 `assets`（3 MB CTCAE 参考 PDF 与品牌原图不进包），包体 6.9 MB → 437.5 kB。
- 单测 79 → 82 条。

## 未发布 — 2026-10-22（M5 收尾：MinerU 全链路打通）

DEV-PLAN 任务 4 第二步完成，M5 8/8。**仍未装机。**

### 新增

- **ATTR 指标词典** `dsh/dictionary.js`：4 项可入档（NT-proBNP / eGFR / 体重 / NYHA 分级）+ 肌酐等「只提示、不建趋势」项（`key: null`）。词表与 `metrics` 表同源，测试 ⑳ 盯着，避免出现一列没有读模型的指标。
- **抽取层** `dsh/labparse.js`（纯函数，不联网不碰库）：词边界（`Hb` 不吃 `HbA1c`）、不等式原样（`<0.5` 数值字段留 NULL）、按列对齐、列数不一致整行放弃、报告日期识别（`2026-02-31` 不认）、HTML 表与 Markdown 表同处理。
- **编排层** `dsh/import.js`：上传（档案+sha256 去重、临时文件后 rename）、解析（`parse_jobs` 留历史）、候选落库、接受即写 `metric_points`。候选写入 + 文档状态 + 任务状态同一事务；失败整体回滚。
- **迁移** `schema/0003_import.sql`（sha256 `911d76a7…`）：新增 `parse_jobs`；`documents` 补 `sha256/rel_path/pages`；`candidate_fields` 补 `doc_id/metric_key/unit/value_num/value_text`。全量 29 张表。
- **接口** 6 个：`GET /api/import/documents`、`POST /api/import/upload`（原始字节）、`POST /api/import/parse`、`GET /api/import/candidates`、`POST /api/import/candidates/accept|reject|manual`。`createHandler({ prefix })` 一套路由同服 dev-server 与 DSH 宿主。
- **UI**：资料库页上传表单 + 解析状态表（重试/解析）；草稿核对页候选表（单位、`unitMismatch` 提示常见写法、确认入档/不要、手填兜底）。
- 单测 22 → 24 条（`test/import.test.mjs`），全套 73 条。

### 修复（都是真实数据逼出来的）

- **`POST /api/import/upload` 空响应**：`new URL()` 碰到未解码的中文 query 抛错，而 handler 外层没有 catch，请求被挂死、浏览器只看到空白。现在未预料异常统一回 JSON 500（带 `path`）。
- **HTML 表抄出 `>118` 假候选**：行内兜底在含标签的原文上跑，把 `<td>` 之间的 `>` 当不等式。现在行内兜底只吃剥掉表格后的文字，且表格已出的指标不再出行内候选。
- **`Creătinine` 认不出**：OCR 把 `a` 读成 `ă`（U+0103 预组合字符），`a[\u0300-\u036f]*` 永远配不上。改为按 NFD 分解表逐字母列举预组合写法；仍不做前缀/编辑距离（`Creatinin` 照样不认）。
- **全部接受后重解析撞主键**：候选 id 原为 `c-<docId>-<序号>`，已接受的按规则不删，重解析直接 `UNIQUE constraint failed`；且 `parse_jobs` 是事务外插的，报错后永远停在 `running`。现在 id 带 `jobId`，落库失败也收口成 `failed`。
- **核对页把表挤变形**：单位提示塞进「值」列会让来源/日期折成三行。提示改挂指标名下方单独一行。
- **文本类结论被标「缺单位」**：心电图结论这类本来就没有单位，标了等于说抄写有问题。`noteOnly` 项不再显示该提示。

### 实测记录

真实云端解析同一份 `attr-lab.pdf`（MinerU API v4，12.7 s）：4 条候选（NT-proBNP 980 pg/mL、eGFR 58、体重 71.2 kg、肌酐 118 μmol/L 只提示），报告日期 `2026-04-24` 自动识别。无头实测：接受 → `candidate`→`accepted`、指标点 +1、一图秀出现新点；控制台 0 error、0 个 4xx、`scrollWidth === innerWidth`。截图 `docs/screenshots/13…16`。

## 未发布 — 2026-10-22（MinerU 统一口径）

- 默认解析模型 vlm → **pipeline**，回退模型反转为 vlm。
- 密钥口径：`.secrets/mineru.json` 唯一持久来源，`MINERU_TOKEN` 仅作兜底（`docs/18-MINERU-PARSING.md` 同步）。
- **Token 优先级改为文件优先**：显式 > `.secrets/mineru.json` > 环境变量。此前 env 优先，一条遗留的过期 env 会让界面新存的 Token 长期不生效。
- 单测 14 条仍全绿。

## 未发布 — 阶段 2 功能四项（2026-10-22 凌晨）

在六步移植之上完成 DEV-PLAN 任务 5/6/8 与任务 4 第一步。**仍未装机。**

### 新增

- **血压录入**（任务 5）：`dsh/writes.js` 写入层 + `POST /api/bp` + 血压页录入表单。契约在落库那一刻落地：留空存 NULL（空≠阴性）、缺体位不参与卧-立对照且不生成差值、同日期并存不覆盖。原计划"四点位/缺健侧"是乳腺臂围模板残留，按 ATTR 语义（体位+症状+用药）实现并注明。
- **门诊摘要导出**（任务 6）：`dsh/export.js` + `GET /api/export/summary` + 「复制摘要」真复制。家系与看法**按构造排除**（模块只读白名单表，不是读了再过滤）；文本与页面所见逐字一致。
- **AI 草稿交付**（任务 8）：「整理本页要点」→ 预览弹窗 → `postMessage({type:'pinky:agent-draft'})`（targetOrigin=工作台源，8000 字上限，独立启动退化复制）。同源父窗口桩实测 type/origin/source 全对；宿主侧监听端不在本仓库，列入 M6 装机验证。
- **MinerU 客户端层**（任务 4 第一步）：`lib/zip.js` + `dsh/mineru.js` + 14 条单测（自乳腺仓逐字复制，零项目字符串）；`.secrets/mineru.json` 同步（600+gitignore+不进包）；真实鉴权自检通过（code=-60012）。

### 修复

- **导出末点取反**（无头实测抓到）：导出读原始读模型（指标点按 ord＝日期倒序存），「最近一次」取到最旧点——页面 980pg/mL、剪贴板 1860pg/mL。导出补同一次日期升序排序，回归测试钉死。
- 血压表渲染 `String(null)` 会显示 "null"：留空格子改显示「—」。
- 客户端兜底 `AGENT_PANE.step` 24（像素）→ 0.02（比例），与键盘步长修复同量纲。

### 新踩坑记录

- 本机 shell 的 `env MINERU_TOKEN`（sk-j****qM）已失效且优先级高于密钥文件，`resolveToken` 默认取到坏 Token 报 401；有效 Token 在 `.secrets/mineru.json`。接入界面时错误消息必须带 Token 来源与掩码。
- postMessage 父窗口桩必须与工作台**同源**：跨源桩收不到消息不是 bug，是 `targetOrigin` 安全机制在工作。

---

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
