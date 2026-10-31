// 拜访志 · 反哺闭环：人工改动 → 证据 → 规则 → 字典
const { all, get, run, now, addLog, uuid, ownerName } = require('./db.js');

// 按名称或 id 找分类；名称支持 "1.2 xxx" 或 "xxx"
function findCategory(key) {
  if (!key) return null;
  const byId = get('SELECT * FROM categories WHERE id=?', key);
  if (byId) return byId;
  const name = String(key).trim().replace(/^\d+(\.\d+)?\s*/, '');
  return get('SELECT * FROM categories WHERE name=?', name) || null;
}

function applyCategories(callId, cats, source = 'ai') {
  run('DELETE FROM call_categories WHERE call_id=?', callId);
  const out = [];
  for (const c of cats || []) {
    const cat = findCategory(c.category_id || c.name || c.category);
    if (!cat) continue;
    run(`INSERT OR REPLACE INTO call_categories(call_id,category_id,is_primary,confidence,reason,source,created_at)
         VALUES(?,?,?,?,?,?,?)`,
      callId, cat.id, c.is_primary ? 1 : 0, c.confidence ?? 1.0, c.reason || '', c.source || source, now());
    run('UPDATE categories SET usage_count=usage_count+1, updated_at=? WHERE id=?', now(), cat.id);
    out.push(cat.id);
  }
  return out;
}

// 重点事项类型白名单（与 prompts/analysis.md 九类保持一致；AI 越界产出一律归"结论"）
const HL_KINDS = ['结论', '承诺', '风险', '需求', '异议', '决策', '机会', '事实', '待办'];

function saveHighlights(callId, customerId, arr, source = 'ai') {
  run('DELETE FROM highlights WHERE call_id=? AND source=?', callId, source);
  for (const h of arr || []) {
    const cat = findCategory(h.category);
    const kind = HL_KINDS.includes(h.kind) ? h.kind : '结论';
    run(`INSERT INTO highlights(id,call_id,customer_id,category_id,content,kind,importance,pinned,source,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      uuid(), callId, customerId || null, cat ? cat.id : null,
      String(h.content || '').trim(), kind,
      Math.max(1, Math.min(5, Number(h.importance) || 3)),
      h.pinned ? 1 : 0, source, now(), now());
  }
}

function saveTodos(callId, customerId, arr, source = 'ai') {
  run('DELETE FROM todos WHERE call_id=? AND source=?', callId, source);
  for (const t of arr || []) {
    const due = t.due_date || null;
    run(`INSERT INTO todos(id,call_id,customer_id,content,assignee,due_date,priority,status,source,note,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?, 'open', ?,?,?,?)`,
      uuid(), callId, customerId || null, String(t.content || '').trim(),
      t.assignee || ownerName(), due, t.priority || '中', source, t.note || '', now(), now());
  }
}

// 写一条跟进（主站 /api/followups 与分享页共用）：todo 联动顺延/闭环
function addFollowup(o) {
  const { ref_type, ref_id, content, result, due_date, closed } = o;
  const text = String(content || '').trim();
  const ts = now();
  const r = run(`INSERT INTO followups(ref_type,ref_id,content,result,due_date,closed,author,created_at,updated_at)
                 VALUES(?,?,?,?,?,?,?,?,?)`,
    ref_type, ref_id, text || '（闭环）', result || '', due_date || null,
    closed ? 1 : 0, o.author || ownerName(), ts, ts);
  if (ref_type === 'todo') {
    if (due_date) run('UPDATE todos SET due_date=?, overdue=0, updated_at=? WHERE id=?', due_date, ts, ref_id);
    if (closed) run("UPDATE todos SET status='done', done_at=?, overdue=0, updated_at=? WHERE id=?", ts, ts, ref_id);
  }
  addLog('followup', ref_id, `${ref_type}@${o.author || ownerName()}: ${(text || '闭环').slice(0, 50)}`);
  return r.lastInsertRowid;
}

// 记录人工改动，作为反哺证据
function recordCorrection(callId, field, oldValue, newValue, why = '') {
  if (String(oldValue ?? '') === String(newValue ?? '')) return null;
  const r = run(`INSERT INTO corrections(call_id,field,old_value,new_value,evidence,why,created_at,created_by)
                 VALUES(?,?,?,?,?,?,?, ownerName())`,
    callId, field, String(oldValue ?? ''), String(newValue ?? ''), '', why, now());
  if (field === 'category' && newValue) {
    const cat = findCategory(newValue);
    if (cat) run('UPDATE categories SET fixed_count=fixed_count+1, updated_at=? WHERE id=?', now(), cat.id);
  }
  addLog('correction', callId, `${field}: ${oldValue} → ${newValue}`);
  return r.lastInsertRowid;
}

// 人工改了分类 → 提示生成匹配规则（同原文再见就直接判到该类）
function suggestRules(callId) {
  const rows = all(`SELECT * FROM corrections WHERE call_id=? AND field='category' AND applied=0`, callId);
  const call = get('SELECT transcript FROM calls WHERE id=?', callId);
  const text = call ? (call.transcript || '') : '';
  const out = [];
  for (const c of rows) {
    const cat = findCategory(c.new_value);
    if (!cat) continue;
    const words = (cat.keywords || '').split(/[,，|]/).map(s => s.trim()).filter(Boolean);
    const hit = words.find(w => text.includes(w))
      || (text.match(/[一-龥]{3,6}/g) || []).slice(0, 1)[0];
    if (!hit) continue;
    out.push({ correction_id: c.id, category_id: cat.id, category_name: cat.name, pattern: hit });
  }
  return out;
}

function addRule(pattern, categoryId, source = 'manual', correctionId = null) {
  const cat = findCategory(categoryId);
  if (!cat || !pattern) return null;
  const exist = get('SELECT id FROM rules WHERE pattern=? AND category_id=?', pattern, cat.id);
  if (exist) {
    run('UPDATE rules SET hit_count=hit_count+0, enabled=1, updated_at=? WHERE id=?', now(), exist.id);
    return exist.id;
  }
  const r = run('INSERT INTO rules(pattern,category_id,hit_count,enabled,source,created_at,updated_at) VALUES(?,?,0,1,?,?,?)',
    pattern, cat.id, source, now(), now());
  if (correctionId) run('UPDATE corrections SET applied=1, rule_id=? WHERE id=?', r.lastInsertRowid, correctionId);
  return r.lastInsertRowid;
}

// 已有规则预筛：给 AI 的参考建议
function preClassify(text) {
  const t = text || '';
  const out = [];
  for (const r of all('SELECT * FROM rules WHERE enabled=1 ORDER BY hit_count DESC')) {
    if (t.includes(r.pattern)) {
      run('UPDATE rules SET hit_count=hit_count+1, updated_at=? WHERE id=?', now(), r.id);
      const c = get('SELECT id,name FROM categories WHERE id=?', r.category_id);
      if (c) out.push({ category_id: c.id, name: c.name, pattern: r.pattern, confidence: 0.7, reason: '命中规则：' + r.pattern });
    }
  }
  return out;
}

module.exports = {
  findCategory, applyCategories, saveHighlights, saveTodos, addFollowup,
  recordCorrection, suggestRules, addRule, preClassify,
};
