#!/usr/bin/env node
// 探测 GitHub Token 对某个仓库的实际写权限
//
// 用法：
//   node scripts/check-token-permission.js <用户名> <仓库名> [TOKEN]
//
// 不传 TOKEN 时依次尝试：环境变量 GITHUB_TOKEN / GH_TOKEN
// 退出码：0=有写权限，1=没有
const https = require('https');

const user = process.argv[2];
const repo = process.argv[3];
const token = process.argv[4] || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!user || !repo) {
  console.error('用法: node scripts/check-token-permission.js <用户名> <仓库名> [TOKEN]');
  process.exit(1);
}
if (!token) {
  console.error('没有找到 Token。传第三个参数，或设置 GITHUB_TOKEN 环境变量。');
  process.exit(1);
}

const API = 'api.github.com';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      host: API,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'visitlog-perm-check',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let b = '';
      res.on('data', d => (b += d));
      res.on('end', () => {
        const accepted = res.headers['x-accepted-github-permissions'] || '(未声明)';
        let j = null;
        try { j = JSON.parse(b); } catch (e) {}
        resolve({ code: res.statusCode, accepted, json: j, raw: b });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const full = `${user}/${repo}`;
  console.log(`探测 Token 对 ${full} 的权限…\n`);

  // 1. 认证身份
  const me = await req('GET', '/user');
  if (me.code !== 200) {
    console.log('❌ Token 无效：', me.json?.message || me.raw.slice(0, 120));
    process.exit(1);
  }
  console.log(`  认证身份  ${me.json.login}  (显示名 ${me.json.name || '—'})`);

  // 2. 仓库可见性
  const rp = await req('GET', `/repos/${full}`);
  if (rp.code !== 200) {
    console.log(`❌ 看不到仓库：${rp.json?.message || rp.raw.slice(0, 100)}`);
    process.exit(1);
  }
  console.log(`  仓库      可见 ✓  可见性 ${rp.json.visibility}  默认分支 ${rp.json.default_branch}`);

  // 3. 关键：这个响应头直接告诉你 Token 对该仓库的实际权限
  console.log(`  声明权限  ${rp.accepted}`);

  // 4. 写权限实测（创建 blob，不落盘到分支）
  const blob = await req('POST', `/repos/${full}/git/blobs`, {
    content: Buffer.from('permission-probe').toString('base64'),
    encoding: 'base64',
  });
  const canWrite = blob.code === 201 || blob.code === 200;

  console.log('');
  if (canWrite) {
    console.log('✅ 有写权限 —— 可以推送');
    console.log('');
    console.log('执行：');
    console.log(`  cd "${path.join(__dirname, '..')}"`);
    console.log(`  git remote set-url origin https://github.com/${full}.git`);
    console.log('  git push -u origin main');
    process.exit(0);
  } else {
    console.log('❌ 没有写权限');
    console.log(`   错误码 ${blob.code}：${blob.json?.message || blob.raw.slice(0, 120)}`);
    console.log('');
    console.log('原因：fine-grained Token 的 Repository access 没包含这个仓库，');
    console.log('     或 Contents 权限还是 Read-only。');
    console.log('');
    console.log('修复步骤：');
    console.log(`  1. 打开 https://github.com/settings/personal-access-tokens`);
    console.log('  2. 点进你的 Token');
    console.log('  3. Repository access 改成 All repositories（或勾选 ' + full + '）');
    console.log('  4. Repository permissions → Contents 设为 Read and write');
    console.log('  5. 点 Update token 并保存');
    console.log('');
    console.log('改完重跑本脚本验证，看到 ✅ 再推送。');
    process.exit(1);
  }
})().catch(e => {
  console.error('探测失败:', e.message);
  process.exit(1);
});
