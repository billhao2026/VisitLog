// 拜访志 · AI 分析接口（对话内分析模式：AI 取稿 → 自己判读 → 回写结果）
const fs = require('fs');
const path = require('path');
const { all, get, run, now, addLog } = require('./db.js');
const fb = require('./feedback.js');
const contacts = require('./contacts.js');

function has(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
function buildStandardName(cust, contact, sales) {
  if (!cust) return '';
  let n = String(cust).trim();
  if (has(contact)) n += ' ' + String(contact).trim();
  if (has(sales)) n += '--' + String(sales).trim();
  return n;
}

// 取一通待分析通话的完整上下文（含字典、规则预筛、客户历史）
function context(id) {
  const c = get('SELECT * FROM calls WHERE id=?', id);
  if (!c) return { ok: false, err: 'not found' };
  const cats = all(`SELECT id,parent_id,name,criteria,keywords,is_no_content,usage_count,fixed_count FROM categories WHERE status='active' ORDER BY sort_order,id`);
  const cust = c.customer_id ? get('SELECT * FROM customers WHERE id=?', c.customer_id) : null;
  let history = [];
  if (c.customer_id) {
    history = all(`SELECT id,visited_at,visit_type,summary,sentiment FROM calls
                   WHERE customer_id=? AND id<>? AND transcribe_status='done'
                   ORDER BY visited_at DESC LIMIT 5`, c.customer_id, id);
  }
  const terms = all('SELECT wrong, "right" AS rt FROM terms WHERE enabled=1');
  const pre = fb.preClassify(c.transcript || '');
  return {
    ok: true,
    call: {
      id: c.id, title: c.title, visited_at: c.visited_at, visit_type: c.visit_type,
      duration_sec: c.duration_sec, transcript: c.transcript, summary: c.summary,
      customer: cust ? { id: cust.id, name: cust.name, level: cust.level, status: cust.status, visit_count: cust.visit_count } : null,
    },
    history,
    categories: cats.map(x => ({
      id: x.id, parent_id: x.parent_id, name: x.name,
      criteria: x.criteria, keywords: x.keywords, is_no_content: x.is_no_content,
    })),
    terms: terms.map(t => ({ wrong: t.wrong, right: t.rt })),
    pre_suggest: pre,
  };
}

module.exports = {
  // 下一条待分析
  'GET /api/ai/next-pending': async (req, res, body, q) => {
    const row = get(`SELECT id FROM calls
                     WHERE transcribe_status='done' AND analyze_status IN ('pending','error')
                     ORDER BY created_at LIMIT 1`);
    if (!row) return { ok: true, done: true, pending: 0 };
    const pending = get(`SELECT COUNT(*) c FROM calls WHERE transcribe_status='done' AND analyze_status IN ('pending','error')`).c;
    return { ...context(row.id), pending };
  },

  // 按 id 取上下文
  'GET /api/ai/context/:id': async (req) => context(req.params.id),

  // 回写分析结果
  'POST /api/ai/analyze': async (req, res, b) => {
    const id = b.call_id;
    const c = get('SELECT * FROM calls WHERE id=?', id);
    if (!c) return { ok: false, err: 'not found' };

    if (b.customer_name) {
      const nm = require('./normalize.js');
      const cid = nm.resolveCustomer(b.customer_name, { at: c.visited_at });
      run('UPDATE calls SET customer_id=? WHERE id=?', cid, id);
      nm.touch(cid, c.visited_at); // 建立关联后再统计次数
      // 组合标准客户名称：公司名称 联系人--业务员；并同步联系人/业务员/类型/地区
      const stdName = buildStandardName(b.customer_name, b.contact_name, b.sales);
      const up = ['name=?'];
      const args = [stdName];
      if (has(b.contact_name)) { up.push('contact_name=?'); args.push(String(b.contact_name).trim()); }
      if (has(b.sales)) { up.push('sales=?'); args.push(String(b.sales).trim()); }
      if (has(b.type)) { up.push('type=?'); args.push(String(b.type).trim()); }
      if (has(b.region)) { up.push('region=?'); args.push(String(b.region).trim()); }
      args.push(now(), cid);
      run(`UPDATE customers SET ${up.join(',')}, updated_at=? WHERE id=?`, ...args);
      try { contacts.enrichCustomer(cid); } catch (e) { console.error('[ai] enrich 客户联系人失败:', e.message); }
    }
    run(`UPDATE calls SET summary=?, quality_score=?, sentiment=?, next_followup_days=?,
         analyze_status='done', analyze_at=?, analyze_err=NULL, updated_at=? WHERE id=?`,
      b.summary ?? c.summary,
      b.quality_score ?? c.quality_score,
      b.sentiment ?? c.sentiment,
      b.next_followup_days ?? c.next_followup_days,
      now(), now(), id);

    const custId = get('SELECT customer_id FROM calls WHERE id=?', id).customer_id;
    const catIds = fb.applyCategories(id, b.categories || [], 'ai');
    if (Array.isArray(b.highlights)) fb.saveHighlights(id, custId, b.highlights, 'ai');
    if (Array.isArray(b.todos)) fb.saveTodos(id, custId, b.todos, 'ai');

    addLog('analyze_done', id, `${catIds.length}分类 / ${(b.highlights || []).length}要点 / ${(b.todos || []).length}待办`);
    return { ok: true, id, categories: catIds.length, pending: get(`SELECT COUNT(*) c FROM calls WHERE transcribe_status='done' AND analyze_status IN ('pending','error')`).c };
  },

  // 人工纠错（前端改动 → 反哺）
  // 生成可直接粘贴给 AI 的分析指令
  'GET /api/ai/prompt/:id': async (req) => {
    const ctx = context(req.params.id);
    if (!ctx.ok) return ctx;
    let tpl = fs.readFileSync(path.join(require('./db.js').ROOT, 'prompts', 'analysis.md'), 'utf8');
    const c = ctx.call;
    const cats = ctx.categories.map(x => {
      const no = x.is_no_content ? ' [无内容]' : '';
      return `- ${x.id}　${x.name}${no}\n  判定标准：${x.criteria || '（无）'}`;
    }).join('\n');
    const hist = ctx.history.length
      ? '## 该客户的历史拜访\n' + ctx.history.map(h =>
        `- ${h.visited_at}（${h.visit_type || '通话'}）${h.summary || '（无摘要）'}`).join('\n') + '\n'
      : '';
    const dur = c.duration_sec ? `${Math.floor(c.duration_sec / 60)} 分 ${c.duration_sec % 60} 秒` : '未知';
    tpl = tpl
      .replace(/\{\{CALL_ID\}\}/g, c.id)
      .replace(/\{\{CUSTOMER\}\}/g, c.customer ? c.customer.name : '（未知）')
      .replace(/\{\{DATE\}\}/g, c.visited_at)
      .replace(/\{\{TYPE\}\}/g, c.visit_type || '通话')
      .replace(/\{\{DURATION\}\}/g, dur)
      .replace(/\{\{HISTORY\}\}/g, hist)
      .replace(/\{\{CATEGORIES\}\}/g, cats)
      .replace(/\{\{TRANSCRIPT\}\}/g, c.transcript || '（无转写内容）');
    return { ok: true, prompt: tpl, chars: tpl.length };
  },

  'POST /api/ai/correct': async (req, res, b) => {
    const id = fb.recordCorrection(b.call_id, b.field, b.old_value, b.new_value, b.why);
    if (!id) return { ok: true, skipped: true };
    const sug = b.field === 'category' ? fb.suggestRules(b.call_id) : [];
    return { ok: true, correction_id: id, suggestions: sug };
  },

  // 采纳建议生成规则
  'POST /api/ai/rule': async (req, res, b) => {
    const rid = fb.addRule(b.pattern, b.category_id, b.source || 'manual', b.correction_id || null);
    if (!rid) return { ok: false, err: '规则生成失败（分类不存在或 pattern 为空）' };
    addLog('rule_add', String(rid), `${b.pattern} → ${b.category_id}`);
    return { ok: true, rule_id: rid };
  },

  // 转写失败重试
  'POST /api/ai/retry': async (req, res, b) => {
    const asr = require('./asr.js');
    const c = get('SELECT * FROM calls WHERE id=?', b.call_id);
    if (!c) return { ok: false, err: 'not found' };
    run("UPDATE calls SET transcribe_status='pending', transcribe_err=NULL, analyze_status='pending', updated_at=? WHERE id=?", now(), c.id);
    asr.schedule(c.id);
    addLog('retry', c.id, b.which === 'analyze' ? '重跑分析' : '重跑转写');
    return { ok: true };
  },
};
