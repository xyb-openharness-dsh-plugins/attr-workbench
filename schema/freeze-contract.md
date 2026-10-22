# Schema 冻结合同（ATTR 工作台 v0.1.0）

冻结日期：2026-10-21　冻结人：搭建轮（待用户确认后生效）

## 冻结对象

| 文件 | sha256 | 内容边界 |
| --- | --- | --- |
| `0001_initial.sql` | ed53b00aaa793601a8bd7e0f773884ff692446e98d141bc2e9b563062a1875b7 | 28 张表、全部 CHECK、全部索引。**只读** |
| `0002_rhythm_last.sql` | 3ba4ca68a32513d367ff81ab84854017ecb2992173ab0438b3b531522296ed6d | 给 `rhythm` 补 `last TEXT` 一列，见下节。**只读** |
| `0003_import.sql` | 911d76a76fa466e3244eb1c67bf3a4f7a1abcfdae1e267785bd8006bfcb75162 | 导入链路：新建 `parse_jobs`；`documents` 补 `sha256`/`rel_path`/`pages`；`candidate_fields` 补 `doc_id`/`metric_key`/`unit`/`value_num`/`value_text`。只加列，无 NOT NULL、无默认值。**只读** |

表格由 `scripts/check-schema.mjs` 逐文件比对（正则只认纯文件名，别写成 `schema/0001_*.sql`）。
已执行迁移：以上三个。`0004_*` 及以后继续按"只增不改"追加。

## 0002_rhythm_last.sql 是什么、为什么加

`rhythm` 表补一个 `last TEXT` 列。原因：0001 的 rhythm 只有 `(item, freq, guideline, next)`，
而原型的 `rhythmRows` 是五位元组 `[项目, 频率, 依据, 上次, 下次]`——生成器当时把 `r[4] ?? r[3]`
写进 `next`，「上次」这一位被丢掉，读模型只能还原四位，与 `prototypes/v0.2/demo-data.js` 的
parity 断言（`test/store.test.mjs` ③）当场红。加列不改 0001，是这条契约的标准动作。

## 冻结的含义（三条，缺一不可）

1. **不许改已发布迁移的任何字节**。改一个空格，sha256 就变；已装机用户的库不会重放，本地与远端就分叉了。
2. **结构变更只能新增 `000N_*.sql`**。加列用 `ALTER TABLE ... ADD COLUMN`；删列/改类型走"新表 + 搬数据 + 改视图"，不许 `DROP` 用户数据。
3. **校验脚本必须跑**。阶段 2 引入 `scripts/check-schema.mjs`，比对上面这张表的 sha256；不一致就 fail，不许"先提交后补"。

> 注：`0001_initial.sql` 的 sha256 由 `scripts/check-attr.mjs` 第 2 条与
> `scripts/check-schema.mjs` 双处核对；新增 000N 不影响 0001 的哈希，两份校验都仍应通过。

## 可以做的事（不破坏冻结）

- 新增迁移文件（`0002_candidate_dates.sql` 这类）。
- 新增索引（在**新**迁移里）。
- 新增视图（读模型可放在视图或 `dsh/readmodels.js`，两者都可）。
- 改 `dsh/readmodels.js`（读模型不是 schema）。

## 不能做的事

- 修改 `0001_initial.sql` 里的 CHECK 条件（如放宽 `bp_rows.position` 的枚举）。
- 把 `genotype_rows.superseded` 改成物理删除。
- 给 `viewpoints` 加 `is_conclusion` 列。
- 把 `family_rows.private` 默认值从 `1` 改成 `0`。

以上四条都会直接破坏 `docs/SCHEMA.md` 里写的四条契约中的某一条。

## 附：表清单（28）

`subjects` / `phenotype_rows` / `stage_rows` / `genotype_rows` / `diagnosis_rows` /
`cardiac_rows` / `echo_rows` / `rhythm` / `rhythm_events` / `bp_rows` /
`neuro_rows` / `autonomic_rows` / `redflag_rows` /
`drug_rows` / `tolerance_rows` / `monitor_rows` /
`family_rows` / `counsel_rows` / `daily_rows` / `events` /
`documents` / `candidate_fields` / `metric_groups` / `metrics` / `metric_points` /
`viewpoints` / `trials` / `demo_meta`

## 附：演示库一致性（同一份来源）

| 产物 | 大小 | 说明 |
| --- | --- | --- |
| `prototypes/v0.2/demo-data.js` | 29,670 B | 原型直接加载 |
| `demo/demo-data.sqlite` | 180,224 B | schema 校验用，逐表与 js 对齐 |
| 生成脚本 | `demo/build-demo-data.mjs` | 唯一来源，sha256 前缀 `c3e082324511a85f` |

改演示数据只能改脚本再重新生成；不许手改 `demo-data.js`。
