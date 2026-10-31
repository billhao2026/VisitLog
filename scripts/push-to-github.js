#!/usr/bin/env node
// 拜访志 VisitLog · 一键推送到 GitHub
//
// 用法：
//   node scripts/push-to-github.js <你的GitHub用户名> [你的邮箱]
//
// 流程：
//   1. 替换文档里的用户名占位符
//   2. 检查 git 状态与提交历史
//   3. 用 GitHub API 检查仓库是否已存在（存在则跳过建仓）
//   4. 设置 remote
//   5. 推送
//
// 认证方式（按顺序尝试）：
//   a. 环境变量 GITHUB_TOKEN
//   b. gh CLI 已登录（gh auth status）
//   c. SSH key（ssh -T git@github.com）
//
// 用法示例：
//   GITHUB_TOKEN=ghp_xxx node scripts/push-to-github.js testuser
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const username = process.argv[2];
const email = process.argv[3];
const REPO = 'visitlog';

if (!username) {
  console.error('用法: node scripts/push-to-github.js <你的GitHub用户名> [你的邮箱]');
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
function runTry(cmd, args) {
  try { return { ok: true, out: run(cmd, args) }; }
  catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
}

// ── 1. 替换占位符 ──────────────────────────────
console.log('[1/5] 替换文档占位符…');
const ownerScript = path.join(ROOT, 'scripts', 'set-repo-owner.js');
run(process.execPath, [ownerScript, username, email].filter(Boolean));
console.log('      ✅ 完成');

// ── 2. 检查 git 状态 ───────────────────────────
console.log('[2/5] 检查 git 状态…');
const dirty = run('git', ['status', '--porcelain']).trim();
if (dirty) {
  console.log('      检测到未提交改动，自动提交…');
  run('git', ['add', '-A']);
  run('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m',
    'chore: 更新仓库地址占位符为实际用户名']);
  console.log('      ✅ 已提交');
} else {
  console.log('      ✅ 工作区干净');
}

// ── 3. 认证检测 ─────────────────────────────────
console.log('[3/5] 检测认证方式…');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
let authMode = '';

if (token) {
  authMode = 'token';
  console.log('      ✅ 使用环境变量 Token');
} else {
  const gh = runTry('gh', ['auth', 'status']);
  if (gh.ok) {
    authMode = 'gh';
    console.log('      ✅ 使用 gh CLI 已登录凭据');
  } else {
    const ssh = runTry('ssh', ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', '-T', 'git@github.com']);
    if (ssh.ok && /successfully authenticated/i.test(ssh.out)) {
      authMode = 'ssh';
      console.log('      ✅ 使用 SSH 密钥');
    }
  }
}

if (!authMode) {
  console.log('');
  console.log('  ⚠️  没有可用的 GitHub 认证，三选一：');
  console.log('');
  console.log('  A. 装 gh CLI（推荐，一条命令登录）');
  console.log('     brew install gh && gh auth login');
  console.log('     登录后重跑本脚本');
  console.log('');
  console.log('  B. 用 Token（Personal Access Token，勾选 repo 权限）');
  console.log('     GITHUB_TOKEN=ghp_xxx node scripts/push-to-github.js ' + username);
  console.log('');
  console.log('  C. 用 SSH 密钥');
  console.log('     生成: ssh-keygen -t ed25519 -C "你的邮箱"');
  console.log('     复制 ~/.ssh/id_ed25519.pub 内容到 GitHub → Settings → SSH keys');
  console.log('     然后重跑本脚本');
  console.log('');
  process.exit(2);
}

// ── 4. 建仓（如果不存在）─────────────────────────
console.log('[4/5] 检查远程仓库…');
const httpsUrl = `https://github.com/${username}/${REPO}.git`;
const sshUrl = `git@github.com:${username}/${REPO}.git`;
let repoExists = false;

if (authMode === 'token') {
  const r = runTry('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}',
    '-H', `Authorization: token ${token}`,
    `https://api.github.com/repos/${username}/${REPO}`]);
  repoExists = r.out.trim() === '200';
  if (!repoExists) {
    console.log('      仓库不存在，正在创建…');
    const c = runTry('curl', ['-s', '-X', 'POST',
      '-H', `Authorization: token ${token}`,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({
        name: REPO, private: false,
        description: '拜访志 VisitLog — 客户通话记录平台：上传录音 → 本地转写 → AI 拆解归类 → 待办与重点沉淀',
        homepage: `https://github.com/${username}/${REPO}`,
      }),
      `https://api.github.com/user/repos`]);
    if (c.out.includes('"id"')) {
      console.log('      ✅ 创建成功');
    } else {
      console.log('      ⚠️ 创建失败:', c.out.slice(0, 300));
    }
  }
} else if (authMode === 'gh') {
  const v = runTry('gh', ['repo', 'view', `${username}/${REPO}`]);
  repoExists = v.ok;
  if (!repoExists) {
    console.log('      仓库不存在，正在创建…');
    const c = runTry('gh', ['repo', 'create', `${username}/${REPO}`,
      '--public', '--description',
      '拜访志 VisitLog — 客户通话记录平台：上传录音 → 本地转写 → AI 拆解归类 → 待办与重点沉淀',
      '--source', '.', '--remote', 'origin', '--push']);
    if (c.ok) {
      console.log('      ✅ 创建并推送成功');
      console.log('');
      console.log('  完成！仓库地址: https://github.com/' + username + '/' + REPO);
      process.exit(0);
    }
    console.log('      ⚠️ 创建失败:', c.out.slice(0, 300));
  }
}

if (repoExists) console.log('      ✅ 仓库已存在');
else console.log('      ⚠️ 未能确认仓库状态，可能需要你手动创建');

// ── 5. 设置 remote 并推送 ───────────────────────
console.log('[5/5] 设置 remote 并推送…');
const existing = runTry('git', ['remote']);
if (existing.out.includes('origin')) {
  run('git', ['remote', 'set-url', 'origin', authMode === 'ssh' ? sshUrl : httpsUrl]);
  console.log('      已更新 origin');
} else {
  run('git', ['remote', 'add', 'origin', authMode === 'ssh' ? sshUrl : httpsUrl]);
  console.log('      已添加 origin');
}
console.log(`      remote: ${authMode === 'ssh' ? sshUrl : httpsUrl}`);

const push = runTry('git', ['push', '-u', 'origin', 'main']);
if (push.ok) {
  console.log('      ✅ 推送成功');
  console.log('');
  console.log('  完成！');
  console.log('  仓库地址: https://github.com/' + username + '/' + REPO);
  console.log('');
  console.log('  建议接着做：');
  console.log('   1. 给仓库加个 Description 和 Topics（crm, whisper, asr, sales, local-first）');
  console.log('   2. 在 README 首屏加一张截图');
  console.log('   3. 开 Discussions');
} else {
  console.log('      ❌ 推送失败:');
  console.log(push.out.split('\n').slice(0, 12).map(l => '        ' + l).join('\n'));
  console.log('');
  console.log('  手动重试:');
  console.log(`    cd "${ROOT}" && git push -u origin main`);
  process.exit(1);
}
