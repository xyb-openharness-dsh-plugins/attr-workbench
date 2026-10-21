/* HTTP 层：健康检查 / bootstrap / 静态文件 / 未知接口 / 路径穿越 / 资料目录校验。
 *
 * 起真实服务（port:0 由系统分配），只用内置 fetch。测完必须关 server 与 db，
 * 否则 node --test 进程不会退出。
 *
 * ATTR 适配（与食管癌版的差异）：
 * - public/ 是 index.html / app.js / style.css / shell.css / brand-icon.png，
 *   没有 topbar.css（顶栏样式在 shell.css 里）；
 * - bootstrap 的 trials 是 4 条临床研究线索（原型 demo-data.js 的 trials.length）；
 * - layout.panel 必须与 lib/layout.js 逐字一致——以前这里硬编码过 customFrame:true，
 *   和 layout.js 的 false 打架，bootstrap 下发的是错值，所以这条断言盯死它。 */

import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Workbench, validateWorkspacePath } from '../dsh/workbench.js';
import { startWorkbenchServer } from '../dsh/server.js';
import { AGENT_PANE, PANEL } from '../lib/layout.js';

const tmp = mkdtempSync(join(homedir(), '.xyb-attr-server-'));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ } });

async function withServer(fn) {
  const workbench = await Workbench.open(join(tmp, 'workspace'));
  const { server, port, url } = await startWorkbenchServer({ port: 0, host: '127.0.0.1', workbench });
  try {
    await fn({ url, port, workbench });
  } finally {
    await new Promise((r) => server.close(r));
    workbench.close();
  }
}

test('① /api/health 返回 ok 与版本', async () => {
  await withServer(async ({ url }) => {
    const r = await fetch(`${url}api/health`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.match(j.version, /^\d+\.\d+\.\d+/);
  });
});

test('② /api/bootstrap：两个档案 + 临床线索 + 面板参数与 lib/layout.js 同源', async () => {
  await withServer(async ({ url }) => {
    const r = await fetch(`${url}api/bootstrap`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(Object.keys(j.profiles).sort(), ['A', 'B']);
    assert.ok(j.profiles.A.metrics.length >= 4, '心脏/肾脏等指标要随档案返回');
    assert.ok(j.profiles.A.docs.length >= 1, '病情整理的资料库要随档案返回');
    assert.ok(j.profiles.A.genotype && typeof j.profiles.A.genotype.kind === 'string', 'genotype 是单行对象');
    assert.equal(j.trials.length, 4);
    assert.deepEqual(j.trials.map((t) => t.saved), [1, 1, 0, 0], 'saved 保持 SQLite 原值，不转布尔');
    assert.equal(j.agent.available, true, '开发版自带挂载位演示');
    /* 面板参数：服务侧下发与 lib/layout.js 必须逐字一致（曾因硬编码 customFrame:true 漂移过） */
    assert.deepEqual(j.layout.panel, PANEL, 'bootstrap 的 layout.panel 必须等于 lib/layout.js 的 PANEL');
    assert.equal(j.layout.panel.customFrame, false, '阶段 2 走标准分栏');
    assert.deepEqual(j.layout.agentPane, AGENT_PANE, 'bootstrap 的 layout.agentPane 必须等于 lib/layout.js 的 AGENT_PANE');
    assert.ok(j.meta.windowStart && j.meta.windowEnd, '演示时间窗要在 meta 里');
  });
});

test('③ 静态文件：/ → index.html，app.js / style.css / shell.css / 品牌图可取', async () => {
  await withServer(async ({ url }) => {
    for (const path of ['', 'index.html', 'app.js', 'style.css', 'shell.css', 'brand-icon.png']) {
      const r = await fetch(url + path);
      assert.equal(r.status, 200, `${path} 应可取，实际 ${r.status}`);
      assert.ok((await r.arrayBuffer()).byteLength > 50, `${path} 内容不应为空`);
    }
    const html = await (await fetch(url)).text();
    assert.ok(html.includes('id="agent-toggle"'), '顶栏主按钮在骨架里');
    assert.ok(html.includes('id="top-hint"'), '顶栏中区说明在骨架里');
    assert.ok(html.includes('id="agent-label"'), 'AI 面板主按钮标签在骨架里');
  });
});

test('④ 未知 /api/* 返回 JSON 404，不是 HTML', async () => {
  await withServer(async ({ url }) => {
    const r = await fetch(`${url}api/nope`);
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal((await r.json()).error, 'not_found');
  });
});

test('⑤ 路径穿越被拦：../../package.json 拿不到仓库文件', async () => {
  await withServer(async ({ url }) => {
    for (const evil of ['../package.json', '..%2F..%2Fpackage.json', '/../../etc/hosts']) {
      const r = await fetch(url + evil, { redirect: 'manual' });
      const body = r.status === 200 ? await r.text() : '';
      assert.ok(!body.includes('"name": "attr-workbench'), `${evil} 不应返回 package.json 内容`);
    }
  });
});

test('⑥ POST /api/bp：写入成功返回整段血压记录；校验失败 400 + 字段名', async () => {
  await withServer(async ({ url }) => {
    const before = await (await fetch(`${url}api/bootstrap`)).json();
    const n0 = before.profiles.A.bp.length;

    const r = await fetch(`${url}api/bp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileKey: 'A', d: '2026-10-22', position: '立', sys: 96, dia: 58, pulse: 74, symptom: '眼前发黑', drugNote: '呋塞米 20mg' }),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.bp.length, n0 + 1, '应回传整段（含新写的那条）');
    assert.deepEqual(j.bp[j.bp.length - 1], ['2026-10-22', '立', 96, 58, 74, '眼前发黑', '呋塞米 20mg']);

    /* 校验失败：400 + 字段名（界面据此定位输入框），且不写入 */
    const bad = await fetch(`${url}api/bp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileKey: 'A', d: '2026-10-22', sys: 60, dia: 90 }),
    });
    assert.equal(bad.status, 400);
    const bj = await bad.json();
    assert.equal(bj.error, 'invalid');
    assert.equal(bj.field, 'sys', '应给出出错字段名');
    const after = await (await fetch(`${url}api/bootstrap`)).json();
    assert.equal(after.profiles.A.bp.length, n0 + 1, '失败的那次不应写入');

    /* 非 JSON 请求体：400，不当空对象处理 */
    const junk = await fetch(`${url}api/bp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json' });
    assert.equal(junk.status, 400);
    assert.equal((await junk.json()).error, 'bad_body');
  });
});

test('⑦ 资料目录校验：主目录 / 桌面根 / /tmp 一律拒绝，正常目录放行', () => {
  const home = homedir();
  assert.ok(validateWorkspacePath(home).length > 0, '主目录应被拒绝');
  assert.ok(validateWorkspacePath(join(home, 'Desktop')).length > 0, '桌面根目录应被拒绝');
  assert.ok(validateWorkspacePath('/tmp').length > 0, '/tmp 应被拒绝');
  assert.ok(validateWorkspacePath('').length > 0, '空路径应被拒绝');
  assert.deepEqual(validateWorkspacePath(join(home, 'Documents', 'AttrWorkspace')), []);
});
