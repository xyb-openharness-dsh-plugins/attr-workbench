/* 数据层：迁移幂等 / 播种幂等 / 与 demo-data.js 的 parity / 读模型形状。
 *
 * parity 是这一层最重要的断言：开发版 `/api/bootstrap` 的 profiles 必须与定稿原型
 * prototypes/v0.2/demo-data.js 逐字段一致，否则前端是照着原型写死的形状渲染的，
 * 差一个字段就是"某个卡片空白"这种很难定位的 bug。
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { openDatabase, migrate, close } from '../dsh/store.js';
import { seedDemo, hasDemoData } from '../dsh/demo.js';
import { bootstrap, listSubjects, getProfile } from '../dsh/readmodels.js';

const ROOT = new URL('..', import.meta.url).pathname;
const demoSrc = readFileSync(join(ROOT, 'prototypes/v0.2/demo-data.js'), 'utf8');
const DEMO = JSON.parse(demoSrc.slice(demoSrc.indexOf('=') + 1).replace(/;\s*$/, ''));

const tmp = mkdtempSync(join(homedir(), '.xyb-attr-test-'));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ } });

test('① migrate 幂等：第二次执行不重跑已应用的迁移', () => {
  const db = openDatabase(':memory:');
  const first = migrate(db);
  const second = migrate(db);
  assert.deepEqual(first.executed, ['0001_initial.sql', '0002_rhythm_last.sql'], '首次应执行 0001 + 0002');
  assert.deepEqual(second.executed, [], '第二次不应重跑');
  assert.equal(second.applied.length, 2);
  close(db);
});

test('② seedDemo 幂等：调两次只写一份档案', () => {
  const db = openDatabase(':memory:');
  migrate(db);
  const a = seedDemo(db);
  const b = seedDemo(db);
  assert.equal(a.skipped, false);
  assert.equal(a.subjects, 2);
  assert.equal(b.skipped, true, '第二次应整批跳过');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subjects').get().n, 2);
  close(db);
});

test('③ parity：库里读出的 payload 与 demo-data.js 逐字段一致', () => {
  const db = openDatabase(':memory:');
  migrate(db);
  seedDemo(db);
  const payload = bootstrap(db, { version: '0.1.0', build: 'test' });
  for (const key of ['A', 'B']) {
    assert.deepStrictEqual(payload.profiles[key], DEMO.profiles[key], `profiles.${key} 与 demo-data.js 不一致`);
  }
  assert.deepStrictEqual(payload.trials, DEMO.trials, 'trials 与 demo-data.js 不一致');
  assert.deepStrictEqual(
    { windowStart: payload.meta.windowStart, windowEnd: payload.meta.windowEnd, note: payload.meta.note },
    { windowStart: DEMO.meta.windowStart, windowEnd: DEMO.meta.windowEnd, note: DEMO.meta.note },
    'meta（时间窗）与 demo-data.js 不一致'
  );
  assert.equal(payload.version, '0.1.0');
  close(db);
});

test('④ 读模型形状：元组数组位数、指标点按 ord、分类值是原文', () => {
  const db = openDatabase(':memory:');
  migrate(db);
  seedDemo(db);
  const p = getProfile(db, 'A');

  /* 元组数组的位数就是原型里的位数：多一位少一位都会让 parity 红、前端 r[n] 拿 undefined */
  assert.deepEqual(p.phenotype[0].length, 3, 'phenotype 行应 3 位');
  assert.deepEqual(p.stages[0].length, 5, 'stages 行应 5 位');
  assert.deepEqual(p.diagnosis[0].length, 6, 'diagnosis 行应 6 位');
  assert.deepEqual(p.echo[0].length, 9, 'echo 行应 9 位');
  assert.deepEqual(p.bp[0].length, 7, 'bp 行应 7 位');
  assert.deepEqual(p.drugs[0].length, 9, 'drugs 行应 9 位');
  assert.deepEqual(p.family[0].length, 6, 'family 行应 6 位（含 private）');
  assert.deepEqual(p.daily[0].length, 5, 'daily 行应 5 位（schema 多一个 note，读模型切掉）');
  assert.deepEqual(p.rhythmRows[0].length, 5, 'rhythmRows 行应 5 位（0002 补的 last）');
  assert.deepEqual(p.events[0].length, 2, 'events 行应 2 位（kind 列不带给前端）');
  assert.deepEqual(Object.keys(p.genotype).sort(),
    ['doctorText', 'kind', 'lab', 'method', 'reportDate', 'state', 'variant', 'zygosity'], 'genotype 键集合');

  /* 指标：键集合与 demo-data.js 完全一致（band_low/band_high 是两个键，不是 band 数组） */
  const m = p.metrics.find((x) => x.key === 'ntprobnp');
  assert.deepEqual(Object.keys(m).sort(),
    ['band_high', 'band_low', 'cat', 'color', 'dec', 'key', 'kind', 'name', 'note', 'points', 'unit'], '指标键集合');
  assert.equal(m.points.length, 9);
  assert.equal(typeof m.points[0].v_num, 'number', '数值指标读出来必须是数字');
  assert.equal(m.points[0].v_text, null);
  assert.equal(m.points[0].d, '2026-10-16', '指标点按 ord 排（演示数据是新 → 旧）');

  const nyha = p.metrics.find((x) => x.key === 'nyha');
  assert.equal(nyha.kind, 'grade');
  assert.equal(nyha.dec, null, '分类指标 dec 必须是 NULL（不是 0）');
  assert.equal(nyha.unit, '', '分类指标的 unit 是空字符串，不能省键');
  assert.equal(typeof nyha.points[0].v_text, 'string', '分类指标读出来是原文本');
  assert.equal(nyha.points[0].v_num, null);

  /* H5：未做 ≠ 阴性 —— 野生型档案的 gene 步是 not_done 且 finding 为 NULL */
  const wt = getProfile(db, 'B');
  const gene = wt.diagnosis.find((r) => r[0] === 'gene');
  assert.equal(gene[1], 'not_done');
  assert.equal(gene[2], null, 'state 不是 done 时 finding 必须为 NULL');
  assert.equal(wt.genotype.kind, 'wildtype', '野生型档案也有一行 genotype（kind=wildtype）');

  assert.ok(p.docs.length >= 1 && p.candidates.length >= 1, '病情整理用的 docs/candidates 要带出来');
  assert.ok(p.rhythmRows.every((r) => r[3] && r[4]), 'rhythmRows 每位都要有上次与下次');
  assert.deepEqual(listSubjects(db).map((s) => s.profile_key), ['A', 'B']);
  close(db);
});

test('⑤ 文件库：真实落盘 + 重开后资料仍在（播种只发生一次）', () => {
  // sqlite 不会替你建父目录：目录得先存在（真实启动流程里由 Workbench.open 负责）
  mkdirSync(join(tmp, 'nested'), { recursive: true });
  const file = join(tmp, 'nested', 'xyb-attr.sqlite');
  const db1 = openDatabase(file);
  migrate(db1);
  seedDemo(db1);
  close(db1);
  const db2 = openDatabase(file);
  migrate(db2);
  assert.equal(hasDemoData(db2), true, '重开后档案还在');
  assert.equal(seedDemo(db2).skipped, true, '重开后不应再播种一遍');
  close(db2);
});
