/**
 * [INPUT]: 依赖 image-multi-angle-image 的尺寸计划，接收机位、压缩输入/Base64、产物键与MaaS节点目录
 * [OUTPUT]: 三档景别及以原机位为参照的后半圈反打指令、长边不超过2048直接推理的Qwen图与真实元数据
 * [POS]: src 的共享多角度工作流，由主工作台服务与独立试跑服务消费，尚未发布正式 MaaS 策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { planMultiAngleImage } from "./image-multi-angle-image.mjs";

export const MULTI_ANGLE = Object.freeze({
  label: "Qwen 多角度",
  model: "qwen_image_edit/Qwen-Image-Edit-2509_fp8_e4m3fn.safetensors",
  clip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
  vae: "qwen_image_vae.safetensors",
  cameraLora: "Qwen_Edit_Lens_Transformation.safetensors",
  lightningLora: "Qwen-Image-Lightning-8steps-V1.1.safetensors",
  outputNodeId: "18",
  version: "2026-10-20.preview.6",
});

export function normalizeCameraPose(pose) {
  const ranges = { azimuth: [0, 360], elevation: [-30, 60], distance: [0, 100] };
  return Object.fromEntries(Object.entries(ranges).map(([key, [min, max]]) => {
    const value = pose?.[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw Object.assign(new Error(`机位 ${key} 必须为 ${min}–${max} 的整数`), { statusCode: 400 });
    }
    if (key === "distance" && ![0, 50, 100].includes(value)) {
      throw Object.assign(new Error("景别请选择特写、标准或远景，请刷新旧版页面"), { statusCode: 400 });
    }
    return [key, key === "azimuth" ? value % 360 : value];
  }));
}

export function cameraPosePrompt(input) {
  const { azimuth, elevation, distance } = normalizeCameraPose(input);
  const parts = [];
  // -------- 远景先约束取景结果，避免仅改变广角透视而没有明显拉远 --------
  if (distance === 100) parts.push(
    "将镜头向后移动，明显拉远，拍摄整个场景的远景",
    "让主体在画面中明显变小，完整展示主体及更大范围的周围环境，增加前景与两侧的可见空间",
  );
  if (azimuth) parts.push(`将镜头向${azimuth <= 180 ? "右" : "左"}旋转${azimuth <= 180 ? azimuth : 360 - azimuth}度`);
  // -------- 后半圈明确改变观察位置，避免“旋转”被理解为原地转镜或翻图 --------
  if (azimuth > 90 && azimuth < 270) {
    const side = azimuth === 180 ? "正后方" : azimuth < 180 ? "右后方" : "左后方";
    parts.push(
      `拍摄反打镜头：以场景中心为基准，从原拍摄点绕到场景另一侧的${side}反打机位，朝原摄影机所在的一侧回拍`,
      azimuth === 180 ? "原机位为A，场景中心为B，新机位为C；摄影机从A越过B移动到另一侧C，镜头按C到B到A的方向拍摄，视线与原图相反"
        : `新机位相对于180度反打位向${azimuth > 180 ? "右" : "左"}偏转${Math.abs(azimuth - 180)}度，保持向原拍摄点一侧回看`,
      "展示原摄影机身后的空间；原图远处的背景应落到新摄影机身后或侧后方，不要仍把原背景拍在正前方",
      "如果原图朝窗户拍摄，新机位应移到窗边、背靠窗户向室内拍摄，让窗户处于新机位身后或侧后方",
      "只改变摄影机位置，不旋转房间和家具，不交换门窗位置，不做原图水平镜像",
    );
    if (elevation === 0) parts.push("保持平视，不要改为俯拍或仰拍");
    if (distance === 50) parts.push("保持标准景别");
  }
  if (elevation > 0) parts.push(`将镜头转为俯视，俯视角度${elevation}度`);
  if (elevation < 0) parts.push(`将镜头转为仰视，仰视角度${-elevation}度`);
  if (distance === 0) parts.push("将镜头转为特写镜头");
  if (distance === 100) parts.push("保持同一场景中原有物体的外观与相对位置");
  return `${parts.length ? parts.join("。") : "保持原图正面视角与景别"}。`;
}

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
