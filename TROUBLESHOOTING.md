# 故障排查

按现象查。每条都给出**原因**和**怎么修**。

---

## 一、装不上 / 启动不了

### `node:sqlite is not available` / `Cannot find module 'node:sqlite'`

**原因**：Node.js 版本低于 22.5。`node:sqlite` 是 22.5 才内置的实验特性。

**修复**：升级 Node.js。

```bash
node -v          # 查版本
```

- macOS：`brew install node` 或访问 [nodejs.org](https://nodejs.org) 下载
- Windows：安装后重新开一个终端窗口
- 用 nvm：`nvm install 22 && nvm use 22`

### `SQLite is an experimental feature and might change at any time`

**原因**：**不是错误**。Node 官方对 `node:sqlite` 的正常提示。

**修复**：忽略即可。

### `未找到 multer，启用内置 multipart 解析器`

**原因**：**不是错误**。`multer` 是可选依赖，没装时自动回落到内置的 `server/multipart.js`。

**修复**：想上传更快就 `npm install`；不装完全能用。

### macOS 双击 `启动拜访志.command` 没反应

**原因**：macOS 的 Gatekeeper 机制拦截未签名的脚本。

**修复**：
1. 在访达里**右键**该文件 → **打开** → 弹窗里点「打开」
2. 如果提示「已阻止」，去 **系统设置 → 隐私与安全性**，找到被阻止的记录，点「仍要打开」
3. 或者命令行执行：`chmod +x 启动拜访志.command`

### `EADDRINUSE: address already in use :::8897`

**原因**：服务已经在跑了，或者端口被别的程序占用。

**修复**：

```bash
# macOS / Linux：找到并结束占用进程
lsof -nP -iTCP:8897 -sTCP:LISTEN -t | xargs kill

# Windows
netstat -ano | findstr :8897
taskkill /PID <上面查到的PID> /F
```

或者换个端口：`PORT=9000 npm start`

### 启动后浏览器打不开页面

逐项检查：

```bash
# 1. 服务在监听吗
lsof -nP -iTCP:8897 -sTCP:LISTEN

# 2. 接口通吗（加 --noproxy 避免本机代理拦截）
curl -s --noproxy '*' -o /dev/null -w '%{http_code}\n' http://localhost:8897/
```

如果 curl 通但浏览器打不开，检查浏览器有没有装代理插件。

---

## 二、转写问题

### `转写进程退出码 2` / `faster-whisper 不可用`

**原因**：Python 环境没建好，或依赖没装。

**修复**：

```bash
# 1. 确认虚拟环境存在
ls .venv/bin/python3        # macOS / Linux
ls .venv\Scripts\python.exe  # Windows

# 2. 装依赖
source .venv/bin/activate
pip install -r requirements.txt

# 3. 验证
python3 -c "import faster_whisper; print('OK')"
```

如果项目在 `.venv` 里没找到，程序会退回到系统 `python3`。可以用环境变量指定：

```bash
VL_PY=/path/to/python3 npm start
```

### `音频不存在` / 转写立即失败

**原因**：录音文件被删了（可能是保留期策略清理掉了），或路径变了。

**修复**：重新上传录音；或把保留天数调大（设置页 → 录音保留）。

### 转写特别慢

**原因**：CPU 推理是串行的，队列不并发。

**参考速度**：small 模型 int8 CPU，约 **3-6 分钟 / 10 分钟音频**。

**优化**：
- 用 `base` 模型（更快，准确率略低）
- 有独显的话装 CUDA 版 PyTorch 会快很多
- 挂着让它跑完，不要同时干别的重活

### 转写出来错字很多

**这是最常见也最容易解决的问题。**

**原因**：语音模型不认识你的行业黑话。

**修复**（按效果排序）：

1. **加术语**（最有效）：字典页 → 术语 → 填「错误写法」和「正确写法」。加完之后：
   - 历史稿件立刻重套
   - 正确写法自动进热词，**下次转写就能认出来**
2. **批量导入**：`python3 scripts/add_terms_batch.py`
3. 换更大的模型（`medium` / `large`），准确率显著提升但更慢、占空间更大

### 转写漏掉整段话 / 覆盖率很低

**原因**：VAD（静音检测）把内容误判为静音滤掉了。

系统有四级降级阶梯自动处理（日志里会看到 `配置N: X段 / 音频Ys / 语音覆盖Z%`）。如果自动降级后仍不满意：

- 在字典页检查是否把重要词误标成了敏感词
- 尝试改用 `base` 模型重跑（有时更激进的 VAD 参数反而更稳）

### 点了「重跑转写」没反应

**原因**：转写队列是串行的，前面还有任务在跑。

**修复**：等当前任务完成，或重启服务清空队列。

---

## 三、数据问题

### 数据好像丢了 / 页面全是空的

**原因**：换目录启动了服务。数据库路径是**相对于项目目录**的。

**检查**：

```bash
ls -la data/calls.db
```

**修复**：确认在项目根目录下启动服务。

### 数据库锁定 / SQLITE_BUSY

**原因**：有另一个进程在写同一个库（比如你开了两个服务）。

**修复**：结束多余进程，只留一个。

### 删了录音，转写稿也没了？

**不会**。转写稿存在数据库里，删除录音只删音频文件。日志里的 `audio_deleted` 标记会置位。

### 想彻底清空重来

```bash
# 停止服务后
rm -rf data/ audio/ models/
npm start        # 会重新建库并写入分类字典
```

> ⚠️ 这会**永久删除所有通话记录、客户档案、待办**。先备份 `data/` 目录。

### 迁移到新电脑

复制整个项目目录（含 `data/`、`audio/`、`models/`），在新电脑上装好 Node.js 即可。`.env` 需要重新配置。

---

## 四、局域网 / 访问问题

### 手机访问 401 / 要输口令

**正常行为**。本机 localhost 免密，其他设备需要口令。

**忘了口令**：在**本机**浏览器打开 `http://localhost:8897/`，进设置页重置（需要本机访问权限）。

### 手机连不上

逐项检查：

1. **同一 WiFi？** 不是移动数据，不是访客网络
2. **电脑 IP 对吗？** 启动日志里有一行 `手机 http://192.168.x.x:8897/`
   ```bash
   # macOS
   ipconfig getifaddr en0
   # Windows
   ipconfig
   ```
3. **防火墙拦了？** macOS：系统设置 → 网络 → 防火墙；Windows：允许 Node.js 通过专用网络
4. **路由器开了 AP 隔离？** 换网络试

### 分享链接打不开

**原因**：分享链接依赖服务在运行，且 token 必须完整（不要只复制一半）。

**修复**：重新生成链接；确认服务未停止。

> ⚠️ 分享链接**没有口令校验**，只发给指定的人。

---

## 五、AI 分析问题

### 粘贴 AI 返回的 JSON 没反应

**原因**：格式不对。

**要求**：
- 必须是**纯 JSON**
- 不能带 ```json 代码块围栏
- 不能有任何解释文字
- 字段名要跟提示词里一致

**对照**：提示词模板在 `prompts/analysis.md`，里面有完整的输出格式说明。

### AI 总是分类到同一类

**原因**：AI 对某些表述理解不到位，或者提示词没针对你的业务改。

**修复**：
1. 人工改判 → 采纳「自动归类规则」→ 系统下次自动命中
2. 改 `prompts/analysis.md`，把分类字典换成你行业的表述

### 提示词里的转写稿太长，AI 读不完

**原因**：长通话的转写稿很长。

**修复**：
- 用 `base` 或分段处理
- 在提示词里要求 AI 只输出关键部分
- 改 `prompts/analysis.md`，加上「只保留前 N 段」的限制

---

## 六、周报问题

### `邮件发送失败：connect ECONNREFUSED`

**原因**：SMTP 地址或端口不对。

**检查**：

```bash
# 测试端口连通性
nc -zv smtp.163.com 465
```

| 邮箱 | host | port | secure |
|---|---|---|---|
| 163 | `smtp.163.com` | 465 | 1 |
| 163 | `smtp.163.com` | 25 | 0 |
| QQ | `smtp.qq.com` | 465 | 1 |
| Gmail | `smtp.gmail.com` | 465 | 1 |

### 认证失败

**原因**：用了登录密码而不是**授权码**。

**修复**：去邮箱设置里开启 SMTP 服务，生成授权码，填到 `VL_SMTP_PASS`。

### 周报生成了但没发出去

**原因**：没配 SMTP 环境变量。

**修复**：

```bash
cp .env.example .env
# 编辑 .env 填入 SMTP 配置
VL_SMTP_HOST=smtp.163.com \
VL_SMTP_USER=you@163.com \
VL_SMTP_PASS=你的授权码 \
npm run weekly
```

没配也能用，报告 HTML 会生成在 `报告/` 目录。

---

## 七、性能问题

### 页面越来越慢

**原因**：数据库积累了大量数据，或录音占满磁盘。

**修复**：
1. 设置页 → 「立即清理」清掉过期录音
2. 检查磁盘空间
3. 保留期设短一些（如 30 天）

### 数据库文件很大

正常——所有转写稿和分析结果都在里面。

**检查**：

```bash
ls -lh data/calls.db
ls -lh data/backups/
```

备份可以只保留最近的几个。

---

## 八、还是解决不了

**提 Issue**，带上：

1. 系统（macOS / Windows / Linux）+ `node -v` 输出
2. 复现步骤
3. 实际结果 vs 期望结果
4. **脱敏后**的日志

> 提之前先看 [开放 Issue](https://github.com/billhao2026/visitlog/issues)，可能已经有人遇到并解决了。

---

**相关文档**：[安装手册](INSTALL.md) · [操作手册](OPERATION.md) · [安全策略](SECURITY.md)
