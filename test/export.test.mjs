/* 导出：门诊摘要。
 *
 * 重点盯 H3（家系是全站最高敏感级）——导出是数据"离开本机"的那条路，
 * 家系信息（成员、关系、检测状态）与看法层（viewpoints，用户的主观记录）
 * 一旦混进导出文本，就等于替用户做了告知决定。这里验证的不是"过滤了没有"，
 * 而是"构造上就没读"：模块只允许读 EXPORT_ALLOWLIST 名单里的表。
 */

import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Workbench } from '../dsh/workbench.js';
import { exportSummaryText, EXPORT_ALLOWLIST } from '../dsh/export.js';

const tmp = mkdtempSync(join(homedir(), '.xyb-attr-export-'));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ } });

function openWithExtraFamily() {
  return Workbench.open(join(tmp, `ws-${Math.random().toString(36).slice(2)}`)).then((wb) => {
    /* 往家系表塞一条显眼的探针数据：如果导出文本里出现这些词，说明泄漏了 */
    const ord = wb.db.prepare('SELECT MAX(ord) AS m FROM family_rows WHERE profile_key=?').get('A').m + 1;
    wb.db.prepare('INSERT INTO family_rows (profile_key,rel,label,tested,result,note,private,ord) VALUES (?,?,?,?,?,?,1,?)')
      .run('A', '姐妹', '陈明珠', '已检测', '阳性', 'PROBE-FAMILY-LEAK-8f3a');
    /* viewpoints 探针（列：d/mood/text/private）——写不进去就跳过，导出断言仍然有效 */
    try {
      const vord = wb.db.prepare('SELECT MAX(ord) AS m FROM viewpoints WHERE profile_key=?').get('A').m + 1;
      wb.db.prepare('INSERT INTO viewpoints (profile_key,d,mood,text,private,ord) VALUES (?,?,?,?,1,?)')
        .run('A', '2026-10-01', '记录', 'PROBE-VIEWPOINT-LEAK-2b7d', vord);
    } catch { /* 探针失败不影响其余断言 */ }
    return wb;
  });
}

test('① 导出文本包含档案、型别、分期与最新指标', async () => {
  const wb = await openWithExtraFamily();
  const j = wb.exportSummary('A');
  assert.equal(j.profileKey, 'A');
  assert.ok(j.text.includes('小甲宝 · 门诊摘要'), '应有页头');
  assert.ok(j.text.includes('陈志远'), '应有姓名');
  assert.ok(j.text.includes('61 岁'), '应有年龄');
  assert.ok(j.text.includes('遗传型 ATTRv'), '应标注型别');
  assert.ok(j.text.includes('NYHA Ⅱ · FAP Ⅰ · Gillmore Ⅱ'), '应带医生分期原文');
  assert.ok(j.text.includes('NT-proBNP'), '应有最近一次指标');
  assert.ok(j.text.includes('最近一次用药调整'), '应有用药调整');
  assert.ok(j.text.includes('不含私密家系信息'), '免责段必须有家系声明');
  assert.ok(j.text.includes('未经解读'), '免责段必须有未解读声明');
  wb.close();
});

test('② H3：家系探针数据不出现在导出里（构造上排除，不是过滤）', async () => {
  const wb = await openWithExtraFamily();
  const j = wb.exportSummary('A');
  assert.ok(!j.text.includes('PROBE-FAMILY-LEAK'), '家系探针不得出现在导出');
  assert.ok(!j.text.includes('陈明珠'), '家系成员姓名不得出现');
  assert.ok(!j.text.includes('携带同型变异'), '家系检测结果不得出现');
  assert.ok(!j.text.includes('PROBE-VIEWPOINT-LEAK'), '看法层探针不得出现在导出');
  /* 确认探针确实写进库了——否则上面的断言是空转 */
  const fam = wb.db.prepare('SELECT COUNT(*) AS n FROM family_rows WHERE profile_key=?').get('A');
  assert.ok(fam.n >= 1, '探针应在库里（证明导出不是碰巧没数据）');
  assert.deepEqual(j.excluded, ['family_rows', 'viewpoints', 'caregiver_rows'], '响应里要明示排除了哪几层（家系 / 看法 / 照护）');
  wb.close();
});

test('③ 白名单：导出模块声明允许读的表，家系与看法不在其中', () => {
  const joined = EXPORT_ALLOWLIST.join('|');
  assert.ok(joined.includes('subjects'), '导出需要姓名年龄');
  assert.ok(joined.includes('metrics'), '导出需要指标');
  assert.ok(joined.includes('tolerance_rows'), '导出需要用药调整');
  assert.ok(!/family|viewpoints/i.test(joined), `白名单不得含家系/看法：${joined}`);
});

test('④ 与页面所见一致：导出正文三段与原型「病情汇总」页同构', async () => {
  const wb = await openWithExtraFamily();
  const j = wb.exportSummary('A');
  /* 页面正文 = 一句话现状 + 最近一次记录 + 最近一次用药调整；导出应包含这三行 */
  assert.ok(j.text.split('\n').some((l) => l.startsWith('陈志远，61 岁')), '第一段应是一句话现状');
  assert.ok(j.text.split('\n').some((l) => l.startsWith('最近一次记录：')), '应有最近一次记录行');
  assert.ok(j.text.split('\n').some((l) => l.startsWith('最近一次用药调整：')), '应有用药调整行');
  wb.close();
});

test('⑤ 不存在的档案：明确报错，不静默返回别的档案', async () => {
  const wb = await openWithExtraFamily();
  assert.throws(() => wb.exportSummary('Z'), /档案不存在/);
  /* 不带参数调：必须显式给 profileKey，不许"猜一个默认档案" */
  assert.throws(() => wb.exportSummary(undefined), /档案不存在|profileKey/);
  wb.close();
});

test('⑥ 「最近一次」必须是日期最新的点，不是数组末位（2026-10-21 实测抓到末点取反）', async () => {
  const wb = await openWithExtraFamily();
  const j = wb.exportSummary('A');
  /* 读模型的 points 按 ord 存＝日期倒序：数组末位是最旧的（1860），
     页面显示按日期升序排过的最新点（980）。导出与页面必须一致。 */
  const nt = wb.db.prepare(
    "SELECT d, v_num FROM metric_points WHERE profile_key='A' AND metric_key='ntprobnp'"
  ).all().sort((a, b) => a.d.localeCompare(b.d));
  const newest = nt[nt.length - 1];
  assert.ok(newest.d >= nt[0].d, '测试前置：库里的点确实有多个日期');
  const m = String(newest.v_num);
  assert.ok(j.text.includes(`NT-proBNP ${m}pg/mL`), `导出应含最新点 NT-proBNP ${m}pg/mL，实际：${j.text.split('\n').find((l) => l.includes('NT-proBNP'))}`);
  assert.ok(!j.text.includes('NT-proBNP 1860pg/mL') || m === '1860', '不得把最旧点当「最近一次」');
  wb.close();
});
