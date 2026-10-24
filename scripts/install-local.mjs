#!/usr/bin/env node
/**
 * 本地 tgz 自测装机：打包装进 DSH Desktop 的 profile → 校验副本 → 跑装机探针。
 *
 * 为什么要有这个脚本（2026-10-24 实测踩到）：
 * 同一版本号重打包后，`pnpm add -w file:xxx.tgz` 会打印 **"Already up to date"**，
 * lockfile 里的 integrity 已经换成新包的，但 `node_modules` 下那坨文件**还是旧的**。
 * 结果是：你以为自己装的是刚打出来的包，探针跑的却是一个小时前的代码，
 * 而且两种情况下版本号都一样（0.2.3），看 package.json 分辨不出来。
 * 所以这里装完必须**逐文件比对** tgz 与装机副本，比不出来就当失败。
 *
 * 用法：
 *   npm run install:local                # pack → 装进 Desktop profile → 探针
 *   npm run install:local -- --dry-run   # 只打包并列文件，不碰 profile
 *   npm run install:local -- --no-probe  # 装完不跑探针（不建议）
 *
 * 环境变量：
 *   DSH_PROFILE  指定 profile 目录（默认 macOS 的 dsh-desktop/harness/profiles/web）
 *
 * 退出码：0 = 装好且副本与包一致（探针也过）；非 0 = 任一步失败。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const NO_PROBE = args.includes('--no-probe');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;
const VERSION = pkg.version;
const SHORT = NAME.split('/').pop();

function appSupportRoot() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

const PROFILE = resolve(
  process.env.DSH_PROFILE ||
    join(appSupportRoot(), 'dsh-desktop', 'harness', 'profiles', 'web'),
);
const MODULES = join(PROFILE, 'node_modules');
const INSTALLED = join(MODULES, ...NAME.split('/'));

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const step = (n, text) => console.log(`\n[${n}/5] ${text}`);

/* ── 1. 打包 ─────────────────────────────────────────────────────────── */
step(1, `打包 ${NAME}@${VERSION}`);
const releaseDir = join(ROOT, 'release');
const out = execFileSync('npm', ['pack', '--pack-destination', releaseDir], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, NODE_OPTIONS: '' },
});
const tgzName = out.trim().split('\n').filter(Boolean).pop();
const tgz = join(releaseDir, tgzName);
if (!existsSync(tgz)) throw new Error(`打出来的包找不到：${tgz}`);
const tgzSha = sha256(tgz);
const tgzSize = (statSync(tgz).size / 1024).toFixed(1);
console.log(`  ${tgzName}  ${tgzSize} kB  sha256 ${tgzSha.slice(0, 12)}…`);

/* ── 2. 包里到底有哪些文件（后面要拿来跟装机副本逐个对） ──────────────── */
const tgzEntries = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' })
  .split('\n')
  .filter((line) => line && !line.endsWith('/'))
  .map((line) => line.replace(/^package\//, ''))
  .sort();
console.log(`  包内 ${tgzEntries.length} 个文件`);

if (DRY) {
  console.log('\n--dry-run：到此为止，未改动 profile。');
  process.exit(0);
}

/* ── 3. 装进 profile ────────────────────────────────────────────────── */
if (!existsSync(join(PROFILE, 'package.json'))) {
  throw new Error(`profile 不存在：${PROFILE}\nDSH Desktop 至少启动过一次吗？或用 DSH_PROFILE 指定。`);
}

step(2, `装进 profile：${PROFILE}`);
const backup = join(PROFILE, `package.json.bak-${SHORT}-${VERSION}`);
copyFileSync(join(PROFILE, 'package.json'), backup);
console.log(`  已备份 package.json → ${backup.split(sep).pop()}`);

const pnpm = (argv) =>
  execFileSync('npx', ['--yes', 'pnpm@10.15.0', '--dir', PROFILE, ...argv], {
    cwd: PROFILE,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
  });

try {
  pnpm(['add', '-w', `file:${tgz}`]);
  console.log('  pnpm add 完成');
} catch (error) {
  console.error('  pnpm add 失败：');
  console.error(String(error.stdout || '').slice(-2000));
  console.error(String(error.stderr || '').slice(-2000));
  process.exit(1);
}

/* 关键：同版本重打，pnpm 会认为「已是最新」而不重链。删掉副本目录再 install 才真换。 */
step(3, '强制重链（绕开 pnpm "Already up to date"）');
rmSync(INSTALLED, { recursive: true, force: true });
try {
  pnpm(['install']);
  console.log('  重链完成');
} catch (error) {
  console.error('  pnpm install 失败：');
  console.error(String(error.stderr || '').slice(-2000));
  process.exit(1);
}

/* ── 4. 副本 = 包里那批文件（缺或多都算失败） ─────────────────────── */
step(4, '逐文件比对包与装机副本');
/* 用 Node 自己走目录，不 shell out 给 find：沙箱里 find 会被拦成空输出，
   空输出看起来像「副本一个文件都没有」，反而掩盖真问题。 */
function walk(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(abs, base, acc);
    } else if (entry.isFile()) {
      acc.push(abs.slice(base.length + 1).split(sep).join('/'));
    }
  }
  return acc;
}
const installedFiles = walk(INSTALLED).sort();

const missing = tgzEntries.filter((file) => !installedFiles.includes(file));
const extra = installedFiles.filter((file) => !tgzEntries.includes(file));

let ok = true;
if (missing.length) {
  ok = false;
  console.log(`  ✗ 副本缺 ${missing.length} 个文件（装的是旧包 / 没重链）`);
  console.log(`      ${INSTALLED}`);
  console.log(`      包内 ${tgzEntries.length} 条 / 副本扫到 ${installedFiles.length} 条`);
  for (const file of missing.slice(0, 10)) console.log(`      - ${file}`);
} else if (extra.length) {
  ok = false;
  console.log(`  ✗ 副本多出 ${extra.length} 个文件（残留没清干净）：`);
  for (const file of extra.slice(0, 10)) console.log(`      + ${file}`);
} else {
  console.log(`  ✓ ${tgzEntries.length} 个文件逐个对上`);
}

const installedVersion = JSON.parse(readFileSync(join(INSTALLED, 'package.json'), 'utf8')).version;
if (installedVersion !== VERSION) {
  ok = false;
  console.log(`  ✗ 版本不符：仓库 ${VERSION} / 副本 ${installedVersion}`);
}

/* 冒烟：入口文件能在副本里被解析（探针会做全量模块图，这里先给一句） */
for (const entry of ['dsh/index.js', 'dsh/server.js']) {
  if (!existsSync(join(INSTALLED, entry))) {
    ok = false;
    console.log(`  ✗ 入口缺失：${entry}`);
  }
}

if (!ok) {
  console.log('\n副本与包不一致，探针结果不可信，先修安装再来。');
  process.exit(1);
}

/* ── 5. 对装机副本跑探针 ─────────────────────────────────────────────── */
if (NO_PROBE) {
  console.log('\n[5/5] 已跳过探针（--no-probe）。');
  process.exit(0);
}

step(5, '对装机副本跑装机探针');
const probe = spawnSync(process.execPath, [join(ROOT, 'scripts', 'probe-install.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, ATTR_PKG: INSTALLED, NODE_OPTIONS: '' },
});
process.exit(probe.status ?? 1);
