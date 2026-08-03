#!/bin/zsh
# [INPUT]: 依赖当前目录 launcher.mjs 与本机 Node.js 24+
# [OUTPUT]: 为 macOS Finder 提供双击启动入口，缺少 Node 时打开官方下载页
# [POS]: 项目根目录的 macOS 薄包装器，所有安装与启动逻辑统一委托 launcher.mjs
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

cd -- "$(dirname -- "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Canvas Lab 需要先安装 Node.js 24 或更高版本。"
  open "https://nodejs.org/en/download/"
  read "?安装完成后请重新双击本文件。按任意键关闭..."
  exit 1
fi

node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'
if (( $? != 0 )); then
  echo "当前 Node.js 版本为 $(node --version)，需要升级到 24 或更高版本。"
  open "https://nodejs.org/en/download/"
  read "?升级完成后请重新双击本文件。按任意键关闭..."
  exit 1
fi

node launcher.mjs
status=$?
if (( status != 0 )); then
  echo
  read "?启动失败。按任意键关闭..."
fi
exit $status
