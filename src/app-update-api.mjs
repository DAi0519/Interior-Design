/**
 * [INPUT]: 依赖应用更新检查、安装策略/控制器、业务任务忙碌状态与请求 JSON/响应适配器
 * [OUTPUT]: 对外提供 createAppUpdateApiHandler，处理更新查询及正式版本安装进度流
 * [POS]: src 的更新 HTTP 边界，以服务端最新正式版回执绑定安装请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { validateAppInstallRequest } from "./app-installer.mjs";

export function createAppUpdateApiHandler({ appUpdates, appInstaller, readJson, sendJson, hasActiveJobs = () => false }) {
  return async function handleAppUpdateApi(request, response, pathname) {
    if (request.method === "GET" && pathname === "/api/app-update") {
      const force = new URL(request.url, "http://127.0.0.1").searchParams.get("force") === "1";
      sendJson(response, 200, { ...await appUpdates.check({ force }), ...await appInstaller.getPolicy() });
      return true;
    }
    if (request.method !== "POST" || pathname !== "/api/app-install") return false;

    let input;
    try {
      input = validateAppInstallRequest(await readJson(request));
    } catch (error) {
      sendJson(response, 400, { error: error.message, code: error.code || "INVALID_INSTALL_REQUEST" });
      return true;
    }
    if (appInstaller.isInstalling()) {
      sendJson(response, 409, { error: "已有安装任务正在进行中。", code: "INSTALL_IN_PROGRESS" });
      return true;
    }
    if (appInstaller.isRecoveryRequired()) {
      const policy = await appInstaller.getPolicy();
      sendJson(response, 409, { error: policy.recoveryMessage, code: "ROLLBACK_FAILED" });
      return true;
    }
    if (appInstaller.isRestartRequired()) {
      sendJson(response, 409, { error: "更新已安装，请重启启动脚本后再操作。", code: "RESTART_REQUIRED" });
      return true;
    }
    const { installMode } = await appInstaller.getPolicy();
    const assertIdle = () => {
      if (installMode === "in-place" && hasActiveJobs()) {
        throw Object.assign(new Error("请等待生成、评测和飞书同步完成后再安装更新。"), { code: "APP_BUSY" });
      }
    };
    try { assertIdle(); }
    catch (error) {
      sendJson(response, 409, { error: error.message, code: error.code });
      return true;
    }
    const update = await appUpdates.check({ force: true });
    if (update.status !== "available" || update.latestVersion !== input.version
      || update.downloadUrl !== input.downloadUrl) {
      sendJson(response, update.status === "unavailable" ? 503 : 409, {
        error: update.status === "unavailable" ? update.message : "安装版本已变化，请重新检查更新。",
        code: "UPDATE_NOT_AVAILABLE",
      });
      return true;
    }

    response.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    });
    const writeProgress = (progress) => {
      if (!response.destroyed && !response.writableEnded) response.write(`${JSON.stringify(progress)}\n`);
    };
    try {
      const result = await appInstaller.install({
        downloadUrl: input.downloadUrl,
        version: input.version,
        onProgress: writeProgress,
        beforeApply: assertIdle,
      });
      writeProgress({ stage: "complete", ...result });
    } catch (error) {
      writeProgress({ stage: "error", error: error.message, code: error.code || "UNKNOWN_ERROR" });
    } finally {
      if (!response.destroyed && !response.writableEnded) response.end();
    }
    return true;
  };
}
