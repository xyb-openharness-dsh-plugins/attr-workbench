# 小甲宝 ATTR-Pal 转甲状腺素蛋白淀粉样变性工作台

本机优先的 ATTR 型别确认、心脏与神经受累记录、治疗耐受与家族筛查准备工作台

**当前状态：装机版可跑（v0.6.0）**——12 个一级页 / 41 个二级页签、30 张表的 schema（`0001` 28 张 + `0003` 的 `parse_jobs` + `0004` 的 `caregiver_rows`）、434 条临床试验登记摘录，MinerU 上传→解析→逐项核对→入档全链路已用真实报告跑通。**G1–G3 已于 2026-10-24 签认**（见 [SIGNOFF](docs/SIGNOFF-2026-10-24.md)），本机装机与回滚记录见 [RELEASE](docs/RELEASE.md)；市场投稿未授权、未投稿。先看 [DEV-REQUIREMENTS-2026-10-21](docs/DEV-REQUIREMENTS-2026-10-21.md)（本轮硬约束）与 [DEV-PLAN](docs/DEV-PLAN.md)（里程碑）。初始化后先将 [项目设计提示词](docs/DESIGN-PROMPT.md) 交给当前Agent；它应展示实际路径并以已有用户/场景/流程素材对齐设计者、研究与取舍原则。癌种项目另有 [完整专用提示词](prompts/NEW-CANCER-WORKBENCH.md)。需求见 [BRIEF](docs/BRIEF.md)，规格见 [SPEC](docs/SPEC.md)，任务见 [TASKS](docs/TASKS.md)；先读 [AGENTS](AGENTS.md)。CLI输出交接与首问，实际对话由Agent接续。

## 界面

生活与照护 → 情绪与照护者：左边是「你写下的」原话，右边是照护记录位（v0.6.0 起可录入，
按日期倒序，右上角是「共几条」）。照护这块只记事实——谁在照顾你、这周最累的一件事、
有没有人能替手、你自己需要什么；不打分、不判定负担轻重。

![情绪与照护者：照护记录位](docs/screenshots/v0.6.0-caregiver-record.png)

治疗历程 → 当前方案：治疗三分类与 ATTR-ACT 数字的出处卡，口径冲突并列标「待核」，
不自行择一（v0.5.0）。

![当前方案的治疗出处卡](docs/screenshots/v0.5.0-treatment-source.png)

装机后的首页（Desktop profile，0.3.1 实机截屏）。

![装机后首页](docs/screenshots/install-0.3.1-dashboard.png)

其余页面截图在 `docs/screenshots/`（01–16 按页序，`responsive-*` 为窄宽基线，
`install-*` 为装机副本实机截图）。

## 开发顺序

先共创SPEC和候选数据关系，再交付HTML交互工作台；由用户确认对应版本/模块后，复核SCHEMA/API并实现生产功能。确认记录见docs/PROTOTYPE-REVIEW.md；模型不依赖前端Tab/流程。模板骨架不是业务已确认。

## 当前能力

**已有（装机版，v0.6.0）**

- 运行版 `public/` + `dsh/`：`npm run dev` 起本地服务（`/api/health`、`/api/bootstrap`、`POST /api/bp`、`GET/POST /api/caregiver`、`GET /api/export/summary`、`/api/import/*`），12 页读模型与原型逐字段 parity。
- 交互原型 `prototypes/v0.2/`：12 一级页 / 41 页签，可直接用 `python3 -m http.server` 打开，无需构建（快照冻结在 v0.1.0，不随开发版改动）。
- 演示档案 2 套（遗传型 / 野生型），来源唯一：`demo/build-demo-data.mjs`，同时产出 `demo-data.js` 与 `demo-data.sqlite`。
- Schema：`schema/0001_initial.sql` 28 张表 + `0003_import.sql` 的 `parse_jobs` + `0004_caregiver.sql` 的 `caregiver_rows`（共 30 张），四条数据契约以 CHECK 落地，sha256 见 `schema/freeze-contract.md`。
- 临床库 `research/attr/attr_trials_2026.sqlite`：434 条登记摘录，逐通道终态诚实标注（0 结果 ≠ 无试验）。
- MinerU 链路：上传（按哈希去重）→ 云端解析（任务留历史、事务原子）→ 候选（只抄写不判断）→ 逐项确认才进指标层。规则与实测坑见 [18-MINERU-PARSING](docs/18-MINERU-PARSING.md)。
- 设计文档：SPEC / PATIENT-FLOW / DIFF-MATRIX / CLINICAL-DATA-2026 / USER-RESEARCH / SCHEMA / HVT-REVIEW / DEV-PLAN。

**没有**

- 市场投稿：未授权，未向官方目录提 PR；本机装机来源是本地 `.tgz`（见 `docs/RELEASE.md`）。
- 未做访谈：H1–H5 五条假设全部标〔待访谈核实〕。
- 未查 ChiCTR / WHO ICTRP；试验状态一律"未核实"。
- 指南引用只做到"点回来源"（机构 + 卷期页 + DOI），未做到"点回某一句"：共识正文的小节起始页还没核到原件，页内已逐处标注。

## 开发与本地验收

需要 Node.js 22+、Git、包管理器和可用 DSH Desktop；采用 SQLite 时另核验 node:sqlite 版本条件。宿主 peers 的范围仅是模板基线，请与目标 Desktop 实际依赖核对。

```bash
npm install
npm run check
npm run pack:check
npm pack
```

`npm install` 可能按 npm 策略解析 peer；勿为消警告重复打包宿主 runtime。客户端本身是单文件；引入 TS/组件库后需添加构建步骤并保留单文件导出。

本地安装入口以当前 Desktop/CLI 帮助为准。安装后按 [docs/06-VALIDATION-AND-RELEASE.md](docs/06-VALIDATION-AND-RELEASE.md) 与官方自测完成真实 UI 验收，并填写 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。静态检查不代表已加载。

Logo 来源与使用限制见 assets/README.md。许可证、作者、仓库/发布策略由本项目维护者确认后填写；模板默认为 private/UNLICENSED。

感谢小x宝社区、DataElement 社区，以及 sam / hhx / 繁华的 ❤️ 贡献。

初始化来源记录见 `.dsh-wb-starter.json`。更新社区脚手架不会覆盖本项目；需要升级时先用相同确认配置在临时目录生成，再审阅差异。CLI 用法见 [docs/CLI-GIT.md](docs/CLI-GIT.md)。

## HTML先行与数据演进

业务开发前先交付HTML交互工作台原型、实际预览并由用户确认版本/hash和范围。数据设计先区分领域事实、流程状态和页面读模型，走查前端/流程变化、兼容与迁移；原型对象不直接作为表。见[规范](docs/14-HTML-AND-DATA-CONTRACT.md)。
