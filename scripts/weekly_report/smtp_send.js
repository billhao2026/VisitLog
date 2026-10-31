#!/usr/bin/env node
// 零依赖 SMTPS 发送器（替代丢失的 connector smtp.bundle.js）
// CLI 兼容：send --to <addr> --subject <s> --body <html> --attach <file>
// 凭证从 env 读取：NETEASE_EMAIL_USER / NETEASE_EMAIL_PASS（由 run.js 解密注入）
// 用法：node smtp_send.js send --to x@y.z --subject 标题 --body <html> --attach 附件路径
const tls = require('tls');
const fs = require('fs');
const path = require('path');

// ── 解析 CLI 参数 ──
const args = process.argv.slice(2);
if (args[0] !== 'send') { console.error('用法: smtp_send.js send --to <addr> [--cc <addr>] --subject <s> --body <html> [--attach <file>]'); process.exit(2); }
const opt = {};
for (let i = 1; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const TO = opt.to, SUBJECT = opt.subject || '(no subject)', BODY = opt.body || '';
const ATTACH = opt.attach ? path.resolve(opt.attach) : null;
const USER = process.env.NETEASE_EMAIL_USER, PASS = process.env.NETEASE_EMAIL_PASS;
if (!TO || !USER || !PASS) { console.error('缺少参数或邮箱凭证（NETEASE_EMAIL_USER/PASS）'); process.exit(2); }

// ── MIME 构建 ──
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const qp = s => Buffer.from(s, 'utf8').toString('quoted-printable').replace(/=([^\r\n]*)\r?\n/g, (m, t) => '=' + t); // 简化，下方直接用 base64 正文更稳
const HDR = () => '----WeeklyReport_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
const B = HDR(), A1 = HDR(), A2 = HDR();

let mime = '';
mime += `From: =?UTF-8?B?${b64('Bill 拜访志')}?= <${USER}>\r\n`;
mime += `To: <${TO}>\r\n`;
mime += `Subject: =?UTF-8?B?${b64(SUBJECT)}?=\r\n`;
mime += `Date: ${new Date().toUTCString()}\r\n`;
mime += `MIME-Version: 1.0\r\n`;
mime += `Content-Type: multipart/mixed;\r\n\tboundary="${B}"\r\n\r\n`;

// 正文（HTML，base64 编码防中文乱码）
mime += `--${B}\r\nContent-Type: multipart/alternative;\r\n\tboundary="${A1}"\r\n\r\n`;
mime += `--${A1}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
const plain = BODY.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
mime += b64(plain).replace(/(.{76})/g, '$1\r\n') + '\r\n';
mime += `--${A1}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
mime += b64(BODY).replace(/(.{76})/g, '$1\r\n') + '\r\n';
mime += `--${A1}--\r\n\r\n`;

// 附件（base64，按扩展名判定 MIME）
const ATTACH_MIME = {
  '.html': 'text/html', '.htm': 'text/html',
  '.zip': 'application/zip', '.pdf': 'application/pdf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
if (ATTACH && fs.existsSync(ATTACH)) {
  const fname = path.basename(ATTACH);
  const content = fs.readFileSync(ATTACH);
  const ctype = ATTACH_MIME[path.extname(fname).toLowerCase()] || 'application/octet-stream';
  mime += `--${B}\r\nContent-Type: ${ctype}; name="=?UTF-8?B?${b64(fname)}?="\r\n`;
  mime += `Content-Disposition: attachment; filename="=?UTF-8?B?${b64(fname)}?="\r\n`;
  mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
  mime += content.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n';
  mime += `--${B}--\r\n`;
} else {
  mime = mime.replace(new RegExp('--' + A1 + '--\\r\\n\\r\\n(?:[\\s\\S]*)$'), `--${A1}--\r\n--${B}--\r\n`);
}

// ── SMTPS 会话（163 端口 465，隐式 TLS）──
const CRLF = '\r\n';
const socket = tls.connect({ host: 'smtp.163.com', port: 465, rejectUnauthorized: false }, () => {});
socket.setEncoding('utf8');
socket.setTimeout(60_000);

let stage = 'connect', buf = '';
const reply = code => { // code: 期望的 SMTP 状态码
  return new Promise((resolve, reject) => {
    const onLine = () => {
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3}[ -]/.test(last)) return;          // 等完整行
      const m = last.match(/^(\d{3})([ -])/);
      if (!m) return reject(new Error('SMTP 异常回复: ' + last));
      if (m[1] === code && m[2] === ' ') {           // "250 " = 最终行
        const all = lines.join('\r\n');
        buf = '';
        socket.removeListener('data', onData);
        resolve(all);
      } else if (m[2] === '-') { buf += ''; }        // 多行继续
    };
    const onData = d => { buf += d; onLine(); };
    socket.on('data', onData);
    socket.on('error', reject);
  });
};

(async () => {
  try {
    // 1. 服务器问候
    await new Promise((res, rej) => { socket.once('data', d => { buf += d; res(); }); socket.once('error', rej); });
    if (!buf.startsWith('220')) throw new Error('SMTP 问候失败: ' + buf);
    buf = '';

    const send = async (cmd, expect) => {
      socket.write(cmd + CRLF);
      const r = await reply(expect);
      if (!r.startsWith(expect)) throw new Error(`SMTP ${cmd.split(' ')[0]} 失败: ${r}`);
      return r;
    };

    await send('EHLO weeklyreport', '250');
    await send('AUTH LOGIN', '334');
    await send(b64(USER), '334');
    await send(b64(PASS), '235');
    await send(`MAIL FROM:<${USER}>`, '250');
    await send(`RCPT TO:<${TO}>`, '250');
    await send('DATA', '354');
    // 点填充：正文行首的点需转义
    const payload = mime.replace(/(^|\r\n)\./g, '$1..');
    socket.write(payload + CRLF + '.' + CRLF);
    const r = await reply('250');
    socket.write('QUIT' + CRLF);
    console.log('250 Mail OK');
    socket.end();
    process.exit(0);
  } catch (e) {
    console.error('SMTP_SEND_FAILED:', e.message);
    try { socket.destroy(); } catch (_) {}
    process.exit(1);
  }
})();
