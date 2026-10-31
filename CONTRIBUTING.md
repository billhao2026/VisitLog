# 贡献指南

感谢你愿意为拜访志出力。这份文档讲怎么提 Issue、怎么改代码、怎么提 PR。

无论大小都欢迎：一个错别字、一个 Issue、一段文档、一处重构，都是贡献。

---

## 目录

- [贡献什么](#贡献什么)
- [提 Issue](#提-issue)
- [开发环境](#开发环境)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [提 Pull Request](#提-pull-request)
- [安全漏洞](#安全漏洞)
- [行为准则](#行为准则)

---

## 贡献什么

**特别欢迎**：

- 跨行业适配：分类字典、术语表、提示词模板的行业化版本
- 转写准确度：更好的热词策略、术语自动提取
- 文档翻译（目前只有中文）
- 兼容性：不同 Node 版本、Windows / Linux 支持
- 体验改进：交互、性能、界面

**请先别提**：

- 新增 AI 厂商 API 集成 —— 当前设计刻意不绑定厂商，见 README「设计取舍」
- 引入重量级前端框架 —— 会破坏「零依赖 + 双击即启动」的定位
- 引入数据库 / 后端服务 —— 会破坏「数据全在本机」的定位

如果你有这类想法，欢迎先开 Issue 讨论，别直接写 PR。

---

## 提 Issue

用右侧的 **New issue**，GitHub 会引导你选模板：

| 模板 | 什么时候用 |
|---|---|
| **报告 Bug** | 功能不按预期工作 |
| **功能建议** | 想让系统支持某个能力 |
| **行业适配** | 想贡献某行业的分类字典或术语表 |
| **问题咨询** | 不知道怎么用（先看文档，可能是用法问题） |

**提 Bug 请务必包含**：

1. 你的系统（macOS / Windows / Linux）和 Node 版本（`node -v`）
2. 复现步骤
3. 实际结果 vs 期望结果
4. 相关报错日志

> ⚠️ **提 Issue 前请先确认没有包含敏感信息**：客户名称、电话、录音内容、内部数据。贴日志前先脱敏。

---

## 开发环境

### 环境要求

| 依赖 | 版本 | 必需 |
|---|---|---|
| Node.js | ≥ 22.5 | 是 |
| Python | ≥ 3.9 | 仅转写功能 |
| Git | 任意 | 是 |

### 拉取代码

```bash
git clone https://github.com/<你的用户名>/visitlog.git
cd visitlog
git remote add upstream https://github.com/<主仓库>/visitlog.git
```

### 安装（可选）

核心功能零依赖，直接跑：

```bash
npm start
```

想装 `multer` 加速上传：

```bash
npm install
```

转写环境：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm run download-model
```

### 目录结构

```
server/           HTTP 服务 + 路由 + 数据层（零框架，Node 原生 http）
  server.js       入口：路由分发、静态文件、启动流程
  db.js           SQLite 数据层（WAL，写前自动备份）
  schema.sql      表结构定义
  seed.js         分类字典 / 术语 / 设置项初始化
  auth.js         局域网访问口令与会话
  asr.js          转写调度（串行队列）
  api_*.js        各业务路由模块
public/           前端（原生 JS，无构建步骤）
  app.js          核心：路由 / 接口 / 抽屉 / 队列轮询
  page-*.js       各页面
scripts/          转写脚本、术语批量导入、覆盖率检查、周报、演示数据
prompts/          AI 分析提示词模板
test/             冒烟测试（Node 内置 test runner，零依赖）
```

---

## 测试

项目用 **Node 内置 test runner**，不需要装任何测试框架。

```bash
npm test                              # 跑全部
node --test "test/todos.test.js"     # 跑单个文件
```

### 测试结构

| 文件 | 覆盖 |
|---|---|
| `test/boot.test.js` | 首次启动：零依赖启动、分类字典初始化、静态资源完整性、非法输入健壮性 |
| `test/asr-queue.test.js` | 转写队列：上传去重、队列状态、失败不卡死 |
| `test/ai-writeback.test.js` | AI 回写：六件套落库、改判反哺、术语重套历史 |
| `test/todos.test.js` | 待办：创建、跟进顺延、闭环、超期标记 |

### 测试怎么跑起来的

`test/helpers.js` 会把项目复制到系统临时目录，在副本里启动一个**隔离的**服务实例（独立数据库 + 独立端口），测试完自动销毁。

**所以测试不会碰你的真实数据。**

### 写新测试

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { withServer } = require('./helpers.js');

test('我的功能 · 正常工作', withServer(async (s) => {
  const r = await s.get('/api/stats');
  assert.strictEqual(r.body.ok, true);
}));
```

`withServer` 会自动在用例结束后清理沙箱。

---

## 代码规范

### 硬性约束（改之前务必读）

1. **零运行时依赖**：核心功能只能用 Node 内置模块。新增依赖前先在 Issue 里讨论。
2. **不破坏零依赖启动**：不允许引入构建步骤。改完 `node server/server.js` 必须能直接跑。
3. **数据只在本机**：不允许加任何把用户数据发到外部服务器的代码。
4. **前端不引入框架**：原生 JS，保持 `public/` 直接可读。
5. **不硬编码路径**：机器相关路径一律走环境变量或运行时探测（参考 `server/asr.js` 的 `findPython()`）。

### 风格

- **缩进**：2 空格
- **引号**：单引号
- **分号**：有
- **文件编码**：UTF-8（数据库与 Python 脚本必须带 `utf-8` 处理）
- **注释**：中文注释，解释**为什么**，不是复述代码在做什么
- **命名**：camelCase（JS）、snake_case（Python / 数据库字段）

### 示例

```js
// ✅ 好：解释意图
// 回退到系统 Python，找不到才交给 PATH 解析
return 'python3';

// ❌ 差：复述代码
// 返回 python3
return 'python3';
```

---

## 提交规范

用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>
<footer>
```

**type**：

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 Bug |
| `docs` | 只改文档 |
| `refactor` | 重构，不改变行为 |
| `perf` | 性能优化 |
| `style` | 格式调整（不改逻辑） |
| `test` | 补测试 |
| `chore` | 构建 / 依赖 / 杂项 |

**示例**：

```
feat(dict): 术语表支持批量 CSV 导入

字典页手动加术语太慢，加了 CSV 导入。
一次可以导入几百条。

Closes #42
```

**scope** 建议：`dict` / `asr` / `auth` / `upload` / `todos` / `weekly` / `ui` / `db` / `docs`

---

## 提 Pull Request

### 流程

1. **开分支**：`git checkout -b feat/your-feature`
2. **改代码**：保持每次提交聚焦一件事
3. **自测**：按下面的清单过一遍
4. **推送**：`git push origin feat/your-feature`
5. **开 PR**：从你的 fork 指向主仓库的 `main` 分支
6. **填模板**：说明改了什么、为什么、怎么测的

### 提交前自检清单

- [ ] `npm test` 全部通过
- [ ] `node server/server.js` 能正常启动，浏览器能打开
- [ ] 语法检查通过：`for f in server/*.js public/*.js scripts/*.js; do node --check "$f"; done`
- [ ] Python 改动：`python3 -m py_compile scripts/*.py`
- [ ] **没有硬编码本地路径**（`/Users/xxx`、`C:\Users\xxx`）
- [ ] **没有硬编码真实客户名、人名、电话**
- [ ] **没有引入新的运行时依赖**（如需，先开 Issue 讨论）
- [ ] **没有破坏零依赖启动**（不需要 `npm install` 就能跑核心功能）
- [ ] **没有添加把用户数据发到外部服务器的代码**
- [ ] **新增/修改的功能有对应测试**
- [ ] 涉及数据结构的改动：确认 `schema.sql` 的迁移逻辑幂等，老库能平滑升级
- [ ] 相关文档已同步更新

### 隐私红线

**PR 里绝对不能出现**：

- 真实客户名称、公司名
- 真实联系人姓名、电话
- 真实录音内容或转写稿
- 任何生产环境的数据库文件、录音文件
- 你本机的绝对路径

> 这条是硬性的。违反的 PR 会被直接关闭。

### PR 标题

```
fix(asr): 修复模型目录不存在时转写静默失败
```

---

## 安全漏洞

**不要**用公开 Issue 报告安全漏洞。见 [SECURITY.md](SECURITY.md)。

---

## 行为准则

参与即同意 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

---

## 许可

你贡献的内容默认以 [MIT 许可](LICENSE) 授权。

---

有任何问题，欢迎开 Issue 讨论，不用客气。
