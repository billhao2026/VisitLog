#!/usr/bin/env node
// 一键替换仓库里的 GitHub 用户名占位符
//
// 用法：
//   node scripts/set-repo-owner.js testuser [你的邮箱]
//
// 改完会：
//   1. 把文档里所有 testuser / testuser 换成真实用户名
//   2. 把 clone 地址里的占位符换掉
//   3. 设置本仓库的 git user.name / user.email（只影响这个仓库）
//
// 以后换了用户名，重跑一次即可
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const username = process.argv[2];
const email = process.argv[3];

if (!username) {
  console.error('用法: node scripts/set-repo-owner.js testuser [你的邮箱]');
  process.exit(1);
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(username)) {
  console.error(`用户名格式不对: ${username}（只允许字母、数字、连字符）`);
  process.exit(1);
}

// 需要处理的占位符形态
const PATTERNS = [
  /<你的用户名>/g,
  /<你的GitHub用户名>/g,
  /<你的 GitHub 用户名>/g,
  /<你的邮箱>/g,
];

// 只扫这些类型，避免动二进制和大文件
const EXT = new Set(['.md', '.yml', '.yaml', '.json', '.js', '.txt']);
// scripts/ 整个跳过：否则脚本会把自己里的示例也替换掉，导致脚本自毁
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'data', 'audio', 'models', 'test', 'scripts']);

let changed = 0;
let touchedFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!EXT.has(ext)) continue;
      const p = path.join(dir, entry.name);
      let s = fs.readFileSync(p, 'utf8');
      const before = s;
      for (const re of PATTERNS) s = s.replace(re, username);
      // clone 命令里的 https://github.com/testuser/visitlog
      s = s.replace(/github\.com\/<[^>]*>\/visitlog/g, `github.com/${username}/visitlog`);
      if (s !== before) {
        fs.writeFileSync(p, s, 'utf8');
        changed++;
        touchedFiles.push(path.relative(ROOT, p));
      }
    }
  }
}

walk(ROOT);

console.log(`用户名已设为: ${username}`);
if (touchedFiles.length) {
  console.log(`更新了 ${touchedFiles.length} 个文件:`);
  for (const f of touchedFiles) console.log('  -', f);
} else {
  console.log('（文档占位符无需改动）');
}

// 设置本仓库的 git 身份（不动全局配置）
if (email) {
  execFileSync('git', ['config', 'user.name', username], { cwd: ROOT });
  execFileSync('git', ['config', 'user.email', email], { cwd: ROOT });
  console.log(`git 身份: ${username} <${email}>`);
} else {
  console.log('（未提供邮箱，git 身份未改动）');
}
console.log('');
console.log('下一步：');
console.log(`  1. 在 GitHub 网页建空仓: https://github.com/new?name=visitlog`);
console.log(`  2. 推送: cd "${ROOT}" && git remote add origin git@github.com:${username}/visitlog.git && git push -u origin main`);
