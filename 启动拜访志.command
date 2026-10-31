#!/bin/bash
# 拜访志 VisitLog · macOS 启动脚本（双击运行，关闭窗口即停止）
cd "$(dirname "$0")" || exit 1

NODE_BIN="/Users/bill/.workbuddy/binaries/node/versions/22.22.2-3/bin/node"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"

export NODE_PATH="$(pwd)/node_modules"

echo ""
echo "  正在启动 拜访志 VisitLog ..."
echo "  关闭本窗口（或按 Ctrl+C）即停止服务"
echo ""

exec "$NODE_BIN" server/server.js
