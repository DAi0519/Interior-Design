/**
 * [INPUT]: 依赖 Git 工作区、package/lock、Node/npm、发布白名单与项目源码文档契约
 * [OUTPUT]: 对外提供可复用 runReleaseChecks，并以 CLI 执行干净提交、测试、依赖与安全检查
 * [POS]: scripts 的发布准入门，阻断脏工作区、版本漂移、超长文件、契约缺失和疑似密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  releaseArtifactNames,
  selectReleaseFiles,
} from "./release-files.mjs";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export function runCommand(label, command, args, {
  capture = false,
  cwd = projectRoot,
} = {}) {
  if (label) process.stdout.write(`\n→ ${label}\n`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture
      ? [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
      : "";
    throw new Error(`${label || command}失败${detail ? `：\n${detail}` : ""}`);
  }
  return capture ? String(result.stdout || "") : "";
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export async function runCommandWithRetries(label, command, args, {
  attempts = 3,
  cwd = projectRoot,
  pause = wait,
  run = runCommand,
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new TypeError("attempts 必须是正整数");
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return run(
        attempt === 1 ? label : `${label}（重试 ${attempt}/${attempts}）`,
        command,
        args,
        { cwd },
      );
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await pause(attempt * 1_000);
    }
  }
  throw lastError;
}

function gitOutput(args) {
  return runCommand("", "git", args, { capture: true }).trim();
}

export async function readPackageInfo() {
  const packageInfo = JSON.parse(
    await readFile(resolve(projectRoot, "package.json"), "utf8"),
  );
  const lockInfo = JSON.parse(
    await readFile(resolve(projectRoot, "package-lock.json"), "utf8"),
  );
  releaseArtifactNames(packageInfo.name, packageInfo.version);
  if (lockInfo.name !== packageInfo.name || lockInfo.version !== packageInfo.version) {
    throw new Error("package.json 与 package-lock.json 的名称或版本不一致");
  }
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < 24) {
    throw new Error(`发布需要 Node.js 24+，当前为 ${process.version}`);
  }
  return packageInfo;
}

function trackedFiles() {
  return gitOutput(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean);
}

function lineCount(text) {
  if (!text) return 0;
  const normalized = text.replaceAll("\r\n", "\n");
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n").length
    : normalized.split("\n").length;
}

async function assertSourceContracts(files) {
  const codeExtensions = new Set([".css", ".html", ".js", ".mjs"]);
  const sourceFiles = files.filter((file) =>
    file === "server.mjs" ||
    ["public/", "scripts/", "src/", "test/"].some((prefix) =>
      file.startsWith(prefix)) && codeExtensions.has(extname(file)));
  for (const file of sourceFiles) {
    const text = await readFile(resolve(projectRoot, file), "utf8");
    const count = lineCount(text);
    if (count > 800) throw new Error(`${file} 为 ${count} 行，超过 800 行上限`);
    if (![".js", ".mjs"].includes(extname(file))) continue;
    const header = text.split(/\r?\n/, 14).join("\n");
    for (const key of ["INPUT", "OUTPUT", "POS", "PROTOCOL"]) {
      if (!header.includes(`[${key}]`)) {
        throw new Error(`${file} 缺少 L3 [${key}] 文件头契约`);
      }
    }
  }
}

async function assertNoLikelySecrets(files) {
  const patterns = [
    ["私钥", /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/],
    ["GitHub Token", /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ["Slack Token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
    ["疑似 API Key", /\bsk-[A-Za-z0-9_-]{32,}\b/],
  ];
  for (const file of files) {
    const text = await readFile(resolve(projectRoot, file), "utf8");
    for (const [label, pattern] of patterns) {
      if (pattern.test(text)) throw new Error(`${file} 包含${label}，拒绝打包`);
    }
  }
}

export async function runReleaseChecks() {
  process.stdout.write("Canvas Lab 发布检查\n");
  const packageInfo = await readPackageInfo();
  const status = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    throw new Error(`工作区必须先提交且保持干净：\n${status}`);
  }
  runCommand("检查 Git 空白与冲突标记", "git", ["diff", "--check"]);
  const allTrackedFiles = trackedFiles();
  const files = selectReleaseFiles(allTrackedFiles);
  await assertSourceContracts(allTrackedFiles);
  await assertNoLikelySecrets(files);
  runCommand("验证 package-lock 可干净安装", npmCommand, [
    "ci",
    "--dry-run",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);
  runCommand("运行自动化测试", npmCommand, ["test"]);
  await runCommandWithRetries("审计生产依赖", npmCommand, [
    "audit",
    "--omit=dev",
    "--audit-level=moderate",
  ], { attempts: 3 });
  const commit = gitOutput(["rev-parse", "HEAD"]);
  process.stdout.write(`\n✓ 发布检查通过：${files.length} 个运行文件，提交 ${commit.slice(0, 12)}\n`);
  return { commit, files, packageInfo };
}

const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runReleaseChecks().catch((error) => {
    process.stderr.write(`\n发布检查失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
