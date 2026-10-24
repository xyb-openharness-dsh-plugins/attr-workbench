#!/usr/bin/env node
/**
 * 装机验收探针（M6 三层验收的「加载层 + 交互层」）。
 *
 * 为什么要单独一个探针，而不是「装上、让用户点一下」：
 * 装进 Desktop 后才暴露的故障，家族里已经踩过四轮（包头缺 `dsh` 块 → 404；patch 缺
 * `config.root` → 重启回内存库；客户端占位 → 业务区空白；`API_BASE` 守卫写错 → 全白）。
 * 这些的共同点是**开发版能跑、装机副本不能跑**——因为开发版从来不经过 `node_modules`
 * 里的那一份，也不经过宿主的 `webServer.register` 前缀挂载。所以这个探针只做一件事：
 * **把装机副本从 `node_modules` 里加载起来，喂给它一个假宿主**，再让真 Chrome 走一遍。
 *
 * 假宿主只实现 `apply()` 真正用到的四个面（见 dsh/index.js）：
 *   ctx.webServer.register({ kind, path, handler })  → 接住 handler
 *   ctx.connection.requestRejection(req)            → 默认放行；PROBE_AUTH=401 时拦
 *   ctx.effect(fn, label)                           → 立即执行（真宿主是随 ctx 生命周期）
 *   Config                                          → 宿主侧才用，这里只断言导出存在
 *
 * `@deepseek-ai/schemastery` 是**宿主注入的 peer**（profile 的 node_modules 里故意没有），
 * 所以这里用 `module.registerHooks` 把它指到一个最小 shim；除此之外一行不放宽——
 * shim 只覆盖 `apply()` 不碰的部分，`Config` 的形状另有断言。
 *
 * 用法：
 *   node scripts/probe-install.mjs                     # 默认查 harness/profiles/web 里装的那份
 *   ATTR_PKG=/path/to/node_modules/@xyb-community/attr-workbench node scripts/probe-install.mjs
 *   ATTR_NO_CHROME=1 node scripts/probe-install.mjs    # 只跑配置/加载/接口，不起浏览器
 * 退出码 0/1。依赖本机 Chrome（可用 ATTR_CDP_PORT 换端口）。
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'docs', 'screenshots')
const PAGES = (process.env.ATTR_RESP_PAGES
  || 'dashboard,records,subtype,treatment,cardiac,nerve,labs,timeline,family,life,review,trials').split(',')

const DEFAULT_PKG = join(
  homedir(),
  'Library/Application Support/dsh-desktop/harness/profiles/web/node_modules/@xyb-community/attr-workbench',
)
const PKG = process.env.ATTR_PKG || DEFAULT_PKG

const checks = []
const fails = []
const check = (layer, name, ok, detail) => {
  checks.push({ layer, name, ok: Boolean(ok), detail })
  if (!ok) fails.push(`[${layer}] ${name}${detail ? ` — ${detail}` : ''}`)
}

/* ---------------------------------------------------------------- 假宿主前置 */

/* schemastery shim：链式 no-op，够让 `Schema.object({...})` 求值不炸。
   真宿主会给真的实现；这里只需要证明「这一行 import 不是装机失败的根因」。 */
const shimDir = mkdtempSync(join(homedir(), '.xyb-attr-shim-'))
const shimFile = join(shimDir, 'schemastery.mjs')
writeFileSync(shimFile, `
const chain = () => { const o = {}; for (const k of ['required', 'optional', 'default', 'description', 'min', 'max']) o[k] = () => o; return o }
const make = () => chain()
export default {
  object: (shape) => ({ __schema: 'object', shape }),
  string: make, number: make, boolean: make, array: make, dict: make, union: make, const: make, any: make,
}
export const Schema = { object: (s) => ({ __schema: 'object', shape: s }) }
`)
registerHooks({
  resolve(spec, context, next) {
    if (spec === '@deepseek-ai/schemastery') {
      return { url: pathToFileURL(shimFile).href, shortCircuit: true, format: 'module' }
    }
    return next(spec, context)
  },
})

/* ------------------------------------------------------------------ L0 包元数据 */

const pkgJsonPath = join(PKG, 'package.json')
const pkgExists = existsSync(pkgJsonPath)
check('L0 包', '装机副本存在', pkgExists, pkgExists ? PKG : `未找到 ${PKG}`)
let pkg = {}
let version = null
if (pkgExists) {
  pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  version = pkg.version
  const repoVersion = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
  check('L0 包', `version = 仓库 VERSION（${repoVersion}）`, pkg.version === repoVersion, `装机副本 ${pkg.version}`)
  check('L0 包', 'dsh.client.platform = web', pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform))
  check('L0 包', 'dsh.bundle.patch 指向 cordis.patch.yml', pkg.dsh?.bundle?.patch === './cordis.patch.yml', String(pkg.dsh?.bundle?.patch))

  const patchPath = join(PKG, 'cordis.patch.yml')
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  check('L0 包', 'patch 有 config.root（缺了=重启回内存库）', /root:\s*!!js\s+dshHomePath\('attr-workbench'\)/.test(patch), patch.split('\n')[3])
  check('L0 包', 'patch 的 name 是 npm 包名', /name:\s*"@xyb-community\/attr-workbench"/.test(patch))
  for (const f of ['dsh/index.js', 'dsh/server.js', 'public/app.js', 'public/index.html', 'LICENSE']) {
    check('L0 包', `解包完整 ${f}`, existsSync(join(PKG, f)))
  }
}

/* ---------------------------------------------------------------- L1 模块图/导出 */

let mod = null
try {
  mod = await import(pathToFileURL(join(PKG, 'dsh/index.js')).href)
  check('L1 加载', 'import 装机副本 dsh/index.js', true)
  check('L1 加载', '导出 name/inject/Config/apply 四样',
    typeof mod.name === 'string' && Array.isArray(mod.inject) && mod.Config && typeof mod.apply === 'function',
    `name=${mod.name} inject=${JSON.stringify(mod.inject)}`)
  check('L1 加载', 'name = attr-main（与 patch 的 id 同值）', mod.name === 'attr-main', String(mod.name))
  check('L1 加载', 'inject 含 webServer + connection',
    mod.inject.includes('webServer') && mod.inject.includes('connection'))
  check('L1 加载', 'Config 覆盖 root', Boolean(mod.Config?.shape?.root), 'Config 是 Schemastery schema')
} catch (error) {
  check('L1 加载', 'import 装机副本 dsh/index.js', false, error?.message)
}

/* root 不传时**不许悄悄退到内存库**：这是装机最贵的一类故障（能用、重启后数据全没）。
   apply() 设计上不抛异常（宿主会当整个插件崩掉），所以判据是「health 报 ok:false 且说清原因」。
   这里单独起一个假宿主 + 一个临时服务，不与 L2 那份共用。 */
if (mod?.apply) {
  let h2 = null
  mod.apply({
    webServer: { register: (o) => { h2 = o.handler; return () => {} } },
    connection: { requestRejection: () => undefined },
    effect: (fn) => fn(),
  }, {}) // 故意不给 root
  let verdict = null
  if (h2) {
    const s2 = createServer((req, res) => h2(req, res))
    await new Promise((d) => s2.listen(0, '127.0.0.1', d))
    verdict = await (await fetch(`http://127.0.0.1:${s2.address().port}/api/attr/health`)).json()
    s2.close()
  }
  check('L1 加载', '缺 config.root 时 health 报 ok:false 且指出资料目录（不退内存库）',
    verdict?.ok === false && /资料目录/.test(verdict?.error || ''), JSON.stringify(verdict))
}

/* ------------------------------------------------------ L2 apply + 路由 + 真实落库 */

const dataDir = mkdtempSync(join(homedir(), '.xyb-attr-install-'))
let handler = null
let mountPath = null
const registered = []
if (mod?.apply) {
  const ctx = {
    webServer: { register: (opts) => { registered.push(opts); handler = opts.handler; mountPath = opts.path; return () => {} } },
    connection: { requestRejection: () => (process.env.PROBE_AUTH ? Number(process.env.PROBE_AUTH) : undefined) },
    effect: (fn) => { fn() },
  }
  try {
    mod.apply(ctx, { root: dataDir })
    check('L2 接口', 'apply() 不抛异常', true)
  } catch (error) {
    check('L2 接口', 'apply() 不抛异常', false, error?.message)
  }
  check('L2 接口', '向宿主注册了 prefix 路由 /api/attr',
    registered.length === 1 && mountPath === '/api/attr', `registered=${registered.length} path=${mountPath}`)
  check('L2 接口', 'config.root 生效：真实库文件已建',
    existsSync(join(dataDir, 'xyb-attr.sqlite')), `${dataDir}/xyb-attr.sqlite`)
}

let server = null
let port = 0
if (handler) {
  server = createServer((req, res) => handler(req, res))
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  port = server.address().port
  const base = `http://127.0.0.1:${port}`
  const get = async (p, init) => {
    const res = await fetch(base + p, init)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON 正常 */ }
    return { status: res.status, json, text }
  }

  const health = await get('/api/attr/health')
  check('L2 接口', 'GET /api/attr/health = 200 ok', health.status === 200 && health.json?.ok === true, `status=${health.status} ${health.text.slice(0, 120)}`)
  check('L2 接口', 'health 报的版本与包一致', health.json?.version === version, `${health.json?.version} vs ${version}`)

  const boot = await get('/api/attr/api/bootstrap')
  const bootKeys = boot.json ? Object.keys(boot.json) : []
  check('L2 接口', 'GET /api/attr/api/bootstrap = 200', boot.status === 200, `status=${boot.status}`)
  check('L2 接口', 'bootstrap 六件齐全（version/build/meta/profiles/trials/layout）',
    ['version', 'build', 'meta', 'profiles', 'trials', 'layout'].every((k) => bootKeys.includes(k)),
    `keys=${bootKeys.join(',')}`)
  const profileKeys = Object.keys(boot.json?.profiles || {})
  check('L2 接口', '演示数据已种（至少一个档案）', profileKeys.length >= 1, `profiles=${profileKeys.join(',')}`)

  const ui = await get('/api/attr/ui/')
  check('L2 接口', 'GET /api/attr/ui/ 返回页面（非 404）',
    ui.status === 200 && /<html/i.test(ui.text), `status=${ui.status} len=${ui.text.length}`)

  /* 写一条血压，确认真的落到 config.root 指的那只库（内存库也能 200，所以必须回读文件）。 */
  const bp = await get('/api/attr/api/bp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileKey: 'A', d: '2026-10-24', position: '立',
      sys: 96, dia: 62, pulse: 78, symptom: '装机探针',
    }),
  })
  check('L2 接口', 'POST /api/attr/api/bp = 200', bp.status === 200, `status=${bp.status} ${bp.text.slice(0, 140)}`)

  const dbFile = join(dataDir, 'xyb-attr.sqlite')
  let persisted = 0
  if (existsSync(dbFile)) {
    const { openDatabase } = await import(pathToFileURL(join(PKG, 'dsh/store.js')).href)
    const db = openDatabase(dbFile)
    try {
      persisted = db.prepare('SELECT COUNT(*) AS n FROM bp_rows').get()?.n ?? 0
    } catch (error) {
      check('L2 接口', '回读 bp_rows', false, error?.message)
    } finally {
      try { db.close() } catch { /* 关库失败不影响结论 */ }
    }
  }
  check('L2 接口', '写入落到磁盘库（不是内存库）', persisted >= 1, `bp_rows=${persisted}`)

  if (process.env.PROBE_AUTH) {
    const denied = await get('/api/attr/health')
    check('L2 接口', `宿主鉴权回了 ${process.env.PROBE_AUTH} 时原样透传`, denied.status === Number(process.env.PROBE_AUTH), `status=${denied.status}`)
  }
}

/* ------------------------------------------------------------ L3 交互层（真浏览器） */

let shots = []
if (handler && !process.env.ATTR_NO_CHROME) {
  const { launchChrome, sleep, stopChrome } = await import('./cdp.mjs')
  mkdirSync(SHOTS, { recursive: true })
  const ch = await launchChrome({ port: Number(process.env.ATTR_CDP_PORT || 9361) })
  const { cdp } = ch
  /* cdp.mjs 自己就在收：errors = 未捕获异常 + console.error，badResponses = 失败请求。 */
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/api/attr/ui/` })
    for (let i = 0; i < 80 && !(await cdp.eval('Boolean(document.querySelector("#nav .nav-button"))')); i += 1) await sleep(120)

    /* ATTR 不设 data-booted（那是小星宝的写法）。这里的判据是**后端数据真的到了页面上**：
       顶栏版本 chip 由 bootstrap 的 version 回填，chip 有值 = 接口通了 + 前端跑起来了。 */
    const chip = String(await cdp.eval('(document.querySelector("#ver-chip")?.textContent || "").trim()'))
    check('L3 交互', `顶栏版本 chip = v${version}（bootstrap 回填成功）`, chip === `v${version}`, `chip="${chip}"`)
    const navCount = await cdp.eval('document.querySelectorAll("#nav .nav-button").length')
    check('L3 交互', `导航按钮数 = ${PAGES.length}`, navCount === PAGES.length, `实际 ${navCount}`)

    for (const page of PAGES) {
      const clicked = await cdp.eval(`(() => { const b = document.querySelector('[data-view="${page}"]'); if (!b) return false; b.click(); return true })()`)
      if (!clicked) { check('L3 交互', `切到 ${page}`, false, '找不到导航按钮'); continue }
      await sleep(180)
      const info = await cdp.eval(`(() => {
        const m = document.querySelector('#main')
        return JSON.stringify({
          chars: (m?.innerText || '').replace(/\\s+/g, '').length,
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
        })
      })()`)
      const d = JSON.parse(info || '{}')
      check('L3 交互', `${page} 有内容且不横向溢出`,
        (d.chars || 0) > 80 && d.scrollW <= d.innerW + 1,
        `${d.chars} 字, scrollWidth=${d.scrollW}/${d.innerW}`)
    }

    if (PAGES.includes('dashboard')) {
      await cdp.eval('document.querySelector(\'[data-view="dashboard"]\').click()')
      await sleep(250)
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      const file = join(SHOTS, `install-${version}-dashboard.png`)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      shots.push(file)
      check('L3 交互', '截图已存', true, file)
    }

    check('L3 交互', '控制台 0 个未捕获异常 / console.error', cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | '))
    check('L3 交互', '0 个失败请求', cdp.badResponses.length === 0, cdp.badResponses.slice(0, 3).join(' | '))
  } catch (error) {
    check('L3 交互', '浏览器探针执行', false, error?.message)
  } finally {
    await stopChrome(ch)
  }
}

server?.close()
try { server?.closeAllConnections?.() } catch { /* 老 Node 没有这个 */ }

const summary = {
  ok: fails.length === 0,
  pkg: PKG,
  version,
  dataDir,
  checks: checks.length,
  passed: checks.filter((c) => c.ok).length,
  fails,
  shots,
}
console.log(JSON.stringify(summary, null, 2))
if (fails.length) console.log('\n逐项：\n' + checks.map((c) => `${c.ok ? '✅' : '❌'} [${c.layer}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`).join('\n'))
process.exit(fails.length === 0 ? 0 : 1)
