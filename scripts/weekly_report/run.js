// 拜访志周报 · 一键运行：采集数据 → 生成 HTML → SMTP 发送
//
// 凭证从环境变量读取（不硬编码、不落库）：
//   VL_SMTP_HOST      SMTP 服务器地址，如 smtp.163.com
//   VL_SMTP_PORT      端口，默认 465（SSL）
//   VL_SMTP_USER      发件邮箱地址
//   VL_SMTP_PASS      发件邮箱授权码（不是登录密码）
//   VL_SMTP_TO        收件人地址，默认与 VL_SMTP_USER 相同
//   VL_SMTP_SECURE    1=SSL(465，默认)  0=明文(25/587)
//
// 用法：
//   node scripts/weekly_report/run.js
//   VL_SMTP_HOST=smtp.163.com VL_SMTP_USER=me@example.com VL_SMTP_PASS=xxxx node scripts/weekly_report/run.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');

const NODE = process.execPath;
const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');

const ENV = {
  host: process.env.VL_SMTP_HOST || '',
  port: Number(process.env.VL_SMTP_PORT || 465),
  user: process.env.VL_SMTP_USER || '',
  pass: process.env.VL_SMTP_PASS || '',
  to: process.env.VL_SMTP_TO || process.env.VL_SMTP_USER || '',
  secure: process.env.VL_SMTP_SECURE === undefined ? true : process.env.VL_SMTP_SECURE !== '0',
};

// base64 按 76 字符折行（SMTP 单行长度上限 1000 字符）
function b64(buf) {
  const s = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf, 'utf8').toString('base64');
  return s.match(/.{1,76}/g).join('\r\n');
}

function main() {
  const tmp = path.join(ROOT, 'data', 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  // 1. 服务探测（未启动不阻断，数据直读 SQLite）
  let up = false;
  try {
    const code = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:8897/'], { encoding: 'utf8' }).trim();
    up = code === '200';
  } catch (e) { /* curl 缺失或失败视为未启动 */ }
  if (!up) {
    console.log(JSON.stringify({ ok: false, warn: '8897 服务未启动，数据走 SQLite 直读不受影响' }));
  }

  // 2. 采集数据（直读 SQLite，不依赖服务）
  const dataFile = path.join(tmp, 'week_data.json');
  execFileSync(NODE, [path.join(HERE, 'collect_data.js')], { stdio: ['ignore', fs.openSync(dataFile, 'w'), 'inherit'] });

  // 3. 生成 HTML 报告
  const D = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const stamp = D.weekEndDay || D.weekEnd.slice(0, 10);
  const reportDir = path.join(ROOT, '报告');
  fs.mkdirSync(reportDir, { recursive: true });
  const localPath = path.join(reportDir, `周报_${stamp}.html`);
  execFileSync(NODE, [path.join(HERE, 'build_html.js'), dataFile], { stdio: ['ignore', fs.openSync(localPath, 'w'), 'inherit'] });

  // 4. 发送邮件（未配置 SMTP 时跳过，不阻断报告生成）
  if (!ENV.host || !ENV.user || !ENV.pass) {
    console.log(JSON.stringify({
      ok: true, report: localPath, mailed: false,
      warn: '未配置 SMTP（VL_SMTP_HOST / VL_SMTP_USER / VL_SMTP_PASS），已生成报告但未发送',
      weekStart: D.weekStart, weekEnd: D.weekEnd,
      weekStartDay: D.weekStartDay, weekEndDay: D.weekEndDay, stats: D.stats,
    }));
    return;
  }

  const subject = `拜访志周报 ${D.weekStartDay.slice(5)}~${D.weekEndDay.slice(5)}`
    + `（${D.stats.callCount}通/${D.stats.callCustomers}客户/${(D.stats.totalSec / 3600).toFixed(1)}h）`;
  const bodyHtml = `<div style="font-family:'Microsoft YaHei',sans-serif;">`
    + `<p>本周拜访志周报见附件 HTML（可直接用浏览器打开，含下周重点/数据总览/深度剖析/遗留问题/特色概览）。</p>`
    + `<p>速览：通话 ${D.stats.callCount} 通 / ${D.stats.callCustomers} 位客户 / `
    + `${Math.round(D.stats.totalSec / 3600 * 10) / 10} 小时；跟进 ${D.stats.fuCount} 条、闭环 ${D.stats.fuClosed} 项；`
    + `待办新 ${D.stats.todosNew} / 完 ${D.stats.todosDone}，超期 ${D.stats.overdue}。</p></div>`;

  sendMail({ subject, bodyHtml, attachment: localPath })
    .then(() => {
      console.log(JSON.stringify({
        ok: true, report: localPath, mailed: true, to: ENV.to,
        weekStart: D.weekStart, weekEnd: D.weekEnd,
        weekStartDay: D.weekStartDay, weekEndDay: D.weekEndDay, stats: D.stats,
      }));
    })
    .catch((e) => {
      console.error('邮件发送失败：' + e.message);
      console.log(JSON.stringify({ ok: true, report: localPath, mailed: false, err: e.message }));
      process.exitCode = 1;
    });
}

// ── 极简 SMTP 客户端（零外部依赖）────────────────────────────────
function buildMessage({ subject, bodyHtml, attachment }) {
  const boundary = 'VL' + Date.now().toString(16);
  const parts = [];
  parts.push(
    `From: ${ENV.user}`,
    `To: ${ENV.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(bodyHtml),
  );
  if (attachment && fs.existsSync(attachment)) {
    const fname = path.basename(attachment);
    parts.push(
      `--${boundary}`,
      `Content-Type: application/octet-stream; name="${fname}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fname}"`,
      '',
      b64(fs.readFileSync(attachment)),
    );
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

function sendMail(opts) {
  return new Promise((resolve, reject) => {
    const socket = ENV.secure
      ? tls.connect({ host: ENV.host, port: ENV.port, servername: ENV.host })
      : net.connect({ host: ENV.host, port: ENV.port });

    const message = buildMessage(opts);
    let step = 0;
    let timer = null;
    let done = false;

    const finish = (err) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { socket.end(); } catch (e) { /* ignore */ }
      if (err) reject(err); else resolve();
    };
    timer = setTimeout(() => finish(new Error('SMTP 超时（20s）')), 20000);

    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      // SMTP 响应：续行以 "250-" 开头，末行以 "250 " 开头
      const m = buffer.match(/^(?:\d{3}-[^\r\n]*\r\n)*\d{3} [^\r\n]*\r\n/);
      if (!m) return;
      buffer = buffer.slice(m[0].length);
      const code = parseInt(m[0].slice(0, 3), 10);
      if (code >= 400) return finish(new Error(`SMTP 返回 ${code}: ${m[0].trim()}`));

      switch (step) {
        case 0: step = 1; socket.write('EHLO localhost\r\n'); break;
        case 1: step = 2; socket.write('AUTH LOGIN\r\n'); break;
        case 2:
          step = 3;
          socket.write(Buffer.from(ENV.user, 'utf8').toString('base64') + '\r\n');
          break;
        case 3:
          step = 4;
          socket.write(Buffer.from(ENV.pass, 'utf8').toString('base64') + '\r\n');
          break;
        case 4: step = 5; socket.write(`MAIL FROM:<${ENV.user}>\r\n`); break;
        case 5: step = 6; socket.write(`RCPT TO:<${ENV.to}>\r\n`); break;
        case 6: step = 7; socket.write('DATA\r\n'); break;
        case 7: step = 8; socket.write(message + '\r\n.\r\n'); break;   // 结束符 "."
        case 8: step = 9; socket.write('QUIT\r\n'); break;
        case 9: return finish();
        default: return finish(new Error('SMTP 状态异常'));
      }
    });
    socket.on('error', (e) => finish(e));
    socket.on('close', () => { if (!done) finish(new Error('SMTP 连接提前关闭')); });
  });
}

try { main(); } catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
