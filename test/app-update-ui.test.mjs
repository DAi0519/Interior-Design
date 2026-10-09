/**
 * [INPUT]: 依赖 node:test/assert、app-update.js 的视图/链接/检查控制器与可注入请求替身
 * [OUTPUT]: 对外提供新版提示、网络失败降级、受信下载链接、请求去重及手动重试的行为回归保障
 * [POS]: test 的共享版本更新交互测试，不访问 GitHub、下载或安装文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  createAppUpdateChecker,
  getAppUpdateView,
  getTrustedUpdateUrl,
} from "../public/app-update.js";
import { isReleaseFile } from "../scripts/release-files.mjs";

const releasesUrl = "https://github.com/DAi0519/Interior-Design/releases";
const available = {
  checkedAt: "2026-10-08T03:00:00.000Z",
  currentVersion: "0.1.10",
  downloadUrl: `${releasesUrl}/download/v0.1.11/canvas-lab-v0.1.11.zip`,
  latestVersion: "0.1.11",
  message: "发现新版本",
  releaseNotes: "增加更新检查。",
  releaseUrl: `${releasesUrl}/tag/v0.1.11`,
  status: "available",
};

test("新版映射保留当前版本、提示和标准运行包下载", () => {
  const view = getAppUpdateView(available);
  assert.equal(view.buttonLabel, "v0.1.10 · 有新版");
  assert.equal(view.statusLabel, "发现新版本");
  assert.equal(view.downloadUrl, available.downloadUrl);
  assert.equal(view.releaseNotes, available.releaseNotes);
  assert.equal(getAppUpdateView(available, { isChecking: true }).statusLabel, "正在检查更新…");
});

test("未完成检查和检查失败均不能显示已是最新", () => {
  for (const state of [{}, { status: "current" }, {
    status: "unavailable", currentVersion: "0.1.10", message: "更新服务暂时不可用",
  }]) {
    const view = getAppUpdateView(state);
    assert.equal(view.status, "unavailable");
    assert.equal(view.statusLabel, "暂时无法检查");
    assert.equal(view.downloadUrl, null);
    assert.equal(view.releaseUrl, releasesUrl);
  }
});

test("只接受固定仓库的正式版本链接和版本一致的 ZIP", () => {
  assert.equal(getTrustedUpdateUrl(`${releasesUrl}/latest`), `${releasesUrl}/latest`);
  assert.equal(getTrustedUpdateUrl(available.downloadUrl, "download"), available.downloadUrl);
  const buildUrl = `${releasesUrl}/download/v0.1.11%2Bbuild.1/canvas-lab-v0.1.11%2Bbuild.1.zip`;
  assert.equal(getTrustedUpdateUrl(buildUrl, "download"), buildUrl);
  for (const url of [
    "javascript:alert(1)",
    `http://github.com/DAi0519/Interior-Design/releases/latest`,
    "https://github.com.evil.test/DAi0519/Interior-Design/releases/latest",
    "https://github.com/another/repository/releases/latest",
    "https://user:secret@github.com/DAi0519/Interior-Design/releases/latest",
    `${releasesUrl}/latest?token=secret`,
    `${releasesUrl}/latest#unexpected`,
  ]) assert.equal(getTrustedUpdateUrl(url), null, url);
  for (const url of [
    `${releasesUrl}/download/v0.1.11/canvas-lab-v0.1.10.zip`,
    `${releasesUrl}/download/v0.1.11/install.exe`,
    `${releasesUrl}/download/v0.1.11/canvas-lab-v0.1.11.zip?token=secret`,
    `${releasesUrl}/download/v0.1.11/Source-code.zip`,
  ]) assert.equal(getTrustedUpdateUrl(url, "download"), null, url);
  const unsafe = getAppUpdateView({ ...available, downloadUrl: "https://evil.test/update.zip" });
  assert.equal(unsafe.downloadUrl, null);
});

test("自动检查与手动检查共享在途请求，手动重试带 force", async () => {
  const paths = [];
  const changes = [];
  let complete;
  const checker = createAppUpdateChecker({
    request: (pathname) => {
      paths.push(pathname);
      return new Promise((resolve) => { complete = resolve; });
    },
    onStateChange: (state, { isChecking }) => changes.push({ state, isChecking }),
  });
  const first = checker.check();
  const shared = checker.check(true);
  assert.equal(first, shared);
  await Promise.resolve();
  assert.deepEqual(paths, ["/api/app-update"]);
  complete(available);
  await first;
  assert.equal(checker.getState().status, "available");
  assert.equal(changes.at(-1).isChecking, false);
  const retry = checker.check(true);
  await Promise.resolve();
  assert.equal(paths.at(-1), "/api/app-update?force=1");
  complete({ ...available, status: "current" });
  await retry;
  assert.equal(checker.getState().status, "current");
});

test("网络失败清除旧下载状态，不暴露原始错误，随后可重试", async () => {
  let attempt = 0;
  const checker = createAppUpdateChecker({
    request: async () => {
      attempt += 1;
      if (attempt === 2) throw new Error("Authorization: secret-token");
      return available;
    },
  });
  await checker.check();
  const failed = await checker.check(true);
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.currentVersion, available.currentVersion);
  assert.equal(failed.downloadUrl, null);
  assert.equal(failed.latestVersion, null);
  assert.doesNotMatch(JSON.stringify(failed), /secret-token/);
  assert.equal((await checker.check(true)).status, "available");
});

test("同步异常与未知 API 状态不会锁死后续手动检查", async () => {
  let attempt = 0;
  const checker = createAppUpdateChecker({ request: () => {
    attempt += 1;
    if (attempt === 1) throw new Error("connection failed");
    if (attempt === 2) return { status: "unexpected" };
    return available;
  } });
  assert.equal((await checker.check()).status, "unavailable");
  assert.equal((await checker.check(true)).status, "unavailable");
  assert.equal((await checker.check(true)).status, "available");
  assert.equal(attempt, 3);
});

test("三个工作台接入同一更新模块，运行包包含其全部运行依赖", async () => {
  for (const page of ["index", "beta", "benchmark"]) {
    const html = await readFile(new URL(`../public/${page}.html`, import.meta.url), "utf8");
    assert.match(html, /data-app-update/);
    assert.match(html, /app-update\.js\?v=1/);
    assert.match(html, /app-update\.css\?v=1/);
  }
  for (const file of ["src/app-update.mjs", "public/app-update.js", "public/app-update.css"]) {
    assert.equal(isReleaseFile(file), true);
  }
});
