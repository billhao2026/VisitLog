// 拜访志 · 客户 / 统计 / 日志
const { all, get, run, now, today, addLog, uuid } = require('./db.js');
const nm = require('./normalize.js');

const CUST_SQL = `SELECT c.*,
  (SELECT COUNT(*) FROM todos t WHERE t.customer_id=c.id AND t.status='open') AS open_todos,
  (SELECT COUNT(*) FROM highlights h WHERE h.customer_id=c.id) AS hl_count
  FROM customers c`;

module.exports = {
  // 客户列表（带统计）
  'GET /api/customers': async (req, res, b, q) => {
    const kw = (q.get('kw') || '').trim();
    let sql = CUST_SQL;
    const args = [];
    if (kw) { sql += ' WHERE c.name LIKE ? OR c.aliases LIKE ? OR c.tags LIKE ?'; args.push(`%${kw}%`, `%${kw}%`, `%${kw}%`); }
    sql += ' ORDER BY c.last_visit_at DESC';
    return { ok: true, list: all(sql, ...args) };
  },

  // 客户详情：档案 + 拜访流水 + 待办 + 要点
  'GET /api/customers/:id': async (req) => {
    const id = req.params.id;
    const c = get(CUST_SQL + ' WHERE c.id=?', id);
    if (!c) return { ok: false, err: 'not found' };
    return {
      ok: true, customer: c,
      calls: all(`SELECT id,title,visited_at,visit_type,duration_sec,summary,sentiment,quality_score,transcribe_status,analyze_status
                  FROM calls WHERE customer_id=? ORDER BY visited_at DESC`, id),
      todos: all(`SELECT t.*,
                  (SELECT COUNT(*) FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id) AS fu_n,
                  (SELECT content FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last,
                  (SELECT result FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last_res,
                  (SELECT created_at FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last_at
                  FROM todos t WHERE t.customer_id=? ORDER BY status, due_date`, id),
      highlights: all(`SELECT h.*,
                  (SELECT COUNT(*) FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id) AS fu_n,
                  (SELECT content FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id ORDER BY f.id DESC LIMIT 1) AS fu_last,
                  (SELECT result FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id ORDER BY f.id DESC LIMIT 1) AS fu_last_res,
                  (SELECT created_at FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id ORDER BY f.id DESC LIMIT 1) AS fu_last_at
                  FROM highlights h WHERE h.customer_id=? ORDER BY h.status='archived', pinned DESC, importance DESC, created_at DESC LIMIT 50`, id),
    };
  },

  // 客户档案导出：自包含单文件 HTML（离线分享，零外链零 JS）
  'GET /api/export/customer/:id': async (req, res) => {
    const id = req.params.id;
    const c = get('SELECT * FROM customers WHERE id=?', id);
    if (!c) return { ok: false, err: 'not found' };
    const { buildCustomerHTML } = require('./export_html.js');
    const calls = all(`SELECT id,title,visited_at,visit_type,duration_sec,summary,sentiment,quality_score
                       FROM calls WHERE customer_id=? ORDER BY visited_at DESC`, id);
    const todos = all(`SELECT id,content,due_date,priority,status,done_by,overdue FROM todos
                       WHERE customer_id=? ORDER BY status='open' DESC, due_date`, id);
    const hls = all(`SELECT id,content,kind,importance,pinned,status,created_at FROM highlights
                     WHERE customer_id=? AND status!='archived'
                     ORDER BY pinned DESC, importance DESC, created_at DESC`, id);
    const fus = all(`SELECT id,ref_type,ref_id,content,result,author,created_at FROM followups
                     WHERE (ref_type='customer' AND ref_id=?)
                        OR id IN (SELECT f.id FROM followups f
                                  JOIN todos t ON f.ref_type='todo' AND f.ref_id=t.id
                                  WHERE t.customer_id=?)
                        OR id IN (SELECT f.id FROM followups f
                                  JOIN highlights h ON f.ref_type='highlight' AND f.ref_id=h.id
                                  WHERE h.customer_id=?)
                     ORDER BY id DESC`, id, id, id);
    const html = buildCustomerHTML(c, calls, todos, hls, fus);
    addLog('export_html', id, '导出客户档案 HTML');
    const fname = encodeURIComponent(c.name.replace(/[\\/:*?"<>|]/g, '') + '-客户档案.html');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${fname}`,
      'Cache-Control': 'no-store',
    });
    res.end(html);
    return undefined;
  },

  'POST /api/customers/:id': async (req, res, b) => {
    const id = req.params.id;
    const f = b.field, v = b.value;
    const allowed = ['name', 'type', 'region', 'level', 'tags', 'owner', 'sales', 'contact_name', 'contact_phone', 'status', 'note'];
    if (!allowed.includes(f)) return { ok: false, err: 'unsupported field: ' + f };
    // 电话列统一清洗为纯数字
    const val = f === 'contact_phone' ? String(v || '').replace(/[^\d]/g, '') : v;
    run(`UPDATE customers SET ${f}=?, updated_at=? WHERE id=?`, val, now(), id);
    addLog('cust_edit', id, `${f} → ${val}`);
    return { ok: true };
  },

  // 概览统计
  'GET /api/stats': async () => {
    const t = today();
    const one = (sql, ...a) => (get(sql, ...a) || {}).c || 0;
    const total = one('SELECT COUNT(*) c FROM calls');
    const done = one("SELECT COUNT(*) c FROM calls WHERE analyze_status='done'");
    const pendingT = one("SELECT COUNT(*) c FROM calls WHERE transcribe_status IN ('pending','transcribing')");
    const pendingA = one("SELECT COUNT(*) c FROM calls WHERE transcribe_status='done' AND analyze_status IN ('pending','error')");
    const err = one("SELECT COUNT(*) c FROM calls WHERE transcribe_status='error' OR analyze_status='error'");
    const flagsOpen = one('SELECT COUNT(*) c FROM flags WHERE handled=0');
    const custs = one('SELECT COUNT(*) c FROM customers');
    const openTodos = one("SELECT COUNT(*) c FROM todos WHERE status='open'");
    const overdue = one("SELECT COUNT(*) c FROM todos WHERE status='open' AND due_date IS NOT NULL AND due_date < ?", t);
    const todayTodos = one("SELECT COUNT(*) c FROM todos WHERE status='open' AND due_date = ?", t);
    const minSec = one('SELECT COALESCE(SUM(duration_sec),0) c FROM calls');
    const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

    // 分类分布（一级）
    const dist = all(`SELECT cc.category_id, COUNT(*) c FROM call_categories cc
                      JOIN calls cl ON cl.id=cc.call_id
                      WHERE cl.analyze_status='done'
                      GROUP BY cc.category_id`);
    const catMap = {};
    for (const c of all('SELECT id,parent_id,name FROM categories')) catMap[c.id] = c;
    const buckets = {};
    for (const d of dist) {
      const cat = catMap[d.category_id];
      if (!cat) continue;
      const top = cat.parent_id ? (catMap[cat.parent_id] || cat) : cat;
      buckets[top.id] = buckets[top.id] || { id: top.id, name: top.name, count: 0 };
      buckets[top.id].count += d.c;
    }
    // 二级明细
    const sub = {};
    for (const d of dist) {
      const cat = catMap[d.category_id];
      if (!cat) continue;
      sub[cat.id] = { id: cat.id, name: cat.name, parent_id: cat.parent_id, count: d.c };
    }

    // 近 14 个工作日通话量（排除周六日）
    const trend = [];
    {
      const days = [];
      const cur = new Date();
      while (days.length < 14) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) days.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() - 1);
      }
      days.reverse();
      for (const d of days) {
        const c = one('SELECT COUNT(*) c FROM calls WHERE substr(visited_at,1,10)=?', d);
        trend.push({ date: d, count: c });
      }
    }

    // 待跟进（超期未回访客户）
    const stale = all(`SELECT c.id, c.name, c.last_visit_at, c.level,
                       (SELECT COUNT(*) FROM todos t WHERE t.customer_id=c.id AND t.status='open') ot
                       FROM customers c
                       WHERE c.last_visit_at IS NOT NULL AND c.last_visit_at < ?
                       ORDER BY ot DESC, c.last_visit_at LIMIT 20`, d30);

    // 最近跟进动态（编写式跟进留痕）
    const fuRows = all(`SELECT fu.*, t.content AS todo_content
                        FROM followups fu
                        LEFT JOIN todos t ON fu.ref_type='todo' AND t.id=fu.ref_id
                        ORDER BY fu.id DESC LIMIT 5`);
    const custMap = {};
    for (const c of all('SELECT id,name FROM customers')) custMap[c.id] = c.name;
    const fuRecent = fuRows.map(x => {
      const cid = x.ref_type === 'todo'
        ? (get('SELECT customer_id cid FROM todos WHERE id=?', x.ref_id) || {}).cid
        : x.ref_type === 'highlight'
          ? (get('SELECT customer_id cid FROM highlights WHERE id=?', x.ref_id) || {}).cid
          : null;
      return { id: x.id, ref_type: x.ref_type, ref_id: x.ref_id, content: x.content, result: x.result,
               created_at: x.created_at, todo_content: x.todo_content, customer_name: custMap[cid] || '' };
    });

    // 重点事项（置顶五星要点，控制条数突出重点）
    const highlights = all(`SELECT h.id, h.customer_id, h.kind, h.importance, h.content, h.created_at
                            FROM highlights h
                            WHERE h.pinned=1 AND h.status!='archived'
                            ORDER BY h.importance DESC, h.created_at DESC LIMIT 6`);
    const hlMap = {};
    for (const h of highlights) hlMap[h.id] = h;
    for (const h of highlights) h.customer_name = custMap[h.customer_id] || '';

    // 待办分层（高优先/今日到期/已超期）
    const todoTop = all(`SELECT id, customer_id, content, due_date, priority, overdue
                         FROM todos
                         WHERE status='open' AND (priority='高' OR overdue=1 OR (due_date IS NOT NULL AND due_date<=?))
                         ORDER BY overdue DESC, priority='高' DESC, due_date
                         LIMIT 8`, t);
    for (const x of todoTop) x.customer_name = custMap[x.customer_id] || '';

    // 今日完成量（衡量当日推进感）
    const doneToday = one("SELECT COUNT(*) c FROM todos WHERE status='done' AND substr(done_at,1,10)=?", t);

    return {
      ok: true, stats: {
        total, done, pendingT, pendingA, err, custs, openTodos, overdue, todayTodos, flagsOpen,
        hours: +(minSec / 3600).toFixed(1), doneToday,
        openHigh: one("SELECT COUNT(*) c FROM todos WHERE status='open' AND priority='高'"),
        pinnedHl: one("SELECT COUNT(*) c FROM highlights WHERE pinned=1 AND status!='archived'"),
        openFu: one('SELECT COUNT(*) c FROM followups WHERE closed=0'),
      },
      dist: Object.values(buckets).sort((a, b) => b.count - a.count),
      sub: Object.values(sub).sort((a, b) => b.count - a.count),
      trend, stale, fuRecent, highlights, todoTop,
    };
  },

  // 队列状态（前端轮询用）
  'GET /api/queue': async () => {
    const asr = require('./asr.js');
    return {
      ok: true,
      transcribing: all("SELECT id,title,transcribe_status FROM calls WHERE transcribe_status='transcribing'"),
      pendingT: all("SELECT id,title,created_at FROM calls WHERE transcribe_status='pending' ORDER BY created_at").length,
      pendingA: get("SELECT COUNT(*) c FROM calls WHERE transcribe_status='done' AND analyze_status IN ('pending','error')").c,
      openTodos: get("SELECT COUNT(*) c FROM todos WHERE status='open'").c,
      overdueTodos: get("SELECT COUNT(*) c FROM todos WHERE status='open' AND overdue=1").c,
      flagsOpen: get('SELECT COUNT(*) c FROM flags WHERE handled=0').c,
      running: asr.isRunning(),
    };
  },

  'GET /api/logs': async (req, res, b, q) => {
    return { ok: true, list: all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', Number(q.get('limit') || 100)) };
  },
};
