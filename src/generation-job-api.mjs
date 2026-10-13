/**
 * [INPUT]: 依赖日常生成任务注册表、含效果图氛围转换/美化的统一 generation-service、飞书同步合同/扩图能力预检、JSON 读写函数与浏览器生成任务请求
 * [OUTPUT]: 对外提供任务入队和查询，在需归档生图前阻断 Schema 漂移，独立图片工具按所选引擎准入并跳过归档，区分 ComfyUI 与 API 编辑阶段
 * [POS]: src 的日常生图 HTTP 适配层，从 server.mjs 抽离以给 Beta跑图独立 API 留出根入口边界，并作为前台提交到飞书同步的后端准入门
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runGenerationJobBatch } from "./generation-jobs.mjs";
import { imageOutpaintEngineKey, publicImageOutpaintConfig } from "./image-outpaint-service.mjs";

const FEATURE_MODES = new Set([
  "effectEnhancement",
  "effectBeautification",
  "emptyRoom",
  "free",
  "imageUpscale",
  "imageOutpaint",
  "panoramaEnhancement",
  "refinedModel",
  "whiteModel",
]);

export function createGenerationJobApiHandler({
  generationJobs,
  generationService,
  getImageOutpaintConfig = async () => publicImageOutpaintConfig(),
  readJson,
  sendJson,
  verifySyncContract = async () => {},
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
    const localImageRequest = ["imageUpscale", "imageOutpaint"].includes(featureMode);
    const sharedInput = body.sharedInput && typeof body.sharedInput === "object" ? body.sharedInput : {};
    let imageStage = "comfyUi";
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
    if (featureMode === "imageOutpaint") {
      if (items.length !== 1) {
        sendJson(response, 400, { error: "AI 扩图每次只允许 1 个生成项" });
        return true;
      }
      let engineKey;
      try {
        engineKey = imageOutpaintEngineKey({ ...sharedInput, ...items[0].input });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return true;
      }
      const config = await getImageOutpaintConfig();
      const engine = config.engines?.find((entry) => entry.key === engineKey) || (engineKey === "comfyui" ? config : null);
      if (!engine?.available) {
        sendJson(response, 409, { error: engine?.reason || "扩图引擎未配置" });
        return true;
      }
      if (engineKey !== "comfyui") imageStage = "imageEdit";
    }
    if (!localImageRequest) {
      try {
        await verifySyncContract();
      } catch (error) {
        sendJson(response, 409, {
          error: `飞书同步合同未通过，已阻止生成：${String(error?.message || "Schema 不兼容")}`,
        });
        return true;
      }
    }
    const job = generationJobs.enqueue(
      jobId,
      {
        featureMode,
        stages: localImageRequest ? { [imageStage]: "submitting" } : null,
        total: items.length,
      },
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
            }, {
              onProgress(progress) {
                if (!localImageRequest) return;
                update({
                  message: progress.message,
                  stages: {
                    [imageStage]: progress.phase,
                    promptId: progress.promptId || null,
                  },
                });
              },
            });
          },
        }),
      }),
    );
    sendJson(response, 202, { job });
    return true;
  };
}
