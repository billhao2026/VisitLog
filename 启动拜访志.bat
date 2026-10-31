@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Node 查找顺序：环境变量 VL_NODE → 系统 node（PATH）
if defined VL_NODE (
  set "NODE_EXE=%VL_NODE%"
) else (
  set "NODE_EXE=node"
)
set "NODE_PATH=%~dp0node_modules"
title 拜访志 VisitLog :8897

echo.
echo   正在启动 拜访志 VisitLog ...
echo   关闭本窗口即停止服务
echo.

REM 版本检查（需 >= 22.5）
for /f "tokens=* delims=." %%a in ('"%NODE_EXE%" -p "process.versions.node.split('\''.'\'')[0]" 2^>nul') do set "NODE_MAJOR=%%a"
for /f "tokens=* delims=." %%a in ('"%NODE_EXE%" -p "process.versions.node.split('\''.'\'')[1]" 2^>nul') do set "NODE_MINOR=%%a"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if not defined NODE_MINOR set "NODE_MINOR=0"

if %NODE_MAJOR% LSS 22 goto TOOOLD
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 5 goto TOOOLD
goto RUN

:TOOOLD
echo.
echo   [X] Node.js 版本过低或未安装
echo       拜访志需要 Node.js 22.5 或更高版本（内置 node:sqlite）
echo       下载：https://nodejs.org
echo.
pause
exit /b 1

:RUN
"%NODE_EXE%" server\server.js
pause
