# 发布与回滚记录

版本/tag/commit：v0.2.3 / M6 提交（见文末「本轮提交」）。变更的功能 ID：M6 装机 + M7 发布。
用户授权范围：`G1/2/3确认，M6-7完成，参考最新脚手架最新版本…更新等`（2026-10-24 原话，见 `docs/SIGNOFF-2026-10-24.md`）。**市场投稿不在本句授权内**，故本轮只做本机装机与仓库同步，不提交市场 PR。

源码检查：`NODE_OPTIONS= npm run check` 全绿——版本 8 处同源 v0.2.3、29 表可重放、冻结合同 `ed53b00aaa79…` 未变、文案红线 0 命中、单测 **82 条**（含新增 `test/host-mount.test.mjs` 3 条）。
包检查：`release/xyb-community-attr-workbench-0.2.3.tgz`，437.5 kB / 45 文件（unpacked 716.1 kB），shasum `ce53a022fbd3f1edb6c917c1c132e1152176170c`。
实机证据：`npm run probe:install` 对**装机副本**跑 45 项断言全过；截图 `docs/screenshots/install-0.2.3-dashboard.png`；窄宽基线见 `docs/RESPONSIVE-RULES.md`（296 视图 0 问题）。
README/许可证/素材来源/运行依赖/更新说明：`LICENSE`（专有许可 + 第三方归属 + 免责）、`NOTICE.md`、README「安装」段；`assets/`（3 MB CTCAE 参考 PDF + 品牌原图）**不进包**，`files` 只留白名单。
演示数据清单已清理或明确示例环境：装机后库内无数据会 `seedDemo()` 自种，界面明确是「陈先生 / 李女士」示例档案。
数据库迁移与旧包兼容：`0001` 28 表 + `0003` 1 表 = 29 表；只增不改，旧库直接 `migrate()`。
可用备份：装包前 `profiles/web/package.json` 备份为 `package.json.bak-attr-0.2.1`。
市场分发来源：**不投稿**（未授权）；本机安装来源 = 本地 tgz（`file:` 依赖）。

| 动作 | 目标 | 真实结果/URL/证据 | 状态 |
| --- | --- | --- | --- |
| 本地安装 | Desktop/profile | `harness/profiles/web`：`@xyb-community/attr-workbench@0.2.3`（+1 包 4.8s） | 已执行 |
| Git push | origin/main | 见「本轮提交」 | 已执行 |
| Release/npm | tag `v0.2.3` / 本地 tgz | `ce53a022…`（未发 npm registry） | 已执行（tag）；npm 不适用 |
| 市场 PR | 官方目录仓库 | 用户未授权投稿 | 不适用 |
| 上架 | 公开 catalog | 同上 | 不适用 |
| 组织 BACKLOG 状态 | `.github/BACKLOG.md` §2.2 #80 | 建议改 `🔵 v0.2.3（2026-10-24 装机三层验收）`，真机确认后再 🟢（M8） | ⏸ 用户 2026-10-24 决定先不发布 |
| 本地 tgz 自测 | `npm run install:local` | 432.5 kB / 46 文件逐个对上；探针 45/45 | 已执行（本轮替代发布动作） |

市场状态说明：GitHub Release 不会自动成为市场安装来源。本轮**没有**提交目录 PR，也不声称「已上架」。
工作台市场发布另按 `docs/10-MARKET-PUBLISHING.md` 执行；未授权投稿时标不适用，不把 Git push 当市场发布。

回滚步骤：`profiles/web` 把依赖改回上一个 tgz（或 `pnpm add -w --save-exact file:…0.2.1.tgz`）并从 `dsh.profile.bundles` 删掉 `@xyb-community/attr-workbench`。数据兼容：回滚不删库，`xyb-attr.sqlite` 原样保留（0.2.1→0.2.3 无迁移变更）。
已知限制：`pinky:agent-draft` 的**宿主侧监听端不在本仓库**，装机交互层只核到「页面发出草稿事件」这一侧，宿主侧行为需在 Desktop 内人工确认。

---

## 0.2.1 → 0.2.3 装机记录（M6 · 2026-10-24）

三版连打不是版本洁癖：0.2.1 装上去会白屏，0.2.2 修完白屏但包里少一个文件——每版都是探针真的抓到问题才重打。

| 版本 | 抓到什么 | 根因 | 处理 |
| --- | --- | --- | --- |
| 0.2.1 | L1 直接 import 失败 | `dsh/demo.js` 引 `../demo/build-demo-data.mjs`，而 `files` 里没有 `demo/`——**开发版能跑（仓库里有那目录），装进 Desktop 立刻找不到模块** | 0.2.2：`files` 只加 `demo/build-demo-data.mjs`（不带 188 kB 的演示 sqlite） |
| 0.2.2 | 12 页全白，控制台只有 `Unexpected token '<'` | iframe 指向 `/api/attr/ui/index.html`，页面里 `<script src="app.js">` 是相对路径 → 请求 `/api/attr/ui/app.js` → 剥掉 prefix 后是 `/ui/app.js` → 静态层找不到就**兜底回 index.html**，浏览器把 HTML 当 JS 解析 | 0.2.3：静态段先剥 `/ui` 前缀再解析；新增 `test/host-mount.test.mjs` 三条钉死（dev-server 挂在根上，本地永远看不到这个故障） |
| 0.2.3 | ✅ 45 项全过 | — | 本轮装机版 |

| 项 | 值 |
| --- | --- |
| tgz | `release/xyb-community-attr-workbench-0.2.3.tgz`（437.5 kB / 45 文件，shasum `ce53a022…`） |
| 安装 | `NODE_OPTIONS= DSH_HOME=… npx pnpm@10.15.0 --dir harness/profiles/web add -w --save-exact file:…0.2.3.tgz`（pnpm 10.34.5，+1 包 4.8s） |
| 五要素 | ✅ version 0.2.3 / ✅ `dsh.client.platform="web"` + `bundle.patch` / ✅ patch 有 `config.root: !!js dshHomePath('attr-workbench')` / ✅ `package.json` `file:` 依赖 / ✅ `dsh.profile.bundles` 登记（插在 liver-cancer-workbench 之后） |
| 配置层 | `node scripts/check-install.mjs` → ✓ 已登记到 Desktop 实际加载的 profile |
| 加载层 | `npm run probe:install` L1 全过：import 装机副本成功、四导出齐全、`name=attr-main`、缺 `config.root` 时 health 报 `ok:false` 且指出资料目录（**不退内存库**） |
| 接口层 | L2 全过：health 200 / bootstrap 六件齐全（profiles=A,B）/ `/api/attr/ui/` 200 / `POST /api/attr/api/bp` 200 且**回读磁盘库 `bp_rows` 有数**（证明写的是 `config.root` 那只库，不是内存库） |
| 交互层 | L3 全过：真 Chrome 打开装机副本，顶栏版本 chip = `v0.2.3`（bootstrap 回填成功）、12 个导航页逐个点开有内容且 `scrollWidth === innerWidth`、0 未捕获异常、0 失败请求 |
| 待用户 | ① 重启 DSH Desktop → 设置→通用→启用工作台 → 添加「小甲宝」→ 业务区应为真实界面；② 点「AI 对话」确认原生会话被拉起（宿主侧 `pinky:agent-draft` 监听端不在本仓库）；③ 关掉重开，确认 `harness/attr-workbench/xyb-attr.sqlite` 数据还在 |

## 本地 tgz 自测：`npm run install:local`（2026-10-24）

不发布也能验：打包装进 Desktop 的 profile，再对装机副本跑探针，全程一条命令。

```
npm run install:local              # pack → 装 → 逐文件比对 → 探针
npm run install:local -- --dry-run # 只打包、只列文件，不碰 profile
```

五步：① `npm pack`（只打 `files` 白名单）② 备份 `profile/package.json` 后 `pnpm add -w file:<tgz>` ③ **删掉副本目录再 `pnpm install`** 强制重链 ④ 逐文件比对「包里那 N 个」与「副本里那 N 个」⑤ `ATTR_PKG=<副本> node scripts/probe-install.mjs`。

### 为什么第 ③ 步不能省（这一版实测踩到）

同一版本号重打包后，`pnpm add -w file:xxx.tgz` 会打印 **"Already up to date"**，lockfile 里的 `integrity` **已经换成新包的**，但 `node_modules` 下那坨文件**还是旧的**。
后果很隐蔽：探针跑的是上一轮打出来的代码，而两次版本号都是 `0.2.3`，看 `package.json` 分辨不出来——**你以为验了新包，其实验的是旧副本**。
所以脚本第 ④ 步必须逐文件对；对不上就直接退出 1，不跑探针（跑出来的绿是假的）。

顺带一条：`npm pack` 同版本重打会得到不同的 shasum（`bc606f44…` → `edf824d8…` → `cad4837a…`），因为文件时间戳参与归档。**别拿 shasum 当版本号用**，版本看 `package.json`，内容看第 ④ 步的逐文件比对。

| 本轮自测结果 | 值 |
| --- | --- |
| 包 | `release/xyb-community-attr-workbench-0.2.3.tgz`（432.5 kB / 46 文件） |
| 装机副本 | 46 个文件逐个对上，与仓库 `dsh/server.js` 逐字节一致 |
| 装机副本自查 | 用新版检查器跑副本本身：`staticPass: true`、0 errors、2 warnings（⑧ 子路径提示 + peer 提示，均为预期） |
| 探针 | 45/45 全过（含「写一条血压回读磁盘库有数」） |
| `npm run check` | 全绿 |

## 探针为什么必须对「装机副本」跑

本轮两次故障的共同点：开发版与装机副本走的不是同一条路。

| 差异点 | 开发版 | 装机副本 |
| --- | --- | --- |
| 模块路径 | 仓库内相对路径，`demo/` 一定在 | `node_modules` 里只有 `files` 白名单解出来的东西 |
| 静态资源 | dev-server 挂在根上，`/app.js` | 宿主挂在 `/api/attr` 下，页面在 `/api/attr/ui/`，相对路径变 `/api/attr/ui/app.js` |
| 鉴权 | 无 | 先过 `connection.requestRejection` |
| 数据目录 | 命令行 `--workspace` | `cordis.patch.yml` 的 `dshHomePath` |

`scripts/probe-install.mjs` 默认目标就是 `profiles/web/node_modules/@xyb-community/attr-workbench`，自带假宿主（只实现 `webServer.register` / `connection.requestRejection` / `effect`）。`@deepseek-ai/schemastery` 是宿主注入的 peer（profile 里刻意没有），探针用最小 shim 顶替，除此以外一行不放宽。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| 见 `git log`（M6/M7） | 装机三版修复 + `probe:install` 探针 + `LICENSE` + 响应式规则与探针 + `RELEASE.md` + `CHANGELOG` 0.2.3 段 |
