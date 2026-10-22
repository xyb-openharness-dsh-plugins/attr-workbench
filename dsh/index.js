/**
 * 包的入口：DSH 插件的服务端侧。宿主加载的就是这个文件，需要
 * `name` / `inject` / `Config` / `apply` 四样（workbench-standard §3.4）。
 *
 * 这一层只做三件事：
 * 1. 打开数据（配了 `root` 就用那个资料目录；没配就退到内存演示库，保证装上去能看见东西）；
 * 2. 把请求交给 `dsh/server.js` 的同一份路由（本地 dev-server 与宿主共用一条，
 *    避免"本地能开、装进 Desktop 就 404"；导入链路的端点因此自动一致）；
 * 3. 所有请求先过宿主的鉴权回执（`connection.requestRejection`），不自己造登录。
 *
 * 为什么不在这儿再写一遍路由：阶段 2 加了上传/解析/候选端点，写两遍必然漂移。
 * 路由表只有一个来源，前缀由 `API_PREFIX` 决定。
 *
 * 为什么 UI 走 iframe：本项目是 customFrame=false（见 lib/layout.js），业务区由宿主排版，
 * 页面本身仍是 `public/` 那一份；iframe 指向 `/api/attr/ui/`，页面里的接口基址按自身路径
 * 推出来（见 public/app.js 的 apiBase()），所以「本地 dev-server 打开」与「装进 Desktop」
 * 用的是同一份前端，不需要两套构建。
 */
import Schema from '@deepseek-ai/schemastery'
import { openDatabase, migrate } from './store.js'
import { seedDemo, hasDemoData } from './demo.js'
import { createHandler } from './server.js'
import { Workbench } from './workbench.js'
import { version, build, displayVersion } from '../lib/version.js'

export const name = 'attr-main'
export const inject = ['webServer', 'connection']

/** 接口前缀与 UI 前缀：前端按同一份约定推基址，改这里要同步 public/app.js 的 apiBase()。 */
export const API_PREFIX = '/api/attr'
export const UI_PREFIX = `${API_PREFIX}/ui`

/** Config 必须是 Schemastery schema；root 可选——不给就用内存演示库。 */
export const Config = Schema.object({
  root: Schema.string(),
})

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length, 'cache-control': 'no-store' })
  res.end(buf)
}

/** 打开数据源。返回 Workbench（内存库也走同一个类，读模型只写一份）。 */
function openDataSource(root) {
  /* 没配资料目录：内存库 + 演示数据。只读演示，不落盘，不会在用户机器上留文件。
     此时 workspace 为 null：查得到资料列表，但保存原件会被 409 拦住（没有地方放）。 */
  const dir = root ? String(root).replace(/\/+$/, '') : null
  const file = dir ? `${dir}/xyb-attr.sqlite` : ':memory:'
  const db = openDatabase(file)
  migrate(db)
  if (!hasDemoData(db)) seedDemo(db)
  return Workbench.fromDatabase(db, { workspace: dir })
}

export function apply(ctx, config = {}) {
  if (!ctx.webServer?.register) throw new Error('Desktop webServer.register is unavailable')

  let workbench = null
  let failure = null
  try {
    workbench = openDataSource(config.root)
  } catch (error) {
    failure = error.message
  }

  const route = workbench ? createHandler({ workbench, prefix: API_PREFIX }) : null

  const handler = (req, res) => {
    // 鉴权：宿主不给结论就不放行，不自建登录态
    if (typeof ctx.connection?.requestRejection !== 'function') {
      return sendJson(res, 503, { error: 'connection authentication capability unavailable' })
    }
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) return sendJson(res, rejection, { error: 'Authentication required' })

    const url = new URL(req.url, 'http://127.0.0.1')
    /* 宿主把 handler 挂在 `/api/attr` 前缀上，但**是否已剥掉前缀没有统一保证**
       （不同宿主版本行为不一致，装上去才发现 404 是最贵的一类 bug）。
       这里两种都接：不带前缀就临时补上再交给路由，路由表因此只有一份。 */
    const mounted = url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)
    const pathname = mounted ? url.pathname : API_PREFIX + url.pathname
    if (pathname === `${API_PREFIX}/health`) {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
      return sendJson(res, 200, { ok: !failure, version, ui: UI_PREFIX, display: displayVersion, build, error: failure || undefined })
    }
    if (failure) return sendJson(res, 503, { error: 'data_unavailable', message: failure })
    if (mounted) return void route(req, res)
    /* createHandler 第一行就把 url 解析完了，这里补完立刻还原，
       不把改写过的 req.url 留给宿主的其它 handler。 */
    const original = req.url
    req.url = API_PREFIX + original
    try {
      return void route(req, res)
    } finally {
      req.url = original
    }
  }

  ctx.effect(() => {
    const ctxDispose = ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
    return () => {
      try { ctxDispose && ctxDispose() } catch { /* 宿主卸载时的清理失败不该盖住原错误 */ }
      if (workbench) { try { workbench.close() } catch { /* 同上 */ } }
    }
  }, 'attr ui + api')
}
