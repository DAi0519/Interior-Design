/**
 * [INPUT]: 依赖 Git 已跟踪文件清单与 package.json 的名称、SemVer 版本
 * [OUTPUT]: 对外提供严格发布白名单筛选、版本校验与稳定产物命名
 * [POS]: scripts 的纯规则层，被发布检查、打包器与单元测试共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { posix } from "node:path";

export const ROOT_RELEASE_FILES = Object.freeze([
  ".env.example",
  ".gitignore",
  "launcher.mjs",
  "README.md",
  "package-lock.json",
  "package.json",
  "server.mjs",
  "start-macos.command",
  "start-windows.cmd",
]);

const REQUIRED_RELEASE_FILES = Object.freeze([
  ...ROOT_RELEASE_FILES,
  "public/index.html",
]);

const RELEASE_DIRECTORIES = Object.freeze(["public/", "src/"]);
const FORBIDDEN_BASENAMES = new Set([
  ".DS_Store",
  "CLAUDE.md",
]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".key",
  ".log",
  ".p12",
  ".pem",
]);

function safeRepositoryPath(value) {
  const file = String(value || "");
  if (!file || file.includes("\\") || file.includes("\0")) return null;
  const normalized = posix.normalize(file);
  if (
    normalized !== file ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    return null;
  }
  return normalized;
}

export function isReleaseFile(value) {
  const file = safeRepositoryPath(value);
  if (!file) return false;
  const baseName = posix.basename(file);
  if (FORBIDDEN_BASENAMES.has(baseName)) return false;
  if (FORBIDDEN_EXTENSIONS.has(posix.extname(file).toLowerCase())) return false;
  if (baseName === ".env" || baseName.startsWith(".env.")) {
    return file === ".env.example";
  }
  return ROOT_RELEASE_FILES.includes(file) ||
    RELEASE_DIRECTORIES.some((directory) => file.startsWith(directory));
}

export function selectReleaseFiles(trackedFiles) {
  const files = [...new Set(trackedFiles.map(String))]
    .filter(isReleaseFile)
    .sort();
  const missing = REQUIRED_RELEASE_FILES.filter((file) => !files.includes(file));
  if (missing.length > 0) {
    throw new Error(`发布白名单缺少运行文件：${missing.join("、")}`);
  }
  return files;
}

export function assertSemver(value) {
  const version = String(value || "").trim();
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  if (!pattern.test(version)) {
    throw new Error(`package.json version 不是合法 SemVer：${version || "<empty>"}`);
  }
  return version;
}

export function releaseArtifactNames(name, versionValue) {
  const packageName = String(name || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(packageName)) {
    throw new Error(`package.json name 不能用于发布文件名：${packageName || "<empty>"}`);
  }
  const version = assertSemver(versionValue);
  const baseName = `${packageName}-v${version}`;
  return {
    archive: `${baseName}.zip`,
    baseName,
    checksum: `${baseName}.sha256`,
    manifest: `${baseName}.manifest.json`,
    prefix: `${baseName}/`,
  };
}
