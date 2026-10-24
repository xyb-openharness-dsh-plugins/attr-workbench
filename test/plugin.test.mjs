/* 装机最容易出事的两段，单独回归：
 *
 * ① `dsh/datasource.js` —— 宿主的 `dshHomePath('attr-workbench')` **只拼路径、不建目录**。
 *    2026-10-24 真机：装进 Desktop 后 `harness/attr-workbench/` 整条不存在，
 *    SQLite 建不了文件，界面报 `data_unavailable / 打不开数据库`。
 * ② `dsh/lazy-source.js` —— 老写法在 `apply()` 里只试一次开库，失败就把原因写死到
 *    进程生命周期；用户装好新包、只重开工作台而没重启宿主时，看到的永远是同一句错。
 *
 * 为什么不去 import `dsh/index.js`：它要 `@deepseek-ai/schemastery`，那是宿主运行时
 * 提供的包，仓库里没装（属性 schema 只在宿主侧有意义），单测一 import 就 ERR_MODULE_NOT_FOUND。
 * 所以开库与重试这两块特意抽成了不依赖它的模块，这份用例才测得动。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { openDataSource } from '../dsh/datasource.js';
import { createLazySource } from '../dsh/lazy-source.js';

const tmp = mkdtempSync(join(homedir(), '.xyb-attr-plugin-'));
const opened = [];
after(() => {
  for (const wb of opened) { try { wb.close(); } catch { /* 清理失败不影响结果 */ } }
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 同上 */ }
});

test('① 资料目录不存在时，开库前自己建出来', () => {
  const root = join(tmp, 'nested', 'deep', 'attr-workbench');
  assert.equal(existsSync(root), false, '前置条件：目录一开始不存在');

  const wb = openDataSource(root);
  opened.push(wb);

  assert.equal(existsSync(root), true, '插件必须自己 recursive 建出资料目录');
  assert.equal(existsSync(join(root, 'xyb-attr.sqlite')), true, '库文件应落在资料目录里');
  assert.equal(wb.workspace, root, 'workspace 指向资料目录（客户端 ensureSession 要用）');
});

test('② 缺 root 时明确报错，不悄悄退到内存库', () => {
  assert.throws(() => openDataSource(''), /缺少资料目录/);
  assert.throws(() => openDataSource(null), /缺少资料目录/);
});

test('③ 建不出目录时报清楚是哪一层，不把 ENOENT 原样抛给用户', () => {
  /* 造一个"建不出来"的场景：父级是个普通文件，mkdirSync 会 ENOTDIR。
     比 chmod 稳：不受权限模型影响，任何平台都失败。 */
  const blocker = join(tmp, 'blocker');
  writeFileSync(blocker, 'not a directory');
  assert.throws(
    () => openDataSource(join(blocker, 'attr-workbench')),
    /建不了资料目录/,
  );
});

test('④ 开库失败不锁死：障碍排除后的下一次 ensure 自愈，无需重启宿主', () => {
  const blocker = join(tmp, 'blocker2');
  writeFileSync(blocker, 'not a directory');
  const root = join(blocker, 'attr-workbench');

  /* 用可控时钟代替真实等待，用例不必 sleep */
  let clock = 0;
  const source = createLazySource(() => openDataSource(root), { retryAfterMs: 1000, now: () => clock });

  assert.equal(source.ensure(), null, '第一次应失败');
  assert.match(String(source.failure()), /建不了资料目录/, `实际：${source.failure()}`);

  clock += 100; // 仍在防抖窗口内：不重试，也不改变已有的失败原因
  assert.equal(source.ensure(), null);
  assert.match(String(source.failure()), /建不了资料目录/);

  rmSync(blocker, { force: true }); // 排障完成
  clock += 1100; // 越过防抖
  const wb = source.ensure();
  assert.ok(wb, `障碍排除后应自愈，实际：${source.failure()}`);
  opened.push(wb);
  assert.equal(source.failure(), null, '自愈后必须清掉上一次的失败原因');
  assert.equal(wb, source.ensure(), '成功后应复用同一个实例，不每次重开库');
});

test('⑤ 防抖生效：连续失败不会每次请求都重试一遍', () => {
  let attempts = 0;
  let clock = 0;
  const source = createLazySource(
    () => { attempts += 1; throw new Error('boom'); },
    { retryAfterMs: 1000, now: () => clock },
  );

  source.ensure();
  source.ensure();
  source.ensure();
  assert.equal(attempts, 1, '1s 窗口内只应尝试一次');

  clock += 1001;
  source.ensure();
  assert.equal(attempts, 2, '越过窗口才重试');
});
