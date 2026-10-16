/**
 * [INPUT]: 依赖 Qwen Image Edit 2511/对应 Lightning 4步权重、原生扩边遮罩与采样/合成节点、单图 Base64、构图几何和请求级产物键
 * [OUTPUT]: 对外提供独立 Qwen 扩图身份、固定 Prompt 真源、公开尺寸合同、实时节点准入、执行图与可追溯产物元数据
 * [POS]: src 的 Qwen 扩图工作流真源，与 Flux Fill/Sunburst 并列，原图中心由遮罩合成保留
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const QWEN_OUTPAINT_ENGINE_KEY = "qwenImageEdit2511";
export const QWEN_OUTPAINT_WORKFLOW = Object.freeze({
  key: "image-outpaint-qwen",
  label: "Qwen Image Edit 2511",
  version: "2026-10-15.1",
  model: "qwen_image_edit_2511_fp8mixed.safetensors",
  clip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
  vae: "qwen_image_vae.safetensors",
  lora: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
  steps: 4, cfg: 1, shift: 3.1, feathering: 32,
  sampler: "euler", scheduler: "simple",
});

const SIDES = ["left", "top", "right", "bottom"];
const LIMITS = Object.freeze({
  minInputEdge: 32, maxInputEdge: 4096, inputAlignment: 1, sourceSizing: "original",
  outputAlignment: 16, maxEdge: 4096, maxPixels: 4096 * 4096, maxExpansion: 4096,
});
export const QWEN_OUTPAINT_PROMPT = "Extend the scene naturally into the blank gray canvas surrounding the original image. "
  + "Continue the existing architecture, surfaces, objects and background with coherent perspective, geometry, lighting, colors and texture. "
  + "Preserve the original composition, camera viewpoint, subject identity and visual style. "
  + "Create a seamless continuation across every original image boundary. Only fill the newly extended areas; do not add frames, text, watermarks or duplicate subjects.";

function inputError(message) { return Object.assign(new Error(message), { statusCode: 400 }); }

export function publicQwenOutpaintConfig({ available = false, reason = "Qwen 扩图客户端尚未配置" } = {}) {
  return {
    ...LIMITS, key: QWEN_OUTPAINT_ENGINE_KEY, label: QWEN_OUTPAINT_WORKFLOW.label,
    provider: "comfyui", available, reason: available ? null : reason,
    workflow: { key: QWEN_OUTPAINT_WORKFLOW.key, label: QWEN_OUTPAINT_WORKFLOW.label, version: QWEN_OUTPAINT_WORKFLOW.version },
  };
}

export function qwenOutpaintPreparedDimensions({ width, height } = {}) {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value >= LIMITS.minInputEdge && value <= LIMITS.maxInputEdge)) {
    throw inputError("Qwen 扩图原图宽高均需在 32–4096px 之间");
  }
  return { width, height };
}

export function assertQwenOutpaintTarget({ width, height } = {}) {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value >= 16 && value <= LIMITS.maxEdge && value % 16 === 0)) {
    throw inputError("Qwen 扩图目标宽高需为 16px 的整数倍，且不能超过 4096px");
  }
  return { width, height };
}

export function qwenOutpaintArtifactPrefix(artifactKey) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(artifactKey || ""))) throw new TypeError("Qwen 扩图产物键格式不正确");
  return `CanvasLab_QwenOutpaint_${artifactKey}`;
}

// -------- 仅新区域与内侧 32px 接缝带参与采样，最终按同一遮罩回贴 --------
export function createQwenOutpaintWorkflow({ artifactKey, generationRequest, imageBase64, seed, width, height }) {
  assertQwenOutpaintTarget({ width, height });
  const prefix = qwenOutpaintArtifactPrefix(artifactKey);
  if (!Number.isSafeInteger(seed) || seed < 0) throw inputError("Qwen 扩图随机种子无效");
  const expansion = generationRequest?.expansion;
  if (!SIDES.every((side) => Number.isSafeInteger(expansion?.[side]) && expansion[side] >= 0 && expansion[side] <= LIMITS.maxExpansion)
    || !SIDES.some((side) => expansion[side] > 0)) throw inputError("Qwen 扩图需要合法且非空的四边扩展");
  const source = qwenOutpaintPreparedDimensions({ width: generationRequest?.sourceWidth, height: generationRequest?.sourceHeight });
  if (source.width + expansion.left + expansion.right !== width || source.height + expansion.top + expansion.bottom !== height) {
    throw inputError("Qwen 扩图原图、扩边与输出画布尺寸不一致");
  }
  const settings = QWEN_OUTPAINT_WORKFLOW;
  const node = (class_type, inputs) => ({ class_type, inputs });
  return {
    input: node("easy loadImageBase64", { base64_data: imageBase64, image_output: "Hide", save_prefix: `CanvasLab_QwenInput_${artifactKey}` }),
    model: node("UNETLoader", { unet_name: settings.model, weight_dtype: "default" }),
    clip: node("CLIPLoader", { clip_name: settings.clip, type: "qwen_image", device: "default" }),
    vae: node("VAELoader", { vae_name: settings.vae }),
    shift: node("ModelSamplingAuraFlow", { model: ["model", 0], shift: settings.shift }),
    norm: node("CFGNorm", { model: ["shift", 0], strength: 1, pre_cfg: false }),
    lightning: node("LoraLoaderModelOnly", { model: ["norm", 0], lora_name: settings.lora, strength_model: 1 }),
    pad: node("ImagePadForOutpaint", { image: ["input", 0], ...Object.fromEntries(SIDES.map((side) => [side, expansion[side]])), feathering: settings.feathering }),
    positive: node("TextEncodeQwenImageEditPlus", { clip: ["clip", 0], vae: ["vae", 0], image1: ["pad", 0], prompt: QWEN_OUTPAINT_PROMPT }),
    negative: node("TextEncodeQwenImageEditPlus", { clip: ["clip", 0], vae: ["vae", 0], image1: ["pad", 0], prompt: "" }),
    encode: node("VAEEncode", { pixels: ["pad", 0], vae: ["vae", 0] }),
    mask: node("SetLatentNoiseMask", { samples: ["encode", 0], mask: ["pad", 1] }),
    sample: node("KSampler", {
      model: ["lightning", 0], positive: ["positive", 0], negative: ["negative", 0], latent_image: ["mask", 0],
      seed, steps: settings.steps, cfg: settings.cfg, sampler_name: settings.sampler, scheduler: settings.scheduler, denoise: 1,
    }),
    decode: node("VAEDecode", { samples: ["sample", 0], vae: ["vae", 0] }),
    composite: node("ImageCompositeMasked", { destination: ["pad", 0], source: ["decode", 0], x: 0, y: 0, resize_source: false, mask: ["pad", 1] }),
    output: node("SaveImage", { images: ["composite", 0], filename_prefix: prefix }),
  };
}

export const QWEN_OUTPAINT_REQUIRED_NODES = Object.freeze([
  "easy loadImageBase64", "UNETLoader", "CLIPLoader", "VAELoader", "ModelSamplingAuraFlow", "CFGNorm", "LoraLoaderModelOnly",
  "ImagePadForOutpaint", "TextEncodeQwenImageEditPlus", "VAEEncode", "SetLatentNoiseMask", "KSampler", "VAEDecode", "ImageCompositeMasked", "SaveImage",
]);

// -------- 逐节点核对必填、枚举与标量范围，准入失败不得提交 GPU --------
export function verifyQwenOutpaintCapabilities(objectInfo = {}) {
  const graph = createQwenOutpaintWorkflow({
    artifactKey: "capability-check", imageBase64: "", seed: 4, width: 512, height: 512,
    generationRequest: { sourceWidth: 480, sourceHeight: 480, expansion: { left: 16, right: 16, top: 16, bottom: 16 } },
  });
  for (const node of Object.values(graph)) {
    const schema = objectInfo[node.class_type]?.input;
    if (!schema) throw new Error(`缺少 Qwen 扩图节点：${node.class_type}`);
    for (const field of Object.keys(schema.required || {})) {
      if (!(field in node.inputs)) throw new Error(`Qwen 扩图节点接口不兼容：${node.class_type}.${field}`);
    }
    for (const [field, value] of Object.entries(node.inputs)) {
      const spec = schema.required?.[field] || schema.optional?.[field];
      if (!spec) throw new Error(`Qwen 扩图节点接口不兼容：${node.class_type}.${field}`);
      if (Array.isArray(value)) {
        const source = graph[value[0]];
        const outputType = source && objectInfo[source.class_type]?.output?.[value[1]];
        if (!outputType || outputType !== spec[0]) throw new Error(`Qwen 扩图节点连接不兼容：${node.class_type}.${field}`);
        continue;
      }
      if (Array.isArray(spec[0]) && !spec[0].includes(value)) throw new Error(`Qwen 扩图节点缺少配置项：${node.class_type}.${field} = ${value}`);
      if (typeof value === "number" && ((spec[1]?.min != null && value < spec[1].min) || (spec[1]?.max != null && value > spec[1].max))) {
        throw new Error(`Qwen 扩图节点参数超出范围：${node.class_type}.${field}`);
      }
    }
  }
}

export function qwenOutpaintWorkflowMetadata({
  actualOutputHeight, actualOutputWidth, artifactKey, executionDurationMs, generationRequest, height,
  outputFilename, outputSha256, promptId, queueDurationMs, seed, width,
}) {
  const settings = QWEN_OUTPAINT_WORKFLOW;
  return {
    artifactKey, engine: QWEN_OUTPAINT_ENGINE_KEY, executionDurationMs, expansion: { ...generationRequest?.expansion },
    inputHeight: generationRequest?.sourceHeight, inputWidth: generationRequest?.sourceWidth,
    model: settings.model, lora: settings.lora, weightDtype: "default", steps: settings.steps, cfg: settings.cfg,
    sampler: settings.sampler, scheduler: settings.scheduler, shift: settings.shift, feathering: settings.feathering,
    preservation: "original-center-masked-composite", outputFilename, outputHeight: actualOutputHeight, outputWidth: actualOutputWidth,
    outputSha256, promptId, queueDurationMs, seed, targetHeight: height, targetWidth: width,
    workflowId: settings.key, workflowVersion: settings.version,
  };
}

export const QWEN_OUTPAINT_CLIENT_OPTIONS = Object.freeze({
  artifactPrefix: qwenOutpaintArtifactPrefix, outputNodeId: "output",
  workflowFactory: createQwenOutpaintWorkflow, workflowMetadataFactory: qwenOutpaintWorkflowMetadata,
});
