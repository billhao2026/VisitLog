# 下载与安装手册

本文档带你看从零把拜访志装到自己电脑上。**全程约 10 分钟**，其中模型下载最久。

---

## 一、先看这里：你需要准备什么

| 项目 | 要求 | 说明 |
|---|---|---|
| **Node.js** | **22.5 或更高** | 必须。低于 22.5 内置的 `node:sqlite` 不可用 |
| **Python** | 3.9 或更高 | **可选**，只有想用「自动转写」才需要 |
| **磁盘空间** | 约 1.5 GB | 转写模型 500MB + 数据与备份 |
| **网络** | 首次下载模型时需要 | 装完系统本身可完全离线运行 |

**关于 Node.js 版本**：这是最常见的坑。低于 22.5 会报 `node:sqlite is not available`。查版本：

```bash
node -v
```

---

## 二、下载

### 方式 A：命令行克隆（推荐）

```bash
git clone https://github.com/billhao2026/VisitLog.git
cd visitlog
```

### 方式 B：网页下载

打开仓库主页 → 右上角绿色 **Code** 按钮 → **Download ZIP** → 解压。

> 用 ZIP 的注意：解压后目录里会套一层 `visitlog-main`，需要手动进到这一层。

### 方式 C：Windows 用户

装了 [Git for Windows](https://git-scm.com/download/win) 后，在文件夹地址栏输入 `cmd` 回车，即可使用 git 命令。

---

## 三、安装

### 3.0 方式 A：Docker（推荐）

**如果你有 Docker，这是最省事的方式**——不用装 Node，不用装 Python，不用下模型，一条命令跑起来。

```bash
cd visitlog
docker compose up -d
```

打开 **http://localhost:8897/**

**首次会做的事**：
1. 构建镜像（装 Node、Python、ffmpeg，约 3-5 分钟）
2. 下载 Whisper 模型（约 500MB，走 hf-mirror 镜像）
3. 启动服务

**常用命令**：

```bash
docker compose logs -f        # 看日志
docker compose restart       # 重启
docker compose down           # 停止（数据保留）
docker compose down -v        # 停止并删除数据卷（彻底清除）
```

**数据在哪**：Docker volume（`visitlog-data` / `visitlog-audio` / `visitlog-reports`）。容器随便重建，数据不丢。

**换端口**：改 `docker-compose.yml` 里的 `"8897:8897"`，比如 `"9000:8897"`，然后访问 `http://localhost:9000/`。

**设置跟进人**：

```bash
VL_OWNER=你的名字 docker compose up -d
```

> Docker 镜像基于 `node:22-bookworm-slim`，Node 版本满足 `node:sqlite` 要求。

---

### 3.1 方式 B：本地运行

**核心功能零依赖**，不需要 `npm install`。

```bash
cd visitlog
npm start
```

看到这行就成功了：

```
拜访志 VisitLog 已启动
本机   http://localhost:8897/
```

打开浏览器访问 **http://localhost:8897/** 即可。

> **想要上传更快？** 装一个可选依赖：
> ```bash
> npm install
> ```
> 装了 `multer` 之后大文件上传解析更快。**不装也完全能用**，系统会自动回落到内置的原生解析器（启动时会看到 `[upload] 未找到 multer，启用内置 multipart 解析器`，这是正常的）。

### 3.2 语音转写（可选）

转写需要 Python 环境 + Whisper 模型。

**第一步：建虚拟环境**

```bash
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate

# Windows
python -m venv .venv
.venv\Scripts\activate
```

**第二步：装依赖**

```bash
pip install -r requirements.txt
```

**第三步：下载模型**

```bash
npm run download-model
```

模型约 500MB，下载到 `models/small/`。国内网络会自动走镜像源（`hf-mirror.com`），一般几分钟。

> **磁盘紧张？** 可以改用更小的 `base` 模型（约 150MB，准确率略低）：
> ```bash
> python3 scripts/download_small.py    # 改脚本里的 repo_id 为 Systran/faster-whisper-base
> ```
> 下载后在「设置」页切换模型即可。

**第四步：验证**

```bash
.venv/bin/python3 -c "import faster_whisper; print('OK')"
```

打印 `OK` 就说明装好了。

---

## 四、启动

### 4.1 双击启动（最简单）

- **macOS**：双击 `启动拜访志.command`
  - 首次需在访达里 **右键 → 打开**，然后点「打开」（macOS 的安全机制）
- **Windows**：双击 `启动拜访志.bat`

**关闭窗口即停止服务**，这是设计如此。

### 4.2 命令行启动

```bash
npm start              # 普通启动
npm run start:env      # 读取 .env 配置启动
```

需要后台常驻：

```bash
nohup npm start > visitlog.log 2>&1 &
```

### 4.3 开机自启（可选）

**macOS**：把 `启动拜访志.command` 拖进「登录项」。

**Windows**：按 `Win+R` 输入 `shell:startup`，把 `启动拜访志.bat` 的快捷方式放进去。

---

## 五、开机自启与常用命令速查

```bash
# 启动
npm start

# 停止（macOS / Linux）
lsof -nP -iTCP:8897 -sTCP:LISTEN -t | xargs kill

# 停止（Windows）
netstat -ano | findstr :8897 | for %i in (%*) do taskkill /PID %i /F

# 查看日志
tail -f visitlog.log

# 生成周报
npm run weekly

# 灌入演示数据（虚构数据，方便先看效果）
npm run demo

# 清空所有数据（含演示数据），恢复到全新状态
npm run demo -- --reset

# 跑测试
npm test
```

### 开机自启

**Docker 方式**：`docker-compose.yml` 里已配置 `restart: unless-stopped`，Docker 启动时容器会自动拉起。

**本地方式**：

- **macOS**：把 `启动拜访志.command` 拖进「登录项」（系统设置 → 通用 → 登录项）
- **Windows**：按 `Win+R` 输入 `shell:startup`，把 `启动拜访志.bat` 的快捷方式放进去

---

## 六、配置

所有配置可选。复制 `.env.example` 为 `.env` 后按需修改：

```bash
cp .env.example .env
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8897` | 服务端口 |
| `VL_OWNER` | 空 | 跟进人 / 记录人默认值，也可在「设置」页改 |
| `VL_PY` | 自动查找 | Python 解释器路径 |
| `VL_MODEL_DIR` | `models/small` | Whisper 模型目录 |
| `VL_SMTP_HOST` | — | SMTP 服务器，配了才能发周报邮件 |
| `VL_SMTP_USER` / `VL_SMTP_PASS` | — | 发件邮箱与**授权码** |
| `VL_SMTP_TO` | 同发件人 | 收件人 |

> `.env` 已在 `.gitignore` 中，不会误提交。

---

## 七、数据在哪

| 内容 | 位置 | 说明 |
|---|---|---|
| 数据库 | `data/calls.db` | SQLite 单文件，全部业务数据 |
| 自动备份 | `data/backups/` | 每次写操作前备份，保留 20 份 |
| 原始录音 | `audio/raw/` | sha1 去重 |
| 转写中间文件 | `data/asr/` | 可安全删除 |
| 语音模型 | `models/` | 可删除后重新下载 |
| 周报 HTML | `报告/` | 生成的报告 |

**备份**：整个 `data/` 和 `audio/` 目录复制走就是完整备份。数据库也可以在「设置」页用备份功能导出。

**迁移到新电脑**：把整个 `visitlog/` 目录复制过去（含 `data/` 和 `audio/`），装好 Node.js 即可。

> `data/`、`audio/`、`models/`、`.env` 都在 `.gitignore` 里，**不会**随 git clone 一起过来，这是正常的。

---

## 八、手机访问（可选）

1. 电脑和手机连同一个 WiFi
2. 查电脑局域网 IP：
   - macOS：系统设置 → 网络 → 查看 IP
   - Windows：`ipconfig` → IPv4 地址
   - Linux：`hostname -I`
3. 手机浏览器访问 `http://<电脑IP>:8897/`

> **强烈建议先设访问口令**：进入「设置」页设置口令。设置后，同一 WiFi 的其他人必须输口令才能访问你的数据和接口。**本机 localhost 不受影响**，分享链接也不受影响。

---

## 九、常见问题

| 现象 | 原因与处理 |
|---|---|
| `node:sqlite is not available` | Node 版本低于 22.5，升级 Node |
| `SQLite is an experimental feature` | **正常提示**，不是错误，可以忽略 |
| `[upload] 未找到 multer` | **正常**，已回落到内置解析器，功能不受影响 |
| 转写报 `转写进程退出码 2` | faster-whisper 没装好，或模型没下载。重走「3.2」 |
| 转写一直失败 | 检查 `.venv` 是否激活：`source .venv/bin/activate` |
| 端口被占用 | `lsof -nP -iTCP:8897 -sTCP:LISTEN -t \| xargs kill` |
| 局域网访问 401 | 需要口令登录，本机 localhost 不受限 |
| macOS 双击没反应 | 首次需右键 → 打开；另外检查「系统设置 → 隐私与安全性 → 已阻止」 |
| 目录不存在报错 | 首次启动会自动创建 `data/`、`audio/`，若手动删过目录，重启一次即可 |
| 邮件发不出去 | 检查 SMTP 配置；163 邮箱要用**授权码**不是登录密码；确认 `VL_SMTP_SECURE=1`（465） |
| Docker 构建卡在下载模型 | 模型约 500MB，国内网络慢。改用镜像站：编辑 `docker-compose.yml` 的 `HF_ENDPOINT` |
| Docker 容器起不来 | `docker compose logs` 看日志；多半是端口被占，改 `docker-compose.yml` 里的端口映射 |
| Docker 里转写报 Python 错误 | 镜像已装 Python，`VL_PY=/usr/bin/python3`；若自定义了镜像需自行装 faster-whisper |

### Docker 专项

```bash
# 看构建进度
docker compose build --progress=plain

# 进去排查
docker compose exec visitlog bash

# 重建（改了代码后）
docker compose up -d --build

# 只清数据不删镜像
docker compose down -v && docker compose up -d
```

---

## 十、卸载

### 本地方式

```bash
# 停止服务
lsof -nP -iTCP:8897 -sTCP:LISTEN -t | xargs kill

# 删除整个目录
cd ..
rm -rf visitlog
```

数据全在项目目录里，删目录即彻底清除。记得先备份 `data/` 和 `audio/`。

### Docker 方式

```bash
docker compose down -v      # 停止并删除数据卷
docker rmi visitlog         # 删除镜像（可选）
```

> `down -v` 会**删除所有数据卷里的数据**（数据库、录音、周报）。不想删数据就用 `docker compose down`。

---

**下一步** → [操作手册（OPERATION.md）](OPERATION.md)：怎么用这个系统做客户拜访记录。

遇到问题看 [故障排查](TROUBLESHOOTING.md)，想参与贡献看 [贡献指南](CONTRIBUTING.md)。
