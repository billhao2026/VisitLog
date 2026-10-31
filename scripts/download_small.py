# -*- coding: utf-8 -*-
"""下载 faster-whisper small 模型到本地（hf-mirror + 禁用 xet）

用法: python scripts/download_small.py [目标目录]
默认: <项目根>/models/small
"""
import os
import sys
from pathlib import Path

os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
os.environ["HF_HUB_DISABLE_XET"] = "1"
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parent.parent
DST = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "models" / "small"
DST.mkdir(parents=True, exist_ok=True)

print("[dl] 目标目录:", DST, flush=True)
p = snapshot_download(
    repo_id="Systran/faster-whisper-small",
    local_dir=str(DST),
    local_dir_use_symlinks=False,
    max_workers=4,
)
print("[dl] 完成:", p, flush=True)
