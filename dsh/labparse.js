/* 从 MinerU 产出的 `full.md` 里抽「候选字段」：**只抄写，不判断**。
 *
 * 这一层是纯函数：不联网、不读凭据、不碰数据库。调用方（dsh/import.js）负责
 * 上传、轮询、事务和候选落库。分开的理由很实际——对齐规则最容易出错，
 * 而它的测试不该依赖网络。
 *
 * 三条规则来自真实事故（docs/18-MINERU-PARSING.md §4–§5）：
 * 1. **指标名只认词典**（dsh/dictionary.js），拉丁名要词边界：
 *    否则 `Cr` 会命中 `Creatinine`，`Hb` 会命中 `HbA1c`。
 * 2. **不等式原样保留**：`<0.5` 的数值字段是 null，折成 0.5 就是替用户下结论。
 * 3. **整张表挤进一个单元格时按位置对齐**：指标数与数值数不一致就整行放弃。
 *    朴素抽取（"名字后面取第一个数"）会把 8 个指标全写成同一个数，
 *    这是第一版真实踩到的事故，宁可漏一条让用户手填。
 */

import { isRealDate } from './dictionary.js'

const NUM_RE = /^[<>≥≤]?\s*\d+(?:\.\d+)?$/

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const HYPHEN_CHAR = /[-\u2010-\u2015\u2212]/

/**
 * 拉丁名（含数字与连字符）需要词边界；中文名直接 includes。
 *
 * 每个字母允许三种写法，都是为了真实 full.md 里的 OCR 噪声：
 * 1. 原字母本身；
 * 2. 原字母 + 组合变音符号（U+0300–U+036F，NFD 形式 `e` + `\u0301`）；
 * 3. **预组合字符**——`Creătinine` 里的 `ă` 是单个码位 U+0103，
 *    它本身就是「a」，不是「a 后面跟一个符号」。第一版写成
 *    `a[\u0300-\u036f]*` 于是永远配不上：那个 `a` 已经被 `ă` 占据了。
 *    所以按 NFD 分解表反查「哪些预组合字符分解出的基字母是 a」，逐字母列举。
 *
 * 仍然只是「同一个词的另一种写法」，不是模糊匹配：`Creatinin`（缺字母）照样不认。
 */
const COMBINING = '[\\u0300-\\u036f]*'

/** 基字母 → 分解回它的预组合字符（只收拉丁扩展 A/B 区，够覆盖 OCR 噪声）。 */
const PRECOMPOSED = (() => {
  const map = new Map()
  for (let cp = 0x00c0; cp <= 0x024f; cp += 1) {
    const ch = String.fromCharCode(cp)
    const base = ch.normalize('NFD')[0]
    if (!/[A-Za-z]/.test(base)) continue
    const key = base.toLowerCase()
    map.set(key, (map.get(key) ?? '') + ch.toLowerCase())
  }
  return map
})()

function charPattern(ch) {
  if (HYPHEN_CHAR.test(ch)) return '[-\\u2010-\\u2015\\u2212]'
  if (!/[A-Za-z]/.test(ch)) return escapeRe(ch)
  const variants = PRECOMPOSED.get(ch.toLowerCase())
  return variants
    ? `(?:${escapeRe(ch)}${COMBINING}|[${variants}])`
    : `${escapeRe(ch)}${COMBINING}`
}

function namePattern(name) {
  const latin = /^[A-Za-z0-9\-\s]+$/.test(name)
  if (!latin) return null
  const body = [...name].map(charPattern).join('')
  // 词边界两侧也要挡住预组合字母，否则 `XCreatinine` 里的 `X` 拦不住
  const edge = 'A-Za-z0-9\\u00c0-\\u024f'
  return new RegExp(`(?<![${edge}])${body}(?![${edge}])`, 'i')
}

/**
 * entries: [{ code, key, name, kind, dec, unit, names: [...] }]
 * 返回 (text) => 词条 | null；函数上挂 `all(text)` 给出全部命中的词条（按 code 去重）。
 * 按声明顺序取第一个命中——顺序有意义，长名排在短名前面（`NT-proBNP` 先于 `BNP`）。
 */
export function buildMetricMatcher(entries) {
  if (!Array.isArray(entries)) throw new TypeError('entries must be an array')
  const matchers = []
  for (const entry of entries) {
    if (!entry?.code || !Array.isArray(entry.names)) continue
    for (const raw of entry.names) {
      if (typeof raw !== 'string' || !raw.trim()) continue
      const name = raw.trim()
      matchers.push({ entry, name, re: namePattern(name) })
    }
  }
  const hits = (text) => {
    if (typeof text !== 'string') return []
    const found = []
    for (const m of matchers) {
      if (m.re ? m.re.test(text) : text.includes(m.name)) found.push(m)
    }
    return found
  }
  const find = (text) => hits(text)[0]?.entry ?? null
  find.all = (text) => {
    const seen = new Set()
    const out = []
    for (const m of hits(text)) {
      if (seen.has(m.entry.code)) continue
      seen.add(m.entry.code)
      out.push(m.entry)
    }
    return out
  }
  /** 词条名在文本里第一次出现的下标（拉丁名要按同一套连字符规则找）。 */
  find.locate = (text, entry) => {
    let best = -1
    for (const m of hits(text)) {
      if (m.entry.code !== entry.code) continue
      const at = m.re ? text.search(m.re) : text.indexOf(m.name)
      if (at >= 0 && (best < 0 || at < best)) best = at
    }
    return best
  }
  return find
}

/** `<0.5` → { valueText: '<0.5', valueNum: null }；不是数字就 null。 */
export function parseResultValue(text) {
  if (typeof text !== 'string') return null
  const t = text.trim().replace(/^\*+|\*+$/g, '')
  if (!t || !NUM_RE.test(t)) return null
  const m = t.match(/^([<>≥≤])\s*(\d+(?:\.\d+)?)$/)
  if (m) return { valueText: t, valueNum: null }
  const n = Number(t)
  return Number.isFinite(n) ? { valueText: t, valueNum: n } : null
}

const ROMAN_TO_GRADE = { I: 'I', II: 'II', III: 'III', IV: 'IV' }

/** NYHA 是分级不是数值：`valueNum` 必须留 null，文字原样抄（`III 级`）。 */
export function parseNyhaValue(text) {
  if (typeof text !== 'string') return null
  const t = text.trim()
  if (!t) return null
  const roman = t.match(/\b(IV|III|II|I)\b/)
  if (roman) return { valueText: `${ROMAN_TO_GRADE[roman[1]]} 级`, valueNum: null }
  const digit = t.match(/([1-4])\s*级/)
  if (digit) return { valueText: `${['I', 'II', 'III', 'IV'][Number(digit[1]) - 1]} 级`, valueNum: null }
  const lone = t.match(/^[1-4]$/)
  if (lone) return { valueText: `${['I', 'II', 'III', 'IV'][Number(lone[1]) - 1]} 级`, valueNum: null }
  return null
}

const UNIT_MAP = [
  [/^10\^9\s*\/\s*L$/i, '10⁹/L'],
  [/^10\^12\s*\/\s*L$/i, '10¹²/L'],
  [/^umol\s*\/\s*L$/i, 'μmol/L'],
  [/^μmol\s*\/\s*L$/i, 'μmol/L'],
  [/^mmol\s*\/\s*L$/i, 'mmol/L'],
  [/^mg\s*\/\s*(dl|dL)$/, 'mg/dL'],
  [/^ug\s*\/\s*(ml|mL)$/i, 'μg/mL'],
  [/^ng\s*\/\s*(ml|mL)$/i, 'ng/mL'],
  [/^pg\s*\/\s*(ml|mL)$/i, 'pg/mL'],
  [/^ng\s*\/\s*L$/i, 'ng/L'],
  [/^u\s*\/\s*(ml|mL)$/i, 'U/mL'],
  [/^u\s*\/\s*L$/i, 'U/L'],
  [/^g\s*\/\s*L$/i, 'g/L'],
  [/^kg$/i, 'kg'],
]

/** `$10^{9}/L$`、`\mu mol/L` 是真实 full.md 的写法，先剥 LaTeX 再归一。 */
function stripLatex(s) {
  return s
    .replace(/\$/g, '')
    .replace(/\\mu\s*/gi, 'μ')
    .replace(/\\times\s*/gi, '×')
    .replace(/10\s*\^\s*\{?\s*(\d+)\s*\}?/g, '10^$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 认不出的单位留 null（候选标「缺单位」），不猜。 */
export function normalizeUnit(unit) {
  if (typeof unit !== 'string') return null
  const t = stripLatex(unit)
  if (!t) return null
  for (const [re, out] of UNIT_MAP) if (re.test(t)) return out
  /* 复合单位如 mL/min/1.73m²：只放行"不含句子特征"的短串 */
  return /^[^|<>，。；]{1,24}$/.test(t) ? t : null
}

/** 把 `<table>` 里每个 `<tr>` 转成 `| a | b |`，其余表格路径不变。 */
export function htmlTablesToRows(markdown) {
  if (typeof markdown !== 'string') return []
  const out = []
  for (const table of markdown.match(/<table[\s\S]*?<\/table>/gi) || []) {
    for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [])
        .map((c) => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
      if (cells.length) out.push(`| ${cells.join(' | ')} |`)
    }
  }
  return out
}

export function splitMarkdownRow(line) {
  if (typeof line !== 'string') return null
  const t = line.trim()
  if (!t.startsWith('|') || !t.endsWith('|')) return null
  return t.slice(1, -1).split('|').map((c) => c.trim())
}

/**
 * 按位置对齐。`labels` 与 `values` 长度不一致返回 null（整行放弃）。
 * `match` 把单元格映射到词条；认不出的单元格跳过（不占位）。
 */
export function alignPositional(match, labels, values, units = []) {
  if (typeof match !== 'function' || !Array.isArray(labels) || !Array.isArray(values)) return null
  if (labels.length === 0 || labels.length !== values.length) return null
  if (units.length && units.length !== labels.length) return null
  const rows = []
  for (let i = 0; i < labels.length; i++) {
    const entry = match(labels[i])
    if (!entry) continue
    const value = valueFromCell(values[i], entry)
    if (!value) continue
    rows.push({
      code: entry.code,
      key: entry.key ?? null,
      name: entry.name,
      kind: entry.kind || 'numeric',
      valueText: value.valueText,
      valueNum: value.valueNum,
      unit: units.length ? normalizeUnit(units[i]) : null,
    })
  }
  return rows
}

/**
 * 从一格文字里取结果值。两件事会在这里被挡掉：
 * - 日期（`2026-04-24` 的 2026 不是结果）；
 * - 参考范围（`0-125` 这种，后面紧跟 `-数字` 就放弃）。
 * `from` 是名字在这一格里的结束位置，避免把指标名里的数字（`1.73`）当成结果。
 */
function valueFromCell(cell, entry, from = 0, matchObj = null) {
  const text = String(cell ?? '')
  if (entry.kind === 'grade') {
    const tail = text.slice(from)
    return parseNyhaValue(tail)
  }
  const tail = text.slice(from)
  const m = tail.match(/([<>≥≤]?\s*\d+(?:\.\d+)?)(?![\d.])/)
  if (!m) return null
  const end = from + m.index + m[0].length
  const before = text.slice(Math.max(0, from + m.index - 1), from + m.index)
  const after = text.slice(end)
  if (before === '-' && after.startsWith('-')) return null
  if (/^[-~至]\s*\d/.test(after.trimStart())) return null
  return parseResultValue(m[1])
}

/**
 * 表格块：一张表里可能有多段「指标行 + 数值行」，逐段处理。
 */
export function extractTableCandidates(lines, entries) {
  const match = buildMetricMatcher(entries)
  const rows = (Array.isArray(lines) ? lines : String(lines ?? '').split('\n'))
    .map(splitMarkdownRow)
    .filter(Boolean)
    .filter((cells) => !cells.every((c) => /^[-:\s]*$/.test(c)))

  const candidates = []
  const abandoned = []
  for (let i = 0; i < rows.length; i++) {
    const labelRow = rows[i]
    const hits = labelRow.filter((c) => match(c)).length
    if (hits < 2) continue
    const valueRow = rows[i + 1]
    const valueCells = valueRow ? valueRow.filter((c) => NUM_RE.test(c)).length : 0
    if (!valueRow || valueCells === 0) {
      abandoned.push({ line: labelRow.join(' | '), reason: '指标行的下一行不是数值行' })
      continue
    }
    const after = rows[i + 2] ?? []
    const units = after.length === valueRow.length && after.length > 0
      && after.every((c) => !NUM_RE.test(c)) && after.some((c) => c) ? after : []
    const aligned = alignPositional(match, labelRow, valueRow, units)
    if (!aligned) {
      abandoned.push({
        line: labelRow.join(' | '),
        reason: `指标 ${labelRow.length} 格、数值 ${valueRow.length} 格，列数不一致`,
      })
      continue
    }
    candidates.push(...aligned)
    i += units.length ? 2 : 1
  }

  /* 兜底：一行一个指标的标准表。只处理恰好命中 1 个指标的行，
     与上面的横向表不重叠（横向表的指标行命中 ≥2）。 */
  for (const cells of rows) {
    const found = match.all(cells.join(' '))
    if (found.length !== 1) continue
    const entry = found[0]
    const mi = cells.findIndex((c) => match(c))
    if (mi < 0) continue
    /* 先看命中格里有没有值（`| NYHA III |`、`| NT-proBNP 980 pg/mL |` 这种同格写法） */
    const at = match.locate(cells[mi], entry)
    let value = valueFromCell(cells[mi], entry, at < 0 ? 0 : at)
    let unitCell = null
    if (!value) {
      for (let j = mi + 1; j < cells.length; j++) {
        value = valueFromCell(cells[j], entry)
        if (!value) continue
        unitCell = cells.slice(j + 1).find((c) => c && !NUM_RE.test(c)) ?? null
        break
      }
    } else {
      const rest = cells[mi].slice((at < 0 ? 0 : at) + entry.name.length)
      const um = rest.match(/[（(]?\s*([^\s,，;；)）]{1,24})/)
      unitCell = um && !NUM_RE.test(um[1]) ? um[1] : null
      if (!unitCell) unitCell = cells.slice(mi + 1).find((c) => c && !NUM_RE.test(c)) ?? null
    }
    if (!value) continue
    candidates.push({
      code: entry.code,
      key: entry.key ?? null,
      name: entry.name,
      kind: entry.kind || 'numeric',
      valueText: value.valueText,
      valueNum: value.valueNum,
      unit: normalizeUnit(unitCell),
    })
  }
  return { candidates, abandoned }
}

const DATE_LABEL = /(采样|采集|检验|报告|出具|送检|检测)日期|采样时间|报告时间/

/** 报告日期：先找带标签的行，再找前 60 行第一个合法日期。都不认就 null。 */
export function parseReportDate(markdown) {
  if (typeof markdown !== 'string') return null
  const lines = markdown.split('\n').slice(0, 400)
  const patterns = [
    /(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/,
    /(\d{4})(\d{2})(\d{2})/,
  ]
  const pick = (line) => {
    for (const re of patterns) {
      const m = line.match(re)
      if (!m) continue
      const [y, mo, d] = [m[1], m[2], m[3]]
      if (!isRealDate(y, mo, d)) continue
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    return null
  }
  for (const line of lines) {
    if (!DATE_LABEL.test(line)) continue
    const found = pick(line)
    if (found) return found
  }
  for (const line of lines.slice(0, 60)) {
    const found = pick(line)
    if (found) return found
  }
  return null
}

const INLINE_SKIP = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?/

/**
 * 散行抽取（无表格的报告：`NT-proBNP 980 pg/mL`）。
 * 只认「这一行恰好命中 1 个指标 + 名后第一个数字」；后面紧跟 `-125`/`~125` 视为参考范围，放弃。
 */
export function extractInlineCandidates(markdown, entries) {
  const match = buildMetricMatcher(entries)
  const out = []
  const seen = new Set()
  for (const raw of String(markdown ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('|') || line.startsWith('#') || line.startsWith('![')) continue
    if (/^<!--/.test(line) || /^<(?!table)/i.test(line)) continue
    const plain = line.replace(INLINE_SKIP, '').replace(/\*\*/g, '')
    const found = match.all(plain)
    if (found.length !== 1) continue
    const entry = found[0]
    const at = match.locate(plain, entry)
    if (at < 0) continue
    const tail = plain.slice(at)
    const m = tail.match(/([<>≥≤]?\s*\d+(?:\.\d+)?)(?![\d.])/)
    if (!m) continue
    const after = tail.slice(m.index + m[0].length)
    const before = tail.slice(Math.max(0, m.index - 1), m.index)
    /* `2026-04-24` 里的数字不是结果 */
    if (before === '-' && after.startsWith('-')) continue
    if (/^[-~至]\s*\d/.test(after.trimStart())) continue
    const value = entry.kind === 'grade' ? parseNyhaValue(m[1]) : parseResultValue(m[1])
    if (!value) continue
    const rest = after.trimStart().replace(/^[（(]/, '')
    const unitMatch = rest.match(/^([^\s,，;；)）|]{1,24})/)
    const unit = unitMatch ? normalizeUnit(unitMatch[1]) : null
    const sig = `${entry.code}|${value.valueText}`
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push({
      code: entry.code,
      key: entry.key ?? null,
      name: entry.name,
      kind: entry.kind || 'numeric',
      valueText: value.valueText,
      valueNum: value.valueNum,
      unit,
    })
  }
  return out
}

/**
 * 总入口：markdown → { reportDate, candidates, warnings }。
 * candidates 里 key 为 null 的是「只提示、不入档」项，调用方必须照实展示、不许接受。
 */
export function extractCandidates(markdown, entries) {
  const text = String(markdown ?? '')
  const tableLines = [
    ...text.split('\n').filter((l) => l.trim().startsWith('|')),
    ...htmlTablesToRows(text),
  ]
  const table = extractTableCandidates(tableLines, entries)
  // 行内兜底只在「非表格」的文字上跑：否则 `<td>肌酐</td><td>118</td>` 里
  // 名字后面紧跟的 `>` 会被当成不等式，抄出一条 `>118` 的假候选（实测踩到）。
  const prose = text
    .replace(/<table[\s\S]*?<\/table>/gi, '\n')
    .split('\n')
    .filter((l) => !l.trim().startsWith('|'))
    .join('\n')
  const inline = extractInlineCandidates(prose, entries)
  const fromTable = new Set(table.candidates.map((c) => c.code))
  const seen = new Set()
  const merged = []
  // 表格结果优先：按位置对齐过的行比"文字里就近取数"可靠，同一指标不再出第二条。
  for (const c of table.candidates) {
    const sig = `${c.code}|${c.valueText}`
    if (seen.has(sig)) continue
    seen.add(sig)
    merged.push(c)
  }
  for (const c of inline) {
    if (fromTable.has(c.code)) continue
    const sig = `${c.code}|${c.valueText}`
    if (seen.has(sig)) continue
    seen.add(sig)
    merged.push(c)
  }
  const warnings = []
  if (!merged.length) warnings.push('没有识别到任何指标：可以在核对页手填，或换一份更清晰的报告')
  for (const a of table.abandoned) warnings.push(`有一行整行放弃：${a.reason}`)
  const noteOnly = merged.filter((c) => !c.key).length
  if (noteOnly) warnings.push(`${noteOnly} 项本工作台暂不建趋势，只作提示，不能接受入档`)
  const reportDate = parseReportDate(text)
  if (!reportDate) warnings.push('没识别到报告日期：入库前请你填一个')
  return { reportDate, candidates: merged, warnings }
}
