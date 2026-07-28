/**
 * [INPUT]: 依赖 node:child_process/fs/os/path/crypto、固定版本 lark-cli 与用户显式飞书授权
 * [OUTPUT]: 对外提供脱敏的 CLI/用户/Scope 状态、非阻塞 Device Flow、二维码与登录完成能力
 * [POS]: src 的运营首次运行边界，与业务 Base 读取和生成记录同步解耦
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { larkCliEnvironment } from "./lark-cli.mjs";

const execFileAsync = promisify(execFile);
const LOGIN_TTL_MS = 10 * 60 * 1000;

export const REQUIRED_LARK_SCOPES = Object.freeze([
  "base:record:read",
  "base:record:create",
  "base:record:update",
  "docs:document.media:upload",
]);

function safeMessage(error, fallback) {
  for (const output of [error?.stderr, error?.stdout]) {
    if (!output) continue;
    try {
      const body = parseJsonObject(output);
      if (body?.error?.message) return body.error.message;
      if (body?.message) return body.message;
    } catch {
      // 非 JSON 输出继续使用通用错误。
    }
  }
  return fallback;
}

export function parseJsonObject(value) {
  const source = String(value || "").trim();
  if (!source) throw new Error("CLI 没有返回 JSON");
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf("{");
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index >= 0 && index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") inString = false;
        continue;
      }
      if (character === "\"") inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        return JSON.parse(source.slice(start, index + 1));
      }
    }
  }
  throw new Error("CLI 返回的 JSON 无法解析");
}

function scopeSet(value) {
  if (Array.isArray(value)) return new Set(value.map(String));
  return new Set(String(value || "").split(/\s+/).filter(Boolean));
}

export function publicAuthStatus(body) {
  const user = body?.identities?.user || {};
  const scopes = scopeSet(user.scope);
  const missingScopes = REQUIRED_LARK_SCOPES.filter(
    (scope) => !scopes.has(scope),
  );
  const loggedIn = Boolean(
    user.available &&
    user.verified &&
    user.status === "ready" &&
    user.tokenStatus === "valid",
  );
  return {
    loggedIn,
    missingScopes,
    tokenValid: user.tokenStatus === "valid",
    userName: loggedIn ? String(user.userName || "") : "",
  };
}

async function defaultRun(cliPath, args, options = {}) {
  return execFileAsync(cliPath, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: larkCliEnvironment(),
    maxBuffer: 8 * 1024 * 1024,
    timeout: options.timeoutMs || 180_000,
  });
}

async function defaultQrCode(cliPath, verificationUrl, run) {
  const directory = await mkdtemp(join(tmpdir(), "canvas-lab-lark-auth-"));
  try {
    const fileName = "authorization.png";
    await run(
      cliPath,
      [
        "auth",
        "qrcode",
        verificationUrl,
        "--output",
        fileName,
        "--size",
        "240",
      ],
      { cwd: directory },
    );
    return `data:image/png;base64,${(await readFile(join(directory, fileName))).toString("base64")}`;
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

export function createLarkSetupService({
  cliPath = process.env.LARK_CLI_PATH || "lark-cli",
  now = Date.now,
  qrCode = defaultQrCode,
  run = defaultRun,
} = {}) {
  const attempts = new Map();

  function pruneAttempts() {
    for (const [loginId, attempt] of attempts) {
      if (attempt.expiresAt <= now()) attempts.delete(loginId);
    }
  }

  async function cliVersion() {
    try {
      const { stdout } = await run(cliPath, ["--version"], {
        timeoutMs: 15_000,
      });
      return String(stdout).match(/\d+\.\d+\.\d+/)?.[0] || "unknown";
    } catch (error) {
      return null;
    }
  }

  async function isConfigured() {
    try {
      const { stdout } = await run(cliPath, ["config", "show"], {
        timeoutMs: 15_000,
      });
      return Boolean(parseJsonObject(stdout)?.appId);
    } catch {
      return false;
    }
  }

  async function authStatus() {
    try {
      const { stdout } = await run(
        cliPath,
        ["auth", "status", "--json", "--verify"],
        { timeoutMs: 30_000 },
      );
      return publicAuthStatus(parseJsonObject(stdout));
    } catch (error) {
      return {
        error: safeMessage(error, "飞书登录状态读取失败"),
        loggedIn: false,
        missingScopes: [...REQUIRED_LARK_SCOPES],
        tokenValid: false,
        userName: "",
      };
    }
  }

  async function status({ verifyBase } = {}) {
    const version = await cliVersion();
    if (!version) {
      return {
        base: { error: null, readable: false },
        cli: { configured: false, installed: false, version: null },
        ready: false,
        user: {
          loggedIn: false,
          missingScopes: [...REQUIRED_LARK_SCOPES],
          tokenValid: false,
          userName: "",
        },
      };
    }

    const configured = await isConfigured();
    if (!configured) {
      return {
        base: { error: null, readable: false },
        cli: { configured: false, installed: true, version },
        ready: false,
        user: {
          loggedIn: false,
          missingScopes: [...REQUIRED_LARK_SCOPES],
          tokenValid: false,
          userName: "",
        },
      };
    }

    const user = await authStatus();
    const base = { error: null, readable: false };
    if (
      user.loggedIn &&
      user.missingScopes.length === 0 &&
      typeof verifyBase === "function"
    ) {
      try {
        await verifyBase();
        base.readable = true;
      } catch (error) {
        base.error = String(error?.message || "共享 Base 读取失败").slice(
          0,
          500,
        );
      }
    }

    return {
      base,
      cli: { configured, installed: true, version },
      ready:
        user.loggedIn &&
        user.missingScopes.length === 0 &&
        base.readable,
      user,
    };
  }

  async function startLogin() {
    const version = await cliVersion();
    if (!version) {
      const error = new Error("飞书 CLI 未安装，请先运行 npm install");
      error.statusCode = 409;
      throw error;
    }
    if (!(await isConfigured())) {
      const error = new Error(
        "飞书 CLI 尚未初始化，请先在终端运行 npm run lark:init",
      );
      error.statusCode = 409;
      throw error;
    }

    pruneAttempts();
    let stdout;
    try {
      ({ stdout } = await run(
        cliPath,
        [
          "auth",
          "login",
          "--scope",
          REQUIRED_LARK_SCOPES.join(" "),
          "--no-wait",
          "--json",
        ],
        { timeoutMs: 30_000 },
      ));
    } catch (error) {
      const wrapped = new Error(safeMessage(error, "无法发起飞书授权"));
      wrapped.statusCode = 409;
      throw wrapped;
    }
    const body = parseJsonObject(stdout);
    const deviceCode = body.device_code || body.data?.device_code;
    const verificationUrl =
      body.verification_url ||
      body.verification_uri_complete ||
      body.data?.verification_url ||
      body.data?.verification_uri_complete;
    if (!deviceCode || !verificationUrl) {
      const error = new Error("飞书 CLI 未返回完整授权信息");
      error.statusCode = 502;
      throw error;
    }

    const loginId = randomUUID();
    const expiresInSeconds = Math.max(
      60,
      Math.min(
        Number(
          body.expires_in ||
          body.data?.expires_in ||
          LOGIN_TTL_MS / 1000,
        ),
        LOGIN_TTL_MS / 1000,
      ),
    );
    const expiresAt = now() + expiresInSeconds * 1000;
    let qrCodeDataUrl;
    try {
      qrCodeDataUrl = await qrCode(cliPath, verificationUrl, run);
    } catch (error) {
      const wrapped = new Error(
        safeMessage(error, "飞书授权二维码生成失败"),
      );
      wrapped.statusCode = 502;
      throw wrapped;
    }
    attempts.clear();
    attempts.set(loginId, { deviceCode, expiresAt });
    return {
      expiresAt,
      loginId,
      qrCodeDataUrl,
      verificationUrl,
    };
  }

  async function completeLogin(loginId, options = {}) {
    pruneAttempts();
    const normalizedId = String(loginId || "").trim();
    const attempt = attempts.get(normalizedId);
    if (!attempt) {
      const error = new Error("授权已过期，请重新发起飞书登录");
      error.statusCode = 410;
      throw error;
    }

    try {
      await run(
        cliPath,
        ["auth", "login", "--device-code", attempt.deviceCode],
        { timeoutMs: 180_000 },
      );
      const nextStatus = await status(options);
      if (!nextStatus.user.loggedIn) {
        const error = new Error("飞书授权尚未完成，请确认后重试");
        error.statusCode = 409;
        throw error;
      }
      attempts.delete(normalizedId);
      return nextStatus;
    } catch (error) {
      if (error.statusCode) throw error;
      const wrapped = new Error(safeMessage(error, "飞书登录未完成"));
      wrapped.statusCode = 409;
      throw wrapped;
    }
  }

  return { completeLogin, startLogin, status };
}
