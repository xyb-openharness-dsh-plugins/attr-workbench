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

export function createHandler({ workbench }) {
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const path = url.pathname;

    const json = (code, body) => {
      const buf = Buffer.from(JSON.stringify(body), 'utf8');
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
      res.end(buf);
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

    if (path.startsWith('/api/')) return json(404, { error: 'not_found', path });

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
