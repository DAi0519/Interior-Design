/**
 * [INPUT]: 依赖 Node.js 24+、package-lock.json、npm、lark-cli、server.mjs 与可选 .env.local
 * [OUTPUT]: 对外提供版本/端口/依赖纯规则，并完成依赖安装、飞书初始化、服务启动与浏览器打开
 * [POS]: 项目根目录的一键启动编排器，被 macOS 与 Windows 双击入口共同调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const defaultPort = 4173;
const dependencyMarker = ".canvas-lab-package-lock.sha256";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function stripQuotes(value) {
  const text = String(value || "").trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

export function assertSupportedNode(version) {
  const major = Number.parseInt(String(version || "").split(".")[0], 10);
  if (!Number.isInteger(major) || major < 24) {
    throw new Error(`需要 Node.js 24 或更高版本，当前为 ${version || "未知"}`);
  }
  return major;
}

export function resolvePort({ envFileText = "", environmentPort } = {}) {
  const envLine = String(envFileText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && /^PORT\s*=/.test(line));
  const fileValue = envLine ? envLine.slice(envLine.indexOf("=") + 1) : "";
  const rawValue = stripQuotes(environmentPort || fileValue || String(defaultPort));
  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT 必须是 1-65535 的整数，当前为 ${rawValue || "<empty>"}`);
  }
  return port;
}

export function packageLockDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function shouldInstallDependencies({ currentDigest, markerDigest }) {
  return !markerDigest || markerDigest.trim() !== currentDigest;
}

export function hasLarkAppConfiguration(output) {
  return /"appId"\s*:\s*"[^"]+"/.test(String(output || ""));
}

function pause(milliseconds) {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

export async function waitForCanvasLab(url, {
  attempts = 80,
  fetchImpl = fetch,
  pauseImpl = pause,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${url}/api/catalog`, {
        signal: AbortSignal.timeout(1_000),
      });
      const catalog = await response.json();
      if (response.ok && Array.isArray(catalog.models)) return true;
    } catch {
      // 服务仍在启动或端口未监听，继续有限轮询。
    }
    if (attempt + 1 < attempts) await pauseImpl(125);
  }
  return false;
}

function runCommand(command, args, { env = process.env } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      reject(new Error(
        `${command} 执行失败${signal ? `（${signal}）` : `（退出码 ${code}）`}`,
      ));
    });
  });
}

function captureCommand(command, args, { env = process.env } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => resolveCommand({ code, stderr, stdout }));
  });
}

async function optionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function ensureDependencies() {
  const lockPath = join(projectRoot, "package-lock.json");
  const nodeModules = join(projectRoot, "node_modules");
  const markerPath = join(nodeModules, dependencyMarker);
  const currentDigest = packageLockDigest(await readFile(lockPath));
  const markerDigest = await optionalText(markerPath);
  let modulesExist = true;
  try {
    await access(nodeModules);
  } catch {
    modulesExist = false;
  }
  if (
    modulesExist &&
    !shouldInstallDependencies({ currentDigest, markerDigest })
  ) {
    process.stdout.write("✓ 运行依赖已就绪\n");
    return;
  }

  process.stdout.write("→ 首次运行或依赖已更新，正在执行 npm ci...\n");
  await runCommand(npmCommand, ["ci", "--no-audit", "--no-fund"]);
  await writeFile(markerPath, `${currentDigest}\n`, "utf8");
  process.stdout.write("✓ 运行依赖安装完成\n");
}

function larkCliEnvironment() {
  const environment = { ...process.env };
  delete environment.ONEAPI_API_KEY;
  return environment;
}

async function ensureLarkConfiguration() {
  const environment = larkCliEnvironment();
  const current = await captureCommand(npmCommand, [
    "exec",
    "--",
    "lark-cli",
    "config",
    "show",
  ], { env: environment });
  if (current.code === 0 && hasLarkAppConfiguration(current.stdout)) {
    process.stdout.write("✓ 飞书 CLI 应用配置已就绪\n");
    return;
  }

  process.stdout.write([
    "→ 首次使用需要初始化飞书 CLI。",
    "  浏览器将打开飞书配置页面，请按页面提示完成后返回此窗口。",
    "",
  ].join("\n"));
  await runCommand(npmCommand, ["run", "lark:init"], { env: environment });
  process.stdout.write("✓ 飞书 CLI 应用初始化完成\n");
}

function openBrowser(url) {
  if (process.env.CANVAS_LAB_NO_BROWSER === "1") return Promise.resolve();
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd.exe"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];
  return new Promise((resolveOpen, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolveOpen();
    });
  });
}

async function startServer(url) {
  const child = spawn(
    process.execPath,
    ["--env-file-if-exists=.env.local", "server.mjs"],
    { cwd: projectRoot, stdio: "inherit" },
  );
  let exitResult;
  let settleExit;
  const exited = new Promise((resolveExit) => {
    settleExit = resolveExit;
    child.once("exit", (code, signal) => {
      exitResult = { code, signal };
      resolveExit(exitResult);
    });
  });
  child.once("error", (error) => {
    exitResult = { error };
    settleExit(exitResult);
  });

  const ready = await Promise.race([
    waitForCanvasLab(url),
    exited.then(() => false),
  ]);
  if (!ready) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await Promise.race([exited, pause(2_000)]);
    if (exitResult?.error) throw exitResult.error;
    throw new Error("Canvas Lab 未能启动，请查看上方错误信息");
  }

  await openBrowser(url);
  process.stdout.write([
    `✓ Canvas Lab 已打开：${url}`,
    "  首次使用请在页面连接中心完成飞书登录并填写 OneAPI Key。",
    "  保持此窗口打开；关闭窗口将停止 Canvas Lab。",
    "",
  ].join("\n"));

  const result = await exited;
  if (result.code && !result.signal) {
    throw new Error(`Canvas Lab 异常退出（退出码 ${result.code}）`);
  }
}

export async function launchCanvasLab() {
  assertSupportedNode(process.versions.node);
  const envFileText = await optionalText(join(projectRoot, ".env.local"));
  const port = resolvePort({
    envFileText,
    environmentPort: process.env.PORT,
  });
  const url = `http://127.0.0.1:${port}`;
  if (await waitForCanvasLab(url, { attempts: 1 })) {
    await openBrowser(url);
    process.stdout.write(`✓ Canvas Lab 已在运行：${url}\n`);
    return;
  }
  await ensureDependencies();
  await ensureLarkConfiguration();
  await startServer(url);
}

const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  launchCanvasLab().catch((error) => {
    process.stderr.write(`\n启动失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
