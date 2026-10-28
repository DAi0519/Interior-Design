/**
 * [INPUT]: 依赖多角度尺寸/图片准备、机位与原生执行图、注入的ComfyUI/OneAPI客户端、权限目录及阶段回调
 * [OUTPUT]: 多角度脱敏能力/质量档位目录、单图与档位准入及原图/结果/实际英文指令及独立版本飞书归档，三模型逐项准入，输入/交付最高2K，保留真实尺寸及机位
 * [POS]: src 的多角度应用服务，被主工作台统一生成任务消费，复用飞书调度，不变更正式MaaS策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { prepareMultiAngleImage, MULTI_ANGLE_IMAGE_POLICY } from "./image-multi-angle-image.mjs";
import { normalizeCameraPose, cameraPosePrompt, createMultiAngleWorkflow, verifyMultiAngleCapabilities, MULTI_ANGLE } from "./image-multi-angle-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { planMultiAngleImage } from "../public/image-multi-angle-geometry.js";

import { MULTI_ANGLE_API_MODELS, executeOneApiMultiAngle, multiAngleApiPrompt, resolveMultiAngleQuality } from "./image-multi-angle-oneapi.mjs";

import { buildMultiAngleArchive } from "./image-multi-angle-archive.mjs";

const workflow = { key: "qwenMultiAngle", label: MULTI_ANGLE.label, version: MULTI_ANGLE.version, promptVersion: MULTI_ANGLE.promptVersion };
export function resolveMultiAngleModel(key = "qwenMultiAngle") {
  const model = [{ key: workflow.key, label: workflow.label, provider: "comfyui" }, ...MULTI_ANGLE_API_MODELS].find(model => model.key === key);
  if (!model) throw Object.assign(new Error("不支持的多角度模型"), { statusCode: 400 });
  return model;
}

export function validateMultiAngleInput(input) {
  resolveMultiAngleQuality(resolveMultiAngleModel(input.multiAngleModel), input.quality);
  const pose = normalizeCameraPose(input.cameraPose);
  const [source] = normalizeReferenceImages(input.referenceImages, {
    maxCount: 1, maxBytesPerImage: MULTI_ANGLE_IMAGE_POLICY.maxInputBytes,
  });
  if (!source) throw Object.assign(new Error("多角度需要1张原图"), { statusCode: 400 });
  planMultiAngleImage(source.width, source.height);
  return pose;
}

async function readQwenConfig(imageClient) {
  const config = { workflow, imagePolicy: MULTI_ANGLE_IMAGE_POLICY };
  try {
    if (!imageClient) throw new Error("多角度工作流未配置");
    const graph = createMultiAngleWorkflow({ artifactKey: "preflight", imageBase64: "", width: 864, height: 1184, seed: 1,
      generationRequest: { pose: { azimuth: 0, elevation: 0, distance: 50 } } });
    verifyMultiAngleCapabilities(graph, await imageClient.getObjectInfo([...new Set(Object.values(graph).map(node => node.class_type))]));
    return { ...config, available: true, reason: "" };
  } catch {
    return { ...config, available: false, reason: "多角度工作流不可用，请检查MaaS连接及模型配置后重试" };
  }
}

export async function readMultiAngleConfig(imageClient, { getOneApiModels = null } = {}) {
  const [qwen, api] = await Promise.all([readQwenConfig(imageClient), (async () => {
    try {
      const catalog = getOneApiModels ? await getOneApiModels() : [];
      return MULTI_ANGLE_API_MODELS.map(({ id, ...model }) => {
        const available = catalog.some(entry => (entry.id || entry.name) === id);
        return { ...model, available, reason: available ? "" : `当前 OneAPI Key 未开放 ${model.label}` };
      });
    } catch {
      return MULTI_ANGLE_API_MODELS.map(({ id, ...model }) => ({ ...model, available: false,
        reason: "OneAPI 未连接或模型权限读取失败，请检查连接后重试" }));
    }
  })()]);
  const models = [{ ...resolveMultiAngleModel(), available: qwen.available, reason: qwen.reason }, ...api];
  return { ...qwen, available: models.some(model => model.available), models, defaultModelKey: workflow.key };
}

function archiveResult(args, scheduleSync) {
  if (!scheduleSync) return args.result;
  const archive = buildMultiAngleArchive(args);
  return { ...args.result, request: archive.preview, sync: scheduleSync(archive) };
}

export async function executeImageMultiAngle(input, { imageClient, getOneApiModels = null, scheduleSync = null, onProgress = () => {} }) {
  const pose = validateMultiAngleInput(input);
  const model = resolveMultiAngleModel(input.multiAngleModel);
  if (model.provider === "oneapi") {
    const catalog = getOneApiModels ? await getOneApiModels() : [];
    if (!catalog.some(entry => (entry.id || entry.name) === model.id)) {
      throw Object.assign(new Error(`当前 OneAPI Key 未开放 ${model.label}`), { statusCode: 409 });
    }
    const prepared = await prepareMultiAngleImage(input.referenceImages[0]);
    const finalPrompt = multiAngleApiPrompt(pose);
    const result = await executeOneApiMultiAngle({ ...prepared, model, pose, quality: input.quality, prompt: finalPrompt }, { imageClient, onProgress });
    return archiveResult({ input, reference: prepared.reference, model, pose, finalPrompt, result }, scheduleSync);
  }
  const { reference, inferenceBytes, plan } = await prepareMultiAngleImage(input.referenceImages[0]);
  const config = await readQwenConfig(imageClient);
  if (!config.available) throw Object.assign(new Error(config.reason), { statusCode: 409 });
  onProgress({ phase: "submitting", message: "正在提交多角度任务" });
  const startedAt = Date.now();
  const finalPrompt = cameraPosePrompt(pose);
  const result = await imageClient.generateImage({
    pose, prompt: finalPrompt, imagePlan: plan, width: plan.inferenceWidth, height: plan.inferenceHeight, resolution: "2K-max",
    images: [{ image_url: `data:image/png;base64,${inferenceBytes.toString("base64")}` }],
  }, { queueTimeoutMs: 600_000, executionTimeoutMs: 600_000,
    onProgress: ({ phase, promptId }) => onProgress({ phase, promptId,
      message: phase === "executing" ? "MaaS 正在生成多角度图片" : "多角度任务已提交，MaaS排队中" }),
  });
  // -------- 镜头指令和模型路径只留服务端，公开实际产物和尺寸事实 --------
  const metadata = Object.fromEntries(["actualOutputWidth", "actualOutputHeight", "outputSha256", "promptId", "executionDurationMs", "queueDurationMs", "seed"]
    .map(key => [key, result.metadata?.[key]]));
  const output = {
    durationMs: Date.now() - startedAt, images: result.images,
    request: { outputFormat: result.outputFormat, referenceImageCount: 1, resolution: "2K-max",
      size: `${plan.outputWidth}x${plan.outputHeight}`, syncMode: "local-only" },
    sync: { generationId: null, status: "skipped" }, workflow,
    upstream: { created: result.created, outputFormat: result.outputFormat, transport: result.transport,
      metadata: { ...metadata, ...plan, pose, postUpscaled: false, version: MULTI_ANGLE.version } },
  };
  return archiveResult({ input, reference, model, pose, finalPrompt, result: output, executionMetadata: result.metadata }, scheduleSync);
}
