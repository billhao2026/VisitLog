@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NODE_EXE=C:\Users\yafo\.workbuddy\binaries\node\versions\22.22.2-2\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node
set NODE_PATH=C:\Users\yafo\.workbuddy\binaries\node\workspace\node_modules
title 拜访志 VisitLog :8897
echo.
echo   正在启动 拜访志 VisitLog ...
echo   关闭本窗口即停止服务
echo.
"%NODE_EXE%" server\server.js
pause
