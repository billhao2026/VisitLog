# 拜访志 VisitLog · 容器镜像
#
# 一个镜像包含：Node 服务 + Python 转写环境 + Whisper 模型
# 数据（数据库、录音）挂载到宿主机，容器重建不丢数据
#
# 构建：
#   docker build -t visitlog .
#   或用 docker compose（推荐）：docker compose up -d

# ── 阶段 1：下载 Whisper 模型 ──────────────────────────────
# 模型单独一层，改代码时不会重复下载 500MB
FROM python:3.12-slim AS models

ARG MODEL_REPO=Systran/faster-whisper-small
ARG HF_ENDPOINT=https://hf-mirror.com

ENV HF_ENDPOINT=${HF_ENDPOINT} \
    HF_HUB_DISABLE_XET=1 \
    MODEL_REPO=${MODEL_REPO} \
    VL_MODEL_DIR=/opt/models/small \
    PYTHONUNBUFFERED=1

# 下载脚本（与运行期脚本同源，但用官方 API 新写法）
COPY scripts/download_model_docker.py /tmp/download_model_docker.py

RUN pip install --no-cache-dir "huggingface_hub>=0.20.0" \
    && mkdir -p /opt/models/small \
    && python /tmp/download_model_docker.py \
    && rm -rf /root/.cache/huggingface

# ── 阶段 2：运行时镜像 ─────────────────────────────────────
FROM node:22-bookworm-slim

# Python 3.11 + 转写依赖（apt 装 python3，pip 装 faster-whisper）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-pip python3-venv \
       ffmpeg \
       ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 依赖（独立层，代码改动不触发重装）
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# 应用代码
COPY package.json ./
COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY prompts/ ./prompts/
COPY 启动拜访志.command ./
COPY 启动拜访志.bat ./

# 模型（从阶段 1 拷贝）
COPY --from=models /opt/models /app/models

# 数据目录（挂载点）
RUN mkdir -p /app/data /app/audio/raw /app/报告

# 环境变量
ENV NODE_ENV=production \
    PORT=8897 \
    VL_MODEL_DIR=/app/models/small \
    VL_PY=/usr/bin/python3 \
    HF_ENDPOINT=https://hf-mirror.com \
    HF_HUB_DISABLE_XET=1

EXPOSE 8897

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8897)+'/api/stats',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# 以非 root 运行
RUN chown -R node:node /app
USER node

CMD ["node", "server/server.js"]
