# -*- coding: utf-8 -*-
"""下载 faster-whisper small 模型到本地（hf-mirror + 禁用 xet）"""
import os
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
os.environ["HF_HUB_DISABLE_XET"] = "1"
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from huggingface_hub import snapshot_download

DST = os.environ.get("VL_MODEL_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "small")
print("[dl] 目标目录:", DST, flush=True)
p = snapshot_download(
    repo_id="Systran/faster-whisper-small",
    local_dir=DST,
    local_dir_use_symlinks=False,
    max_workers=4,
)
print("[dl] 完成:", p, flush=True)
