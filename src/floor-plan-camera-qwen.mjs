/**
 * [INPUT]: 依赖共用 ComfyUI 客户端、已预检的 Qwen 2511 权重与节点合同、单张机位标注图和最终生成词
 * [OUTPUT]: 提供机位渲染的 Qwen 2511 固定 1K/16:9 合同、只读能力检查、原生 PNG 成品及任务回执
 * [POS]: src 的平面图机位专用 ComfyUI 执行适配器，复现楚雄单图试跑的空潜空间与 40 步采样
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { ComfyUiError, createComfyUiClient } from "./comfyui-client.mjs";
import { QWEN_MASK_FILL_WORKFLOW } from "./image-mask-fill-qwen.mjs";
import { verifyImageMaskFillGraphCapabilities } from "./image-mask-fill-workflow.mjs";

export const FLOOR_PLAN_CAMERA_QWEN = Object.freeze({
  key: "qwenImageEdit2511",
  id: "qwen-image-edit-2511",
  label: "Qwen Image Edit 2511",
  workflowVersion: "2026-11-22.floor-plan-camera.qwen2511.1",
  resolution: "1K",
  aspectRatio: "16:9",
  width: 1280,
  height: 720,
});

const QWEN_WEIGHTS = QWEN_MASK_FILL_WORKFLOW;
const SAMPLE = Object.freeze({
  steps: 40, cfg: 4, sampler_name: "euler", scheduler: "simple", denoise: 1,
});
const WORKFLOW_TIMEOUT_MS = 15 * 60 * 1000;
const UNAVAILABLE_REASON = "Qwen Image Edit 2511 的 ComfyUI 节点或权重暂不可用";

function artifactPrefix(key) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(key || ""))) throw new TypeError("Qwen 机位渲染产物键无效");
  return `CanvasLab_Qwen2511_FloorPlan_${key}`;
}

// --- 标注图仅作为编辑参考，输出由横向空潜空间直接生成 ---
function createWorkflow({ artifactKey, imageBase64, width, height, seed, prompt }) {
  const prefix = artifactPrefix(artifactKey);
  const node = (class_type, inputs) => ({ class_type, inputs });
  const condition = { clip: ["clip", 0], vae: ["vae", 0], image1: ["input", 0] };
  return {
    input: node("easy loadImageBase64", { base64_data: imageBase64, image_output: "Hide", save_prefix: prefix }),
    model: node("UNETLoader", { unet_name: QWEN_WEIGHTS.model, weight_dtype: "default" }),
    clip: node("CLIPLoader", { clip_name: QWEN_WEIGHTS.clip, type: "qwen_image", device: "default" }),
    vae: node("VAELoader", { vae_name: QWEN_WEIGHTS.vae }),
    shift: node("ModelSamplingAuraFlow", { model: ["model", 0], shift: 3.1, sampling: "flow" }),
    norm: node("CFGNorm", { model: ["shift", 0], strength: 1, pre_cfg: false }),
    positive: node("TextEncodeQwenImageEditPlus", { ...condition, prompt }),
    negative: node("TextEncodeQwenImageEditPlus", { ...condition, prompt: "" }),
    positiveMethod: node("FluxKontextMultiReferenceLatentMethod", {
      conditioning: ["positive", 0], reference_latents_method: "index_timestep_zero",
    }),
    negativeMethod: node("FluxKontextMultiReferenceLatentMethod", {
      conditioning: ["negative", 0], reference_latents_method: "index_timestep_zero",
    }),
    latent: node("EmptySD3LatentImage", { width, height, batch_size: 1 }),
    sample: node("KSampler", { model: ["norm", 0], positive: ["positiveMethod", 0], negative: ["negativeMethod", 0],
      latent_image: ["latent", 0], seed, ...SAMPLE }),
    decode: node("VAEDecode", { samples: ["sample", 0], vae: ["vae", 0] }),
    output: node("SaveImage", { images: ["decode", 0], filename_prefix: prefix }),
  };
}

const CAPABILITY_GRAPH = createWorkflow({
  ...FLOOR_PLAN_CAMERA_QWEN, artifactKey: "capability-check", imageBase64: "", seed: 1, prompt: "",
});
const REQUIRED_NODES = [...new Set(Object.values(CAPABILITY_GRAPH).map(node => node.class_type))];

function workflowMetadata({ generationRequest, historyOutputs, ...actual }) {
  return { ...actual, ...SAMPLE, workflowVersion: FLOOR_PLAN_CAMERA_QWEN.workflowVersion, referenceImageCount: 1 };
}

export function createFloorPlanCameraQwenClient(options = {}) {
  const client = createComfyUiClient({
    requestTimeoutMs: WORKFLOW_TIMEOUT_MS,
    ...options,
    artifactPrefix,
    outputNodeId: "output",
    referenceImageCount: 1,
    workflowFactory: createWorkflow,
    workflowMetadataFactory: workflowMetadata,
  });

  async function checkAvailability() {
    try {
      verifyImageMaskFillGraphCapabilities(await client.getObjectInfo(REQUIRED_NODES), CAPABILITY_GRAPH);
      return { available: true, reason: null };
    } catch {
      return { available: false, reason: UNAVAILABLE_REASON };
    }
  }

  return {
    checkAvailability,
    async generateImage({
      prompt, images,
      width = FLOOR_PLAN_CAMERA_QWEN.width, height = FLOOR_PLAN_CAMERA_QWEN.height,
      resolution = FLOOR_PLAN_CAMERA_QWEN.resolution,
    }, options = {}) {
      if (width !== FLOOR_PLAN_CAMERA_QWEN.width || height !== FLOOR_PLAN_CAMERA_QWEN.height
        || resolution !== FLOOR_PLAN_CAMERA_QWEN.resolution) {
        throw new ComfyUiError("Qwen 机位渲染只支持 1K / 16:9（1280×720）", 400, "qwen_size");
      }
      if (typeof prompt !== "string" || !prompt.trim()) {
        throw new ComfyUiError("Qwen 机位渲染需要生成提示词", 400, "qwen_prompt");
      }
      if (!Array.isArray(images) || images.length !== 1) {
        throw new ComfyUiError("Qwen 机位渲染需要一张机位标注图", 400, "reference_count");
      }
      options.signal?.throwIfAborted();
      const availability = await checkAvailability();
      if (!availability.available) throw new ComfyUiError(availability.reason, 409, "qwen_capability");

      const result = await client.generateImage({
        prompt, images, width, height, resolution, negative_prompt_mode: "disabled-fixed-prompt",
      }, options);
      const { promptId, actualOutputWidth, actualOutputHeight } = result.metadata;
      if (result.outputFormat !== "png" || actualOutputWidth !== width || actualOutputHeight !== height) {
        throw new ComfyUiError("Qwen 机位渲染成品须为 1280×720 PNG", 502, "output_dimensions", { promptId });
      }
      return { ...result, requestId: promptId };
    },
  };
}
