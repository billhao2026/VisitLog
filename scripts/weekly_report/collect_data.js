// 拜访志周报数据层：直读 SQLite（node:sqlite），零依赖
// 输出 JSON 到 stdout：{ ok, weekStart, weekEnd, stats, calls, todos, followups, flags, highlights, customers }
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const db = new DatabaseSync(path.join(ROOT, 'data', 'calls.db'));

const pad = n => String(n).padStart(2, '0');
function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function fmtDT(d) { return fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

// 周期：上周五 18:00:00（不含） ~ 本周五 18:00:00（含），滚动 7 天
// 若当前已过本周五 18:00，则"本周五"即今天；未到 18:00 则以最近一个过去的周五 18:00 为终点
const now = new Date();
const CUTOFF_HOUR = 18;
function lastFriday18(ref) {
  // 找到 <= ref 的最近一个"周五 18:00"
  const d = new Date(ref);
  const isFri = d.getDay() === 5;
  const pastCutoff = d.getHours() > CUTOFF_HOUR ||
    (d.getHours() === CUTOFF_HOUR && (d.getMinutes() > 0 || d.getSeconds() > 0));
  // 回退到最近的周五
  let back = (d.getDay() === 0 ? 7 : d.getDay()) - 5;   // 周五=5；周日按7算
  if (back < 0) back += 7;                              // 周六/周日 → 回到上周五
  if (back === 0 && !pastCutoff) back = 7;              // 本周五但未到18点 → 上一周五
  d.setDate(d.getDate() - back);
  d.setHours(CUTOFF_HOUR, 0, 0, 0);
  return d;
}
const weekEndDT = lastFriday18(now);
const weekStartDT = new Date(weekEndDT.getTime() - 7 * 864e5);
const weekStart = fmtDT(weekStartDT);                   // 'YYYY-MM-DD 18:00:00'
const weekEnd = fmtDT(weekEndDT);
// 展示/文件名用纯日期（周期内首日 ~ 末日）
const weekStartDay = fmtDate(weekStartDT);
const weekEndDay = fmtDate(weekEndDT);

const Q = (sql, ...a) => db.prepare(sql).all(...a);
const G = (sql, ...a) => db.prepare(sql).get(...a);

// ── 本周通话（含客户信息）── 窗口：(上周五18:00, 本周五18:00]
const calls = Q(`SELECT c.id, c.title, c.visited_at, c.visit_type, c.duration_sec, c.customer_id,
  c.transcribe_status, c.analyze_status, c.summary, c.sentiment, c.quality_score,
  (SELECT name FROM customers WHERE id=c.customer_id) AS customer_name
  FROM calls c WHERE c.visited_at > ? AND c.visited_at <= ?
  ORDER BY c.visited_at`, weekStart, weekEnd);

// ── 本周跟进动态 ──
const followups = Q(`SELECT fu.*, t.content AS todo_content,
  (SELECT content FROM todos WHERE id=fu.ref_id) AS _tc,
  (SELECT customer_id FROM todos WHERE id=fu.ref_id) AS _tcid,
  (SELECT customer_id FROM highlights WHERE id=fu.ref_id) AS _hcid
  FROM followups fu LEFT JOIN todos t ON fu.ref_type='todo' AND t.id=fu.ref_id
  WHERE fu.created_at > ? AND fu.created_at <= ?
  ORDER BY fu.id DESC`, weekStart, weekEnd);
for (const f of followups) {
  const cid = f.ref_type === 'todo' ? f._tcid : f.ref_type === 'highlight' ? f._hcid : (f.ref_type === 'customer' ? f.ref_id : null);
  f.customer_name = cid ? (G('SELECT name FROM customers WHERE id=?', cid) || {}).name || '' : '';
  delete f._tcid; delete f._hcid;
}

// ── 未处理预警（全量）──
const flags = Q(`SELECT f.*, cl.title AS call_title, cl.visited_at,
  (SELECT name FROM customers WHERE id=f.customer_id) AS customer_name
  FROM flags f LEFT JOIN calls cl ON cl.id=f.call_id WHERE f.handled=0 ORDER BY f.created_at DESC`);

// ── 待办：本周新增 / 本周完成 / 当前未完成（含超期）──
const todosNew = Q(`SELECT t.*, (SELECT name FROM customers WHERE id=t.customer_id) AS customer_name
  FROM todos t WHERE t.created_at > ? AND t.created_at <= ?`, weekStart, weekEnd);
const todosDone = Q(`SELECT t.*, (SELECT name FROM customers WHERE id=t.customer_id) AS customer_name
  FROM todos t WHERE t.status='done' AND t.done_at > ? AND t.done_at <= ?`, weekStart, weekEnd);
const todosOpen = Q(`SELECT t.*, (SELECT COUNT(*) FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id) AS fu_n,
  (SELECT content FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last,
  (SELECT result FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last_res,
  (SELECT created_at FROM followups f WHERE f.ref_type='todo' AND f.ref_id=t.id ORDER BY f.id DESC LIMIT 1) AS fu_last_at,
  (SELECT name FROM customers WHERE id=t.customer_id) AS customer_name
  FROM todos t WHERE t.status='open' ORDER BY t.overdue DESC, t.due_date IS NULL, t.due_date, t.priority='高' DESC`);

// ── 重点事项（本周新增 + 当前置顶/高价值）──
const highlightsNew = Q(`SELECT h.*, (SELECT name FROM customers WHERE id=h.customer_id) AS customer_name
  FROM highlights h WHERE h.created_at > ? AND h.created_at <= ?`, weekStart, weekEnd);
const highlightsOpen = Q(`SELECT h.*, (SELECT name FROM customers WHERE id=h.customer_id) AS customer_name
  FROM highlights h WHERE h.status!='archived' ORDER BY h.pinned DESC, h.importance DESC, h.created_at DESC LIMIT 30`);

// ── 本周活跃客户（按通话次数）──
const activeCustomers = Q(`SELECT c.id, c.name, c.level, c.region, c.sales, COUNT(*) AS call_n, SUM(cl.duration_sec) AS total_sec
  FROM calls cl JOIN customers c ON c.id=cl.customer_id
  WHERE cl.visited_at > ? AND cl.visited_at <= ?
  GROUP BY c.id ORDER BY call_n DESC, total_sec DESC`, weekStart, weekEnd);

// ── 30 天未回访客户（特色：沉睡提醒）──
const d30 = fmtDate(new Date(now.getTime() - 30 * 864e5));
const stale = Q(`SELECT c.id, c.name, c.last_visit_at, c.level,
  (SELECT COUNT(*) FROM todos t WHERE t.customer_id=c.id AND t.status='open') AS open_todos
  FROM customers c WHERE c.last_visit_at IS NOT NULL AND c.last_visit_at < ? AND c.status='活跃'
  ORDER BY c.last_visit_at LIMIT 15`, d30);

// ── 客户档位分布（特色概览）──
const levelDist = Q(`SELECT COALESCE(NULLIF(level,''),'未分级') AS level, COUNT(*) AS n FROM customers GROUP BY level ORDER BY n DESC`);

// ── 本周分类分布（一级归类）──
const catDist = Q(`SELECT cc.category_id, COUNT(*) AS n FROM call_categories cc
  JOIN calls cl ON cl.id=cc.call_id
  WHERE cl.visited_at > ? AND cl.visited_at <= ?
  GROUP BY cc.category_id ORDER BY n DESC`, weekStart, weekEnd);
const catMap = {};
for (const c of Q('SELECT id,parent_id,name FROM categories')) catMap[c.id] = c;
const catAgg = {};
for (const r of catDist) {
  const cat = catMap[r.category_id]; if (!cat) continue;
  const top = cat.parent_id ? (catMap[cat.parent_id] || cat) : cat;
  catAgg[top.name] = (catAgg[top.name] || 0) + r.n;
}

// ── 汇总统计 ──
const stats = {
  callCount: calls.length,
  callCustomers: activeCustomers.length,
  totalSec: calls.reduce((s, c) => s + (c.duration_sec || 0), 0),
  avgSec: calls.length ? Math.round(calls.reduce((s, c) => s + (c.duration_sec || 0), 0) / calls.length) : 0,
  longest: calls.length ? Math.max(...calls.map(c => c.duration_sec || 0)) : 0,
  analyzed: calls.filter(c => c.analyze_status === 'done').length,
  fuCount: followups.length,
  fuClosed: followups.filter(f => f.result === '已闭环').length,
  todosNew: todosNew.length,
  todosDone: todosDone.length,
  todosOpen: todosOpen.length,
  overdue: todosOpen.filter(t => t.overdue === 1).length,
  flagsOpen: flags.length,
  highOpen: todosOpen.filter(t => t.priority === '高').length,
};

const out = { ok: true, weekStart, weekEnd, weekStartDay, weekEndDay, stats, calls, followups, flags,
  todos: { todosNew, todosDone, todosOpen }, highlightsNew, highlightsOpen, activeCustomers, stale, levelDist, catAgg };
console.log(JSON.stringify(out));
