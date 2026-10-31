# -*- coding: utf-8 -*-
"""容器构建期下载 Whisper 模型（比内联 python -c 更可靠）"""
import os
import sys

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from huggingface_hub import snapshot_download

DST = os.environ.get("VL_MODEL_DIR") or "/opt/models/small"
REPO = os.environ.get("MODEL_REPO") or "Systran/faster-whisper-small"

print(f"[dl] 仓库: {REPO}", flush=True)
print(f"[dl] 目标目录: {DST}", flush=True)
os.makedirs(DST, exist_ok=True)

# 新版 huggingface_hub 已移除 local_dir_use_symlinks 参数，不再传
snapshot_download(repo_id=REPO, local_dir=DST, max_workers=4)
print("[dl] 模型下载完成", flush=True)
