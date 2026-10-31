// 冒烟测试 2/3：AI 回写
//
// 覆盖：AI 返回 JSON → 系统回写摘要/评分/情绪/分类/要点/待办
//        改判反哺（correction → 分类规则）、自动归类、术语纠错
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { withServer } = require('./helpers.js');

// 造一条已转写完成的通话
function seedCall(s, id, opts = {}) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(s.dir, 'data', 'calls.db'));
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`INSERT INTO calls(id,title,audio_path,audio_name,audio_sha1,audio_size,visit_type,visited_at,
              transcript,transcribe_status,analyze_status,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, opts.title || '测试通话', `audio/raw/${id}.m4a`, `${id}.m4a`, `sha_${id}`, 1024,
         '电话', now, opts.transcript || '[00:00:00 - 00:00:30] 这是一段测试转写内容',
         'done', 'pending', now, now);
  db.close();
  return id;
}

test('AI 回写 · 完整 JSON 回写六件套', withServer(async (s) => {
  const id = seedCall(s, 'ai1');

  const r = await s.post('/api/ai/analyze', {
    call_id: id,
    customer_name: '测试客户甲',
    summary: '客户反馈了新的采购需求，我方已给出初步报价。',
    quality_score: 8,
    sentiment: '积极',
    next_followup_days: 7,
    categories: [
      { category_id: '1.1', is_primary: true, confidence: 0.9, reason: '客户提出新的采购意向' },
      { category_id: '2.1', is_primary: false, confidence: 0.7, reason: '讨论了报价细节' },
    ],
    highlights: [
      { content: '客户计划下季度扩大采购规模', kind: '机会', importance: 4 },
    ],
    todos: [
      { content: '下周三前提交正式报价单', due_date: null, priority: '高' },
    ],
  });

  assert.strictEqual(r.body.ok, true, `回写失败: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.categories, 2, '应写入 2 个分类');

  // 逐项验证落库
  const call = await s.get(`/api/calls/${id}`);
  assert.strictEqual(call.body.ok, true);
  assert.ok(call.body.call.summary.includes('采购需求'), '摘要未写入');
  assert.strictEqual(call.body.call.quality_score, 8, '评分未写入');
  assert.strictEqual(call.body.call.sentiment, '积极', '情绪未写入');
  assert.strictEqual(call.body.call.analyze_status, 'done', '分析状态未置为 done');

  // 要点与待办
  const hls = await s.get('/api/highlights');
  assert.ok(hls.body.list.some(h => h.content.includes('扩大采购规模')), '要点未写入');

  const todos = await s.get('/api/todos');
  assert.ok(todos.body.list.some(t => t.content.includes('正式报价单')), '待办未写入');
}));

test('AI 回写 · 客户自动建档并关联', withServer(async (s) => {
  const id = seedCall(s, 'ai2');
  const r = await s.post('/api/ai/analyze', {
    call_id: id, customer_name: '测试客户乙',
    summary: '摘要', quality_score: 6, sentiment: '中性', categories: [],
  });
  assert.strictEqual(r.body.ok, true);

  const custs = await s.get('/api/customers');
  const c = custs.body.list.find(x => x.name === '测试客户乙');
  assert.ok(c, '客户未自动建档');
  assert.ok(c.visit_count >= 1, '拜访次数未累加');
}));

test('AI 回写 · 空字段不覆盖已有值', withServer(async (s) => {
  const id = seedCall(s, 'ai3');
  // 先写一次摘要
  await s.post('/api/ai/analyze', { call_id: id, summary: '原始摘要', quality_score: 7, sentiment: '中性' });
  // 再用空值回写
  await s.post('/api/ai/analyze', { call_id: id, summary: '', quality_score: null });

  const call = await s.get(`/api/calls/${id}`);
  assert.strictEqual(call.body.call.summary, '原始摘要', '空值不应覆盖原摘要');
  assert.strictEqual(call.body.call.quality_score, 7, 'null 不应覆盖原评分');
}));

test('AI 回写 · 不存在的 call_id 返回明确错误', withServer(async (s) => {
  const r = await s.post('/api/ai/analyze', { call_id: 'not_exist', summary: 'x' });
  assert.strictEqual(r.body.ok, false);
  assert.ok(r.body.err, '应返回错误说明');
}));

test('AI 回写 · 分析指令模板生成（含分类字典与转写稿）', withServer(async (s) => {
  const id = seedCall(s, 'ai4', { transcript: '[00:00:00 - 00:01:00] 客户说要加订一批货' });
  const r = await s.get(`/api/ai/prompt/${id}`);
  assert.strictEqual(r.body.ok, true);
  assert.ok(r.body.prompt.includes('客户说要加订一批货'), '提示词应包含转写稿');
  assert.ok(r.body.prompt.includes('分类字典'), '提示词应包含分类字典');
  assert.ok(r.body.chars > 500, '提示词内容过短');
  assert.ok(!r.body.prompt.includes('{{'), '模板占位符未全部替换');
}));

test('改判反哺 · 人工改分类后记录修正并可生成规则', withServer(async (s) => {
  const id = seedCall(s, 'ai5');
  await s.post('/api/ai/analyze', {
    call_id: id, summary: 's', categories: [{ category_id: '2.1', is_primary: true, confidence: 0.5, reason: 'r' }],
  });

  // 人工改判
  const c = await s.post('/api/ai/correct', {
    call_id: id, field: 'category', old_value: '2.1', new_value: '1.3', why: '实际是意向确认',
  });
  assert.strictEqual(c.body.ok, true, '改判未记录');

  // 修正后能落成一条自动归类规则
  const rule = await s.post('/api/ai/rule', {
    call_id: id, category_id: '1.3',
    pattern: '客户明确表示要下单', keywords: '下单',
  });
  assert.ok(rule.body.ok !== false || rule.body.err, '规则接口应返回明确结果');
}));

test('改判反哺 · 术语新增后重套历史稿件', withServer(async (s) => {
  const id = seedCall(s, 'ai6', {
    transcript: '[00:00:00 - 00:00:20] 我们下个月给你发一份新的样品',
  });

  const r = await s.post('/api/dict/term', { action: 'add', wrong: '样品', right: '试用装' });
  assert.strictEqual(r.body.ok, true);
  assert.ok(r.body.refixed >= 0, '应返回重套数量');

  // 术语生效后，历史稿件里的词应被替换
  const call = await s.get(`/api/calls/${id}`);
  assert.ok(call.body.call.transcript.includes('试用装'), '历史稿件未重套术语');
}));
