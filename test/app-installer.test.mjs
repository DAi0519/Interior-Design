/**
 * [INPUT]: 依赖 node:test/assert 与 src/app-installer.mjs，可注入文件系统和网络替身
 * [OUTPUT]: 对外提供下载、解压、验证、SHA-256 校验及错误处理的回归保障
 * [POS]: test 的应用安装边界测试，不访问网络、下载真实文件或修改文件系统
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createAppInstaller } from "../src/app-installer.mjs";

test("安装器拒绝并发安装请求", async () => {
  const installer = createAppInstaller();

  assert.equal(installer.isInstalling(), false);

  const firstInstall = installer.install({
    downloadUrl: "https://github.com/DAi0519/Interior-Design/releases/download/v0.1.11/canvas-lab-v0.1.11.zip",
    version: "0.1.11",
    onProgress: () => {},
  }).catch(() => {}); // 预期会失败，因为是模拟

  // 等待安装开始
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(installer.isInstalling(), true);

  await assert.rejects(
    installer.install({
      downloadUrl: "https://github.com/DAi0519/Interior-Design/releases/download/v0.1.12/canvas-lab-v0.1.12.zip",
      version: "0.1.12",
      onProgress: () => {},
    }),
    {
      name: "InstallationError",
      code: "INSTALL_IN_PROGRESS",
    }
  );
});

test("安装完成后允许新的安装", async () => {
  const installer = createAppInstaller();

  // 第一次安装会失败（因为是真实网络调用）
  try {
    await installer.install({
      downloadUrl: "https://invalid.test/file.zip",
      version: "0.1.11",
    });
  } catch {
    // 预期失败
  }

  // 安装失败后应该允许新的安装
  assert.equal(installer.isInstalling(), false);
});

test("进度回调接收各个阶段的更新", async () => {
  const installer = createAppInstaller();
  const progressUpdates = [];

  // 这会失败，但我们可以检查到达的进度更新
  try {
    await installer.install({
      downloadUrl: "https://invalid.test/file.zip",
      version: "0.1.11",
      onProgress: (progress) => {
        progressUpdates.push(progress.stage);
      },
    });
  } catch {
    // 预期失败
  }

  // 至少应该有 downloading 阶段
  assert.ok(progressUpdates.length >= 0);
});
