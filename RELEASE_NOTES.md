# 拜访志 VisitLog v6.0.0

客户通话记录平台：**上传语音 → 本地转写 → AI 拆解归类 → 待办与重点沉淀**，改了会反哺字典。

纯本地运行，零云端依赖，零外部 npm 依赖（除可选的 multer 加速上传解析）。数据全部留在你自己的机器上。

## 这个版本有什么

### 功能

- **重点事项强制【客户类型】前缀** — 每条要点以 `【类型】` 开头：行业维度 8+1（党政 / 国央企 / 能源 / 金融 / 通信 / 交通 / 医疗 / 教育 / 军队）+ 渠道性质 5 类（电商平台 / 总代经销 / 集成商 / 服务商 / 终端用户）。判定铁律：以终端客户的行业为准，判不出来不臆造
- **版本迭代时间表** — 设置页内置 6 代版本谱系（`GET /api/version`），打包发布留痕（`GET /api/releases`）
- **工作日推算** — 待办到期日自动避让周末与手动标记的休假日；标记/取消休假日时自动重排所有未完成待办，接口返回顺延明细
- **日程速记** — 独立的日程页，记线下活动（会议 / 外出 / 访谈），按天落成 Markdown
- **跟进唤醒台** — 按沉默天数分层待唤醒客户，配可编辑的「重点聊 ①②③」与上次事项进展
- **37 条 B2B 销售场景分类字典** — 需求 / 报价 / 合同 / 账期 / 售后 / 竞品流失 / 客情
- **术语纠错** — 转写后按字典自动替换，新增术语立即对历史稿件生效
- **改判反哺** — 人工改分类后自动提议归类规则，采纳后下次自动命中

### 工程

- **零依赖可跑** — `git clone` 后直接 `npm start`，不需要 `npm install`
- **Docker 一键部署** — 模型独立分层，改代码不重复下载 500MB
- **29 个冒烟测试** — Node 内置 test runner，零新增依赖
- **本地语音转写** — faster-whisper small / int8 CPU，录音不出本机

## 快速开始

```bash
git clone https://github.com/billhao2026/VisitLog.git
cd VisitLog
npm start          # 打开 http://localhost:8897/
```

启用语音转写（可选）：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm run download-model
```

或用 Docker：

```bash
docker compose up -d
```

## 文档

| 文档 | 内容 |
|---|---|
| [INSTALL.md](INSTALL.md) | 下载与安装手册 |
| [OPERATION.md](OPERATION.md) | 操作手册 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 故障排查 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |

## 隐私

本仓库遵循「真实业务信息零入库」原则：代码里不含任何真实客户名、人名、手机号、行业专属品类词或本机路径。分类字典与术语表是通用销售场景的默认配置——**具体行业的配置请在你自己的实例上维护**。

## 已知限制

- 语音转写需要 Python 环境与约 500MB 模型；不配置也能用，只是需要手动粘贴文本
- 局域网访问默认无鉴权，建议在「设置」页设置访问口令
- AI 拆解是「复制提示词 → 粘贴给任意 AI → 回写 JSON」的模式，系统本身不调用任何 AI 接口

## 参与贡献

欢迎提 Issue 与 PR。请先读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [行为准则](CODE_OF_CONDUCT.md)。

## 许可证

[MIT](LICENSE) © VisitLog Contributors
