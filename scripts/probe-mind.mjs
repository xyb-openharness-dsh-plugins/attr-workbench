#!/usr/bin/env node
/**
 * 0.4.0 两处「开发版先行」的真机探针。
 *
 * 背景：这两处不进 parity 的逐字符比对（原型快照冻结在 v0.1.0，D37 不跟着长），
 * 单测只能证明字符串在，证明不了「在真浏览器里能点开、不溢出、不报错」。
 * 所以这里用真 Chrome 点一遍：
 *   1. 生活与照护 → 情绪与照护者：三个区块都在，情绪记录是 viewpoints 的原话，
 *      照护者那块写明缺 caregiver_rows（不假装有）；
 *   2. 我的分型 → 确诊路径：指南出处卡在，机构 / 卷期页 / DOI / 口径差异四样齐全。
 * 判定：console 无错误、无横向溢出、无竖排单字、无内容被裁。
 *
 * 用法：`node scripts/probe-mind.mjs`；退出码 0/1。依赖本机 Chrome。
 * 环境变量：ATTR_MIND_CDP_PORT（默认 9361）。
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

const CDP_PORT = Number(process.env.ATTR_MIND_CDP_PORT || 9361)
const WIDTHS = [1300, 1100, 940, 780]
const FONTS = [1, 1.15, 1.32]

const dir = mkdtempSync(join(homedir(), '.xyb-attr-mind-'))
const workbench = await Workbench.open(dir)
const { server, port } = await startWorkbenchServer({ port: 0, workbench })

/** 与 probe-responsive.mjs 同一套判据，只扫业务区 */
const SCAN = `(() => {
  const bad = [];
  const em = (el) => parseFloat(getComputedStyle(el).fontSize) || 12;
  for (const el of document.querySelectorAll('#main *')) {
    if (el.closest('svg') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3)
      .map((n) => n.textContent).join('').replace(/\\s+/g, '');
    if (own.length < 6) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.width < em(el) * 3) bad.push({ sel: el.className || el.tagName, w: Math.round(rect.width), text: own.slice(0, 18) });
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
  return JSON.stringify({ bodyScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, vertical: bad.slice(0, 10), clipped: clipped.slice(0, 6) });
})()`

const ch = await launchChrome({ port: CDP_PORT })
const { cdp } = ch
const problems = []
const seen = {}
let consoleErrors = []

try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: 1000, deviceScaleFactor: 1, mobile: false })
  /* console 错误与页面异常由 scripts/cdp.mjs 在 Runtime.consoleAPICalled / exceptionThrown 时
     收进 cdp.errors（不用另挂监听），收尾时统一读。 */

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  for (let i = 0; i < 80 && !(await cdp.eval('Boolean(document.querySelector("#nav .nav-button"))')); i += 1) await sleep(120)

  const clickView = async (view) => cdp.eval(`(() => {
    const b = document.querySelector('[data-view="${view}"]');
    if (!b) return false; b.click(); return true;
  })()`)
  const clickSub = async (label) => cdp.eval(`(() => {
    const b = document.querySelector('[data-sub="${label}"]');
    if (!b) return false; b.click(); return true;
  })()`)

  /* ---------- 1. 情绪与照护者 ---------- */
  if (!(await clickView('life'))) problems.push('找不到「生活与照护」导航按钮')
  await sleep(250)
  const tabs = await cdp.eval(`Array.from(document.querySelectorAll('[data-sub]')).map((b) => b.getAttribute('data-sub'))`)
  if (!Array.isArray(tabs) || !tabs.includes('情绪与照护者')) problems.push(`页签里没有「情绪与照护者」，实际：${JSON.stringify(tabs)}`)
  if (!(await clickSub('情绪与照护者'))) problems.push('点不开「情绪与照护者」页签')
  await sleep(250)

  const html = (await cdp.eval(`document.querySelector('#main').innerHTML`)) || ''
  seen.tabs = tabs
  const must = [
    ['你写下的', '情绪记录区'],
    ['三个常被记下来的时刻', '记录时机提示'],
    ['这一块还没有位置', '照护者未引入说明'],
    ['caregiver_rows', '缺哪张表要写明'],
    ['不进导出', '隐私去向要交代']
  ]
  for (const [needle, why] of must) if (!html.includes(needle)) problems.push(`情绪页缺「${needle}」（${why}）`)
  if (/量表|评分|得分/.test(html)) problems.push('情绪页出现了量表/评分字样——那是第③层判断，不该有')

  for (const width of WIDTHS) {
    for (const tz of FONTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
      await cdp.eval(`document.documentElement.style.setProperty('--tz', ${tz})`)
      await sleep(120)
      const data = JSON.parse((await cdp.eval(SCAN)) || '{}')
      const key = `life/情绪与照护者 @${width}px ×${tz}`
      if (data.bodyScrollW > data.innerW + 1) problems.push(`${key}：横向溢出 ${data.bodyScrollW} > ${data.innerW}`)
      for (const v of data.vertical || []) problems.push(`${key}：竖排单字 .${v.sel} 宽 ${v.w}px「${v.text}」`)
      for (const c of data.clipped || []) problems.push(`${key}：内容被裁 .${c.sel} ${c.scrollW}>${c.clientW}`)
    }
  }

  /* 1300 标准字号留一张图，供报告引用 */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 2, mobile: false })
  await cdp.eval(`document.documentElement.style.setProperty('--tz', 1)`)
  await sleep(200)
  const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOTS, 'v0.4.0-mind-caregiver.png'), Buffer.from(shot1.data, 'base64'))

  /* ---------- 2. 确诊路径出处卡 ---------- */
  if (!(await clickView('subtype'))) problems.push('找不到「我的分型」导航按钮')
  await sleep(250)
  if (!(await clickSub('确诊路径'))) problems.push('点不开「确诊路径」页签')
  await sleep(250)
  const diag = (await cdp.eval(`document.querySelector('#main').innerHTML`)) || ''
  const mustDiag = [
    ['中华医学会心血管病学分会心力衰竭学组', '机构'],
    ['中华心血管病杂志 2021;49(4):324-332', '卷期页'],
    ['10.3760/cma.j.cn112148-20201217-00993', 'DOI'],
    ['两套并列', '口径差异'],
    ['Gillmore', '原始研究']
  ]
  for (const [needle, why] of mustDiag) if (!diag.includes(needle)) problems.push(`确诊路径缺「${needle}」（${why}）`)

  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(join(SHOTS, 'v0.4.0-guideline-source.png'), Buffer.from(shot2.data, 'base64'))

  /* ---------- 3. 当前方案的治疗出处卡（0.5.0） ---------- */
  if (!(await clickView('treatment'))) problems.push('找不到「治疗历程」导航按钮')
  await sleep(250)
  if (!(await clickSub('当前方案'))) problems.push('点不开「当前方案」页签')
  await sleep(250)
  const plan = (await cdp.eval(`document.querySelector('#main').innerHTML`)) || ''
  const mustPlan = [
    ['这一页的治疗分类与数字来自哪里', '治疗出处卡'],
    ['N Engl J Med 2018;379(11):1007-1016', 'ATTR-ACT 出处'],
    ['29.5%', 'ATTR-ACT 全因死亡数字'],
    ['待核批准文件', '口径冲突要标待核'],
    ['由医生决定', '出口要回到医生']
  ]
  for (const [needle, why] of mustPlan) if (!plan.includes(needle)) problems.push(`当前方案缺「${needle}」（${why}）`)

  /* 这张卡在页面底部，要滚下去才看得到；换一张长截图 */
  const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(join(SHOTS, 'v0.5.0-treatment-source.png'), Buffer.from(shot3.data, 'base64'))

  /* 窄宽再扫一次治疗页（表格 + 长段文字，是最容易挤坏的一页） */
  for (const width of [940, 780]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
    await sleep(150)
    const data = JSON.parse((await cdp.eval(SCAN)) || '{}')
    const key = `treatment/当前方案 @${width}px`
    if (data.bodyScrollW > data.innerW + 1) problems.push(`${key}：横向溢出 ${data.bodyScrollW} > ${data.innerW}`)
    for (const v of data.vertical || []) problems.push(`${key}：竖排单字 .${v.sel} 宽 ${v.w}px「${v.text}」`)
    for (const c of data.clipped || []) problems.push(`${key}：内容被裁 .${c.sel} ${c.scrollW}>${c.clientW}`)
  }
} catch (error) {
  problems.push(`探针异常：${error?.message ?? error}`)
} finally {
  await stopChrome(ch)
  server.close()
  try { workbench.close() } catch { /* 关库失败不影响结论 */ }
}

/* favicon 之类不影响阅读，但要如实报出来，不静默吞掉 */
consoleErrors = [...new Set([...(ch.cdp.errors || []), ...(ch.cdp.badResponses || [])])].filter(Boolean)
const noise = consoleErrors.filter((t) => !/favicon/i.test(String(t)))
if (noise.length) problems.push(`console 错误 ${noise.length} 条：${noise.slice(0, 3).join(' | ')}`)

console.log(JSON.stringify({
  ok: problems.length === 0,
  chrome: process.env.CHROME_PATH || '系统默认 Chrome',
  tabs: seen.tabs,
  consoleErrors,
  problems
}, null, 2))
process.exit(problems.length === 0 ? 0 : 1)
