-- 跟进板块 · 聊点建议表（逐客户"重点聊什么 123" + 上次事项进展确认）
-- 由 2026-10-08 的 16 家超 30 天未联系客户分析沉淀；后续新客户由 AI/人工补充
CREATE TABLE IF NOT EXISTS fu_talkpoints(
  customer_id TEXT PRIMARY KEY,     -- 对应 customers.id
  pending_items TEXT DEFAULT '',    -- 上次事项进展确认（遗留线头，电话第一句就用）；
  talk1 TEXT DEFAULT '',            -- 重点聊 ①
  talk2 TEXT DEFAULT '',            -- 重点聊 ②
  talk3 TEXT DEFAULT '',            -- 重点聊 ③
  updated_at TEXT
);
