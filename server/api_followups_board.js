// 拜访志 · 跟进板块：超 30 天未联系客户的唤醒清单 + 建议 + 已处理
// 思路：stale 客户 → 按「商机在手 / 历史成交 / 线索沉睡」分层 → 生成建议与优先级 → 逐家收口
const { all, get, run, now, today, addLog, uuid } = require('./db.js');

const STALE_DAYS = 30;

function staleDate() {
  return new Date(Date.now() - STALE_DAYS * 864e5).toISOString().slice(0, 10);
}

// ── 建议引擎：按客户数据自动分层 + 生成建议 ──────────────
// 层级：A 商机在手（有未闭环待办/跟进中要点）→ 电话优先
//       B 历史成交（有通话沉淀、无挂起事项）→ 复购由头回访
//       C 线索沉睡（仅建档无通话）→ 微信轻触达
function tierOf(c) {
  if (c.ot > 0) return 'A';                                    // 有未完成待办
  if (c.fu_open > 0) return 'A';                               // 有跟进中事项
  if (c.pin_hl > 0) return 'A';                                // 有置顶要点
  if ((c.hl_cnt || 0) > 0) return 'B';                         // 有沉淀要点（合作过）
  return 'C';
}

const TIER_META = {
  A: { name: '商机在手', color: 'r', method: '电话', reason: '有挂起事项/未闭环待办，直接谈进展' },
  B: { name: '历史成交', color: 'y', method: '电话/微信', reason: '有合作沉淀，用复购周期做由头' },
  C: { name: '线索沉睡', color: '', method: '微信', reason: '仅建档无通话，低成本低压力触达' },
};

// 建议时限：A 层 3 天内，B 层 7 天内，C 层 14 天内
function suggestDeadline(tier, lastVisit) {
  const base = new Date();
  const days = tier === 'A' ? 3 : tier === 'B' ? 7 : 14;
  // 失联越久时限越靠前一点：每多 30 天提前 1 天，但不早于明天
  const lv = new Date(String(lastVisit || '').replace(/-/g, '/'));
  const staleMonths = isNaN(lv.getTime()) ? 1 : Math.max(1, Math.floor((Date.now() - lv.getTime()) / (30 * 864e5)));
  base.setDate(base.getDate() + Math.max(1, days - (staleMonths - 1)));
  return base.toISOString().slice(0, 10);
}

function priorityOf(tier, ot, staleMonths) {
  if (tier === 'A') return ot > 0 ? '高' : '中';
  if (tier === 'B') return staleMonths >= 2 ? '中' : '低';
  return '低';
}

// 拿客户的最近一次跟进（待办/重点/客户级取最新）
function lastFuOf(cid) {
  const r = get(`SELECT f.content, f.result, f.created_at FROM followups f
    WHERE (f.ref_type='customer' AND f.ref_id=?)
       OR id IN (SELECT f2.id FROM followups f2 JOIN todos t ON f2.ref_type='todo' AND t.id=f2.ref_id WHERE t.customer_id=?)
       OR id IN (SELECT f3.id FROM followups f3 JOIN highlights h ON f3.ref_type='highlight' AND h.id=f3.ref_id WHERE h.customer_id=?)
    ORDER BY f.id DESC LIMIT 1`, cid, cid, cid);
  return r || null;
}

// ── 自动生成聊点话术（新客户进 30 天清单时，无人工话术则自动提炼）──
// 规则：① 上次事项确认 = 挂起待办 + 最近通话中未闭环的承诺/待办类要点
//      ② 聊点三条 = 置顶/高重要度要点 + 待办 + 最近跟进事项，按价值排序
function autoTalkpoints(c, stats) {
  const items = [];   // 待确认线头
  const talks = [];   // 重点聊

  // 1) 挂起待办（最强的"上次事项"信号）
  const openTodos = all(`SELECT content, due_date, priority FROM todos
    WHERE customer_id=? AND status='open' ORDER BY priority DESC, due_date LIMIT 3`, c.id);
  for (const t of openTodos) {
    items.push(`${t.due_date ? `【${t.due_date}到期】` : ''}${t.content}`);
  }

  // 2) 未闭环的待办/承诺类要点（近 60 天内沉淀的）
  const pendHl = all(`SELECT content, kind FROM highlights
    WHERE customer_id=? AND status!='archived' AND kind IN ('待办','承诺','需求','机会')
    ORDER BY pinned DESC, importance DESC, created_at DESC LIMIT 4`, c.id);
  for (const h of pendHl) {
    const line = `${h.kind === '机会' ? '【机会】' : h.kind === '承诺' ? '【我方承诺】' : h.kind === '需求' ? '【客户需求】' : '【待办】'}${h.content}`;
    if (items.length < 3 && !items.some(x => x.slice(-30) === h.content.slice(-30))) items.push(line);
  }

  // 3) 最近一次跟进的悬置事项
  const fu = lastFuOf(c.id);
  if (fu && fu.result !== '已闭环' && fu.content && items.length < 3) {
    items.push(`【最近跟进·${fu.result || '进行中'}】${fu.content}`);
  }

  // 聊点构建：按信息价值取 3 条
  // ① 未闭环要点（需求/机会最优先——这是钱）
  for (const h of pendHl) {
    if (h.kind === '需求' || h.kind === '机会') {
      talks.push(`${h.kind === '机会' ? '推进机会' : '跟进需求'}：${h.content}`);
    }
  }
  // ② 挂起待办（承诺要兑现）
  for (const t of openTodos.slice(0, 2)) {
    talks.push(`兑现事项：${t.content}`);
  }
  // ③ 沉淀要点中的关键结论（客户画像类）
  if (talks.length < 3) {
    const hl = all(`SELECT content FROM highlights
      WHERE customer_id=? AND status!='archived' AND kind IN ('结论','决策','事实','风险')
      ORDER BY pinned DESC, importance DESC LIMIT 3`, c.id);
    for (const h of hl) {
      if (talks.length >= 3) break;
      talks.push(`围绕共识聊：${h.content}`);
    }
  }
  // ④ 兜底：分场景默认话术
  while (talks.length < 3) {
    const fallback = [
      '节后回访：上次沟通的事项进展确认',
      '复购窗口：老产品差不多到再次采购周期，顺势推升级型号',
      '近况探底：需求还在吗？采购模式变了吗？有竞品接触吗？',
    ];
    const next = fallback.find(f => !talks.includes(f));
    if (!next) break;
    talks.push(next);
  }

  return { pending_items: items.slice(0, 3).join('\n'), talk: talks.slice(0, 3) };
}

// 确保清单里每家客户都有聊点话术：有人工的用人工，没有的自动生成并落库
function ensureTalkpoints(list) {
  let generated = 0;
  for (const x of list) {
    if (x.pending_items || (x.talk && x.talk.length)) continue;  // 已有人工/历史话术
    const c = get('SELECT id, name FROM customers WHERE id=?', x.id);
    if (!c) continue;
    const stats = { ot: x.open_todos };
    const tp = autoTalkpoints(c, stats);
    if (!tp.pending_items && !(tp.talk && tp.talk.length)) continue;
    run(`INSERT INTO fu_talkpoints(customer_id,pending_items,talk1,talk2,talk3,updated_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(customer_id) DO UPDATE SET
           pending_items=excluded.pending_items, talk1=excluded.talk1,
           talk2=excluded.talk2, talk3=excluded.talk3, updated_at=excluded.updated_at`,
      x.id, tp.pending_items, (tp.talk || [])[0] || '', (tp.talk || [])[1] || '', (tp.talk || [])[2] || '', now());
    x.pending_items = tp.pending_items;
    x.talk = tp.talk;
    generated++;
  }
  return generated;
}

// 已处理记录的回看（最近 N 天）
function dismissedWithinDays(days) {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

module.exports = {
  // 跟进板块主列表：stale 客户 + 分层 + 建议 + 优先级 + 建议时限 + 聊点话术
  'GET /api/followups/board': async (req, res, b, q) => {
    const d30 = staleDate();
    // 聊点建议表整表读出（小表）
    const tpMap = {};
    for (const t of all('SELECT * FROM fu_talkpoints')) tpMap[t.customer_id] = t;
    const rows = all(`
      SELECT c.id, c.name, c.sales, c.owner, c.contact_name, c.contact_phone,
             c.last_visit_at, c.visit_count, c.level, c.status, c.note,
             (SELECT COUNT(*) FROM todos t WHERE t.customer_id=c.id AND t.status='open') AS ot
      FROM customers c
      WHERE c.last_visit_at IS NOT NULL AND c.last_visit_at < ?
        AND NOT EXISTS (   -- 30 天内已收口的客户不再出现在主清单（已处理即隐藏）
          SELECT 1 FROM followups f
          WHERE f.ref_type='stale_dismiss' AND f.ref_id=c.id
            AND substr(f.created_at,1,10) >= ?
        )
      ORDER BY c.last_visit_at ASC`, d30, dismissedWithinDays(30));
    const out = [];
    for (const c of rows) {
      const fuOpen = get(`SELECT COUNT(*) n FROM followups f WHERE f.closed=0 AND (
        (f.ref_type='customer' AND f.ref_id=?)
        OR id IN (SELECT f2.id FROM followups f2 JOIN todos t ON f2.ref_type='todo' AND f2.ref_id=t.id WHERE t.customer_id=? AND t.status='open')
      )`, c.id, c.id).n;
      const pinHl = get(`SELECT COUNT(*) n FROM highlights h WHERE h.customer_id=? AND h.pinned=1 AND h.status!='archived'`, c.id).n;
      const hlCnt = get(`SELECT COUNT(*) n FROM highlights h WHERE h.customer_id=?`, c.id).n;
      const fu = lastFuOf(c.id);
      const lv = new Date(String(c.last_visit_at).replace(/-/g, '/'));
      const staleMonths = isNaN(lv.getTime()) ? 1 : Math.max(1, Math.round((Date.now() - lv.getTime()) / (30 * 864e5)));
      const tier = tierOf({ ot: c.ot, fu_open: fuOpen, pin_hl: pinHl, hl_cnt: hlCnt });
      const meta = TIER_META[tier];
      const tp = tpMap[c.id] || {};
      out.push({
        id: c.id, name: c.name, sales: c.sales, owner: c.owner,
        contact_name: c.contact_name, contact_phone: c.contact_phone,
        last_visit_at: c.last_visit_at, visit_count: c.visit_count,
        days_stale: Math.floor((Date.now() - lv.getTime()) / 864e5) || 0,
        stale_months: staleMonths, open_todos: c.ot, pinned_hl: pinHl, hl_count: hlCnt,
        last_fu: fu ? fu.content : null, last_fu_res: fu ? fu.result : null, last_fu_at: fu ? fu.created_at : null,
        tier, tier_name: meta.name, tier_color: meta.color, method: meta.method, reason: meta.reason,
        priority: priorityOf(tier, c.ot, staleMonths),
        suggest_due: suggestDeadline(tier, c.last_visit_at),
        // 聊点话术（fu_talkpoints 表）
        pending_items: tp.pending_items || '',
        talk: [tp.talk1, tp.talk2, tp.talk3].filter(Boolean),
      });
    }
    // 排序：优先级 高>中>低，同级按失联时间久远在前
    const pri = { 高: 0, 中: 1, 低: 2 };
    out.sort((a, b) => (pri[a.priority] - pri[b.priority]) || (b.days_stale - a.days_stale));

    // 自动补聊点：清单里没有人工话术的客户 → 基于其待办/要点/跟进自动生成并落库
    const autoGenerated = ensureTalkpoints(out);

    // 已处理区（30 天内标记过的）
    const dismissed = all(`SELECT f.*, c.name AS customer_name FROM followups f
      LEFT JOIN customers c ON c.id = f.ref_id
      WHERE f.ref_type='stale_dismiss' AND substr(f.created_at,1,10) >= ?
      ORDER BY f.id DESC LIMIT 100`, dismissedWithinDays(30))
      .map(x => ({ id: x.id, customer_id: x.ref_id, customer_name: x.customer_name,
        note: x.content, result: x.result, dismissed_at: x.created_at }));

    // 汇总
    const sum = {
      total: out.length,
      A: out.filter(x => x.tier === 'A').length,
      B: out.filter(x => x.tier === 'B').length,
      C: out.filter(x => x.tier === 'C').length,
      high: out.filter(x => x.priority === '高').length,
      dismissed_30d: dismissed.length,
    };
    return { ok: true, list: out, dismissed, sum, days: STALE_DAYS, auto_generated: autoGenerated };
  },

  // 已处理：标记「这条唤醒任务已收口」→ 写一条 stale_dismiss 跟进进客户档案时间线
  'POST /api/followups/board/dismiss': async (req, res, b) => {
    const cid = b.customer_id;
    const c = get('SELECT name FROM customers WHERE id=?', cid);
    if (!c) return { ok: false, err: '客户不存在' };
    const fb = require('./feedback.js');
    const note = String(b.note || '').trim() || '已联系（30 天唤醒任务收口）';
    const id = fb.addFollowup({
      ref_type: 'stale_dismiss', ref_id: cid,
      content: note, result: b.result || '已闭环', closed: 0, author: b.author || 'Bill',
    });
    addLog('stale_dismiss', cid, note.slice(0, 60));
    // 收口后清掉话术聊点：这轮唤醒结束，下次进清单（若有）重新生成，避免拿旧话术打旧仗
    run('DELETE FROM fu_talkpoints WHERE customer_id=?', cid);
    return { ok: true, id };
  },

  // 聊点话术管理：保存/更新某客户的「上次事项确认 + 重点聊123」
  'POST /api/followups/board/talkpoint': async (req, res, b) => {
    const cid = b.customer_id;
    if (!cid || !get('SELECT 1 FROM customers WHERE id=?', cid)) return { ok: false, err: '客户不存在' };
    const pending = String(b.pending_items || '').trim();
    const talks = (Array.isArray(b.talk) ? b.talk : [b.talk1, b.talk2, b.talk3])
      .map(x => String(x || '').trim()).filter(Boolean);
    run(`INSERT INTO fu_talkpoints(customer_id,pending_items,talk1,talk2,talk3,updated_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(customer_id) DO UPDATE SET
           pending_items=excluded.pending_items,
           talk1=excluded.talk1, talk2=excluded.talk2, talk3=excluded.talk3,
           updated_at=excluded.updated_at`,
      cid, pending, talks[0] || '', talks[1] || '', talks[2] || '', now());
    addLog('fu_talkpoint', cid, `聊点更新：确认${pending ? '有' : '无'} · 聊点${talks.length}条`);
    return { ok: true };
  },
};
