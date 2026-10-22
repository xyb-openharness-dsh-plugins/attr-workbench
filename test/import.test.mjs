/* 导入链路：抽取规则（纯函数）+ 编排（假 MinerU，不联网）。
 *
 * 这里最贵的不是"能不能解析"，而是**错了不吭声**：把 8 个指标写成同一个数、
 * 把参考范围当结果、把解析失败也留一堆候选。所以每条断言都盯着"宁缺勿错"。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { dictionaryEntries, metricByCode } from '../dsh/dictionary.js';
import {
  buildMetricMatcher, extractCandidates, extractInlineCandidates, extractTableCandidates,
  normalizeUnit, parseNyhaValue, parseReportDate, parseResultValue,
} from '../dsh/labparse.js';
import { ImportError, ImportService, DOC_STATUS } from '../dsh/import.js';
import { Workbench } from '../dsh/workbench.js';
import { MineruError } from '../dsh/mineru.js';

const ENTRIES = dictionaryEntries();
const match = buildMetricMatcher(ENTRIES);

const tmpRoot = mkdtempSync(join(homedir(), '.xyb-attr-import-'));
after(() => { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ } });

let seq = 0;
function freshWorkspace() {
  const dir = join(tmpRoot, `ws-${++seq}`);
  return dir;
}

const HORIZONTAL = `# 检验报告
报告日期：2026-04-24

| Item | NT-proBNP | eGFR | 体重 |
| --- | --- | --- | --- |
| Result | 980 | 58 | 71.2 |
| Unit | pg/mL | mL/min/1.73m2 | kg |
`;

const VERTICAL = `# 生化报告
采样日期：2026-05-06

| 项目 | 结果 | 单位 | 参考范围 |
| --- | --- | --- | --- |
| NT-proBNP | 1240 | pg/mL | 0-125 |
| 肌酐 | 118 | μmol/L | 57-97 |
| eGFR | 52 | mL/min/1.73m2 | >90 |
| 心功能 | NYHA III | | |
`;

/* ---------------- 抽取规则 ---------------- */

test('① 词边界：Hb 不被 HbA1c 命中，ntprobnp 认得 U+2011 连字符', () => {
  assert.equal(match('HbA1c 6.1 %')?.code, undefined, 'HbA1c 不应命中 Hb');
  assert.equal(match('Hb 118 g/L')?.code, 'hb');
  assert.equal(match('NT‑proBNP 980')?.code, 'ntprobnp', 'U+2011 也是连字符');
  assert.equal(match('NT-proBNP 980')?.code, 'ntprobnp');
});

test('② 不等式原样保留：数值字段为 null，不折算成 0.5', () => {
  assert.deepEqual(parseResultValue('<0.5'), { valueText: '<0.5', valueNum: null });
  assert.deepEqual(parseResultValue('980'), { valueText: '980', valueNum: 980 });
  assert.equal(parseResultValue('0-125'), null, '参考范围不是结果');
});

test('③ 单位归一：LaTeX 与常见写法都收敛，认不出就 null', () => {
  assert.equal(normalizeUnit('$10^{9}/L$'), '10⁹/L');
  assert.equal(normalizeUnit('\\mu mol/L'), 'μmol/L');
  assert.equal(normalizeUnit('mL/min/1.73m2'), 'mL/min/1.73m2');
  assert.equal(normalizeUnit(''), null);
});

test('④ NYHA 分级：罗马数字与数字都抄成「N 级」，数值字段留空', () => {
  assert.deepEqual(parseNyhaValue('III'), { valueText: 'III 级', valueNum: null });
  assert.deepEqual(parseNyhaValue('2级'), { valueText: 'II 级', valueNum: null });
  assert.equal(parseNyhaValue('正常'), null);
});

test('⑤ 横向表按位置对齐：三个指标三个值，一个不漏也不串', () => {
  const { candidates } = extractTableCandidates(HORIZONTAL.split('\n'), ENTRIES);
  const byCode = Object.fromEntries(candidates.map((c) => [c.code, c]));
  assert.equal(byCode.ntprobnp.valueNum, 980);
  assert.equal(byCode.ntprobnp.unit, 'pg/mL');
  assert.equal(byCode.egfr.valueNum, 58);
  assert.equal(byCode.weight.valueNum, 71.2);
  assert.equal(candidates.length, 3);
});

test('⑥ 列数不一致：整行放弃并给出原因，不许硬配', () => {
  const bad = [
    '| Item | NT-proBNP | eGFR |',
    '| --- | --- | --- |',
    '| Result | 980 | 58 | 41 |',
  ];
  const { candidates, abandoned } = extractTableCandidates(bad, ENTRIES);
  assert.equal(candidates.length, 0, '列数不一致时一条都不许产');
  assert.equal(abandoned.length, 1);
  assert.match(abandoned[0].reason, /列数不一致/);
});

test('⑦ 竖向表：正常抽，参考范围不误当结果', () => {
  const { reportDate, candidates, warnings } = extractCandidates(VERTICAL, ENTRIES);
  assert.equal(reportDate, '2026-05-06');
  const byCode = Object.fromEntries(candidates.map((c) => [c.code, c]));
  assert.equal(byCode.ntprobnp.valueNum, 1240);
  assert.equal(byCode.egfr.valueNum, 52);
  assert.equal(byCode.cr.valueNum, 118);
  assert.equal(byCode.cr.key, null, '肌酐只提示、不入档');
  assert.equal(byCode.nyha.valueText, 'III 级');
  assert.ok(warnings.some((w) => w.includes('暂不建趋势')), '提示项要写清不能入档');
});

test('⑧ 散行：只有参考范围时不出候选（宁缺勿错）', () => {
  const text = 'NT-proBNP 参考范围 0-125 pg/mL\n';
  assert.deepEqual(extractInlineCandidates(text, ENTRIES), []);
  const ok = extractInlineCandidates('NT-proBNP 980 pg/mL\n', ENTRIES);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].valueNum, 980);
});

test('⑨ 报告日期：2026-02-31 不认，标签行优先于正文首个日期', () => {
  assert.equal(parseReportDate('采样日期 2026-02-31\n报告日期 2026-03-02'), '2026-03-02');
  assert.equal(parseReportDate('2026年4月24日 门诊'), '2026-04-24');
  assert.equal(parseReportDate('没有日期'), null);
});

test('⑩ 一条都没识别：给 0 条 + 提示手填，不假装成功', () => {
  const out = extractCandidates('这是一张超声图片说明，没有化验表。', ENTRIES);
  assert.equal(out.candidates.length, 0);
  assert.ok(out.warnings.some((w) => w.includes('没有识别到任何指标')));
});

/* ---------------- 编排 ---------------- */

async function withWorkbench(fn) {
  const wb = await Workbench.open(freshWorkspace());
  try { return await fn(wb); } finally { wb.close(); }
}

const fakeClient = (markdown, extra = {}) => ({
  parse: async () => ({ markdown, batchId: 'batch-1', pages: 1, modelVersion: 'pipeline', ...extra }),
});

test('⑪ 上传落盘 + 按文件哈希去重，不新建第二份文档', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const bytes = Buffer.from('%PDF-1.4 fake');
    const first = imports.saveDocument({ profileKey: 'A', filename: '化验单.pdf', bytes, date: '2026-04-24' });
    assert.equal(first.duplicate, false);
    assert.equal(first.document.status, DOC_STATUS.pending);
    const again = imports.saveDocument({ profileKey: 'A', filename: '化验单-改名.pdf', bytes });
    assert.equal(again.duplicate, true);
    assert.equal(imports.listDocuments('A').filter((d) => d.sha256).length, 1);
    const doc = imports.listDocuments('A').find((d) => d.sha256);
    assert.equal(doc.filePresent, true);
  });
});

test('⑫ 非法类型 / 空文件被挡住，且不留孤儿文件', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    assert.throws(() => imports.saveDocument({ profileKey: 'A', filename: 'x.html', bytes: Buffer.from('hi') }),
      (e) => e instanceof ImportError && e.code === 'bad_type');
    assert.throws(() => imports.saveDocument({ profileKey: 'A', filename: 'x.pdf', bytes: Buffer.alloc(0) }),
      (e) => e.code === 'empty_file');
  });
});

test('⑬ 解析成功：候选入库 + 文档已解析 + 日期自动补 + 任务成功', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: '化验.pdf', bytes: Buffer.from('fake-pdf') });
    const client = fakeClient(VERTICAL);
    const out = await imports.parseDocument({ profileKey: 'A', docId: saved.document.id, client });

    assert.equal(out.job.status, 'succeeded');
    assert.equal(out.dateSource, 'parsed');
    assert.equal(out.reportDate, '2026-05-06');
    assert.ok(out.candidates.length >= 3);

    const doc = imports.listDocuments('A').find((d) => d.id === saved.document.id);
    assert.equal(doc.status, DOC_STATUS.parsed);
    assert.equal(doc.date, '2026-05-06');
    assert.equal(doc.pages, 1);
    assert.equal(doc.lastJob.status, 'succeeded');
  });
});

test('⑭ 解析失败：候选 0 条、文档记失败、原件保留、任务记错误', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: '坏.pdf', bytes: Buffer.from('broken') });
    const client = { parse: async () => { throw new MineruError('NO_MARKDOWN', '解析结果里没有 full.md'); } };

    await assert.rejects(imports.parseDocument({ profileKey: 'A', docId: saved.document.id, client }),
      (e) => e.code === 'NO_MARKDOWN');

    const doc = imports.listDocuments('A').find((d) => d.id === saved.document.id);
    assert.equal(doc.status, DOC_STATUS.failed);
    assert.equal(doc.filePresent, true, '原件必须留着才能重试');
    assert.equal(doc.lastJob.status, 'failed');
    assert.equal(doc.lastJob.error_code, 'NO_MARKDOWN');
    assert.equal(imports.listCandidates('A', { docId: saved.document.id }).length, 0);
  });
});

test('⑮ 重试：新增任务记录、旧失败记录留着、已接受候选不被清掉', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: 'r.pdf', bytes: Buffer.from('retry-me') });
    const docId = saved.document.id;

    await imports.parseDocument({ profileKey: 'A', docId, client: fakeClient(VERTICAL) });
    const target = imports.listCandidates('A', { docId }).find((c) => c.metricKey === 'ntprobnp');
    imports.acceptCandidate({ profileKey: 'A', id: target.id, date: '2026-05-06' });

    await assert.rejects(imports.parseDocument({
      profileKey: 'A', docId, client: { parse: async () => { throw new MineruError('TIMEOUT', '超时'); } },
    }));

    const doc = imports.listDocuments('A').find((d) => d.id === docId);
    assert.equal(doc.jobs, 2, '两次解析 = 两条任务记录');
    const kept = imports.listCandidates('A', { docId }).filter((c) => c.status === 'accepted');
    assert.equal(kept.length, 1, '已接受的是事实层溯源，重试不能删');
  });
});

test('⑯ 接受候选：写进指标点、doc 全处理完才标已核对、重复接受幂等', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: 'acc.pdf', bytes: Buffer.from('acc') });
    const docId = saved.document.id;
    await imports.parseDocument({ profileKey: 'A', docId, client: fakeClient(VERTICAL) });

    const cands = imports.listCandidates('A', { docId });
    const nt = cands.find((c) => c.metricKey === 'ntprobnp');
    const before = wb.bootstrap().profiles.A.metrics.find((m) => m.key === 'ntprobnp').points.length;

    const res = imports.acceptCandidate({ profileKey: 'A', id: nt.id });
    assert.equal(res.metricKey, 'ntprobnp');
    const after = wb.bootstrap().profiles.A.metrics.find((m) => m.key === 'ntprobnp').points.length;
    assert.equal(after, before + 1, '接受后指标点必须 +1');

    const again = imports.acceptCandidate({ profileKey: 'A', id: nt.id });
    assert.equal(again.alreadyAccepted, true);
    assert.equal(wb.bootstrap().profiles.A.metrics.find((m) => m.key === 'ntprobnp').points.length, after);

    /* 还有别的待核对 → 文档不能算「已核对」 */
    let doc = imports.listDocuments('A').find((d) => d.id === docId);
    assert.equal(doc.status, DOC_STATUS.parsed);
    for (const c of imports.listCandidates('A', { docId })) {
      if (c.status === 'candidate') {
        if (c.noteOnly) imports.rejectCandidate({ profileKey: 'A', id: c.id });
        else imports.acceptCandidate({ profileKey: 'A', id: c.id });
      }
    }
    doc = imports.listDocuments('A').find((d) => d.id === docId);
    assert.equal(doc.status, DOC_STATUS.confirmed);
  });
});

test('⑰ 只提示项不许入档；已接受的不能靠拒绝删掉', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: 'note.pdf', bytes: Buffer.from('note-only') });
    const docId = saved.document.id;
    await imports.parseDocument({ profileKey: 'A', docId, client: fakeClient(VERTICAL) });

    const cr = imports.listCandidates('A', { docId }).find((c) => c.metricKey === null);
    assert.ok(cr, '应该有只提示项');
    assert.throws(() => imports.acceptCandidate({ profileKey: 'A', id: cr.id }),
      (e) => e.code === 'note_only');

    const nt = imports.listCandidates('A', { docId }).find((c) => c.metricKey === 'ntprobnp');
    imports.acceptCandidate({ profileKey: 'A', id: nt.id });
    assert.throws(() => imports.rejectCandidate({ profileKey: 'A', id: nt.id }),
      (e) => e.code === 'already_accepted');
  });
});

test('⑱ 缺日期时接受被拒（不拿"今天"当报告日期）', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: 'nodate.pdf', bytes: Buffer.from('nodate') });
    const docId = saved.document.id;
    const md = '| 项目 | 结果 | 单位 |\n| --- | --- | --- |\n| NT-proBNP | 700 | pg/mL |';
    const out = await imports.parseDocument({ profileKey: 'A', docId, client: fakeClient(md) });
    assert.equal(out.reportDate, null);
    const nt = imports.listCandidates('A', { docId }).find((c) => c.metricKey === 'ntprobnp');
    assert.throws(() => imports.acceptCandidate({ profileKey: 'A', id: nt.id }),
      (e) => e.code === 'missing_date');
    /* 用户补一个日期后可以入档 */
    const ok = imports.acceptCandidate({ profileKey: 'A', id: nt.id, date: '2026-05-20' });
    assert.equal(ok.d, '2026-05-20');
  });
});

test('⑲ 手填候选：与解析候选同形，未入档指标被拒', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const added = imports.addManualCandidate({ profileKey: 'A', metricKey: 'weight', valueText: '69.5' });
    const list = imports.listCandidates('A');
    const row = list.find((c) => c.id === added.id);
    assert.equal(row.valueNum, 69.5);
    assert.equal(row.unit, 'kg');
    assert.throws(() => imports.addManualCandidate({ profileKey: 'A', metricKey: 'cr', valueText: '100' }),
      (e) => e.code === 'bad_metric');
  });
});

test('⑳ 词典与 metrics 表单源：入档项必须在表里有对应 key', async () => {
  await withWorkbench(async (wb) => {
    const metrics = wb.bootstrap().profiles.A.metrics.map((m) => m.key);
    for (const entry of ENTRIES.filter((e) => e.key)) {
      assert.ok(metrics.includes(entry.key), `${entry.key} 不在 metrics 表里，接受候选会写出一列没有读模型的指标`);
    }
    assert.equal(metricByCode('nyha').kind, 'grade');
  });
});

test('㉑ OCR 噪声：`Creătinine` 仍认得（只是同词异写，不做模糊匹配）', () => {
  assert.equal(match('Creătinine 118')?.code, 'cr');
  assert.equal(match('Creatinin 118')?.code, undefined, '缺字母不认：那是另一个词');
});

test('㉒ 单位与常见写法不同要提示，但不改它（ocr 把 mL/min 读成 m/min 的实测）', async () => {
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: 'unit.pdf', bytes: Buffer.from('unit-drift') });
    const md = '| 项目 | 结果 | 单位 |\n| --- | --- | --- |\n| eGFR | 58 | m/min/1.73m2 |\n| NT-proBNP | 980 | pg/mL |';
    await imports.parseDocument({ profileKey: 'A', docId: saved.document.id, client: fakeClient(md) });
    const list = imports.listCandidates('A', { docId: saved.document.id });
    const egfr = list.find((c) => c.metricKey === 'egfr');
    const nt = list.find((c) => c.metricKey === 'ntprobnp');
    assert.equal(egfr.unit, 'm/min/1.73m2', '抄写层不改单位，改了就变成替用户下判断');
    assert.equal(egfr.unitMismatch, true, '与词典常见写法不同必须提示用户核对');
    assert.equal(nt.unitMismatch, false, 'pg/mL 与常见写法一致，不该误报');
  });
});

test('㉓ HTML 表只走按列对齐，不让"名字后面就近取数"抄出 `>118` 假候选', () => {
  // 回归：实测 full.md 里整张化验单是 <table>，行内兜底在原文上跑会把
  // `<td>肌酐</td><td>118</td>` 中的 `>` 当成不等式，产出一条 valueText='>118'。
  const html = '<table><tr><td>Item</td><td>Result</td><td>Unit</td></tr>'
    + '<tr><td>NT-proBNP</td><td>980</td><td>pg/mL</td></tr>'
    + '<tr><td>eGFR</td><td>58</td><td>m/min/1.73m2</td></tr>'
    + '<tr><td>Creătinine</td><td>118</td><td>umol/L</td></tr>'
    + '<tr><td>体重</td><td>71.2</td><td>kg</td></tr></table>';
  const { candidates } = extractCandidates(html, ENTRIES);
  assert.deepEqual(candidates.map((c) => c.code), ['ntprobnp', 'egfr', 'cr', 'weight'], '每个指标只出一条');
  assert.equal(candidates.find((c) => c.code === 'cr').valueText, '118', '预组合变音认得，且不沾 `>`');
  assert.ok(!candidates.some((c) => c.valueText.startsWith('>')), '不等号只能来自原文，不能来自 HTML 标签');
  // 行内兜底仍要活着一行里只有一个指标的情况（一行多个就分不清数字归谁，宁可不出）
  const prose = extractCandidates('本次体重 71.2 kg。\nNT-proBNP 980 pg/mL', ENTRIES).candidates;
  assert.deepEqual(prose.map((c) => c.code), ['weight', 'ntprobnp'], '纯文字行仍走行内兜底');
  assert.equal(extractCandidates('体重 71.2 kg，NT-proBNP 980 pg/mL', ENTRIES).candidates.length, 0,
    '同一行两个指标时不出候选：没法确定数字归属');
});

test('㉔ 全部接受后再解析同一份原件：不撞主键、旧接受行留着、新一批候选重新待核', async () => {
  // 回归：候选 id 原先是 `c-<docId>-<序号>`，重解析时已 accepted 的行按规则不删，
  // 新插入直接 UNIQUE constraint failed —— 用户点了「重试」只会看到一句看不懂的报错。
  await withWorkbench(async (wb) => {
    const imports = wb.imports();
    const saved = imports.saveDocument({ profileKey: 'A', filename: 'again.pdf', bytes: Buffer.from('re-parse-all') });
    const docId = saved.document.id;

    await imports.parseDocument({ profileKey: 'A', docId, client: fakeClient(VERTICAL) });
    for (const c of imports.listCandidates('A', { docId })) {
      if (c.noteOnly) imports.rejectCandidate({ profileKey: 'A', id: c.id });
      else imports.acceptCandidate({ profileKey: 'A', id: c.id, date: '2026-04-24' });
    }
    const acceptedBefore = imports.listCandidates('A', { docId }).filter((c) => c.status === 'accepted').length;

    await imports.parseDocument({ profileKey: 'A', docId, client: fakeClient(VERTICAL) });

    const all = imports.listCandidates('A', { docId });
    assert.equal(all.filter((c) => c.status === 'accepted').length, acceptedBefore, '已接受的事实溯源不能被覆盖');
    assert.ok(all.some((c) => c.status === 'candidate'), '新一轮候选应该重新等着核对');
    assert.equal(new Set(all.map((c) => c.id)).size, all.length, '候选 id 不能重复');
    const doc = imports.listDocuments('A').find((d) => d.id === docId);
    assert.equal(doc.jobs, 2);
    assert.equal(doc.status, DOC_STATUS.parsed, '还有待核对项，不能算已核对');
  });
});
