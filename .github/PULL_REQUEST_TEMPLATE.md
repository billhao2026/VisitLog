---
name: Pull Request
about: 提交代码或文档改动
title: "[type(scope)] "
labels: ''
assignees: ''
---

## 改了什么

<!-- 一句话说清楚 -->

Closes #

## 为什么改

<!--
说明动机：
- 解决了什么问题
- 关联哪个 Issue
- 参考了谁的实现（如果是 port 别人的 PR，请注明来源）
-->

## 改动类型

- [ ] 新功能（`feat`）
- [ ] 修 Bug（`fix`）
- [ ] 文档（`docs`）
- [ ] 重构（`refactor`）
- [ ] 性能（`perf`）
- [ ] 依赖 / 构建（`chore`）

## 改动范围

<!-- 勾选你动过的部分，方便 review -->

- [ ] `server/`（服务端）
- [ ] `public/`（前端）
- [ ] `scripts/`（脚本）
- [ ] `prompts/`（提示词）
- [ ] `server/schema.sql`（数据结构）
- [ ] 文档
- [ ] `.github/`（CI / 模板）
- [ ] 新增依赖

## 自测清单

- [ ] `node server/server.js` 正常启动，浏览器能打开
- [ ] 语法检查通过：`for f in server/*.js public/*.js; do node --check "$f"; done`
- [ ] Python 改动：`python3 -m py_compile scripts/*.py`
- [ ] 数据结构改动：确认 `schema.sql` 迁移逻辑幂等，老库能平滑升级
- [ ] 新功能：手动走了一遍完整流程
- [ ] 修 Bug：确认修好了，且没引入新问题
- [ ] 相关文档已同步更新

## 约束遵守

- [ ] **没有硬编码本地路径**（`/Users/xxx`、`C:\Users\xxx`）
- [ ] **没有真实客户名、人名、电话**
- [ ] **没有引入新的运行时依赖**（如需，已在 Issue 中讨论过）
- [ ] **没有破坏零依赖启动**（不需要 `npm install` 就能跑核心功能）
- [ ] **没有添加把用户数据发到外部服务器的代码**

## 截图 / 演示

<!-- 界面改动请附截图；行为改动请说明如何验证 -->

---

**感谢贡献！** 详见 [CONTRIBUTING.md](CONTRIBUTING.md)。
