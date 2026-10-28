/**
 * [INPUT]: 依赖精模旧模块及光影来源/双图/版本SHA准备、GPT打光/多光源准入、生成服务、任务注册表、模型目录、Schema与JSON读写
 * [OUTPUT]: 对外提供精模必选光影/历史参数准入、基础编码/版本/SHA及规则/卡片/参考图冻结与批次去重、打光正文冻结和任务入队/查询
 * [POS]: src 的日常生图 HTTP 适配层，从 server.mjs 抽离以给 Beta跑图独立 API 留出根入口边界，并作为前台提交到飞书同步的后端准入门
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { validateMultiAngleInput, resolveMultiAngleModel } from "./image-multi-angle-service.mjs";
import { validateMaskFillInput } from "./image-mask-fill-service.mjs";
import { validateRelightInput } from "./image-relight-service.mjs";
import { RELIGHT_MODEL_KEY } from "../public/image-relight-geometry.js";
import { runGenerationJobBatch } from "./generation-jobs.mjs";
import { imageOutpaintEngineKey, publicImageOutpaintConfig } from "./image-outpaint-service.mjs";
import { resolveImageOutpaintModel } from "./image-outpaint-workflow.mjs";
import { ONEAPI_OUTPAINT_ENGINE_KEY } from "./image-outpaint-oneapi.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { assertOutpaintResolution } from "../public/image-outpaint-geometry.js";
import { prepareRefinedRenderInput } from "./refined-render-prompt.mjs";
import { assertRefinedLightingAdmission, hasRefinedLightingInput, prepareRefinedLightingInput, refinedLightingFreezeKey } from "./refined-lighting.mjs";

const FEATURE_MODES = new Set([
  "effectEnhancement",
  "effectBeautification",
  "emptyRoom",
  "free",
  "imageUpscale",
  "imageMaskFill",
  "imageRelight",
  "imageMultiAngle",
  "imageOutpaint",
  "panoramaEnhancement",
  "refinedModel",
  "styleTransfer",
  "whiteModel",
]);

export function createGenerationJobApiHandler({
  generationJobs,
  generationService,
  getImageMultiAngleConfig = null,
  getImageMaskFillConfig = null,
  getImageRelightConfig = null,
  prepareImageRelightPrompt = null,
  prepareRefinedInput = prepareRefinedRenderInput,
  prepareRefinedLighting = prepareRefinedLightingInput,
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
    const localImageRequest = ["imageUpscale", "imageOutpaint", "imageMultiAngle", "imageMaskFill", "imageRelight"].includes(featureMode);
    const sharedInput = body.sharedInput && typeof body.sharedInput === "object" ? body.sharedInput : {};
    let imageStage = "comfyUi";
    const jobId = String(body.jobId || "");
    const items = Array.isArray(body.items) ? body.items : [];
    let relightPromptSnapshot = null;
    if (!/^generation-[A-Za-z0-9-]{12,80}$/.test(jobId)) {
      sendJson(response, 400, { error: "生成任务 ID 无效" });
      return true;
    }
    if (!FEATURE_MODES.has(featureMode)) {
      sendJson(response, 400, { error: "不支持的生成功能" });
      return true;
    }
    if (items.length < 1) {
      sendJson(response, 400, { error: "生成任务至少需要 1 个生成项" });
      return true;
    }
    if (!localImageRequest) {
      const modelCounts = new Map();
      for (const item of items) {
        const modelKey = String(item?.input?.modelKey ?? sharedInput.modelKey ?? "");
        if (!Object.hasOwn(MODEL_CONFIGS, modelKey)) {
          sendJson(response, 400, { error: "生成任务包含不支持的出图模型" });
          return true;
        }
        modelCounts.set(modelKey, (modelCounts.get(modelKey) || 0) + 1);
      }
      if (modelCounts.size === 1 && items.length > 4) {
        sendJson(response, 400, { error: "单模型生成张数需要在 1–4 张之间" });
        return true;
      }
      if (modelCounts.size > 1 && modelCounts.size !== items.length) {
        sendJson(response, 400, { error: "多模型生成时每个模型只允许 1 个生成项" });
        return true;
      }
    }
    if (featureMode === "imageUpscale" && items.length > 4) {
      sendJson(response, 400, { error: "图片超分每次只允许 1–4 个生成项" });
      return true;
    }
    if (featureMode === "imageRelight") {
      if (items.length !== 1) { sendJson(response, 400, { error: "打光每次只允许1个生成项" }); return true; }
      try {
        const validated = await validateRelightInput({ ...sharedInput, ...items[0].input });
        const readConfig = getImageRelightConfig || generationService.getImageRelightConfig;
        if (!readConfig) throw Object.assign(new Error("打光客户端尚未配置"), { statusCode: 409 });
        const config = await readConfig();
        if (!config.available) throw Object.assign(new Error(config.reason || "GPT 打光模型不可用"), { statusCode: 409 });
        const preparePrompt = prepareImageRelightPrompt || generationService.prepareImageRelightPrompt;
        if (!preparePrompt) throw Object.assign(new Error("打光Prompt读取尚未配置"), { statusCode: 409 });
        relightPromptSnapshot = structuredClone(await preparePrompt({ ...sharedInput, ...items[0].input }));
        items[0] = { key: RELIGHT_MODEL_KEY, label: "GPT · 打光", provider: "oneapi", input: {
          ...items[0].input, modelKey: RELIGHT_MODEL_KEY, lights: validated.lights, originalLights: structuredClone(validated.originalLights),
          templateKey: validated.templateKey, blendMode: validated.blendMode, prompt: validated.prompt,
          outputResolution: validated.outputResolution, quality: validated.quality,
          relightPromptVersion: relightPromptSnapshot.version, relightPromptSha256: relightPromptSnapshot.sha256,
        } };
        imageStage = "imageEdit";
      } catch (error) { sendJson(response, error.statusCode || 400, { error: error.message }); return true; }
    }
    if (featureMode === "imageMaskFill") {
      if (items.length !== 1) { sendJson(response, 400, { error: "遮罩填充每次只允许1个生成项" }); return true; }
      try {
        const input = { ...sharedInput, ...items[0].input };
        const validated = await validateMaskFillInput(input);
        const readConfig = getImageMaskFillConfig || generationService.getImageMaskFillConfig;
        if (!readConfig) throw Object.assign(new Error("遮罩填充客户端尚未配置"), { statusCode: 409 });
        const config = await readConfig();
        const model = config.models?.find(entry => entry.key === validated.modelKey);
        const candidate = (model?.modes || (validated.modelKey === "flux2Klein" ? config.modes : []))?.find((entry) => entry.key === validated.mode);
        if (!candidate?.available) throw Object.assign(new Error(candidate?.reason || "所选遮罩填充模式不可用"), { statusCode: 409 });
        items[0] = { key: validated.modelKey === "flux2Klein" ? validated.mode : `${validated.modelKey}-${validated.mode}`, label: candidate.label, provider: validated.provider, input: {
          ...items[0].input, maskFillModel: validated.modelKey, maskFillMode: validated.mode, prompt: validated.prompt,
          inferenceTier: validated.inferenceTier, maskExpand: validated.maskExpand,
          ...(validated.fillReferencePurpose ? { fillReferencePurpose: validated.fillReferencePurpose } : {}),
          ...(validated.provider === "oneapi" ? { outputResolution: validated.outputResolution, quality: validated.quality, editRegion: validated.editRegion } : {}),
        } };
        if (validated.provider === "oneapi") imageStage = "imageEdit";
      } catch (error) { sendJson(response, error.statusCode || 400, { error: error.message }); return true; }
    }
    if (featureMode === "imageMultiAngle") {
      if (items.length !== 1) { sendJson(response, 400, { error: "多角度每次只允许1个生成项" }); return true; }
      const input = { ...sharedInput, ...items[0].input };
      validateMultiAngleInput(input);
      const model = resolveMultiAngleModel(input.multiAngleModel);
      if (getImageMultiAngleConfig) {
        const config = await getImageMultiAngleConfig();
        const candidate = config.models.find(entry => entry.key === model.key);
        if (!candidate?.available) { sendJson(response, 409, { error: candidate?.reason || "所选多角度模型不可用" }); return true; }
      }
      items[0] = { key: model.key, label: model.label, provider: model.provider,
        input: { ...items[0].input, multiAngleModel: model.key } };
      if (model.provider === "oneapi") imageStage = "imageEdit";
    }
    if (featureMode === "imageOutpaint") {
      if (items.length !== 1) {
        sendJson(response, 400, { error: "AI 扩图每次只允许 1 个生成项" });
        return true;
      }
      let engineKey;
      const outpaintInput = { ...sharedInput, ...items[0].input };
      try {
        assertOutpaintResolution(outpaintInput.resolution);
        assertOutpaintResolution(outpaintInput.outpaintCanvas?.resolution);
        engineKey = imageOutpaintEngineKey(outpaintInput);
        if (engineKey === "comfyui" && outpaintInput.outpaintModel !== undefined) resolveImageOutpaintModel(outpaintInput.outpaintModel);
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
      if (engineKey === "comfyui") {
        let model;
        try {
          model = resolveImageOutpaintModel(outpaintInput.outpaintModel === undefined ? engine.defaultModelKey : outpaintInput.outpaintModel);
        } catch (error) {
          sendJson(response, 400, { error: error.message });
          return true;
        }
        const candidate = engine.models?.find((entry) => entry.key === model.key);
        if (!candidate?.available) {
          sendJson(response, 409, { error: candidate?.reason || "所选扩图模型暂不可用" });
          return true;
        }
        items[0] = { ...items[0], input: { ...items[0].input, outpaintModel: model.key } };
      }
      // -------- 兼容尚未携带 Provider 的旧 Sunburst 目录，Qwen 始终走 ComfyUI --------
      const provider = engine.provider || (engineKey === ONEAPI_OUTPAINT_ENGINE_KEY ? "oneapi" : "comfyui");
      if (provider === "oneapi") imageStage = "imageEdit";
    }
    if (featureMode === "refinedModel") {
      try {
        const frozenConfigurations = new Map();
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const input = { ...sharedInput, ...item.input };
          assertRefinedLightingAdmission(input);
          const key = JSON.stringify([
            input.promptCode, input.promptVersion, input.refinedPromptSha256,
            input.refinedRender, input.refinedAtmospherePromptVersion,
            input.refinedAtmospherePromptSha256,
            refinedLightingFreezeKey(input),
          ]);
          if (!frozenConfigurations.has(key)) {
            const lightingPrepared = await prepareRefinedLighting(input);
            const prepared = await prepareRefinedInput(lightingPrepared);
            frozenConfigurations.set(key, {
              promptCode: prepared.promptCode,
              promptVersion: prepared.promptVersion,
              refinedPromptSha256: prepared.refinedPromptSha256,
              refinedRender: prepared.refinedRender,
              refinedAtmospherePromptVersion: prepared.refinedAtmospherePromptVersion,
              refinedAtmospherePromptSha256: prepared.refinedAtmospherePromptSha256,
              ...(hasRefinedLightingInput(prepared) ? { refinedLighting: prepared.refinedLighting,
                lightingReferenceImages: lightingPrepared.lightingReferenceImages } : {}),
            });
          }
          items[index] = { ...item, input: { ...item.input, ...structuredClone(frozenConfigurations.get(key)) } };
        }
      } catch (error) {
        sendJson(response, error.statusCode || 409, { error: error.message });
        return true;
      }
    }
    if (featureMode !== "imageUpscale") {
      try {
        if (featureMode === "imageRelight") await verifySyncContract(undefined, { scope: "imageRelight" });
        else if (featureMode === "imageMaskFill") await verifySyncContract(undefined, { scope: "imageMaskFill" });
        else await verifySyncContract();
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
              ...(featureMode === "imageRelight" ? { relightPromptSnapshot } : {}),
              onProgress(progress) {
                if (!localImageRequest) return;
                update({
                  message: progress.message,
                  stages: {
                    [imageStage]: progress.phase,
                    promptId: progress.promptId || null,
                    ...(progress.upstreamResponseId ? {
                      upstreamResponseId: progress.upstreamResponseId,
                      upstreamStatus: progress.upstreamStatus,
                    } : {}),
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
