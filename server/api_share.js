// 拜访志 · 客户汇总页分享（token 隔离；只读摘要级 + 处理待办 + 写跟进回填）
const crypto = require('crypto');
const { all, get, run, now, addLog } = require('./db.js');
const fb = require('./feedback.js');
const auth = require('./auth.js');

function findShare(token) {
  const c = token ? get('SELECT * FROM customers WHERE share_token=?', token) : null;
  if (!c) return null;
  return c;
}

function pub(c) {
  const FU = `(SELECT COUNT(*) FROM followups f WHERE f.ref_type='@@' AND f.ref_id=x.id) fu_n,
              (SELECT content FROM followups f WHERE f.ref_type='@@' AND f.ref_id=x.id ORDER BY f.id DESC LIMIT 1) fu_last,
              (SELECT result FROM followups f WHERE f.ref_type='@@' AND f.ref_id=x.id ORDER BY f.id DESC LIMIT 1) fu_last_res,
              (SELECT author FROM followups f WHERE f.ref_type='@@' AND f.ref_id=x.id ORDER BY f.id DESC LIMIT 1) fu_last_by,
              (SELECT created_at FROM followups f WHERE f.ref_type='@@' AND f.ref_id=x.id ORDER BY f.id DESC LIMIT 1) fu_last_at`;
  const todos = all(`SELECT x.id,x.content,x.due_date,x.priority,x.status,x.overdue,x.done_by,${FU.replace(/@@/g, 'todo')}
                     FROM todos x WHERE x.customer_id=? ORDER BY x.status, x.due_date`, c.id);
  const highlights = all(`SELECT x.id,x.content,x.kind,x.importance,${FU.replace(/@@/g, 'highlight')}
                          FROM highlights x WHERE x.customer_id=? ORDER BY x.importance DESC, x.created_at DESC LIMIT 30`, c.id);
  const fu = all(`SELECT f.id,f.ref_type,f.ref_id,f.content,f.result,f.due_date,f.author,f.created_at
                  FROM followups f WHERE f.ref_type IN ('customer','stale_dismiss') AND f.ref_id=? ORDER BY f.id DESC LIMIT 100`, c.id);
  return {
    ok: true,
    customer: {
      id: c.id, name: c.name, type: c.type, region: c.region, level: c.level,
      contact_name: c.contact_name, contact_phone: c.contact_phone,
      sales: c.sales, owner: c.owner, status: c.status,
      first_visit_at: c.first_visit_at, last_visit_at: c.last_visit_at, visit_count: c.visit_count,
    },
    calls: all(`SELECT id,title,visited_at,visit_type,duration_sec,summary,sentiment,quality_score
                FROM calls WHERE customer_id=? ORDER BY visited_at DESC LIMIT 20`, c.id),
    todos,
    highlights,
    followups: fu,
    openTodos: todos.filter(t => t.status === 'open').length,
  };
}

module.exports = {
  // 局域网访问口令登录（设置口令后，非本机访问 /api 需先登录）
  'POST /api/auth': async (req, res, b) => {
    const ip = req.socket.remoteAddress || '';
    const r = auth.login(b.code, ip);
    if (!r.ok) return { ok: false, err: r.err };
    addLog('auth_login', ip, '登录成功');
    if (!res.writableEnded) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `vl_s=${r.token}; Path=/; Max-Age=${r.ttl}; HttpOnly; SameSite=Lax`,
      });
      res.end(JSON.stringify({ ok: true }));
      return undefined;
    }
    return { ok: true };
  },
  'POST /api/auth/off': async (req) => {
    auth.logout(auth.tokenOf(req));
    return { ok: true };
  },

  // 局域网主机地址（分享面板展示用，避免复制出 localhost）
  'GET /api/share/host': async () => {
    const os = require('os');
    let ip = '127.0.0.1';
    for (const name of Object.keys(os.networkInterfaces())) {
      for (const n of os.networkInterfaces()[name] || []) {
        if (n.family === 'IPv4' && !n.internal) { ip = n.address; break; }
      }
      if (ip !== '127.0.0.1') break;
    }
    return { ok: true, ip };
  },

  // 分享页数据（摘要级，不含转写稿/音频/预警）
  'GET /api/share/:token': async (req) => {
    const c = findShare(req.params.token);
    if (!c) return { ok: false, err: '链接无效或已停用' };
    run("UPDATE customers SET updated_at=updated_at WHERE id=?", c.id); // touch
    return pub(c);
  },

  // 分享接收者操作：完成/重开待办
  'POST /api/share/:token/action': async (req, res, b) => {
    const c = findShare(req.params.token);
    if (!c) return { ok: false, err: '链接无效或已停用' };
    const who = String(b.author || '').trim().slice(0, 20) || '访客';
    if (b.kind === 'todo_done') {
      if (!b.todo_id) return { ok: false, err: '缺少待办' };
      const owner = get('SELECT customer_id FROM todos WHERE id=?', b.todo_id);
      if (!owner || owner.customer_id !== c.id) return { ok: false, err: '越权：该待办不属于此客户' };
      const v = b.value ? 1 : 0;
      run("UPDATE todos SET status=?, done_at=?, done_by=?, overdue=0, updated_at=? WHERE id=?",
        v ? 'done' : 'open', v ? now() : null, v ? who : '', now(), b.todo_id);
      addLog('share_todo', b.todo_id, `${v ? '完成' : '重开'} by ${who}`, who);
      return { ok: true };
    }
    if (b.kind === 'followup') {
      if (!['customer', 'todo', 'highlight'].includes(b.ref_type) || !b.ref_id) {
        return { ok: false, err: 'ref 无效' };
      }
      if (!String(b.content || '').trim() && !b.closed) return { ok: false, err: '请写一句内容' };
      // 校验 ref 归属本客户（todo/highlight 需 customer 一致），防止越权
      const owner = b.ref_type === 'todo'
        ? get('SELECT customer_id FROM todos WHERE id=?', b.ref_id)
        : get('SELECT customer_id FROM highlights WHERE id=?', b.ref_id);
      if (b.ref_type !== 'customer' && (!owner || owner.customer_id !== c.id)) {
        return { ok: false, err: '越权：该事项不属于此客户' };
      }
      const id = fb.addFollowup({
        ref_type: b.ref_type, ref_id: b.ref_id, content: b.content,
        result: b.result, due_date: b.due_date, closed: b.closed, author: who,
      });
      return { ok: true, id };
    }
    return { ok: false, err: '未知操作' };
  },

  // 生成 / 停用 分享（主站管理）
  'POST /api/share/ctl': async (req, res, b) => {
    const c = get('SELECT * FROM customers WHERE id=?', b.customer_id);
    if (!c) return { ok: false, err: 'not found' };
    if (b.action === 'off') {
      run("UPDATE customers SET share_token='', updated_at=? WHERE id=?", now(), c.id);
      addLog('share_off', c.id, '已停用分享');
      return { ok: true, on: false };
    }
    let tk = '';
    for (let i = 0; i < 5; i++) {
      tk = crypto.randomBytes(9).toString('base64url');
      if (!get('SELECT id FROM customers WHERE share_token=?', tk)) break;
    }
    run('UPDATE customers SET share_token=?, updated_at=? WHERE id=?', tk, now(), c.id);
    addLog('share_on', c.id, '已生成分享链接');
    return { ok: true, on: true, token: tk };
  },
};
