// 拜访志周报 · 一键运行：采集数据 → 生成 HTML → 复制到 Documents → SMTP 发送到 163 邮箱
// 凭证：运行时从 WorkBuddy 连接器加密存储实时解密（不留明文文件）
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NODE = process.execPath;
const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');
// macOS 适配：凭证目录按 HOME/USERPROFILE 自动定位（Windows 与 macOS 通用）
const WB_HOME = process.env.WORKBUDDY_HOME
  || path.join(process.env.HOME || process.env.USERPROFILE || '', '.workbuddy');
const CRED_DIR = path.join(WB_HOME, 'connectors', 'f0872237-1a21-4c48-b716-12f28e123927');
const SMTP = path.join(WB_HOME, 'connectors', 'skills', 'connector-netease-mail', 'scripts', 'smtp.bundle.js');
const DOCS = path.join(process.env.HOME || '', 'Documents');   // 连接器附件白名单目录
const TO = '82665258@163.com';

function decryptEnv() {
  const masterKey = fs.readFileSync(path.join(CRED_DIR, '.master.key'));
  const state = JSON.parse(fs.readFileSync(path.join(CRED_DIR, 'connector-states.json'), 'utf8'));
  const userId = state.accountIdentityKey.split('||')[0];
  const salt = Buffer.from(state.encryption.salt, 'base64');
  const info = Buffer.from('workbuddy-oauth-credentials-v1', 'utf8');
  const ikm = Buffer.concat([masterKey, Buffer.from(userId, 'utf8')]);
  const aesKey = crypto.hkdfSync('sha256', ikm, salt, info, 32);
  const aad = (c, f) => `${userId}|connector-states:envOverrides:${c}|${f}`;
  const dec = (c, f, enc) => {
    const d = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(enc.iv, 'base64'));
    d.setAAD(Buffer.from(aad(c, f), 'utf8'));
    d.setAuthTag(Buffer.from(enc.tag, 'base64'));
    return d.update(Buffer.from(enc.ct, 'base64'), null, 'utf8') + d.final('utf8');
  };
  const env = state.envOverrides['netease-mail'];
  return { NETEASE_EMAIL_USER: dec('netease-mail', 'NETEASE_EMAIL_USER', env.NETEASE_EMAIL_USER),
           NETEASE_EMAIL_PASS: dec('netease-mail', 'NETEASE_EMAIL_PASS', env.NETEASE_EMAIL_PASS) };
}

function main() {
  const tmp = path.join(ROOT, 'data', 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  // 1. 服务探测
  let up = false;
  try {
    const code = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:8897/'], { encoding: 'utf8' }).trim();
    up = code === '200';
  } catch (e) { /* curl 失败视为未启动 */ }
  if (!up) {
    console.log(JSON.stringify({ ok: false, err: '8897 服务未启动，跳过本周周报（数据走 SQLite 直读不受影响，但建议确认服务状态）' }));
    // 服务未启动不阻断：数据直接读 SQLite，仍可出报告
  }

  // 2. 采集数据（直读 SQLite，不依赖服务）
  const dataFile = path.join(tmp, 'week_data.json');
  execFileSync(NODE, [path.join(HERE, 'collect_data.js')], { stdio: ['ignore', fs.openSync(dataFile, 'w'), 'inherit'] });

  // 3. 生成 HTML
  const D = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const stamp = D.weekEndDay || D.weekEnd.slice(0, 10);        // 用周期结束日命名
  const reportDir = path.join(ROOT, '报告');
  fs.mkdirSync(reportDir, { recursive: true });
  const localPath = path.join(reportDir, `周报_${stamp}.html`);
  execFileSync(NODE, [path.join(HERE, 'build_html.js'), dataFile], { stdio: ['ignore', fs.openSync(localPath, 'w'), 'inherit'] });

  // 4. 复制到 Documents（附件白名单）并发送
  const mailCopy = path.join(DOCS, `拜访志周报_${stamp}.html`);
  fs.copyFileSync(localPath, mailCopy);
  const cred = decryptEnv();
  const env = { ...process.env, ...cred };
  const subject = `📋 拜访志周报 ${D.weekStartDay.slice(5)}~${D.weekEndDay.slice(5)}（${D.stats.callCount}通/${D.stats.callCustomers}客户/${(D.stats.totalSec / 3600).toFixed(1)}h）`;
  const out = execFileSync(NODE, [SMTP, 'send', '--to', TO, '--subject', subject,
    '--body', `<div style="font-family:'Microsoft YaHei',sans-serif;"><p>Bill，本周拜访志周报见附件 HTML（可直接用浏览器打开，含下周重点/数据总览/深度剖析/遗留问题/特色概览）。</p><p>速览：通话 ${D.stats.callCount} 通 / ${D.stats.callCustomers} 位客户 / ${Math.round(D.stats.totalSec / 3600 * 10) / 10} 小时；跟进 ${D.stats.fuCount} 条、闭环 ${D.stats.fuClosed} 项；待办新 ${D.stats.todosNew} / 完 ${D.stats.todosDone}，超期 ${D.stats.overdue}。</p></div>`,
    '--attach', mailCopy], { env, encoding: 'utf8' });
  console.log(out.trim());
  fs.unlinkSync(mailCopy);   // 发完清理 Documents 副本
  console.log(JSON.stringify({ ok: true, report: localPath, weekStart: D.weekStart, weekEnd: D.weekEnd, weekStartDay: D.weekStartDay, weekEndDay: D.weekEndDay, stats: D.stats }));
}

try { main(); } catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
