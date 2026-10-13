/**
 * [INPUT]: 依赖 Node fs/crypto/child_process、固定 GitHub 正式 Release ZIP 与官方 SHA-256、当前项目路径及可注入 fetch
 * [OUTPUT]: 对外提供 validateAppInstallRequest 与 createAppInstaller/getPolicy/isRestartRequired/isRecoveryRequired，校验来源/摘要/ZIP 路径，源码新目录安装或 Release 原地事务更新
 * [POS]: src 的应用安装边界，由 app-update-api 绑定最新回执并检查任务；保护 Git 工作区，原地仅替换发布运行根项、保留配置/数据，失败回滚且不自动重启
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPOSITORY_PATH = "/DAi0519/Interior-Design/releases/download/";
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const EXTRACT_TIMEOUT_MS = 2 * 60_000;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 250 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 1024;
const MAX_REDIRECTS = 3;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RUNTIME_ROOTS = Object.freeze([
  "public", "src", ".env.example", ".gitignore", "README.md", "launcher.mjs", "server.mjs",
  "start-macos.command", "start-windows.cmd", "package-lock.json", "package.json",
]);

class InstallationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "InstallationError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* 正式版本与下载边界                                                         */
/* -------------------------------------------------------------------------- */

export function validateAppInstallRequest({ downloadUrl, version } = {}) {
  const cleanVersion = typeof version === "string" ? version.replace(/^v/, "") : "";
  if (!STABLE_VERSION.test(cleanVersion) || cleanVersion.length > 128) {
    throw new InstallationError("安装版本号无效，请重新检查更新。", "INVALID_VERSION");
  }
  try {
    const url = new URL(downloadUrl);
    const archiveName = `canvas-lab-v${cleanVersion}.zip`;
    const pathname = decodeURIComponent(url.pathname);
    const suffix = pathname.slice(REPOSITORY_PATH.length).split("/");
    if (url.protocol !== "https:" || url.host !== "github.com" || url.username || url.password
      || url.search || url.hash || !pathname.startsWith(REPOSITORY_PATH)
      || suffix.length !== 2 || ![cleanVersion, `v${cleanVersion}`].includes(suffix[0])
      || suffix[1] !== archiveName) throw new Error("untrusted download");
    return { version: cleanVersion, downloadUrl: url.href, checksumUrl: url.href.replace(/\.zip$/, ".sha256"), archiveName };
  } catch {
    throw new InstallationError("安装下载地址校验失败，请重新检查更新。", "UNTRUSTED_DOWNLOAD");
  }
}

function allowedRedirect(url) {
  return url.protocol === "https:" && url.host === "release-assets.githubusercontent.com"
    && !url.username && !url.password && !url.hash;
}

async function downloadFile(url, destination, { fetchImpl, maxBytes, onProgress } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let file;
  try {
    let currentUrl = url;
    let response;
    for (let redirects = 0; ; redirects += 1) {
      response = await fetchImpl(currentUrl, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "Canvas-Lab-installer" } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      const redirect = location && new URL(location, currentUrl);
      await response.body?.cancel();
      if (!redirect || !allowedRedirect(redirect) || redirects >= MAX_REDIRECTS) {
        throw new InstallationError("下载重定向地址校验失败。", "UNTRUSTED_REDIRECT");
      }
      currentUrl = redirect.href;
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw new InstallationError(`下载失败，HTTP 状态码: ${response.status}`, "DOWNLOAD_ERROR");
    }
    const lengthHeader = response.headers.get("content-length");
    const totalBytes = /^\d+$/.test(lengthHeader || "") ? Number(lengthHeader) : 0;
    if (totalBytes > maxBytes) {
      await response.body.cancel();
      throw new InstallationError("下载文件超过安装包容量上限。", "DOWNLOAD_TOO_LARGE");
    }
    file = await open(destination, "wx");
    let downloadedBytes = 0;
    for await (const chunk of response.body) {
      downloadedBytes += chunk.byteLength;
      if (downloadedBytes > maxBytes) {
        controller.abort();
        throw new InstallationError("下载文件超过安装包容量上限。", "DOWNLOAD_TOO_LARGE");
      }
      await file.writeFile(chunk);
      onProgress?.({ downloadedBytes, totalBytes, percent: totalBytes ? downloadedBytes / totalBytes * 100 : 0 });
    }
    if (!downloadedBytes || (totalBytes && downloadedBytes !== totalBytes)) {
      throw new InstallationError("下载内容不完整，请重试。", "INCOMPLETE_DOWNLOAD");
    }
  } catch (error) {
    if (error instanceof InstallationError) throw error;
    throw new InstallationError(controller.signal.aborted ? "下载超时，请检查网络后重试。" : "下载连接失败，请检查网络后重试。", controller.signal.aborted ? "DOWNLOAD_TIMEOUT" : "NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
    await file?.close();
  }
}

async function verifyChecksum(zipPath, checksumPath, archiveName) {
  const checksum = (await readFile(checksumPath, "utf8")).trim().match(/^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)$/);
  if (!checksum || checksum[2] !== archiveName) throw new InstallationError("官方 SHA-256 校验文件无效。", "INVALID_CHECKSUM");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
  const actual = hash.digest("hex");
  if (actual !== checksum[1].toLowerCase()) throw new InstallationError("安装包 SHA-256 与官方校验值不一致，请重新下载。", "CHECKSUM_MISMATCH");
  return actual;
}

/* -------------------------------------------------------------------------- */
/* ZIP 中央目录校验与无 shell 解压                                             */
/* -------------------------------------------------------------------------- */

async function validateZipEntries(zipPath, version) {
  const bytes = await readFile(zipPath);
  const prefix = `canvas-lab-v${version}/`;
  let end = -1;
  for (let cursor = bytes.length - 22; cursor >= Math.max(0, bytes.length - 65_557); cursor -= 1) {
    if (bytes.readUInt32LE(cursor) === 0x06054b50 && cursor + 22 + bytes.readUInt16LE(cursor + 20) === bytes.length) { end = cursor; break; }
  }
  const invalid = () => new InstallationError("安装包 ZIP 结构或文件路径无效。", "INVALID_ARCHIVE");
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw invalid();
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let cursor = bytes.readUInt32LE(end + 16);
  const directoryEnd = cursor + directorySize;
  if (!count || count > 10_000 || bytes.readUInt16LE(end + 8) !== count || directoryEnd !== end) throw invalid();
  let expandedBytes = 0;
  let hasPackage = false;
  const names = new Set();
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > directoryEnd || bytes.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
    const flags = bytes.readUInt16LE(cursor + 8);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > directoryEnd || flags & 1 || size === 0xffffffff || bytes.readUInt16LE(cursor + 34)
      || localOffset + 30 > directoryEnd || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw invalid();
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    if (localOffset + 30 + localNameLength > directoryEnd
      || bytes.toString("utf8", localOffset + 30, localOffset + 30 + localNameLength) !== name) throw invalid();
    const parts = name.split("/");
    if (!name.startsWith(prefix) || name.includes("\\") || name.includes(":") || name.includes("\0")
      || parts.some((part, partIndex) => part === ".." || part === "." || (!part && partIndex !== parts.length - 1))
      || ![0, 0x8000, 0x4000].includes(mode & 0xf000) || names.has(name)) throw invalid();
    names.add(name);
    expandedBytes += size;
    if (expandedBytes > MAX_EXPANDED_BYTES) throw invalid();
    if (name === `${prefix}package.json`) hasPackage = true;
    cursor = next;
  }
  if (cursor !== directoryEnd || !hasPackage) throw invalid();
}

async function extractZip(zipPath, targetDir) {
  await mkdir(targetDir);
  try {
    const options = { timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 1024 * 1024 };
    if (process.platform === "win32") {
      const literal = (value) => `'${value.replaceAll("'", "''")}'`;
      const script = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${literal(zipPath)} -DestinationPath ${literal(targetDir)}`;
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], options);
    } else {
      await execFileAsync("unzip", ["-q", zipPath, "-d", targetDir], options);
    }
  } catch (error) {
    throw new InstallationError(error.killed ? "解压超时。" : "安装包解压失败，请检查 unzip 或 PowerShell 是否可用。", "EXTRACT_ERROR");
  }
}

async function validateExtractedRoot(projectRoot, version) {
  try {
    const pkg = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
    if (pkg.name !== "canvas-lab" || pkg.version !== version) throw new InstallationError("安装包项目名称或版本与正式 Release 不一致。", "VERSION_MISMATCH");
    if ((await readdir(projectRoot)).some((name) => !RUNTIME_ROOTS.includes(name))) throw new Error("unexpected runtime root");
    for (const name of RUNTIME_ROOTS) {
      const stat = await lstat(join(projectRoot, name));
      if (["public", "src"].includes(name) ? !stat.isDirectory() : !stat.isFile()) throw new Error("missing runtime file");
    }
    if (!(await lstat(join(projectRoot, "public/index.html"))).isFile()) throw new Error("missing index");
    const inspectDirectory = async (path) => {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error("unsafe file");
        if (entry.isDirectory()) await inspectDirectory(join(path, entry.name));
      }
    };
    await inspectDirectory(projectRoot);
  } catch (error) {
    if (error instanceof InstallationError) throw error;
    throw new InstallationError("安装包缺少运行文件或包含不安全文件。", "INVALID_PACKAGE");
  }
}

async function rejectExistingDirectory(targetDir) {
  try { await lstat(targetDir); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new InstallationError("该版本目标目录已存在；请保留原目录并选择其他安装位置。", "TARGET_EXISTS");
}

/* -------------------------------------------------------------------------- */
/* 源码保护与运行目录事务                                                     */
/* -------------------------------------------------------------------------- */

async function pathExists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function readInstallPolicy(currentRootDir) {
  return { installMode: await pathExists(join(currentRootDir, ".git")) ? "new-directory" : "in-place" };
}

async function requireInstallMode(currentRootDir, expectedMode) {
  if ((await readInstallPolicy(currentRootDir)).installMode !== expectedMode) {
    throw new InstallationError("安装目录类型发生变化，请重新检查更新。", "INSTALL_MODE_CHANGED");
  }
}

async function validateCurrentRelease(currentRootDir) {
  try {
    const stat = await lstat(currentRootDir);
    const pkg = JSON.parse(await readFile(join(currentRootDir, "package.json"), "utf8"));
    if (!stat.isDirectory() || pkg.name !== "canvas-lab" || !STABLE_VERSION.test(pkg.version)) throw new Error("invalid release directory");
  } catch {
    throw new InstallationError("当前目录不是有效的 Canvas Lab 运行目录。", "INVALID_CURRENT_DIRECTORY");
  }
}

async function applyInPlace({ projectRoot, currentRootDir, stagingDir, renameImpl, onProgress }) {
  const backupDir = join(stagingDir, "backup");
  await mkdir(backupDir);
  const changes = [];
  try {
    for (const name of RUNTIME_ROOTS) {
      await requireInstallMode(currentRootDir, "in-place");
      const target = join(currentRootDir, name);
      const backup = join(backupDir, name);
      const change = { target, backup, hadPrevious: false, installed: false };
      changes.push(change);
      if (await pathExists(target)) {
        await renameImpl(target, backup);
        change.hadPrevious = true;
      }
      await renameImpl(join(projectRoot, name), target);
      change.installed = true;
    }
    onProgress?.({ stage: "installing", percent: 100 });
  } catch (error) {
    const failedRestores = [];
    for (const change of changes.reverse()) {
      try {
        if (change.installed) await rm(change.target, { recursive: true, force: true });
        if (change.hadPrevious) await renameImpl(change.backup, change.target);
      } catch { failedRestores.push(change.target); }
    }
    if (failedRestores.length) {
      throw new InstallationError(`更新失败且部分旧文件未恢复；请先从 ${backupDir} 恢复旧运行文件，再重启 Canvas Lab。`, "ROLLBACK_FAILED");
    }
    if (error instanceof InstallationError) throw error;
    throw new InstallationError("原地更新失败，已恢复旧版本；请检查文件占用和目录权限后重试。", "INSTALL_FAILED");
  }
}

export function createAppInstaller({ installBaseDir = null, currentRootDir = process.cwd(), fetchImpl = fetch, renameImpl = rename } = {}) {
  let currentInstallation = false;
  let restartRequired = false;
  let recoveryRequired = false;
  let recoveryMessage = "";
  const runtimeRoot = resolve(currentRootDir);
  const sourceInstallBase = resolve(installBaseDir || dirname(runtimeRoot));
  const getPolicy = async () => ({ ...await readInstallPolicy(runtimeRoot), restartRequired, recoveryRequired, recoveryMessage });

  async function install({ downloadUrl, version, onProgress, beforeApply = async () => {} } = {}) {
    const release = validateAppInstallRequest({ downloadUrl, version });
    if (recoveryRequired) throw new InstallationError(recoveryMessage, "RECOVERY_REQUIRED");
    if (restartRequired) throw new InstallationError("原地更新已完成，请重启 Canvas Lab 后再操作。", "RESTART_REQUIRED");
    if (currentInstallation) throw new InstallationError("已有安装任务正在进行中。", "INSTALL_IN_PROGRESS");
    currentInstallation = true;
    let targetDir;
    let stagingDir;
    let ownsTarget = false;
    let preserveStaging = false;
    try {
      const { installMode } = await getPolicy();
      const baseDir = installMode === "new-directory" ? sourceInstallBase : runtimeRoot;
      targetDir = installMode === "new-directory" ? join(baseDir, `canvas-lab-v${release.version}`) : runtimeRoot;
      if (installMode === "new-directory") await rejectExistingDirectory(targetDir);
      else await validateCurrentRelease(runtimeRoot);
      await mkdir(baseDir, { recursive: true });
      stagingDir = await mkdtemp(join(baseDir, ".canvas-lab-install-"));
      const zipPath = join(stagingDir, release.archiveName);
      const checksumPath = join(stagingDir, "release.sha256");
      onProgress?.({ stage: "downloading", percent: 0 });
      await downloadFile(release.downloadUrl, zipPath, { fetchImpl, maxBytes: MAX_ARCHIVE_BYTES, onProgress: (progress) => onProgress?.({ stage: "downloading", ...progress }) });
      onProgress?.({ stage: "verifying", percent: 0 });
      await downloadFile(release.checksumUrl, checksumPath, { fetchImpl, maxBytes: MAX_CHECKSUM_BYTES });
      const sha256 = await verifyChecksum(zipPath, checksumPath, release.archiveName);
      await validateZipEntries(zipPath, release.version);
      onProgress?.({ stage: "verifying", percent: 100, sha256 });
      onProgress?.({ stage: "extracting", percent: 0 });
      const extractDir = join(stagingDir, "extracted");
      await extractZip(zipPath, extractDir);
      onProgress?.({ stage: "extracting", percent: 100 });
      const projectRoot = join(extractDir, `canvas-lab-v${release.version}`);
      onProgress?.({ stage: "validating", percent: 0 });
      await validateExtractedRoot(projectRoot, release.version);
      onProgress?.({ stage: "validating", percent: 100 });
      await beforeApply();
      await requireInstallMode(runtimeRoot, installMode);
      onProgress?.({ stage: "installing", percent: 0 });
      if (installMode === "in-place") {
        await applyInPlace({ projectRoot, currentRootDir: runtimeRoot, stagingDir, renameImpl, onProgress });
        restartRequired = true;
      } else {
        // 独占创建目标目录，复制失败只清理本次拥有的目录，禁止覆盖已有版本。
        try { await mkdir(targetDir); }
        catch (error) {
          if (error.code === "EEXIST") throw new InstallationError("该版本目标目录已存在，安装已停止。", "TARGET_EXISTS");
          throw error;
        }
        ownsTarget = true;
        for (const entry of await readdir(projectRoot)) {
          await cp(join(projectRoot, entry), join(targetDir, entry), { recursive: true, force: false, errorOnExist: true });
        }
        onProgress?.({ stage: "installing", percent: 100 });
      }
      return { success: true, version: release.version, path: targetDir, sha256, installMode, mode: installMode, restartRequired };
    } catch (error) {
      preserveStaging = error.code === "ROLLBACK_FAILED";
      if (preserveStaging) {
        recoveryRequired = true;
        recoveryMessage = error.message;
      }
      if (ownsTarget) await rm(targetDir, { recursive: true, force: true }).catch(() => {});
      if (error instanceof InstallationError) throw error;
      if (error.code === "APP_BUSY") throw new InstallationError(error.message, "APP_BUSY");
      throw new InstallationError("安装目录写入失败，请检查目录权限与剩余空间。", "INSTALL_FAILED");
    } finally {
      if (stagingDir && !preserveStaging) await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      currentInstallation = false;
    }
  }

  return {
    install, getPolicy,
    isInstalling: () => currentInstallation,
    isRestartRequired: () => restartRequired,
    isRecoveryRequired: () => recoveryRequired,
  };
}
