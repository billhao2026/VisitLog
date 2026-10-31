-- 拜访志 VisitLog · 数据库结构
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS calls(
  id TEXT PRIMARY KEY,
  title TEXT,
  audio_path TEXT,
  audio_name TEXT,
  audio_sha1 TEXT UNIQUE,
  audio_size INTEGER,
  duration_sec INTEGER,
  customer_id TEXT,
  visit_type TEXT,
  visited_at TEXT,
  transcript TEXT,
  transcript_raw TEXT,
  transcribe_status TEXT DEFAULT 'pending',
  transcribe_err TEXT,
  transcribe_at TEXT,
  analyze_status TEXT DEFAULT 'pending',
  analyze_err TEXT,
  analyze_at TEXT,
  summary TEXT,
  quality_score INTEGER,
  sentiment TEXT,
  next_followup_days INTEGER,
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_calls_tstat ON calls(transcribe_status);
CREATE INDEX IF NOT EXISTS idx_calls_astat ON calls(analyze_status);
CREATE INDEX IF NOT EXISTS idx_calls_cust ON calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_time ON calls(visited_at);

CREATE TABLE IF NOT EXISTS customers(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  aliases TEXT,
  type TEXT,
  region TEXT,
  level TEXT,
  tags TEXT,
  owner TEXT DEFAULT '',
  sales TEXT DEFAULT '',           -- 对接业务员
  contact_name TEXT DEFAULT '',    -- 客户姓名（联系人，从录音提炼可改）
  contact_phone TEXT DEFAULT '',   -- 客户电话
  share_token TEXT,                -- 客户汇总页分享链接 token（可停用置空收回）
  status TEXT DEFAULT '活跃',
  first_visit_at TEXT,
  last_visit_at TEXT,
  visit_count INTEGER DEFAULT 0,
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cust_name ON customers(name);

CREATE TABLE IF NOT EXISTS todos(
  id TEXT PRIMARY KEY,
  call_id TEXT,
  customer_id TEXT,
  content TEXT NOT NULL,
  assignee TEXT DEFAULT '',
  due_date TEXT,
  priority TEXT DEFAULT '中',
  status TEXT DEFAULT 'open',
  done_at TEXT,
  source TEXT DEFAULT 'ai',
  overdue INTEGER DEFAULT 0,
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_st ON todos(status, due_date);
CREATE INDEX IF NOT EXISTS idx_todos_cust ON todos(customer_id);
CREATE INDEX IF NOT EXISTS idx_todos_call ON todos(call_id);

CREATE TABLE IF NOT EXISTS highlights(
  id TEXT PRIMARY KEY,
  call_id TEXT,                   -- 来源通话；手动添加时为空
  customer_id TEXT,
  category_id TEXT,
  content TEXT NOT NULL,
  kind TEXT DEFAULT '结论',
  importance INTEGER DEFAULT 3,
  pinned INTEGER DEFAULT 0,
  source TEXT DEFAULT 'ai',       -- ai | manual
  status TEXT DEFAULT 'open',
  archived_at TEXT DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_hl_call ON highlights(call_id);
CREATE INDEX IF NOT EXISTS idx_hl_pin ON highlights(pinned, importance);

CREATE TABLE IF NOT EXISTS categories(
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  level INTEGER,
  name TEXT NOT NULL,
  criteria TEXT,
  keywords TEXT,
  status TEXT DEFAULT 'active',
  is_no_content INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  fixed_count INTEGER DEFAULT 0,
  evidence TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_cat_status ON categories(status);

CREATE TABLE IF NOT EXISTS call_categories(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  confidence REAL DEFAULT 1.0,
  reason TEXT,
  source TEXT DEFAULT 'ai',
  created_at TEXT,
  UNIQUE(call_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_cc_call ON call_categories(call_id);
CREATE INDEX IF NOT EXISTS idx_cc_cat ON call_categories(category_id);

CREATE TABLE IF NOT EXISTS corrections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  evidence TEXT,
  why TEXT,
  applied INTEGER DEFAULT 0,
  rule_id INTEGER,
  created_at TEXT,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_corr_field ON corrections(field, created_at);
CREATE INDEX IF NOT EXISTS idx_corr_app ON corrections(applied);

CREATE TABLE IF NOT EXISTS rules(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field TEXT DEFAULT 'category',
  pattern TEXT NOT NULL,
  category_id TEXT NOT NULL,
  hit_count INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  source TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rules_en ON rules(enabled, hit_count);

CREATE TABLE IF NOT EXISTS terms(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wrong TEXT NOT NULL UNIQUE,
  right TEXT NOT NULL,
  hit_count INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,
  who TEXT,
  action TEXT,
  target TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);

CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);

CREATE TABLE IF NOT EXISTS pushes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  push_date TEXT UNIQUE,
  kind TEXT,
  content TEXT,
  sent_at TEXT
);

-- 跟进记录（编写式：时间 + 文本 + 结果档，挂到待办/重点/客户等对象上）
CREATE TABLE IF NOT EXISTS followups(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL,          -- todo | highlight | customer | call
  ref_id TEXT NOT NULL,
  content TEXT NOT NULL,
  result TEXT DEFAULT '',          -- 无进展 | 推进中 | 有突破 | 已闭环
  due_date TEXT,                   -- 填写后同步改期（仅 todo 生效）
  closed INTEGER DEFAULT 0,        -- 1 = 同步闭环（仅 todo 生效）
  author TEXT DEFAULT '',      -- 记录人（业务负责人/跟进人/外部接收者）
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_fu_ref ON followups(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_fu_at ON followups(created_at);

-- 敏感词库（命中清单）
CREATE TABLE IF NOT EXISTS sensitives(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  tag TEXT DEFAULT '其他',         -- 故障 | 投诉 | 售后 | 账期 | 回款 | 竞争 | 其他
  enabled INTEGER DEFAULT 1,
  hit_count INTEGER DEFAULT 0,
  created_at TEXT
);

-- 访问口令会话（持久化，服务重启不失效）
CREATE TABLE IF NOT EXISTS auth_sessions(
  token TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);

-- 预警命中记录（扫描转写稿得出）
CREATE TABLE IF NOT EXISTS flags(
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  customer_id TEXT,
  word TEXT NOT NULL,
  tag TEXT DEFAULT '其他',
  snippet TEXT,
  handled INTEGER DEFAULT 0,
  handled_at TEXT,
  source TEXT DEFAULT 'scan',
  created_at TEXT,
  UNIQUE(call_id, word)
);
CREATE INDEX IF NOT EXISTS idx_flags_open ON flags(handled, created_at);
CREATE INDEX IF NOT EXISTS idx_flags_call ON flags(call_id);
