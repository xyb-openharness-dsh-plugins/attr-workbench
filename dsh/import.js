/* 导入链路（上传 → 解析 → 候选 → 逐项确认入档）。
 *
 * 四层不合并（契约 4）：本文件只做**编排**——原件进 `documents`、解析任务进 `parse_jobs`、
 * 抄写结果进 `candidate_fields`、用户确认后才写 `metric_points`。任何一步都不越层搬运：
 * 候选不会自己变成指标点，解析失败不会留下一堆"半条"候选。
 *
 * 三条硬规则（docs/18-MINERU-PARSING.md §6–§7）：
 * 1. **事务原子**：候选写入 + `documents.status=已解析` + `parse_jobs=succeeded` 同一事务；
 *    任一步失败整体回滚，`documents.status=解析失败`、候选 0 条、原件保留可重试。
 * 2. **不静默降级**：云端失败就如实报错，不做"本地正则凑一份"——两套口径的数据没法比较。
 * 3. **重试不重置历史**：同一份文件重复导入不新建文档；每次重试新增一条任务记录，
 *    旧的失败记录留着。已接受的候选不因重试被删掉（它是事实层的溯源）。
 *
 * 还有一条容易被忽略的：**接受 ≠ 审核**。`acceptCandidate` 只写事实层与候选状态，
 * 不写任何"已审核""医生确认"字段——schema 里也没有这种字段，别顺手加。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { dictionaryEntries, isRealDate, metricByCode } from './dictionary.js'
import { extractCandidates } from './labparse.js'
import { createMineruClient, MineruError } from './mineru.js'
import { ValidationError } from './writes.js'

export const DOC_STATUS = Object.freeze({
  pending: '待解析',
  parsed: '已解析',
  confirmed: '已核对',
  failed: '解析失败',
})

/** 只收 MinerU 认得的类型（v4 明确拒收 html，见 docs/18 §8 的实测）。 */
export const ALLOWED_EXT = Object.freeze(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.md', '.txt'])

export class ImportError extends Error {
  constructor(code, message, status = 400, detail = null) {
    super(message)
    this.name = 'ImportError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function requireProfile(db, profileKey) {
  if (!profileKey || typeof profileKey !== 'string') throw new ImportError('bad_profile', 'profileKey 不能为空', 400, 'profileKey')
  if (!db.prepare('SELECT 1 FROM subjects WHERE profile_key = ?').get(profileKey)) {
    throw new ImportError('profile_not_found', `档案不存在：${profileKey}`, 404, 'profileKey')
  }
  return profileKey
}

function requireDate(value, field) {
  const s = String(value ?? '').trim()
  if (!s) throw new ImportError('missing_date', `${field} 不能为空（YYYY-MM-DD）`, 400, field)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m || !isRealDate(m[1], m[2], m[3])) {
    throw new ImportError('bad_date', `${field} 必须是真实日期（YYYY-MM-DD），收到 ${s.length > 20 ? '超长输入' : s}`, 400, field)
  }
  return s
}

/** 事务包装：失败回滚并把原始错误抛出去（不吞）。 */
function tx(db, fn) {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* 回滚失败也要把原始错误抛出去 */ }
    throw error
  }
}

const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((r) => ({ ...r }))
/** 比较单位用：忽略大小写/空格，`²` 与 `2` 视为同一写法（报告单两种都常见）。 */
const unitKey = (u) => String(u ?? '').toLowerCase().replace(/\s+/g, '').replace(/²/g, '2').replace(/μ/g, 'u')
const row = (db, sql, ...args) => {
  const found = db.prepare(sql).get(...args)
  return found ? { ...found } : null
}

export class ImportService {
  #db
  #workspace
  #mineruFactory
  #now

  /**
   * @param {object} db 已迁移的库
   * @param {object} opts
   * @param {string} opts.workspaceDir 资料目录（原件存 `<dir>/documents/<profile>/`）
   * @param {Function} [opts.mineruFactory] 注入用：单测不联网，返回一个带 parseFile 的对象
   * @param {Function} [opts.now] 注入用，返回 Date
   */
  constructor(db, { workspaceDir, mineruFactory = createMineruClient, now = () => new Date() } = {}) {
    if (!db) throw new ImportError('no_database', '导入服务需要一个已迁移的数据库', 500)
    this.#db = db
    this.#workspace = workspaceDir ? resolve(workspaceDir) : null
    this.#mineruFactory = mineruFactory
    this.#now = now
  }

  get workspace() { return this.#workspace }

  /* ---------------- 文档 ---------------- */

  listDocuments(profileKey) {
    requireProfile(this.#db, profileKey)
    const docs = rows(this.#db,
      `SELECT id, name, date, type, status, ord, sha256, rel_path, pages
         FROM documents WHERE profile_key = ? ORDER BY ord`, profileKey)
    const jobs = rows(this.#db,
      `SELECT id, doc_id, status, error_code, error_message, batch_id, pages, model, started_at, finished_at
         FROM parse_jobs WHERE profile_key = ? ORDER BY ord`, profileKey)
    return docs.map((d) => {
      const mine = jobs.filter((j) => j.doc_id === d.id)
      const latest = mine[mine.length - 1] ?? null
      return {
        id: d.id,
        name: d.name,
        date: d.date,
        type: d.type,
        status: d.status,
        sha256: d.sha256,
        pages: d.pages,
        /* 原件是否还在：文件被用户手动删掉时界面要能说清"原件不在了"，
           而不是点了解析才报一个看不懂的 ENOENT。 */
        filePresent: d.rel_path ? this.#fileExists(d.rel_path) : false,
        jobs: mine.length,
        lastJob: latest,
      }
    })
  }

  /**
   * 保存原件。**先按（档案, sha256）查重**，重复导入不新建文档、不重置解析状态。
   * 文件写盘用 tmp + rename（写一半断电不会留下半个 PDF 被当成原件）。
   */
  saveDocument({ profileKey, filename, bytes, date = null, type = null } = {}) {
    requireProfile(this.#db, profileKey)
    if (!bytes || !bytes.length) throw new ImportError('empty_file', '文件内容为空，不上传', 400, 'file')
    if (!filename || typeof filename !== 'string') throw new ImportError('missing_name', '缺少文件名', 400, 'filename')
    if (!this.#workspace) throw new ImportError('no_workspace', '还没有选择资料目录，无法保存原件', 409)

    const safeName = filename.trim().replace(/[\\/]/g, '_').slice(0, 120)
    const ext = (safeName.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      throw new ImportError('bad_type', `只收 PDF/图片/Markdown/纯文本，收到 ${ext || '无扩展名'}`, 400, 'filename')
    }
    const digest = sha256(bytes)
    const existing = row(this.#db,
      'SELECT id, name, date, type, status FROM documents WHERE profile_key = ? AND sha256 = ?', profileKey, digest)
    if (existing) {
      return { duplicate: true, document: existing, sha256: digest }
    }

    const id = `d-${digest.slice(0, 12)}`
    const relPath = join('documents', profileKey, `${digest.slice(0, 12)}${ext}`)
    const abs = this.#absPath(relPath)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp-${process.pid}`
    writeFileSync(tmp, bytes)
    renameSync(tmp, abs)

    const parsedDate = date ? requireDate(date, 'date') : null
    const nextOrd = (row(this.#db, 'SELECT MAX(ord) AS m FROM documents WHERE profile_key = ?', profileKey)?.m ?? -1) + 1
    try {
      this.#db.prepare(
        `INSERT INTO documents (profile_key,id,name,date,type,status,ord,sha256,rel_path,pages)
         VALUES (?,?,?,?,?,?,?,?,?,NULL)`,
      ).run(profileKey, id, safeName, parsedDate, type ? String(type).slice(0, 20) : '未分类', DOC_STATUS.pending, nextOrd, digest, relPath)
    } catch (error) {
      /* 落库失败就把刚写的文件删掉，否则资料目录里会留一份没有任何记录的孤儿原件 */
      try { unlinkSync(abs) } catch { /* 删不掉也只能如实报原始错误 */ }
      throw error
    }
    return {
      duplicate: false,
      document: { id, name: safeName, date: parsedDate, type: type || '未分类', status: DOC_STATUS.pending },
      sha256: digest,
    }
  }

  /* ---------------- 解析 ---------------- */

  /**
   * 触发解析。**必须由用户显式点**（本函数不排队、不自动重试）。
   * 失败时：任务记 failed、文档记解析失败、候选 0 条、原件保留。
   */
  async parseDocument({ profileKey, docId, token = null, modelVersion = undefined, client = null } = {}) {
    requireProfile(this.#db, profileKey)
    const doc = row(this.#db, 'SELECT * FROM documents WHERE profile_key = ? AND id = ?', profileKey, docId)
    if (!doc) throw new ImportError('doc_not_found', `资料不存在：${docId}`, 404, 'docId')
    if (!doc.rel_path) throw new ImportError('no_original', '这条资料没有原件路径（可能是历史演示记录），不能解析', 409)
    const abs = this.#absPath(doc.rel_path)
    if (!existsSync(abs)) throw new ImportError('original_missing', `原件不在了：${doc.name}。请重新上传，或把它放回资料目录`, 409)
    const bytes = readFileSync(abs)

    const jobId = `j-${this.#now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const startedAt = this.#now().toISOString()
    const nextJobOrd = (row(this.#db, 'SELECT MAX(ord) AS m FROM parse_jobs WHERE profile_key = ?', profileKey)?.m ?? -1) + 1
    this.#db.prepare(
      `INSERT INTO parse_jobs (profile_key,id,doc_id,status,engine,model,batch_id,pages,error_code,error_message,started_at,finished_at,ord)
       VALUES (?,?,?,'running','mineru-api-v4',?,NULL,NULL,NULL,NULL,?,NULL,?)`,
    ).run(profileKey, jobId, docId, modelVersion ?? null, startedAt, nextJobOrd)
    this.#db.prepare('UPDATE documents SET status = ? WHERE profile_key = ? AND id = ?')
      .run(DOC_STATUS.pending, profileKey, docId)

    let result
    try {
      const mineru = client ?? this.#mineruFactory({ token: token || null })
      /* 方法名是 parse（dsh/mineru.js 的公开入口），不是 parseFile——写错会得到
         "is not a function" 这种把真实失败盖掉的报错，所以这里只认一个名字。 */
      result = await mineru.parse({ bytes, filename: doc.name, modelVersion })
    } catch (error) {
      const code = error instanceof MineruError ? error.code : (error?.code || 'PARSE_FAILED')
      const message = error?.message || '解析失败（没有更多信息）'
      this.#markJobFailed(profileKey, jobId, docId, code, message)
      throw new ImportError(code, message, code === 'NO_TOKEN' ? 409 : 502, 'parse')
    }

    const { reportDate, candidates, warnings } = extractCandidates(result.markdown, dictionaryEntries())

    /* 报告日期：文档上已经有用户填的日期就不覆盖（用户填的优先于识别）。
       识别到但文档没有 → 补上，来源记在任务里由界面说明。 */
    const finalDate = doc.date || reportDate || null
    const pages = result.pages ?? null
    const finishedAt = this.#now().toISOString()

    try {
      tx(this.#db, () => {
        /* 重试只清掉未确认的候选；已接受的留着做溯源（事实层已写过，删了就断链）。 */
        this.#db.prepare(
          `DELETE FROM candidate_fields WHERE profile_key = ? AND doc_id = ? AND status <> 'accepted'`,
        ).run(profileKey, docId)
        const baseOrd = (row(this.#db,
          'SELECT MAX(ord) AS m FROM candidate_fields WHERE profile_key = ?', profileKey)?.m ?? -1) + 1
        const insert = this.#db.prepare(
          `INSERT INTO candidate_fields (profile_key,id,name,value,source,status,ord,doc_id,metric_key,unit,value_num,value_text)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        candidates.forEach((c, i) => {
          insert.run(
            profileKey,
            /* id 里带 jobId：重解析时上一轮已 accepted 的候选按规则不删（事实层溯源），
               再按 `c-<docId>-<序号>` 编号就会撞主键（实测 UNIQUE constraint failed）。 */
            `c-${jobId}-${i}`,
            c.name,
            c.valueText,
            doc.name,
            'candidate',
            baseOrd + i,
            docId,
            c.key,
            c.unit,
            c.valueNum,
            c.valueNum === null ? c.valueText : null,
          )
        })
        this.#db.prepare(
          `UPDATE parse_jobs SET status='succeeded', batch_id=?, pages=?, model=?, finished_at=? WHERE profile_key = ? AND id = ?`,
        ).run(result.batchId ?? null, pages, result.modelVersion ?? modelVersion ?? null, finishedAt, profileKey, jobId)
        this.#db.prepare(
          'UPDATE documents SET status = ?, date = ?, pages = ? WHERE profile_key = ? AND id = ?',
        ).run(DOC_STATUS.parsed, finalDate, pages, profileKey, docId)
      })
    } catch (error) {
      /* 落库失败也要收口：事务已回滚，但 parse_jobs 是在事务外插的，
         不标失败就会永远停在 running——下一次重试还要靠它判断历史。 */
      this.#markJobFailed(profileKey, jobId, docId, error?.code || 'DB_WRITE_FAILED', error?.message)
      throw new ImportError('db_write_failed', `候选写入失败：${error?.message || '未知原因'}`, 500, 'parse')
    }

    return {
      job: { id: jobId, status: 'succeeded', pages, batchId: result.batchId ?? null },
      reportDate,
      dateSource: doc.date ? 'user' : (reportDate ? 'parsed' : 'none'),
      candidates: this.listCandidates(profileKey, { docId }),
      warnings,
    }
  }

  /* ---------------- 候选 / 确认 ---------------- */

  listCandidates(profileKey, { docId = null, status = null } = {}) {
    requireProfile(this.#db, profileKey)
    const where = ['c.profile_key = ?']
    const args = [profileKey]
    if (docId) { where.push('c.doc_id = ?'); args.push(docId) }
    if (status) { where.push('c.status = ?'); args.push(status) }
    return rows(this.#db,
      `SELECT c.id, c.name, c.value, c.source, c.status, c.doc_id, c.metric_key, c.unit, c.value_num, c.value_text,
              d.date AS doc_date, d.name AS doc_name
         FROM candidate_fields c LEFT JOIN documents d
           ON d.profile_key = c.profile_key AND d.id = c.doc_id
        WHERE ${where.join(' AND ')} ORDER BY c.ord`, ...args)
      .map((c) => {
        const entry = c.metric_key ? metricByCode(c.metric_key) : null
        return {
          id: c.id,
          name: c.name,
          metricKey: c.metric_key,
          /* key 为空 = 本工作台没有这项趋势位，只能看、不能入档 */
          noteOnly: !c.metric_key,
          unit: c.unit,
          /* 识别出的单位与词典里的常见写法不一致：只提示"请核对"。
             真实报告里见过 OCR 把 mL/min 读成 m/min——抄写层不改它，但要让用户看见。 */
          unitMismatch: Boolean(entry?.unit && c.unit && unitKey(entry.unit) !== unitKey(c.unit)),
          /* 词典里的常见写法：核对页要把它摆出来，用户才知道该改成什么 */
          unitExpected: entry?.unit ?? null,
          valueText: c.value_num === null ? (c.value_text ?? c.value) : String(c.value_num),
          valueNum: c.value_num,
          source: c.source,
          docId: c.doc_id,
          docDate: c.doc_date,
          status: c.status,
        }
      })
  }

  /**
   * 接受一条候选：写事实层 + 候选标 accepted。**这不是医学审核**，不写任何审核字段。
   * 只允许 key 非空的候选（note-only 项没有落点，硬写会造出一列没有读模型的指标）。
   */
  acceptCandidate({ profileKey, id, date = null } = {}) {
    requireProfile(this.#db, profileKey)
    const c = row(this.#db,
      'SELECT * FROM candidate_fields WHERE profile_key = ? AND id = ?', profileKey, id)
    if (!c) throw new ImportError('candidate_not_found', `候选不存在：${id}`, 404, 'id')
    if (c.status === 'accepted') return { ok: true, alreadyAccepted: true }
    if (!c.metric_key) {
      throw new ImportError('note_only', `${c.name} 本工作台暂不建趋势，只能作为阅读提示，不能入档`, 400, 'metricKey')
    }
    const doc = c.doc_id
      ? row(this.#db, 'SELECT date, name FROM documents WHERE profile_key = ? AND id = ?', profileKey, c.doc_id)
      : null
    const d = requireDate(date || doc?.date, 'date')

    const ord = (row(this.#db,
      'SELECT MAX(ord) AS m FROM metric_points WHERE profile_key = ? AND metric_key = ? AND d = ?',
      profileKey, c.metric_key, d)?.m ?? -1) + 1

    tx(this.#db, () => {
      this.#db.prepare(
        'INSERT INTO metric_points (profile_key,metric_key,d,v_num,v_text,src,ord) VALUES (?,?,?,?,?,?,?)',
      ).run(
        profileKey,
        c.metric_key,
        d,
        c.value_num,
        c.value_num === null ? (c.value_text ?? c.value) : null,
        doc?.name ?? c.source,
        ord,
      )
      this.#db.prepare('UPDATE candidate_fields SET status = ? WHERE profile_key = ? AND id = ?')
        .run('accepted', profileKey, id)
      /* 该文档全部候选都处理完（没有待核对的）才标「已核对」——部分确认不是核对完成 */
      const pending = row(this.#db,
        `SELECT COUNT(*) AS n FROM candidate_fields WHERE profile_key = ? AND doc_id = ? AND status = 'candidate'`,
        profileKey, c.doc_id)
      if (c.doc_id && (pending?.n ?? 0) === 0) {
        this.#db.prepare('UPDATE documents SET status = ? WHERE profile_key = ? AND id = ?')
          .run(DOC_STATUS.confirmed, profileKey, c.doc_id)
      }
    })
    return { ok: true, metricKey: c.metric_key, d, value: c.value_num ?? c.value_text }
  }

  /** 拒绝一条候选：留行、改状态（不删——"我看过并不要"本身是信息）。 */
  rejectCandidate({ profileKey, id } = {}) {
    requireProfile(this.#db, profileKey)
    const c = row(this.#db, 'SELECT id, status FROM candidate_fields WHERE profile_key = ? AND id = ?', profileKey, id)
    if (!c) throw new ImportError('candidate_not_found', `候选不存在：${id}`, 404, 'id')
    if (c.status === 'accepted') throw new ImportError('already_accepted', '这条已经入档了；要更正请新增一条记录，不要删', 409, 'id')
    this.#db.prepare('UPDATE candidate_fields SET status = ? WHERE profile_key = ? AND id = ?')
      .run('rejected', profileKey, id)
    return { ok: true }
  }

  /** 手填一条候选（解析漏项时用）：与解析出来的候选同形，同样要逐项确认。 */
  addManualCandidate({ profileKey, docId = null, metricKey, valueText, unit = null } = {}) {
    requireProfile(this.#db, profileKey)
    const entry = metricByCode(metricKey)
    if (!entry || !entry.key) throw new ImportError('bad_metric', `这个指标不能入档：${metricKey}`, 400, 'metricKey')
    const num = entry.kind === 'grade' ? null : Number(String(valueText).trim())
    const isNum = entry.kind !== 'grade' && Number.isFinite(num)
    if (!isNum && !String(valueText ?? '').trim()) {
      throw new ImportError('missing_value', '值不能为空', 400, 'valueText')
    }
    const id = `m-${this.#now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
    const ord = (row(this.#db, 'SELECT MAX(ord) AS m FROM candidate_fields WHERE profile_key = ?', profileKey)?.m ?? -1) + 1
    this.#db.prepare(
      `INSERT INTO candidate_fields (profile_key,id,name,value,source,status,ord,doc_id,metric_key,unit,value_num,value_text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      profileKey, id, entry.name, String(valueText).trim(), '手填', 'candidate', ord, docId,
      entry.key, unit ?? entry.unit ?? null, isNum ? num : null, isNum ? null : String(valueText).trim(),
    )
    return { ok: true, id }
  }

  /* ---------------- 任务状态 ---------------- */

  /**
   * 把一次解析任务标成失败。**不抛异常**：它几乎总是在错误处理路径里被调用，
   * 标记失败本身再失败就会把真实原因盖掉。
   */
  #markJobFailed(profileKey, jobId, docId, code, message) {
    try {
      tx(this.#db, () => {
        this.#db.prepare(
          `UPDATE parse_jobs SET status='failed', error_code=?, error_message=?, finished_at=? WHERE profile_key = ? AND id = ?`,
        ).run(String(code).slice(0, 60), String(message ?? '').slice(0, 500), this.#now().toISOString(), profileKey, jobId)
        this.#db.prepare('UPDATE documents SET status = ? WHERE profile_key = ? AND id = ?')
          .run(DOC_STATUS.failed, profileKey, docId)
      })
    } catch { /* 忽略：真实错误在上层已经准备好抛出了 */ }
  }

  /* ---------------- 路径 ---------------- */

  #absPath(relPath) {
    const abs = resolve(this.#workspace, relPath)
    /* rel_path 来自库，理论上都由本服务写入；仍然校验一次，防止被手工改库后读到资料目录外 */
    if (abs !== this.#workspace && !abs.startsWith(this.#workspace + sep)) {
      throw new ImportError('bad_path', '原件路径越出了资料目录', 409)
    }
    return abs
  }

  #fileExists(relPath) {
    try {
      return existsSync(this.#absPath(relPath))
    } catch {
      return false
    }
  }
}

export function createImportService(db, opts) {
  return new ImportService(db, opts)
}

/* 供调用方判断"这条错误是不是字段级校验"，server 层据此决定 400 还是 500 */
export { ValidationError }
