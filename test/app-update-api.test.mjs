/**
 * [INPUT]: 依赖 node:test/assert 与更新 HTTP 边界、可注入更新/安装/响应替身
 * [OUTPUT]: 对外提供正式回执绑定、非法请求、并发及安装进度终态的合同保障
 * [POS]: test 的更新 API 内存集成测试，不访问网络或安装真实文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createAppUpdateApiHandler } from "../src/app-update-api.mjs";

const input = {
  version: "0.1.11",
  downloadUrl: "https://github.com/DAi0519/Interior-Design/releases/download/v0.1.11/canvas-lab-v0.1.11.zip",
};

function setup({ update = { status: "available", latestVersion: input.version, downloadUrl: input.downloadUrl }, busy = false, error = null, installMode = "new-directory", restartRequired = false, recoveryRequired = false, hasActiveJobs = () => false, duringDownload = () => {} } = {}) {
  const checks = [];
  const installs = [];
  const response = {
    status: null, headers: null, body: "", writableEnded: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(chunk) { this.body += chunk; },
    end() { this.writableEnded = true; },
  };
  const handler = createAppUpdateApiHandler({
    appUpdates: { async check(options) { checks.push(options); return update; } },
    appInstaller: {
      isInstalling: () => busy,
      isRestartRequired: () => restartRequired,
      isRecoveryRequired: () => recoveryRequired,
      getPolicy: async () => ({ installMode, restartRequired, recoveryRequired, recoveryMessage: "请恢复备份目录后重启。" }),
      async install(options) {
        installs.push(options);
        options.onProgress({ stage: "downloading", percent: 50 });
        if (error) throw error;
        duringDownload();
        await options.beforeApply();
        return { success: true, version: options.version, path: "/test/new-version", sha256: "a".repeat(64) };
      },
    },
    hasActiveJobs,
    readJson: async (request) => request.body,
    sendJson(res, status, body) { res.writeHead(status, {}); res.write(JSON.stringify(body)); res.end(); },
  });
  return { handler, response, checks, installs };
}

test("更新 API 只接收对应方法与路径，手动检查强制刷新", async () => {
  const ctx = setup();
  assert.equal(await ctx.handler({ method: "GET", url: "/other" }, ctx.response, "/other"), false);
  await ctx.handler({ method: "GET", url: "/api/app-update?force=1" }, ctx.response, "/api/app-update");
  assert.equal(ctx.response.status, 200);
  assert.equal(JSON.parse(ctx.response.body).installMode, "new-directory");
  assert.deepEqual(ctx.checks, [{ force: true }]);
  assert.equal(ctx.installs.length, 0);
});

test("原地更新在下载前与替换前校验任务空闲，源码新目录安装独立", async () => {
  const busy = setup({ installMode: "in-place", hasActiveJobs: () => true });
  await busy.handler({ method: "POST", body: input }, busy.response, "/api/app-install");
  assert.equal(busy.response.status, 409);
  assert.equal(JSON.parse(busy.response.body).code, "APP_BUSY");
  assert.equal(busy.installs.length, 0);

  let taskStarted = false;
  const race = setup({ installMode: "in-place", hasActiveJobs: () => taskStarted, duringDownload: () => { taskStarted = true; } });
  await race.handler({ method: "POST", body: input }, race.response, "/api/app-install");
  const events = race.response.body.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.at(-1).code, "APP_BUSY");
  assert.ok(events.every((event) => event.stage !== "complete"));

  const source = setup({ hasActiveJobs: () => true });
  await source.handler({ method: "POST", body: input }, source.response, "/api/app-install");
  assert.equal(source.response.status, 200);
  assert.equal(source.installs.length, 1);
});

test("非法安装请求在查询与下载前拒绝", async () => {
  for (const body of [null, {}, { ...input, downloadUrl: "https://evil.test/package.zip" }, { ...input, version: "0.1.12" }]) {
    const ctx = setup();
    await ctx.handler({ method: "POST", body }, ctx.response, "/api/app-install");
    assert.equal(ctx.response.status, 400);
    assert.equal(ctx.checks.length, 0);
    assert.equal(ctx.installs.length, 0);
  }
});

test("安装必须匹配服务端最新正式版回执，不可检查与过期版本不能下载", async () => {
  for (const update of [
    { status: "current", latestVersion: input.version, downloadUrl: input.downloadUrl },
    { status: "available", latestVersion: "0.1.12", downloadUrl: input.downloadUrl },
    { status: "available", latestVersion: input.version, downloadUrl: "https://evil.test/package.zip" },
    { status: "unavailable", message: "无法检查更新" },
  ]) {
    const ctx = setup({ update });
    await ctx.handler({ method: "POST", body: input }, ctx.response, "/api/app-install");
    assert.equal(ctx.response.status, update.status === "unavailable" ? 503 : 409);
    assert.equal(JSON.parse(ctx.response.body).code, "UPDATE_NOT_AVAILABLE");
    assert.equal(ctx.installs.length, 0);
    assert.deepEqual(ctx.checks, [{ force: true }]);
  }
});

test("已有安装任务返回409且不再次查询或下载", async () => {
  const ctx = setup({ busy: true });
  await ctx.handler({ method: "POST", body: input }, ctx.response, "/api/app-install");
  assert.equal(ctx.response.status, 409);
  assert.equal(JSON.parse(ctx.response.body).code, "INSTALL_IN_PROGRESS");
  assert.equal(ctx.checks.length, 0);
  assert.equal(ctx.installs.length, 0);
});

test("已原地更新但尚未重启时不能重复安装", async () => {
  const ctx = setup({ installMode: "in-place", restartRequired: true });
  await ctx.handler({ method: "POST", body: input }, ctx.response, "/api/app-install");
  assert.equal(ctx.response.status, 409);
  assert.equal(JSON.parse(ctx.response.body).code, "RESTART_REQUIRED");
  assert.equal(ctx.checks.length, 0);
  assert.equal(ctx.installs.length, 0);
});

test("回滚未完成时拒绝再次安装并保留恢复指引", async () => {
  const ctx = setup({ installMode: "in-place", recoveryRequired: true });
  await ctx.handler({ method: "POST", body: input }, ctx.response, "/api/app-install");
  assert.equal(ctx.response.status, 409);
  assert.equal(JSON.parse(ctx.response.body).code, "ROLLBACK_FAILED");
  assert.match(JSON.parse(ctx.response.body).error, /恢复备份/);
  assert.equal(ctx.checks.length, 0);
  assert.equal(ctx.installs.length, 0);
});

test("安装成功发送NDJSON进度与路径，失败保留错误码且没有完成回执", async () => {
  for (const error of [null, Object.assign(new Error("摘要不一致"), { code: "CHECKSUM_MISMATCH" })]) {
    const ctx = setup({ error });
    await ctx.handler({ method: "POST", body: input }, ctx.response, "/api/app-install");
    assert.equal(ctx.response.status, 200);
    assert.match(ctx.response.headers["Content-Type"], /application\/x-ndjson/);
    assert.equal(ctx.response.writableEnded, true);
    const events = ctx.response.body.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events[0].stage, "downloading");
    if (error) {
      assert.equal(events.at(-1).stage, "error");
      assert.equal(events.at(-1).code, "CHECKSUM_MISMATCH");
      assert.ok(events.every((event) => event.stage !== "complete"));
    } else {
      assert.equal(events.at(-1).stage, "complete");
      assert.equal(events.at(-1).path, "/test/new-version");
    }
    assert.equal(ctx.installs[0].downloadUrl, input.downloadUrl);
  }
});
