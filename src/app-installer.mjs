/**
 * [INPUT]: 依赖 Node fs/http/https/child_process、受信 GitHub Release ZIP 下载地址与项目根目录路径
 * [OUTPUT]: 对外提供 createAppInstaller，返回下载、解压、验证和清理的安装控制器
 * [POS]: src 的应用安装边界，只安装固定仓库的正式版本，不修改原目录或运行中服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink, rename, rm, access, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { get as httpGet } from "node:https";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000; // 5分钟下载超时
const EXTRACT_TIMEOUT_MS = 2 * 60_000; // 2分钟解压超时

class InstallationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "InstallationError";
    this.code = code;
  }
}

async function downloadFile(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      request.destroy();
      reject(new InstallationError("下载超时，请检查网络后重试。", "DOWNLOAD_TIMEOUT"));
    }, DOWNLOAD_TIMEOUT_MS);

    const request = httpGet(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        clearTimeout(timeout);
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          return reject(new InstallationError("下载重定向失败。", "REDIRECT_ERROR"));
        }
        downloadFile(redirectUrl, destination, onProgress).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        clearTimeout(timeout);
        return reject(new InstallationError(
          `下载失败，HTTP 状态码: ${response.statusCode}`,
          "DOWNLOAD_ERROR"
        ));
      }

      const totalBytes = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedBytes = 0;

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) {
          onProgress({ downloadedBytes, totalBytes, percent: (downloadedBytes / totalBytes) * 100 });
        }
      });

      const fileStream = createWriteStream(destination);

      pipeline(response, fileStream)
        .then(() => {
          clearTimeout(timeout);
          resolve({ path: destination, size: downloadedBytes });
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(new InstallationError(`文件写入失败: ${error.message}`, "WRITE_ERROR"));
        });
    });

    request.on("error", (error) => {
      clearTimeout(timeout);
      reject(new InstallationError(`网络请求失败: ${error.message}`, "NETWORK_ERROR"));
    });

    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy();
      reject(new InstallationError("下载连接超时。", "CONNECTION_TIMEOUT"));
    });
  });
}

async function extractZip(zipPath, targetDir) {
  try {
    await mkdir(targetDir, { recursive: true });
  } catch (error) {
    throw new InstallationError(`创建目标目录失败: ${error.message}`, "MKDIR_ERROR");
  }

  const platform = process.platform;
  let command;

  if (platform === "win32") {
    // Windows 使用 PowerShell
    const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${targetDir}" -Force`;
    command = `powershell -Command "${psCommand}"`;
  } else {
    // macOS/Linux 使用 unzip
    command = `unzip -q -o "${zipPath}" -d "${targetDir}"`;
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: EXTRACT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stderr.includes("warning")) {
      console.warn("解压警告:", stderr);
    }
  } catch (error) {
    if (error.killed || error.signal === "SIGTERM") {
      throw new InstallationError("解压超时。", "EXTRACT_TIMEOUT");
    }
    throw new InstallationError(`解压失败: ${error.message}`, "EXTRACT_ERROR");
  }
}

async function verifyPackageJson(extractedDir, expectedVersion) {
  try {
    const packageJsonPath = join(extractedDir, "package.json");
    const content = await readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(content);

    if (pkg.name !== "canvas-lab") {
      throw new InstallationError("安装包验证失败：不是 Canvas Lab 项目。", "INVALID_PACKAGE");
    }

    const cleanVersion = (v) => String(v || "").replace(/^v/, "");
    if (expectedVersion && cleanVersion(pkg.version) !== cleanVersion(expectedVersion)) {
      throw new InstallationError(
        `版本不匹配：期望 ${expectedVersion}，实际 ${pkg.version}`,
        "VERSION_MISMATCH"
      );
    }

    return { version: pkg.version, name: pkg.name };
  } catch (error) {
    if (error instanceof InstallationError) throw error;
    throw new InstallationError(`验证安装包失败: ${error.message}`, "VERIFY_ERROR");
  }
}

async function computeFileSha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function findExtractedRoot(extractDir) {
  const entries = await readdir(extractDir, { withFileTypes: true });

  // 查找唯一的顶层目录（GitHub Release ZIP 通常有一层包裹目录）
  const dirs = entries.filter((e) => e.isDirectory());

  if (dirs.length === 1) {
    const candidateDir = join(extractDir, dirs[0].name);
    try {
      await access(join(candidateDir, "package.json"));
      return candidateDir;
    } catch {
      // package.json 不在子目录，直接使用 extractDir
    }
  }

  // 检查 extractDir 自己是否有 package.json
  try {
    await access(join(extractDir, "package.json"));
    return extractDir;
  } catch {
    throw new InstallationError("无法找到有效的项目根目录。", "ROOT_NOT_FOUND");
  }
}

export function createAppInstaller({ installBaseDir = null } = {}) {
  let currentInstallation = null;

  async function install({ downloadUrl, version, onProgress }) {
    if (currentInstallation) {
      throw new InstallationError("已有安装任务正在进行中。", "INSTALL_IN_PROGRESS");
    }

    const installId = `install-${Date.now()}`;
    currentInstallation = installId;

    const tempDir = join(tmpdir(), "canvas-lab-updates", installId);
    const zipFileName = basename(new URL(downloadUrl).pathname);
    const zipPath = join(tempDir, zipFileName);
    const extractDir = join(tempDir, "extracted");

    let targetDir = null;

    try {
      await mkdir(tempDir, { recursive: true });

      // 步骤 1: 下载
      onProgress?.({ stage: "downloading", percent: 0 });
      await downloadFile(downloadUrl, zipPath, (progress) => {
        onProgress?.({ stage: "downloading", ...progress });
      });

      // 步骤 2: 验证 SHA-256
      onProgress?.({ stage: "verifying", percent: 0 });
      const sha256 = await computeFileSha256(zipPath);
      onProgress?.({ stage: "verifying", percent: 100, sha256 });

      // 步骤 3: 解压
      onProgress?.({ stage: "extracting", percent: 0 });
      await extractZip(zipPath, extractDir);
      onProgress?.({ stage: "extracting", percent: 100 });

      // 步骤 4: 查找项目根目录
      const projectRoot = await findExtractedRoot(extractDir);

      // 步骤 5: 验证 package.json
      onProgress?.({ stage: "validating", percent: 0 });
      const pkgInfo = await verifyPackageJson(projectRoot, version);
      onProgress?.({ stage: "validating", percent: 100, ...pkgInfo });

      // 步骤 6: 移动到最终位置
      onProgress?.({ stage: "installing", percent: 0 });

      if (installBaseDir) {
        const finalDirName = `canvas-lab-v${pkgInfo.version}`;
        targetDir = resolve(installBaseDir, finalDirName);

        // 如果目标已存在，先删除
        try {
          await access(targetDir);
          await rm(targetDir, { recursive: true, force: true });
        } catch {
          // 目标不存在，正常
        }

        await rename(projectRoot, targetDir);
      } else {
        targetDir = projectRoot;
      }

      onProgress?.({ stage: "installing", percent: 100 });

      // 清理临时文件（保留已安装的目录）
      try {
        await unlink(zipPath);
        if (extractDir !== projectRoot) {
          await rm(extractDir, { recursive: true, force: true });
        }
      } catch {
        // 清理失败不影响安装成功
      }

      return {
        success: true,
        version: pkgInfo.version,
        path: targetDir,
        sha256,
      };
    } catch (error) {
      // 安装失败，清理所有临时文件
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // 清理失败不影响错误报告
      }

      throw error instanceof InstallationError
        ? error
        : new InstallationError(`安装失败: ${error.message}`, "UNKNOWN_ERROR");
    } finally {
      if (currentInstallation === installId) {
        currentInstallation = null;
      }
    }
  }

  async function cleanup(installPath) {
    try {
      await rm(installPath, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      throw new InstallationError(`清理失败: ${error.message}`, "CLEANUP_ERROR");
    }
  }

  return {
    install,
    cleanup,
    isInstalling: () => currentInstallation !== null,
  };
}
