/* 写入层：血压（体位性低血压记录）。
 *
 * 这里盯的是四条契约在**落库那一刻**是否成立，不是界面长什么样：
 * 1. 空 ≠ 阴性：留空的字段存 NULL，不折算成 0，也不写成"无"；
 * 2. 缺体位不参与卧-立对照：对照在读取时算，库里不存差值（本层不产出差值字段）；
 * 3. 校验失败要带字段名，交回界面定位输入框；
 * 4. 只 INSERT 不 UPDATE：写两条同日期的记录会并存，不会后者覆盖前者（更正只新增版本）。
 */

import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Workbench } from '../dsh/workbench.js';
import { addBpRow, ValidationError } from '../dsh/writes.js';

const tmp = mkdtempSync(join(homedir(), '.xyb-attr-writes-'));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ } });

function fresh() {
  return Workbench.open(join(tmp, `ws-${Math.random().toString(36).slice(2)}`));
}

test('① 写入后回读：形状与原型 p.bp 一致（7 位元组），追加在末尾', async () => {
  const wb = await fresh();
  const before = wb.bpRows('A').length;
  wb.addBp({ profileKey: 'A', d: '2026-10-22', position: '立', sys: 96, dia: 58, pulse: 74, symptom: '眼前发黑', drugNote: '呋塞米 20mg' });
  const rows = wb.bpRows('A');
  assert.equal(rows.length, before + 1, '应追加一条');
  const last = rows[rows.length - 1];
  assert.equal(last.length, 7, `元组应为 7 位，实际 ${last.length}`);
  assert.deepEqual(last, ['2026-10-22', '立', 96, 58, 74, '眼前发黑', '呋塞米 20mg']);
  for (const r of rows) assert.ok(Array.isArray(r) && r.length === 7, '每一行都应是 7 位元组');
  wb.close();
});

test('② 空 ≠ 阴性：留空的字段落 NULL，不是 0，也不是"无"', async () => {
  const wb = await fresh();
  const row = wb.addBp({ profileKey: 'A', d: '2026-10-23', sys: 110, dia: 70, pulse: '', symptom: '   ', drugNote: '—' });
  assert.equal(row.pulse, null, '脉搏留空应为 NULL');
  assert.equal(row.symptom, null, '症状留空应为 NULL');
  assert.equal(row.drug_note, null, '占位符「—」应视为没填');
  assert.equal(row.position, null, '没选体位应为 NULL');
  /* 落库后从 SQL 里再读一次，确认不是"内存里是 null、库里是 0"。
     node:sqlite 返回 null-prototype 行对象，直接 deepEqual 会因原型不同而红（readmodels.js 踩过），先摊平。 */
  const stored = { ...wb.db.prepare('SELECT pulse, symptom, drug_note FROM bp_rows WHERE profile_key=? AND d=?').get('A', '2026-10-23') };
  assert.deepEqual(stored, { pulse: null, symptom: null, drug_note: null });
  wb.close();
});

test('③ 校验：假日期 / 收缩压低于舒张压 / 非法体位 / 档案不存在 —— 都带字段名', async () => {
  const wb = await fresh();
  const cases = [
    [{ profileKey: 'A', d: '2026-02-31', sys: 120, dia: 80 }, 'd'],
    [{ profileKey: 'A', d: '20261022', sys: 120, dia: 80 }, 'd'],
    [{ profileKey: 'A', d: '2026-10-22', sys: 80, dia: 120 }, 'sys'],
    [{ profileKey: 'A', d: '2026-10-22', sys: 400, dia: 80 }, 'sys'],
    [{ profileKey: 'A', d: '2026-10-22', sys: 120 }, 'dia'],
    [{ profileKey: 'A', d: '2026-10-22', sys: 120, dia: 80, position: '躺' }, 'position'],
    [{ profileKey: 'NOPE', d: '2026-10-22', sys: 120, dia: 80 }, 'profileKey'],
  ];
  for (const [input, field] of cases) {
    assert.throws(() => wb.addBp(input), (e) => {
      assert.ok(e instanceof ValidationError, `${JSON.stringify(input)} 应抛 ValidationError`);
      assert.equal(e.field, field, `${JSON.stringify(input)} 的字段名应为 ${field}，实际 ${e.field}`);
      return true;
    });
  }
  /* 失败后不能留下半条记录 */
  assert.equal(wb.bpRows('A').length, 5, '校验失败不应写入任何行（事务回滚）');
  wb.close();
});

test('④ 缺体位不生成差值：库里没有差值字段，也不把 NULL 折算成 0', async () => {
  const wb = await fresh();
  wb.addBp({ profileKey: 'A', d: '2026-10-24', sys: 100, dia: 62 });   // 无体位
  const cols = wb.db.prepare("PRAGMA table_info('bp_rows')").all().map((c) => c.name);
  assert.ok(!cols.some((c) => /diff|delta|差值/.test(c)), `bp_rows 不应有差值列，实际列：${cols.join(',')}`);
  const row = wb.db.prepare('SELECT position, sys, dia FROM bp_rows WHERE profile_key=? AND d=?').get('A', '2026-10-24');
  assert.equal(row.position, null, '缺体位应存 NULL');
  assert.equal(row.sys, 100);
  wb.close();
});

test('⑤ 同日期再写一条：新增一行而不是覆盖（更正只新增版本）', async () => {
  const wb = await fresh();
  const before = wb.db.prepare('SELECT COUNT(*) AS n FROM bp_rows WHERE profile_key=?').get('A').n;
  wb.addBp({ profileKey: 'A', d: '2026-10-25', position: '卧', sys: 118, dia: 72 });
  wb.addBp({ profileKey: 'A', d: '2026-10-25', position: '立', sys: 92, dia: 58 });   // 同日不同体位
  const after = wb.db.prepare('SELECT COUNT(*) AS n FROM bp_rows WHERE profile_key=?').get('A').n;
  assert.equal(after, before + 2, '同日期两条应并存');
  const same = wb.db.prepare('SELECT position FROM bp_rows WHERE profile_key=? AND d=? ORDER BY ord').all('A', '2026-10-25');
  assert.deepEqual(same.map((r) => r.position), ['卧', '立']);
  wb.close();
});

test('⑥ addBpRow 直接调用（不经事务包装）也能用，且 ord 连续', async () => {
  const wb = await fresh();
  const db = wb.db;
  const a = addBpRow(db, { profileKey: 'B', d: '2026-10-26', position: '坐', sys: 128, dia: 78, pulse: 70 });
  const b = addBpRow(db, { profileKey: 'B', d: '2026-10-27', position: '坐', sys: 124, dia: 76, pulse: 68 });
  assert.equal(b.ord, a.ord + 1, 'ord 应递增');
  const rows = wb.bpRows('B');
  assert.deepEqual(rows.slice(-2), [
    ['2026-10-26', '坐', 128, 78, 70, null, null],
    ['2026-10-27', '坐', 124, 76, 68, null, null],
  ]);
  wb.close();
});
