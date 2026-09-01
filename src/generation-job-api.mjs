/**
 * [INPUT]: 依赖日常生成任务注册表、统一 generation-service、JSON 读写函数与浏览器生成任务请求
 * [OUTPUT]: 对外提供原 `/api/generation-jobs` 入队和查询处理器，保持 1–4 项、有界并发与 Prompt 强制刷新语义
 * [POS]: src 的日常生图 HTTP 适配层，从 server.mjs 抽离以给 Beta跑图独立 API 留出根入口边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runGenerationJobBatch } from "./generation-jobs.mjs";

const FEATURE_MODES = new Set([
  "effectEnhancement",
  "emptyRoom",
  "free",
  "refinedModel",
  "whiteModel",
]);

export function createGenerationJobApiHandler({
  generationJobs,
  generationService,
  readJson,
  sendJson,
}) {
  return async function handleGenerationJobApi(request, response, pathname) {
    if (request.method === "GET" && pathname.startsWith("/api/generation-jobs/")) {
      const jobId = decodeURIComponent(pathname.slice("/api/generation-jobs/".length));
      const job = generationJobs.get(jobId);
      sendJson(
        response,
        job ? 200 : 404,
        job ? { job } : { error: "生成任务不存在或已过期" },
      );
      return true;
    }
    if (request.method !== "POST" || pathname !== "/api/generation-jobs") {
      return false;
    }

    const body = await readJson(request);
    const featureMode = String(body.featureMode || "");
    const jobId = String(body.jobId || "");
    const items = Array.isArray(body.items) ? body.items : [];
    if (!/^generation-[A-Za-z0-9-]{12,80}$/.test(jobId)) {
      sendJson(response, 400, { error: "生成任务 ID 无效" });
      return true;
    }
    if (!FEATURE_MODES.has(featureMode)) {
      sendJson(response, 400, { error: "不支持的生成功能" });
      return true;
    }
    if (items.length < 1 || items.length > 4) {
      sendJson(response, 400, { error: "生成任务需要 1–4 个生成项" });
      return true;
    }
    const sharedInput = body.sharedInput && typeof body.sharedInput === "object"
      ? body.sharedInput
      : {};
    const job = generationJobs.enqueue(
      jobId,
      { featureMode, total: items.length },
      async (update) => ({
        outcomes: await runGenerationJobBatch({
          concurrency: body.forcePromptRegeneration ? 1 : 2,
          items,
          onProgress({ completed, total }) {
            update({ completed, message: `已完成 ${completed} / ${total} 张图` });
          },
          execute(item, index) {
            return generationService.executeForMode(featureMode, {
              ...sharedInput,
              ...(item.input || {}),
              batchCount: items.length,
              batchId: body.batchId || null,
              batchIndex: index + 1,
              forcePromptRegeneration:
                Boolean(body.forcePromptRegeneration) && index === 0,
            });
          },
        }),
      }),
    );
    sendJson(response, 202, { job });
    return true;
  };
}
