/**
 * [INPUT]: 依赖现有空房设计工作流、模型请求真源、图片字节与参考图校验，接收旧房主图、空房参数及注入的客户端/归档/阶段回调
 * [OUTPUT]: 对外提供旧房包装准入与先清空后设计编排，移除全部家电（含壁挂/嵌入式）而保留硬装和固定柜体；保留原图/中间图、两阶段实际 Prompt/产物指纹及关联归档，第二步失败仍保留清空产物，不自动重试收费请求
 * [POS]: src 的旧房改造应用编排层，以 emptyRoom + roomRenovation 显式包装复用空房 Agent，不扩展 Beta 或飞书功能枚举
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomUUID } from "node:crypto";

import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { fitImageDataUrlForRequest, loadImageBytes } from "./image-artifact.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { executeWhiteModelWorkflow } from "./white-model-workflow.mjs";

export const ROOM_CLEARANCE_PROMPT_VERSION = "room-clearance-2026-10-21.2";
export const ROOM_CLEARANCE_PROMPT = [
  "Empty the photographed existing room as a preparation step for a new interior design.",
  "Remove all movable furniture, all appliances and electronics, decorations, textiles, plants and loose clutter, including their reflections and cast shadows. Appliances must be removed whether freestanding, wall-mounted, ceiling-mounted or built into cabinetry, including wall-mounted air conditioners, televisions, refrigerators, washing machines and kitchen appliances. Being fixed or built-in never exempts an appliance from removal.",
  "Preserve the existing architectural shell: walls, ceiling, floor, columns, beams, stairs, doors, windows and all openings in exactly their original positions, proportions and perspective. Preserve fixed built-in cabinetry and non-appliance architectural components such as railings and door frames; preserve the surrounding cabinetry when removing an integrated appliance. These preservation rules do not apply to any appliance or electronics.",
  "Keep the original camera position, viewing direction, focal length, framing and image aspect ratio. Do not extend the room, crop the photograph, add openings or redesign the finishes.",
  "Reconstruct only the existing surfaces revealed by removed objects, including wall or ceiling areas behind mounted appliances, continuing the adjacent existing finishes and physically plausible lighting. Do not invent a new layout behind occlusions.",
  "Return one realistic photograph of the empty room. Do not add new furniture, people, text, diagrams or watermarks.",
].join("\n");

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function validateRoomRenovationInput(input, featureMode = input.featureMode) {
  if (input.roomRenovation === undefined || input.roomRenovation === false) return false;
  if (input.roomRenovation !== true) throw inputError("旧房改造标记必须是布尔值");
  if (featureMode !== "emptyRoom") throw inputError("旧房改造只能包装空房设计");
  const sources = normalizeReferenceImages(input.referenceImages, { maxCount: 1 });
  if (sources.length !== 1) throw inputError("旧房改造需要且只允许 1 张旧房照片");
  if (!sources[0].width || !sources[0].height) throw inputError("无法读取旧房照片的真实尺寸");
  return true;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function imageSnapshot(image) {
  return { url: image.imageUrl, width: image.width, height: image.height };
}

export async function executeRoomRenovationWorkflow(input, options) {
  validateRoomRenovationInput(input, "emptyRoom");
  normalizeGenerationBatch(input);
  const { imageClient, scheduleSync = null, onProgress = () => {}, ...designOptions } = options;
  if (!imageClient) throw new TypeError("旧房改造需要图像客户端");
  const original = normalizeReferenceImages(input.referenceImages, { maxCount: 1 })[0];
  const pipelineId = randomUUID();
  const startedAt = Date.now();
  const roomRenovation = { pipelineId, promptVersion: ROOM_CLEARANCE_PROMPT_VERSION,
    originalImage: imageSnapshot(original), clearedImage: null, clearanceSync: null };
  let phase = "validation";
  let clearanceMetadata = null;

  try {
    const result = await executeWhiteModelWorkflow({ ...input, featureMode: "emptyRoom" }, {
      ...designOptions, imageClient,
      async prepareSourceImage(source) {
        phase = "clearing";
        onProgress({ phase, message: "旧房改造 1/2 · 正在清空家具与杂物" });
        const generation = createGenerationRequest({ ...input, featureMode: "emptyRoom",
          prompt: ROOM_CLEARANCE_PROMPT, ratioMode: "auto" }, { preferSourceAspect: true });
        const clearanceStartedAt = Date.now();
        const cleared = await imageClient.generateImage(generation.request);
        if (cleared.images?.length !== 1 || !cleared.images[0]?.url) {
          throw new Error("清空模型没有返回唯一图片");
        }
        const bytes = await loadImageBytes(cleared.images[0].url);
        const dimensions = readImageDimensions(bytes);
        if (!dimensions) throw new Error("无法读取清空结果的真实图片尺寸");
        const mimeType = ["image/png", "image/jpeg", "image/webp"].find(type => readImageDimensions(bytes, type));
        const format = mimeType.split("/")[1];
        const clearedUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
        const durationMs = Date.now() - clearanceStartedAt;
        roomRenovation.clearedImage = { url: clearedUrl, width: dimensions.width, height: dimensions.height };
        clearanceMetadata = { pipelineId, stage: "clearance", promptVersion: ROOM_CLEARANCE_PROMPT_VERSION,
          originalSha256: sha256(Buffer.from(source.imageUrl.split(",")[1], "base64")),
          clearedSha256: sha256(bytes), clearedSize: `${dimensions.width}x${dimensions.height}`,
          durationMs, modelKey: input.modelKey };
        const preview = { ...generation.preview, provider: generation.provider,
          quality: cleared.quality ?? generation.preview.quality, transport: cleared.transport };
        roomRenovation.clearanceSync = scheduleSync ? scheduleSync({ durationMs,
          finalPrompt: ROOM_CLEARANCE_PROMPT, sourcePrompt: String(input.prompt || "").trim(),
          modelLabel: publicModelCatalog().find(model => model.key === input.modelKey).label,
          preview, referenceImages: [source], resultImage: { ...cleared.images[0], url: clearedUrl },
          workflow: { ...normalizeGenerationBatch(input), ...(generation.workflowMetadata || {}),
            ...(cleared.metadata || {}), feature: "empty-room-design", roomType: input.roomType,
            roomRenovation: clearanceMetadata },
        }) : { generationId: null, status: "skipped" };
        phase = "designing";
        onProgress({ phase, message: "旧房改造 2/2 · 正在基于清空房间重新设计" });
        // -------- 下一步只接收清空产物；大图沿用请求压缩，原产物独立保留 --------
        const dataUrl = await fitImageDataUrlForRequest(clearedUrl);
        clearanceMetadata.designSourceSha256 = sha256(Buffer.from(dataUrl.split(",")[1], "base64"));
        return [{ dataUrl, name: `room-clearance-${pipelineId}.${dataUrl.startsWith("data:image/jpeg") ? "jpg" : format}` }];
      },
      scheduleSync: scheduleSync ? archive => scheduleSync({ ...archive,
        workflow: { ...archive.workflow, roomRenovation: { ...clearanceMetadata, stage: "design",
          clearanceGenerationId: roomRenovation.clearanceSync?.generationId || null } },
      }) : null,
    });
    phase = "completed";
    onProgress({ phase, message: "旧房改造 · 清空与设计均已完成" });
    return { ...result, durationMs: Date.now() - startedAt, roomRenovation };
  } catch (error) {
    error.roomRenovation = { ...roomRenovation, failedStage: phase };
    const label = phase === "validation" ? "前置校验" : phase === "clearing" ? "第 1/2 步（清空）" : "第 2/2 步（设计）";
    error.message = `旧房改造${label}失败：${error.message}`;
    onProgress({ phase: "failed", message: error.message });
    throw error;
  }
}
