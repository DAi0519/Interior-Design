/**
 * [INPUT]: 依赖共享英文镜头指令/版本与 image-multi-angle-image 的尺寸计划，接收机位、压缩输入/Base64、产物键与MaaS节点目录
 * [OUTPUT]: 复用统一英文镜头语义与机位校验、长边不超过2048直接推理的Qwen图与真实元数据
 * [POS]: src 的共享多角度工作流，由主工作台服务与独立试跑服务消费，尚未发布正式 MaaS 策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { multiAnglePrompt, normalizeCameraPose, MULTI_ANGLE_PROMPT_VERSION } from "./image-multi-angle-prompt.mjs";
import { planMultiAngleImage } from "./image-multi-angle-image.mjs";

export { normalizeCameraPose };
export const cameraPosePrompt = multiAnglePrompt;

export const MULTI_ANGLE = Object.freeze({
  label: "Qwen 多角度",
  model: "qwen_image_edit/Qwen-Image-Edit-2509_fp8_e4m3fn.safetensors",
  clip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
  vae: "qwen_image_vae.safetensors",
  cameraLora: "Qwen_Edit_Lens_Transformation.safetensors",
  lightningLora: "Qwen-Image-Lightning-8steps-V1.1.safetensors",
  outputNodeId: "18",
  version: "2026-10-26.preview.7",
  promptVersion: MULTI_ANGLE_PROMPT_VERSION,
});

export const multiAngleArtifactPrefix = (key) => `canvas_lab_multi_angle_${key}`;

export function createMultiAngleWorkflow({ artifactKey, imageBase64, width, height, seed, generationRequest }) {
  const prompt = generationRequest.prompt || cameraPosePrompt(generationRequest.pose);
  const imagePlan = generationRequest.imagePlan || planMultiAngleImage(width, height);
  if (width !== imagePlan.inferenceWidth || height !== imagePlan.inferenceHeight) throw new Error("推理尺寸必须与压缩输入计划一致");
  const node = (class_type, inputs) => ({ class_type, inputs });
  const scale = Math.sqrt(384 * 384 / (width * height));
  return {
    "1": node("easy loadImageBase64", { base64_data: imageBase64, image_output: "Hide", save_prefix: "multi-angle-input" }),
    "2": node("UNETLoader", { unet_name: MULTI_ANGLE.model, weight_dtype: "default" }),
    "3": node("CLIPLoader", { clip_name: MULTI_ANGLE.clip, type: "qwen_image", device: "default" }),
    "4": node("VAELoader", { vae_name: MULTI_ANGLE.vae }),
    "5": node("LoraLoaderModelOnly", { model: ["2", 0], lora_name: MULTI_ANGLE.cameraLora, strength_model: 1 }),
    "6": node("LoraLoaderModelOnly", { model: ["5", 0], lora_name: MULTI_ANGLE.lightningLora, strength_model: 1 }),
    "7": node("ModelSamplingAuraFlow", { model: ["6", 0], shift: 3, sampling: "flow" }),
    "8": node("CFGNorm", { model: ["7", 0], strength: 1, pre_cfg: false }),
    "9": node("ImageScale", { image: ["1", 0], upscale_method: "lanczos", width, height, crop: "disabled" }),
    // -------- 文本参考约 384²，VAE 参考保持采样尺寸，避免原生 Plus 自动改为 1024² --------
    "10": node("ImageScale", { image: ["1", 0], upscale_method: "lanczos", width: Math.round(width * scale), height: Math.round(height * scale), crop: "disabled" }),
    "11": node("VAEEncode", { pixels: ["9", 0], vae: ["4", 0] }),
    "12": node("TextEncodeQwenImageEditPlus", { clip: ["3", 0], prompt, image1: ["10", 0] }),
    "13": node("TextEncodeQwenImageEditPlus", { clip: ["3", 0], prompt: "", image1: ["10", 0] }),
    "14": node("ReferenceLatent", { conditioning: ["12", 0], latent: ["11", 0] }),
    "15": node("ReferenceLatent", { conditioning: ["13", 0], latent: ["11", 0] }),
    "16": node("KSampler", { model: ["8", 0], positive: ["14", 0], negative: ["15", 0], latent_image: ["11", 0], seed, steps: 8, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1 }),
    "17": node("VAEDecode", { samples: ["16", 0], vae: ["4", 0] }),
    "18": node("SaveImage", { images: ["17", 0], filename_prefix: multiAngleArtifactPrefix(artifactKey) }),
  };
}

export function verifyMultiAngleCapabilities(graph, catalog) {
  for (const item of Object.values(graph)) {
    const schema = catalog[item.class_type];
    if (!schema) throw new Error(`MaaS 缺少节点：${item.class_type}`);
    const fields = { ...schema.input?.required, ...schema.input?.optional };
    for (const name of Object.keys(schema.input?.required || {})) {
      if (!(name in item.inputs)) throw new Error(`节点缺少必填输入：${item.class_type}.${name}`);
    }
    for (const [key, value] of Object.entries(item.inputs)) {
      const spec = fields[key];
      if (!spec) throw new Error(`节点输入不可用：${item.class_type}.${key}`);
      if (Array.isArray(value)) {
        const source = graph[value[0]];
        const output = catalog[source?.class_type]?.output?.[value[1]];
        if (!output || (spec[0] !== "*" && output !== spec[0])) throw new Error(`节点连线类型不匹配：${item.class_type}.${key}`);
      } else {
        const options = Array.isArray(spec[0]) ? spec[0] : spec[0] === "COMBO" ? spec[1]?.options : null;
        if (options && !options.includes(value)) throw new Error(`模型或枚举不可用：${item.class_type}.${key}=${value}`);
      }
    }
  }
}

export function multiAngleMetadata(args) {
  const { historyOutputs, generationRequest, ...actual } = args;
  const imagePlan = generationRequest.imagePlan || planMultiAngleImage(args.width, args.height);
  if (args.actualOutputWidth !== imagePlan.outputWidth || args.actualOutputHeight !== imagePlan.outputHeight) throw new Error("MaaS 结果尺寸与本次2K输出计划不一致");
  return { ...actual, ...MULTI_ANGLE, ...imagePlan, postUpscaled: false, pose: generationRequest.pose, prompt: generationRequest.prompt || cameraPosePrompt(generationRequest.pose), steps: 8, cfg: 1, sampler: "euler", scheduler: "simple", denoise: 1, shift: 3, environment: "MaaS prodtest ComfyUI", exactCameraGeometry: false };
}
