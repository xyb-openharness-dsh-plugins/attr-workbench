#!/usr/bin/env node
// Community static checker. Does not replace official validation, pack contents or Desktop UI tests.
import { readFile, readdir, lstat, realpath } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
const root = resolve(process.argv[2] || '.')
const errors=[], warnings=[]
const check=(ok,message)=>{ if(!ok) errors.push(message) }
function internal(path) {
  const rel=relative(root,resolve(root,path))
  return rel!=='' && !rel.startsWith('..'+sep) && rel!=='..' && !rel.startsWith(sep)
}
async function file(path) {
  check(typeof path==='string' && internal(path),'Invalid package path: '+path)
  if(typeof path!=='string'||!internal(path)) return ''
  try {
    const resolved=await realpath(resolve(root,path))
    const realRoot=await realpath(root), rel=relative(realRoot,resolved)
    if(rel.startsWith('..'+sep)||rel==='..') throw new Error('symlink escape')
    const stat=await lstat(resolved)
    if(!stat.isFile()) throw new Error('not a file')
    return await readFile(resolved,'utf8')
  } catch(error) { errors.push('Missing/unsafe file '+path+': '+error.message); return '' }
}
try {
  const p=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
  check(typeof p.name==='string' && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(p.name),'Valid npm name required')
  check(typeof p.version==='string' && /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(p.version),'Full semver required')
  check(p.main===p.exports?.['.'],'main must match exports["."]')
  const server=await file(p.exports?.['.'])
  const client=await file(p.exports?.['./client'])
  const patch=await file(p.dsh?.bundle?.patch)
  check(p.dsh?.client?.platform==='web','dsh.client.platform must be web')
  check(p.dsh?.client?.inject?.includes('dsh-desktop-workbenches'),'Missing client inject dsh-desktop-workbenches')
  check(/window\.__ModuleLoader__\.load\s*\(/.test(client),'Client loader missing')
  const id=client.match(/(?:['"]?id['"]?)\s*:\s*(['"])(.*?)\1/)
  check(id?.[2]===p.name,'Client loader id must match npm name')
  check(/desktopWorkbenches\.register\s*\(/.test(client),'desktopWorkbenches.register missing')
  check(/ctx\.effect\s*\(/.test(client),'Registration must have effect lifecycle (manual review if aliased)')
  check(/['"]desktopWorkbenches['"]/.test(client),'Client service inject desktopWorkbenches missing')
  const repository=client.match(/['"]?repository['"]?\s*:\s*['"](https:\/\/github\.com\/[^'"\s]+)['"]/)
  check(Boolean(repository),'Canonical repository required in descriptor (manual review if dynamic)')
  if(p.repository && repository) {
    const value=typeof p.repository==='string'?p.repository:p.repository.url
    check(String(value).replace(/^git\+/, '').replace(/\.git$/,'').replace(/\/$/,'').toLowerCase()===repository[1].replace(/\.git$/,'').toLowerCase(),'Manifest and descriptor repository disagree')
  }
  const entries=[...patch.matchAll(/^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map(m=>m[1])
  check(/^\s*-\s+insert:/.test(patch),'Expected non-empty YAML insert array (other valid patches need manual review)')
  check(entries.includes(p.name),'patch insert.name must be npm name')
  check(/export\s+(?:const|let)\s+Config\s*=\s*Schema\./.test(server),'Server Config must use Schemastery schema (aliases need manual review)')
  check(/@deepseek-ai\/schemastery/.test(server),'Schemastery import missing')
  for(const dep of Object.keys(p.dependencies||{})) if(dep.startsWith('@deepseek-ai/')||dep==='react'||dep==='react-dom') errors.push('Host runtime should not be bundled as ordinary dependency: '+dep)
  check(Array.isArray(p.files),'Explicit files allowlist recommended by community starter')
  for(const path of [p.main,p.exports?.['./client'],p.dsh?.bundle?.patch]) {
    if(typeof path!=='string') continue
    const normalized=path.replace(/^\.\//,'')
    if(!p.files?.some(f=>normalized===f.replace(/^\.\//,'')||normalized.startsWith(f.replace(/^\.\//,'').replace(/\/$/,'')+'/'))) errors.push('Runtime entry absent from files allowlist: '+path)
  }
  if(/preserveAspectRatio\s*[:=]\s*['"]none['"]/.test(client)) warnings.push('Non-uniform SVG scaling found; manually review circles/text/chart geometry')
  if(/\.ownsSession\s*\(/.test(client)) warnings.push('Review service caller context and unavailable ownership; see docs/LESSONS.md')
  /* ---------------- 装机面检查（2026-10-24 ATTR v0.2.1/0.2.2 两条装机坑回收） ----------------
     这两条的共同点：dev-server 全绿、单测全绿，**只有装进宿主才炸**。
     静态检查能拦住的是"包里少了东西"和"接线少了一行"，拦不住运行时路径推导。 */

  // ⑤ Config 声明了 root，patch 就必须注入 config.root：漏了它装机能打开、每次重启回到内存库。
  //    只对"自己声明了 root"的包生效——有的仓故意用 dbPath 指向仓内演示库（如肝癌），
  //    那种包不该被这条判据点名（LESSONS「禁止把个案推广为规则」）。
  const declaresRoot = /export\s+const\s+Config\s*=\s*Schema\.object\(\s*\{[\s\S]*?\broot\s*:/.test(server)
  const injectsRoot = /root:\s*!!js\s+dshHomePath\(/.test(patch)
  if (declaresRoot) {
    check(injectsRoot, 'Config declares root but cordis.patch.yml has no config.root: !!js dshHomePath(...) — installs fine but resets to an in-memory DB on every restart')
  } else if (injectsRoot) {
    warnings.push('patch injects config.root but Config does not declare it: confirm the server actually reads config.root (otherwise the user data dir is silently unused)')
  }

  // ⑥ 运行期相对 import 的落点必须在 files 白名单里。漏一个模块 = 装机 import 失败
  //    （ATTR 0.2.1：dsh/demo.js 引 ../demo/build-demo-data.mjs，而 files 没有 demo/）
  const filesList = Array.isArray(p.files) ? p.files : []
  const covered = (rel) => {
    const norm = rel.replace(/^\.\//, '').split(sep).join('/')
    return filesList.some((f) => {
      const entry = f.replace(/^\.\//, '').replace(/\/$/, '')
      return norm === entry || norm.startsWith(entry + '/')
    })
  }
  const scanRoots = new Set()
  for (const f of filesList) {
    const entry = f.replace(/^\.\//, '').replace(/\/$/, '')
    if (!entry.includes('*')) scanRoots.add(entry)
  }
  for (const entry of [p.main, p.exports?.['./client'], p.exports?.['./server']]) {
    if (typeof entry === 'string') scanRoots.add(entry.replace(/^\.\//, ''))
  }
  const scanned = new Set()
  const walk = async (dir) => {
    let ents = []
    try { ents = await readdir(resolve(root, dir), { withFileTypes: true }) } catch { return }
    for (const ent of ents) {
      const rel = (dir ? dir + '/' : '') + ent.name
      if (ent.isDirectory()) {
        if (!['node_modules', '.git', 'release', 'dist', 'coverage'].includes(ent.name)) await walk(rel)
      } else if (/\.(?:m?js|cjs)$/.test(ent.name)) scanned.add(rel)
    }
  }
  for (const entry of scanRoots) {
    const abs = resolve(root, entry)
    let stat = null
    try { stat = await lstat(abs) } catch { continue }
    if (stat.isDirectory()) await walk(entry.replace(/\/$/, ''))
    else if (/\.(?:m?js|cjs)$/.test(entry)) scanned.add(entry)
  }
  const uncovered = new Set()
  for (const rel of scanned) {
    const src = await readFile(resolve(root, rel), 'utf8')
    for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      const target = relative(root, resolve(root, rel, '..', m[1])).split(sep).join('/')
      if (target.startsWith('..')) continue
      if (!covered(target)) uncovered.add(target + '  ← imported by ' + rel)
    }
  }
  for (const item of uncovered) check(false, 'Runtime module not covered by files allowlist: ' + item)

  // ⑦ public/ 存在就必须随包发出（漏了它装机后业务区空白）
  try {
    if ((await lstat(resolve(root, 'public'))).isDirectory() && covered('public/index.html') === false) {
      check(false, 'public/ exists but is not covered by files allowlist')
    }
  } catch { /* 没有 public/ 的包不适用 */ }

  // ⑧ UI 挂在子路径 + 页面用相对资源 = 服务端必须剥前缀。静态判定只能提示，真验靠装机探针
  //    （ATTR 0.2.2：/api/attr/ui/app.js 被 SPA 兜底成 index.html，浏览器把 HTML 当 JS 解析）
  try {
    const html = await readFile(resolve(root, 'public/index.html'), 'utf8')
    const uiOnSubPath = /['"`]\/?[^'"`]*\/ui\/[^'"`]*['"`]/.test(client)
    const relativeRefs = /(?:src|href)="(?!https?:|data:|\.\.?\/|\/|#)([^"]+)"/.test(html)
    if (uiOnSubPath && relativeRefs) {
      warnings.push('UI 挂在子路径且页面使用相对资源引用：确认静态层会剥掉该前缀（漏剥 → 浏览器把 index.html 当 JS 解析、业务区空白）。真验方式：对装机副本跑一次装机探针，见 docs/06-VALIDATION-AND-RELEASE.md')
    }
  } catch { /* 没有 index.html 不适用 */ }

  warnings.push('Peer ranges, API signatures, credentials/assets, actual tgz contents and Desktop UI require separate verification')
  console.log(JSON.stringify({ package:p.name, version:p.version, staticPass:errors.length===0, errors, warnings },null,2))
  if(errors.length) process.exitCode=1
} catch(error) { console.error('Package check failed: '+error.message); process.exitCode=1 }
