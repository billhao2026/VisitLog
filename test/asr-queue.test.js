// 冒烟测试 1/3：转写队列
//
// 覆盖：上传去重、队列状态流转、音频缺失时的降级、卡住任务重跑
// 不依赖真实模型与 Python 环境（CI 里没有 faster-whisper）
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { withServer } = require('./helpers.js');

// 造一个最小可用的音频文件（内容随意，测试不真正解码）
function makeAudio(dir, name) {
  const raw = path.join(dir, 'data', 'tmp');
  fs.mkdirSync(raw, { recursive: true });
  const p = path.join(raw, name);
  fs.writeFileSync(p, Buffer.alloc(2048, 7));   // 2KB 假音频
  return p;
}

// 用 multipart/form-data 上传（系统自带原生解析器，不依赖 multer）
function upload(s, filePath, fields = {}) {
  const fs2 = require('fs');
  const boundary = '----vlTest' + Date.now().toString(16);
  const stat = fs2.statSync(filePath);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${path.basename(filePath)}"\r\n` +
    'Content-Type: audio/mp4\r\n\r\n', 'utf8'));
  parts.push(fs2.readFileSync(filePath));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

  const body = Buffer.concat(parts);
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.request({
      host: '127.0.0.1', port: s.port, path: '/api/upload', method: 'POST',
      timeout: 20000,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let b = '';
      res.on('data', d => (b += d));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(b); } catch (e) { j = { raw: b }; }
        resolve({ status: res.statusCode, body: j });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('上传超时')); });
    req.write(body);
    req.end();
  });
}

test('转写队列 · 上传成功并进入队列', withServer(async (s) => {
  const f = makeAudio(s.dir, 'a1.m4a');
  const r = await upload(s, f, { title: '队列测试录音' });
  assert.strictEqual(r.body.ok, true, `上传失败: ${JSON.stringify(r.body)}`);
  assert.ok(r.body.id, '未返回通话 id');

  // 通话已入库
  const calls = await s.get('/api/calls?limit=10');
  const call = calls.body.list.find(c => c.id === r.body.id);
  assert.ok(call, '通话未入库');
  assert.ok(['pending', 'transcribing', 'error', 'done'].includes(call.transcribe_status),
    `异常状态: ${call.transcribe_status}`);

  // 队列接口可用
  const q = await s.get('/api/queue');
  assert.strictEqual(q.body.ok, true);
  assert.ok(Array.isArray(q.body.transcribing));
}));

test('转写队列 · 相同文件重复上传被拒绝', withServer(async (s) => {
  const f = makeAudio(s.dir, 'dup.m4a');
  const first = await upload(s, f, { title: '第一次' });
  assert.strictEqual(first.body.ok, true, `首次上传失败: ${JSON.stringify(first.body)}`);

  const second = await upload(s, f, { title: '第二次' });
  assert.strictEqual(second.body.ok, false, '重复上传应被拒绝');
  assert.strictEqual(second.body.duplicate, true, '应标记为重复');
  assert.ok(second.body.err, '应给出错误说明');
}));

test('转写队列 · 不同文件可分别入库', withServer(async (s) => {
  const f1 = makeAudio(s.dir, 'x1.m4a');
  fs.writeFileSync(f1, Buffer.alloc(2048, 1));
  const f2 = makeAudio(s.dir, 'x2.m4a');
  fs.writeFileSync(f2, Buffer.alloc(2048, 2));

  const a = await upload(s, f1, { title: '文件一' });
  const b = await upload(s, f2, { title: '文件二' });
  assert.strictEqual(a.body.ok, true);
  assert.strictEqual(b.body.ok, true);
  assert.notStrictEqual(a.body.id, b.body.id, '两次上传应是不同记录');
}));

test('转写队列 · 缺音频文件时标记为失败而非永久卡住', withServer(async (s) => {
  // 直接往库里塞一条指向不存在音频的记录
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(s.dir, 'data', 'calls.db'));
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`INSERT INTO calls(id,title,audio_path,audio_name,audio_sha1,audio_size,visit_type,visited_at,
              transcribe_status,analyze_status,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('missing_audio', '音频缺失', 'audio/raw/does_not_exist.m4a', 'x.m4a',
         'sha_missing_audio', 10, '电话', now, 'pending', 'pending', now, now);
  db.close();

  // 触发重跑：让服务重新处理这条（参数名是 call_id）
  await s.post('/api/ai/retry', { call_id: 'missing_audio' });

  const deadline = Date.now() + 15000;
  let status = 'pending';
  while (Date.now() < deadline) {
    const r = await s.get('/api/calls?limit=50');
    const call = (r.body.list || []).find(c => c.id === 'missing_audio');
    if (call) { status = call.transcribe_status; if (status !== 'pending') break; }
    await new Promise(r => setTimeout(r, 400));
  }
  assert.notStrictEqual(status, 'pending', '缺失音频不应永远停在 pending');
  assert.ok(['error', 'done'].includes(status), `期望 error/done，实际 ${status}`);
}));

test('转写队列 · 上传不返回音频路径等内部信息', withServer(async (s) => {
  const f = makeAudio(s.dir, 'priv.m4a');
  const r = await upload(s, f, { title: '隐私检查' });
  assert.strictEqual(r.body.ok, true);
  // 响应里不应出现磁盘绝对路径
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(s.dir), '响应不应包含服务器绝对路径');
}));
