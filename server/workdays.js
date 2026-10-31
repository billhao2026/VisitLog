// 拜访志 · 工作日 / 休假日工具
// 休假日存放于 settings.nonWorkdays，JSON 数组，如 ["2026-10-16"]
// 工作日 = 非周六日 且 非休假日
const { get, run, all, addLog, now } = require('./db.js');

const RE = /^\d{4}-\d{2}-\d{2}$/;

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function getNonWorkdays() {
  const r = get("SELECT v FROM settings WHERE k='nonWorkdays'");
  if (!r || !r.v) return [];
  try {
    const a = JSON.parse(r.v);
    if (!Array.isArray(a)) return [];
    return Array.from(new Set(a.map(x => String(x).trim()).filter(x => RE.test(x)))).sort();
  } catch (e) { return []; }
}

function setNonWorkdays(list) {
  const arr = Array.from(new Set((list || []).map(x => String(x).trim()).filter(x => RE.test(x)))).sort();
  run("INSERT INTO settings(k,v) VALUES('nonWorkdays',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", JSON.stringify(arr));
  addLog('nonworkdays', '', arr.join(',') || '(空)');
  return arr;
}

function isWeekend(d) {
  const s = String(d || '').slice(0, 10);
  if (!RE.test(s)) return false;
  const dow = new Date(s + 'T00:00:00').getDay();
  return dow === 0 || dow === 6;
}

function isNonWorkday(d) {
  const s = String(d || '').slice(0, 10);
  return !!s && getNonWorkdays().indexOf(s) >= 0;
}

function isWorkday(d) {
  return !isWeekend(d) && !isNonWorkday(d);
}

// 从 d（含）起向后找第一个工作日
function nextWorkday(d) {
  const s0 = String(d || '').slice(0, 10);
  const cur = new Date(s0 + 'T00:00:00');
  if (isNaN(cur.getTime())) return s0;
  const nw = new Set(getNonWorkdays());
  for (let i = 0; i < 90; i++) {
    const s = fmt(cur);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !nw.has(s)) return s;
    cur.setDate(cur.getDate() + 1);
  }
  return fmt(cur);
}

// 从 d（含）起向前回退到最近的工作日
function prevWorkday(d) {
  const s0 = String(d || '').slice(0, 10);
  const cur = new Date(s0 + 'T00:00:00');
  if (isNaN(cur.getTime())) return s0;
  const nw = new Set(getNonWorkdays());
  for (let i = 0; i < 90; i++) {
    const s = fmt(cur);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !nw.has(s)) return s;
    cur.setDate(cur.getDate() - 1);
  }
  return fmt(cur);
}

// 把所有未完成待办的到期日从非工作日（周六日 / 休假日）顺延到下一个工作日
// 返回调整明细 [{ id, from, to }]；无变化返回空数组
function rescheduleOpenTodos() {
  const rows = all("SELECT id, due_date FROM todos WHERE status='open' AND due_date IS NOT NULL AND due_date<>''");
  const changed = [];
  for (const r of rows) {
    const s = String(r.due_date || '').slice(0, 10);
    if (!RE.test(s)) continue;
    const nd = nextWorkday(s);
    if (nd !== s) {
      run('UPDATE todos SET due_date=?, updated_at=? WHERE id=?', nd, now(), r.id);
      changed.push({ id: r.id, from: s, to: nd });
    }
  }
  if (changed.length) addLog('todo_shift', '', `到期日顺延 ${changed.length} 条（非工作日）`);
  return changed;
}

module.exports = { getNonWorkdays, setNonWorkdays, isNonWorkday, isWeekend, isWorkday, nextWorkday, prevWorkday, rescheduleOpenTodos, fmt };
