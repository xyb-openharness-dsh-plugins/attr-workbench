/* 客户端入口（宿主侧，由 ModuleLoader 加载的单文件）。
 *
 * 为什么是普通脚本而不是 ESM：宿主 renderer 用 `window.__ModuleLoader__.load({id, factory})`
 * 包一层来拿 React 组件；直接给 `export` 会被拒（Unexpected token 'export'）并把整个包移出 profile。
 *
 * 面板形态：**标准分栏**（customFrame=false，见 lib/layout.js 顶部说明）——右侧原生会话由宿主管，
 * 业务区只放一个页面。所以这里不自己画会话栏，也不 import 宿主的会话 API：注册一个占满可用空间的
 * iframe，指向本包自己的 UI 前缀 `/api/attr/ui/index.html`（见 dsh/index.js 的 UI_PREFIX）。
 *
 * 页面内的 AI 面板（五态 + 可拖分隔条 + 宽度记忆）在 public/app.js 里实现，dev-server 与 Desktop
 * 两条链路看到的是同一份前端。要把**原生会话**也变成可拖，需要改 customFrame=true 并补 React 外壳，
 * 那件事列在阶段 3（docs/DEV-PLAN.md），本轮不写没实测过的代码。
 *
 * 三个数字（businessSide / businessWidth / customFrame）的唯一来源是 `lib/layout.js`，
 * 这里是宿主要求写死的字面量副本；`test/ui-parity.test.mjs` 会比对两处，改一处漏一处会红。
 */
window.__ModuleLoader__.load({
  id: "@xyb-community/attr-workbench",
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const metadata = {
      title: "小甲宝 ATTR-Pal 转甲状腺素蛋白淀粉样变性工作台",
      description: "本机优先的 ATTR 型别确认、心脏与神经受累记录、治疗耐受与家族筛查准备工作台",
    }

    /* 业务界面就是 public/ 那一份（dev-server 与 Desktop 同源，不维护第二套 UI）。 */
    const UI_URL = "/api/attr/ui/index.html"

    function Panel() {
      return h('iframe', {
        src: UI_URL,
        title: metadata.title,
        style: { flex: 1, width: '100%', minWidth: 0, border: 0, background: '#f7f9fc', display: 'block' },
        /* 只允许同源页面；沙箱不做限制，页面需要 localStorage 记住面板宽度与字号档位 */
        referrerPolicy: 'same-origin',
      })
    }

    function apply(ctx) {
      ctx.effect(() => ctx.desktopWorkbenches.register({
        title: metadata.title,
        repository: "https://github.com/xyb-openharness-dsh-plugins/attr-workbench",
        description: metadata.description,
        businessSide: 'left',
        businessWidth: 0.65,
        customFrame: false,
      }, Panel))
    }

    return { apply, inject: ['desktopWorkbenches'] }
  }
})
