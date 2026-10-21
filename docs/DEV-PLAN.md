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
| M3 | 数据模型 | 28 张表迁移可重放；四契约在 CHECK 上落地；演示数据一份来源双产物 | ✅ 2026-10-21 |
| M4 | 临床库 | 434 条登记摘录，逐通道终态入 `source_coverage`；manifest / jsonl / sqlite 行数一致 | ✅ 2026-10-21 |
| G1 | 需求签字 | HVT 审核 B 级清零 + 用户原话确认 | ⏸ **等用户确认** |
| G2 | 原型签字 | 用户逐页确认 12 页（本版为简化确认：只看截图 + 文字摘要） | ⏸ 等确认 |
| G3 | 数据模型签字 | 用户确认 28 表与四契约；`schema/freeze-contract.md` 落 sha256 | ⏸ 等确认 |
| M5 | 开发版 | 移植六步完成；血压录入 / 门诊摘要导出 / AI 草稿交付（iframe 侧）完成并实测；MinerU 客户端层落地 + 真实鉴权自检。剩余：MinerU 抽取与导入编排（labparse / import / UI） | 🔵 进行中（7/8，剩任务 4 第二步） |
| M6 | 装机 | Desktop Harness 活动 profile 安装；三层验收（配置层 / 加载层 / 交互层） | 未开始 |
| M7 | 发布 | 仓库 push + 市场描述 + LICENSE/NOTICE 复核 | 未开始 |

---

## 阶段 2 拆解与实况（2026-10-21 晚完成前四项）

| 序号 | 任务 | 产出 | 状态 |
| --- | --- | --- | --- |
| 1 | `dsh/store.js` + 迁移执行器 | 可重放 28 表；`0002_rhythm_last.sql` 已冻结 | ✅ |
| 2 | `dsh/readmodels.js` | 12 页读模型；与 `demo-data.js` 逐字段 parity（store.test ③ deepStrictEqual） | ✅ |
| 3 | `dsh/server.js` 接口 | `/api/health`、`/api/bootstrap`、`POST /api/bp`、`GET /api/export/summary`、静态文件、JSON 404、路径穿越拦截 | ✅ |
| 4 | MinerU 解析链路 | 上传 → 候选 → 草稿核对 | 🔵 第一步完（客户端层 14 测 + 真实鉴权自检 ✅）；剩余 labparse 抽取（ATTR 指标字典）/ import 编排（0003 迁移）/ 上传核对 UI |
| 5 | 血压录入 | 体位（卧/坐/立）+ 症状 + 当时用药；写入层 `dsh/writes.js` + `POST /api/bp` + 录入表单 | ✅（原文名"四点位/缺健侧"是乳腺模板残留，已按 ATTR 语义实现并注明） |
| 6 | 导出 | 门诊摘要 `dsh/export.js`（所见即所得；家系与看法按构造排除） | ✅ |
| 7 | 一图秀接真实数据 | 与原型几何一致（无头实测：2 线 × 8 段三次贝塞尔、事件竖虚线 2 条、分类序列只点不连线） | ✅ |
| 8 | AI 草稿接原生输入框 | iframe 侧合同完（预览弹窗 → `pinky:agent-draft` postMessage，同源桩实测 type/origin/source 全对；独立启动退化复制）。**宿主侧监听端不在本仓库**，列入 M6 装机交互层验证 | ✅（本仓库侧） |

**顺序不可颠倒**：读模型先于接口，接口先于解析；解析先于导出。理由：导出模板一旦先写，会把读模型的字段名锁死在错误形状上（乳腺 v0.4 踩过）。

### 本轮移植的两个数据层修正（都走了"只增不改"）

1. `rhythm` 表补 `last` 列（`schema/0002_rhythm_last.sql`，sha256 已冻结）。原因：原型 `rhythmRows` 是五位元组，生成器原来把「上次」丢进 `next`，parity 当场红。
2. `autonomic` 演示数据删除赘余第 5 位（schema 无 `note` 列、UI 只读 4 列）——改演示数据，不加迁移。

### 面板布局决策（阶段 2）

- `customFrame: false`（标准分栏，宿主管原生会话）。依据与升级路径写在 `lib/layout.js` 头注释；`customFrame: true` 需要 React 外壳，列阶段 3。
- `dsh/readmodels.js` 的 `layout.panel` 曾硬编码 `customFrame: true` 与 layout.js 打架，已改为从 `lib/layout.js` 导入（`test/server.test.mjs` ② 有断言盯死）。

---

## 阶段 3 清单（M6 装机前）

1. **customFrame 升级评估**（可选）：按乳腺样板补 React 外壳（根首元素 `<header>` + `--dsh-frame-leading-clearance` 避让 + 会话常驻不卸载）；不升就维持标准分栏，页面内 AI 面板已可拖可记忆。
2. MinerU 解析链路（任务 4）+ 四点位录入（任务 5）+ 导出（任务 6）+ AI 草稿接原生输入框（任务 8）。
3. 装机：`~/Library/Application Support/dsh-desktop/harness/profiles/web`，`NODE_OPTIONS= npx pnpm@10.15.0 --dir <profile> add -w <abs>.tgz`；包名写进 `dsh.profile.bundles`；`dsh.client.platform` 必须 `"web"`。
4. 三层验收：配置层（state.json / bundles）/ 加载层（harness.log 无 reject）/ 交互层（真实点击 12 页）。
5. 回流：`~/.workbuddy/skills/` 家族约定更新；**食管癌 `public/app.js:1119` 有同一处键盘步长量纲 bug，顺手修**（见 LESSONS L24）。

---

## 每阶段结束必做

1. `npm run check`（版本同步 → 语法 → 冻结合同 → 文案红线 → 密钥 → 单测 → 版本一致）。
2. 无头实测：页签穷举、`body.scrollWidth`、控制台 0 error、0 个 4xx。
3. 截图归档到 `docs/screenshots/`，逐张目视。
4. 记 `docs/LESSONS.md`：本轮踩的坑与原因，不写"已优化"这种空话。
5. 闸口留痕：确认人 / 原话 / 日期 / 版本，写进 `docs/PROTOTYPE-REVIEW.md`。
