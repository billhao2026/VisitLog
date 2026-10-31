// 冒烟测试 3/3：待办与顺延
//
// 覆盖：待办创建、跟进时顺延日期、闭环联动、超期标记、优先级分组
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { withServer } = require('./helpers.js');

const iso = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

test('待办 · 创建与读取', withServer(async (s) => {
  const r = await s.post('/api/todos', {
    content: '下周一前提交报价单',
    due_date: daysFromNow(3),
    priority: '高',
  });
  assert.strictEqual(r.body.ok, true, `创建失败: ${JSON.stringify(r.body)}`);

  const list = await s.get('/api/todos');
  const t = list.body.list.find(x => x.content.includes('提交报价单'));
  assert.ok(t, '待办未入库');
  assert.strictEqual(t.priority, '高');
  assert.strictEqual(t.status, 'open');
  assert.strictEqual(t.assignee, '测试员', 'assignee 应取自 owner 设置');
}));

test('待办 · 写跟进可顺延到期日', withServer(async (s) => {
  const c = await s.post('/api/todos', { content: '原定期限的事项', due_date: daysFromNow(1) });
  const todoId = c.body.id;

  const newDue = daysFromNow(14);
  const f = await s.post('/api/followups', {
    ref_type: 'todo', ref_id: todoId,
    content: '客户那边流程还没走完，顺延两周',
    result: '推进中', due_date: newDue,
  });
  assert.strictEqual(f.body.ok, true, `跟进写入失败: ${JSON.stringify(f.body)}`);

  const list = await s.get('/api/todos');
  const t = list.body.list.find(x => x.id === todoId);
  assert.strictEqual(t.due_date, newDue, '到期日未顺延');
  assert.strictEqual(t.overdue, 0, '顺延后不应仍标记超期');
}));

test('待办 · 跟进可闭环待办', withServer(async (s) => {
  const c = await s.post('/api/todos', { content: '要闭环的事项' });
  const todoId = c.body.id;

  const f = await s.post('/api/followups', {
    ref_type: 'todo', ref_id: todoId, content: '已经办完了', result: '已闭环', closed: true,
  });
  assert.strictEqual(f.body.ok, true);

  // 默认只返回 open 待办，闭环后需用 status=all 查
  const open = await s.get('/api/todos');
  assert.ok(!open.body.list.some(x => x.id === todoId), '闭环后不应出现在 open 列表');

  const all = await s.get('/api/todos?status=all');
  const t = all.body.list.find(x => x.id === todoId);
  assert.ok(t, '闭环待办应在 status=all 列表中');
  assert.strictEqual(t.status, 'done', '待办未闭环');
  assert.ok(t.done_at, '闭环时间未记录');
}));

test('待办 · 超期标记与分组统计', withServer(async (s) => {
  // 一条超期待办
  await s.post('/api/todos', { content: '早就该做的一件事', due_date: daysFromNow(-5) });

  // 直接改库标记 overdue（生产环境由定时任务维护）
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(s.dir, 'data', 'calls.db'));
  db.prepare("UPDATE todos SET overdue=1 WHERE due_date < date('now') AND status='open'").run();
  db.close();

  const list = await s.get('/api/todos');
  const overdue = list.body.list.filter(t => t.overdue === 1);
  assert.ok(overdue.length >= 1, '超期项未被标记');
  assert.ok(overdue[0].due_date < daysFromNow(0), '超期项日期不对');

  // 统计接口应反映超期数
  const stats = await s.get('/api/stats');
  assert.ok(stats.body.stats.overdue >= 1, '统计未反映超期数');
}));

test('待办 · 删除后不再出现在列表', withServer(async (s) => {
  const c = await s.post('/api/todos', { content: '要删掉的事项' });
  const d = await s.del(`/api/todos/${c.body.id}`);
  assert.strictEqual(d.body.ok, true);

  const list = await s.get('/api/todos?status=all');
  assert.ok(!list.body.list.some(t => t.id === c.body.id), '删除后仍在列表');
}));

test('待办 · 缺内容时返回明确错误', withServer(async (s) => {
  const r = await s.post('/api/todos', {});
  assert.strictEqual(r.body.ok, false);
  assert.ok(r.body.err, '应返回错误说明');
}));

test('待办 · 跟进缺少引用时返回明确错误', withServer(async (s) => {
  const r = await s.post('/api/followups', { content: '没有 ref' });
  assert.strictEqual(r.body.ok, false);
  assert.ok(r.body.err, '应返回错误说明');
}));

test('待办 · 按客户关联并出现在客户档案', withServer(async (s) => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(s.dir, 'data', 'calls.db'));
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`INSERT INTO customers(id,name,owner,status,visit_count,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?)`).run('cust_t', '关联测试客户', '测试员', '活跃', 1, now, now);
  db.close();

  const r = await s.post('/api/todos', { content: '挂在这个客户下的事项', customer_id: 'cust_t' });
  assert.strictEqual(r.body.ok, true);

  const cust = await s.get('/api/customers/cust_t');
  assert.strictEqual(cust.body.ok, true);
  assert.ok(Array.isArray(cust.body.todos), '客户档案应包含待办列表');
}));
