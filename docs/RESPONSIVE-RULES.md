# 窄宽自适应规则（AI 面板打开后尤其重要）

> 版本：0.2.1 起执行。规则整份自**小星宝 0.1.5** 的 `docs/RESPONSIVE-RULES.md` 移入，换成 ATTR 自己的选择器与实测数字。
> 起因（原项目）：AI 面板打开后业务区只剩 60%–75% 宽，卡内「标签 / 值 / 说明」横排被压成一列列竖排单字。
> 规则不是"多加几个断点"，而是**别让卡内元素横向互挤**。

## 0. 业务区视口 ≠ 窗口视口

宿主用 customFrame 时业务界面在 iframe 里，AI 面板一展开 iframe 就变窄；本项目当前是**标准分栏**（`customFrame:false`），业务区同样是宿主分出来的一块，不等于 `window.innerWidth`。

- 不要用 `window.innerWidth` 判断"要不要换布局"；
- 断点按"业务区能放下什么"定，不按设备类型（desktop/tablet）想。

## 1. 硬规则（每条都有探针或单测兜底）

| # | 规则 | 违规表现 | 兜底 |
| --- | --- | --- | --- |
| 1 | 卡内「标签 + 值 + 说明」纵向堆 | 三行文字各挤成一列竖排单字 | `test/responsive.test.mjs` |
| 2 | 多块并排用 grid + `minmax(0,1fr)`，不用 `flex:1` | 块宽由内容牵动，窄宽下先后失守 | 同上 |
| 3 | 行内标签（`<b>…</b>`）不能成为可收缩 flex item | 标签被压到 30px、逐字换行 | 同上 |
| 4 | 允许收缩的容器都要 `min-width:0` | 撑破父容器、出现横向滚动条 | `probe:resp` |
| 5 | 表格与长路径横向滚动是**有意为之**，必须给 `.scroll-hint` | 读者不知道右边还有内容 | `probe:resp` + 人工 |
| 6 | `white-space:nowrap` 只用在短 token（日期、数值）上 | `2026-09-25` 被拆成两行 | 人工 |

## 2. 断点取值（照现有实体，不发明第四档）

| 宽度 | 变化 | 理由 |
| --- | --- | --- |
| ≤ 1180 | `.dash-cols` 单列、`.rail` 转 3 列横排、`.overview` / `.subtype-hero` 单列 | 两栏 1.4:1 时右栏只剩 200px 出头 |
| ≤ 900 | `.workspace` 单列（侧栏转横向滚动导航）、`.grid.two/three/four` 与 `.rail` 全部单列、`.chart-wrap` 横向可滚 + `.scroll-hint` 显形 | 再并排就只剩 100px 级 |
| ≤ 600 | 版本 chip 隐藏、`.cycle-table` 内边距收紧、`.path-row code` 独占一行 | 手机窄屏 |

> 结论：**任何"每块宽度 < 220px"的多列布局都算设计错误**，先降列数再考虑缩字。

## 3. 怎么验（不要口头说"没问题"）

```bash
NODE_OPTIONS= node scripts/probe-responsive.mjs     # 真实 Chrome，8 档宽度 × 12 页（≤940 还扫全部二级页签）
```

扫描规则在 `scripts/probe-responsive.mjs` 的 `SCAN` 段，三条与 §1 对应：

- **竖排单字**：元素宽 < 3em 且自身文字 ≥ 6 字；
- **横向溢出**：`documentElement.scrollWidth > innerWidth + 1`；
- **内容被裁**：`overflow:hidden|clip` 且 `scrollWidth > clientWidth + 2`（有文字才算；可横向滚动的表格不算）。

退出码非 0 即不通过。声明式约束另由 `test/responsive.test.mjs` 盯着（不需要 Chrome，进 `npm run check`）。

## 4. 2026-10-24 实测基线

| 项 | 结果 |
| --- | --- |
| 覆盖 | 8 档宽度（1300→620）× 12 个一级页 + ≤940 的全部二级页签 = **296 个视图** |
| 竖排单字 | **0** |
| 横向溢出 | **0**（每个视图 `scrollWidth === innerWidth`） |
| 内容被裁 | **0** |
| 取证 | `docs/screenshots/responsive-940-dashboard.png`（AI 面板开、业务区约 65% 宽） |

结论：ATTR 的 `style.css` 从原型期就按这条规则写（`.grid.*` 全用 `minmax(0,1fr)`、`.metric-grid` 用 `auto-fill minmax(206px,1fr)`、`.table-wrap` 自带 `overflow-x:auto` + `min-width:0`），所以移入探针后一次通过。**这条基线是给后续改动用的**：以后新增卡片若把「标签/值/注」塞进一行 flex，探针会立刻红。

## 5. 家族复用提示

小粉宝 / 小莲宝 / 小铃铛 / 小肺宝等若也有"标签+值+注横排"的摘要条或 flex 包行内标签，装机会出现同样的竖排单字。把 `scripts/cdp.mjs` 与 `scripts/probe-responsive.mjs` 整份抄过去即可，只需把导航方式（本项目是点击 `[data-view]`，小星宝是 `#hash`）与页面键名换成各自的。
