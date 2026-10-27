/* 客户端入口源码。
 *
 * **不要直接改 lib/client.js**：那是 `npm run build:client` 从本文件生成的产物。
 * 官方要求客户端必须是「已构建好的单文件」，Desktop 不会替我们打包（workbench-standard §3.5），
 * 所以这里用一个零依赖的字符串替换把常量注入进去：
 * 包名与仓库取自 package.json，面板参数取自 lib/layout.js，接口前缀取自 dsh/index.js。
 * 参数仍然只有一份来源，换成生成而不是手抄，是为了避免两边漂移。
 *
 * ## 面板形态：customFrame（2026-10-24 真机反馈后改，样板 = 乳腺癌 0.12.0）
 *
 * 0.2.x 是标准分栏（customFrame=false）：页面里自己画了一条会话栏，宿主又在右边给了一块
 * 原生会话区——屏幕上同时出现两个「AI 对话」，而且都不能拖、不能关。原因不是漏接服务：
 * 标准分栏下宿主只把 businessWidth 写成静态 CSS 变量，根本没有拖宽/收起的编程接口。
 *
 * 改成 customFrame=true 后，宿主把**原生会话节点**作为 `conversation` prop 交给我们排版：
 *
 * - 顶栏有明确的「AI 对话 / 打开 AI 对话 / 收起 AI 对话」按钮（不再藏在业务页里）；
 * - 中间 splitter 可鼠标拖、可键盘调（←/→ 按步进，Home/End 到边界），区间 25%–45%；
 * - 收起只是隐藏面板，**不结束、不删除会话**；再点「打开 AI 对话」回到同一会话；
 * - 宽度与开合状态存 localStorage，重开后恢复；
 * - 容器窄于 NARROW_BELOW 时改为覆盖式抽屉，业务区不让位。
 *
 * 三条硬约束（官方 §4 / §6）：
 * 1. 根节点首个子元素必须是语义 `<header>`，并用 `--dsh-frame-leading-clearance` 避让
 *    macOS 左上角窗口按钮；
 * 2. 原生会话**始终挂载**（只用 display 控制显隐）——宿主明确要求"changing workbench
 *    content ... does not remount its input tree"，卸载会丢掉输入框状态；
 * 3. 无会话时业务面板照常可用（§6），依赖会话的操作在按钮处引导，不阻断业务。
 *
 * 会话集成：`desktopWorkbenches.ensureSession({ folder })` 调起原生会话（folder 来自
 * `/api/attr/health` 的 dir，会话因此落在本工作台的资料目录上）；开场白经
 * `sessions.scope(id).get('conversation').input` 填进**原生草稿**，不自动发送。
 * 拿不到宿主服务一律降级提示，不猜第二个入口。
 *
 * 页面侧的草稿交付契约：`public/app.js` 在「整理本页要点」后向父窗口
 * `postMessage({ type: 'pinky:agent-draft', prompt })`；本文件校验 source/origin 后填入草稿。
 */

;(function () {
  // 没有模块加载器就静静退出：这个文件也可能被静态检查脚本扫到，不该在那时抛错。
  if (typeof window === 'undefined' || typeof window.__ModuleLoader__?.load !== 'function') return

  window.__ModuleLoader__.load({
    id: '__PKG_NAME__',
    factory: (require) => {
      const React = require('react')
      const h = React.createElement

      /* 仓库地址必须直接写在 register() 的描述符里，不经常量中转：
         check-workbench-package 用正则静态读客户端，`repository: REPOSITORY` 这种
         中转写法会被判成「Canonical repository required（manual review if dynamic）」，
         让 npm run check 直接失败（2026-10-24 修，0.4.0 起）。
         值仍由 scripts/build-client.mjs 从 package.json 注入，只有一份来源。 */
      const UI_ENTRY = '__UI_ENTRY__'
      const VERSION = '__VERSION__'
      const TITLE = '小甲宝'
      const PANEL_TITLE = '小甲宝工作台'
      const SUBTITLE = 'ATTR-Pal · 本机数据 · 记录不是诊断'
      const DESCRIPTION = '本机优先的 ATTR 型别确认、心脏与神经受累记录、治疗耐受与家族筛查准备工作台。'
      const API_PREFIX = UI_ENTRY.replace(/\/ui\/?$/, '')

      /* ---- 面板宽度常量（由 scripts/build-client.mjs 从 lib/layout.js 注入） ---- */
      const AGENT_DEFAULT = __AGENT_DEFAULT__
      const AGENT_MIN = __AGENT_MIN__
      const AGENT_MAX = __AGENT_MAX__
      const AGENT_STEP = __AGENT_STEP__
      const NARROW_BELOW = __NARROW_BELOW__
      const DRAWER_MAX = __DRAWER_MAX__
      const WIDTH_KEY = 'xyb-attr.agent-pane.v1'
      const DRAFT_QUEUE_KEY = 'xyb-attr.initial-drafts.v1'

      const clampWidth = (value) => {
        const n = Number(value)
        if (!Number.isFinite(n)) return AGENT_DEFAULT
        return Math.min(AGENT_MAX, Math.max(AGENT_MIN, n))
      }
      /** 对齐到步进：键盘与鼠标落在同一组取值上，避免拖出 33.7% 这种数 */
      const snapWidth = (value) => clampWidth(Math.round(value / AGENT_STEP) * AGENT_STEP)
      const round4 = (n) => Math.round(n * 10000) / 10000

      function loadWidth() {
        try {
          const saved = JSON.parse(localStorage.getItem(WIDTH_KEY) || 'null')
          return clampWidth(saved?.width)
        } catch { return AGENT_DEFAULT }
      }
      function saveWidth(width) {
        try { localStorage.setItem(WIDTH_KEY, JSON.stringify({ width: round4(width) })) } catch { /* 隐私模式忽略 */ }
      }

      /* ---------------- 样式（小甲宝主色 #2E6E7E，与 public/style.css 同族） ---------------- */

      const rootStyle = {
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0,
        width: '100%', maxWidth: '100%', boxSizing: 'border-box',
        background: '#f7f9fc', fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      }
      // 首个子元素必须是语义 <header>：宿主为 macOS 窗口按钮预留了 --dsh-frame-leading-clearance。
      // 左侧 = 品牌 + 版本号；右侧 = AI 对话按钮，紧贴右缘；中间说明文字占位。
      const headerStyle = {
        display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto', flexWrap: 'wrap',
        padding: '6px 12px', paddingInlineStart: 'var(--dsh-frame-leading-clearance, 12px)',
        borderBottom: '1px solid #dbe6ea', background: '#f2f6f8', fontSize: 12,
      }
      const brandStyle = {
        display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#2E6E7E',
        whiteSpace: 'nowrap', fontSize: 12.5,
      }
      const verStyle = {
        fontWeight: 500, fontSize: 11, color: '#6b7f86', background: '#e6eef1',
        borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap',
      }
      const hintStyle = { flex: 1, minWidth: 200, color: '#7b8b92', fontSize: 11.5 }
      const headerActionsStyle = {
        display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', marginLeft: 'auto',
      }
      const bodyStyle = { position: 'relative', display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }
      const businessStyle = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }
      const frameStyle = { flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, display: 'block' }
      const paneStyle = {
        display: 'flex', flexDirection: 'column', flex: '0 0 auto', minWidth: 0, minHeight: 0,
        borderLeft: '1px solid #dbe6ea', background: '#fff', overflow: 'hidden',
      }
      const drawerStyle = {
        position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 3,
        boxShadow: '-8px 0 24px rgba(32, 58, 66, 0.14)',
      }
      const splitterStyle = {
        position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
        zIndex: 2, background: '#dbe6ea', cursor: 'col-resize', touchAction: 'none',
        transition: 'background .15s ease, box-shadow .15s ease',
      }

      /* 分隔线（全家族统一行为）：悬停显示本工作台同色系品牌色 + 发光把手；按住左右拖动调 AI 面板宽度 */
      const SPLITTER_BRAND = '#2E6E7E'
      const splitterRgba = (hex, alpha) => {
        const n = parseInt(String(hex).replace('#', ''), 16)
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }
      const splitterHoverStyle = {
        ...splitterStyle,
        background: SPLITTER_BRAND,
        boxShadow: `0 0 6px ${splitterRgba(SPLITTER_BRAND, 0.55)}`,
      }
      const splitterDragStyle = {
        ...splitterHoverStyle,
        boxShadow: `0 0 10px ${splitterRgba(SPLITTER_BRAND, 0.8)}`,
      }
      const splitterHitStyle = {
        position: 'absolute', top: 0, bottom: 0, left: -5, width: 11,
        background: 'transparent', cursor: 'col-resize',
      }
      const splitterGripStyle = {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
        color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
        opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
      }
      const dragShieldStyle = {
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4,
        cursor: 'col-resize', background: 'transparent', touchAction: 'none',
      }
      const fallbackStyle = { padding: 24, color: '#2b3d44', fontSize: 14, lineHeight: 1.7 }
      const buttonStyle = {
        border: 0, borderRadius: 999, padding: '5px 14px', whiteSpace: 'nowrap',
        background: '#2E6E7E', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer',
      }
      const ghostStyle = { ...buttonStyle, background: 'transparent', color: '#2E6E7E', border: '1px solid #cfe0e5' }
      const padStyle = {
        display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center',
        padding: 20, color: '#4d6167', fontSize: 12.5, lineHeight: 1.75,
      }

      function Fallback({ onRetry }) {
        return h('div', { style: fallbackStyle },
          h('p', null, `页面没能加载（v${VERSION} · ${UI_ENTRY}）。常见原因是 Harness 刚重启、插件还没加载完。`),
          h('p', null, '本工作台的数据只存在你选择的本机目录里，不会因为这个提示丢失。'),
          h('button', { type: 'button', style: buttonStyle, onClick: onRetry }, '重新加载'),
        )
      }

      /* ---------------- 会话判定（官方 dsh-site-selection 同款） ---------------- */

      let bridge = null
      function currentSession() {
        const service = bridge?.desktopWorkbenches
        if (typeof service?.currentSession === 'function') return service.currentSession() || null
        const snapshot = bridge?.sessions?.list?.getSnapshot?.()
        return snapshot?.current || Object.keys(snapshot?.byId || {}).find((id) =>
          (snapshot.byId[id]?.retainedBy?.mainView ?? 0) > 0) || null
      }
      function workbenchOwnsSession(sessionId) {
        if (!sessionId) return false
        const service = bridge?.desktopWorkbenches
        if (typeof service?.ownsSession === 'function') return service.ownsSession(sessionId)
        return false
      }
      function ownedSession() {
        const id = currentSession()
        return workbenchOwnsSession(id) ? id : null
      }

      /* ---------------- 原生草稿：只填入，不发送 ---------------- */

      function fillDraft(sessionId, prompt) {
        if (!sessionId || ownedSession() !== sessionId) throw new Error('会话已切换，请回到本工作台再操作')
        const actx = bridge.sessions.scope?.(sessionId)
        const conversation = actx?.get?.('conversation')
        if (!conversation) throw new Error('对话输入不可用')
        const input = conversation.input.for(actx)
        const snapshot = input.state.getSnapshot()
        if (snapshot.occurrences?.length || (snapshot.phase && snapshot.phase !== 'plain')) {
          throw new Error('当前草稿含引用或特殊输入，请先在原生会话里处理，再交给小甲宝')
        }
        const current = snapshot.draft || ''
        input.setDraft(current.trim() ? `${current}\n\n${prompt}` : prompt)
      }

      let pendingDraft = null // { sessionId, prompt }
      try {
        const saved = JSON.parse(localStorage.getItem(DRAFT_QUEUE_KEY) || 'null')
        if (saved?.sessionId && saved?.prompt) pendingDraft = saved
      } catch { /* 隐私模式忽略 */ }
      function rememberDraft(entry) {
        pendingDraft = entry
        try {
          if (entry) localStorage.setItem(DRAFT_QUEUE_KEY, JSON.stringify(entry))
          else localStorage.removeItem(DRAFT_QUEUE_KEY)
        } catch { /* 隐私模式忽略 */ }
      }
      function flushDraft() {
        if (!pendingDraft) return false
        try {
          fillDraft(pendingDraft.sessionId, pendingDraft.prompt)
          rememberDraft(null)
          return true
        } catch { return false // composer 未就绪就留给下一轮
        }
      }

      function onboardingPrompt(dir) {
        return [
          '你正在协助我使用「小甲宝 ATTR 工作台」。它只做本机资料整理，不提供诊疗建议。',
          `资料目录：${dir || '（首次打开时在面板里选择）'}`,
          '里面是我的型别确认（TTR 基因与质谱结果）、心脏与神经两条受累线、用药耐受记录与家系筛查安排。',
          '分工：你帮我汇总、找缺漏、把报告里的指标和日期整理成对照表；判断和决定由我和我的医疗团队做。',
          '我标记的"看法"是我自己的担心或判断，不是医生结论；心脏与神经两条线并列看，互不折算。',
        ].join('\n')
      }

      /* ---------------- 面板（customFrame） ---------------- */

      function Panel({ conversation }) {
        const [generation, setGeneration] = React.useState(0)
        const [broken, setBroken] = React.useState(false)
        const [note, setNote] = React.useState('')
        const [width, setWidth] = React.useState(loadWidth)
        const [paneOpen, setPaneOpen] = React.useState(true)
        const [connecting, setConnecting] = React.useState(false)
        const [narrow, setNarrow] = React.useState(false)
        const [dragging, setDragging] = React.useState(false)
        const [hovering, setHovering] = React.useState(false)

        const brokenTimer = React.useRef(null)
        const shellRef = React.useRef(null)
        const dragHostRef = React.useRef(null)
        const frameRef = React.useRef(null)

        /* 注意：customFrame 下 `conversation` 在工作台 active 时可能是个 display:none 的容器，
           恒非空——不能拿它当"已有会话"的判据。会话归属只问 currentSession() + ownsSession()。 */
        const canOpenSession = typeof bridge?.desktopWorkbenches?.ensureSession === 'function'
        const hasOwnedSession = Boolean(conversation) && Boolean(ownedSession())

        // 8 秒内没有 onLoad 就当作没起来：宁可给一个能重试的提示，也不留一块白板。
        // onLoad 成功后必须清掉这个定时器，否则页面加载完 8 秒后面板被换成兜底页。
        React.useEffect(() => {
          setBroken(false)
          brokenTimer.current = setTimeout(() => setBroken(true), 8000)
          return () => clearTimeout(brokenTimer.current)
        }, [generation])

        // 挂载后开始消化未送达的开场白（composer 就绪一轮一次），并订阅会话变化。
        React.useEffect(() => {
          const timer = setInterval(() => { if (flushDraft()) setNote('草稿已填入会话，按回车发送') }, 500)
          const unsubscribe = bridge?.desktopWorkbenches?.subscribe?.(() => setNote(''))
          return () => { clearInterval(timer); unsubscribe?.() }
        }, [])

        // 窄屏判定用**容器宽度**而不是窗口宽度：宿主主区宽度不等于窗口宽度。
        React.useEffect(() => {
          const host = shellRef.current
          if (!host || typeof ResizeObserver !== 'function') return undefined
          const observer = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width ?? 0
            setNarrow(w > 0 && w < NARROW_BELOW)
          })
          observer.observe(host)
          return () => observer.disconnect()
        }, [])

        const applyWidth = React.useCallback((next) => {
          const snapped = round4(snapWidth(next))
          setWidth(snapped)
          saveWidth(snapped)
        }, [])

        /* ---- splitter：鼠标/触控拖动 ---- */

        const stopDrag = React.useCallback(() => {
          dragHostRef.current = null
          setDragging(false)
        }, [])

        React.useEffect(() => {
          if (!dragging) return undefined
          const onMove = (event) => {
            const host = dragHostRef.current
            if (!host) return
            const rect = host.getBoundingClientRect()
            if (!rect.width) return
            // 会话在右侧：指针越靠左，会话越宽
            applyWidth((rect.right - event.clientX) / rect.width)
          }
          document.addEventListener('pointermove', onMove)
          document.addEventListener('pointerup', stopDrag)
          document.addEventListener('pointercancel', stopDrag)
          return () => {
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', stopDrag)
            document.removeEventListener('pointercancel', stopDrag)
          }
        }, [dragging, applyWidth, stopDrag])

        const onSplitterPointerDown = (event) => {
          event.preventDefault()
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 旧宿主无指针捕获：document 监听仍可拖动 */ }
          dragHostRef.current = shellRef.current
          setDragging(true)
        }

        const onSplitterKeyDown = (event) => {
          const delta = { ArrowLeft: AGENT_STEP, ArrowRight: -AGENT_STEP }[event.key] // 会话在右：← 变宽
          if (delta !== undefined) { event.preventDefault(); applyWidth(width + delta); return }
          if (event.key === 'Home') { event.preventDefault(); applyWidth(AGENT_MAX); return }
          if (event.key === 'End') { event.preventDefault(); applyWidth(AGENT_MIN) }
        }

        /* ---- 打开 / 收起 AI 对话 ---- */

        async function openAgent(prompt = null) {
          setNote('')
          if (!canOpenSession) {
            setNote('当前 Desktop 版本不支持从面板调起会话；请从左侧会话列表新建会话')
            return
          }
          setConnecting(true)
          try {
            let dir = null
            try {
              const res = await fetch(`${API_PREFIX}/health`)
              dir = (await res.json())?.dir || null
            } catch { /* 拿不到目录也照样调起 */ }
            const id = await bridge.desktopWorkbenches.ensureSession({ folder: dir })
            rememberDraft({ sessionId: id, prompt: prompt || onboardingPrompt(dir) })
            flushDraft()
            setPaneOpen(true)
            setNote('会话已就绪：草稿已填入右侧输入框，按回车发送')
          } catch (error) {
            setNote(`没能调起会话：${error?.message ?? error}`)
          } finally {
            setConnecting(false)
          }
        }

        // 收起只是隐藏，不是关闭/删除会话：再点「打开 AI 对话」回到同一个会话。
        function onAgentClick() {
          if (!hasOwnedSession) { void openAgent(); return }
          setPaneOpen((open) => !open)
          setNote('')
        }

        /* ---- 页面发来的「整理本页要点」草稿：只填输入框，不发送 ---- */

        async function deliverContext(prompt) {
          const id = ownedSession()
          if (id) {
            rememberDraft({ sessionId: id, prompt })
            setPaneOpen(true)
            setNote(flushDraft()
              ? '已把这一页的内容填入会话草稿，按回车发送'
              : '会话输入框还没就绪；草稿已暂存，就绪后自动填入')
            return
          }
          setNote('正在为你调起 AI 会话…')
          await openAgent(prompt)
        }

        // handler 每轮换成最新闭包，effect 只注册一次（否则会拿到首帧的 state）。
        const deliverRef = React.useRef(null)
        React.useEffect(() => { deliverRef.current = deliverContext })
        React.useEffect(() => {
          function onMessage(event) {
            const data = event.data
            if (!data || typeof data !== 'object' || data.type !== 'pinky:agent-draft') return
            const frame = frameRef.current
            // 不认"谁都能发"的消息：必须来自我们自己的 iframe，且同源。
            if (!frame || event.source !== frame.contentWindow) return
            if (event.origin !== window.location.origin) return
            const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : ''
            if (!prompt) return
            void deliverRef.current?.(prompt.slice(0, 8000))
          }
          window.addEventListener('message', onMessage)
          return () => window.removeEventListener('message', onMessage)
        }, [])

        const agentLabel = !canOpenSession
          ? 'AI 对话暂不可用'
          : connecting ? '正在连接…'
            : !hasOwnedSession ? 'AI 对话'
              : paneOpen ? '收起 AI 对话' : '打开 AI 对话'

        if (broken) return h(Fallback, { onRetry: () => setGeneration((n) => n + 1) })

        const percent = Math.round(width * 100)
        const paneVisible = paneOpen && (hasOwnedSession || connecting)

        return h('div', { style: rootStyle },
          h('header', { style: headerStyle },
            h('span', { style: brandStyle }, `🫀 ${TITLE}`),
            h('span', { style: verStyle }, `v${VERSION}`),
            h('span', { style: hintStyle },
              hasOwnedSession
                ? '右侧是 DSH 原生会话：可拖中间分隔边调整宽度（25%–45%），收起不会结束会话。'
                : '还没有会话。点右侧「AI 对话」调起原生会话，开场白只填进草稿，不自动发送。'),
            h('div', { style: headerActionsStyle },
              h('button', {
                type: 'button',
                style: buttonStyle,
                onClick: onAgentClick,
                disabled: connecting || !canOpenSession,
                'aria-label': `AI 对话：${agentLabel}`,
              }, agentLabel),
              hasOwnedSession && paneOpen && h('button', {
                type: 'button', style: ghostStyle, onClick: () => setPaneOpen(false),
                'aria-label': '收起 AI 对话面板',
              }, '×'),
              note && h('span', { style: { color: '#1f5a68', fontWeight: 600 } }, note),
            ),
          ),
          h('div', { ref: shellRef, style: bodyStyle },
            h('div', { style: businessStyle },
              h('iframe', {
                key: generation,
                ref: frameRef,
                src: UI_ENTRY,
                title: `${TITLE} · ${SUBTITLE}`,
                style: frameStyle,
                sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
                onLoad: () => { setBroken(false); clearTimeout(brokenTimer.current) },
              }),
            ),
            // splitter 只在宽屏出现：窄屏是覆盖式抽屉，拖宽没有意义
            !narrow && paneVisible && h('div', {
              role: 'separator',
              'aria-orientation': 'vertical',
              'aria-label': '调整 AI 对话面板宽度',
              'aria-valuemin': Math.round(AGENT_MIN * 100),
              'aria-valuemax': Math.round(AGENT_MAX * 100),
              'aria-valuenow': percent,
              tabIndex: 0,
              style: {
                ...(dragging ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle),
                right: `${percent}%`,
              },
              onPointerDown: onSplitterPointerDown,
              onPointerEnter: () => setHovering(true),
              onPointerLeave: () => setHovering(false),
              onKeyDown: onSplitterKeyDown,
            },
              h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
              (hovering || dragging) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null),
            dragging && !narrow && h('div', { 'aria-hidden': 'true', style: dragShieldStyle }),
            // 原生会话**始终挂载**：卸载会丢掉输入框与草稿状态，所以隐藏走 display。
            h('aside', {
              style: {
                ...paneStyle,
                ...(narrow ? drawerStyle : null),
                width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent}%`,
                display: paneVisible ? 'flex' : 'none',
              },
              'aria-label': 'AI 对话',
              'aria-hidden': paneVisible ? undefined : 'true',
            }, conversation ?? h('div', { style: padStyle },
              h('b', null, 'AI 对话还没开始'),
              h('span', null, '点顶栏「AI 对话」调起 DSH 原生会话后，它会固定出现在这一侧。'),
              h('span', null, '没有会话也不影响记录：左侧的型别、两条受累线与记录照常可用。'),
            )),
          ),
        )
      }

      function apply(ctx) {
        bridge = ctx
        ctx.effect(() => ctx.desktopWorkbenches.register({
          title: TITLE,
          panelTitle: PANEL_TITLE,
          icon: '🫀',
          repository: '__REPOSITORY__',
          description: DESCRIPTION,
          audience: 'ATTR（转甲状腺素蛋白淀粉样变性）患者、家系成员与照护者',
          requirements: '本机数据整理；不做诊断与处置建议，判断由用户与其医疗团队做出。',
          initialization: 'empty',
          embedded: true,
          version: VERSION,
          // 下面四个值由 scripts/build-client.mjs 从 lib/layout.js 注入，不在这里手写第二份
          layout: { businessSide: '__BUSINESS_SIDE__', businessWidth: __BUSINESS_WIDTH__ },
          customFrame: __CUSTOM_FRAME__,
        }, Panel))
      }

      return { apply, inject: ['desktopWorkbenches', 'sessions'] }
    },
  })
})()
