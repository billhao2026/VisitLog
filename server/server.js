// 拜访志 · HTTP 服务（Node 原生，零 express）
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ROOT } = require('./db.js');
const asr = require('./asr.js');
const sens = require('./sensitive.js');
const contacts = require('./contacts.js');
const auth = require('./auth.js');

// 放行前缀（分享页与其 API 自带 token 鉴权；口令登录接口本身）
function isExempt(p) {
  return p === '/api/auth' || p.startsWith('/api/auth/')
    || p.startsWith('/api/share/') || p.startsWith('/s/')
    || p === '/share.html' || p === '/share.css' || p === '/share.js';
}

const PORT = Number(process.env.PORT || 8897);
const PUB = path.join(ROOT, 'public');
const AUDIO_DIR = path.join(ROOT, 'audio', 'raw');

const routes = Object.assign({},
  require('./api_upload.js'),
  require('./api_ai.js'),
  require('./api_meta.js'),
  require('./api_todos.js'),
  require('./api_dict.js'),
  require('./api_extra.js'),
  require('./api_share.js'),
  require('./api_followups_board.js'),
  require('./api_journal.js')
);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function send(res, code, data, type) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

function serveStatic(req, res, urlPath) {
  // 分享页：/s/<token> → public/share.html（token 由前端 API 校验）
  if (urlPath.startsWith('/s/')) {
    const f = path.join(PUB, 'share.html');
    return send(res, 200, fs.readFileSync(f), 'text/html; charset=utf-8');
  }
  let rel = urlPath === '/' ? '/index.html' : urlPath.split('?')[0];
  let file;
  if (rel.startsWith('/audio/')) {
    file = path.join(ROOT, decodeURIComponent(rel));
    if (!file.startsWith(AUDIO_DIR)) return send(res, 403, { ok: false, err: 'forbidden' });
  } else {
    file = path.join(PUB, decodeURIComponent(rel));
    if (!file.startsWith(PUB)) return send(res, 403, { ok: false, err: 'forbidden' });
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, { ok: false, err: 'not found: ' + rel });
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  if (ext === '.m4a' || ext === '.mp3' || ext === '.wav' || ext === '.amr' || ext === '.mp4') {
    const st = fs.statSync(file);
    const ctype = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'audio/mp4';
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      const start = m && m[1] ? Number(m[1]) : 0;
      let end = m && m[2] ? Number(m[2]) : st.size - 1;
      if (end >= st.size) end = st.size - 1;
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': ctype, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': ctype, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
    return fs.createReadStream(file).pipe(res);
  }
  send(res, 200, fs.readFileSync(file), type);
}

function body(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', c => {
      b += c;
      if (b.length > 20 * 1024 * 1024) { req.destroy(); resolve({}); }
    });
    req.on('end', () => {
      if (!b) return resolve({});
      try { resolve(JSON.parse(b)); } catch (e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  // ── 局域网访问防护：非豁免的 /api 与音频流要求口令会话（本机回环自动放行）──
  if ((p.startsWith('/api/') || p.startsWith('/audio/')) && !isExempt(p)) {
    const gate = auth.pass(req);
    if (!gate.ok) {
      return send(res, 401, { ok: false, err: '需要访问口令', needAuth: true });
    }
  }
  if (!p.startsWith('/api/')) return serveStatic(req, res, p);

  const key = `${req.method} ${p.replace(/\/+$/, '')}`;
  let handler = routes[key];
  if (!handler) {
    // 动态段匹配：路由键含 :xxx 段（如 /api/calls/:id、/api/share/:token、/api/share/:token/action）
    for (const k of Object.keys(routes)) {
      if (!k.includes(':')) continue;
      const [mth, pattern] = k.split(' ');
      if (mth !== req.method) continue;
      const segs = pattern.split('/').filter(Boolean);
      const psegs = p.split('/').filter(Boolean);
      if (segs.length !== psegs.length) continue;
      const params = {};
      let hit = true;
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].startsWith(':')) params[segs[i].slice(1)] = decodeURIComponent(psegs[i]);
        else if (segs[i] !== psegs[i]) { hit = false; break; }
      }
      if (hit) { handler = routes[k]; req.params = params; break; }
    }
  }
  if (!handler) return send(res, 404, { ok: false, err: 'no api: ' + key });
  try {
    // multipart 必须由 multer 自己读流，这里不能预先消费 body
    const ct = req.headers['content-type'] || '';
    const payload = ct.includes('multipart/form-data') ? {} : await body(req);
    const data = await handler(req, res, payload, u.searchParams);
    if (data !== undefined && !res.writableEnded) send(res, 200, data);
  } catch (e) {
    console.error('[api]', key, e);
    send(res, 500, { ok: false, err: String(e.message || e) });
  }
});

function lanIP() {
  const list = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) list.push(n.address);
    }
  }
  return list[0] || '127.0.0.1';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = lanIP();
  console.log('');
  console.log('  拜访志 VisitLog 已启动');
  console.log(`  本机   http://localhost:${PORT}/`);
  console.log(`  手机   http://${ip}:${PORT}/     (需与电脑同一 WiFi)`);
  console.log('');
  sens.seed();
  contacts.enrichAll();                                // 启动即给存量客户回填联系人姓名/电话
  contacts.migrateNotes();                             // 老备注迁入客户跟进记录（一次性）
  sens.cleanupAll();                                   // 启动即清：录音超保留期 / tmp / 旧日志
  setInterval(() => sens.cleanupAll(), 3600 * 1000);   // 每小时自动巡检
  asr.retryStuck();
});

module.exports = { send, body, AUDIO_DIR, PUB, ROOT };
