/**
 * 包的入口：DSH 插件的服务端侧。宿主加载的就是这个文件，需要
 * `name` / `inject` / `Config` / `apply` 四样（workbench-standard §3.4）。
 *
 * 这一层只做三件事：
 * 1. 打开数据（`root` 由 cordis.patch.yml 的 `dshHomePath` 分配；**缺了就报错**，
 *    不退回内存库——装机后"重启数据消失"是最贵的一类故障，见 docs/RELEASE.md）。
 *    具体的建目录/开库/种子数据在 `dsh/datasource.js`，懒重试在 `dsh/lazy-source.js`
 *    （这两块不依赖宿主的 schemastery，因此单测能直接跑）；
 * 2. 把请求交给 `dsh/server.js` 的同一份路由（本地 dev-server 与宿主共用一条，
 *    避免"本地能开、装进 Desktop 就 404"；导入链路的端点因此自动一致）；
 * 3. 所有请求先过宿主的鉴权回执（`connection.requestRejection`），不自己造登录。
 *
 * 为什么不在这儿再写一遍路由：阶段 2 加了上传/解析/候选端点，写两遍必然漂移。
 * 路由表只有一个来源，前缀由 `API_PREFIX` 决定。
 *
 * 为什么 UI 走 iframe：本项目自 0.3.0 起是 customFrame=true（见 lib/layout.js），业务区与
 * 原生会话的分栏由我们自己的面板外壳（src/client.js）排版，iframe 只放业务区那一半；
 * 页面本身仍是 `public/` 那一份，接口基址按自身路径推出来（见 public/app.js 的 apiBase()），
 * 所以「本地 dev-server 打开」与「装进 Desktop」用的是同一份前端，不需要两套构建。
 */
import Schema from '@deepseek-ai/schemastery'
import { openDataSource } from './datasource.js'
import { createLazySource } from './lazy-source.js'
import { createHandler } from './server.js'
import { version, build, displayVersion } from '../lib/version.js'

export const name = 'attr-main'
export const inject = ['webServer', 'connection']

/** 接口前缀与 UI 前缀：前端按同一份约定推基址，改这里要同步 public/app.js 的 apiBase()。 */
export const API_PREFIX = '/api/attr'
export const UI_PREFIX = `${API_PREFIX}/ui`

/** Config 必须是 Schemastery schema；root 由 cordis.patch.yml 的 `dshHomePath` 给。
 *  **required**：漏了它装机能打开，但每次重启回到内存演示库——用户看到的是"数据丢了"。 */
export const Config = Schema.object({
  root: Schema.string().required(),
})

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length, 'cache-control': 'no-store' })
  res.end(buf)
}

/** 挂到宿主：注册 `/api/attr` 前缀的 handler。开库本身交给 datasource.js。 */
export function apply(ctx, config = {}) {
  if (!ctx.webServer?.register) throw new Error('Desktop webServer.register is unavailable')

  /* 开库失败**不锁死到进程生命周期**：宿主进程往往是装包之前启动的，跑的还是旧代码，
     `apply()` 只在加载时试一次的话，用户重开工作台看到的永远是同一句「打不开数据库」，
     只能靠完全退出重开。改成懒重试后，同类故障（目录被清、外置盘掉线）刷新即可恢复。 */
  const source = createLazySource(() => openDataSource(config.root))
  let route = null

  function ensureRoute() {
    const workbench = source.ensure()
    if (!workbench) { route = null; return null }
    if (!route) route = createHandler({ workbench, prefix: API_PREFIX })
    return route
  }

  // 启动时仍先试一次：绝大多数情况目录/库都正常，热路径上不要再进 ensure 的防抖分支
  ensureRoute()

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
    const active = ensureRoute()
    if (pathname === `${API_PREFIX}/health`) {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
      /* `dir` 必须暴露：客户端「AI 对话」按钮调 `ensureSession({ folder })` 时要用它。
         没有它就只能传空 folder，宿主会落一个默认目录，会话与本工作台的资料目录脱钩。 */
      return sendJson(res, 200, {
        ok: Boolean(active),
        version,
        ui: UI_PREFIX,
        display: displayVersion,
        build,
        dir: source.value()?.workspace || (config.root ? String(config.root) : undefined),
        error: source.failure() || undefined,
      })
    }
    if (!active) return sendJson(res, 503, { error: 'data_unavailable', message: source.failure() })
    if (mounted) return void active(req, res)
    /* createHandler 第一行就把 url 解析完了，这里补完立刻还原，
       不把改写过的 req.url 留给宿主的其它 handler。 */
    const original = req.url
    req.url = API_PREFIX + original
    try {
      return void active(req, res)
    } finally {
      req.url = original
    }
  }

  ctx.effect(() => {
    const ctxDispose = ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
    return () => {
      try { ctxDispose && ctxDispose() } catch { /* 宿主卸载时的清理失败不该盖住原错误 */ }
      const wb = source.value()
      if (wb) { try { wb.close() } catch { /* 同上 */ } }
    }
  }, 'attr ui + api')
}
