#!/bin/bash
# 拜访志 VisitLog · macOS 启动脚本（双击运行，关闭窗口即停止）
cd "$(dirname "$0")" || exit 1

# Node 查找顺序：环境变量 VL_NODE → 系统 node → nvm/fnm 常见安装位置
if [ -n "$VL_NODE" ] && [ -x "$VL_NODE" ]; then
  NODE_BIN="$VL_NODE"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN=""
  for CAND in "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.fnm/aliases/default/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$CAND" ]; then NODE_BIN="$CAND"; break; fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo ""
  echo "  ✗ 未找到 Node.js"
  echo "    拜访志需要 Node.js 22.5 或更高版本（内置 node:sqlite）。"
  echo "    安装：https://nodejs.org  或  brew install node"
  echo ""
  read -r -p "  按回车键关闭..." _
  exit 1
fi

# 版本检查（需 >= 22.5）
NODE_MAJOR=$("$NODE_BIN" -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
NODE_MINOR=$("$NODE_BIN" -p "process.versions.node.split('.')[1]" 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  echo ""
  echo "  ✗ Node.js 版本过低（当前 $("$NODE_BIN" -v)）"
  echo "    拜访志需要 Node.js 22.5 或更高版本（内置 node:sqlite）。"
  echo ""
  read -r -p "  按回车键关闭..." _
  exit 1
fi

export NODE_PATH="$(pwd)/node_modules"

echo ""
echo "  正在启动 拜访志 VisitLog ..."
echo "  关闭本窗口（或按 Ctrl+C）即停止服务"
echo ""

exec "$NODE_BIN" server/server.js
