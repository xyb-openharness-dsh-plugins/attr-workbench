#!/usr/bin/env node
/**
 * 窄宽自适应探针（自胶质瘤工作台 0.1.5 移入并适配）。
 *
 * 背景（同一类事故）：AI 面板展开后业务区只剩 60%–75% 宽，卡内"标签 / 值 / 说明"
 * 横向并排会被压成一列列竖排单字。ATTR 的差异是**没有 hash 路由**，切页靠点击
 * `[data-view]`，所以这里用 CDP 点按钮而不是 `#page`。
 *
 * 判定规则（三条，与 docs/RESPONSIVE-RULES.md §1 一一对应）：
 * 1. `竖排单字`：元素宽 < 3em 且自身文字 ≥ 6 字 → 一行只放得下 1–2 字；
 * 2. `横向溢出`：documentElement.scrollWidth > innerWidth + 1；
 * 3. `内容被裁`：overflow 为 hidden/clip 且 scrollWidth > clientWidth + 2（有文字才算；
 *    可横向滚动的表格是有意为之，不算）。
 *
 * 用法：`node scripts/probe-responsive.mjs`；退出码 0/1。依赖本机 Chrome。
 * 可用 ATTR_RESP_WIDTHS / ATTR_RESP_PAGES / ATTR_RESP_CDP_PORT 覆盖。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Workbench } from '../dsh/workbench.js'
import { startWorkbenchServer } from '../dsh/server.js'
import { launchChrome, sleep, stopChrome } from './cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'docs', 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const CDP_PORT = Number(process.env.ATTR_RESP_CDP_PORT || 9351)
const WIDTHS = (process.env.ATTR_RESP_WIDTHS || '1300,1100,1000,940,860,780,700,620').split(',').map(Number)
const PAGES = (process.env.ATTR_RESP_PAGES
  || 'dashboard,records,subtype,treatment,cardiac,nerve,labs,timeline,family,life,review,trials').split(',')

const dir = mkdtempSync(join(homedir(), '.xyb-attr-resp-'))
const workbench = await Workbench.open(dir)
const { server, port } = await startWorkbenchServer({ port: 0, workbench })

const SCAN = `(() => {
  const bad = []
  const em = (el) => parseFloat(getComputedStyle(el).fontSize) || 12;
  const walk = document.querySelectorAll('#main *');
  for (const el of walk) {
    if (el.closest('svg') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3)
      .map((n) => n.textContent).join('').replace(/\\s+/g, '');
    if (own.length < 6) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.width < em(el) * 3) {
      bad.push({ kind: '竖排单字', sel: el.className || el.tagName, w: Math.round(rect.width), text: own.slice(0, 18) });
    }
  }
  const clipped = [];
  for (const el of document.querySelectorAll('#main *')) {
    const cs = getComputedStyle(el);
    if (!['hidden', 'clip'].includes(cs.overflowX) && !['hidden', 'clip'].includes(cs.overflow)) continue;
    if (!(el.textContent || '').trim()) continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.display !== 'inline') {
      clipped.push({ sel: el.className || el.tagName, scrollW: el.scrollWidth, clientW: el.clientWidth });
    }
  }
  return JSON.stringify({
    bodyScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    vertical: bad.slice(0, 12),
    clipped: clipped.slice(0, 8),
  });
})()`

const ch = await launchChrome({ port: CDP_PORT })
const { cdp } = ch
const problems = []
const report = {}

try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  for (let i = 0; i < 60 && !(await cdp.eval('Boolean(document.querySelector("#nav .nav-button"))')); i += 1) await sleep(120)

  for (const width of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    for (const page of PAGES) {
      const clicked = await cdp.eval(`(() => {
        const b = document.querySelector('[data-view="${page}"]');
        if (!b) return false;
        b.click();
        return true;
      })()`)
      if (!clicked) { problems.push(`${width}/${page}：找不到导航按钮（页面改键名了？）`); continue }
      await sleep(200)
      const scan = async (key) => {
        const data = JSON.parse((await cdp.eval(SCAN)) || '{}')
        report[key] = data
        if (data.bodyScrollW > data.innerW + 1) {
          problems.push(`${key}：横向溢出 scrollWidth=${data.bodyScrollW} > innerWidth=${data.innerW}`)
        }
        for (const v of data.vertical || []) problems.push(`${key}：竖排单字 .${v.sel} 宽 ${v.w}px「${v.text}」`)
        for (const c of data.clipped || []) problems.push(`${key}：内容被裁 .${c.sel} ${c.scrollW}>${c.clientW}`)
      }
      const key = `${width}/${page}`
      await scan(key)

      /* 二级页签：窄宽挤压最常出在这里（同父容器、内容更长）。默认只在 ≤940 扫，
         全宽度扫会把跑批时间翻几倍，收益很低。ATTR_RESP_SUBS=0 可关掉。 */
      if (width <= 940 && process.env.ATTR_RESP_SUBS !== '0') {
        const subs = await cdp.eval(`Array.from(document.querySelectorAll('[data-sub]')).map((b) => b.getAttribute('data-sub'))`)
        for (const sub of subs || []) {
          const ok = await cdp.eval(`(() => {
            const b = document.querySelector('[data-sub="${sub}"]');
            if (!b) return false; b.click(); return true;
          })()`)
          if (!ok) continue
          await sleep(180)
          await scan(`${width}/${page}/${sub}`)
        }
      }

      if (width === 940 && page === 'dashboard') {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(join(SHOTS, 'responsive-940-dashboard.png'), Buffer.from(shot.data, 'base64'))
      }
    }
  }
} catch (error) {
  problems.push(`探针异常：${error?.message ?? error}`)
} finally {
  await stopChrome(ch)
  server.close()
  try { workbench.close() } catch { /* 关库失败不影响结论 */ }
}

console.log(JSON.stringify({ ok: problems.length === 0, problems, report }, null, 2))
process.exit(problems.length === 0 ? 0 : 1)
