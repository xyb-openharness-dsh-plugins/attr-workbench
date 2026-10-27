'use strict';
/* 开发版 —— 源自 prototypes/v0.2/app.js v0.1.0（定稿原型，勿改那份）。
   逐行迁移，除「数据加载方式」外与原型保持一致；改动点逐条列在下边：
   1) 数据不再从 window.DEMO_DATA 同步读取，改为 loadBootstrap() 异步拉 GET /api/bootstrap
      （返回 {version, build, meta, profiles, trials, agent, layout}），成功后用**原型同一套循环**
       构建 PROFILES / TRIALS；变量名保持 PROFILES / TRIALS / D 不变，所以视图函数一行都不用改。
   2) fetch 失败且存在 window.DEMO_DATA 时回退用它（便于离线比对）；两者都拿不到时在 #main
      渲染明确的错误说明，不白屏。
   3) 初始化改为 loadBootstrap().then(init)（原型是顶层同步 render()）；事件注册仍在顶层。
   4) 仍是普通脚本：没有 import / export / 顶层 await，parity 测试要在 Node 里 new Function(src)() 跑它。
   5) 版本号文本：bootstrap 返回 version/build 时同步到 #ver-chip / #app-version / #app-build。
   6) AI 面板从「布尔开合 + 写死像素」换成五态状态机 + 比例宽度（唯一来源 lib/layout.js，
      经 bootstrap 的 layout.agentPane 下发），分隔条可拖、可键盘调、宽度可记忆。
   7) 0.4.0：新增「生活与照护 → 情绪与照护者」页签（40 → 41），数据只读 viewpoints；
      「我的分型 → 确诊路径」底部补一张指南出处卡，整块用 <!--dev-only--> 包裹，
      parity 测试据此摘除后仍与原型逐字符一致。
      这两处属开发版先行：原型快照冻结在 v0.1.0（D37），原件不动，待原型下次升版合并回去。
   8) 0.5.0：「治疗历程 → 当前方案」底部补第二张出处卡（治疗分类 / 已上市口径 / ATTR-ACT 数字），
      同样 <!--dev-only--> 包裹。卡里并列摆出一处口径冲突：共识写「2020 年 10 月」批准氯苯唑酸，
      而「出行与资源」写「2020-09」，两处都未核到批准文件，故并列待核、不自行择一。
   9) 0.6.0：照护者那一块不再是空位。新建 schema/0004_caregiver.sql（第 30 张表），
      记录位 + 录入表单接上 GET/POST /api/caregiver；数据**不进 bootstrap**
      （bootstrap 的 profiles 必须与原型 demo-data.js 逐字段一致，见 test/store.test.mjs ③）。
      只记照护这件事（谁在照顾你 / 这周最累的一件事 / 能不能替手 / 你需要什么），
      不打分、不判定负担轻重。
   其余：12 个一级视图、41 个二级页签分流、一图秀引擎（单调三次插值 + 双纵轴 + 分类节点只画点）、
   3D 指标卡翻转、上传与候选核对、data-countup 数字滚动、prefers-reduced-motion 降级，
   除上面 1)–9) 外与原型一致。 */

const APP_INFO = {
  version: '0.6.4',
  build: '2026-10-21',
  channel: 'dev',
  channelLabel: '开发版 · 本机优先',
  dataSource: 'api'
};
APP_INFO.displayVersion = `v${APP_INFO.version}`;

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- icons ---------------- */
const icons = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  badge: 'M12 3l7 4v10l-7 4-7-4V7ZM9 12l2 2 4-4',
  drip: 'M12 3v6m0 0a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM7 7h10',
  heart: 'M12 20.3c-4.6-2.9-7.4-5.6-7.4-9A4.1 4.1 0 0 1 12 8.4a4.1 4.1 0 0 1 7.4 2.9c0 3.4-2.8 6.1-7.4 9Z',
  nerve: 'M12 3v5m0 0-4 4m4-4 4 4M8 12l-2 6m10-6 2 6M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 18h4m4 0h4',
  lab: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  chart: 'M4 3v17h17M7 14l4-5 4 3 5-7',
  family: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 21v-2a4 4 0 0 1 4-4m10 6v-2a4 4 0 0 0-4-4m-3 6v-2a3 3 0 0 1 6 0v2',
  leaf: 'M20 4c-9.4 0-15 4.1-15 9.6A5.4 5.4 0 0 0 10.4 19C16 19 20 13.4 20 4ZM5.5 18.6C8 13.4 12 10.6 17 9.6',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2',
  flask: 'M9 3h6v5l5 9a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l5-9Z',
  chat: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-6 5V5ZM8 8h8M8 11h5'
};
const ICON_ALIAS = {
  dashboard: 'home', records: 'folder', subtype: 'badge', treatment: 'drip', cardiac: 'heart',
  nerve: 'nerve', labs: 'lab', timeline: 'chart', family: 'family', life: 'leaf', review: 'calendar', trials: 'flask'
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[k] || icons[ICON_ALIAS[k]] || icons.badge}"/></svg>`;

/* ---------------- 导航 ---------------- */
const PAGES = [
  ['dashboard', '看板', 'home'],
  ['records', '病情整理', 'folder'],
  ['subtype', '我的分型', 'badge'],
  ['treatment', '治疗历程', 'drip'],
  ['cardiac', '心脏受累', 'heart'],
  ['nerve', '神经与自主神经', 'nerve'],
  ['labs', '检查与指标', 'lab'],
  ['timeline', '病情一图秀', 'chart'],
  ['family', '家族与遗传', 'family'],
  ['life', '生活与照护', 'leaf'],
  ['review', '复诊准备', 'calendar'],
  ['trials', '临床研究', 'flask']
];
const SUBPAGES = {
  records: ['资料库', '草稿核对', '病情档案', '指标检测', '病情汇总'],
  subtype: ['型别与基因', '表型与分期', '确诊路径', '会诊与二次意见'],
  treatment: ['当前方案', '用药与耐受', '治疗调整史', '支持治疗'],
  cardiac: ['心衰症状与体征', '心超与影像', '心律与晕厥', '血压与用药耐受'],
  nerve: ['感觉与运动', '自主神经', '腕管与脊柱', '跌倒与安全'],
  labs: ['心脏指标', '肾脏与电解质', '体重与血液', '影像与基因报告'],
  timeline: ['数值曲线', '事件与节点', '数据口径'],
  family: ['家系图', '级联筛查', '遗传咨询记录'],
  life: ['饮食与体重', '活动与康复', '情绪与照护者', '出行与资源'],
  review: ['复诊节奏', '就诊准备', '与医生讨论的问题'],
  trials: ['2026 线索', '已收藏', '入组问题']
};
const SUBTITLES = {
  dashboard: '型别、心脏线、神经线、正在用的药，放在同一屏；下次门诊带什么，也在这里。',
  records: '上传 → 解析 → 核对 → 入库；原件永远保留，接受之前都只是候选。',
  subtype: '野生型与遗传型是两条不同的病，分开建档；基因原文只抄不解读。',
  treatment: '方案按段记录：开始、暂停、停用都留痕，旧方案不覆盖。',
  cardiac: '心脏线用症状、心超、心律与血压四块记录；分期由医生给，工作台不算。',
  nerve: '神经线是自查序列，不是分级；自主神经单独一块，容易被忽略。',
  labs: 'NT-proBNP 与 eGFR 是主线；所有数值按报告原文抄，注明来源。',
  timeline: '两条数值线放回同一段时间里，NYHA 只落在医生写的那次。',
  family: '家系信息默认折叠；成员状态由本人或家属填写，工作台不推断。',
  life: '这一页记"实际怎么过"——吃了什么、走了多久、出门怎么安排；不给食谱也不给处方。',
  review: '该带什么、该问什么，提前写下来，诊室里就不用凭记忆。',
  trials: '线索不是推荐；先弄清登记状态与入组条件，再决定要不要问。'
};

/* ---------------- 数据层（开发版：后端 GET /api/bootstrap；结构与原型 demo-data.js 一致） ----------------
   原型这里是 `const D = window.DEMO_DATA;` + 顶层同步构建；开发版把同样的构建过程收进 buildData()，
   由 loadBootstrap() 拿到数据后再调用。循环体保持原型的原始缩进不重排，便于逐行 diff。
   D / PROFILES / TRIALS 三个名字与原型完全相同（只把 const 改 let），视图函数无需任何改动。 */
/* 接口基址：独立启动（页面在 `/`）是空串；装进 Desktop 后页面在
   `/api/attr/ui/`，接口前缀就是 `/api/attr`。
   约定的名字只在 dsh/index.js 的 API_PREFIX 出现一次，改那边要同步这里。 */
function apiBase() {
  const path = (typeof location !== 'undefined' && location.pathname) || '';
  return path.indexOf('/api/attr/ui') === 0 ? '/api/attr' : '';
}
/**
 * POST JSON 到工作台接口。失败时把服务端给的字段名带出来（校验失败是 400 + field），
 * 界面据此定位输入框，而不是笼统说"保存失败"。
 */
function apiPost(path, body) {
  const endpoint = `${apiBase()}${path}`;
  let p;
  try {
    p = fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) { p = Promise.reject(e); }
  return Promise.resolve(p).then(async (r) => {
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const err = new Error((j && j.message) || `HTTP ${r.status}`);
      err.field = j && j.field;
      err.code = j && j.error;
      throw err;
    }
    return j || {};
  });
}
/* 导出走 GET（只读，没有副作用），与 POST 的 apiPost 分开。 */
function apiGet(path) {
  const endpoint = `${apiBase()}${path}`;
  let p;
  try { p = fetch(endpoint); } catch (e) { p = Promise.reject(e); }
  return Promise.resolve(p).then(async (r) => {
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((j && j.message) || `HTTP ${r.status}`), { code: j && j.error });
    return j || {};
  });
}

/** 写剪贴板：优先异步 API；不可用（旧内核/权限拒）退回 execCommand，仍失败就抛错。 */
async function writeClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('浏览器不允许写入剪贴板');
}

/** 把长文本放进弹窗（复制失败的兜底：让用户手动全选）。 */
function textDialog(title, text) {
  openDialog(title, '小甲宝 ATTR-Pal',
    `<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.7;margin:0">${esc(text)}</pre>`,
    `<button data-action="close">关闭</button>`);
}
/* ---------------- 开发版新增：导入链路（上传 / 解析 / 候选核对） ----------------
   数据从 `/api/import/*` 单独取，不走 bootstrap：bootstrap 的 candidates 是原型形状
   （5 位元组、无单位、无 metricKey），拿它渲染不出「能不能入档、缺不缺单位」。
   两份数据都读同一个库，不存在"两套口径"，只是给不同界面用不同形状。
   界面里的新增节点全部包在 <!--dev-only--> … <!--/dev-only--> 之间：
   parity 测试按注释整块摘除，原型那张只读表不受影响。 */
const IMPORTS = { docs: [], candidates: [], loadedFor: '', loading: false, error: '' };

function refreshImports(force = false) {
  const key = state.profile;
  if (!force && (IMPORTS.loading || IMPORTS.loadedFor === key)) return Promise.resolve();
  IMPORTS.loading = true;
  IMPORTS.error = '';
  return Promise.all([
    apiGet(`/api/import/documents?profile=${encodeURIComponent(key)}`),
    apiGet(`/api/import/candidates?profile=${encodeURIComponent(key)}`),
  ]).then(([d, c]) => {
    /* 拉取期间切换了档案：丢弃过期结果，别把 A 的候选画到 B 上 */
    if (state.profile !== key) return;
    IMPORTS.docs = d.documents || [];
    IMPORTS.candidates = c.candidates || [];
    IMPORTS.loadedFor = key;
  }).catch((err) => {
    IMPORTS.error = (err && err.message) || '读取导入状态失败';
  }).finally(() => {
    IMPORTS.loading = false;
    render();
  });
}

function importBusy(message) {
  if (message) toast(message);
}

/* ---------------- 开发版新增：照护者记录（0004 / 0.6.0） ----------------
   为什么单独取、不进 bootstrap：bootstrap 的 profiles 必须与原型 demo-data.js
   逐字段一致（test/store.test.mjs ③ 是 deepStrictEqual），原型快照冻结在 v0.1.0，
   里面没有 caregiver_rows——多一个键 parity 就红。做法与 /api/import/* 相同：
   同一份库、同一个档案，给这块界面单独一个形状。

   这一块只记「照护这件事」：谁在照顾你、这周最累的一件事、有没有人能替手、你自己需要什么。
   不记照护者的身体、不算负担分数、不判定要不要请护工——那是医生和社工的判断。 */
const CAREGIVER = { rows: [], loadedFor: '', loading: false, error: '' };

function refreshCaregiver(force = false) {
  const key = state.profile;
  if (!force && (CAREGIVER.loading || CAREGIVER.loadedFor === key)) return Promise.resolve();
  CAREGIVER.loading = true;
  CAREGIVER.error = '';
  return apiGet(`/api/caregiver?profile=${encodeURIComponent(key)}`)
    .then((r) => {
      /* 拉取期间换了档案：丢弃过期结果，别把 A 的照护记录画到 B 上 */
      if (state.profile !== key) return;
      CAREGIVER.rows = r.rows || [];
      CAREGIVER.loadedFor = key;
    })
    .catch((err) => { CAREGIVER.error = (err && err.message) || '读取照护记录失败'; })
    .finally(() => {
      CAREGIVER.loading = false;
      render();
    });
}

/** 一条照护记录的展示：空着的格子写「没记」，不写「没有」（空 ≠ 阴性）。 */
function caregiverRowHtml(r) {
  const who = r[1] || r[2] || '未记称呼';
  const rel = r[1] && r[2] ? `${esc(r[1])}（${esc(r[2])}）` : esc(who);
  return `<div class="row"><div><b>${rel}</b>
      <p>${r[3] ? esc(r[3]) : '<span class="muted">这周最累的一件事：没记</span>'}</p>
      <p class="small-note">能不能替手：${r[4] ? esc(r[4]) : '没记'}　·　你需要什么：${r[5] ? esc(r[5]) : '没记'}</p></div>
      <small>${esc(r[0])}</small></div>`;
}

/** 照护者录入表单。与血压表单同一套 dev-entry 样式；同样带 data-dev-only。 */
function caregiverEntryForm() {
  if (state.profile !== 'A' && state.profile !== 'B') return '';
  return `<form class="dev-entry" data-dev-only id="caregiver-form" autocomplete="off">
      <h3>记一条照护情况</h3>
      <div class="dev-entry-row">
        <label>日期<input type="date" name="d" required></label>
        <label>谁在照顾你<input type="text" name="who" maxlength="30" placeholder="称呼即可，如：女儿；可不填"></label>
        <label>关系<select name="relation">
          <option value="">未记</option><option value="配偶">配偶</option><option value="子女">子女</option>
          <option value="父母">父母</option><option value="兄弟姐妹">兄弟姐妹</option>
          <option value="护工">护工</option><option value="其他">其他</option>
        </select></label>
        <label>能不能替手<select name="backup">
          <option value="">没记</option><option value="有">有</option>
          <option value="没有">没有</option><option value="不确定">不确定</option>
        </select></label>
      </div>
      <div class="dev-entry-row">
        <label class="grow">这一周最累的一件事<input type="text" name="burden" maxlength="200" placeholder="原话就行，如：夜里起来三次；可不填"></label>
        <label class="grow">你自己需要什么<input type="text" name="need" maxlength="200" placeholder="如：想有人替我半天；可不填"></label>
      </div>
      <div class="dev-entry-foot">
        <button class="primary" type="submit">记一条</button>
        <span class="small-note">「能不能替手」空着存为「没记」，和明确选「没有」是两件事：前者是没写，后者是你写下的答案。</span>
      </div>
    </form>`;
}

function docStatusTone(status) {
  if (status === '已核对') return 'green';
  if (status === '解析失败') return 'red';
  if (status === '待解析') return 'yellow';
  return '';
}

/** 资料库页的开发版区块：上传 + 需要动作的文档（表格里列的仍是全部资料）。 */
function importPanel() {
  const docs = IMPORTS.docs.filter(d => d.sha256);
  const actionable = docs.filter(d => d.status === '待解析' || d.status === '解析失败');
  const rows = docs.map(d => {
    const job = d.lastJob;
    const err = d.status === '解析失败' && job ? `<div class="small-note">${esc(job.error_code || '')}：${esc((job.error_message || '').slice(0, 160))}</div>` : '';
    const action = d.status === '解析失败'
      ? `<button class="text-button" data-action="parse-doc" data-id="${esc(d.id)}">重试</button>`
      : d.status === '待解析'
        ? `<button class="text-button" data-action="parse-doc" data-id="${esc(d.id)}">解析</button>`
        : `<span class="muted">${d.status === '已核对' ? '已核对' : '待核对'}</span>`;
    return [
      `<b>${esc(d.name)}</b>${d.filePresent ? '' : ' <span class="muted">（原件不在了）</span>'}${err}`,
      esc(d.date || '—'),
      job ? `${esc(job.status)}${job.pages ? ` · ${job.pages} 页` : ''}` : '未解析',
      action,
    ];
  });
  return `<!--dev-only-->
    <form class="dev-entry" id="upload-form" autocomplete="off">
      <h3>放一份报告</h3>
      <div class="dev-entry-row">
        <label class="grow">文件<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.txt" required></label>
        <label>报告日期<input type="date" name="date"></label>
        <label>类型<select name="type">
          <option value="">未分类</option><option value="化验">化验</option><option value="心超">心超</option>
          <option value="核素">核素</option><option value="基因">基因</option><option value="出院小结">出院小结</option>
        </select></label>
      </div>
      <div class="dev-entry-foot">
        <button class="primary" type="submit">上传到资料目录</button>
        <span class="small-note">原件保存在你选的资料目录里；只有你点「解析」时才会把这份文件上传到 mineru.net 云端识别。</span>
      </div>
    </form>
    <section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>解析状态</h2><p>解析失败会保留原件与错误码，可以重试；重试不会清掉之前的记录。</p></div>
        <div><button class="soft" data-action="refresh-cands">刷新</button></div></div>
      ${IMPORTS.error ? notice(`读取失败：${esc(IMPORTS.error)}`, 'warn') : ''}
      ${rows.length ? table(['文件', '日期', '最近一次解析', ''], rows) : `<p class="small-note">还没有导入过报告。${actionable.length ? '' : ''}</p>`}
    </section>
    <!--/dev-only-->`;
}

/** 草稿核对页的开发版区块：带单位、能拒绝、能手填。原型那张只读表由 parity 白名单摘除。 */
function candidatesPanel() {
  const list = IMPORTS.candidates.filter(c => c.status === 'candidate');
  const decided = IMPORTS.candidates.filter(c => c.status !== 'candidate');
  const rows = list.map(c => {
    /* 文本类（结论、分级）本来就没有单位，标「缺单位」等于说这件抄写有问题，是误导。
       单位不一致的提示挂在指标名下面：塞进「值」列会把整张表挤变形（实测）。 */
    const unit = c.unit
      ? esc(c.unit)
      : (c.noteOnly ? '' : '<span class="muted">缺单位</span>');
    const unitNote = c.unitMismatch
      ? `<div class="small-note">单位与常见写法不同：常见是 ${esc(c.unitExpected || '—')}，请核对</div>`
      : '';
    const where = c.noteOnly
      ? pill('暂不纳入趋势', 'yellow')
      : `<button class="text-button" data-action="accept-cand" data-id="${esc(c.id)}">确认入档</button>`;
    return [
      `<b>${esc(c.name)}</b>${c.noteOnly ? '<div class="small-note">报告里有，本工作台没有这一项的趋势位</div>' : ''}${unitNote}`,
      `<b>${esc(c.valueText)}</b> <small>${unit}</small>`,
      esc(c.source || ''),
      esc(c.docDate || '未填日期'),
      `${where} <button class="text-button" data-action="reject-cand" data-id="${esc(c.id)}">不要</button>`,
    ];
  });
  return `<!--dev-only-->
    <section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>待核对（${list.length}）</h2><p>「确认入档」只表示这一行抄写无误，不是医学审核。</p></div>
        <div><button class="soft" data-action="refresh-cands">重新读取</button></div></div>
      ${IMPORTS.error ? notice(`读取失败：${esc(IMPORTS.error)}`, 'warn') : ''}
      ${list.length ? table(['指标', '值', '来源', '日期', ''], rows) : `<p class="small-note">没有待核对的候选。先在「资料库」上传一份报告并点解析。</p>`}
      ${decided.length ? `<p class="small-note">已处理 ${decided.length} 条（接受 ${decided.filter(c => c.status === 'accepted').length}、不要 ${decided.filter(c => c.status === 'rejected').length}）。已接受的如果填错了，请新增一条更正记录，不要删除。</p>` : ''}
    </section>
    <form class="dev-entry" id="manual-form" autocomplete="off">
      <h3>漏了哪一项，手填</h3>
      <div class="dev-entry-row">
        <label>指标<select name="metricKey">
          <option value="ntprobnp">NT-proBNP</option><option value="egfr">eGFR</option>
          <option value="weight">体重</option><option value="nyha">NYHA 心功能</option>
        </select></label>
        <label>值<input type="text" name="valueText" required placeholder="如 980 / III 级"></label>
        <label>单位<input type="text" name="unit" maxlength="24" placeholder="可不填"></label>
      </div>
      <div class="dev-entry-foot">
        <button class="primary" type="submit">加为候选</button>
        <span class="small-note">手填的同样只是候选，确认后才进记录层；日期取这份报告的日期。</span>
      </div>
    </form>
    <!--/dev-only-->`;
}

function loadBootstrap() {
  const fallback = (typeof window !== 'undefined' && window.DEMO_DATA) || null;
  const endpoint = `${apiBase()}/api/bootstrap`;
  let p;
  try { p = fetch(endpoint); } catch (e) { p = Promise.reject(e); }
  return Promise.resolve(p)
    .then((r) => {
      if (!r || r.ok === false) throw new Error('bootstrap 响应不可用' + (r && r.status ? `（HTTP ${r.status}）` : ''));
      return r.json();
    })
    .then((j) => {
      if (!j || !j.profiles) throw new Error('bootstrap 返回缺少 profiles');
      return j;
    })
    .catch((err) => {
      if (fallback) { APP_INFO.dataSource = 'demo-fallback'; return fallback; }
      throw err;
    });
}
let D = null;
let PROFILES = {};
let TRIALS = [];
function buildData(data) {
  D = data;
  for (const [k, p] of Object.entries(D.profiles)) {
  /* 时间序列统一按日期升序（早 → 晚）。演示数据、SQLite、图表三处口径一致：
     末点 = 最新一条；「较上次」= 倒数第二条。曾因数组倒序把末点标签打到最左侧（2026-10-21 修）。 */
  const byDate = (a, b) => String(a.d || a[0] || '').localeCompare(String(b.d || b[0] || ''));
  const sorted = { ...p };
  if (Array.isArray(p.metrics)) sorted.metrics = p.metrics.map(m => ({ ...m, points: [...m.points].sort(byDate) }));
  if (Array.isArray(p.events)) sorted.events = [...p.events].sort(byDate);
    PROFILES[k] = sorted;
  }
  TRIALS = D.trials || [];
  /* 面板宽度参数以接口为准（唯一来源 lib/layout.js）；没给就保留兜底值。 */
  if (D.layout && D.layout.agentPane) {
    AGENT_PANE = { ...AGENT_PANE, ...D.layout.agentPane };
    state.agentRatio = AGENT_PANE.def;
  }
  /* 宿主未提供原生会话时（bootstrap 显式声明 agent.available=false），主按钮进 unavailable 态：
     禁用 + 说明降级原因，绝不自建聊天框（交互合同 20 号：缺位时走剪贴板回退）。 */
  if (D.agent && D.agent.mode === 'host') {
    /* 宿主外壳负责会话：本页不再画第二份（否则右侧会出现两个「AI 对话」，2026-10-24 真机反馈）。
       注意也用 unavailable 态兜住一切"本页不提供会话"的分支，避免两套判断。 */
    state.hosted = true;
    state.agentPhase = 'unavailable';
    if (D.agent.note) AGENT_HINT.unavailable = String(D.agent.note);
  } else if (D.agent && D.agent.available === false) {
    state.agentPhase = 'unavailable';
    if (D.agent.note) AGENT_HINT.unavailable = String(D.agent.note);
  }
  if (D.version) APP_INFO.version = String(D.version);
  if (D.build) APP_INFO.build = String(D.build);
  APP_INFO.displayVersion = `v${APP_INFO.version}`;
}

/* 面板宽度区间来自 bootstrap 的 layout.agentPane（唯一来源 lib/layout.js）；
   接口没给时用同一组数字兜底，保证离线/回退路径也能拖动。 */
/* step 与 lib/layout.js 同义：比例（0.02＝每次 2%），不是像素。
   这里原来写 24（像素语义），键盘分支改用比例后会变成 2400% 直接顶到上限——
   离线兜底路径（没有 bootstrap 下发）与服务端两条路必须同量纲。 */
let AGENT_PANE = { min: 0.25, max: 0.45, def: 0.35, step: 0.02, presets: { narrow: 0.25, std: 0.35, wide: 0.45 } };
const AGENT_STORE_KEY = 'xyb-attr-agent-ratio';
const state = {
  view: 'dashboard',
  sub: {},
  profile: 'A',
  agentPhase: 'idle',
  /* 宿主形态：'host' ＝ 装进 Desktop（customFrame），原生会话由面板外壳排在右侧，
     本页整组会话控件必须收起；'dev-mount' / 缺省 ＝ 本地 dev-server，页面自带挂载位。 */
  hosted: false,
  agentSize: 'std',
  agentRatio: AGENT_PANE.def,
  sel: ['ntprobnp', 'egfr', 'nyha'],
  flip: ''
};
const P = () => PROFILES[state.profile];
const curSub = () => {
  const subs = SUBPAGES[state.view];
  if (!subs) return null;
  const want = state.sub[state.view];
  return subs.includes(want) ? want : subs[0];
};

/* ---------------- 通用渲染件 ---------------- */
function pill(text, tone = '') { return `<span class="pill ${tone}">${esc(text)}</span>`; }
function fmt(v, dec) {
  if (v === null || v === undefined || v === '') return '—';
  return dec === null || dec === undefined ? String(v) : Number(v).toFixed(dec);
}
function table(headers, rows, cls = '') {
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function pageHead(title, desc, actions = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="actions">${actions}</div></div>`;
}
function emptyState(title, text) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}
function card(title, body, { accent = false, wide = false, desc = '', right = '' } = {}) {
  return `<section class="card${accent ? ' accent' : ''}${wide ? ' wide' : ''}">
    ${title ? `<div class="card-head"><div><h2>${esc(title)}</h2>${desc ? `<p>${esc(desc)}</p>` : ''}</div>${right}</div>` : ''}
    ${body}</section>`;
}
function notice(text, tone = '') { return `<div class="notice ${tone}">${text}</div>`; }

/* ---------------- 指标卡（3D 翻转，背面迷你折线） ---------------- */
function sparkline(m, w = 168, h = 58) {
  const pts = m.points.filter(p => p.v_num !== null);
  if (pts.length < 2) return `<p class="na">只有 ${pts.length} 次记录，暂不连线。</p>`;
  const t0 = Date.parse(pts[0].d), t1 = Date.parse(pts[pts.length - 1].d);
  const vs = pts.map(p => p.v_num);
  const vmin = Math.min(...vs), vmax = Math.max(...vs);
  const pad = (vmax - vmin) * 0.18 || Math.max(1, vmax * 0.02);
  const lo = vmin - pad, hi = vmax + pad;
  const x = (d) => 2 + (Date.parse(d) - t0) / (t1 - t0 || 1) * (w - 4);
  const y = (v) => h - 4 - (v - lo) / (hi - lo || 1) * (h - 8);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(p.v_num).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <line class="base" x1="2" y1="${h - 4}" x2="${w - 2}" y2="${h - 4}"/>
    <path class="sp-line" d="${path}" stroke="${m.color}"/>
    <circle class="sp-dot" cx="${x(last.d).toFixed(1)}" cy="${y(last.v_num).toFixed(1)}" r="3" fill="${m.color}"/>
  </svg>
  <div class="spark-labels"><span>${esc(pts[0].d)}</span><span>${esc(last.d)}</span></div>`;
}

function metricCard(m) {
  const pts = m.points;
  const last = pts[pts.length - 1];
  const prev = pts.length > 1 ? pts[pts.length - 2] : null;
  const numeric = m.kind === 'numeric';
  let delta = '';
  if (numeric && prev && last.v_num !== null && prev.v_num !== null) {
    const dv = last.v_num - prev.v_num;
    const sign = dv > 0 ? '+' : '';
    delta = `<div class="delta">较上次 <em>${sign}${fmt(dv, m.dec)}</em> ${esc(m.unit)}</div>`;
  }
  if (!numeric) delta = `<div class="delta">最近记录 <em>${esc(last.v_text)}</em> · ${esc(last.d)}</div>`;
  const staticAttr = numeric ? '' : ' data-static="1"';
  return `<button class="mcard" data-action="flip" data-metric="${m.key}" aria-pressed="${state.flip === m.key}"${staticAttr} aria-label="${esc(m.name)} 指标卡${numeric ? '，点击翻到趋势背面' : '，分类指标不可翻转'}">
    <span class="mcard-inner">
      <span class="mface">
        <span class="cat"><i style="background:${m.color}"></i>${esc(groupLabel(m.cat))}</span>
        <span class="name">${esc(m.name)}</span>
        <span class="val">${numeric ? fmt(last.v_num, m.dec) : esc(last.v_text)}${numeric && m.unit ? `<small>${esc(m.unit)}</small>` : ''}</span>
        ${delta}
        <span class="rec">${esc(last.d)} · ${esc(last.src)}</span>
        <span class="meta"><span class="hint">${numeric ? '点击看趋势' : '分类指标不可翻转'}</span></span>
      </span>
      ${numeric ? `<span class="mface back">
        <span class="name">${esc(m.name)} · 趋势</span>
        <span class="count">${pts.length} 次记录 · ${esc(pts[0].d)} 起</span>
        ${sparkline(m)}
        <span class="foot">${esc(m.note || '')}</span>
      </span>` : '<span class="mface back"><span class="name">分类指标</span><span class="na">分类序列只画节点，不做折线连接。</span></span>'}
    </span>
  </button>`;
}
function groupLabel(g) { return { heart: '心脏', kidney: '肾脏', blood: '体重与血液', neuro: '神经' }[g] || g; }

/* ---------------- 一图秀 ---------------- */
/* ATTR 偏离家族常量一处：CW 980 → 1040，右侧留 86px 标签槽。
   原因：双纵轴（NT-proBNP / eGFR）+ 长单位标签（mL/min/1.73m²），
   980 宽时末点标签只能压在曲线末段上。右纵轴刻度改到数据区内侧右锚定（与左轴对称），
   末点标签挪进右侧槽里。偏离理由登记在 docs/DIFF-MATRIX.md「一图秀偏离」一节。 */
const CH = { CW: 1000, CH: 420, CX0: 62, CX1: 954, CY0: 132, CY1: 366 };

/** 单调三次插值（Fritsch–Carlson）：保证曲线在相邻点之间不越过端点值 */
function smoothPath(pts) {
  const n = pts.length;
  if (n === 1) return `M${pts[0].x} ${pts[0].y}`;
  if (n === 2) return `M${pts[0].x} ${pts[0].y}L${pts[1].x} ${pts[1].y}`;
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
    dy[i] = pts[i + 1].y - pts[i].y;
    m[i] = dy[i] / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  t[n - 1] = m[n - 2];
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i].x + dx[i] / 3, x2 = pts[i + 1].x - dx[i] / 3;
    const y1 = pts[i].y + t[i] * dx[i] / 3, y2 = pts[i + 1].y - t[i + 1] * dx[i] / 3;
    d += `C${x1.toFixed(1)} ${y1.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function renderTimeline(p) {
  const sel = state.sel;
  const numeric = p.metrics.filter(m => sel.includes(m.key) && m.kind === 'numeric');
  const categorical = p.metrics.filter(m => sel.includes(m.key) && m.kind !== 'numeric');
  const t0 = Date.parse(D.meta.windowStart), t1 = Date.parse(D.meta.windowEnd);
  const X = (d) => CH.CX0 + (Date.parse(d) - t0) / (t1 - t0) * (CH.CX1 - CH.CX0);
  const ticks = [];
  for (let i = 0; i <= 4; i++) {
    const ts = t0 + (t1 - t0) * i / 4;
    ticks.push(new Date(ts).toISOString().slice(0, 10));
  }
  const idx = (d) => ticks.findIndex(t => t >= d);
  const grid = ticks.map((t, i) => {
    const x = CH.CX0 + (CH.CX1 - CH.CX0) * i / 4;
    const label = i === 0 ? t.slice(0, 7) : t.slice(5); // 首刻度带年份，其余 MM-DD
    return `<line class="grid" x1="${x}" y1="${CH.CY0}" x2="${x}" y2="${CH.CY1}"/><text class="tick" x="${x}" y="${CH.CY1 + 30}" text-anchor="middle">${label}</text>`;
  }).join('');
  const hgrid = [0, 1, 2, 3].map(i => {
    const y = CH.CY0 + (CH.CY1 - CH.CY0) * i / 3;
    return `<line class="grid" x1="${CH.CX0}" y1="${y}" x2="${CH.CX1}" y2="${y}"/>`;
  }).join('');

  const scales = numeric.map((m, i) => {
    const vals = m.points.map(pt => pt.v_num);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.16 || Math.max(1, hi * 0.03);
    return { m, lo: lo - pad, hi: hi + pad, side: i === 0 ? 'left' : 'right' };
  });
  const Y = (sc, v) => CH.CY1 - (v - sc.lo) / (sc.hi - sc.lo) * (CH.CY1 - CH.CY0);

  let body = '';
  scales.forEach((sc, si) => {
    const pts = sc.m.points.filter(pt => pt.v_num !== null).map(pt => ({ x: X(pt.d), y: Y(sc, pt.v_num), d: pt.d, v: pt.v_num }));
    body += `<path class="line" d="${smoothPath(pts)}" stroke="${sc.m.color}"/>`;
    body += pts.map(pt => `<circle class="pt" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.6" fill="${sc.m.color}"><title>${esc(sc.m.name)} ${fmt(pt.v, sc.m.dec)}${esc(sc.m.unit)} · ${esc(pt.d)}</title></circle>`).join('');
    const axisX = sc.side === 'left' ? CH.CX0 : CH.CX1;
    const anchor = sc.side === 'left' ? 'end' : 'start';
    const off = sc.side === 'left' ? -10 : 10;
    body += [0, 1, 2, 3].map(i => {
      const v = sc.hi - (sc.hi - sc.lo) * i / 3;
      const y = CH.CY0 + (CH.CY1 - CH.CY0) * i / 3;
      return `<text class="tick" x="${axisX + off}" y="${y + 4}" text-anchor="${anchor}" fill="${sc.m.color}">${fmt(v, sc.m.dec)}</text>`;
    }).join('');
  });

  /* 末点标签：每序列只在整体末点标一次；按 y 排序强制 13px 间距；右端左锚定 */
  const labels = scales.map((sc, si) => {
    const pts = sc.m.points.filter(pt => pt.v_num !== null);
    const last = pts[pts.length - 1];
    return { x: X(last.d), y: Y(sc, last.v_num), text: `${fmt(last.v_num, sc.m.dec)}${sc.m.unit && sc.m.unit.length <= 6 ? ' ' + sc.m.unit : ''}`, color: sc.m.color };
  }).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
  for (let i = labels.length - 1; i >= 0; i--) {
    const limit = i === labels.length - 1 ? CH.CY1 + 8 : labels[i + 1].y - 13;
    if (labels[i].y > limit) labels[i].y = limit;
  }
  /* 末点标签放在右侧标签槽（CX1 之外），不再压曲线；槽宽 86px */
  const labelSvg = labels.map(l => {
    const x = CH.CX1 + 36;
    return `<text x="${x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="start" font-size="11" font-weight="600" fill="${l.color}">${esc(l.text)}</text>`;
  }).join('');

  /* 分类节点：NYHA 专用泳道，只画点不连线 */
  let catSvg = '';
  if (categorical.length) {
    const laneY = 104;
    catSvg += `<text class="tick" x="${CH.CX0 - 10}" y="${laneY + 4}" text-anchor="end">NYHA</text>`;
    catSvg += `<line class="grid" x1="${CH.CX0}" y1="${laneY}" x2="${CH.CX1}" y2="${laneY}"/>`;
    categorical.forEach(m => {
      m.points.forEach(pt => {
        const x = X(pt.d);
        catSvg += `<circle class="cat" cx="${x.toFixed(1)}" cy="${laneY}" r="5" fill="${m.color}"><title>${esc(m.name)} ${esc(pt.v_text)} · ${esc(pt.d)} · ${esc(pt.src)}</title></circle>
        <text class="cat-label" x="${x.toFixed(1)}" y="${laneY - 11}" text-anchor="middle" style="fill:${m.color};font-size:11px;font-weight:600">${esc(pt.v_text)}</text>`;
      });
    });
  }

  /* 事件：竖虚线止于 CY0 − 10，不穿数据区 */
  const ev = (p.events || []).map((e, i) => {
    const d = Array.isArray(e) ? e[0] : e.d;
    const label = Array.isArray(e) ? e[1] : e.label;
    const x = X(d);
    if (x < CH.CX0 || x > CH.CX1) return '';
    return `<line x1="${x.toFixed(1)}" y1="${CH.CY0 - 10}" x2="${x.toFixed(1)}" y2="${CH.CY1 - 6}" stroke="#c9d6e4" stroke-width="1" stroke-dasharray="3 4"/>
      <circle cx="${x.toFixed(1)}" cy="${CH.CY1 + 16}" r="8" fill="#eef3f8" stroke="#d5e1ee"/>
      <text x="${x.toFixed(1)}" y="${CH.CY1 + 20}" text-anchor="middle" font-size="9" fill="#6c7c8e">${i + 1}</text>`;
  }).join('');

  const svg = `<svg class="chart" viewBox="0 0 ${CH.CW} ${CH.CH}" role="img" aria-label="NT-proBNP 与 eGFR 趋势，含 NYHA 分类节点与治疗事件">
    ${hgrid}${grid}${ev}${catSvg}
    <line class="axis" x1="${CH.CX0}" y1="${CH.CY1}" x2="${CH.CX1}" y2="${CH.CY1}"/>
    ${body}${labelSvg}
  </svg>`;

  const eventList = (p.events || []).map((e, i) => {
    const d = Array.isArray(e) ? e[0] : e.d;
    const label = Array.isArray(e) ? e[1] : e.label;
    return `<span class="pill grey">${i + 1} · ${esc(d)} ${esc(label)}</span>`;
  }).join(' ');

  const picker = p.metrics.map(m => `<label class="metric-pick"><input type="checkbox" data-action="pick" data-metric="${m.key}" ${sel.includes(m.key) ? 'checked' : ''}>
    <i style="background:${m.color}"></i><span>${esc(m.name)}</span><small>${m.kind === 'numeric' ? m.unit : '分类'}</small></label>`).join('');

  return `<div class="overview">
    <aside class="rail">
      <section><h3>图上放什么</h3><details class="pick" open><summary>已选 ${sel.length} 项<small>最多 3 项</small></summary>
        <div class="metric-list">${picker}</div></details>
        <p class="small-note">数值线最多两条（左右各一条轴）；分类序列只画节点。</p>
      </section>
      <section><h3>时间窗</h3><p class="small-note">${esc(D.meta.windowStart)} → ${esc(D.meta.windowEnd)}（演示固定 6 个月）</p>
      <div class="legend"><span><i style="background:#2e6e7e"></i>NT-proBNP</span><span><i style="background:#9a6410"></i>eGFR</span><span><i style="background:#3a6b7e;border-radius:50%"></i>NYHA 节点</span></div></section>
      <section><h3>怎么读</h3><p class="small-note">两条线各自一条纵轴，刻度颜色与线一致；不要跨轴比较高低。分类节点不连线。</p></section>
    </aside>
    <div class="timeline-main">
      <div class="chart-panel">
        <div class="chart-top"><div><h2>病情一图秀</h2><p class="small-note">${esc(p.name)} · ${esc(p.meta)}</p></div>
          <div class="chips"><button class="chip" data-action="chart-reset">恢复默认</button></div></div>
        <div class="chart-wrap">${svg}</div>
        <div class="chips" style="margin-top:10px">${eventList}</div>
      </div>
      ${renderMetricGroups(p, ['ntprobnp', 'egfr', 'nyha', 'weight'], '指标卡（点击翻到趋势背面）')}
    </div>
  </div>`;
}

function renderMetricGroups(p, keys, title) {
  const list = p.metrics.filter(m => keys.includes(m.key));
  return `<section class="metric-group"><div class="metric-group-head"><h3>${esc(title)}</h3><span>数值卡可翻转；分类卡固定</span></div>
    <div class="metric-grid">${list.map(metricCard).join('')}</div></section>`;
}

/* ---------------- 各页 ---------------- */
/* 36 号 §2.6 看板状态卡：无锚点数据时整卡「待初始化」，天数不手填、不造临床锚点。 */
function statusCard() {
  return `<section class="card status-card" aria-labelledby="status-card-title">
    <span class="status-eyebrow">状态卡 · 待初始化</span>
    <h2 class="status-big" id="status-card-title">待初始化</h2>
    <p class="status-line">尚无锚点日；完成三步初始化后自动派生。</p>
    <p class="status-steps">三步：① 选择本机资料目录 ② 确认患者档案 ③ 设置锚点日。原型未接通，不预填任何日期。</p>
    <div class="status-actions">
      <button class="primary" data-action="settings">开始三步初始化 →</button>
      <button class="soft" type="button" data-primer-open aria-label="疾病概要：定义、医学资料与指南情况、治疗全景、发展趋势">疾病概要：ATTR 是什么？</button>
    </div>
  </section>`;
}
function viewDashboard(p) {
  const activeDrugs = p.drugs.filter(d => d[6] === 'active');
  const tasks = [
    ['records', '把新报告放进来', '上传 → 核对候选 → 入档', 'folder'],
    ['subtype', '确认型别与确诊链', '四步检查各自到哪一步', 'badge'],
    ['timeline', '看两条线', 'NT-proBNP 与 eGFR 同框', 'chart'],
    ['review', '准备下次门诊', '带什么、问什么', 'calendar']
  ];
  return `${pageHead('看板', SUBTITLES.dashboard, `<button class="primary" data-view="review">准备下次门诊</button>`)}
  ${statusCard()}
  <div class="intent"><i>i</i><div><b>${esc(p.stage)}</b><br>分期与心功能分级均为医生给出；本工作台不自动计算分期，也不给用药建议。</div></div>
  <div class="task-grid">${tasks.map(([v, b, s, ic]) => `<button class="task-entry" data-view="${v}">
      <span class="entry-icon">${icon(ic)}</span><b>${esc(b)}</b><span>${esc(s)}</span><span class="arrow">→</span></button>`).join('')}</div>
  <div class="dash-cols">
    <div>
      ${card('型别与两条线', `
        <div class="grid two" style="gap:12px">
          <div class="stat-tile"><span>型别</span><b>${p.genotype.kind === 'variant' ? '遗传型 ATTRv' : '野生型 ATTRwt'}</b>
            <p class="small-note">${esc(p.genotype.variant || '未做基因检测（医生判断为野生型）')}</p></div>
          <div class="stat-tile"><span>表型</span><b>${esc((p.phenotype[0] || [])[1] || '未记录')}</b>
            <p class="small-note">心脏与神经各自记录，不互相折算</p></div>
        </div>
        <div class="divider"></div>
        <p class="small-note">两条线的最新记录：心脏 ${esc(p.metrics.find(m => m.key === 'nyha') ? p.metrics.find(m => m.key === 'nyha').points.slice(-1)[0].v_text + ' 级' : '未记录')}，神经自查最近一条「${esc((p.neuro.slice(-1)[0] || [])[2] || '未记录')}」。</p>`,
    { right: `<button class="text-button" data-view="cardiac">心脏受累 →</button>` })}
      ${renderMetricGroups(p, p.dash_keys, '四个数，先看这四个')}
    </div>
    <div class="stack">
      ${card('正在用的药', activeDrugs.map(d => `<div class="row"><div class="row-main"><div><b>${esc(d[0])}</b><p>${esc(d[1])} · ${esc(d[2])} · ${esc(d[3])}</p></div></div><div>${pill('在用', 'green')}</div></div>`).join('') +
        `<p class="small-note">只记录名称、剂量、起止与耐受；不评价疗效、不建议加减。</p>`, { right: `<button class="text-button" data-view="treatment">用药史 →</button>` })}
      ${card('接下来', `<div class="row"><div><b>下一次${esc((p.monitor[0] || [])[0] || '复查')}</b><p>${esc((p.monitor[0] || [])[3] || '未安排')}</p></div>${pill((p.monitor[0] || [])[1] || '—', 'violet')}</div>
        <div class="row"><div><b>最近一次化验</b><p>${esc((p.metrics.find(m => m.key === 'ntprobnp').points.slice(-1)[0] || {}).d || '—')}</p></div>${pill('已入档', 'green')}</div>`,
    { accent: true })}
      ${card('家系这件事', `<p style="font-size:12.5px">${esc(p.familyTalk)}</p>
        <p class="small-note">家系成员默认折叠，只有你展开才显示；不计算风险百分比。</p>
        <button class="soft" data-view="family" style="margin-top:10px">打开家族与遗传</button>`)}
    </div>
  </div>`;
}

function viewRecords(p, sub) {
  if (sub === '资料库') {
    return `${pageHead('资料库', SUBTITLES.records, `<button class="primary" data-action="mock-upload">上传报告（演示）</button>`)}
      ${notice('演示环境不上传真实文件。开发版会要求先选择本机资料目录，原件保留在目录内，解析结果只作为候选。', 'plain')}
      <div class="flow-steps"><span class="on">1 上传</span><span class="fs-arrow">→</span><span>2 解析</span><span class="fs-arrow">→</span><span>3 核对</span><span class="fs-arrow">→</span><span>4 入档</span></div>
      ${card('已入库资料', table(['文件', '日期', '类型', '状态'], p.docs.map(d => [`<b>${esc(d[1])}</b>`, esc(d[2]), esc(d[3]), pill(d[4], d[4] === '已核对' ? 'green' : 'yellow')])))}
      <p class="small-note">去重按「档案 + 文件指纹」；同一份文件重复导入不会重置解析状态。</p>
      ${importPanel()}`;
  }
  if (sub === '草稿核对') {
    return `${pageHead('草稿核对', '解析出来的只是候选；勾选并确认后才进入记录层。', '')}
      ${notice('「已接受」只表示你确认这条抄写无误，<b>不等于</b>医学审核。', 'warn')}
      ${candidatesPanel()}
      <p class="small-note">冲突值、缺单位、非数字、把握度低都在读取时算，不落库；同一字段多个值会并排显示，由你选。</p>`;
  }
  if (sub === '病情档案') {
    const rows = [
      ['姓名 / 年龄', `${esc(p.name)} · ${p.age} 岁`],
      ['型别', p.genotype.kind === 'variant' ? '遗传型 ATTRv' : '野生型 ATTRwt'],
      ['基因原文', esc(p.genotype.variant || '未做基因检测')],
      ['表型', esc((p.phenotype[0] || [])[1] || '未记录')],
      ['分期（医生给出）', esc(p.stage)],
      ['确诊日期', esc((p.diagnosis.find(d => d[0] === 'gene' && d[1] === 'done') || [])[3] || '—')],
      ['目前主要负担', esc((p.phenotype[3] || [])[1] || '未记录')]
    ];
    return `${pageHead('病情档案', '档案级事实只有这几项；变化留在各自的时间序列里。', '')}
      ${card('档案', table(['项', '内容'], rows))}
      ${card('我的看法（不是医生结论）', p.viewpoints.map(v => `<div class="row"><div><b>${esc(v[1])}</b><p>${esc(v[2])}</p></div><small>${esc(v[0])}</small></div>`).join('') +
        `<p class="small-note">这些文字只属于你，不进趋势、不进摘要事实区、不自动进 AI 草稿。</p>`)}`;
  }
  if (sub === '指标检测') {
    return `${pageHead('指标检测', '每一条都带来源与采样日期；没有来源的数值不视为已核对。', '')}
      ${card('全部指标', table(['指标', '最近值', '日期', '来源', '分组'], p.metrics.map(m => {
        const last = m.points.slice(-1)[0];
        return [`<b>${esc(m.name)}</b>`, m.kind === 'numeric' ? `${fmt(last.v_num, m.dec)} <small>${esc(m.unit)}</small>` : esc(last.v_text), esc(last.d), esc(last.src), esc(groupLabel(m.cat))];
      })))}
      <p class="small-note">分期相关的两个数（NT-proBNP、eGFR）只显示原值；分期本身由医生写，见「我的分型 → 表型与分期」。</p>`;
  }
  const latest = p.metrics.map(m => `${m.name} ${m.kind === 'numeric' ? fmt(m.points.slice(-1)[0].v_num, m.dec) + m.unit : m.points.slice(-1)[0].v_text}`).join('；');
  return `${pageHead('病情汇总', '这一页只汇总已入档的记录，供打印或复制到门诊材料。', `<button class="soft" data-action="copy-summary">复制摘要</button>`)}
    ${card('一句话现状', `<p style="font-size:13px">${esc(p.name)}，${p.age} 岁，${p.genotype.kind === 'variant' ? '遗传型 ATTRv' : '野生型 ATTRwt'}，${esc((p.phenotype[0] || [])[1] || '')}。${esc(p.stage)}。</p>`)}
    ${card('最近一次记录', `<p style="font-size:12.5px">${esc(latest)}。</p><p class="small-note">最近一次用药调整：${esc((p.tolerance.slice(-1)[0] || [])[0] || '无记录')}。</p>`)}
    ${notice('汇总不含私密家系信息、不含医生未确认的推断；复制出去的文字与你看到的一致。', 'plain')}`;
}

function viewSubtype(p, sub) {
  const isVariant = p.genotype.kind === 'variant';
  if (sub === '型别与基因') {
    return `${pageHead('型别与基因', SUBTITLES.subtype, `<button class="soft" data-action="edit-genotype">记录 / 更正型别</button>`)}
      ${isVariant ? '' : notice('<b>野生型 ATTRwt。</b>野生型一般不以孟德尔方式遗传，家属通常不需要因为这一诊断去做基因检测；具体由医生判断。', 'violet')}
      <div class="subtype-hero"><div>
        <span class="code">${isVariant ? 'TTR VARIANT' : 'WILD TYPE'}</span>
        <h2>${isVariant ? '遗传型 ATTRv' : '野生型 ATTRwt'}</h2>
        <div class="en">${esc(isVariant ? p.genotype.variant : '未检出 TTR 变异 / 未做检测')}</div>
        <div class="subtype-meta">${pill(isVariant ? '常染色体显性' : '非孟德尔遗传', isVariant ? 'violet' : 'grey')}${pill(p.genotype.state === 'done' ? '检测已完成' : p.genotype.state === 'pending' ? '等结果' : '未检测', p.genotype.state === 'done' ? 'green' : 'yellow')}</div>
      </div><div class="path-tree">
        <div class="on">型别：${isVariant ? '遗传型' : '野生型'}</div>
        <div class="lv2">${isVariant ? '基因原文已抄录' : '无基因原文（未检测）'}</div>
        <div class="lv2">表型：${esc((p.phenotype[0] || [])[1] || '未记录')}</div>
        <div class="lv3">分期：${esc(p.stage)}</div>
      </div></div>
      ${isVariant ? card('基因检测记录', table(['项', '内容'], [
        ['变异原文', `<b>${esc(p.genotype.variant)}</b>`],
        ['杂合/纯合', esc(p.genotype.zygosity || '未报告')],
        ['检测方法', esc(p.genotype.method || '未报告')],
        ['检测机构', esc(p.genotype.lab || '未记录')],
        ['报告日期', esc(p.genotype.reportDate || '未记录')]
      ]) + `<p class="small-note">变异致病性由医生与遗传咨询判断；本工作台只抄写报告原文，不做解读。</p>`) :
        card('基因检测', `<p style="font-size:12.5px">这位档案没有做 TTR 基因检测。医生原话：</p>
          <div class="private" style="margin-top:10px"><h3>医生原话</h3><p style="font-size:12.5px">${esc(p.genotype.doctorText || '未记录')}</p></div>
          <p class="small-note">「未做」不等于「阴性」；若日后做了检测，本页会新增一条记录，旧记录保留。</p>`)}
      ${card('更正怎么留痕', `<p style="font-size:12px">型别或基因原文需要更正时，系统新增一行并标记旧行「已被更正」，不覆盖历史。这是家族四条契约里的第三条。</p>`)}`;
  }
  if (sub === '表型与分期') {
    return `${pageHead('表型与分期', '分期只能由医生给；患者自查不进这张表。', '')}
      ${card('表型', table(['项', '内容', '来源'], p.phenotype.map(r => [esc(r[0]), `<b>${esc(r[1])}</b>`, esc(r[2])])))}
      ${card('分期记录', table(['方案', '值', '日期', '谁给的', '医生原话'], p.stages.map(r => [esc(r[0]), `<b>${esc(r[1])}</b>`, esc(r[2]), '医生', esc(r[4])])))}
      ${notice('工作台不自动算 Gillmore/NAC 分期，也不把 NYHA 与 FAP 合成一个分数——心脏与神经是两条平行线（A3）。', 'plain')}`;
  }
  if (sub === '确诊路径') {
    const steps = [['warning', '警示征', '室壁厚、低电压、腕管/脊柱史、肌钙蛋白持续升高'], ['pyp', '99mTc-PYP 显像', 'Perugini 0–3 级，2–3 级考虑心肌摄取'], ['flc', '轻链与免疫固定电泳', '先排除 AL 淀粉样变'], ['gene', 'TTR 基因检测', '确诊型别；野生型可未做']];
    return `${pageHead('确诊路径', '四步各自可空；「未做」不等于「阴性」，也不等于「排除」。', `<button class="soft" data-action="edit-diagnosis">补一条记录</button>`)}
      <div class="grid four">${steps.map(([k, name, hint]) => {
        const r = p.diagnosis.find(d => d[0] === k);
        const stateText = !r ? '未记录' : r[1] === 'done' ? '已完成' : r[1] === 'pending' ? '等结果' : '未做';
        const tone = !r ? 'grey' : r[1] === 'done' ? 'green' : r[1] === 'pending' ? 'yellow' : 'grey';
        return `<div class="card" style="padding:16px"><div class="card-head" style="margin-bottom:8px"><h3 style="font-size:13px">${esc(name)}</h3>${pill(stateText, tone)}</div>
          <p class="small-note" style="margin-top:0">${esc(hint)}</p>
          <p style="font-size:12px;margin-top:8px">${esc(r && r[2] ? r[2] : '暂无记录')}</p>
          <p class="small-note">${esc(r ? (r[3] || '') + ' · ' + (r[4] || '') : '')}</p></div>`;
      }).join('')}</div>
      ${card('时间线', p.diagnosis.filter(d => d[3]).map(r => `<div class="row"><div><b>${esc(r[4] || '')}</b><p>${esc(r[5] || '')}</p></div><small>${esc(r[3])}</small></div>`).join(''))}
      <p class="small-note">说明：PYP 阳性 + 轻链阴性在公开共识里被认为特异度很高，但是否确诊、是否需要心肌活检由医生决定；本页只呈现你记录的报告原文。</p>
      <!--dev-only-->
      ${card('上面那句「公开共识」指的是这一份', `
        <div class="row"><div>
          <b>《转甲状腺素蛋白心脏淀粉样变诊断与治疗中国专家共识》</b>
          <p>中华医学会心血管病学分会心力衰竭学组 · 中华心血管病杂志编辑委员会</p>
          <p>中华心血管病杂志 2021;49(4):324-332 · DOI 10.3760/cma.j.cn112148-20201217-00993</p>
          <p>位置：诊断 → 二、辅助检查 → 5. 放射性核素骨闪烁扫描术</p>
        </div>${pill('卷期页已核', 'green')}</div>
        <div class="row"><div><b>原文</b><p>「心肌摄取为 2 或 3 级同时血清/尿液中单克隆免疫球蛋白阴性，诊断 ATTR-CA 的特异度和阳性预测值均为 100%」</p></div></div>
        <div class="row"><div><b>这个数最早来自哪</b><p>Gillmore JD, et al. Nonbiopsy diagnosis of cardiac transthyretin amyloidosis. Circulation 2016;133(24):2404-2412（n=1217，其中 374 例做了心肌活检）</p></div></div>
        <div class="row"><div><b>另一套口径（并列放在这里，不换算、不取舍）</b><p>ASNC/AHA/ASE/EANM/HFSA/ISA/SCMR/SNMMI 2021 年补充说明把判据收紧为「断层图像显示弥漫 2–3 级摄取」，认为只看平面图像不够。J Nucl Cardiol 2021;28:1769-1774。</p></div>${pill('两套并列', 'violet')}</div>
        <p class="small-note">只核到卷期页，小节起始页还没核到原件——核到之前，这条不算「能点回原文」，仍按待核看待。两套口径说的都是「扫描 + 血尿检查阴性可以少做一次活检」，不等于确诊；是否确诊、要不要做心肌活检由医生决定。</p>`)}
      <!--/dev-only-->`;
  }
  return `${pageHead('会诊与二次意见', '把不同医院的说法并排放，不做取舍。', '')}
    ${emptyState('还没有会诊记录', '如果你在不同医院得到不同说法，可以把两边的原话都记下来，下次门诊一起看。')}
    <p class="small-note">开发版会支持添加「机构 / 日期 / 医生原话 / 我当时的理解」，并标注哪一条是最终采纳的（由你标，不由系统推断）。</p>`;
}

function viewTreatment(p, sub) {
  const active = p.drugs.filter(d => d[6] === 'active');
  if (sub === '当前方案') {
    return `${pageHead('当前方案', SUBTITLES.treatment, '')}
      ${notice('现有治疗的目标是延缓沉积与进展，不能清除已经沉积的淀粉样物。具体方案与剂量由医生决定。', 'violet')}
      <div class="grid two">${active.map(d => `<div class="card"><div class="card-head"><div><h2>${esc(d[0])}</h2><p>${esc(d[1])}</p></div>${pill('在用', 'green')}</div>
        <div class="stat-band"><span><b>${esc(d[2])}</b>剂量</span><span><b>${esc(d[3])}</b>用法</span><span><b>${esc(d[4])}</b>开始</span></div>
        <p class="small-note">${esc(d[8] || '')}</p></div>`).join('')}</div>
      <p class="small-note">方案按段记录：同一机制换品种、加减支持治疗都新增一段，旧段保留起止。</p>
      <!--dev-only-->
      ${card('这一页的治疗分类与数字来自哪里', `
        <div class="row"><div>
          <b>《转甲状腺素蛋白心脏淀粉样变诊断与治疗中国专家共识》· 治疗章节</b>
          <p>中华医学会心血管病学分会心力衰竭学组 · 中华心血管病杂志编辑委员会</p>
          <p>中华心血管病杂志 2021;49(4):324-332 · DOI 10.3760/cma.j.cn112148-20201217-00993</p>
          <p>位置：治疗（5.1 稳定剂 / 5.2 基因沉默 / 6 结语）</p>
        </div>${pill('卷期页已核', 'green')}</div>
        <div class="row"><div><b>共识把治疗分三类</b><p>对症治疗（缓解心衰症状；共识原文：对疾病进展本身无明显影响）· 对因治疗（TTR 四聚体稳定剂 / 基因沉默，稳定四聚体或抑制 TTR 生成）· 器官移植（药物无效的晚期）</p></div></div>
        <div class="row"><div><b>中国已上市 / 未上市（共识原文口径）</b><p>基因沉默三种（patisiran / vutrisiran / inotersen）共识写「均未在中国上市」；中国上市的是氯苯唑酸，口服小分子 TTR 稳定剂。</p></div>${pill('共识原文口径', 'violet')}</div>
        <div class="row"><div><b>氯苯唑酸的关键数据（ATTR-ACT）</b><p>441 例、30 个月：全因死亡 29.5%（78/264）vs 安慰剂 42.9%（76/177），HR 0.70（95%CI 0.51–0.96）；心血管住院 0.48 vs 0.70 次/年。Maurer MS, et al. N Engl J Med 2018;379(11):1007-1016，DOI 10.1056/NEJMoa1805689，NCT01994889。</p></div></div>
        <div class="row"><div><b>共识里的延展期数字</b><p>共识原文：「持续接受氯苯唑酸治疗后 59 个月，全因死亡降低 41%，不良事件发生率与安慰剂组相似」。</p></div></div>
        <div class="row"><div><b>一处口径不一致，先摆出来不合并</b><p>本工作台「生活与照护 → 出行与资源」写的是「2020-09 获 NMPA 批准用于 ATTR-CM」；共识原文写的是「中国药品监督管理局也于 2020 年 10 月批准氯苯唑酸用于治疗 ATTR-CA」。两处差一个月，都没核到批准文件原件，按待核并列，不擅自挑一个写死。</p></div>${pill('待核批准文件', 'yellow')}</div>
        <p class="small-note">以上都是已发表的数字与共识原文，不是本工作台的判断。这些药合不合适、要不要换、用多少，由医生决定——本页不替医生开任何一条。</p>`)}
      <!--/dev-only-->`;
  }
  if (sub === '用药与耐受') {
    return `${pageHead('用药与耐受', '耐受事件按时间记录；怎么处理是医生的事，这里只抄原话。', '')}
      ${card('耐受记录', table(['日期', '药物', '类型', '经过', '当时怎么处理'], p.tolerance.map(r => [esc(r[0]), esc(r[1]), `<b>${esc(r[2])}</b>`, esc(r[3]), esc(r[4])])))}
      <p class="small-note">头晕、腹泻、注射部位反应、血小板下降…… 记录本身不能证明因果，因果关系由医生判断。</p>`;
  }
  if (sub === '治疗调整史') {
    return `${pageHead('治疗调整史', '每一段都有开始与结束；正在用的段没有结束日期。', '')}
      ${card('方案段', table(['药物', '机制', '剂量', '开始', '结束', '状态', '停/换原因'], p.drugs.map(d => [
        `<b>${esc(d[0])}</b>`, esc(d[1]), esc(d[2]), esc(d[4]), d[5] ? esc(d[5]) : '<span class="muted">—</span>',
        pill(d[6] === 'active' ? '在用' : d[6] === 'stopped' ? '已停' : '暂停', d[6] === 'active' ? 'green' : 'grey'), esc(d[7] || '—')
      ])))}
      <p class="small-note">停用记录不覆盖旧方案：把结束日期补上，新方案另起一行（A6）。</p>`;
  }
  const supportive = p.drugs.filter(d => d[1].indexOf('支持') === 0);
  return `${pageHead('支持治疗', '利尿、抗凝、止痛等支持用药；与病因治疗分开看。', '')}
    ${card('支持用药', table(['药物', '剂量', '用法', '开始', '状态'], supportive.map(d => [esc(d[0]), esc(d[2]), esc(d[3]), esc(d[4]), pill(d[6] === 'active' ? '在用' : '已停', d[6] === 'active' ? 'green' : 'grey')])))}
    ${card('非药物支持（记录位）', `<p style="font-size:12.5px">低盐、弹力袜、缓慢起身、夜间垫高枕头、防跌倒——这些是「生活与照护」页的记录位，本页不重复录入。</p>
      <button class="soft" data-view="life" style="margin-top:10px">去生活与照护</button>`)}`;
}

/* ---------------- 开发版新增：血压录入（原型没有，标记 data-dev-only 供 parity 白名单放行） ----------------
   原型的血压表是只读的（演示数据里每格都有值，所以看不出问题）。一旦让用户录入，
   就会出现"没填脉搏"这种情况：库里是 NULL，界面必须显示「—」而不是 0 或 "null"——
   **空 ≠ 阴性**：空是"没记"，不是"脉搏为 0"，也不等于"没有症状"。 */
function numOrDash(v) {
  return v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : String(v);
}

/** 录入表单。体位可空：空 = 这条没记体位，不参与卧-立对照（对照在读取时算，不存差值）。 */
function bpEntryForm() {
  if (state.profile !== 'A' && state.profile !== 'B') return '';
  return `<form class="dev-entry" data-dev-only id="bp-form" autocomplete="off">
      <h3>记一条血压</h3>
      <div class="dev-entry-row">
        <label>日期<input type="date" name="d" required></label>
        <label>体位<select name="position">
          <option value="">未记体位</option><option value="卧">卧</option><option value="坐">坐</option><option value="立">立</option>
        </select></label>
        <label>收缩压<input type="number" name="sys" min="40" max="300" required><span class="unit">mmHg</span></label>
        <label>舒张压<input type="number" name="dia" min="20" max="200" required><span class="unit">mmHg</span></label>
        <label>脉搏<input type="number" name="pulse" min="20" max="250" placeholder="可不填"><span class="unit">次/分</span></label>
      </div>
      <div class="dev-entry-row">
        <label class="grow">当时症状<input type="text" name="symptom" maxlength="100" placeholder="如：站起来眼前发黑；可不填"></label>
        <label class="grow">当时用药<input type="text" name="drugNote" maxlength="200" placeholder="如：呋塞米 20mg qd；可不填"></label>
      </div>
      <div class="dev-entry-foot">
        <button class="primary" type="submit">记一条</button>
        <span class="small-note">留空的格子存为「没记」，不会写成 0，也不会当成"没有症状"。</span>
      </div>
    </form>`;
}

function viewCardiac(p, sub) {
  if (sub === '心衰症状与体征') {
    return `${pageHead('心衰症状与体征', SUBTITLES.cardiac, '')}
      ${card('症状序列（自述，不是分级）', table(['日期', '症状', '程度', '备注'], p.cardiac.map(r => [esc(r[0]), `<b>${esc(r[1])}</b>`, esc(r[2]), esc(r[3])])))}
      ${card('NYHA（医生给出）', table(['日期', '分级', '来源'], p.metrics.find(m => m.key === 'nyha').points.map(pt => [esc(pt.d), `<b>${esc(pt.v_text)}</b>`, esc(pt.src)])))}
      <p class="small-note">自述程度与医生分级不是一回事：上面一张表不能替代下面这张。</p>`;
  }
  if (sub === '心超与影像') {
    return `${pageHead('心超与影像', '按真实检查频率记录，不为了好看加密。', '')}
      ${card('心超 / CMR', table(['日期', '类型', 'IVSd mm', 'LVPWd mm', 'LVEF %', 'GLS %', '延迟强化', '结论原文'], p.echo.map(r => [esc(r[0]), esc(r[1]), fmt(r[2], 1), fmt(r[3], 1), fmt(r[4], 0), fmt(r[5], 1), esc(r[6]), esc(r[7])])))}
      <p class="small-note">室壁厚度与射血分数、应变各自独立；不要用 LVEF 正常来推断"心脏没事"。</p>`;
  }
  if (sub === '心律与晕厥') {
    return `${pageHead('心律与晕厥', '只记发生事实与医生处理，不判断是否需要器械治疗。', '')}
      ${card('事件', table(['日期', '类型', '经过', '医生处理'], p.rhythmEvents.map(r => [esc(r[0]), `<b>${esc(r[1])}</b>`, esc(r[2]), esc(r[3])])))}
      ${emptyState('是否需要起搏器 / ICD', '这是医生根据多项检查做的判断，工作台不提供倾向。可以把它写进「与医生讨论的问题」。')}`;
  }
  return `${pageHead('血压与用药耐受', '体位是关键字段：卧、坐、立分别记；没有体位就不参与对照。', '')}
    ${card('血压记录', table(['日期', '体位', '血压', '脉搏', '当时症状', '当时用药'], p.bp.map(r => [esc(r[0]), esc(r[1]) || '<span class="muted">—</span>', `<b>${r[2]}/${r[3]}</b> mmHg`, numOrDash(r[4]), esc(r[5]) || '<span class="muted">—</span>', esc(r[6]) || '<span class="muted">—</span>'])))}
    <p class="small-note">低血压（尤其体位性）导致部分患者不能耐受降压药与 β 阻滞剂。是否调整用药由医生决定；本页只提供记录。</p>
    ${bpEntryForm()}`;
}

function viewNerve(p, sub) {
  if (sub === '感觉与运动') {
    return `${pageHead('感觉与运动', SUBTITLES.nerve, '')}
      ${notice('下面这张表是<b>自查记录</b>，不是医生评估，也不是 FAP 分期。', 'warn')}
      ${card('症状序列', table(['日期', '维度', '症状', '程度/影响', '备注'], p.neuro.map(r => [esc(r[0]), esc(r[1]), `<b>${esc(r[2])}</b>`, esc(r[3]), esc(r[4] || '—')])))}
      ${card('FAP 分期（医生给出）', p.stages.filter(s => s[0] === 'FAP').map(s => `<div class="row"><div><b>${esc(s[1])} 期</b><p>${esc(s[4])}</p></div><small>${esc(s[2])}</small></div>`).join('') || '<p class="small-note">尚无 FAP 分期记录。</p>')}`;
  }
  if (sub === '自主神经') {
    return `${pageHead('自主神经', '胃肠、泌尿、出汗、体位四块；这块最容易被漏记。', '')}
      ${notice('这一页是<b>自查记录，不是医生评估</b>；不生成分级、不判断严重程度。', 'yellow')}
      ${card('自主神经记录', table(['日期', '分块', '症状', '细节'], p.autonomic.map(r => [esc(r[0]), esc(r[1]), `<b>${esc(r[2])}</b>`, esc(r[3])])))}
      <p class="small-note">腹泻与便秘交替、夜尿增多、出汗减少、站起头晕都记在这里；它们与心脏线分开统计。</p>`;
  }
  if (sub === '腕管与脊柱') {
    return `${pageHead('腕管与脊柱', '确诊前的线索与确诊后的事件分开；不回溯推断。', '')}
      ${card('红旗线索', table(['阶段', '项目', '年份', '侧别', '备注'], p.redflags.map(r => [r[0] === 'before' ? pill('确诊前', 'grey') : pill('确诊后', 'violet'), `<b>${esc(r[1])}</b>`, esc(r[2]), esc(r[3]), esc(r[4])])))}
      <p class="small-note">腕管综合征、腰椎管狭窄、肱二头肌腱断裂、反复白内障在公开资料里被列为常见线索；但它们也可能与 ATTR 无关，工作台不做归因。</p>`;
  }
  return `${pageHead('跌倒与安全', '把"最近有没有摔过、差一点摔"记下来，比任何评分都有用。', '')}
    ${emptyState('还没有跌倒记录', '如果最近有跌倒或差点跌倒，建议记下时间、地点、当时在做什么、有没有头晕。')}
    <p class="small-note">开发版会在「生活与照护」联动显示家居改造清单（扶手、夜灯、防滑垫），清单本身不代表医疗建议。</p>`;
}

function viewLabs(p, sub) {
  const groups = { '心脏指标': ['heart'], '肾脏与电解质': ['kidney'], '体重与血液': ['blood'], '影像与基因报告': [] }[sub];
  if (sub === '影像与基因报告') {
    return `${pageHead('影像与基因报告', '报告原文与结论分列，不合并成一句"未见异常"。', '')}
      ${card('影像', table(['日期', '类型', '结论原文'], p.echo.map(r => [esc(r[0]), esc(r[1]), esc(r[7])])))}
      ${card('基因', p.genotype.kind === 'variant' ? table(['项', '内容'], [['变异原文', `<b>${esc(p.genotype.variant)}</b>`], ['报告日期', esc(p.genotype.reportDate)], ['机构', esc(p.genotype.lab)]]) :
        '<p class="small-note">该档案没有基因检测报告（野生型，医生判断不需要）。</p>')}`;
  }
  const list = p.metrics.filter(m => groups.includes(m.cat));
  return `${pageHead(sub, SUBTITLES.labs, '')}
    ${card(sub, table(['指标', '单位', '最近值', '日期', '来源'], list.map(m => {
      const last = m.points.slice(-1)[0];
      return [`<b>${esc(m.name)}</b>`, esc(m.unit || '—'), m.kind === 'numeric' ? fmt(last.v_num, m.dec) : esc(last.v_text), esc(last.d), esc(last.src)];
    })))}
    <p class="small-note">参考区间不写死：不同医院方法不同，以报告单为准。</p>`;
}

function viewFamily(p, sub) {
  const isVariant = p.genotype.kind === 'variant';
  if (!isVariant) {
    return `${pageHead('家族与遗传', '这一页只对遗传型有意义；野生型一般不需要家属检测。', '')}
      ${notice('<b>这份档案是野生型 ATTRwt。</b>野生型一般不以孟德尔方式遗传，家属通常不需要因为这个诊断去做基因检测；如家里有人出现类似症状，仍应各自就诊。', 'violet')}
      ${card('如果型别被更正为遗传型', '<p style="font-size:12.5px">更正型别后，这一页会出现家系成员名单、级联筛查与遗传咨询记录；旧记录保留。</p>')}`;
  }
  if (sub === '家系图') {
    return `${pageHead('家系图', SUBTITLES.family, `<button class="soft" data-action="toggle-family">展开 / 收起成员</button>`)}
      ${notice('家系信息是最高敏感级：默认折叠，不进 AI 草稿，导出需单独勾选。成员状态由本人或家属自己填。', 'warn')}
      ${card('成员', p.family.map(r => `<div class="row"><div><b>${esc(r[1])}（${esc(r[0])}）</b><p>检测：${esc(r[2])} · 结果：${esc(r[3])}</p></div><div>${pill(r[4], 'grey')}</div></div>`).join('') +
        `<p class="small-note">工作台不计算风险百分比，也不生成"建议检测"的祈使句；是否检测由本人与医生决定。</p>`)}
      ${card('可以照着说的一句话', `<p style="font-size:13px">「我得的是一个跟基因有关的病，家里直系亲属有可能也带着这个基因。要不要查、什么时候查，可以先去遗传门诊问清楚再决定。」</p>
        <button class="soft" data-action="copy-family" style="margin-top:10px">复制这句话</button>`)}`;
  }
  if (sub === '级联筛查') {
    return `${pageHead('级联筛查', '谁查了、谁没查、谁还在犹豫——只记录，不催促。', '')}
      ${card('清单', table(['成员', '检测状态', '结果', '备注'], p.family.map(r => [esc(r[1]), pill(r[2], r[2] === '已检测' ? 'green' : 'grey'), esc(r[3]), esc(r[4])])))}
      <p class="small-note">「未检测」与「阴性」是两个值；不要用空着表示没查（A1/A5 同一条原则）。</p>`;
  }
  return `${pageHead('遗传咨询记录', '只记时间、机构、角色与医生原话；不记姓名。', '')}
    ${p.counsel.length ? card('咨询记录', table(['日期', '机构', '谁', '主题', '原话'], p.counsel.map(r => [esc(r[0]), esc(r[1]), esc(r[2]), esc(r[3]), esc(r[4])]))) : emptyState('还没有咨询记录', '遗传门诊或遗传咨询师的谈话要点，可以记在这里。')}
    <p class="small-note">变异致病性、外显率、生育选择都由遗传咨询与医生判断；工作台不提供结论。</p>`;
}

function viewLife(p, sub) {
  if (sub === '饮食与体重') {
    return `${pageHead('饮食与体重', SUBTITLES.life, '')}
      ${card('记录', table(['日期', '类型', '内容', '份量/数值', '当时症状'], p.daily.filter(d => d[1] === '饮食' || d[1] === '体重').map(r => [esc(r[0]), esc(r[1]), esc(r[2]), esc(r[3]), esc(r[4] || '—')])))}
      ${card('体重趋势（指标卡）', `<div class="metric-grid">${metricCard(p.metrics.find(m => m.key === 'weight'))}</div>`)}
      <p class="small-note">少盐、控制汤水是常见的生活调整；具体摄入量由医生或营养师给。本页不做热量换算，也不给食谱。</p>`;
  }
  if (sub === '活动与康复') {
    return `${pageHead('活动与康复', '记"实际走了多久、什么感觉"，不设运动处方。', '')}
      ${card('活动记录', table(['日期', '内容', '时长/距离', '感受'], p.daily.filter(d => d[1] === '活动').map(r => [esc(r[0]), esc(r[2]), esc(r[3]), esc(r[4] || '—')])))}
      <p class="small-note">活动耐量下降是心脏受累的常见表现；是否要限制活动、要不要做康复，由医生评估。</p>`;
  }
  if (sub === '情绪与照护者') {
    /* 两块数据两个来源，都不做量表、不算分、不翻译成状态：
       - 「你写下的」读 viewpoints（d / mood / text），跟着 bootstrap 一起来；
       - 「照护者」读 0004 的 caregiver_rows，走 /api/caregiver 单独取（不挂 bootstrap，
         否则 parity 会红）。按日期倒序：最近这一次排在最上面。 */
    const vps = [...(p.viewpoints || [])].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const cg = [...(CAREGIVER.rows || [])].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    return `${pageHead('情绪与照护者', '这一页只留你自己的话和照护安排；不打分、不判定，也不把它翻译成任何一种"状态"。', '')}
      ${vps.length
        ? card('你写下的', vps.map(v => `<div class="row"><div><b>${esc(v[1])}</b><p>${esc(v[2])}</p></div><small>${esc(v[0])}</small></div>`).join('') +
          `<p class="small-note">这些文字只属于你：不进趋势、不进摘要事实区、不进导出（导出代码里没有这张表），也不自动进 AI 草稿。</p>`, { right: pill(`${vps.length} 条`, 'violet') })
        : emptyState('还没有记录', '心情、担心的事、睡得好不好，都可以写在这里，一句也行。')}
      ${card('三个常被记下来的时刻', `<div class="row"><div><b>确诊那天</b><p>听到名字的那一刻想说的话。</p></div></div>
        <div class="row"><div><b>要跟家里人说之前</b><p>遗传型要先告诉兄弟姐妹或子女的时候。</p></div></div>
        <div class="row"><div><b>复诊前一晚</b><p>排队、抽血、等结果那几天的感受。</p></div></div>
        <p class="small-note">这三个时刻来自探索性访谈的待验证假设，不是医学标准；想记就记，没有「多久该记一次」这回事。</p>`)}
      ${card('照护者', `${CAREGIVER.error ? notice(`读取失败：${esc(CAREGIVER.error)}`, 'warn') : ''}
        ${cg.length
          ? cg.map(caregiverRowHtml).join('') +
            `<p class="small-note">这些记录只属于你：不进趋势、不进门诊摘要（导出代码里没有这张表），也不自动进 AI 草稿。</p>`
          : emptyState('还没有记录', '谁在照顾你、这周最累的一件事、有没有人能替手、你自己需要什么——想到哪句写哪句。')}
        ${caregiverEntryForm()}
        <p class="small-note">要不要请护工、照护安排该不该调整、照护者要不要正式支持（社工、喘息服务）——这些由医生和社工判断；工作台只把这段日子记下来，不替你评估负担轻重。</p>`,
        cg.length ? { right: pill(`${cg.length} 条`, 'violet') } : {})}
      <p class="small-note">情绪要不要用药、算不算焦虑抑郁、照护者要不要介入——这些都由医生和社工判断；工作台只负责把话留住，不替你解释它。</p>`;
  }
  return `${pageHead('出行与资源', '长途出行、报销、异地就医——这些具体问题最容易在诊室外卡住。', '')}
    ${card('出行记录', table(['日期', '内容', '时长', '备注'], p.daily.filter(d => d[1] === '出行').map(r => [esc(r[0]), esc(r[2]), esc(r[3]), esc(r[4] || '—')])))}
    ${card('已核实的公开信息（只列来源明确的）', `<div class="row"><div><b>氯苯唑酸（维万心®）</b><p>2020-09 获 NMPA 批准用于 ATTR-CM；2021 年进入国家医保（媒体与厂商口径，未核医保目录原文）。</p></div>${pill('待核原文', 'yellow')}</div>
      <div class="row"><div><b>氯苯唑酸葡胺（维达全®）</b><p>2020-02 获批用于 ATTR-PN Ⅰ期症状患者（厂商新闻稿口径）。</p></div>${pill('待核原文', 'yellow')}</div>
      <p class="small-note">各地报销比例、门诊慢特病认定、罕见病用药保障差异很大；工作台不给出"能报多少"的结论。</p>`)}`;
}

function viewReview(p, sub) {
  if (sub === '复诊节奏') {
    return `${pageHead('复诊节奏', '医生安排的频率，照抄；不改写成"建议"。', '')}
      ${card('安排', table(['项目', '频率', '依据', '上次', '下次'], p.rhythmRows.map(r => [esc(r[0]), esc(r[1]), esc(r[2]), esc(r[3]), esc(r[4])])))}
      <p class="small-note">频率变化由医生根据病情调整；此处只记录最近一次听到的安排。</p>`;
  }
  if (sub === '就诊准备') {
    return `${pageHead('就诊准备', SUBTITLES.review, `<button class="primary" data-action="build-visit">生成本次材料</button>`)}
      ${card('带什么', `<div class="flag-list"><div>最近一次 NT-proBNP、肌酐/eGFR、电解质报告</div><div>最近一次心超报告（对比上一次）</div><div>正在用的药清单（名称、剂量、开始时间）</div><div>最近 3 个月的血压记录（含体位）</div><div>神经症状自查里变化最大的两条</div></div>`)}
      ${card('问什么（草稿）', `<div class="flag-list"><div>现在这个方案用了多久，下次评估看哪几个指标？</div><div>血压偏低，利尿剂要不要调整？（带上立位血压记录）</div><div>家里还有谁需要查？怎么开口比较合适？</div></div>
        <p class="small-note">这些是草稿，不是"应该问"的清单；可以删改。</p>`)}`;
  }
  return `${pageHead('与医生讨论的问题', '把问题写在门诊前，比在诊室里想更靠谱。', `<button class="soft" data-action="add-question">加一条</button>`)}
    ${emptyState('还没有记录问题', '可以从「就诊准备」里的草稿挑，也可以自己写。')}
    <p class="small-note">问题不排序、不标"重要"；要不要问、怎么问由你决定。</p>`;
}

function viewTrials(p, sub) {
  const rows = TRIALS.map(t => [`<b>${esc(t.title)}</b><br><small>${esc(t.record_id)}</small>`, esc(t.source), pill(t.status, 'yellow'), t.saved ? pill('已收藏', 'violet') : `<button class="text-button" data-action="save-trial" data-id="${esc(t.record_id)}">收藏</button>`]);
  if (sub === '2026 线索') {
    return `${pageHead('2026 线索', SUBTITLES.trials, '')}
      ${notice('登记 ≠ 有效 ≠ 安全 ≠ 可入组。状态为登记状态，未核实；本轮未查 ChiCTR 与 WHO ICTRP，缺口写在 docs/CLINICAL-DATA-2026.md。', 'warn')}
      ${card('登记摘录（节选）', table(['试验', '来源', '登记状态', ''], rows))}
      <p class="small-note">完整库：research/attr/attr_trials_2026.sqlite，共 434 条（CT.gov 418 + CDE 16）。工作台只存收藏与备注，不复制全量库。</p>`;
  }
  if (sub === '已收藏') {
    const saved = TRIALS.filter(t => t.saved);
    return `${pageHead('已收藏', '收藏只是"以后再看"，不代表适合你。', '')}
      ${saved.length ? card('收藏', saved.map(t => `<div class="saved-item"><b>${esc(t.title)}</b><p>${esc(t.record_id)} · ${esc(t.status)}</p><small>登记状态，未核实</small></div>`).join('')) : emptyState('还没有收藏', '在「2026 线索」里点收藏，会出现在这里。')}`;
  }
  return `${pageHead('入组问题', '去问之前，先把这几个问题写下来。', '')}
    ${card('问试验方的问题', `<div class="flag-list"><div>这个研究现在还在招募吗？登记状态和实际招募是否一致？</div><div>我这种型别（野生型/遗传型）和分期能入组吗？</div><div>对照组是什么？如果分到对照组，我现在的治疗怎么办？</div><div>需要去几次中心？路程和陪护怎么安排？</div><div>研究相关的检查和药费谁承担？</div></div>`)}
    <p class="small-note">工作台不判断你"适合哪个试验"，也不排序、不预测疗效。</p>`;
}

/* ---------------- 页面装配 ---------------- */
function renderPage() {
  const p = P();
  const sub = curSub();
  switch (state.view) {
    case 'dashboard': return viewDashboard(p);
    case 'records': return viewRecords(p, sub);
    case 'subtype': return viewSubtype(p, sub);
    case 'treatment': return viewTreatment(p, sub);
    case 'cardiac': return viewCardiac(p, sub);
    case 'nerve': return viewNerve(p, sub);
    case 'labs': return viewLabs(p, sub);
    case 'timeline': return sub === '数值曲线' || sub === '事件与节点' ? viewTimelinePage(p, sub) : viewTimelineMeta(p);
    case 'family': return viewFamily(p, sub);
    case 'life': return viewLife(p, sub);
    case 'review': return viewReview(p, sub);
    case 'trials': return viewTrials(p, sub);
    default: return viewDashboard(p);
  }
}

function viewTimelinePage(p, sub) {
  if (sub === '事件与节点') {
    return `${pageHead('事件与节点', '事件是时间轴上的竖线；节点按日期排序，不改写成因果。', '')}
      ${card('事件', table(['日期', '事件', '类型'], p.events.map((e, i) => [esc(e[0]), `<b>${esc(e[1])}</b>`, i === 0 ? '早期线索' : '记录'])))}
      ${card('就诊与检查节点', table(['日期', '项目', '来源'], p.diagnosis.filter(d => d[3]).map(d => [esc(d[3]), esc(d[4]), esc(d[0])])))}
      <p class="small-note">事件竖虚线止于数据区上方，不穿过曲线；图上事件用 ①②③ 编号，对应下方列表。</p>`;
  }
  return `${pageHead('病情一图秀', SUBTITLES.timeline, '')}${renderTimeline(p)}`;
}
function viewTimelineMeta(p) {
  return `${pageHead('数据口径', '这张图怎么来的，写清楚才不会被误读。', '')}
    ${card('口径', table(['项', '说明'], [
      ['时间窗', `${esc(D.meta.windowStart)} → ${esc(D.meta.windowEnd)}（演示固定 6 个月）`],
      ['数值线', '每条线各自一条纵轴；刻度颜色与线一致，不跨轴比较'],
      ['分类序列', '只画节点不连线；NYHA 由医生给出'],
      ['事件', '竖虚线止于数据区上方；编号对应下方列表'],
      ['插值', '单调三次插值，曲线不越过相邻两点的高低'],
      ['末点标签', '每序列只在整体末点标一次；按 y 排序强制 13px 间距']
    ]))}
    ${notice('数值以报告单为准；图上不显示参考区间，也不做"正常/异常"染色。', 'plain')}`;
}

function render() {
  const p = P();
  const label = (PAGES.find(x => x[0] === state.view) || PAGES[0])[1];
  const subs = SUBPAGES[state.view];
  const sub = curSub();

  $('#nav').innerHTML = PAGES.map(([k, name, ic]) => `<button class="nav-button" data-view="${k}" ${state.view === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${esc(name)}</span>${k === 'family' && p.genotype.kind === 'variant' ? `<span class="nav-count">${p.family.length}</span>` : ''}</button>`).join('');
  $('#breadcrumb').textContent = subs ? `${label} / ${sub}` : label;
  $('#profile-name').textContent = `${p.name.slice(0, 1)}先生的资料`;
  $('#profile-meta').textContent = p.meta;
  $('#profile-avatar').textContent = p.name.slice(0, 1);

  const subnav = subs ? `<div class="subnav" role="tablist">${subs.map(s => `<button role="tab" data-sub="${esc(s)}" aria-selected="${s === sub}">${esc(s)}</button>`).join('')}</div>` : '';
  $('#main').innerHTML = `<div class="page-enter">${subnav}${renderPage()}</div>`;
  $('#app-version').textContent = APP_INFO.displayVersion;
  $('#app-build').textContent = APP_INFO.build;
  $('#ver-chip').textContent = APP_INFO.displayVersion;
  if (agentOpen()) renderAgent();
}

/* ---------------- AI 面板（五态：未进入 / 可用 / 生成中 / 折叠 / 降级） ---------------- */
function agentDraft() {
  const p = P();
  const label = (PAGES.find(x => x[0] === state.view) || PAGES[0])[1];
  const lines = [];
  lines.push(`【页面】${label}${curSub() ? ' / ' + curSub() : ''}`);
  lines.push(`【档案】${p.name}，${p.age} 岁，${p.genotype.kind === 'variant' ? '遗传型 ATTRv' : '野生型 ATTRwt'}`);
  if (state.view === 'timeline' || state.view === 'labs') {
    ['ntprobnp', 'egfr', 'nyha'].forEach(k => {
      const m = p.metrics.find(x => x.key === k);
      const last = m.points.slice(-1)[0];
      lines.push(`【${m.name}】${m.kind === 'numeric' ? fmt(last.v_num, m.dec) + ' ' + m.unit : last.v_text}（${last.d}，${last.src}）`);
    });
  }
  if (state.view === 'treatment') {
    p.drugs.forEach(d => lines.push(`【用药】${d[0]} ${d[2]} ${d[3]}，${d[4]} 起${d[5] ? '，' + d[5] + ' 停' : '，在用'}`));
  }
  if (state.view === 'family') {
    lines.push('【家系】家系信息默认不进入草稿；如需带入，请在页面上单独勾选。');
  }
  lines.push('【说明】以上只抄已入档记录，不做推断；私密家系与「我的看法」默认不进入。');
  return lines.join('\n');
}

/* ---------------- 开发版新增：草稿交付（pinky:agent-draft 合同，AGENT-PANE-DESIGN §7） ----------------
   链路：预览弹窗 → postMessage({type:'pinky:agent-draft', prompt}) → 宿主面板校验
   source/origin → 填进原生会话草稿框 → **用户自己按回车**。没有任何一步替用户发送。
   两条边界：
   1. prompt 截到 8000 字（合同上限），截断时明说；
   2. 独立启动（npm start）没有父窗口：退化为复制草稿，不假装有 AI。
   宿主侧监听端（rememberDraft/flushDraft 队列 + ensureSession）属于宿主面板代码，
   本仓库不可测——列入 M6 装机验证的交互层，这里不假装它已经存在。 */
const AGENT_PROMPT_MAX = 8000;
const inHost = () => typeof window !== 'undefined' && window.parent && window.parent !== window;

/** 交付草稿。返回 'posted' | 'no-parent'，调用方据此给不同的提示（不谎报成功）。 */
function deliverAgentDraft(prompt) {
  const text = String(prompt);
  const clipped = text.length > AGENT_PROMPT_MAX
    ? `${text.slice(0, AGENT_PROMPT_MAX)}\n\n（草稿超过 ${AGENT_PROMPT_MAX} 字，超出部分已截断；完整内容在左侧页面里。）`
    : text;
  if (!inHost()) return 'no-parent';
  try {
    window.parent.postMessage({ type: 'pinky:agent-draft', prompt: clipped }, window.location.origin);
    return 'posted';
  } catch {
    return 'no-parent';
  }
}

/** 预览弹窗：先看全文再交付（合同 §7.1——预览可看，交付由用户点）。 */
function agentPreviewDialog() {
  const draft = agentDraft();
  const hasHost = inHost();
  openDialog('本页上下文草稿', '与 AI 讨论',
    `<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.7;margin:0">${esc(draft)}</pre>
     <p class="small-note">只抄已入档记录；私密家系与「我的看法」不在其中。填入输入框后<b>由你自己按回车</b>，工作台不会替你发送。</p>`,
    `${hasHost ? `<button class="primary" data-action="agent-send">填入 AI 输入框</button>` : ''}
     <button data-action="agent-copy">复制草稿</button>
     <button data-action="close">关闭</button>`);
}

function renderAgent() {
  const body = $('#agent-body');
  if (!body) return;
  const draft = agentDraft();
  body.innerHTML = `<div class="agent-note">这里只生成<b>上下文草稿</b>：不连接模型、不替你发送。点「整理本页要点」预览后，填入 DSH 原生输入框，由你按回车。</div>
    <div class="agent-card"><h4>本页上下文草稿</h4><pre>${esc(draft)}</pre></div>
    <div class="agent-check"><span class="pass">✓ 只抄已入档记录</span><span class="pass">✓ 家系信息未带入</span><span class="pass">✓ 不含本机目录路径</span></div>`;
  const ph = state.agentPhase, open = ph === 'open';
  const grid = $('#work-grid');
  const dock = $('#agent-dock');
  if (dock) dock.hidden = !open;
  grid.classList.toggle('agent-open', open);
  const sp = $('#agent-splitter');
  if (sp) sp.hidden = !open;          // 分隔条只在面板展开时可拖
  if (open) applyAgentWidth();
  const btn = $('#agent-toggle');
  const label = AGENT_LABEL[ph] || AGENT_LABEL.idle;
  if (btn) {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', `AI 对话：${label}`);
    btn.disabled = (ph === 'connecting' || ph === 'unavailable');
    const span = $('#agent-label'); if (span) span.textContent = label;
    const dot = btn.querySelector('i');
    if (dot) { dot.classList.toggle('grey', !open); dot.classList.toggle('on', open); }
  }
  const hide = $('#agent-hide'); if (hide) hide.hidden = !open;         // × 只在展开时出现
  const hint = $('#top-hint'); if (hint) hint.textContent = AGENT_HINT[ph] || AGENT_HINT.idle;
  const dot2 = $('#agent-dot'); if (dot2) dot2.classList.toggle('on', open);
  /* 装进 Desktop 时整组会话控件收起：顶栏那个「AI 对话」按钮由面板外壳提供（在 iframe 外面的
     那一条 headers 里）。这里留一个灰按钮只会让人以为坏了两处。 */
  if (state.hosted) {
    if (btn) btn.hidden = true;
    if (hide) hide.hidden = true;
    if (hint) hint.textContent = 'AI 会话在右侧（宿主面板提供，可拖宽/收起）；本页只负责记录与整理。';
  }
}

/* ---------------- AI 会话：五态文案（与 prompts/DSH-WORKBENCH-TOP-BAR.md §5 的按钮文案表一致） ----------------
   状态机只用这五个词，不自造文案：
   idle 无会话 / connecting 连接中（禁用，防重复创建）/ open 已展开（点它＝收起面板，不结束会话）
   closed 已收起（点它＝回到同一会话，草稿还在）/ unavailable 服务缺失（禁用并在说明里写降级原因）。 */
const AGENT_LABEL = { idle: 'AI 对话', connecting: '正在连接…', open: '收起 AI 对话', closed: '打开 AI 对话', unavailable: 'AI 对话暂不可用' };
const AGENT_HINT = {
  idle: '点「AI 对话」打开右侧会话面板；× 只是收起，不会结束会话。',
  connecting: '正在调起会话…（此时按钮禁用，避免重复创建）。',
  open: '可拖动中间那条分隔条调整面板宽度（25%–45%），键盘 ←/→ 也行；× 只是收起，不会结束会话。',
  closed: '会话还在，点「打开 AI 对话」回到刚才那一段；不会重新开始。',
  unavailable: '宿主没有提供原生会话：可用面板里的「整理本页要点」复制提示词，粘贴到会话里发送。'
};
const agentOpen = () => state.agentPhase === 'open';

/* ---------------- 面板宽度：拖动分隔条 / 键盘 / 窄标准宽 / 记忆 ----------------
   比例存在 state.agentRatio（占工作区宽度），渲染时换算成像素写进 CSS 变量 --agent-w。
   宽度数字只有 AGENT_PANE 一份（接口下发，兜底值同源 lib/layout.js），客户端不再写死 320/380/500。 */
function clampRatio(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return AGENT_PANE.def;
  return Math.min(AGENT_PANE.max, Math.max(AGENT_PANE.min, n));
}
function readStoredRatio() {
  try {
    const v = Number(localStorage.getItem(AGENT_STORE_KEY));
    return Number.isFinite(v) && v > 0 ? clampRatio(v) : null;
  } catch { return null; }
}
function storeRatio(r) {
  try { localStorage.setItem(AGENT_STORE_KEY, String(r)); } catch { /* 隐私模式/禁存：不影响本次会话 */ }
}
function gridWidth() {
  const g = $('#work-grid');
  const rect = g && typeof g.getBoundingClientRect === 'function' ? g.getBoundingClientRect() : null;
  return rect && rect.width ? rect.width : 0;
}
function applyAgentWidth() {
  const grid = $('#work-grid'), sp = $('#agent-splitter');
  if (!grid) return;
  const ratio = clampRatio(state.agentRatio);
  const total = gridWidth();
  /* 宽度未知（首帧/无布局的测试环境）时按 1000px 基准换算，保证变量仍是合法像素值 */
  grid.style.setProperty('--agent-w', `${Math.round((total || 1000) * ratio)}px`);
  if (sp) {
    sp.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    sp.setAttribute('aria-valuetext', `会话面板占 ${Math.round(ratio * 100)}%`);
  }
  $$('.agent-sizes button').forEach((b) => {
    const want = AGENT_PANE.presets ? AGENT_PANE.presets[b.dataset.size] : null;
    b.setAttribute('aria-pressed', String(want !== null && want !== undefined && Math.abs(want - ratio) < 0.02));
  });
}
function setAgentRatio(r, persist = true) {
  state.agentRatio = clampRatio(r);
  if (persist) storeRatio(state.agentRatio);
  applyAgentWidth();
}
function initSplitter() {
  const sp = $('#agent-splitter'), grid = $('#work-grid');
  if (!sp || !grid || typeof sp.addEventListener !== 'function') return;
  const onMove = (e) => {
    const rect = typeof grid.getBoundingClientRect === 'function' ? grid.getBoundingClientRect() : null;
    if (!rect || !rect.width) return;
    setAgentRatio((rect.right - e.clientX) / rect.width, false);   // 拖动中不写 localStorage，松手再存
  };
  const stop = () => {
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', stop);
    }
    if (grid.classList) grid.classList.remove('agent-dragging');
    if (document.body && document.body.classList) document.body.classList.remove('agent-dragging');
    storeRatio(state.agentRatio);
  };
  sp.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (grid.classList) grid.classList.add('agent-dragging');
    if (document.body && document.body.classList) document.body.classList.add('agent-dragging');
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', stop);
    }
  });
  sp.addEventListener('keydown', (e) => {
    /* step 是比例（layout.js：每次 2%），不是像素——别除 gridWidth，除完每按一次只动 0.0017%，等于没反应 */
    const step = AGENT_PANE.step || 0.02;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setAgentRatio(state.agentRatio + step); }        // 面板变宽
    else if (e.key === 'ArrowRight') { e.preventDefault(); setAgentRatio(state.agentRatio - step); }   // 面板变窄
    else if (e.key === 'Home') { e.preventDefault(); setAgentRatio(AGENT_PANE.min); }
    else if (e.key === 'End') { e.preventDefault(); setAgentRatio(AGENT_PANE.max); }
  });
  /* 窗口变宽变窄后按同一比例重算像素，避免面板吃掉整个业务区 */
  if (typeof window.addEventListener === 'function') window.addEventListener('resize', () => { if (agentOpen()) applyAgentWidth(); });
}

/* 顶栏主按钮与「×」共用这一个动作：它只切换面板显隐，不创建/销毁会话。
   无会话时先 idle → connecting（按钮禁用，防重复创建）→ open。 */
function toggleAgent() {
  const ph = state.agentPhase;
  if (ph === 'connecting' || ph === 'unavailable') return;
  if (ph === 'open') { state.agentPhase = 'closed'; renderAgent(); return; }  // 收起：会话仍在
  if (ph === 'closed') { state.agentPhase = 'open'; renderAgent(); return; }  // 回到同一会话
  state.agentPhase = 'connecting'; renderAgent();
  setTimeout(() => { if (state.agentPhase === 'connecting') { state.agentPhase = 'open'; renderAgent(); } }, 600);
}

/* ---------------- 弹窗 ---------------- */
function openDialog(title, eyebrow, body, foot = '') {
  $('#dialog-title').textContent = title;
  $('#dialog-eyebrow').textContent = eyebrow;
  $('#dialog-body').innerHTML = body;
  $('#dialog-foot').innerHTML = foot || `<button data-action="close">关闭</button>`;
  const d = $('#dialog');
  if (!d.open) d.showModal();
}
function closeDialog() { const d = $('#dialog'); if (d.open) d.close(); }

function settingsDialog(tab = '工作区') {
  const tabs = ['工作区', '显示与字号', '隐私', '关于'];
  const body = `<div class="cfg-tabs" role="tablist">${tabs.map(t => `<button role="tab" data-cfg="${t}" aria-selected="${t === tab}">${t}</button>`).join('')}</div>
  <div style="margin-top:14px">${cfgBody(tab)}</div>`;
  openDialog('设置', '小甲宝 ATTR-Pal', body, `<button data-action="close">完成</button>`);
}
function cfgBody(tab) {
  if (tab === '显示与字号') {
    return `<div class="cfg-block"><h3>字号</h3><p class="small-note">三档：标准 1 / 大 1.15 / 超大 1.32（--tz 全局倍率）。</p>
      <div class="path-row">${['标准', '大', '超大'].map((x, i) => `<button class="${i === 0 ? 'primary' : 'soft'}" data-action="font-set" data-tz="${[1, 1.15, 1.32][i]}">${x}</button>`).join('')}</div>
      <p class="small-note" style="margin-top:10px">SVG 图内文字不随档位缩放（刻度/末点/事件），否则 13px 避让几何会失算。这个代价写在 docs/DEV-REQUIREMENTS-2026-10-21.md。</p></div>`;
  }
  if (tab === '隐私') {
    return `<div class="cfg-block"><h3>家系信息</h3>
      <div class="check-row"><input type="checkbox" id="cfg-family"> 允许家系信息进入 AI 上下文草稿（默认关闭）</div>
      <p class="small-note">关闭时：家系页仍可查看，但草稿、摘要、导出都不带成员与检测结果。私密记录默认 fail-closed。</p>
      <div class="divider"></div><h3>我的看法</h3><p class="small-note">默认不进趋势、不进摘要事实区；只在本页与你自己可见的地方出现。</p></div>`;
  }
  if (tab === '关于') {
    return `<div class="about"><div class="about-meta"><div class="about-ver"><b>${APP_INFO.displayVersion}</b>${pill(APP_INFO.channelLabel, 'violet')}</div>
      <dl><div><dt>全称</dt><dd>转甲状腺素蛋白淀粉样变性（ATTR）· 患者记录助手</dd></div><div><dt>构建</dt><dd>${APP_INFO.build}</dd></div><div><dt>形态</dt><dd>开发版 · 本机 sqlite 优先 · 演示档案为模拟数据</dd></div><div><dt>演示档案</dt><dd>2 套 × 6 个月（模拟）</dd></div>
      <div><dt>临床库</dt><dd>434 条登记摘录（CT.gov 418 + CDE 16），2026-10-21</dd></div>
      <div><dt>未做的</dt><dd>未接入 DSH、未装机、未查 ChiCTR/ICTRP、未做患者访谈</dd></div>
      <div><dt>立场</dt><dd>只提供信息，不做诊断与处置建议</dd></div></dl></div></div>`;
  }
  return `<div class="cfg-block"><h3>资料目录</h3>
    <div class="path-row"><code>~/Documents/ATTR-Pal 演示资料（原型不读写真实文件）</code><button class="soft" data-action="mock-dir">更换</button></div>
    <p class="small-note">开发版必须由你明确选择目录，不猜路径、不静默建目录；原件留在目录内，不上传。</p>
    <div class="divider"></div><h3>解析与临床库</h3>
    <div class="grid three"><div class="stat-tile"><span>文档解析</span><b>未接入</b></div><div class="stat-tile"><span>临床库</span><b>434 条</b></div><div class="stat-tile"><span>数据截止</span><b>2026-10-21</b></div></div>
    <p class="small-note">解析结果永远是候选；失败不产生候选，原件保留可重试。</p></div>`;
}

function profileDialog() {
  const body = Object.entries(PROFILES).map(([k, p]) => `<button class="profile-row ${state.profile === k ? 'on' : ''}" data-action="pick-profile" data-profile="${k}">
    <div><b>${esc(p.name)} · ${esc(p.meta)}</b><p>${esc(p.headline)}</p></div><span class="profile-caret">${state.profile === k ? '当前' : '切换'}</span></button>`).join('');
  openDialog('演示档案', '两套档案，结构同构', body, `<button data-action="close">关闭</button>`);
}

function helpDialog() {
  openDialog('操作说明', 'G2 闸口材料', `<div class="flag-list">
    <div>左侧 12 个一级页，页内有二级页签；每个页签内容一一对应。</div>
    <div>顶栏「AI 对话」打开右侧面板，可切窄/标准/宽、可收起；原型只生成草稿，不发送。</div>
    <div>「病情一图秀」左侧可勾选序列（最多 3 项），数值线各自一条纵轴，分类节点不连线。</div>
    <div>指标卡点一下翻到背面看迷你折线；分类指标卡不可翻转。</div>
    <div>「大字 Aa」切换字号档位；设置里可分母级调整。</div>
    <div>右上角版本 chip 打开「关于」，版本号与页脚同源。</div>
  </div>`, `<button data-action="close">知道了</button>`);
}

/* ---------------- 交互 ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 2200);
}

function setView(v) {
  if (!PAGES.some(x => x[0] === v)) return;
  state.view = v;
  state.flip = '';
  render();
  /* 进入要有真实数据的两页时拉一次；同一档案只拉一次（loadedFor 判重） */
  if (v === 'records') refreshImports();
  /* 生活与照护：照护者记录要真实数据；同一档案只拉一次（loadedFor 判重） */
  if (v === 'life') refreshCaregiver();
  const main = $('#main');
  if (main && typeof main.scrollIntoView === 'function') main.scrollIntoView({ block: 'start' });
}
function setSub(s) {
  state.sub[state.view] = s;
  state.flip = '';
  render();
  if (state.view === 'records') refreshImports();
  if (state.view === 'life' && s === '情绪与照护者') refreshCaregiver();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action],[data-view],[data-sub],[data-cfg]');
  if (!el) return;
  if (el.dataset.view) { setView(el.dataset.view); return; }
  if (el.dataset.sub) { setSub(el.dataset.sub); return; }
  if (el.dataset.cfg) { settingsDialog(el.dataset.cfg); return; }
  const a = el.dataset.action;
  if (a === 'agent') { toggleAgent(); return; }
  if (a === 'agent-size') {
    const size = el.dataset.size;
    const want = AGENT_PANE.presets ? AGENT_PANE.presets[size] : null;
    if (want) { state.agentSize = size; setAgentRatio(want); }
    return;
  }
  if (a === 'agent-build') { agentPreviewDialog(); return; }
  if (a === 'agent-send') {
    const r = deliverAgentDraft(agentDraft());
    if (r === 'posted') { closeDialog(); toast('草稿已交付宿主面板；请检查内容后自己按回车'); }
    else { toast('当前没有宿主会话可填入，已改为复制草稿'); }
    return;
  }
  if (a === 'agent-copy') {
    writeClipboard(agentDraft())
      .then(() => toast('草稿已复制到剪贴板'))
      .catch((err) => toast(`复制失败：${(err && err.message) || '未知原因'}`));
    return;
  }
  if (a === 'agent-demo') {
    $('#agent-body').insertAdjacentHTML('beforeend', `<div class="agent-card"><h4>模拟回复（演示）</h4><pre>我看到你在「${esc((PAGES.find(x => x[0] === state.view) || [])[1])}」。原型没有连接模型，这条是占位回复；开发版会把草稿填入原生输入框，由你按回车。</pre></div>`);
    toast('模拟回复已插入（未调用模型）');
    return;
  }
  if (a === 'flip') {
    const k = el.dataset.metric;
    if (el.dataset.static === '1') { toast('分类指标卡不可翻转'); return; }
    state.flip = state.flip === k ? '' : k;
    render();
    return;
  }
  if (a === 'pick') {
    const k = el.dataset.metric;
    const on = el.checked;
    if (on) {
      const nums = state.sel.filter(x => (P().metrics.find(m => m.key === x) || {}).kind === 'numeric');
      const isNum = (P().metrics.find(m => m.key === k) || {}).kind === 'numeric';
      if (state.sel.length >= 3) { el.checked = false; toast('最多同时看 3 项'); return; }
      if (isNum && nums.length >= 2) { el.checked = false; toast('数值线最多两条（左右各一条轴）'); return; }
      state.sel = [...state.sel, k];
    } else {
      state.sel = state.sel.filter(x => x !== k);
    }
    render();
    return;
  }
  if (a === 'chart-reset') { state.sel = ['ntprobnp', 'egfr', 'nyha']; render(); return; }
  if (a === 'profiles') { profileDialog(); return; }
  if (a === 'pick-profile') {
    state.profile = el.dataset.profile;
    state.flip = '';
    state.sel = ['ntprobnp', 'egfr', 'nyha'];
    closeDialog(); render(); toast(`已切换到 ${PROFILES[state.profile].name}`);
    return;
  }
  if (a === 'settings' || a === 'open-store') { settingsDialog('工作区'); return; }
  if (a === 'about') { settingsDialog('关于'); return; }
  if (a === 'help') { helpDialog(); return; }
  if (a === 'close') { closeDialog(); return; }
  if (a === 'mock-upload') { toast('原型不上传真实文件；开发版会要求先选择资料目录'); return; }
  if (a === 'refresh-cands') { refreshImports(true); return; }
  if (a === 'parse-doc') {
    /* 解析要几十秒：按钮先锁住，回来后整段刷新。失败时把服务端错误原文显示出来
       （常见是 Token 失效 / 原件被移走），不吞成一句"解析失败"。 */
    const id = el.dataset.id;
    el.disabled = true;
    const old = el.textContent;
    el.textContent = '解析中…';
    apiPost('/api/import/parse', { profileKey: state.profile, docId: id })
      .then((j) => {
        const n = (j.candidates || []).length;
        toast(`解析完成：${n} 条候选${j.reportDate ? `，日期 ${j.reportDate}` : '，没识别到日期'}`);
        if (j.warnings && j.warnings.length) console.warn('[import]', j.warnings);
      })
      .catch((err) => toast(`解析失败：${(err && err.message) || '未知原因'}`))
      .finally(() => { el.disabled = false; el.textContent = old; refreshImports(true); });
    return;
  }
  if (a === 'accept-cand' || a === 'reject-cand') {
    const id = el.dataset.id;
    const path = a === 'accept-cand' ? '/api/import/candidates/accept' : '/api/import/candidates/reject';
    el.disabled = true;
    apiPost(path, { profileKey: state.profile, id })
      .then((j) => {
        /* 接受后服务端把该档案的指标形状回给我们：直接换本地，不自己拼点 */
        if (a === 'accept-cand' && j.metrics && PROFILES[state.profile]) PROFILES[state.profile].metrics = j.metrics;
        toast(a === 'accept-cand' ? `已入档：${j.metricKey} ${j.value}（${j.d}）` : '已标为「不要」，记录留着');
      })
      .catch((err) => toast(err.field ? `${err.field}：${err.message}` : `操作失败：${err.message}`))
      .finally(() => { el.disabled = false; refreshImports(true); });
    return;
  }
  if (a === 'accept') {
    el.textContent = '已接受';
    el.disabled = true;
    toast('已接受为记录（原型不落库）');
    return;
  }
  if (a === 'mock-dir') { toast('原型不读写真实目录'); return; }
  if (a === 'font-set') { setFont(Number(el.dataset.tz)); return; }
  if (a === 'copy-summary') {
    /* 门诊摘要：服务端生成（家系与看法在 export.js 按构造排除），复制到剪贴板。
       文本与「病情汇总」页同源；拿不到剪贴板权限时弹窗给出全文，手动复制也行。 */
    const btn = el;
    btn.disabled = true;
    apiGet(`/api/export/summary?profile=${encodeURIComponent(state.profile)}`)
      .then((j) => writeClipboard(j.text)
        .then(() => toast('摘要已复制到剪贴板（不含家系信息）'))
        /* 剪贴板写不进去（权限/旧内核）时不吞掉内容：弹窗给全文，用户手动全选 */
        .catch(() => textDialog('门诊摘要（请手动全选复制）', j.text)))
      .catch((err) => toast(`复制失败：${(err && err.message) || '未知原因'}`))
      .finally(() => { btn.disabled = false; });
    return;
  }
  if (a === 'copy-family') { toast('家系导出需在设置里单独勾选后才会可用（最高敏感级，默认不可导）'); return; }
  if (a === 'build-visit') { toast('已在「复诊准备 → 就诊准备」生成草稿（演示）'); return; }
  if (a === 'add-question' || a === 'edit-genotype' || a === 'edit-diagnosis' || a === 'toggle-family' || a === 'save-trial') { toast('开发版开放此操作；原型只演示形态'); return; }
});

$('#dialog').addEventListener('click', (e) => { if (e.target.id === 'dialog') closeDialog(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDialog(); });

/* 血压录入：表单每次 render 都会重建，所以监听挂在 document 上做委托，
   不给 #bp-form 直接绑（绑了会随重渲染一起丢）。 */
document.addEventListener('submit', (e) => {
  const target = e.target;
  /* 上传：body 就是文件字节（不套 multipart），文件名/日期/类型走 query。
     服务端按（档案, sha256）去重，重复导入返回 duplicate=true，不新建文档。 */
  const upForm = target.closest && target.closest('#upload-form');
  if (upForm) {
    e.preventDefault();
    const f = new FormData(upForm);
    const file = f.get('file');
    if (!file || !file.name) { toast('先选一份文件'); return; }
    const qs = new URLSearchParams({ profile: state.profile, name: file.name });
    const date = String(f.get('date') || '').trim();
    const type = String(f.get('type') || '').trim();
    if (date) qs.set('date', date);
    if (type) qs.set('type', type);
    const btn = upForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '上传中…'; }
    let p;
    try {
      p = fetch(`${apiBase()}/api/import/upload?${qs.toString()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: file,
      });
    } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw Object.assign(new Error((j && j.message) || `HTTP ${r.status}`), { code: j && j.error });
        if (j.duplicate) toast('这份文件之前已经导入过（按文件指纹去重），没有新建第二份');
        else toast(`已保存原件：${j.document.name}。下一步点「解析」。`);
        upForm.reset();
      })
      .catch((err) => toast(err.code === 'no_workspace'
        ? '还没有选择资料目录，原件没有地方放'
        : `上传失败：${err.message}`))
      .finally(() => {
        if (btn) { btn.disabled = false; btn.textContent = '上传到资料目录'; }
        refreshImports(true);
      });
    return;
  }

  /* 手填候选：只进候选层，与解析出来的候选同形，同样要逐项确认 */
  const manForm = target.closest && target.closest('#manual-form');
  if (manForm) {
    e.preventDefault();
    const f = new FormData(manForm);
    const valueText = String(f.get('valueText') || '').trim();
    if (!valueText) { toast('值不能为空'); return; }
    const btn = manForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    apiPost('/api/import/candidates/manual', {
      profileKey: state.profile,
      metricKey: String(f.get('metricKey') || ''),
      valueText,
      unit: String(f.get('unit') || '').trim() || null,
    })
      .then(() => { manForm.reset(); toast('已加为候选，请在下面确认'); })
      .catch((err) => toast(err.field ? `${err.field}：${err.message}` : `添加失败：${err.message}`))
      .finally(() => { if (btn) btn.disabled = false; refreshImports(true); });
    return;
  }

  /* 照护者记录（0.6.0）：写入后立刻用服务端回读的整段替换本地数组，
     前端不自己拼行——自己拼就会和读模型的列顺序错位（与血压那条同一条规矩）。 */
  const cgForm = target.closest && target.closest('#caregiver-form');
  if (cgForm) {
    e.preventDefault();
    const f = new FormData(cgForm);
    const asText = (k) => { const v = f.get(k); return v === null ? null : String(v).trim(); };
    const btn = cgForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    apiPost('/api/caregiver', {
      profileKey: state.profile,
      d: asText('d'),
      who: asText('who'),
      relation: asText('relation'),
      burden: asText('burden'),
      backup: asText('backup'),
      need: asText('need'),
    })
      .then((j) => {
        CAREGIVER.rows = j.rows || [];
        CAREGIVER.loadedFor = state.profile;
        cgForm.reset();
        render();
        toast(`已记一条照护情况${j.row && j.row.d ? '：' + j.row.d : ''}`);
      })
      .catch((err) => {
        toast(err.field ? `${err.field}：${err.message}` : (`保存失败：${err.message}`));
        const input = err.field && cgForm.querySelector(`[name="${err.field}"]`);
        if (input && typeof input.focus === 'function') input.focus();
      })
      .finally(() => {
        if (btn) { btn.disabled = false; btn.textContent = '记一条'; }
      });
    return;
  }

  const form = target.closest && target.closest('#bp-form');
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const asText = (k) => { const v = f.get(k); return v === null ? null : String(v).trim(); };
  const payload = {
    profileKey: state.profile,
    d: asText('d'),
    position: asText('position'),
    sys: asText('sys'),
    dia: asText('dia'),
    pulse: asText('pulse'),
    symptom: asText('symptom'),
    drugNote: asText('drugNote'),
  };
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
  apiPost('/api/bp', payload)
    .then((j) => {
      /* 用服务端回读的整段替换本地数组：写入后立刻回读，前端不自己拼行
         （自己拼就会和读模型的列顺序错位） */
      const p = PROFILES[state.profile];
      if (p && Array.isArray(j.bp)) p.bp = j.bp;
      form.reset();
      render();
      toast(`已记一条：${j.row ? `${j.row.d} ${j.row.position || '未记体位'} ${j.row.sys}/${j.row.dia}` : '血压'}`);
    })
    .catch((err) => {
      toast(err.field ? `${err.field}：${err.message}` : (`保存失败：${err.message}`));
      const input = err.field && form.querySelector(`[name="${err.field}"]`);
      if (input && typeof input.focus === 'function') input.focus();
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = '记一条'; }
    });
});

function setFont(tz) {
  document.documentElement.style.setProperty('--tz', tz);
  $('#font-toggle').setAttribute('aria-pressed', String(tz > 1));
  toast(`字号已切到 ${tz === 1 ? '标准' : tz === 1.15 ? '大' : '超大'}`);
}
let fontStep = 0;
$('#font-toggle').addEventListener('click', () => {
  fontStep = (fontStep + 1) % 3;
  setFont([1, 1.15, 1.32][fontStep]);
});

/* ---------------- 启动（原型：顶层同步 render()；开发版：数据到位后再 render） ---------------- */
state.sub = Object.fromEntries(Object.entries(SUBPAGES).map(([k, v]) => [k, v[0]]));
document.documentElement.style.setProperty('--tz', 1);
/* 版本号写回顶栏 chip 与页脚；bootstrap 没给就用 APP_INFO 里的默认值。 */
function applyVersion() {
  const chip = $('#ver-chip'), av = $('#app-version'), ab = $('#app-build');
  if (chip) chip.textContent = APP_INFO.displayVersion;
  if (av) av.textContent = APP_INFO.displayVersion;
  if (ab) ab.textContent = APP_INFO.build;
}
function init() {
  applyVersion();
  /* 面板宽度：上次拖到/选到的比例优先，默认 35%（layout.js 的 def） */
  const remembered = readStoredRatio();
  if (remembered) state.agentRatio = remembered;
  initSplitter();
  render();
}
/* 数据彻底拿不到时，#main 给出明确说明，不留白屏 */
function bootFail(err) {
  const main = $('#main');
  const why = (err && err.message) ? err.message : String(err);
  if (main) main.innerHTML = `<div class="card" style="max-width:640px;margin:26px auto">
    <div class="card-head"><h2>没能载入工作台数据</h2></div>
    <p style="font-size:12.5px">后端接口 <code>/api/bootstrap</code> 未返回可用数据，页面上也没有可回退的演示数据。</p>
    <p class="small-note">原因：${esc(why)}。请确认服务已启动（<code>/api/bootstrap</code> 可访问）后刷新页面；资料本身不会丢失。</p></div>`;
  if (typeof console !== 'undefined' && console.error) console.error('[attrpal] bootstrap 失败：', err);
}
const bootReady = loadBootstrap().then((data) => { buildData(data); init(); }).catch(bootFail);
