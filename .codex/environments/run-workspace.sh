#!/bin/bash
# [INPUT]: 依赖 launcher.mjs 的 resolvePort、.env.local、npm、curl、launchctl 与 open
# [OUTPUT]: 复用或后台启动本机工作台，有限等待就绪后打开同一入口
# [POS]: .codex/environments 的 macOS 运行动作实现，供 environment.toml 的短命令调用
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd -- "$project_root"

# --- 共享端口真源 ---
entry_port="$(node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import { resolvePort } from "./launcher.mjs";

let envFileText = "";
try {
  envFileText = readFileSync(".env.local", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
process.stdout.write(String(resolvePort({
  envFileText,
  environmentPort: process.env.PORT,
})));
NODE
)"
entry_url="http://127.0.0.1:$entry_port"

workspace_ready() {
  curl -fsS --connect-timeout 1 --max-time 1 "$entry_url/" >/dev/null 2>&1
}

# --- 已有服务直接复用，避免重复启动 ---
if ! workspace_ready; then
  npm_path="$(command -v npm)"
  cli_path="$project_root/node_modules/.bin/lark-cli"
  if [ ! -x "$cli_path" ]; then
    cli_path="$(command -v lark-cli || true)"
  fi
  if [ -z "$cli_path" ]; then
    printf '%s\n' '未找到 lark-cli，请先安装工作台依赖。' >&2
    exit 1
  fi
  runtime_path="$(dirname "$npm_path"):$(dirname "$cli_path"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  launchctl remove com.canvas-lab.workspace >/dev/null 2>&1 || true
  launchctl submit -l com.canvas-lab.workspace \
    -o /tmp/canvas-lab.log -e /tmp/canvas-lab.log -- \
    /usr/bin/env "PATH=$runtime_path" "LARK_CLI_PATH=$cli_path" "PORT=$entry_port" \
    "$npm_path" --prefix "$project_root" start
fi

# --- 有限轮询，失败不打开浏览器 ---
attempt=0
until workspace_ready; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then
    printf '工作台启动未就绪：%s，请检查 /tmp/canvas-lab.log。\n' "$entry_url" >&2
    exit 1
  fi
  sleep 0.1
done

printf '工作台已就绪：%s\n' "$entry_url"
open "$entry_url"
