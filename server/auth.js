// 拜访志 · 局域网访问防护：口令 + 会话（持久化到 DB，服务重启不失效）
const crypto = require('crypto');
const { get, all, run } = require('./db.js');

const SESSION_TTL = 7 * 24 * 3600 * 1000; // 7 天
const mem = new Map();                    // token -> expires（内存缓存）
const fails = new Map();                  // ip -> { n, until }

function passcode() {
  const s = get("SELECT v FROM settings WHERE k='accessCode'");
  return s && s.v ? String(s.v) : '';
}
function enabled() { return !!passcode(); }

function isLocal(addr) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr || '');
}

function tokenOf(req) {
  const ck = req.headers.cookie || '';
  const m = ck.match(/(?:^|;\s*)vl_s=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function loadValid(t) {
  if (!t) return false;
  const now = Date.now();
  const m = mem.get(t);
  if (m && m > now) return true;
  const row = t ? get('SELECT expires FROM auth_sessions WHERE token=?', t) : null;
  if (row && row.expires > now) { mem.set(t, row.expires); return true; }
  if (row) run('DELETE FROM auth_sessions WHERE token=?', t);
  return false;
}

// 校验当前请求是否被放行（仅用于非豁免的 /api 与 /audio）
function pass(req) {
  if (!enabled()) return { ok: true, on: false };
  if (isLocal(req.socket.remoteAddress)) return { ok: true, on: true, local: true };
  if (loadValid(tokenOf(req))) return { ok: true, on: true };
  return { ok: false, on: true };
}

// 口令登录：带失败限速（同一来源 10 分钟内错 5 次即锁）
function login(codeIn, ip) {
  const now = Date.now();
  const f = fails.get(ip);
  if (f && f.until > now) return { ok: false, err: '尝试次数过多，请 10 分钟后再试' };
  if (!enabled()) return { ok: false, err: '未启用访问口令' };
  if (String(codeIn || '') !== passcode()) {
    const n = (f ? f.n : 0) + 1;
    fails.set(ip, { n, until: n >= 5 ? now + 10 * 60 * 1000 : 0 });
    return { ok: false, err: '口令不正确' };
  }
  fails.delete(ip);
  const token = crypto.randomBytes(24).toString('hex');
  const exp = now + SESSION_TTL;
  mem.set(token, exp);
  run('INSERT INTO auth_sessions(token,expires) VALUES(?,?)', token, exp);
  // 清理过期会话
  run('DELETE FROM auth_sessions WHERE expires<?', now);
  return { ok: true, token, ttl: SESSION_TTL / 1000 };
}

function logout(token) {
  if (!token) return;
  mem.delete(token);
  run('DELETE FROM auth_sessions WHERE token=?', token);
}

module.exports = { enabled, pass, login, logout, tokenOf, passcode };
