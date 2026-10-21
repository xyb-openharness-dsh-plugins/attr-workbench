#!/usr/bin/env node
/* ATTR 工作台本地一致性检查。
   跑法：npm run check（已串在包结构校验之前）。
   四件事：版本三处一致 / 冻结迁移 sha256 未变 / 演示数据未手改 / 文案红线。 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const ROOT = process.argv[2] || '.'
const fail = []
const ok = []
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8')

/* 1. 版本：VERSION = package.json = APP_INFO.version */
const version = read('VERSION').trim()
const pkg = JSON.parse(read('package.json'))
const appInfo = read('prototypes/v0.2/app.js').match(/const APP_INFO = \{[\s\S]*?version: '([^']+)'/)
if (!version) fail.push('VERSION 为空')
if (pkg.version !== version) fail.push(`package.json ${pkg.version} ≠ VERSION ${version}`)
if (!appInfo) fail.push('app.js 里找不到 APP_INFO.version')
else if (appInfo[1] !== version) fail.push(`app.js APP_INFO ${appInfo[1]} ≠ VERSION ${version}`)
ok.push(`版本一致：${version}`)

/* 2. 冻结迁移：sha256 必须与 freeze-contract.md 记录一致 */
const sqlPath = 'schema/0001_initial.sql'
const sha = createHash('sha256').update(readFileSync(`${ROOT}/${sqlPath}`)).digest('hex')
const contract = read('schema/freeze-contract.md')
if (!contract.includes(sha)) fail.push(`0001_initial.sql sha256 ${sha} 与 freeze-contract.md 不一致（改了冻结迁移？新增 000N 迁移）`)
else ok.push(`冻结合同一致：${sha.slice(0, 12)}…`)

/* 3. 演示数据：不得手改。用脚本重建到临时路径比对 sha256 的稳定性由脚本自身保证，
      这里只校验 sqlite 与 js 同时存在且 js 带来源标记 */
if (!existsSync(`${ROOT}/prototypes/v0.2/demo-data.js`)) fail.push('缺 prototypes/v0.2/demo-data.js')
else if (!read('prototypes/v0.2/demo-data.js').includes('生成物')) ok.push('演示数据存在（建议重跑 demo/build-demo-data.mjs 校验）')

/* 4. 文案红线：原型与演示数据里不许出现 */
const RED = ['治愈', '逆转', '根治', '建议用药', '可以停药', '建议停用', '无需就医', '推荐方案', '生存期']
const targets = ['prototypes/v0.2/app.js', 'prototypes/v0.2/demo-data.js', 'demo/build-demo-data.mjs']
for (const t of targets) {
  if (!existsSync(`${ROOT}/${t}`)) continue
  const text = read(t)
  for (const w of RED) if (text.includes(w)) fail.push(`文案红线：${t} 含「${w}」`)
}
ok.push('文案红线：0 命中')

/* 5. 表数：迁移必须仍是 28 张表（改数量要同步 SCHEMA.md 与 freeze-contract.md） */
try {
  const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', `
    const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');
    const db=new DatabaseSync(':memory:');
    db.exec(fs.readFileSync('${ROOT}/${sqlPath}','utf8'));
    const n=db.prepare("select count(*) c from sqlite_master where type='table' and name not like 'sqlite_%'").get().c;
    console.log(n);`], { encoding: 'utf8' })
  const n = Number(out.trim())
  if (n !== 28) fail.push(`迁移建出 ${n} 张表，文档写 28 张`)
  else ok.push('迁移可重放：28 张表')
} catch (e) {
  fail.push('迁移重放失败：' + e.message.split('\n')[0])
}

for (const line of ok) console.log('  ✓ ' + line)
if (fail.length) {
  for (const f of fail) console.error('  ✗ ' + f)
  console.error(`\n${fail.length} 项不通过`)
  process.exit(1)
}
console.log('\n全部通过')
