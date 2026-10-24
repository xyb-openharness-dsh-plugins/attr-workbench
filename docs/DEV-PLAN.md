# ATTR 工作台 · 开发计划与里程碑

> 里程碑只认本文件；SPEC 里的页码不是进度，截图不是签认。
> 闸口定义见 `docs/22-PHASES-AND-GATES.md`，本轮硬约束见 `docs/DEV-REQUIREMENTS-2026-10-21.md`。

起始：2026-10-21　当前版本：v0.1.0（原型，阶段 1 完）　下一版：v0.2.0（阶段 2 收尾后 bump）

---

## 里程碑

| ID | 里程碑 | 判据（可验证，不靠感觉） | 状态 |
| --- | --- | --- | --- |
| M0 | 骨架可跑 | `npm run check` 0 error；DSH 包结构校验通过；`dsh.client.platform === "web"` | ✅ 2026-10-21 |
| M1 | 调研与 SPEC | `SPEC.md` 12 页 + T1–T8 + A1–A20；`PATIENT-FLOW.md` 三条线；`DIFF-MATRIX.md` 有删除清单 | ✅ 2026-10-21 |
| M2 | 原型可点 | 12 一级页 / 40 二级页签真实鼠标点击全命中（初稿记 41，实点后更正为 40：看板无二级页签）；`body.scrollWidth === innerWidth`；控制台 0 error、0 个 4xx；AI 五态与字号三档实测 | ✅ 2026-10-21 |
| M3 | 数据模型 | 迁移可重放（`0001` 的 28 张；`0003` 追加 `parse_jobs` 后 29 张）；四契约在 CHECK 上落地；演示数据一份来源双产物 | ✅ 2026-10-21（会话、观察、解析任务分表，四层不合并） |
| M4 | 临床库 | 434 条登记摘录，逐通道终态入 `source_coverage`；manifest / jsonl / sqlite 行数一致 | ✅ 2026-10-21 |
| G1 | 需求签字 | HVT 审核 B 级清零 + 用户原话确认 | ✅ 2026-10-24（[SIGNOFF-2026-10-24](SIGNOFF-2026-10-24.md)，概括确认） |
| G2 | 原型签字 | 用户逐页确认 12 页（本版为简化确认：只看截图 + 文字摘要） | ✅ 2026-10-24（同文，`prototypes/v0.2` 冻结在 v0.1.0） |
| G3 | 数据模型签字 | 用户确认 28 表 + 0003 的 `parse_jobs`（共 29 张）与四契约；`schema/freeze-contract.md` 落 sha256 | ✅ 2026-10-24（同文；此后只加不改） |
| M5 | 开发版 | 移植六步完成；血压录入 / 门诊摘要导出 / AI 草稿交付（iframe 侧）完成并实测；MinerU 全链路（客户端层 → labparse 抽取 → import 编排 → 0003 迁移 → 上传/核对 UI）真实云端跑通 | ✅ 2026-10-22（8/8） |
| M6 | 装机 | Desktop Harness 活动 profile 安装；三层验收（配置层 / 加载层 / 交互层） | ✅ 2026-10-24（v0.2.3，`probe:install` 45 项全过，见 [RELEASE](RELEASE.md)） |
| M7 | 发布 | 仓库 push + 市场描述 + LICENSE/NOTICE 复核 | ✅ 2026-10-24（push + tag `v0.2.3`；**市场投稿未授权，未提交**） |
| M8 | 状态回填 | 组织 `BACKLOG.md` 对应行状态与版本同步（[§2.2 #80](https://github.com/xyb-openharness-dsh-plugins/.github/blob/main/BACKLOG.md)）；🟢 必须 V1+V2+V3 三层都过 | ⏳ 待执行（建议改 🔵 `v0.2.3`，真机确认后再 🟢） |

---

## 阶段 2 拆解与实况（2026-10-21 晚完成前四项）

| 序号 | 任务 | 产出 | 状态 |
| --- | --- | --- | --- |
| 1 | `dsh/store.js` + 迁移执行器 | 可重放 29 表（`0001` 28 张 + `0003` 的 `parse_jobs`）；`0002_rhythm_last.sql`、`0003_import.sql` 均已冻结 | ✅ |
| 2 | `dsh/readmodels.js` | 12 页读模型；与 `demo-data.js` 逐字段 parity（store.test ③ deepStrictEqual） | ✅ |
| 3 | `dsh/server.js` 接口 | `/api/health`、`/api/bootstrap`、`POST /api/bp`、`GET /api/export/summary`、静态文件、JSON 404、路径穿越拦截 | ✅ |
| 4 | MinerU 解析链路 | 上传 → 候选 → 草稿核对。`dsh/labparse.js`（纯函数抽取）→ `dsh/import.js`（编排 + 事务）→ `schema/0003_import.sql`（`parse_jobs` + 四列扩展）→ 6 个 HTTP 端点 → 资料库/核对页 UI | ✅（24 测 + 真实云端 1 份 PDF，见 `docs/18-MINERU-PARSING.md` §7） |
| 5 | 血压录入 | 体位（卧/坐/立）+ 症状 + 当时用药；写入层 `dsh/writes.js` + `POST /api/bp` + 录入表单 | ✅（原文名"四点位/缺健侧"是乳腺模板残留，已按 ATTR 语义实现并注明） |
| 6 | 导出 | 门诊摘要 `dsh/export.js`（所见即所得；家系与看法按构造排除） | ✅ |
| 7 | 一图秀接真实数据 | 与原型几何一致（无头实测：2 线 × 8 段三次贝塞尔、事件竖虚线 2 条、分类序列只点不连线） | ✅ |
| 8 | AI 草稿接原生输入框 | iframe 侧合同完（预览弹窗 → `pinky:agent-draft` postMessage，同源桩实测 type/origin/source 全对；独立启动退化复制）。**宿主侧监听端不在本仓库**，列入 M6 装机交互层验证 | ✅（本仓库侧） |

**顺序不可颠倒**：读模型先于接口，接口先于解析；解析先于导出。理由：导出模板一旦先写，会把读模型的字段名锁死在错误形状上（乳腺 v0.4 踩过）。

### M5 收尾：MinerU 全链路（2026-10-22）

四层不合并照旧：原件 `documents` → 解析任务 `parse_jobs` → 抄写结果 `candidate_fields` → 用户确认后才写 `metric_points`。任一步不越层搬运。

| 层 | 文件 | 要点 |
| --- | --- | --- |
| 词典 | `dsh/dictionary.js` | 4 项可入档（NT-proBNP / eGFR / 体重 / NYHA）+ 肌酐等只提示项；`key: null` = 没有趋势位，不许接受 |
| 抽取 | `dsh/labparse.js` | 纯函数：词边界、不等式原样、按列对齐、整行放弃、报告日期。词表与 `metrics` 表同源（测试 ⑳ 盯死） |
| 编排 | `dsh/import.js` | 上传去重（档案+sha256）、临时文件+rename 落盘、解析成功/候选/文档状态/任务状态同一事务 |
| 迁移 | `schema/0003_import.sql` | 新增 `parse_jobs`；`documents` 补 `sha256/rel_path/pages`；`candidate_fields` 补 `doc_id/metric_key/unit/value_num/value_text` |
| 接口 | `dsh/server.js` | 6 个端点 + `fail()` 统一错误出口 + 兜底 try/catch（未预料异常也要回 JSON 500，不能把请求挂死） |
| UI | `public/app.js` | 资料库上传/解析状态表；核对页候选表（单位、`unitMismatch` 提示、确认入档/不要、手填） |

真实云端实测（同一份 `attr-lab.pdf`，MinerU API v4 四步，12.7 s）：3 条可入档候选 + 1 条只提示项（肌酐 118 μmol/L），报告日期 `2026-04-24` 自动识别，`warnings` 只报「1 项暂不建趋势」。无头实测：接受 → 候选`candidate`→`accepted`、指标点 +1、一图秀出现新点；控制台 0 error、0 个 4xx、`body.scrollWidth === innerWidth`。

这一轮真实数据逼出三个生产级问题（都已修 + 有断言）：

1. **整表是 HTML `<table>`**：行内兜底在原文上跑，会把 `<td>肌酐</td><td>118</td>` 之间的 `>` 当不等式，抄出 `>118` 假候选。修法：行内兜底只在剥掉表格后的文字上跑，且表格已出的指标不再出行内候选（测试 ㉓）。
2. **OCR 把 `a` 读成 `ă`**（U+0103 预组合字符）：写成 `a[\u0300-\u036f]*` 永远配不上，因为 `ă` 本身就占了 `a` 的位置。修法：按 NFD 分解表反查每个基字母对应的预组合字符，逐字母列举（测试 ㉑）。
3. **全部接受后再解析撞主键**：候选 id 原为 `c-<docId>-<序号>`，已接受的按规则不删，重解析直接 `UNIQUE constraint failed`；且 `parse_jobs` 是事务外插的，报错后永远停在 `running`。修法：id 带 `jobId`；落库失败也收口成 `failed`（测试 ㉔）。

### 本轮移植的两个数据层修正（都走了"只增不改"）

1. `rhythm` 表补 `last` 列（`schema/0002_rhythm_last.sql`，sha256 已冻结）。原因：原型 `rhythmRows` 是五位元组，生成器原来把「上次」丢进 `next`，parity 当场红。
2. `autonomic` 演示数据删除赘余第 5 位（schema 无 `note` 列、UI 只读 4 列）——改演示数据，不加迁移。

### 面板布局决策（阶段 2）

- `customFrame: false`（标准分栏，宿主管原生会话）。依据与升级路径写在 `lib/layout.js` 头注释；`customFrame: true` 需要 React 外壳，列阶段 3。
- `dsh/readmodels.js` 的 `layout.panel` 曾硬编码 `customFrame: true` 与 layout.js 打架，已改为从 `lib/layout.js` 导入（`test/server.test.mjs` ② 有断言盯死）。

---

## M8：回填组织 BACKLOG 状态（M7 之后）

发布不等于"社区知道这东西能用了"。目标池的唯一权威位置是组织的
[`BACKLOG.md`](https://github.com/xyb-openharness-dsh-plugins/.github/blob/main/BACKLOG.md)，
本仓库的进度不写回去，外部贡献者看到的还是"🟡 未开工"，招募与协作就停在原地。

### 本仓库对应的那一行

`BACKLOG.md` §2.2（R2 非肿瘤慢性病型）第 80 行：

```
| 80 | 转甲状腺素蛋白淀粉样变性 | 478 | T1 | 🟡 v0.1.0（2026-10-21 认领） | 已认领 · 👤🩺📝 补位 |
```

只改第 5、6 列（状态、招募），序号/病种/页码/级别一律不动：

| 时点 | 第 5 列 | 第 6 列 |
| --- | --- | --- |
| 认领（已发生） | `🟡 v0.1.0（2026-10-21 认领）` | `已认领 · 👤🩺📝 补位` |
| **M6 三层过（当前）** | `🔵 v0.2.3（2026-10-24 装机三层验收）` | `已认领 · 👤🩺📝 补位` |
| 用户在真机确认 V2/V3 | `🟢 v0.2.3（2026-10-24）` | `已认领 · 📝🩺 内容补位` |

### 状态词表（不许自造）

| 标记 | 含义 | 本仓库何时可用 |
| --- | --- | --- |
| ⬜ | 未启动 · 招募认领中 | 已过 |
| ⚪ | 规划中（已排波次） | 已过 |
| 🟡 | 设计中（G1 已签、G2 未签） | 已过（2026-10-21） |
| 🔵 | 开发中（闸口已签，实现中） | **当前**：G1/G2/G3 已签，V1 绿、装机探针 45/45，真机 V2/V3 未确认 |
| 🟢 | 社区可用（V1+V2+V3 三层均过） | **还不能标**：V2 真加载与 V3 业务闭环要用户在 Desktop 里点过 |

三条硬规则：

1. **"PR 已合并"≠ 可用**，只有三层都过才 🟢；
2. 状态**单向推进**（⬜→⚪→🟡→🔵→🟢），回退要写原因；
3. 状态列**必须带版本号与日期**，只写 emoji 等于没写。

### 交付判据

- `.github` 仓库走 PR（不直推 main），PR 描述里写清：仓库、版本、V1/V2/V3 各自证据（命令 + 输出摘要，或"未验证"）；
- 合并后在 `docs/RELEASE.md` 的「动作」表补一行，记录 PR URL 与合并时间；
- 达到 🟢 时同步 `ROADMAP.md`；**未达 🟢 不许说"已上架/已可用"**。

## 阶段 3 清单（M6 装机前）

1. **customFrame 升级评估**（可选）：按乳腺样板补 React 外壳（根首元素 `<header>` + `--dsh-frame-leading-clearance` 避让 + 会话常驻不卸载）；不升就维持标准分栏，页面内 AI 面板已可拖可记忆。
2. 装机：`~/Library/Application Support/dsh-desktop/harness/profiles/web`，`NODE_OPTIONS= npx pnpm@10.15.0 --dir <profile> add -w <abs>.tgz`；包名写进 `dsh.profile.bundles`；`dsh.client.platform` 必须 `"web"`。
3. 三层验收：配置层（state.json / bundles）/ 加载层（harness.log 无 reject）/ 交互层（真实点击 12 页，含 MinerU 上传—核对一整套）。
5. 回流：`~/.workbuddy/skills/` 家族约定更新；**食管癌 `public/app.js:1119` 有同一处键盘步长量纲 bug，顺手修**（见 LESSONS L24）。

---

## 每阶段结束必做

1. `npm run check`（版本同步 → 语法 → 冻结合同 → 文案红线 → 密钥 → 单测 → 版本一致）。
2. 无头实测：页签穷举、`body.scrollWidth`、控制台 0 error、0 个 4xx。
3. 截图归档到 `docs/screenshots/`，逐张目视。
4. 记 `docs/LESSONS.md`：本轮踩的坑与原因，不写"已优化"这种空话。
5. 闸口留痕：确认人 / 原话 / 日期 / 版本，写进 `docs/PROTOTYPE-REVIEW.md`。
