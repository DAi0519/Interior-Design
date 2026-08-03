@echo off
REM [INPUT]: 依赖当前目录 launcher.mjs 与本机 Node.js 24+
REM [OUTPUT]: 为 Windows Explorer 提供双击启动入口，缺少 Node 时打开官方下载页
REM [POS]: 项目根目录的 Windows 薄包装器，所有安装与启动逻辑统一委托 launcher.mjs
REM [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto node_missing

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto node_old

node launcher.mjs
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方错误信息。
  pause
  exit /b 1
)
exit /b 0

:node_missing
echo Canvas Lab 需要先安装 Node.js 24 或更高版本。
start "" "https://nodejs.org/en/download/"
echo 安装完成后请重新双击本文件。
pause
exit /b 1

:node_old
for /f "delims=" %%V in ('node --version') do set "NODE_VERSION=%%V"
echo 当前 Node.js 版本为 %NODE_VERSION%，需要升级到 24 或更高版本。
start "" "https://nodejs.org/en/download/"
echo 升级完成后请重新双击本文件。
pause
exit /b 1
