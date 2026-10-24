/* public/ 与 prototypes/v0.2/ 的 UI parity 测试（零依赖，node --test）。
   做法：同一份数据（prototypes/v0.2/demo-data.js）分别喂给原型 app.js 与 public/app.js，
   两边都用 new Function(src + 导出语句)() 在最小 DOM shim 里跑起来，
   然后按「12 个一级视图 × 2 个档案 × 每个二级页签」逐个 render() 后比对 #main 的 HTML 字符串。
   差异只允许来自下面 WHITELIST 里明确记录的项（命中会在结尾打印），其它任何不等都算失败。

   与食管癌那一版的差异：ATTR 原型的视图分发是一个 switch（renderPage()），没有 VIEWS 映射表，
   所以这里比对的是 render() 之后 #main 的 innerHTML，而不是 VIEWS[view]() 的返回值。

   ⚠️ shim 是全局单份：app.js 里的 `document` 在调用时才从全局取，所以**同时只能有一个活实例**
   对着当前 shim。需要两份并存时，先把先渲染的那份 HTML 取成字符串，再换 shim。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROTO_DIR = path.join(ROOT, 'prototypes', 'v0.2');
const PUBLIC_DIR = path.join(ROOT, 'public');
const read = (p) => readFileSync(p, 'utf8');

/* ---------------- 数据：JSON.parse 一份 demo-data.js，两边共用 ---------------- */
const demoSrc = read(path.join(PROTO_DIR, 'demo-data.js'));
const DEMO = (() => {
  const w = {};
  (new Function('window', demoSrc))(w);
  return w.DEMO_DATA;
})();
const BOOTSTRAP_OK = {
  version: '0.1.0', build: '2026-10-21', meta: DEMO.meta, profiles: DEMO.profiles, trials: DEMO.trials,
  agent: { available: true, mode: 'dev-mount' },
  layout: { agentPane: { def: 0.35, min: 0.25, max: 0.45, step: 0.02, presets: { narrow: 0.25, std: 0.35, wide: 0.45 } } },
};

/* ---------------- 最小 DOM shim ---------------- */
function mkEl() {
  return {
    innerHTML: '', textContent: '', value: '', hidden: false, open: false, files: [],
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    setAttribute() {}, getAttribute() { return 'false'; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    focus() {}, click() {}, showModal() {}, close() {},
    closest() { return null; }, matches() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    nextElementSibling: null
  };
}
/* 每次执行 app.js 前装一套新的 shim；返回元素表，便于断言 #main 渲染结果 */
function installShim({ hash = '', demoData = null, fetchImpl = null, innerWidth = 1280 } = {}) {
  const els = new Map();
  const document = {
    querySelector(s) { if (!els.has(s)) els.set(s, mkEl()); return els.get(s); },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    getElementById(id) { return this.querySelector('#' + id); },
    createElement: mkEl,
    /* 原型在顶层与 setFont 里都会写 documentElement.style，shim 必须给出这两个对象 */
    documentElement: { style: { setProperty() {}, removeProperty() {} } },
    body: { classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } } }
  };
  const window = { addEventListener() {}, scrollTo() {}, innerWidth, matchMedia: undefined };
  if (demoData) window.DEMO_DATA = demoData;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.location = { hash };
  globalThis.fetch = fetchImpl;          // 显式给/不给，避免误用 Node 自带 fetch 走真实网络
  return { els, window, document };
}

/* 用 new Function(src)() 执行一份 app.js；src 末尾追加导出语句把内部作用域的东西带出来 */
const EXPORT_LINE =
  '\n;globalThis.__EXPORT = { PAGES, SUBPAGES, state, PROFILES, TRIALS, D, APP_INFO, render };';
const EXPORT_LINE_DEV = EXPORT_LINE.replace(
  'render };',
  'render, bootReady, loadBootstrap, buildData, init };'
);
function runApp(srcPath, exportLine) {
  delete globalThis.__EXPORT;
  new Function(read(srcPath) + exportLine)();
  const T = globalThis.__EXPORT;
  assert.ok(T && T.render, `${srcPath}: 没拿到 render 导出`);
  return T;
}

/* 装 shim + 跑一份 app.js，把 #main 元素一并交出去（换 shim 后旧引用仍指向旧元素） */
function loadProto() {
  const shim = installShim({ demoData: DEMO });
  const T = runApp(path.join(PROTO_DIR, 'app.js'), EXPORT_LINE);
  return { T, main: shim.els.get('#main') };
}
function loadDev(fetchImpl) {
  const shim = installShim({ fetchImpl });
  const T = runApp(path.join(PUBLIC_DIR, 'app.js'), EXPORT_LINE_DEV);
  return { T, main: shim.els.get('#main'), ready: T.bootReady };
}

/* ---------------- 白名单：只有这里列出的差异允许被放行 ----------------
   每条都写明理由；命中次数会在测试结尾打印，方便日后核对是否还在需要。 */
const WHITELIST = [
  {
    name: '资产路径前缀',
    reason: '原型是裸相对路径，开发版可能带 public/ 或 CDN 前缀；两边归一到 assets/ 再比。',
    apply: (s) => s.replace(/(src|href)="(?:[^"]*?\/)?assets\//g, '$1="assets/')
  },
  {
    name: '版本号文本',
    reason: '开发版版本号由 GET /api/bootstrap 下发（并写回 #ver-chip / #app-version），原型是写死的 v0.1.0；归一后再比。',
    apply: (s) => s.replace(/v\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.]+)?/g, 'vX.Y.Z')
  },
  {
    /* 开发版会在原型页面上追加交互（录入表单、写入按钮…），原型是冻结快照不会跟着长。
       这些节点一律带 data-dev-only 标记，比对时整块摘掉——放行的是"开发版多出来的"，
       不是"开发版改坏了的"：原型原有的任何字符变化仍会在这里之外被抓到。 */
    name: '开发版新增节点（data-dev-only）',
    reason: '原型已冻结；开发版新增的录入表单等交互带 data-dev-only 标记，比对时摘除。',
    /* 连前置空白一起吃：模板里表单独占一行，只摘 <form>…</form> 会留下一个换行 + 缩进，
       比对就挂在"多了一个空白"上，而不是真差异。 */
    apply: (s) => s.replace(/[ \t\r\n]*<form[^>]*\bdata-dev-only\b[^>]*>[\s\S]*?<\/form>/g, '')
  },
  {
    /* 导入链路的界面是整块新增的（上传表单、解析状态、带单位与「不要」的候选表）。
       用注释包裹而不是属性：区块里有嵌套 div，按标签配对的正则会截在第一个 </div> 上。
       放行范围严格限制在注释之间；注释外的任何字符变化仍会被抓到。 */
    name: '开发版新增区块（dev-only 注释）',
    reason: '导入链路的界面原型里没有；新增部分用 <!--dev-only--> 包裹，比对时整块摘除。',
    apply: (s) => s.replace(/[ \t\r\n]*<!--dev-only-->[\s\S]*?<!--\/dev-only-->/g, '')
  },
  {
    /* 核对页那张只读表被升级成可操作列表（带单位、「不要」、手填入口）。
       原型那张表只有「字段/值/来源/状态/确认」，开发版不再渲染它，
       因此这里把原型侧那块 card 摘掉——摘的是"原型独有"，不是"开发版改坏"。 */
    name: '候选核对表（原型只读版 → 开发版可操作版）',
    reason: '原型候选表只读且无单位；开发版换成可操作列表，原型侧那张 card 整块摘除后比其余部分。',
    apply: (s) => s.replace(/[ \t\r\n]*<section class="card">\s*<div class="card-head">[\s\S]{0,200}?候选字段[\s\S]*?<\/section>/g, '')
  },
  {
    /* 0.4.0 在「生活与照护」下新增一个页签。原型快照冻结在 v0.1.0（D37），不跟着长，
       所以页签栏会多出一个按钮。只摘这一个按钮：其余任何字符变化仍会被抓到。 */
    name: '新增页签：情绪与照护者',
    reason: '原型冻结在 v0.1.0（D37）不新增页签；开发版页签栏多出的这一个按钮比对时摘除，页内三个区块走 ⑪ 单独断言。',
    apply: (s) => s.replace(/<button role="tab" data-sub="情绪与照护者"[^>]*>情绪与照护者<\/button>/g, '')
  }
];
const whitelistHits = new Map();
function normalize(html) {
  let out = html;
  for (const w of WHITELIST) {
    const next = w.apply(out);
    if (next !== out) whitelistHits.set(w.name, (whitelistHits.get(w.name) || 0) + 1);
    out = next;
  }
  return out;
}
function firstDiff(a, b) {
  if (a === b) return null;
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return { at: i, proto: a.slice(Math.max(0, i - 80), i + 160), pub: b.slice(Math.max(0, i - 80), i + 160) };
}

/* 两边在完全相同的 state 下渲染：把 state 复位成原型初始值，再设 profile / view / sub */
const BASE_STATE = () => ({
  view: 'dashboard', profile: 'A', agentPhase: 'idle', agentSize: 'std', agentRatio: 0.35,
  sel: ['ntprobnp', 'egfr', 'nyha'], flip: '', sub: {}
});
function setState(T, { profile, view, sub }) {
  Object.assign(T.state, BASE_STATE());
  T.state.profile = profile;
  T.state.view = view;
  if (sub != null) T.state.sub[view] = sub;
}
/** 渲染并取出 #main 的内容（ATTR 原型的视图分发是 renderPage() 里的 switch，没有 VIEWS 映射表） */
function renderMain(T) {
  T.render();
  return globalThis.document.querySelector('#main').innerHTML;
}

/* ---------------- 加载两边 ---------------- */
const okFetch = async (url) => {
  assert.equal(url, '/api/bootstrap');
  return { ok: true, status: 200, json: async () => BOOTSTRAP_OK };
};

const proto = loadProto();
const dev = loadDev(okFetch);
await dev.ready;                            // 等 bootstrap → buildData → init 完成

/* ATTR：12 个一级视图（SPEC §4），其中 11 个有二级页签（dashboard 没有）。
   这里列的是 SUBPAGES 里有二级页签的全部视图。 */
const SUB_VIEWS = ['records', 'subtype', 'treatment', 'cardiac', 'nerve', 'labs', 'timeline', 'family', 'life', 'review', 'trials'];
const VIEW_IDS = proto.T.PAGES.map((p) => p[0]);

test('① 视图 HTML 逐字符一致：12 视图 × 2 档案 × 每个二级页签', async (t) => {
  assert.equal(VIEW_IDS.length, 12, `PAGES 应有 12 个一级视图（SPEC §4），实际 ${VIEW_IDS.length}`);
  assert.deepEqual(VIEW_IDS, dev.T.PAGES.map((p) => p[0]), '两边 PAGES 的键集合必须一致');
  assert.deepEqual(Object.keys(proto.T.SUBPAGES).sort(), Object.keys(dev.T.SUBPAGES).sort(), '两边 SUBPAGES 键集合必须一致');
  let cases = 0;
  for (const profile of ['A', 'B']) {
    for (const view of VIEW_IDS) {
      // ATTR 原型的 state.sub 存的是页签标签（不是索引）：curSub() 用 subs.includes(want) 校验，
      // 视图函数全部按标签字符串分支。传索引会让所有页签都落到兜底分支，比对变成假通过。
      const subs = proto.T.SUBPAGES[view] ? proto.T.SUBPAGES[view] : [null];
      for (const sub of subs) {
        setState(proto.T, { profile, view, sub });
        setState(dev.T, { profile, view, sub });
        const label = `${profile}/${view}/${sub || 'main'}`;
        let a, b;
        try {
          a = renderMain(proto.T);
          b = renderMain(dev.T);
        } catch (e) {
          assert.fail(`${label}: 渲染抛错 ${e.message}`);
        }
        assert.ok(a && a.length > 200, `${label}: 原型渲染过短（${a && a.length}）`);
        cases += 1;
        if (a === b) continue;                       // 完全相同，直接过
        const na = normalize(a), nb = normalize(b);  // 命中白名单的差异放行
        if (na === nb) continue;
        const d = firstDiff(na, nb);
        assert.strictEqual(nb, na, `${label}: HTML 不一致 @${d.at}\n原型: …${d.proto}…\n开发: …${d.pub}…`);
      }
    }
  }
  t.diagnostic(`比对 ${cases} 组（2 档案 × 12 视图 × 各二级页签）`);
  assert.ok(cases >= 12 * 2, '比对组数不足');
});

test('② 二级页签视图的 11 个分流视图各自独立（顺带确认页签真的分流了）', () => {
  for (const view of SUB_VIEWS) {
    for (const profile of ['A', 'B']) {
      const seen = new Set();
      proto.T.SUBPAGES[view].forEach((label) => {
        setState(proto.T, { profile, view, sub: label });
        setState(dev.T, { profile, view, sub: label });
        const a = renderMain(proto.T), b = renderMain(dev.T);
        assert.strictEqual(normalize(b), normalize(a), `${profile}/${view}/${label} 分流内容不一致`);
        seen.add(a);
      });
      assert.ok(seen.size > 1, `${profile}/${view}: 各页签内容应当互不相同`);
    }
  }
});

test('③ public/index.html 含 app.js 用到的全部 DOM id', () => {
  const html = read(path.join(PUBLIC_DIR, 'index.html'));
  const appSrc = read(path.join(PUBLIC_DIR, 'app.js'));
  const ids = new Set([
    // 交付清单点名要求保留的 id
    'nav', 'main', 'breadcrumb', 'profile-name', 'profile-meta', 'profile-avatar', 'work-grid',
    'agent-dock', 'agent-dot', 'agent-body', 'agent-toggle',
    // 顶栏三段式（参照 prompts/DSH-WORKBENCH-TOP-BAR.md）：版本 chip 归左区、说明归中区、
    // 主按钮标签 #agent-label 与「×」#agent-hide 归右区；原型那个 #agent-state（按钮内的状态字）
    // 已由中区说明 #top-hint 取代，故不再列入骨架。
    'agent-label', 'agent-hide', 'top-hint',
    'dialog', 'toast', 'font-toggle', 'ver-chip'
  ]);
  for (const m of appSrc.matchAll(/\$\('#([A-Za-z0-9_-]+)'/g)) ids.add(m[1]);      // $('#id')
  for (const m of appSrc.matchAll(/getElementById\('([A-Za-z0-9_-]+)'/g)) ids.add(m[1]);
  // app.js 自己吐在 HTML 里的 id（#docs-table / #file-picker …）属于运行时节点，
  // 不该出现在骨架里；骨架只负责 §交付清单 点名 + app.js 直接查询的静态节点。
  const runtimeIds = new Set([...appSrc.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
  const skeletonIds = [...ids].filter((id) => !runtimeIds.has(id));
  const missing = skeletonIds.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `index.html 缺少这些 id: ${missing.join(', ')}`);
  assert.ok(skeletonIds.length >= 16, `静态 id 太少（${skeletonIds.length}），提取逻辑可能失效`);
  assert.ok(html.includes('name="robots"') && html.includes('noindex'), 'index.html 需要 meta robots noindex');
  assert.ok(/<script src="app\.js" defer><\/script>/.test(html), 'app.js 需以普通脚本 + defer 引入');
  assert.ok(!/<script[^>]*demo-data\.js/.test(html), '开发版不应再引 demo-data.js');
  assert.ok(html.includes('data-size="narrow"') && html.includes('data-size="std"') && html.includes('data-size="wide"'), 'AI 面板窄/标准/宽三档按钮需在骨架里');
});

test('④ public/style.css：字号变量 / [hidden] 规则 / 原型提示条停用', () => {
  const css = read(path.join(PUBLIC_DIR, 'style.css'));
  const protoCss = read(path.join(PROTO_DIR, 'style.css'));
  assert.match(css, /--font:\s*calc\(15px \* var\(--tz\)\)/, '基础字号变量应与原型一致（15px × --tz 倍率）');
  assert.match(css, /body\.large\{--font:\s*calc\(15px/, '大字模式规则应在');
  assert.match(css, /\[hidden\]\{display:none\s*!important\}/, '必须有 [hidden] 强制隐藏规则');
  assert.match(css, /\.prototype-bar[^{]*\{display:none\s*!important\}/, '原型提示条需停用');
  // 除上面几处外，其余规则应与原型逐行一致（先剥注释，再忽略被允许改动的行）
  const lines = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map((l) => l.trim()).filter((l) => l && !/--font:|body\.large|prototype-bar/.test(l));
  assert.deepEqual(lines(css), lines(protoCss), 'style.css 除字号变量与原型提示条外，规则应与原型一致');
});

test('⑤ bootstrap 成功路径：用接口数据渲染（不依赖 window.DEMO_DATA）', () => {
  setState(dev.T, { profile: 'A', view: 'dashboard', sub: null });
  const mainHtml = renderMain(dev.T);
  assert.ok(mainHtml.length > 500, '首屏应渲染出内容');
  assert.ok(mainHtml.includes('四个数，先看这四个'), '看板应含指标卡分区');
  assert.equal(dev.T.APP_INFO.version, '0.1.0');
  assert.ok(!mainHtml.includes('没能载入工作台数据'), '成功路径不应出现错误态');
});

test('⑥ bootstrap 失败 + window.DEMO_DATA 存在：走回退路径仍能渲染', async () => {
  const shim = installShim({
    demoData: DEMO,
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1'); }
  });
  const T = runApp(path.join(PUBLIC_DIR, 'app.js'), EXPORT_LINE_DEV);
  await T.bootReady;
  assert.equal(T.APP_INFO.dataSource, 'demo-fallback', '应标记走了演示数据回退');
  setState(T, { profile: 'B', view: 'subtype', sub: 0 });
  const devHtml = renderMain(T);
  assert.ok(!devHtml.includes('没能载入工作台数据'), '有 DEMO_DATA 回退时不该进入错误态');
  assert.ok(devHtml.includes('四个数，先看这四个') || devHtml.includes('型别与基因'), `回退路径应正常渲染，实际：${devHtml.slice(0, 120)}`);
  // 回退数据与原型数据渲染结果一致（先取成字符串，再换 shim 跑原型）
  const p2 = loadProto();
  setState(p2.T, { profile: 'B', view: 'subtype', sub: 0 });
  assert.strictEqual(normalize(devHtml), normalize(renderMain(p2.T)), '回退路径下视图内容应与原型一致');
});

test('⑦ bootstrap 失败且无 DEMO_DATA：#main 给出明确错误说明，不白屏', async () => {
  const shim = installShim({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  const realErr = console.error; console.error = () => {};   // 这条路径必然打 error，测试输出里静音
  const T = runApp(path.join(PUBLIC_DIR, 'app.js'), EXPORT_LINE_DEV);
  await T.bootReady;
  console.error = realErr;
  const html = shim.els.get('#main').innerHTML;
  assert.ok(html.includes('没能载入工作台数据'), `应渲染错误说明，实际：${html.slice(0, 160)}`);
  assert.ok(html.includes('/api/bootstrap'), '错误说明里要点明接口');
  assert.ok(html.length > 200, '错误态也不能是空的');
});

/* 顶栏三段式 + AI 按钮五态：逐条对照 prompts/DSH-WORKBENCH-TOP-BAR.md 的硬约束。
   目的：把「顶栏结构」从肉眼检查变成断言——左区不许出现按钮、中区必须 flex:1、
   按钮组必须 margin-left:auto、五态文案一个都不能自造。 */
test('⑧ 顶栏三段式、AI 按钮五态与面板宽度（对照 DSH-WORKBENCH-TOP-BAR / 20-AGENT-PANE-DESIGN）', () => {
  const html = read(path.join(PUBLIC_DIR, 'index.html'));
  const css = read(path.join(PUBLIC_DIR, 'shell.css'));
  const app = read(path.join(PUBLIC_DIR, 'app.js'));

  // 1) 三段顺序：品牌区 → 说明 → 操作组
  const iBrand = html.indexOf('tb-brand'), iHint = html.indexOf('tb-hint'), iAct = html.indexOf('tb-actions');
  assert.ok(iBrand > 0 && iHint > iBrand && iAct > iHint, '顶栏三段顺序必须是 品牌 → 说明 → 操作组');

  // 2) 左区只放定位信息：版本 chip 在左区、且左区里没有按钮（版本 chip 本身除外）
  const leftBlock = html.slice(iBrand, iHint);
  assert.ok(leftBlock.includes('id="ver-chip"'), '版本 chip 必须在左区（品牌右侧）');
  assert.ok(!/<button(?![^>]*ver-chip)/.test(leftBlock), '左区不许放操作按钮（会被 macOS 窗口按钮挤到）');

  // 3) 中区：一句说明，flex:1 + min-width；右区：按钮组 margin-left:auto 贴右缘
  assert.match(css, /\.tb-hint\{[^}]*flex:1/, '中区说明必须 flex:1（吃掉中间空白）');
  assert.match(css, /\.tb-hint\{[^}]*min-width:200px/, '中区说明要有 min-width，防被压成竖排');
  assert.match(css, /\.tb-actions\{[^}]*margin-left:auto/, '按钮组必须 margin-left:auto 贴右缘');
  assert.match(css, /\.tb-actions\{[^}]*flex:0 0 auto/, '按钮组不许被说明文字挤碎（flex:0 0 auto）');

  // 4) 主按钮是这一条唯一的强色块：用品牌主色，且禁用态不能还是主色
  assert.match(css, /\.tb-agent\{[^}]*background:var\(--violet\)/, '主按钮用品牌主色（--violet #2e6e7e）');
  assert.match(css, /\.tb-agent:disabled\{[^}]*background:#eef2f7/, '禁用态要退回中性灰，不能仍是强色块');
  assert.ok(!/\.topbar\{[^}]*background:var\(--violet\)/.test(css), '顶栏底不许铺品牌主色（色带不能抢）');

  // 5) 五态文案与按钮表逐字一致，一个都不能自造
  for (const label of ['AI 对话', '正在连接…', '收起 AI 对话', '打开 AI 对话', 'AI 对话暂不可用']) {
    assert.ok(app.includes(`'${label}'`) || app.includes(`"${label}"`), `缺少按钮文案：${label}`);
  }
  for (const ph of ['idle', 'connecting', 'open', 'closed', 'unavailable']) {
    assert.ok(app.includes(`${ph}:`), `状态机缺少状态：${ph}`);
  }

  // 6) 「×」有 aria-label；连接中与不可用两态要禁用按钮（防重复创建 / 说明降级）
  assert.match(html, /id="agent-hide"[^>]*aria-label="[^"]+"/, '「×」必须带 aria-label');
  assert.match(app, /btn\.disabled\s*=\s*\(ph === 'connecting' \|\| ph === 'unavailable'\)/,
    '连接中与不可用两态必须禁用主按钮');

  // 7) 收起 ≠ 结束会话：状态机里 open → closed 只切显隐
  assert.match(app, /if \(ph === 'open'\) \{ state\.agentPhase = 'closed'; renderAgent\(\); return; \}/,
    '展开态点主按钮应转为 closed（只收起，不结束会话）');

  // 8) 面板宽度可调：分隔条存在、有 role=separator 与数值区间，宽度来自 lib/layout.js 单一来源
  assert.match(html, /id="agent-splitter"[^>]*role="separator"[^>]*aria-valuemin="25"[^>]*aria-valuemax="45"/,
    '分隔条必须 role=separator 且 aria-valuemin/max 为 25/45');
  assert.match(html, /id="agent-splitter"[^>]*tabindex="0"/, '分隔条要能被键盘聚焦');
  assert.match(css, /\.work-grid\.agent-open\{grid-template-columns:minmax\(0,1fr\) 10px var\(--agent-w/,
    '展开态必须是三列：业务区 | 分隔条 | 面板（宽度用 --agent-w）');
  assert.match(app, /let AGENT_PANE = \{ min: 0\.25, max: 0\.45, def: 0\.35/, '客户端兜底区间要与 lib/layout.js 一致');
  assert.match(app, /state\.agentRatio/, '宽度要按比例存在 state 里，不能写死像素');
  assert.match(app, /localStorage\.setItem\(AGENT_STORE_KEY/, '宽度要记忆（下次打开同一档）');
  assert.match(app, /addEventListener\('pointerdown'/, '分隔条要能鼠标拖动');
  assert.match(app, /e\.key === 'ArrowLeft'[\s\S]{0,240}e\.key === 'ArrowRight'/, '分隔条要支持 ←/→ 键盘调宽');
  // 布局参数唯一来源：lib/layout.js 里的区间下限/上限与客户端兜底一致
  const layoutSrc = read(path.join(ROOT, 'lib', 'layout.js'));
  assert.match(layoutSrc, /export const AGENT_PANE/, 'lib/layout.js 必须导出 AGENT_PANE（唯一来源）');
  assert.match(layoutSrc, /min: 0\.25,\s*\n\s*max: 0\.45,/, 'lib/layout.js 的区间应为 0.25–0.45');
});

test('⑨ 客户端注册参数与 lib/layout.js 同源、UI 前缀与 dsh/index.js 一致', () => {
  const client = read(path.join(ROOT, 'lib', 'client.js'));
  const layoutSrc = read(path.join(ROOT, 'lib', 'layout.js'));
  const indexSrc = read(path.join(ROOT, 'dsh', 'index.js'));
  const appSrc = read(path.join(PUBLIC_DIR, 'app.js'));

  // 1) 宿主注册的三个参数，客户端字面量必须等于 lib/layout.js 的 PANEL
  const panel = layoutSrc.slice(layoutSrc.indexOf('export const PANEL'), layoutSrc.indexOf('export const HOST_LIMITS'));
  const side = panel.match(/businessSide:\s*'([a-z]+)'/)?.[1];
  const width = panel.match(/businessWidth:\s*([\d.]+)/)?.[1];
  const custom = panel.match(/customFrame:\s*(true|false)/)?.[1];
  assert.ok(side && width && custom, 'lib/layout.js 的 PANEL 必须写全三项');
  assert.match(client, new RegExp(`businessSide:\\s*'${side}'`), `客户端 businessSide 必须等于 ${side}`);
  assert.match(client, new RegExp(`businessWidth:\\s*${width.replace('.', '\\.')}`), `客户端 businessWidth 必须等于 ${width}`);
  assert.match(client, new RegExp(`customFrame:\\s*${custom}`), `客户端 customFrame 必须等于 ${custom}`);

  // 2) 接口前缀只在 dsh/index.js 写一次，前端按同一份约定推基址
  const apiPrefix = indexSrc.match(/export const API_PREFIX = '([^']+)'/)?.[1];
  assert.ok(apiPrefix, 'dsh/index.js 必须导出 API_PREFIX');
  assert.match(indexSrc, /const UI_PREFIX = `\$\{API_PREFIX\}\/ui`/, 'UI 前缀必须由 API 前缀拼出来');
  assert.ok(appSrc.includes(`'${apiPrefix}/ui'`), `public/app.js 的 apiBase() 必须认 ${apiPrefix}/ui`);
  assert.ok(client.includes(`${apiPrefix}/ui/index.html`), '客户端 iframe 必须指向本包自己的 UI 前缀');
});

test('⑩ 原型导出在 shim 里不抛错，看板入口卡仍在', () => {
  const p3 = loadProto();
  setState(p3.T, { profile: 'A', view: 'dashboard', sub: null });
  assert.ok(p3.T.render() === undefined);
  assert.ok(renderMain(p3.T).includes('看两条线'), '看板入口卡仍在');
});

/* ⑪ 0.4.0 的两处「开发版先行」：原型冻结（D37）不跟着加，所以不能靠 ① 的逐字符比对兜住，
   单独断言它们真的在、且该有的边界话都说到了。 */
test('⑪ 开发版新增：情绪与照护者页签 + 确诊路径指南出处卡', () => {
  // 1) 页签在，且排在「活动与康复」之后；原型快照里必须没有
  assert.deepEqual(dev.T.SUBPAGES.life, ['饮食与体重', '活动与康复', '情绪与照护者', '出行与资源'],
    '「生活与照护」的页签顺序变了');
  assert.ok(!proto.T.SUBPAGES.life.includes('情绪与照护者'),
    '原型快照不得新增页签（D37：UI 以 v0.1.0 原型为准，开发版先行）');

  // 2) 三个区块都在；照护者那块要写明「缺哪张表」，不能编一个空表冒充
  setState(dev.T, { profile: 'A', view: 'life', sub: '情绪与照护者' });
  const html = renderMain(dev.T);
  assert.ok(html.includes('你写下的'), '要渲染已记录的原话');
  assert.ok(html.includes('三个常被记下来的时刻'), '要有「什么时候记」的提示区');
  assert.ok(html.includes('caregiver_rows'), '缺表要写明缺哪一张，不能假装有');
  assert.ok(html.includes('这一块还没有位置'), '照护者区要明确标注未引入');
  assert.ok(!/量表|评分|得分|焦虑自评/.test(html), '心理页不许出现量表打分');
  // 情绪记录必须来自 viewpoints（d / mood / text），页面里要能看到原话与日期
  const vp = dev.T.PROFILES.A.viewpoints[0];
  assert.ok(html.includes(vp[1]) && html.includes(vp[2]), `情绪记录应原样呈现，实际缺：${vp[1]}`);

  // 3) 出处卡：机构 + 卷期页 + DOI 三样齐全，且整块带 dev-only 标记
  setState(dev.T, { profile: 'A', view: 'subtype', sub: '确诊路径' });
  const diag = renderMain(dev.T);
  assert.ok(diag.includes('<!--dev-only-->') && diag.includes('<!--/dev-only-->'), '出处卡必须整块 dev-only 包裹');
  assert.ok(diag.includes('中华医学会心血管病学分会心力衰竭学组'), '出处要写机构');
  assert.ok(diag.includes('中华心血管病杂志 2021;49(4):324-332'), '出处要写卷期页');
  assert.ok(diag.includes('10.3760/cma.j.cn112148-20201217-00993'), '出处要写 DOI');
  assert.ok(diag.includes('两套并列'), '口径差异要并列标出，不做取舍');
  assert.ok(!normalize(diag).includes('324-332'), '摘掉 dev-only 后不该残留出处卡（否则白名单放过了别的改动）');
});

test.after(() => {
  const hits = [...whitelistHits.entries()];
  const line = hits.length
    ? hits.map(([n, c]) => `${n}×${c}（${WHITELIST.find((w) => w.name === n).reason}）`).join('；')
    : '无（两边输出完全相同，没有任何差异需要放行）';
  console.log(`\n[parity] 白名单命中：${line}`);
});
