// 拜访志 · 待办 / 重点事项
const { all, get, run, now, today, addLog, uuid, ownerName } = require('./db.js');
const nm = require('./normalize.js');
const { extractEntities } = require('./extract_entity.js');

const TODO_SQL = `SELECT t.*, c.name AS customer_name,
  (SELECT title FROM calls WHERE id=t.call_id) AS call_title,
  (SELECT COUNT(*) FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id) AS fu_n,
  (SELECT content FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last,
  (SELECT result FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last_res,
  (SELECT created_at FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last_at
  FROM todos t LEFT JOIN customers c ON c.id=t.customer_id`;

function refreshOverdue() {
  const t = today();
  run("UPDATE todos SET overdue=1 WHERE status='open' AND due_date IS NOT NULL AND due_date < ?", t);
  run("UPDATE todos SET overdue=0 WHERE status='open' AND (due_date IS NULL OR due_date >= ?)", t);
}

// 已知客户字号表（供实体抽取兜底匹配，如"某某公司"这类无后缀写法）
function knownCustomerKeys() {
  const out = [];
  for (const c of all('SELECT id,name,aliases FROM customers')) {
    out.push({ key: c.name.split(/[--／/＆&\s]/)[0].replace(/[（）()]/g, ''), name: c.name, id: c.id });
    let arr = [];
    try { arr = JSON.parse(c.aliases || '[]'); } catch (_) { arr = []; }
    for (const a of arr) if (a) out.push({ key: String(a).split(/[--／/＆&\s]/)[0], name: c.name, id: c.id });
  }
  return out.filter(k => k.key && k.key.length >= 3);   // 3 字以下太泛，不进兜底表
}

// 手动待办 → 自动建档关联 + 生成重点事项（幂等：同一待办只生成一条）
function linkManualTodo(todoId, content, customerId) {
  const r = { customerId: customerId || null, customerName: '', created: false, person: null, hlId: null };
  const { company, person } = extractEntities(content, knownCustomerKeys());
  r.person = person;

  // 1) 关联客户：已有 customer_id 直接用；否则抽取公司名建档
  if (r.customerId) {
    const c = get('SELECT name FROM customers WHERE id=?', r.customerId);
    r.customerName = c ? c.name : '';
  } else if (company) {
    r.customerId = nm.resolveCustomer(company, { owner: ownerName() });
    r.customerName = company;
    r.created = !get('SELECT 1 FROM calls WHERE customer_id=? LIMIT 1', r.customerId); // 无通话 → 本次新建
    addLog('todo_link', todoId, `手工待办关联客户：${company}`);
  }

  // 2) 回填联系人（客户档案 contact_name 为空才补）
  if (r.customerId && person) {
    const c = get('SELECT contact_name FROM customers WHERE id=?', r.customerId);
    if (c && !c.contact_name) {
      run('UPDATE customers SET contact_name=?, updated_at=? WHERE id=?', person, now(), r.customerId);
    }
  }

  // 3) 更新待办的 customer_id
  if (r.customerId) run('UPDATE todos SET customer_id=?, updated_at=? WHERE id=?', r.customerId, now(), todoId);

  // 4) 同步生成一条重点事项（同待办只生成一次，避免编辑重复触发）
  const dup = get("SELECT 1 FROM highlights WHERE source='manual' AND content LIKE ?", `%［待办#${todoId}］%`);
  if (!dup && content.trim()) {
    const hlId = uuid();
    run(`INSERT INTO highlights(id,call_id,customer_id,category_id,content,kind,importance,pinned,source,created_at,updated_at)
         VALUES(?,?,?,NULL,?,?,3,0,'manual',?,?)`,
      hlId, null, r.customerId, `［待办#${todoId}］${content.slice(0, 500)}`, '待办', now(), now());
    r.hlId = hlId;
  }
  return r;
}

module.exports = {
  'GET /api/todos': async (req, res, b, q) => {
    refreshOverdue();
    const st = q.get('status') || 'open';
    const scope = q.get('scope') || '';
    let sql = TODO_SQL;
    const args = [];
    if (st !== 'all') { sql += ' WHERE t.status=?'; args.push(st); }
    if (scope === 'overdue') sql += (args.length ? ' AND' : ' WHERE') + ' t.overdue=1';
    if (scope === 'today') { sql += (args.length ? ' AND' : ' WHERE') + ' t.due_date=?'; args.push(today()); }
    if (scope === 'week') { sql += (args.length ? ' AND' : ' WHERE') + ' t.due_date IS NOT NULL AND t.due_date <= ?'; args.push(new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)); }
    if (scope === 'high') sql += (args.length ? ' AND' : ' WHERE') + " t.priority='高'";
    sql += ` ORDER BY t.overdue DESC, COALESCE(t.due_date,'9999') ASC, t.priority DESC, t.created_at DESC LIMIT 300`;
    return { ok: true, list: all(sql, ...args) };
  },

  'POST /api/todos': async (req, res, b) => {
    if (!b.content) return { ok: false, err: '缺少内容' };
    const id = uuid();
    run(`INSERT INTO todos(id,call_id,customer_id,content,assignee,due_date,priority,status,source,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,'open','manual',?,?)`,
      id, b.call_id || null, b.customer_id || null, b.content,
      b.assignee || ownerName(), b.due_date || null, b.priority || '中', now(), now());
    addLog('todo_add', id, b.content.slice(0, 60));
    // 手动添加（无通话上下文）→ 自动建档关联 + 生成重点事项
    let link = null;
    if (!b.call_id) link = linkManualTodo(id, b.content, b.customer_id);
    return { ok: true, id, link };
  },

  'POST /api/todos/:id': async (req, res, b) => {
    const id = req.params.id;
    const f = b.field, v = b.value;
    if (f === 'done') {
      run("UPDATE todos SET status=?, done_at=?, done_by=?, overdue=0, updated_at=? WHERE id=?", v ? 'done' : 'open', v ? now() : null, v ? ownerName() : '', now(), id);
      addLog('todo_' + (v ? 'done' : 'reopen'), id, '');
      return { ok: true };
    }
    const allowed = ['content', 'due_date', 'priority', 'assignee', 'note', 'status', 'customer_id'];
    if (!allowed.includes(f)) {
      // 特殊字段：customer_name → 按名称建档/匹配后关联（前端"绑定客户"入口）
      if (f === 'customer_name') {
        const name = String(v || '').trim();
        if (!name) return { ok: false, err: '名称为空' };
        const cid = nm.resolveCustomer(name, { owner: ownerName() });
        run('UPDATE todos SET customer_id=?, updated_at=? WHERE id=?', cid, now(), id);
        const created = !get('SELECT 1 FROM calls WHERE customer_id=? LIMIT 1', cid);
        addLog('todo_bind', id, `绑定客户：${name}`);
        return { ok: true, customerId: cid, created };
      }
      return { ok: false, err: 'unsupported field: ' + f };
    }
    run(`UPDATE todos SET ${f}=?, updated_at=? WHERE id=?`, v, now(), id);
    addLog('todo_edit', id, `${f} → ${v}`);
    return { ok: true };
  },

  'DELETE /api/todos/:id': async (req) => {
    run("DELETE FROM followups WHERE ref_type='todo' AND ref_id=?", req.params.id);
    run('DELETE FROM todos WHERE id=?', req.params.id);
    // 连带删除该待办自动生成的重点事项（仅 manual 来源且带标记的）
    run("DELETE FROM highlights WHERE source='manual' AND content LIKE ?", `%［待办#${req.params.id}］%`);
    addLog('todo_del', req.params.id, '');
    return { ok: true };
  },

  // 存量手工待办补关联：对全部 manual 且未关联客户的待办跑一遍建档+重点生成
  'POST /api/todos/backfill': async () => {
    const rows = all("SELECT id, content FROM todos WHERE source='manual' AND (customer_id IS NULL OR customer_id='')");
    const done = [];
    for (const t of rows) {
      const r = linkManualTodo(t.id, t.content, null);
      done.push({ id: t.id, customer: r.customerName, created: r.created, hl: !!r.hlId });
    }
    addLog('todo_backfill', '', `补关联 ${done.length} 条手工待办`);
    return { ok: true, n: done.length, done };
  },

  // 重点事项（提炼池）：默认只看待处理；archived=1 查看"已处理"归档区；archived=all 全量（通话详情等场景）
  'GET /api/highlights': async (req, res, b, q) => {
    const kind = q.get('kind') || '';
    const arch = q.get('archived') || '';
    let sql = `SELECT h.*, c.name AS customer_name, cl.title AS call_title, cl.visited_at,
               (SELECT name FROM categories WHERE id=h.category_id) AS category_name,
               (SELECT COUNT(*) FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id) AS fu_n,
               (SELECT content FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id ORDER BY f.id DESC LIMIT 1) AS fu_last,
               (SELECT result FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id ORDER BY f.id DESC LIMIT 1) AS fu_last_res,
               (SELECT created_at FROM followups f WHERE f.ref_type='highlight' AND f.ref_id=h.id ORDER BY f.id DESC LIMIT 1) AS fu_last_at
               FROM highlights h LEFT JOIN customers c ON c.id=h.customer_id
               LEFT JOIN calls cl ON cl.id=h.call_id`;
    const args = [];
    const conds = [];
    if (arch !== 'all') conds.push(`h.status ${arch === '1' ? '=' : '!='} 'archived'`);
    if (kind) { conds.push('h.kind=?'); args.push(kind); }
    sql += conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    sql += ` ORDER BY h.pinned DESC, h.importance DESC, h.created_at DESC LIMIT ${arch === '1' ? 500 : 200}`;
    // 附带归档区计数（页面入口角标用）
    const cnt = get(`SELECT
      SUM(CASE WHEN status!='archived' THEN 1 ELSE 0 END) AS open_n,
      SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) AS archived_n FROM highlights`);
    return { ok: true, list: all(sql, ...args), cnt };
  },

  'POST /api/highlights': async (req, res, b) => {
    if (!b.content) return { ok: false, err: '缺少内容' };
    const id = uuid();
    run(`INSERT INTO highlights(id,call_id,customer_id,content,kind,importance,pinned,source,created_at,updated_at)
         VALUES(?,?,?,?,?,?,0,'manual',?,?)`,
      id, b.call_id || null, b.customer_id || null, b.content, b.kind || '结论',
      Math.max(1, Math.min(5, Number(b.importance) || 3)), now(), now());
    addLog('hl_add', id, b.content.slice(0, 60));
    return { ok: true, id };
  },

  'POST /api/highlights/:id': async (req, res, b) => {
    const id = req.params.id;
    const f = b.field, v = b.value;
    if (f === 'archive') {
      // 归档=已处理：节点保留（客户页可见、可继续写跟进），仅从重点列表隐藏；同时取消置顶
      run(`UPDATE highlights SET status='archived', archived_at=?, pinned=0, updated_at=? WHERE id=?`, now(), now(), id);
      addLog('hl_archive', id, '标记已处理');
      return { ok: true };
    }
    if (f === 'restore') {
      run(`UPDATE highlights SET status='open', archived_at='', updated_at=? WHERE id=?`, now(), id);
      addLog('hl_restore', id, '恢复待处理');
      return { ok: true };
    }
    const allowed = ['content', 'kind', 'importance', 'pinned', 'customer_id', 'category_id'];
    if (!allowed.includes(f)) return { ok: false, err: 'unsupported field: ' + f };
    run(`UPDATE highlights SET ${f}=?, updated_at=? WHERE id=?`, v, now(), id);
    addLog('hl_edit', id, `${f} → ${v}`);
    return { ok: true };
  },

  // 彻底删除：仅供"已处理"归档区使用（前端仅在归档视图展示并二次确认）；连带删跟进
  'DELETE /api/highlights/:id': async (req) => {
    run("DELETE FROM followups WHERE ref_type='highlight' AND ref_id=?", req.params.id);
    run('DELETE FROM highlights WHERE id=?', req.params.id);
    addLog('hl_del', req.params.id, '归档区彻底删除');
    return { ok: true };
  },
};
