// 拜访志 · 数据层
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'calls.db');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const KEEP = 20;
let lastBackup = 0;

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'data', 'daily'), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// 轻量迁移：老库补新列（幂等）
function ensureCol(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
ensureCol('calls', 'audio_deleted', "INTEGER DEFAULT 0");
ensureCol('customers', 'sales', "TEXT DEFAULT ''");
ensureCol('customers', 'contact_name', "TEXT DEFAULT ''");
ensureCol('customers', 'contact_phone', "TEXT DEFAULT ''");
ensureCol('customers', 'share_token', "TEXT DEFAULT ''");
ensureCol('followups', 'author', "TEXT DEFAULT 'Bill'");
ensureCol('todos', 'done_by', "TEXT DEFAULT ''");

// 重点事项 · 归档机制（2026-09-08）：status open=待处理 archived=已处理（保留节点，仅从重点列表隐藏）
ensureCol('highlights', 'status', "TEXT DEFAULT 'open'");
ensureCol('highlights', 'archived_at', "TEXT DEFAULT ''");

// 手动来源（2026-09-14）：手工待办可脱离通话存在 → 重点事项 call_id 允许为空
// SQLite 无法直接改列约束，用重建表方式（幂等：仅当老表仍是 NOT NULL 时执行）
try {
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='highlights'").get();
  if (info && /call_id\s+TEXT\s+NOT\s+NULL/i.test(info.sql)) {
    db.exec('BEGIN');
    db.exec(`CREATE TABLE highlights_new(
      id TEXT PRIMARY KEY,
      call_id TEXT,
      customer_id TEXT,
      category_id TEXT,
      content TEXT NOT NULL,
      kind TEXT DEFAULT '结论',
      importance INTEGER DEFAULT 3,
      pinned INTEGER DEFAULT 0,
      source TEXT DEFAULT 'ai',
      status TEXT DEFAULT 'open',
      archived_at TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    )`);
    db.exec(`INSERT INTO highlights_new(id,call_id,customer_id,category_id,content,kind,importance,pinned,source,status,archived_at,created_at,updated_at)
             SELECT id,call_id,customer_id,category_id,content,kind,importance,pinned,source,status,archived_at,created_at,updated_at FROM highlights`);
    db.exec('DROP TABLE highlights');
    db.exec('ALTER TABLE highlights_new RENAME TO highlights');
    db.exec('CREATE INDEX IF NOT EXISTS idx_hl_call ON highlights(call_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_hl_pin ON highlights(pinned, importance)');
    db.exec('COMMIT');
    console.log('[migrate] highlights.call_id -> nullable 完成');
  }
} catch (e) {
  try { db.exec('ROLLBACK'); } catch (_) {}
  console.error('[migrate] highlights nullable:', e.message);
}

// 存量分类归并：背景/数据 → 事实（10 类收敛为 8 类，幂等）
try {
  db.exec(`UPDATE highlights SET kind='事实' WHERE kind IN ('背景','数据')`);
} catch (e) { console.error('[migrate] kind merge:', e.message); }

function backup() {
  const now = Date.now();
  if (now - lastBackup < 120000) return;   // 节流 2 分钟一次，避免高频写库时反复整库复制
  lastBackup = now;
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    while (files.length >= KEEP) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, stamp + '.db'));
  } catch (e) {
    console.error('[backup] failed:', e.message);
  }
}

const all = (sql, ...a) => db.prepare(sql).all(...a);
const get = (sql, ...a) => db.prepare(sql).get(...a);
const exec = (sql) => { db.exec(sql); backup(); };

function run(sql, ...a) {
  const r = db.prepare(sql).run(...a);
  backup();
  return r;
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function today() { return now().slice(0, 10); }

function addLog(action, target, detail, who = 'Bill') {
  db.prepare('INSERT INTO logs(ts,who,action,target,detail) VALUES(?,?,?,?,?)')
    .run(now(), who, action, target || '', detail || '');
}

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { db, all, get, run, exec, backup, now, today, addLog, uuid, ROOT, DB_PATH };
