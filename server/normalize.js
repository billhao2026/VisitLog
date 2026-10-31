// 拜访志 · 客户名归一
const { all, get, run, now, addLog, uuid } = require('./db.js');

// 去掉法人实体后缀，取核心字号
const SUFFIX = /(股份有限公司|有限责任公司|有限公司|集团公司|分公司|公司|集团|经营部|商行|商行部|营业部|办事处|工作室|中心|厂|店)$/;

function core(name) {
  let s = String(name || '').trim();
  s = s.replace(/\s+/g, '').replace(/[（）()]/g, '');
  s = s.replace(SUFFIX, '');
  return s;
}

// 三级归一：精确 → 别名 → 核心名包含 → 新建
function resolveCustomer(name, opts = {}) {
  const raw = String(name || '').trim();
  if (!raw) return null;

  const hit = get('SELECT id,name FROM customers WHERE name=?', raw);
  if (hit) { touch(hit.id, opts.at); return hit.id; }

  for (const c of all('SELECT id,name,aliases FROM customers')) {
    let arr = [];
    try { arr = JSON.parse(c.aliases || '[]'); } catch (_) { arr = []; }
    if (arr.some(a => a && a.trim() === raw)) { touch(c.id, opts.at); return c.id; }
  }

  const cr = core(raw);
  if (cr && cr.length >= 2) {
    for (const c of all('SELECT id,name FROM customers')) {
      const cc = core(c.name);
      if (cc && (cc === cr || cc.includes(cr) || cr.includes(cc))) {
        // 补进别名表，下次直接命中
        const cur = get('SELECT aliases FROM customers WHERE id=?', c.id);
        let arr = [];
        try { arr = JSON.parse(cur.aliases || '[]'); } catch (_) { arr = []; }
        if (!arr.includes(raw)) { arr.push(raw); run('UPDATE customers SET aliases=?, updated_at=? WHERE id=?', JSON.stringify(arr), now(), c.id); }
        touch(c.id, opts.at);
        return c.id;
      }
    }
  }

  const id = uuid();
  run(`INSERT INTO customers(id,name,aliases,owner,status,visit_count,first_visit_at,last_visit_at,created_at,updated_at)
       VALUES(?,?,?,?, '活跃', 0, ?,?,?,?)`,
    id, raw, JSON.stringify([]), opts.owner || 'Bill', opts.at || now(), opts.at || now(), now(), now());
  addLog('customer_new', id, '自动建档：' + raw);
  return id;
}

function touch(id, at) {
  if (!id) return;
  const t = at || now();
  run('UPDATE customers SET visit_count=(SELECT COUNT(*) FROM calls WHERE customer_id=?), last_visit_at=?, updated_at=? WHERE id=?',
    id, t, t, id);
}

// 全量重算所有客户的拜访次数与最近拜访
function recount() {
  const rows = all(`SELECT customer_id, COUNT(*) c, MAX(visited_at) m FROM calls WHERE customer_id IS NOT NULL GROUP BY customer_id`);
  for (const r of rows) {
    run('UPDATE customers SET visit_count=?, last_visit_at=?, updated_at=? WHERE id=?', r.c, r.m, now(), r.id || r.customer_id);
  }
  return rows.length;
}

module.exports = { resolveCustomer, core, recount, touch };
