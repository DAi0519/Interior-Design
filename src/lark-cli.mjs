/**
 * [INPUT]: 依赖 node:child_process/fs/url/util、项目固定安装的 lark-cli 与本机用户身份
 * [OUTPUT]: 对外提供项目 CLI 优先解析、最低版本校验、脱敏子进程环境与统一执行/错误归一化
 * [POS]: src 的飞书 CLI 基础设施，被风格读取与生成记录同步共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REQUIRED_LARK_CLI_VERSION = "1.0.77";
const verifiedCliPaths = new Set();

function versionParts(value) {
  return String(value || "")
    .match(/(?:version\s+)?(\d+)\.(\d+)\.(\d+)/i)
    ?.slice(1)
    .map(Number) || null;
}

export function assertLarkCliVersion(value, required = REQUIRED_LARK_CLI_VERSION) {
  const current = versionParts(value);
  const minimum = versionParts(required);
  if (!current || !minimum) throw new Error("无法识别 lark-cli 版本");
  const compatible = current.some((part, index) =>
    part > minimum[index] && current.slice(0, index).every((entry, prefix) => entry === minimum[prefix]),
  ) || current.every((part, index) => part === minimum[index]);
  if (!compatible) {
    throw new Error(`当前 lark-cli ${current.join(".")} 低于项目要求 ${minimum.join(".")}，请先运行 npm install 并重启服务`);
  }
  return current.join(".");
}

export function resolveLarkCliPath(
  cliPath = "lark-cli",
  {
    fileExists = existsSync,
    platform = process.platform,
    projectCliPath = fileURLToPath(new URL(
      `../node_modules/.bin/lark-cli${platform === "win32" ? ".cmd" : ""}`,
      import.meta.url,
    )),
  } = {},
) {
  if (cliPath !== "lark-cli") return cliPath;
  return fileExists(projectCliPath) ? projectCliPath : cliPath;
}

export function larkCliEnvironment(source = process.env) {
  const environment = { ...source };
  delete environment.ONEAPI_API_KEY;
  environment.LARKSUITE_CLI_NO_SKILLS_NOTIFIER = "1";
  environment.LARKSUITE_CLI_NO_UPDATE_NOTIFIER = "1";
  return environment;
}

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
  const resolvedCliPath = resolveLarkCliPath(cliPath);
  try {
    if (!verifiedCliPaths.has(resolvedCliPath)) {
      const { stdout } = await execFileAsync(resolvedCliPath, ["--version"], {
        encoding: "utf8",
        env: larkCliEnvironment(),
        timeout: 15_000,
      });
      assertLarkCliVersion(stdout);
      verifiedCliPaths.add(resolvedCliPath);
    }
    const { stdout } = await execFileAsync(resolvedCliPath, args, {
      encoding: "utf8",
      cwd: options.cwd,
      env: larkCliEnvironment(),
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
