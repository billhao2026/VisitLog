@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NODE_PATH=%~dp0node_modules
title 拜访志 VisitLog :8897
echo.
echo   正在启动 拜访志 VisitLog ...
echo   关闭本窗口即停止服务
echo.
node server\server.js
pause
