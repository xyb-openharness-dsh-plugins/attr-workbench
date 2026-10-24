/* HTTP 层：一个 /api 前缀的 JSON 接口 + public/ 静态文件。零依赖，只用 node:http / node:fs。
 *
 * 三件事这里说了算，别处不许再定一遍：
 * 1. 静态文件只在 public/ 目录内解析；`..` 一律拦掉（路径穿越），解析结果必须仍在根目录里。
 * 2. 未知 /api/* 返回 JSON 404，不返回 HTML（前端按 JSON 解析，收到 HTML 会报很难查的错）。
 * 3. assertWorkspacePath：资料目录必须由用户选定——主目录 / 桌面 / 下载根目录、/tmp、/var
 *    都在拒绝清单里，父目录不存在时不静默创建，把可读错误交回调用方去提示用户。
 *
 * ATTR 的挂载路径是 `/api/attr`（见 dsh/index.js 的 API_PREFIX）；这一份处理器
 * 同时被「独立 dev-server」与「DSH 宿主 apply()」复用，避免"本地能开、装进 Desktop 就 404"。
 */

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* ---------------- 工作区路径校验 ---------------- */

/** 返回人类可读的问题；空数组＝可以用。调用方负责把问题提示给用户，这里不帮用户"猜一个目录"。 */
export function workspaceProblems(p) {
  if (typeof p !== 'string' || !p.trim()) return ['资料目录不能为空：需要你明确选择一个目录'];
  const target = resolve(p);
  const home = resolve(homedir());
  const problems = [];
  if (target === home) problems.push('不能用主目录当资料目录（会和个人文件混在一起）');
  if (target === '/tmp' || target.startsWith('/tmp' + sep) || target === '/var' || target.startsWith('/var' + sep)) {
    problems.push('不能用 /tmp 或 /var：系统可能会清理，资料会丢');
  }
  for (const name of ['Desktop', 'Downloads', 'Documents']) {
    const d = join(home, name);
    if (target === d) problems.push(`不能用「${name}」根目录当资料目录：请在它下面新建一个目录`);
  }
  if (!existsSync(dirname(target))) problems.push(`上级目录不存在：${dirname(target)}（不自动创建，请确认你选的位置）`);
  return problems;
}

/** 校验版：不合法就抛 Error。启动流程用它拦在打开数据库之前。 */
export function assertWorkspacePath(p) {
  const problems = workspaceProblems(p);
  if (problems.length) throw new Error(problems.join('；'));
  return resolve(p);
}

/* ---------------- 静态文件 ---------------- */

function safeJoin(root, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = clean.replace(/^\/+/, '');
  const full = resolve(root, rel || 'index.html');
  // 解析后必须仍在 root 内（含 root 自身）
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

function sendFile(res, file) {
  try {
    const st = statSync(file);
    if (!st.isFile()) return false;
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
    });
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- 请求体 ---------------- */

/**
 * 读 JSON 请求体。三条边界：
 * 1. 有体积上限（默认 1MB），超了直接 413——不做"先读完再判断"，那是被大请求打死的经典写法；
 * 2. 不是 JSON 就抛错，由路由转 400，不静默当空对象（空对象会被当成"全都合法"写进事实层）；
 * 3. 只在 POST/PUT 上用；GET 不读体。
 */
export function readJsonBody(req, { limitBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error(`请求体超过 ${limitBytes} 字节`), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** 读原始字节（上传原件用）。上限默认 32MB：MinerU 单文件 200MB，但实际化验单远小于此。 */
export function readRawBody(req, { limitBytes = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error(`文件超过 ${limitBytes} 字节`), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ---------------- 路由 ---------------- */

/**
 * 把 public/ 下的文件按 urlPath 回出去（只读 GET/HEAD，路径穿越已拦）。
 * 独立启动与 DSH 宿主两条链路共用这一份，避免"本地能开、装进 Desktop 就 404"。
 * @returns {boolean} 是否已经写完响应
 */
export function servePublic(req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return true;
  }
  const file = safeJoin(PUBLIC_DIR, urlPath);
  if (file && sendFile(res, file)) return true;
  // 单页应用：未知路径回 index.html，交给前端按 hash 路由
  return sendFile(res, join(PUBLIC_DIR, 'index.html'));
}

export function createHandler({ workbench, prefix = '' }) {
  const handle = async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const rawPath = url.pathname;
    /* 宿主把整段挂在 /api/attr 下，而本地 dev-server 挂在根上。路由只写一份，
       靠 prefix 剥掉（剥不掉就说明不是本工作台的请求，直接 404，不去猜）。 */
    let path = rawPath;
    if (prefix) {
      if (rawPath !== prefix && !rawPath.startsWith(prefix + '/')) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'not_found', path: rawPath }));
      }
      path = rawPath.slice(prefix.length) || '/';
    }

    const json = (code, body) => {
      const buf = Buffer.from(JSON.stringify(body), 'utf8');
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
      res.end(buf);
    };

    /* 导入链路的错误统一收口：ImportError 自带 status/code/field，
       ValidationError（writes.js）是 400 + 字段名，其余当 500 并保留原文。 */
    const fail = (error) => {
      if (error?.name === 'ValidationError') {
        return json(400, { error: 'invalid', field: error.field, message: error.message });
      }
      if (error?.status && error?.code) {
        return json(error.status, { error: error.code, field: error.detail || null, message: error.message });
      }
      return json(500, { error: 'failed', message: error?.message || '未知错误' });
    };

    if (path === '/api/health') return json(200, { ok: true, version: workbench.version });
    if (path === '/api/bootstrap') {
      try {
        return json(200, workbench.bootstrap());
      } catch (error) {
        return json(500, { error: 'bootstrap_failed', message: error.message });
      }
    }

    /* 写入：血压（体位性低血压记录）。校验失败 = 400 + 字段名，界面据此定位输入框；
       不把非法值悄悄改掉——190/120 被改成 0，界面看着正常，回放时是错的。 */
    if (req.method === 'POST' && path === '/api/bp') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        return json(error.statusCode || 400, { error: 'bad_body', message: error.message });
      }
      try {
        const row = workbench.addBp(body);
        return json(200, { ok: true, row, bp: workbench.bpRows(row.profileKey) });
      } catch (error) {
        if (error && error.name === 'ValidationError') {
          return json(400, { error: 'invalid', field: error.field, message: error.message });
        }
        return json(500, { error: 'write_failed', message: error.message });
      }
    }

    /* 照护者记录（0004）：单独端点，不并进 bootstrap。
       bootstrap 的 profiles 必须与原型 demo-data.js 逐字段一致（store.test ③），
       原型里没有这张表，多一个键就红——与 /api/import/* 同一个处理方式。 */
    if (req.method === 'GET' && path === '/api/caregiver') {
      const profileKey = url.searchParams.get('profile') || 'A';
      try {
        return json(200, { ok: true, rows: workbench.caregiverRows(profileKey) });
      } catch (error) {
        return json(500, { error: 'read_failed', message: error.message });
      }
    }

    /* 写入：照护者。校验失败同样是 400 + 字段名，界面据此定位输入框。 */
    if (req.method === 'POST' && path === '/api/caregiver') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        return json(error.statusCode || 400, { error: 'bad_body', message: error.message });
      }
      try {
        const row = workbench.addCaregiver(body);
        /* 写入后立刻回读，前端不自己拼行（自己拼就会和读模型的列顺序错位） */
        return json(200, { ok: true, row, rows: workbench.caregiverRows(row.profileKey) });
      } catch (error) {
        if (error && error.name === 'ValidationError') {
          return json(400, { error: 'invalid', field: error.field, message: error.message });
        }
        return json(500, { error: 'write_failed', message: error.message });
      }
    }

    /* 导出：门诊摘要。家系与看法在 export.js 里按构造排除（只读白名单表）。 */
    if (req.method === 'GET' && path === '/api/export/summary') {
      const profileKey = url.searchParams.get('profile') || 'A';
      try {
        return json(200, workbench.exportSummary(profileKey));
      } catch (error) {
        const notFound = /档案不存在/.test(error.message || '');
        return json(notFound ? 404 : 500, { error: notFound ? 'profile_not_found' : 'export_failed', message: error.message });
      }
    }

    /* ---------------- 导入链路 ---------------- */

    if (req.method === 'GET' && path === '/api/import/documents') {
      const profileKey = url.searchParams.get('profile') || 'A';
      try {
        return json(200, { ok: true, documents: workbench.imports().listDocuments(profileKey) });
      } catch (error) { return fail(error); }
    }

    /* 上传：body 是原始字节（不套 multipart——多一层解析就多一处能把中文文件名弄坏的地方）。
       文件名 / 日期 / 类型走 query。超 32MB 直接 413。 */
    if (req.method === 'POST' && path === '/api/import/upload') {
      const profileKey = url.searchParams.get('profile') || 'A';
      const name = url.searchParams.get('name') || '';
      const date = url.searchParams.get('date') || null;
      const type = url.searchParams.get('type') || null;
      let bytes;
      try {
        bytes = await readRawBody(req);
      } catch (error) {
        return json(error.statusCode || 400, { error: 'bad_body', message: error.message });
      }
      try {
        const saved = workbench.imports().saveDocument({ profileKey, filename: name, bytes, date, type });
        return json(saved.duplicate ? 200 : 201, { ok: true, ...saved });
      } catch (error) { return fail(error); }
    }

    if (req.method === 'POST' && path === '/api/import/parse') {
      let body;
      try {
        body = await readJsonBody(req, { limitBytes: 64 * 1024 });
      } catch (error) {
        return json(error.statusCode || 400, { error: 'bad_body', message: error.message });
      }
      try {
        /* 解析可能要几十秒：不加超时重试、不排队，等云端返回；
           token 默认走 .secrets / env，body 里带 token 只为临时试用（不落库、不写日志）。 */
        const result = await workbench.imports().parseDocument({
          profileKey: body.profileKey || 'A',
          docId: body.docId,
          token: body.token || null,
          modelVersion: body.modelVersion || undefined,
        });
        return json(200, { ok: true, ...result });
      } catch (error) { return fail(error); }
    }

    if (req.method === 'GET' && path === '/api/import/candidates') {
      const profileKey = url.searchParams.get('profile') || 'A';
      try {
        return json(200, {
          ok: true,
          candidates: workbench.imports().listCandidates(profileKey, {
            docId: url.searchParams.get('doc') || null,
            status: url.searchParams.get('status') || null,
          }),
        });
      } catch (error) { return fail(error); }
    }

    if (req.method === 'POST' && path === '/api/import/candidates/accept') {
      let body;
      try { body = await readJsonBody(req, { limitBytes: 16 * 1024 }); } catch (error) {
        return json(error.statusCode || 400, { error: 'bad_body', message: error.message });
      }
      try {
        return json(200, {
          ok: true,
          ...workbench.imports().acceptCandidate({ profileKey: body.profileKey || 'A', id: body.id, date: body.date || null }),
          /* 接受后把该档案的指标形状回给界面，省一次 bootstrap（与 /api/bp 的做法一致） */
          metrics: workbench.bootstrap().profiles?.[body.profileKey || 'A']?.metrics ?? null,
        });
      } catch (error) { return fail(error); }
    }

    if (req.method === 'POST' && path === '/api/import/candidates/reject') {
      let body;
      try { body = await readJsonBody(req, { limitBytes: 16 * 1024 }); } catch (error) {
        return json(error.statusCode || 400, { error: 'bad_body', message: error.message });
      }
      try {
        return json(200, { ok: true, ...workbench.imports().rejectCandidate({ profileKey: body.profileKey || 'A', id: body.id }) });
      } catch (error) { return fail(error); }
    }

    if (req.method === 'POST' && path === '/api/import/candidates/manual') {
      let body;
      try { body = await readJsonBody(req, { limitBytes: 16 * 1024 }); } catch (error) {
        return json(error.statusCode || 400, { error: 'bad_body', message: error.message });
      }
      try {
        return json(201, {
          ok: true,
          ...workbench.imports().addManualCandidate({
            profileKey: body.profileKey || 'A',
            docId: body.docId || null,
            metricKey: body.metricKey,
            valueText: body.valueText,
            unit: body.unit || null,
          }),
        });
      } catch (error) { return fail(error); }
    }

    if (path.startsWith('/api/')) return json(404, { error: 'not_found', path });

    /* 宿主内嵌时页面挂在 `/api/attr/ui/` 下，页面的 `<script src="app.js">` 是**相对路径**，
       浏览器会去请求 `/api/attr/ui/app.js`——剥掉 `ui` 这段才落到 public/app.js。
       2026-10-24 装机探针实测踩过：不加这一条，index.html 能出来（兜底回 index），
       但 app.js 请求也被兜底成 index.html，浏览器拿到 HTML 当 JS 解析 → 业务区整片空白，
       控制台只有一句 "Unexpected token '<'"。本地 dev-server 挂在根上，所以本地永远看不到这个问题。 */
    if (path === '/ui' || path.startsWith('/ui/')) path = path.slice(3) || '/';

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      return res.end();
    }

    const file = safeJoin(PUBLIC_DIR, path);
    if (!file || !sendFile(res, file)) {
      // 单页应用：未知路径回 index.html，交给前端按 hash 路由
      if (sendFile(res, join(PUBLIC_DIR, 'index.html'))) return;
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404');
    }
  };

  /* 兜底：任何未预料的异常都变成 JSON 500，而不是让请求挂着（客户端等成"没反应"）。
     实测踩过：中文文件名走 query 时 URL 解析抛错，浏览器端看到的是空白响应，
     排查时完全不知道服务端出过事——所以这层必须有，且要把原因写出来。 */
  return async function handler(req, res) {
    try {
      await handle(req, res);
    } catch (error) {
      if (res.headersSent) {
        try { res.end(); } catch { /* 响应已开始，只能尽力收尾 */ }
        return;
      }
      const buf = Buffer.from(JSON.stringify({
        error: 'unhandled', message: error?.message || '服务端未预料的错误', path: req.url,
      }), 'utf8');
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
      res.end(buf);
    }
  };
}

/** 起服务。port=0 时由系统分配（测试用），返回实际端口。 */
export function startWorkbenchServer({ port = 4173, host = '127.0.0.1', workbench }) {
  if (!workbench) throw new Error('startWorkbenchServer 需要一个 workbench 实例');
  const server = createServer(createHandler({ workbench }));
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(port, host, () => {
      const actual = server.address().port;
      res({ server, port: actual, host, url: `http://${host}:${actual}/` });
    });
  });
}
