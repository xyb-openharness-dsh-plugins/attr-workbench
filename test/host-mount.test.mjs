/* 宿主挂载合同：`createHandler({ prefix: '/api/attr' })` 这一层今天只有装机才走得到。
 *
 * 2026-10-24 装机探针实测：页面挂在 `/api/attr/ui/index.html` 时，页面里 `<script src="app.js">`
 * 是相对路径，浏览器请求的是 `/api/attr/ui/app.js`；剥掉 prefix 后是 `/ui/app.js`，
 * 静态层找不到文件就兜底回 index.html——**浏览器拿到 HTML 当 JS 解析**，业务区整片空白。
 * 本地 dev-server 挂在根上，永远看不到这个故障，所以必须在这里钉死。
 *
 * 也顺手核对「两种前缀都接」：宿主是否已经剥掉 prefix 各版本行为不一致（见 dsh/index.js），
 * 所以 `/api/attr/api/health` 与 `/api/attr/health` 都要能出 JSON。
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Workbench } from '../dsh/workbench.js';
import { createHandler } from '../dsh/server.js';

const tmp = mkdtempSync(join(homedir(), '.xyb-attr-mount-'));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ } });

async function withMounted(fn) {
  const workbench = await Workbench.open(join(tmp, 'workspace'));
  const handler = createHandler({ workbench, prefix: '/api/attr' });
  const server = createServer((req, res) => handler(req, res));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ get: (p) => fetch(base + p), base });
  } finally {
    await new Promise((ok) => server.close(ok));
    workbench.close();
  }
}

test('① UI 前缀下的相对资源必须落到 public/（不许被 SPA 兜底成 HTML）', async () => {
  await withMounted(async ({ get }) => {
    const page = await get('/api/attr/ui/index.html');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html/i);

    const js = await get('/api/attr/ui/app.js');
    assert.equal(js.status, 200);
    const jsBody = await js.text();
    assert.ok(!jsBody.trimStart().startsWith('<'), 'app.js 拿到了 HTML——静态层没剥掉 /ui 前缀');
    assert.match(jsBody, /APP_INFO|querySelector/, 'app.js 内容不像前端脚本');

    const css = await get('/api/attr/ui/style.css');
    assert.equal(css.status, 200);
    assert.ok(!(await css.text()).trimStart().startsWith('<'), 'style.css 拿到了 HTML');

    const img = await get('/api/attr/ui/brand-icon.png');
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
  });
});

test('② 接口两种前缀都接（宿主有没有剥 prefix 都要能用）', async () => {
  await withMounted(async ({ get }) => {
    const a = await get('/api/attr/api/health');
    assert.equal(a.status, 200);
    assert.equal((await a.json()).ok, true);

    /* 未剥前缀的那一条：dsh/index.js 会临时补上再交给路由 */
    const b = await get('/api/attr/api/bootstrap');
    assert.equal(b.status, 200);
    const boot = await b.json();
    assert.ok(Object.keys(boot.profiles).length >= 1, 'bootstrap 应带回档案');
  });
});

test('③ 前缀之外的路径不会被当成静态文件服务', async () => {
  await withMounted(async ({ get }) => {
    const r = await get('/etc/passwd');
    assert.equal(r.status, 404, 'prefix 之外的请求必须 404，不能去 public/ 猜');
  });
});
