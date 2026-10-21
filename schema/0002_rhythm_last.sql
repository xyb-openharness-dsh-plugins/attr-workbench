/* ATTR 工作台 · 0002：给 rhythm 表补 last 列。
 *
 * 为什么补：0001 的 rhythm 只有 (item, freq, guideline, next)，而原型的 rhythmRows 是
 * 五位元组 [项目, 频率, 依据, 上次, 下次]。生成器当时把 r[4] ?? r[3] 写进 next，
 * 「上次」这一位被丢掉了——读模型只能还原出四位，与 prototypes/v0.2/demo-data.js 的
 * parity 断言当场红（test/store.test.mjs ③）。
 *
 * 为什么不改 0001：0001 已冻结，sha256 记在 schema/freeze-contract.md。
 * 迁移只增不改，加列只能新开一个迁移文件（家族规矩，改 0001 等于改契约）。
 *
 * 只增列、不给 NOT NULL 默认值：SQLite 的 ALTER TABLE ADD COLUMN 不支持加 NOT NULL
 * 而没有默认值的列；这里也没有"必须填"的理由——按需复查项的"上次"本来就可以空。
 */
ALTER TABLE rhythm ADD COLUMN last TEXT;
