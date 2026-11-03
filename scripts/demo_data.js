#!/usr/bin/env node
// 拜访志 · 演示数据生成器
//
// 用途：新用户装完系统是空库，界面看不出能干什么。
//       跑一次这个脚本，灌入一批虚构的演示数据，立刻能看到完整效果。
//
// 用法：
//   npm run demo            灌入演示数据（保留已有数据）
//   npm run demo -- --reset 先清空所有数据再灌
//
// 注意：演示数据全部是虚构的，不含任何真实客户信息。
//       生产使用前请务必跑 --reset 清掉。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });

// 直接用项目内的 db.js，保证与运行时完全一致的表结构
const { db, run, get, all, now, addLog, uuid, ownerName } = require(path.join(ROOT, 'server', 'db.js'));
const seedMod = require(path.join(ROOT, 'server', 'seed.js'));
seedMod.seed();

const args = process.argv.slice(2);
const RESET = args.includes('--reset');

if (RESET) {
  console.log('[demo] 清空现有数据…');
  for (const t of ['todos', 'highlights', 'followups', 'call_categories', 'corrections',
                   'flags', 'calls', 'customers', 'auth_sessions', 'logs']) {
    try { run(`DELETE FROM ${t}`); } catch (e) { /* 表不存在则跳过 */ }
  }
}

// ── 虚构数据（刻意避开真实行业与真实公司）──────────────────
const CUSTOMERS = [
  { name: '示例科技', contact: '张经理', phone: '示例-000-1', region: '华东', level: 'A', type: '重点客户' },
  { name: '示例制造', contact: '李主管', phone: '示例-000-2', region: '华南', level: 'B', type: '普通客户' },
  { name: '示例贸易', contact: '王总监', phone: '示例-000-3', region: '华北', level: 'B', type: '普通客户' },
  { name: '示例服务', contact: '赵经理', phone: '示例-000-4', region: '西南', level: 'C', type: '潜在客户' },
  { name: '示例实业', contact: '孙总',   phone: '示例-000-5', region: '华中', level: 'A', type: '重点客户' },
];

// 重点事项文案与类型：数组长度互质（5 与 3），避免与 i % 3 的筛选周期重合
// 导致生成的内容全部相同
// 待办文案：筛选条件是 i % 2 === 0，所以用 i / 2 取值，
// 否则 i % N 的周期与筛选周期重合，文案会重复
const TODO_TEXTS = [
  '提交正式报价单',
  '安排上门技术调试',
  '跟进样品使用反馈',
  '确认下次沟通时间',
  '整理上季度对账单',
  '发送产品资料包',
];

// v6：重点事项强制【客户类型】前缀（行业 + 渠道性质可组合）
const HL_TEXTS = [
  '【国央企·电商平台】客户有扩大采购计划',
  '【能源·总代经销】对交付时效有意见',
  '【医疗·终端用户】正在评估第二家供应商',
  '【教育·集成商】要求提供定制方案报价',
  '【交通·服务商】内部决策人可能更换',
  '【金融·电商平台】预算需要重新审批',
  '【通信·总代经销】竞品报价低约一成',
];
const HL_KINDS = ['机会', '风险', '决策', '机会', '风险', '决策', '机会'];

const TRANSCRIPTS = [
  '客户说下个月要追加一批订单，问我方报价和交货周期，大概三百件左右，我说明天给报价单。',
  '客户反馈上一批货到货比预期晚了三天，希望能加强物流跟踪，其他方面都还行。',
  '客户提到另外一家供应商报价更低，想让我们再让一点利，说预算有点紧，需要再商量。',
  '客户产品使用中发现一些细节问题，希望能安排一次上门调试，已经约在下周三上午。',
  '客户对新产品很感兴趣，问能不能先寄样品试用，我们答应了样品已经寄出。',
  '客户说明年可能会扩大采购规模，先了解我们这边服务能力和响应速度。',
  '客户这次主要是回访，对上次的售后处理比较满意，暂时没有其他问题。',
  '客户在电话里没说太多事，最后说再考虑一下，让我们保持联系。',
];

const SUMMARIES = [
  '客户提出追加订单意向，已约定次日提供报价单与交期。',
  '客户反馈交付延迟问题，已记录并将安排物流跟踪。',
  '客户要求进一步议价，需评估让利空间后再回复。',
  '客户反馈产品使用问题，已预约上门调试时间。',
  '客户表达对新产品的兴趣，样品已寄出待反馈。',
  '客户透露明年有扩大采购的计划，先做服务能力了解。',
  '客户对上次售后处理表示满意，本次为常规回访。',
  '本次沟通内容有限，客户表示会再考虑。',
];

const SENTIMENTS = ['积极', '积极', '中性', '消极', '积极', '积极', '积极', '中性'];
const CAT_SETS = [
  ['1.1', '1.3', '2.1'], ['3.5', '2.1'], ['2.2', '5.1'], ['3.3', '4.1'],
  ['3.4', '1.1'], ['1.2', '1.4'], ['4.5', '6.1'], ['6.3', '6.4'],
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dateOnly(daysAgoN) {
  return daysAgo(daysAgoN).slice(0, 10);
}

let nCall = 0, nTodo = 0, nHl = 0, nCust = 0;

for (let i = 0; i < 16; i++) {
  const c = CUSTOMERS[i % CUSTOMERS.length];
  const ts = daysAgo(i * 2 + 1);
  const callId = uuid();
  const dur = 180 + (i % 7) * 90;

  // 客户
  const existing = get('SELECT id FROM customers WHERE name=?', c.name);
  let cid;
  if (existing) {
    cid = existing.id;
  } else {
    cid = uuid();
    run(`INSERT INTO customers(id,name,aliases,contact_name,contact_phone,sales,owner,type,region,level,status,
         visit_count,first_visit_at,last_visit_at,share_token,tags,note,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      cid, c.name, '', c.contact, c.phone, '', ownerName(), c.type, c.region, c.level, '活跃',
      0, ts, ts, '', '', '', ts, ts);
    nCust++;
  }

  // 通话
  run(`INSERT INTO calls(id,customer_id,title,audio_path,audio_name,audio_sha1,audio_size,visit_type,visited_at,
       duration_sec,transcript,transcribe_status,analyze_status,summary,quality_score,sentiment,
       next_followup_days,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    callId, cid, `${c.name}-${c.contact}`, '', '', `demo_${callId}`, 0, '电话', ts, dur,
    `[00:00:00 - 00:0${(dur / 60) | 0}:00] ${TRANSCRIPTS[i % TRANSCRIPTS.length]}`,
    'done', 'done', SUMMARIES[i % SUMMARIES.length], 5 + (i % 5), SENTIMENTS[i % SENTIMENTS.length],
    [7, 14, 30][i % 3], ts, ts);
  nCall++;

  run('UPDATE customers SET visit_count=visit_count+1, last_visit_at=?, first_visit_at=COALESCE(first_visit_at,?), updated_at=? WHERE id=?',
    ts, ts, ts, cid);

  // 分类
  for (const catId of CAT_SETS[i % CAT_SETS.length]) {
    try {
      run('INSERT INTO call_categories(call_id,category_id,is_primary,confidence,reason,source,created_at) VALUES(?,?,?,?,?,?,?)',
        callId, catId, catId === CAT_SETS[i % CAT_SETS.length][0] ? 1 : 0, 0.8, '演示数据', 'ai', ts);
    } catch (e) { /* 唯一约束冲突则跳过 */ }
  }

  // 待办
  if (i % 2 === 0) {
    const due = i % 4 === 0 ? dateOnly(-(i + 1)) : dateOnly(i - 3);   // 制造一些超期
    run(`INSERT INTO todos(id,call_id,customer_id,content,assignee,due_date,priority,status,done_at,source,overdue,note,created_at,updated_at,done_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      uuid(), callId, cid,
      TODO_TEXTS[(i / 2 | 0) % TODO_TEXTS.length],
      ownerName(), due, i % 3 === 0 ? '高' : '中', 'open', null, 'ai', due < dateOnly(0) ? 1 : 0, '', ts, ts, '');
    nTodo++;
  }

  // 重点事项
  if (i % 3 === 0) {
    run(`INSERT INTO highlights(call_id,customer_id,content,kind,importance,status,pinned,source,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      callId, cid,
      HL_TEXTS[i % HL_TEXTS.length],
      HL_KINDS[i % HL_KINDS.length], 3 + (i % 3), 'open', i % 6 === 0 ? 1 : 0, 'ai', ts, ts);
    nHl++;
  }

  // 跟进记录
  run(`INSERT INTO followups(ref_type,ref_id,content,result,due_date,closed,author,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    'customer', cid, '已电话沟通，等待客户内部确认', '推进中', dateOnly(i - 7), 0, ownerName(), ts, ts);
}

addLog('demo', '', `生成演示数据：${nCall} 通话 / ${nCust} 客户 / ${nTodo} 待办 / ${nHl} 重点`);

console.log('');
console.log('  演示数据已生成');
console.log(`  ${nCall} 通通话 · ${nCust} 个客户 · ${nTodo} 条待办 · ${nHl} 条重点`);
console.log('');
console.log('  全部为虚构数据，不含任何真实客户信息。');
console.log('  生产使用前请运行：npm run demo -- --reset');
console.log('');

db.close();
