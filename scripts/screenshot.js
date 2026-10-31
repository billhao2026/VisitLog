#!/usr/bin/env node
// 拜访志 · 界面截图工具（真实 Safari via safaridriver）
//
// 为什么不用 headless WebKit：macOS 的 offscreen WKWebView 不走 GPU 合成路径，
// canvas 的矩形图元（ECharts 柱状图）会静默丢失 —— 只剩坐标轴和网格线。
// 真实 Safari 没有这个问题。
//
// 前置条件：
//   1. Safari → 开发 → 勾选「允许远程自动化」
//   2. 首次运行需授权：「safaridriver --enable」（会要求输入系统密码）
//
// 用法：
//   node scripts/screenshot.js <URL> <输出PNG> [宽] [高] [等待毫秒]
//   node scripts/screenshot.js http://localhost:8897/ /tmp/home.png
//
// 批量截图某个应用的多个页面：
//   node scripts/screenshot.js http://localhost:8897/ out.png 1440 900
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_ = process.argv[2] || 'http://localhost:8897/';
const OUT = process.argv[3] || '/tmp/visitlog-shot.png';
const W = parseInt(process.argv[4] || '1440', 10);
const H = parseInt(process.argv[5] || '900', 10);
const WAIT = parseInt(process.argv[6] || '2500', 10);
const PORT = 4444;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function httpJSON(method, path, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return { raw: text, status: res.status }; }
}

(async () => {
  // 启动 safaridriver
  const driver = spawn('safaridriver', ['-p', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let driverErr = '';
  driver.stderr.on('data', d => { driverErr += d.toString(); });
  driver.stdout.on('data', () => {});

  const cleanup = () => { try { driver.kill('SIGTERM'); } catch (e) {} };
  process.on('exit', cleanup);

  // 等 driver 就绪
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/status`);
      if (r.ok) { ready = true; break; }
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  if (!ready) {
    console.error('safaridriver 启动失败。');
    console.error('请先执行：safaridriver --enable（需输入系统密码）');
    if (driverErr) console.error(driverErr.slice(0, 400));
    process.exit(1);
  }

  // 建会话
  const sess = await httpJSON('POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'safari' } },
  });
  if (!sess.value || !sess.value.sessionId) {
    console.error('创建 Safari 会话失败:', JSON.stringify(sess).slice(0, 400));
    console.error('请确认：Safari → 开发 → 允许远程自动化');
    process.exit(1);
  }
  const sid = sess.value.sessionId;
  console.log('✅ Safari 会话已建立');

  try {
    // 设窗口尺寸
    await httpJSON('POST', `/session/${sid}/window/rect`, { width: W, height: H });

    // 打开页面
    await httpJSON('POST', `/session/${sid}/url`, { url: URL_ });
    await sleep(WAIT);

    // 截图（整个视口）
    const shot = await httpJSON('GET', `/session/${sid}/screenshot`);
    if (!shot.value) {
      console.error('截图失败:', JSON.stringify(shot).slice(0, 300));
      process.exit(1);
    }
    const buf = Buffer.from(shot.value, 'base64');
    fs.writeFileSync(OUT, buf);
    console.log(`✅ 已保存 ${OUT} (${W}×${H}, ${(buf.length / 1024).toFixed(0)}KB)`);
  } finally {
    await httpJSON('DELETE', `/session/${sid}`);
    cleanup();
  }
})().catch(e => {
  console.error('出错:', e.message);
  process.exit(1);
});
