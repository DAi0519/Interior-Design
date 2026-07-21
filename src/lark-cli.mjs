/**
 * [INPUT]: 依赖 node:child_process/util 与本机 lark-cli 用户身份
 * [OUTPUT]: 对外提供 runLarkCli，统一执行、解析和归一化飞书 CLI 错误
 * [POS]: src 的飞书 CLI 基础设施，被风格读取与生成记录同步共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function safeErrorMessage(error, fallbackMessage) {
  for (const raw of [error?.stderr, error?.stdout]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) return parsed.error.message;
    } catch {
      // 非 JSON 输出继续使用通用错误信息。
    }
  }
  return error?.message || fallbackMessage;
}

export async function runLarkCli(
  { cliPath = "lark-cli", timeoutMs = 180_000 },
  args,
  options = {},
) {
  try {
    const { stdout } = await execFileAsync(cliPath, args, {
      encoding: "utf8",
      cwd: options.cwd,
      env: {
        ...process.env,
        LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
        LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: timeoutMs,
    });
    const body = JSON.parse(stdout);
    if (body?.ok !== true) {
      throw new Error(body?.error?.message || "飞书 CLI 未返回成功结果");
    }
    return body;
  } catch (error) {
    throw new Error(safeErrorMessage(error, "飞书操作失败"));
  }
}
