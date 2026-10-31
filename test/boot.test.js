// 冒烟测试 0：首次启动与基础健壮性
//
// 覆盖报告指出的核心阻断项：「clone 下来跑不起来」
//   - 零依赖启动
//   - 分类字典与设置项自动初始化
//   - owner 抽象可用
//   - 静态资源完整
const { test } = require('node:test');
const assert = require('node:assert');
const { withServer } = require('./helpers.js');

test('首次启动 · 零依赖即可启动（无 node_modules）', withServer(async (s) => {
  const r = await s.get('/api/stats');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
}));

test('首次启动 · 分类字典自动初始化', withServer(async (s) => {
  const d = await s.get('/api/dict');
  assert.strictEqual(d.body.ok, true);
  assert.ok(d.body.cats.length >= 30, `分类过少: ${d.body.cats.length}`);
  // 一级分类应包含通用销售场景
  const names = d.body.cats.map(c => c.name);
  for (const kw of ['需求', '报价', '合同', '售后']) {
    assert.ok(names.some(n => n.includes(kw)), `缺少分类关键词: ${kw}`);
  }
}));

test('首次启动 · 设置项已初始化', withServer(async (s) => {
  const r = await s.get('/api/settings');
  assert.strictEqual(r.body.ok, true);
  const st = r.body.settings;
  assert.ok('owner' in st, '缺少 owner');
  assert.ok('model' in st, '缺少 model');
  assert.ok('accessCode' in st, '缺少 accessCode');
  assert.strictEqual(st.model, 'small', '默认模型应为 small');
}));

test('首次启动 · owner 可改且立即生效', withServer(async (s) => {
  const before = await s.get('/api/settings');
  assert.strictEqual(before.body.settings.owner, '测试员', 'owner 应取自 VL_OWNER');

  await s.post('/api/settings', { k: 'owner', v: '改过的名字' });
  const after = await s.get('/api/settings');
  assert.strictEqual(after.body.settings.owner, '改过的名字', 'owner 改动未生效（缓存未失效？）');
}));

test('首次启动 · 敏感词规则已初始化且通用', withServer(async (s) => {
  const r = await s.get('/api/sens');
  assert.strictEqual(r.body.ok, true);
  assert.ok(r.body.list.length > 0, '敏感词未初始化');
  // 不应包含行业专属品类
  const words = r.body.list.map(w => w.word).join(' ');
  // 用不变量断言：敏感词表里不应出现任何具体品类词
  assert.ok(!/[\u4e00-\u9fa5]{2,}(?:型|器|机|件)/.test(words.replace(/故障|投诉|售后|质量|账期|回款|竞争/g, '')),
    '敏感词表疑似残留具体品类词');
}));

test('静态资源 · 前端全部可访问', withServer(async (s) => {
  const files = [
    '/', '/app.js', '/page-home.js', '/page-calls.js', '/page-call.js',
    '/page-todos.js', '/page-flags.js', '/page-dict.js', '/page-cust.js',
    '/blocks.js', '/follow.js', '/setup.js', '/share.js',
    '/style.css', '/pages.css', '/share.css', '/manual.html',
    '/vendor/echarts.min.js',
  ];
  for (const f of files) {
    const r = await s.get(f);
    assert.strictEqual(r.status, 200, `${f} 返回 ${r.status}`);
    assert.ok(r.body.raw && r.body.raw.length > 0, `${f} 内容为空`);
  }
}));

test('健壮性 · 不存在的接口返回 404 而非崩溃', withServer(async (s) => {
  const r = await s.get('/api/not_exist');
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.ok, false);
}));

test('健壮性 · 非法 JSON 不导致服务崩溃', withServer(async (s) => {
  const http = require('http');
  await new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port: s.port, path: '/api/todos', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', resolve);
    req.write('{bad json');
    req.end();
  });
  // 服务仍应存活
  const r = await s.get('/api/stats');
  assert.strictEqual(r.body.ok, true, '非法 JSON 后服务异常');
}));

test('健壮性 · 共享页 token 隔离', withServer(async (s) => {
  const r = await s.get('/api/share/not_a_real_token');
  assert.strictEqual(r.body.ok, false, '无效 token 不应返回数据');
}));
