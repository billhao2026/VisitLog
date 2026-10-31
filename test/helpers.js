// 测试辅助：起一个隔离的服务实例（独立数据库 + 独立端口），供各测试文件使用
//
// 隔离策略：
//   - 复制整个项目到系统临时目录（排除 data/audio/models/node_modules）
//   - 在副本里启动服务，数据库落在副本的 data/ 下，与真实数据完全隔离
//   - 测试结束后销毁副本
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

// 复制项目到临时目录（排除运行时产物）
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visitlog-test-'));
  const skip = new Set(['data', 'audio', 'models', 'node_modules', '.git', 'test']);
  for (const entry of fs.readdirSync(ROOT)) {
    if (skip.has(entry)) continue;
    fs.cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  // 空目录占位，保证 gitignore 语义一致
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'audio', 'raw'), { recursive: true });
  return dir;
}

function req(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
      host: '127.0.0.1', port, path, method,
      timeout: 15000,
      headers: data ? { 'Content-Type': 'application/json' } : {},
    }, (res) => {
      let b = '';
      res.on('data', d => (b += d));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(b); } catch (e) { j = { raw: b }; }
        resolve({ status: res.statusCode, body: j });
      });
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('请求超时')); });
    if (data) r.write(data);
    r.end();
  });
}

async function waitReady(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await req(port, 'GET', '/api/stats');
      if (r.status === 200 && r.body && r.body.ok) return true;
    } catch (e) { /* 还没起来，继续等 */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`服务在 ${timeoutMs}ms 内未就绪（端口 ${port}）`);
}

/**
 * 启动一个隔离的服务实例
 * @returns {Promise<{port:number, dir:string, get:Function, post:Function, stop:Function}>}
 */
async function startServer(opts = {}) {
  const dir = opts.dir || makeSandbox();
  const port = opts.port || (10000 + Math.floor(Math.random() * 40000));
  const proc = spawn(process.execPath, ['server/server.js'], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), VL_OWNER: '测试员' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', d => { log += d.toString(); });
  proc.stderr.on('data', d => { log += d.toString(); });

  const stop = async () => {
    try { proc.kill('SIGTERM'); } catch (e) { /* 已退出 */ }
    await new Promise(r => setTimeout(r, 300));
    if (!opts.keepDir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  };

  try {
    await waitReady(port);
  } catch (e) {
    await stop();
    throw new Error(`${e.message}\n--- 服务日志 ---\n${log}`);
  }

  return {
    port, dir, log: () => log,
    get: (p) => req(port, 'GET', p),
    post: (p, b) => req(port, 'POST', p, b),
    del: (p) => req(port, 'DELETE', p),
    stop,
  };
}

// 用例结束后自动清理
function withServer(fn) {
  return async (t) => {
    const s = await startServer();
    t.after(async () => { await s.stop(); });
    await fn(s, t);
  };
}

module.exports = { makeSandbox, req, waitReady, startServer, withServer, ROOT };
