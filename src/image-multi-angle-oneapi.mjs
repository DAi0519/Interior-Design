/**
 * [INPUT]: 依赖模型尺寸目录、镜头机位校验、图片读取、sharp与注入的OneAPI客户端
 * [OUTPUT]: 三方多角度候选与质量档位校验、自然语言机位指令及保留实际档位/费用/真实尺寸的长边2K结果
 * [POS]: src 的多角度三方适配层，与Qwen工作流并列，复用OneAPI请求封装
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { MODEL_CONFIGS, createGenerationRequest } from "./model-config.mjs";
import { loadImageBytes } from "./image-artifact.mjs";
import { normalizeCameraPose } from "./image-multi-angle-workflow.mjs";
import { MULTI_ANGLE_IMAGE_POLICY } from "./image-multi-angle-image.mjs";

export const MULTI_ANGLE_API_MODELS = ["banana21", "gptImage25Sunburst"].map(key => ({
  key, label: MODEL_CONFIGS[key].label, provider: "oneapi", id: MODEL_CONFIGS[key].id,
  qualityOptions: [...MODEL_CONFIGS[key].qualityOptions], defaultQuality: MODEL_CONFIGS[key].defaultQuality || null,
}));
const VERSION = "2026-10-20.oneapi.3";

export function resolveMultiAngleQuality(model, value) {
  const options = model.qualityOptions || [];
  if (!options.length && value === undefined) return null;
  const quality = value === undefined ? model.defaultQuality : value;
  if (!options.includes(quality)) {
    throw Object.assign(new Error(options.length
      ? `多角度质量档位只支持 ${options.join("、")}` : "当前多角度模型不支持质量档位"), { statusCode: 400 });
  }
  return quality;
}

export function multiAngleApiPrompt(input) {
  const { azimuth, elevation, distance } = normalizeCameraPose(input);
  const direction = azimuth <= 180 ? "right" : "left";
  const degrees = azimuth <= 180 ? azimuth : 360 - azimuth;
  const reverse = azimuth > 90 && azimuth < 270;
  const position = azimuth === 90 || azimuth === 270 ? `the ${direction} side of the scene` : `a ${direction} oblique view`;
  return [
    "Edit the supplied photograph into one photorealistic view of the SAME scene.",
    "Use the ORIGINAL CAMERA position as 0 degrees and the center of the scene as the orbit center. Angles are camera positions, not the front or back of an object.",
    ...(reverse ? [
      "Create a REVERSE-ANGLE COUNTER-SHOT, looking back toward where the original photograph was taken.",
      "Call the original camera A, scene center B, and the opposite camera position C. Physically move the camera from A past B to C; at 180 degrees its viewing direction is C toward B toward A, opposite to the original A toward B direction.",
      azimuth === 180 ? "Use exactly this opposite-side camera position."
        : `Use the opposite-side position as the 180-degree reference, then move ${Math.abs(azimuth - 180)} degrees ${azimuth > 180 ? "further clockwise" : "back counterclockwise"} around B for the requested ${azimuth}-degree position, still looking back toward the original camera side.`,
      "Reveal the part of the room that was behind the ORIGINAL camera. The original distant background should be behind or to the rear-side of the NEW camera, not remain the dominant wall directly ahead.",
      "If the input looks toward windows, relocate the camera near that window wall with its back toward the windows and photograph INTO the room toward the original shooting position. Keep those windows behind or to the rear-side of the new camera.",
      "Keep the room and furniture fixed in world space. Do not rotate the room, swap doors and windows, or horizontally mirror the input.",
    ] : [azimuth ? `Move the camera ${degrees} degrees to the ${direction} around the scene, to ${position}. Keep the lens aimed at the scene center.`
      : "Keep the original horizontal viewing direction."]),
    elevation > 0 ? `Raise the camera for a ${elevation}-degree downward view.`
      : elevation < 0 ? `Lower the camera for a ${-elevation}-degree upward view.` : "Use an eye-level view.",
    distance === 0 ? "Move closer for a close-up; the subject should occupy more of the frame."
      : distance === 100 ? "Move substantially farther away for a wide establishing view; make the subject smaller and reveal more surrounding space."
      : "Keep a standard framing and similar camera-to-subject distance.",
    "Preserve the identity, materials, lighting and relative spatial arrangement of furniture, walls, doors and windows. Infer unseen areas consistently with the visible scene.",
    "Produce a single photograph, without a camera icon, diagram, labels, collage or mirrored copy.",
  ].join(" ");
}

export async function executeOneApiMultiAngle({ model, pose, inferenceBytes, plan, quality: requestedQuality, prompt = multiAngleApiPrompt(pose) }, { imageClient, onProgress = () => {} }) {
  // -------- 复用模型目录的合法2K画幅；图片已在统一边界压到长边2048 --------
  const quality = resolveMultiAngleQuality(model, requestedQuality);
  const generation = createGenerationRequest({
    modelKey: model.key, prompt, resolution: "2K", outputFormat: "png",
    ...(quality ? { quality } : {}),
  }, { preferSourceAspect: true, sourceDimensions: { width: plan.inferenceWidth, height: plan.inferenceHeight } });
  const request = { ...generation.request, response_format: "b64_json",
    images: [{ image_url: `data:image/png;base64,${inferenceBytes.toString("base64")}` }] };
  const startedAt = Date.now();
  onProgress({ phase: "executing", message: `${model.label} 正在生成新的镜头视角` });
  const result = model.key === "gptImage25Sunburst"
    ? await imageClient.editImage(request) : await imageClient.generateImage(request);
  if (result.images?.length !== 1) throw new Error("多角度未返回唯一图片结果");
  const bytes = await loadImageBytes(result.images[0].url);
  const decoded = sharp(bytes, { limitInputPixels: MULTI_ANGLE_IMAGE_POLICY.maxInputPixels });
  const native = await decoded.metadata();
  // -------- 保留原生尺寸证据，交付图只缩小、不裁剪、不放大 --------
  const { data, info } = await decoded.rotate().resize({
    width: 2048, height: 2048, fit: "inside", withoutEnlargement: true,
  }).png().toBuffer({ resolveWithObject: true });
  const outputResized = Math.max(native.width, native.height) > 2048;
  return {
    durationMs: Date.now() - startedAt,
    images: [{ url: `data:image/png;base64,${data.toString("base64")}` }],
    request: { model: model.id, outputFormat: "png", referenceImageCount: 1, resolution: "2K-max",
      ...(quality ? { quality } : {}),
      size: `${info.width}x${info.height}`, syncMode: "local-only" },
    sync: { generationId: null, status: "skipped" },
    workflow: { key: model.key, label: model.label, version: VERSION },
    upstream: { created: result.created, outputFormat: "png", transport: result.transport,
      requestId: result.requestId, usageCost: result.usageCost || null,
      metadata: { provider: "oneapi", model: model.id, version: VERSION, pose,
        ...(quality ? { quality } : {}),
        sourceWidth: plan.sourceWidth, sourceHeight: plan.sourceHeight, inputResized: plan.inputResized,
        inputWidth: plan.inferenceWidth, inputHeight: plan.inferenceHeight,
        requestedSize: request.size, nativeOutputWidth: native.width, nativeOutputHeight: native.height,
        actualOutputWidth: info.width, actualOutputHeight: info.height, outputWidth: info.width, outputHeight: info.height,
        outputResized, outputResizeMethod: outputResized ? "lanczos3" : "none",
        outputSha256: createHash("sha256").update(data).digest("hex"), postUpscaled: false, exactCameraGeometry: false } },
  };
}
