# 获取支持

## 先看文档

| 你想做什么 | 看这里 |
|---|---|
| 装到电脑上 | [INSTALL.md](INSTALL.md) |
| 学会用 | [OPERATION.md](OPERATION.md) |
| 出问题了 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| 参与改进 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 报告漏洞 | [SECURITY.md](SECURITY.md) |

系统内置的在线手册：启动服务后访问 **http://localhost:8897/manual.html**

---

## 提 Issue

仓库主页 → **Issues** → **New issue**，GitHub 会引导你选模板。

**提之前请先搜一下**：[搜索已有 Issue](https://github.com/billhao2026/visitlog/issues?q=is%3Aissue) —— 可能已经有人遇到并解决了。

### 提好 Issue 的三件事

1. **说清楚你想做什么、实际发生了什么**
2. **给可复现的步骤**
3. **给环境信息**：
   ```bash
   node -v        # Node 版本
   uname -a       # macOS: Linux
   # Windows: systeminfo
   ```

### ⚠️ 一定要脱敏

**贴日志、贴截图前，先移除：**

- 客户名称、公司名
- 联系人姓名、电话
- 录音内容、转写稿
- 你的数据库文件、录音文件
- 本机绝对路径里的用户名

> 贴出去就收不回来了。宁可描述得模糊一点，也别贴真实数据。

---

## 常见问题速查

| 现象 | 解决 |
|---|---|
| `node:sqlite is not available` | Node 升级到 22.5+ |
| `SQLite is an experimental feature` | 正常提示，忽略 |
| `未找到 multer` | 正常，`npm install` 可加速上传 |
| 转写退出码 2 | 重装 Python 依赖，见故障排查 |
| 转写错字多 | 加术语，最有效的手段 |
| 端口被占用 | `lsof -nP -iTCP:8897 -sTCP:LISTEN -t \| xargs kill` |
| 手机访问不了 | 检查同一 WiFi + 防火墙 + 路由器 AP 隔离 |
| 忘记访问口令 | 在本机 localhost 进设置页重置 |
| AI 返回的 JSON 粘贴无效 | 必须是纯 JSON，不能带代码块围栏 |
| 邮件发不出去 | 用邮箱授权码，不是登录密码 |

完整版见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

---

## 功能建议

欢迎提 Issue 描述你想解决什么场景。**说场景比说方案更有用**——比如：

> 我在 做 X 行业，客户的通话里经常出现 Y 类的表述，希望系统能自动识别成 Z 分类。

这种描述能帮我们判断该往哪个方向做。

> 注意：当前设计**刻意不绑定任何 AI 厂商**（不调 API、不需要 Key），也**刻意保持零依赖 + 无构建步骤**。涉及这两点的建议请先开 Issue 讨论，别直接提 PR。

---

## 商业支持

本项目是 MIT 开源的个人项目，**不提供商业化支持服务**。

如果你需要：

- 定制开发
- 私有部署
- 企业级 SLA

可以自己提 Issue 讨论，或基于本仓库做二次开发（MIT 许可允许）。

---

**相关文档**：[README](README.md) · [安装](INSTALL.md) · [操作](OPERATION.md) · [排障](TROUBLESHOOTING.md) · [贡献](CONTRIBUTING.md)
