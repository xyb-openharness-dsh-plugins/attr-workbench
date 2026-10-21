/* 面板布局参数。
 *
 * 这里是 DSH 分栏合同的**唯一入参来源**：客户端 register、读模型下发与包级检查都读它。
 * 别处不许再写一份 0.65（也别写它的补数 0.35）——以前面板参数散在 client.js 与
 * 构建脚本里，改一处漏一处，最后连"业务区到底多宽"都要靠截图量。
 *
 * ## 本项目阶段 2 用标准分栏（customFrame=false）
 *
 * 与乳腺工作台（2026-10-19 改 customFrame）不同，本阶段如实记录"这一台走标准分栏"：
 *
 * 标准分栏下，宿主 `packages/dsh-desktop-workbenches/client.js` 只把
 * `--workbench-business-width` 写成注册时的静态值：
 *
 *   h('div', { className:'dshWbBody', hidden: customFrame,
 *     style: { '--workbench-business-width': `${entry.layout.businessWidth * 100}%` } })
 *
 * 服务本身只暴露 register/isActive/ownsSession/add/open/home/ensureSession/currentSession/
 * subscribe，**没有**拖宽或关闭面板的编程接口——所以「AI 对话面板不能拖、不能关」不是
 * 我们没接，而是那条路上根本不存在这个能力。
 *
 * customFrame=true 时宿主改走另一条分支（同文件第 2000 行），原生会话节点作为
 * `conversation` prop 交给我们排版，splitter 拖动、键盘调整、收起/重开、宽度记忆
 * 都由工作台自己实现。**那是阶段 3 的事**：需要按乳腺样板补一份 React 外壳
 * （根首元素 `<header>` + `--dsh-frame-leading-clearance` 避让 + 会话常驻不卸载），
 * 见 docs/DEV-PLAN.md 的阶段 3 清单。本轮不写没实测过的代码。
 *
 * 页面内的 AI 面板（五态 + 可拖分隔条 + 宽度记忆）在 `public/app.js` 里已经实现，
 * dev-server 与 iframe 两条链路都能实测；customFrame 只决定 Desktop 里**原生会话**
 * 由谁排版，不影响这一份页面内实现。
 *
 * 取值的两条理由：
 * 1. businessSide=left：业务区在左、宿主原生会话在右，与 v0.2 原型的信息层级一致；
 * 2. businessWidth=0.65：v0.2 原型的 12 个一级页是在 1440×65% ≈ 936px 的宽度下
 *    量出来的，0.7 会把会话区压到 30% 以下，0.6 以下则会让原型里的三栏卡片提前换行。
 */

/**
 * 宿主面板参数（写进客户端 register 时逐字使用）。
 * 宿主强校验：businessSide ∈ left/right，businessWidth ∈ 0.25–0.7，越界直接抛错。
 */
export const PANEL = Object.freeze({
  businessSide: 'left',
  businessWidth: 0.65,
  customFrame: false,
});

/** 宿主允许的 businessWidth 区间（源码 client.js 强校验，越界直接抛错） */
export const HOST_LIMITS = Object.freeze({ min: 0.25, max: 0.7 });

/**
 * AI 会话面板的宽度档位（页面内拖动/预设共用这一份，客户端不留第二份数字）。
 *
 * 单位是「占工作区宽度的比例」，区间 25%–45% 取自 20-AGENT-PANE-DESIGN §2 的
 * customFrame 基线：更窄读不了消息，更宽会把业务区压到 55% 以下、三栏卡片提前换行。
 * 注意：**标准分栏（customFrame=false）下宿主不吃这份参数**——宿主只认 businessWidth，
 * 且注册后不再变；这里驱动页面内自绘的会话栏（开发版 dev-server 与将来的 customFrame）。
 */
export const AGENT_PANE = Object.freeze({
  def: 0.35,
  min: 0.25,
  max: 0.45,
  step: 0.02,                                   // 键盘 ←/→ 每次 2%，与拖动精度一致
  presets: Object.freeze({ narrow: 0.25, std: 0.35, wide: 0.45 }),
  narrowBelowPx: 760,                           // 容器窄于此值改覆盖式抽屉
  drawerMaxPx: 420,                             // 抽屉宽度上限
});

/** 把比例夹到 AGENT_PANE 区间；非数字一律回默认值。 */
export function clampAgentRatio(ratio) {
  const r = Number(ratio);
  if (!Number.isFinite(r)) return AGENT_PANE.def;
  return Math.min(AGENT_PANE.max, Math.max(AGENT_PANE.min, r));
}

/** 业务区像素宽度：宿主给的比例 × 窗口宽度。1440 → 936，1280 → 832。 */
export function businessPanePx(windowWidth, width = PANEL.businessWidth) {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) throw new TypeError('windowWidth 必须是正数');
  const ratio = width === undefined ? PANEL.businessWidth : width;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new TypeError('width 必须是正数');
  return Math.round(windowWidth * ratio);
}

/**
 * 自检：返回问题清单，空数组表示合法。参数可注入，便于单测覆盖越界情形。
 * 只查宿主真正会校验的那几项——多查一条，就多一处"代码说不行、宿主说行"的漂移。
 */
export function assertPanelConfig(config = PANEL, agent = AGENT_PANE) {
  const problems = [];
  if (!config || typeof config !== 'object') return ['面板配置必须是对象'];

  if (!['left', 'right'].includes(config.businessSide)) {
    problems.push(`businessSide 只能是 left/right，当前 ${config.businessSide}`);
  }
  if (typeof config.customFrame !== 'boolean') {
    problems.push(`customFrame 必须是布尔值，当前 ${config.customFrame}`);
  }

  const w = config.businessWidth;
  if (!(typeof w === 'number' && Number.isFinite(w) && w >= HOST_LIMITS.min && w <= HOST_LIMITS.max)) {
    problems.push(`businessWidth 必须在 ${HOST_LIMITS.min}–${HOST_LIMITS.max} 之间，当前 ${w}`);
  } else if (w === HOST_LIMITS.max) {
    problems.push('businessWidth 不得取上限 0.7：贴到上限会把会话区压到 0.3 以下，本项目不这么做');
  }

  if (!(agent.min >= 0.1 && agent.max <= 0.6 && agent.min < agent.max)) {
    problems.push(`AGENT_PANE 区间不合理：${agent.min}–${agent.max}`);
  }
  if (!(agent.def >= agent.min && agent.def <= agent.max)) {
    problems.push(`AGENT_PANE.def 必须落在 ${agent.min}–${agent.max} 之间，当前 ${agent.def}`);
  }
  if (!(agent.step > 0 && agent.step <= (agent.max - agent.min) / 2)) {
    problems.push(`AGENT_PANE.step 过大或非法：${agent.step}`);
  }
  // 业务区与会话宽度互补：这条松了，默认打开的观感就会偏离 65/35 的实测基线
  if (Math.abs((1 - agent.def) - w) > 1e-9) {
    problems.push(`businessWidth(${w}) 与 AGENT_PANE.def(${agent.def}) 应互补：1 - ${agent.def} = ${1 - agent.def}`);
  }
  return problems;
}

