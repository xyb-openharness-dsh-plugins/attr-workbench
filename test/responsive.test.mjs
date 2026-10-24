/**
 * 窄宽自适应的**结构性**回归（0.2.1）。
 *
 * 像素级效果交给 `node scripts/probe-responsive.mjs` 在真实 Chrome 里量；
 * 这里只锁那些"改一行 CSS 就会悄悄破掉"的声明，跑在 `npm run check` 里，不需要浏览器。
 *
 * 规则与取值见 docs/RESPONSIVE-RULES.md §1/§2。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(ROOT, 'public', 'style.css'), 'utf8')

/** 取某条规则的声明体（同名只取第一次出现，够用：本项目一个选择器一种写法）。 */
const rule = (selector) => {
  const at = css.indexOf(`${selector}{`)
  assert.ok(at > 0, `找不到规则 ${selector}（改名了？同步改测试与 RESPONSIVE-RULES）`)
  const end = css.indexOf('}', at)
  return css.slice(at + selector.length + 1, end)
}

const mediaBlock = (width) => {
  const start = css.indexOf(`@media(max-width:${width}px)`)
  assert.ok(start > 0, `缺少 ${width}px 断点（RESPONSIVE-RULES §2 只有三档，别发明第四档）`)
  const next = css.indexOf('@media(', start + 10)
  return css.slice(start, next > 0 ? next : css.length)
}

test('① 多列栅格一律 minmax(0,1fr)，不许裸 1fr 或 flex:1', () => {
  for (const sel of ['.grid.two', '.grid.three', '.grid.four']) {
    const body = rule(sel)
    assert.match(body, /minmax\(0,1fr\)/, `${sel} 用 minmax(0,1fr)：裸 1fr 会被内容撑破`)
    assert.ok(!/flex:1/.test(body), `${sel} 不要用 flex:1 定宽`)
  }
})

test('② 指标卡栅格用 auto-fill + minmax(206px,1fr)：小于这个宽度就自动降列', () => {
  const body = rule('.metric-grid')
  assert.match(body, /auto-fill/)
  assert.match(body, /minmax\(206px,1fr\)/)
})

test('③ 表格容器必须自带横向滚动与 min-width:0（这是有意为之，不是溢出）', () => {
  const body = rule('.table-wrap')
  assert.match(body, /overflow-x:auto/)
  assert.match(body, /min-width:0/)
  assert.match(body, /max-width:100%/)
})

test('④ 断点三档齐全，且 900 档把双列 / 三列全部降为单列', () => {
  assert.match(mediaBlock(1180), /\.dash-cols\{grid-template-columns:minmax\(0,1fr\)\}/)
  const b900 = mediaBlock(900)
  assert.match(b900, /\.grid\.two,\.grid\.three,\.grid\.four/)
  assert.match(b900, /grid-template-columns:minmax\(0,1fr\)/)
  assert.match(b900, /#nav\{flex-direction:row;overflow-x:auto/)
  assert.ok(mediaBlock(600).length > 20, '600 档不能空着')
})

test('⑤ 窄宽下图表改成横向可滚，并且 scroll-hint 要显形', () => {
  const b900 = mediaBlock(900)
  assert.match(b900, /\.chart-wrap\{overflow-x:auto/)
  assert.match(b900, /\.scroll-hint\{display:block\}/)
  assert.match(rule('.scroll-hint'), /display:none/, '宽屏默认隐藏提示')
})

test('⑥ 侧栏与主区的容器允许收缩（min-width:0），否则窄宽会撑出横向滚动条', () => {
  const b900 = mediaBlock(900)
  assert.match(b900, /\.sidebar,\.work-area\{min-width:0\}/)
})
