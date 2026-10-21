#!/usr/bin/env node
/* ATTR 工作台 · 临床试验采集（2026 批次）
 *
 * 通道与诚实边界（写进 docs/CLINICAL-DATA-2026.md，改口径必须两边同步）：
 *   1. chinadrugtrials —— 走 unified-trial-mcp 的 search_trials / get_trial_detail（受控会话，含研究者信息时抄原文）；
 *   2. ctv-api        —— ClinicalTrials.gov API v2 公开端点直接取。理由：unified-trial-mcp 的本地 ctv 索引
 *                        只有 1434 条研究（doctor 输出），对 ATTR 属"部分覆盖"，用它检索会把覆盖不足读成"没有试验"。
 *                        该通道与 ctv 同源（ClinicalTrials.gov），记录里 source.id 记为 ctv-api 以示区别。
 *   3. ictrp / chictr_online / 离线语料 —— 本轮未取得数据，终态如实记 FAILED / NEEDS_SETUP / NO_COVERAGE。
 *
 * 用法：
 *   node scripts/fetch-attr-trials-2026.mjs --dry-run     # 只打印口径与预计请求
 *   node scripts/fetch-attr-trials-2026.mjs               # 采集并落 research/attr/
 *   node scripts/fetch-attr-trials-2026.mjs --ctgov-only   # 跳过 MCP（无 MCP 环境时）
 *
 * 一致性：manifest.recordCount === jsonl 行数 === sqlite 行数；sha256 实算写入 manifest。
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'research', 'attr')
const DATE = '2026-10-21'
const MCP_DIR = process.env.UNIFIED_TRIAL_DIR || join(process.env.HOME, 'Downloads', 'unified_search_trials')
const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const CTGOV_ONLY = args.has('--ctgov-only')

const CTGOV_QUERIES = [
  { label: 'cond:transthyretin amyloidosis', q: { 'query.cond': 'transthyretin amyloidosis' } },
  { label: 'cond:ATTR amyloidosis', q: { 'query.cond': 'ATTR amyloidosis' } },
  { label: 'term:ATTR-CM', q: { 'query.term': 'ATTR-CM' } },
  { label: 'term:ATTRv', q: { 'query.term': 'ATTRv' } }
]
const CTGOV_FIELDS = [
  'NCTId', 'BriefTitle', 'OfficialTitle', 'OverallStatus', 'Phase', 'Condition', 'InterventionName',
  'LeadSponsorName', 'EnrollmentCount', 'StartDate', 'PrimaryCompletionDate', 'LastUpdatePostDate',
  'StudyType', 'LocationCountry'
].join(',')

async function ctgovPage(params, token) {
  const url = new URL('https://clinicaltrials.gov/api/v2/studies')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('pageSize', '200')
  url.searchParams.set('fields', CTGOV_FIELDS)
  if (token) url.searchParams.set('pageToken', token)
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`ClinicalTrials.gov ${res.status} ${res.statusText}`)
  return res.json()
}

function pickStudy(s) {
  const p = s.protocolSection || {}
  const id = p.identificationModule || {}
  const st = p.statusModule || {}
  const sp = p.sponsorCollaboratorsModule || {}
  const d = p.designModule || {}
  const c = p.conditionsModule || {}
  const a = p.armsInterventionsModule || {}
  const l = p.contactsLocationsModule || {}
  const countries = [...new Set((l.locations || []).map(x => x.country).filter(Boolean))]
  return {
    source: 'ctv-api',
    recordId: `ctv-api:${id.nctId}`,
    nctId: id.nctId,
    title: (id.briefTitle || id.officialTitle || '').trim(),
    officialTitle: (id.officialTitle || '').trim(),
    status: st.overallStatus || '',
    phase: (d.phases || []).join('/'),
    studyType: d.studyType || '',
    conditions: (c.conditions || []).join('; '),
    interventions: (a.interventions || []).map(x => x.name).filter(Boolean).join('; '),
    sponsor: (sp.leadSponsor || {}).name || '',
    enrollment: (d.enrollmentInfo || {}).count ?? null,
    startDate: (st.startDateStruct || {}).date || '',
    primaryCompletion: (st.primaryCompletionDateStruct || {}).date || '',
    lastUpdate: (st.lastUpdatePostDateStruct || {}).date || '',
    countries,
    url: `https://clinicaltrials.gov/study/${id.nctId}`,
    retrievedAt: new Date().toISOString()
  }
}

async function fetchCtgov() {
  const byNct = new Map()
  const queries = []
  for (const { label, q } of CTGOV_QUERIES) {
    let token = null, pages = 0, n = 0
    do {
      const data = await ctgovPage(q, token)
      for (const s of data.studies || []) {
        const rec = pickStudy(s)
        if (!rec.nctId) continue
        n++
        if (!byNct.has(rec.nctId)) byNct.set(rec.nctId, { ...rec, matchedBy: [label] })
        else byNct.get(rec.nctId).matchedBy.push(label)
      }
      token = data.nextPageToken || null
      pages++
    } while (token && pages < 20)
    queries.push({ channel: 'ctv-api', query: label, pages, hits: n })
  }
  return { records: [...byNct.values()], queries }
}

async function fetchCde() {
  if (CTGOV_ONLY) return { records: [], status: { state: 'SKIPPED', reason: '--ctgov-only' } }
  if (!existsSync(join(MCP_DIR, 'dist/src/cli/main.js'))) {
    return { records: [], status: { state: 'NEEDS_SETUP', reason: `未找到 ${MCP_DIR}` } }
  }
  const { Client } = await import(join(MCP_DIR, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'))
  const { StdioClientTransport } = await import(join(MCP_DIR, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'))
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(MCP_DIR, 'dist/src/cli/main.js'), 'serve'] })
  const client = new Client({ name: 'attr-workbench-fetch', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
  const seen = new Map()
  const statuses = []
  for (const kw of ['转甲状腺素蛋白', '淀粉样变性心肌病']) {
    const r = await client.callTool({ name: 'search_trials', arguments: { keywords: [kw], pageSize: 50 } })
    const j = JSON.parse(r.content.find(x => x.type === 'text').text)
    statuses.push({ query: kw, states: j.statuses.map(s => ({ sourceId: s.sourceId, state: s.state, count: s.resultCount, explanation: s.explanation })) })
    for (const rec of j.records || []) {
      if (rec.source?.id !== 'chinadrugtrials') continue
      if (seen.has(rec.recordId)) continue
      seen.set(rec.recordId, {
        source: 'chinadrugtrials',
        recordId: rec.recordId,
        nctId: '',
        title: rec.title,
        officialTitle: '',
        status: rec.recruitmentStatus || '',
        phase: '',
        studyType: '',
        conditions: (rec.conditionOrDisease || []).join('; '),
        interventions: (rec.interventions || []).join('; '),
        sponsor: '',
        enrollment: null,
        startDate: '',
        primaryCompletion: '',
        lastUpdate: '',
        countries: ['中国'],
        url: rec.sourceUrl || 'https://www.chinadrugtrials.org.cn/',
        retrievedAt: rec.provenance?.retrievedAt || new Date().toISOString(),
        matchedBy: [`keyword:${kw}`]
      })
    }
  }
  await client.close()
  return { records: [...seen.values()], status: { state: 'SUCCESS', statuses } }
}

function toJsonl(records) {
  return records.map(r => JSON.stringify(r)).join('\n') + '\n'
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex') }

async function buildSqlite(records, file) {
  const { DatabaseSync } = await import('node:sqlite')
  if (existsSync(file)) await rm(file)
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE trials (
      record_id TEXT PRIMARY KEY, source TEXT NOT NULL, nct_id TEXT, title TEXT NOT NULL,
      official_title TEXT, status TEXT, phase TEXT, study_type TEXT, conditions TEXT,
      interventions TEXT, sponsor TEXT, enrollment INTEGER, start_date TEXT,
      primary_completion TEXT, last_update TEXT, countries TEXT, url TEXT,
      matched_by TEXT, retrieved_at TEXT, is_conclusion INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE source_coverage (
      source TEXT PRIMARY KEY, state TEXT, records INTEGER, scope TEXT, zero_means TEXT, cutoff TEXT
    );
    CREATE INDEX idx_trials_source ON trials(source);
    CREATE INDEX idx_trials_status ON trials(status);
  `)
  const ins = db.prepare(`INSERT INTO trials (record_id,source,nct_id,title,official_title,status,phase,study_type,
    conditions,interventions,sponsor,enrollment,start_date,primary_completion,last_update,countries,url,matched_by,retrieved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  db.exec('BEGIN')
  for (const r of records) {
    ins.run(r.recordId, r.source, r.nctId || null, r.title, r.officialTitle || null, r.status, r.phase || null,
      r.studyType || null, r.conditions || null, r.interventions || null, r.sponsor || null,
      r.enrollment ?? null, r.startDate || null, r.primaryCompletion || null, r.lastUpdate || null,
      (r.countries || []).join('; ') || null, r.url || null, (r.matchedBy || []).join('; '), r.retrievedAt)
  }
  db.exec('COMMIT')
  return db
}

async function main() {
  console.log('ATTR 临床试验采集 · 口径：ATTR 淀粉样变性（含 ATTR-CM / ATTRv-PN）· 截止', DATE)
  if (DRY) {
    console.log('查询通道：')
    console.log('  ctv-api  →', CTGOV_QUERIES.map(x => x.label).join(' / '))
    console.log('  chinadrugtrials → 关键词：转甲状腺素蛋白 / 淀粉样变性心肌病')
    console.log('  ictrp / chictr_online / 离线语料 → 本轮不取数，终态如实记 FAILED / NEEDS_SETUP / NO_COVERAGE')
    console.log('落点：', OUT)
    return
  }
  await mkdir(OUT, { recursive: true })
  const ct = await fetchCtgov()
  const cde = await fetchCde()
  const records = [...ct.records, ...cde.records].sort((a, b) => (a.source + a.recordId).localeCompare(b.source + b.recordId))
  const jsonl = toJsonl(records)
  const jsonlPath = join(OUT, `trials-${DATE.slice(0, 4)}.jsonl`)
  await writeFile(jsonlPath, jsonl)

  const dbPath = join(OUT, 'attr_trials_2026.sqlite')
  const db = await buildSqlite(records, dbPath)
  const coverage = [
    ['ctv-api', 'SUCCESS', records.filter(r => r.source === 'ctv-api').length,
      'ClinicalTrials.gov 公开 API v2，按 4 条条件/术语查询合并去重；单页 200 条，最多 20 页/查询。',
      '0 条仅表示该查询词在 ClinicalTrials.gov 无命中；不代表全球无相关研究。', DATE],
    ['chinadrugtrials', cde.status.state, records.filter(r => r.source === 'chinadrugtrials').length,
      'CDE 药物临床试验登记与信息公示平台，关键词「转甲状腺素蛋白」「淀粉样变性心肌病」，只取 chinadrugtrials 通道记录。',
      '0 条仅表示本次关键词在该平台无命中；不含未登记或未公开试验。', DATE],
    ['ictrp', 'FAILED', 0, 'WHO ICTRP 在线通道。', '本轮上游报错，未被成功查询：不得写成"没有试验"。', DATE],
    ['chictr_online', 'NEEDS_SETUP', 0, 'ChiCTR 在线通道，依赖本机 Playwright 浏览器运行时。', '本轮缺少浏览器运行时（UPSTREAM_BROWSER_MISSING），未查询。', DATE],
    ['chictr_pancreatic_archive', 'NO_COVERAGE', 0, '离线语料，仅覆盖胰腺癌 468 条。', '本癌种无语料，零结果不构成任何结论。', '2026-09-29'],
    ['xyb_chinadrugtrials_archive', 'NO_COVERAGE', 0, '小胰宝 CDE 离线归档，仅覆盖胰腺癌关键词。', '本癌种无语料。', '2026-09-29'],
    ['ctv_index', 'PARTIAL', 0, 'unified-trial-mcp 本地 ctv 索引，共 1434 条研究（doctor）。', '覆盖不足，本轮不作为检索通道使用。', DATE]
  ]
  const cov = db.prepare('INSERT INTO source_coverage (source,state,records,scope,zero_means,cutoff) VALUES (?,?,?,?,?,?)')
  for (const row of coverage) cov.run(...row)
  db.close()

  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(jsonlPath)
  const manifest = {
    workbench: 'attr-workbench',
    dataset: 'ATTR 临床试验登记摘录',
    batch: DATE,
    dataCutoff: DATE,
    recordCount: records.length,
    bySource: records.reduce((m, r) => (m[r.source] = (m[r.source] || 0) + 1, m), {}),
    queries: [...ct.queries, { channel: 'chinadrugtrials', detail: cde.status }],
    files: {
      jsonl: `trials-${DATE.slice(0, 4)}.jsonl`,
      jsonlLines: jsonl.trim().split('\n').length,
      jsonlSha256: sha256(buf),
      sqlite: 'attr_trials_2026.sqlite',
      sqliteRows: records.length
    },
    disclaimer: '登记 ≠ 有效 ≠ 安全 ≠ 可入组。状态为登记状态，未核实。所有结论须回溯来源原文并由人工核验。',
    channels: coverage.map(([source, state, n, scope, zero_means, cutoff]) => ({ source, state, records: n, scope, zeroMeans: zero_means, cutoff }))
  }
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log('写出', records.length, '条 →', OUT)
  console.log('按来源：', manifest.bySource)
  console.log('sha256：', manifest.files.jsonlSha256)
}

main().catch(e => { console.error('采集失败：' + e.message); process.exitCode = 1 })
