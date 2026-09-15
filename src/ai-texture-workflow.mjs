/**
 * [INPUT]: 依赖 Flux2 Klein 节点、默认 9B FP8/7 steps 与 1K/2K 推理尺寸、全景原图结构参考与接缝修复配置、可选攸行 SeedVR2 3B、外部正负 Prompt、参考图 Base64、运行时种子与请求产物键
 * [OUTPUT]: 对外提供普通 Flux 生成，以及全景整图增强→平移后带原图弱参考的窄带生成式修复→复位后无 Prompt 超分并重铺接缝带的单 Prompt 三阶段工作流、唯一产物前缀和可归档阶段元数据
 * [POS]: src 的 Flux ComfyUI 工作流定义，以共享模型、窄接缝 Mask、轻羽化、无 Prompt 超分旁路和单一最终 SaveImage 串联生成阶段，不负责网络提交、轮询或图片下载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
  createSeedVrUpscaleStage,
} from "./image-upscale-workflow.mjs";

export const AI_TEXTURE_WORKFLOW = Object.freeze({
  id: "ai-texture-enhancement",
  label: "Flux2 Klein",
  model: "flux-2-klein-9b-fp8.safetensors",
  outputNodeId: "72",
  version: "2026-09-15.1",
});

export const AI_TEXTURE_DEFAULTS = Object.freeze({
  model: AI_TEXTURE_WORKFLOW.model,
  steps: 7,
});

export const PANORAMA_SEAM_BAND_RATIO = 0.04;
export const PANORAMA_SEAM_FEATHER_RATIO = 0.015;
export const PANORAMA_SEAM_REFERENCE_STRENGTH = 0.65;

const PANORAMA_SEAM_CONTINUITY_PROMPT =
  "The masked center strip is the wrapped seam of one continuous 360-degree interior space. Reconstruct only this narrow strip so walls, ceiling, floor, furniture edges, materials, illumination, exposure and color temperature continue seamlessly across its center. Do not create a vertical boundary, split lighting, duplicated objects or geometric displacement.";

export const AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT =
  "(alter material colors:1.2), (change material types:1.2), matte materials converted to glossy finishes, CG plastic feel, unreasonable light sources, exaggerated light intensity, add non-existent objects and structures, color distortion or unwanted color shifts, localized blown-out highlights, pitch-black shadows with no details, extra noise or artifacts, altered original structural models or proportions";

export function resolveAiTextureNegativePrompt(userPrompt) {
  const custom = String(userPrompt || "").trim();
  if (custom.length > 8000) {
    const error = new TypeError("Flux2 Klein 负向提示词不能超过 8000 字符");
    error.statusCode = 400;
    throw error;
  }
  return {
    mode: custom ? "custom" : "default",
    text: custom || AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT,
  };
}

function positivePrompt(userPrompt) {
  return String(userPrompt || "").trim();
}

export function aiTextureArtifactPrefix(artifactKey) {
  const key = String(artifactKey || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new TypeError("Flux2 Klein 产物键格式不正确");
  }
  return `CanvasLab_Flux2Klein_${key}`;
}

function addCircularShiftStage(nodes, {
  height,
  nodePrefix,
  sourceImage,
  width,
}) {
  const shift = Math.floor(width / 2);
  const canvasId = `${nodePrefix}-Canvas`;
  const rightCropId = `${nodePrefix}-Right-Crop`;
  const leftCropId = `${nodePrefix}-Left-Crop`;
  const rightCompositeId = `${nodePrefix}-Right-Composite`;
  Object.assign(nodes, {
    [canvasId]: {
      class_type: "EmptyImage",
      inputs: { batch_size: 1, color: 0, height, width },
    },
    [rightCropId]: {
      class_type: "ImageCrop",
      inputs: {
        height,
        image: sourceImage,
        width: width - shift,
        x: shift,
        y: 0,
      },
    },
    [leftCropId]: {
      class_type: "ImageCrop",
      inputs: { height, image: sourceImage, width: shift, x: 0, y: 0 },
    },
    [rightCompositeId]: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: [canvasId, 0],
        resize_source: false,
        source: [rightCropId, 0],
        x: 0,
        y: 0,
      },
    },
    [nodePrefix]: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: [rightCompositeId, 0],
        resize_source: false,
        source: [leftCropId, 0],
        x: width - shift,
        y: 0,
      },
    },
  });
  return [nodePrefix, 0];
}

function addPanoramaSeamRepairStage(nodes, {
  enhancedImage,
  height,
  originalImage,
  repairPrompt,
  seed,
  width,
}) {
  if (!String(repairPrompt || "").trim()) {
    throw new TypeError("全景接缝修复 Prompt 不能为空");
  }
  const enhancedShiftedImage = addCircularShiftStage(nodes, {
    height,
    nodePrefix: "Panorama-Enhanced-Shifted",
    sourceImage: enhancedImage,
    width,
  });
  const originalShiftedImage = addCircularShiftStage(nodes, {
    height,
    nodePrefix: "Panorama-Original-Shifted",
    sourceImage: originalImage,
    width,
  });
  const bandWidth = Math.max(16, Math.round(width * PANORAMA_SEAM_BAND_RATIO));
  const bandX = Math.floor((width - bandWidth) / 2);
  const featherWidth = Math.max(
    1,
    Math.min(
      Math.round(width * PANORAMA_SEAM_FEATHER_RATIO),
      Math.floor(bandWidth / 2),
    ),
  );
  Object.assign(nodes, {
    "Panorama-Repair-Prompt": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["CLIPLoader-002794d3ba7c17c4f83b82f42961d3d8", 0],
        text: `${String(repairPrompt).trim()}\n\n${PANORAMA_SEAM_CONTINUITY_PROMPT}`,
      },
    },
    "Panorama-Repair-Enhanced-VAEEncode": {
      class_type: "VAEEncode",
      inputs: {
        pixels: enhancedShiftedImage,
        vae: ["VAELoader-07611aba2b9b3055246a421194564b96", 0],
      },
    },
    "Panorama-Repair-Original-VAEEncode": {
      class_type: "VAEEncode",
      inputs: {
        pixels: originalShiftedImage,
        vae: ["VAELoader-07611aba2b9b3055246a421194564b96", 0],
      },
    },
    "Panorama-Repair-Negative-Original": {
      class_type: "ReferenceLatent",
      inputs: {
        conditioning: ["CLIPTextEncode-a5eb6fed8b48761592bb34a3f51a1e24", 0],
        latent: ["Panorama-Repair-Original-VAEEncode", 0],
      },
    },
    "Panorama-Repair-Positive-Original": {
      class_type: "ReferenceLatent",
      inputs: {
        conditioning: ["Panorama-Repair-Prompt", 0],
        latent: ["Panorama-Repair-Original-VAEEncode", 0],
      },
    },
    "Panorama-Repair-Negative-Area": {
      class_type: "ConditioningSetAreaPercentage",
      inputs: {
        conditioning: ["Panorama-Repair-Negative-Original", 0],
        height: 1,
        strength: PANORAMA_SEAM_REFERENCE_STRENGTH,
        width: PANORAMA_SEAM_BAND_RATIO,
        x: bandX / width,
        y: 0,
      },
    },
    "Panorama-Repair-Positive-Area": {
      class_type: "ConditioningSetAreaPercentage",
      inputs: {
        conditioning: ["Panorama-Repair-Positive-Original", 0],
        height: 1,
        strength: PANORAMA_SEAM_REFERENCE_STRENGTH,
        width: PANORAMA_SEAM_BAND_RATIO,
        x: bandX / width,
        y: 0,
      },
    },
    "Panorama-Repair-Mask-Canvas": {
      class_type: "SolidMask",
      inputs: { height, value: 0, width },
    },
    "Panorama-Repair-Mask-Band": {
      class_type: "SolidMask",
      inputs: { height, value: 1, width: bandWidth },
    },
    "Panorama-Repair-Mask-Feather": {
      class_type: "FeatherMask",
      inputs: {
        bottom: 0,
        left: featherWidth,
        mask: ["Panorama-Repair-Mask-Band", 0],
        right: featherWidth,
        top: 0,
      },
    },
    "Panorama-Repair-Noise-Mask": {
      class_type: "MaskComposite",
      inputs: {
        destination: ["Panorama-Repair-Mask-Canvas", 0],
        operation: "add",
        source: ["Panorama-Repair-Mask-Feather", 0],
        x: bandX,
        y: 0,
      },
    },
    "Panorama-Repair-Latent": {
      class_type: "SetLatentNoiseMask",
      inputs: {
        mask: ["Panorama-Repair-Noise-Mask", 0],
        samples: ["Panorama-Repair-Enhanced-VAEEncode", 0],
      },
    },
    "Panorama-Repair-Scheduler": {
      class_type: "Flux2Scheduler",
      inputs: { height, steps: AI_TEXTURE_DEFAULTS.steps, width },
    },
    "Panorama-Repair-Noise": {
      class_type: "RandomNoise",
      inputs: { noise_seed: Number(seed) + 1 },
    },
    "Panorama-Repair-Guider": {
      class_type: "CFGGuider",
      inputs: {
        cfg: 1,
        model: ["UNETLoader-268b01374c2e0d44c2854c95c42a0a6e", 0],
        negative: ["Panorama-Repair-Negative-Area", 0],
        positive: ["Panorama-Repair-Positive-Area", 0],
      },
    },
    "Panorama-Repair-Sampler": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        guider: ["Panorama-Repair-Guider", 0],
        latent_image: ["Panorama-Repair-Latent", 0],
        noise: ["Panorama-Repair-Noise", 0],
        sampler: ["KSamplerSelect-ea15f99cba5b444c6edd8a1509542292", 0],
        sigmas: ["Panorama-Repair-Scheduler", 0],
      },
    },
    "Panorama-Repair-Decode": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["Panorama-Repair-Sampler", 0],
        vae: ["VAELoader-07611aba2b9b3055246a421194564b96", 0],
      },
    },
    "Panorama-Repair-Resize": {
      class_type: "ImageResize+",
      inputs: {
        condition: "always",
        height,
        image: ["Panorama-Repair-Decode", 0],
        interpolation: "lanczos",
        method: "stretch",
        multiple_of: 0,
        width,
      },
    },
    "Panorama-Repair-Band": {
      class_type: "ImageCrop",
      inputs: {
        height,
        image: ["Panorama-Repair-Resize", 0],
        width: bandWidth,
        x: bandX,
        y: 0,
      },
    },
    "Panorama-Repair-Mask": {
      class_type: "SolidMask",
      inputs: { height, value: 1, width: bandWidth },
    },
    "Panorama-Repair-Feather": {
      class_type: "FeatherMask",
      inputs: {
        bottom: 0,
        left: featherWidth,
        mask: ["Panorama-Repair-Mask", 0],
        right: featherWidth,
        top: 0,
      },
    },
    "Panorama-Repair-Composite": {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: enhancedShiftedImage,
        mask: ["Panorama-Repair-Feather", 0],
        resize_source: false,
        source: ["Panorama-Repair-Band", 0],
        x: bandX,
        y: 0,
      },
    },
  });
  return {
    bandWidth,
    featherWidth,
    output: ["Panorama-Repair-Composite", 0],
  };
}

function addPanoramaRestoreStage(nodes, { height, sourceImage, width }) {
  const inverseShift = width - Math.floor(width / 2);
  Object.assign(nodes, {
    "Panorama-Restore-Canvas": {
      class_type: "EmptyImage",
      inputs: { batch_size: 1, color: 0, height, width },
    },
    "Panorama-Restore-Right-Crop": {
      class_type: "ImageCrop",
      inputs: {
        height,
        image: sourceImage,
        width: width - inverseShift,
        x: inverseShift,
        y: 0,
      },
    },
    "Panorama-Restore-Left-Crop": {
      class_type: "ImageCrop",
      inputs: {
        height,
        image: sourceImage,
        width: inverseShift,
        x: 0,
        y: 0,
      },
    },
    "Panorama-Restore-Right-Composite": {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: ["Panorama-Restore-Canvas", 0],
        resize_source: false,
        source: ["Panorama-Restore-Right-Crop", 0],
        x: 0,
        y: 0,
      },
    },
    "Panorama-Restored": {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: ["Panorama-Restore-Right-Composite", 0],
        resize_source: false,
        source: ["Panorama-Restore-Left-Crop", 0],
        x: width - inverseShift,
        y: 0,
      },
    },
  });
  return ["Panorama-Restored", 0];
}

function addFinalPanoramaSeamPatchStage(nodes, {
  baseImage,
  height,
  repairedShiftedImage,
  sourceHeight,
  sourceWidth,
  width,
}) {
  const sourceBandWidth = Math.max(
    16,
    Math.round(sourceWidth * PANORAMA_SEAM_BAND_RATIO),
  );
  const sourceBandX = Math.floor((sourceWidth - sourceBandWidth) / 2);
  const targetBandWidth = Math.max(16, Math.round(width * PANORAMA_SEAM_BAND_RATIO));
  const rightEdgeWidth = Math.floor(targetBandWidth / 2);
  const leftEdgeWidth = targetBandWidth - rightEdgeWidth;
  const featherWidth = Math.max(
    1,
    Math.min(
      Math.round(width * PANORAMA_SEAM_FEATHER_RATIO),
      Math.min(leftEdgeWidth, rightEdgeWidth),
    ),
  );
  Object.assign(nodes, {
    "Panorama-Final-Seam-Source": {
      class_type: "ImageCrop",
      inputs: {
        height: sourceHeight,
        image: repairedShiftedImage,
        width: sourceBandWidth,
        x: sourceBandX,
        y: 0,
      },
    },
    "Panorama-Final-Seam-Upscaled": {
      class_type: "ImageResize+",
      inputs: {
        condition: "always",
        height,
        image: ["Panorama-Final-Seam-Source", 0],
        interpolation: "lanczos",
        method: "stretch",
        multiple_of: 0,
        width: targetBandWidth,
      },
    },
    "Panorama-Final-Left-Edge": {
      class_type: "ImageCrop",
      inputs: {
        height,
        image: ["Panorama-Final-Seam-Upscaled", 0],
        width: leftEdgeWidth,
        x: rightEdgeWidth,
        y: 0,
      },
    },
    "Panorama-Final-Right-Edge": {
      class_type: "ImageCrop",
      inputs: {
        height,
        image: ["Panorama-Final-Seam-Upscaled", 0],
        width: rightEdgeWidth,
        x: 0,
        y: 0,
      },
    },
    "Panorama-Final-Left-Mask": {
      class_type: "SolidMask",
      inputs: { height, value: 1, width: leftEdgeWidth },
    },
    "Panorama-Final-Left-Feather": {
      class_type: "FeatherMask",
      inputs: {
        bottom: 0,
        left: 0,
        mask: ["Panorama-Final-Left-Mask", 0],
        right: featherWidth,
        top: 0,
      },
    },
    "Panorama-Final-Right-Mask": {
      class_type: "SolidMask",
      inputs: { height, value: 1, width: rightEdgeWidth },
    },
    "Panorama-Final-Right-Feather": {
      class_type: "FeatherMask",
      inputs: {
        bottom: 0,
        left: featherWidth,
        mask: ["Panorama-Final-Right-Mask", 0],
        right: 0,
        top: 0,
      },
    },
    "Panorama-Final-Left-Composite": {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: baseImage,
        mask: ["Panorama-Final-Left-Feather", 0],
        resize_source: false,
        source: ["Panorama-Final-Left-Edge", 0],
        x: 0,
        y: 0,
      },
    },
    "Panorama-Final-Seam-Composite": {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: ["Panorama-Final-Left-Composite", 0],
        mask: ["Panorama-Final-Right-Feather", 0],
        resize_source: false,
        source: ["Panorama-Final-Right-Edge", 0],
        x: width - rightEdgeWidth,
        y: 0,
      },
    },
  });
  return ["Panorama-Final-Seam-Composite", 0];
}

export function createAiTextureWorkflow({
  artifactKey,
  generationRequest,
  height = 2048,
  imageBase64,
  negativePrompt,
  prompt,
  seed,
  width = 2048,
}) {
  if (![width, height].every((value) => Number.isInteger(value) && value >= 16)) {
    throw new TypeError("Flux2 Klein 工作流尺寸不正确");
  }
  const resolvedNegativePrompt = resolveAiTextureNegativePrompt(negativePrompt);
  const artifactPrefix = aiTextureArtifactPrefix(artifactKey);
  const nodes = {
    "71": {
      class_type: "easy loadImageBase64",
      inputs: {
        base64_data: imageBase64,
        image_output: "Hide",
        save_prefix: `CanvasLab_Input_${artifactKey}`,
      },
    },
    "72": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: artifactPrefix,
        images: ["ImageResize+-6348ae83bed7de73d2de60a62eb38a93", 0],
      },
    },
    "CFGGuider-5a1e6727e4373225bc38746ef9d6e19e": {
      class_type: "CFGGuider",
      inputs: {
        cfg: 1,
        model: ["UNETLoader-268b01374c2e0d44c2854c95c42a0a6e", 0],
        negative: ["ReferenceLatent-95e27bbc3e3c05717782d7ef1003175d", 0],
        positive: ["ReferenceLatent-ce99eb243bffaf440eb25cb1f2430377", 0],
      },
    },
    "CLIPLoader-002794d3ba7c17c4f83b82f42961d3d8": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen_3_8b_fp8mixed.safetensors",
        device: "default",
        type: "flux2",
      },
    },
    "CLIPTextEncode-a5eb6fed8b48761592bb34a3f51a1e24": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["CLIPLoader-002794d3ba7c17c4f83b82f42961d3d8", 0],
        text: resolvedNegativePrompt.text,
      },
    },
    "CLIPTextEncode-acd7e32aef39aafe3f6c0abb0498e47a": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["CLIPLoader-002794d3ba7c17c4f83b82f42961d3d8", 0],
        text: positivePrompt(prompt),
      },
    },
    "EmptyFlux2LatentImage-7830d5afa1453245de64ed5470dfe7d2": {
      class_type: "EmptyFlux2LatentImage",
      inputs: {
        batch_size: 1,
        height: ["easy imageSize-913eae800a3359e3775764c823c3e7ea", 1],
        width: ["easy imageSize-913eae800a3359e3775764c823c3e7ea", 0],
      },
    },
    "Flux2Scheduler-fd38d320ac98d809795611b9d91d1f52": {
      class_type: "Flux2Scheduler",
      inputs: {
        height: ["easy imageSize-913eae800a3359e3775764c823c3e7ea", 1],
        steps: AI_TEXTURE_DEFAULTS.steps,
        width: ["easy imageSize-913eae800a3359e3775764c823c3e7ea", 0],
      },
    },
    "ImageResize+-6348ae83bed7de73d2de60a62eb38a93": {
      class_type: "ImageResize+",
      inputs: {
        condition: "always",
        height,
        image: ["VAEDecode-9b4768f234a1daa86399fd937e8cd4e4", 0],
        interpolation: "lanczos",
        method: "stretch",
        multiple_of: 0,
        width,
      },
    },
    "ImageResize+-a38908ad3622430bf340597ca425274c": {
      class_type: "ImageResize+",
      inputs: {
        condition: "always",
        height,
        image: ["71", 0],
        interpolation: "lanczos",
        method: "stretch",
        multiple_of: 0,
        width,
      },
    },
    "KSamplerSelect-ea15f99cba5b444c6edd8a1509542292": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "RandomNoise-7db7dfd0e538b23df0bba2565100e976": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "ReferenceLatent-95e27bbc3e3c05717782d7ef1003175d": {
      class_type: "ReferenceLatent",
      inputs: {
        conditioning: ["CLIPTextEncode-a5eb6fed8b48761592bb34a3f51a1e24", 0],
        latent: ["VAEEncode-0f3be78d5b363beeed86c2ebc4015cab", 0],
      },
    },
    "ReferenceLatent-ce99eb243bffaf440eb25cb1f2430377": {
      class_type: "ReferenceLatent",
      inputs: {
        conditioning: ["CLIPTextEncode-acd7e32aef39aafe3f6c0abb0498e47a", 0],
        latent: ["VAEEncode-0f3be78d5b363beeed86c2ebc4015cab", 0],
      },
    },
    "SamplerCustomAdvanced-2f28374236f5e23ae19921682535469c": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        guider: ["CFGGuider-5a1e6727e4373225bc38746ef9d6e19e", 0],
        latent_image: ["EmptyFlux2LatentImage-7830d5afa1453245de64ed5470dfe7d2", 0],
        noise: ["RandomNoise-7db7dfd0e538b23df0bba2565100e976", 0],
        sampler: ["KSamplerSelect-ea15f99cba5b444c6edd8a1509542292", 0],
        sigmas: ["Flux2Scheduler-fd38d320ac98d809795611b9d91d1f52", 0],
      },
    },
    "UNETLoader-268b01374c2e0d44c2854c95c42a0a6e": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: AI_TEXTURE_DEFAULTS.model,
        weight_dtype: "fp8_e4m3fn_fast",
      },
    },
    "VAEDecode-9b4768f234a1daa86399fd937e8cd4e4": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["SamplerCustomAdvanced-2f28374236f5e23ae19921682535469c", 0],
        vae: ["VAELoader-07611aba2b9b3055246a421194564b96", 0],
      },
    },
    "VAEEncode-0f3be78d5b363beeed86c2ebc4015cab": {
      class_type: "VAEEncode",
      inputs: {
        pixels: ["ImageResize+-a38908ad3622430bf340597ca425274c", 0],
        vae: ["VAELoader-07611aba2b9b3055246a421194564b96", 0],
      },
    },
    "VAELoader-07611aba2b9b3055246a421194564b96": {
      class_type: "VAELoader",
      inputs: { vae_name: "flux2-vae.safetensors" },
    },
    "easy imageSize-913eae800a3359e3775764c823c3e7ea": {
      class_type: "easy imageSize",
      inputs: { image: ["ImageResize+-a38908ad3622430bf340597ca425274c", 0] },
    },
  };
  const panoramaSeamRepair = generationRequest?.panorama_seam_repair === true;
  let finalImage = ["ImageResize+-6348ae83bed7de73d2de60a62eb38a93", 0];
  let repairedShiftedImage = null;
  if (panoramaSeamRepair) {
    repairedShiftedImage = addPanoramaSeamRepairStage(nodes, {
      enhancedImage: finalImage,
      height,
      originalImage: ["ImageResize+-a38908ad3622430bf340597ca425274c", 0],
      repairPrompt: generationRequest.panorama_seam_prompt,
      seed,
      width,
    }).output;
    finalImage = addPanoramaRestoreStage(nodes, {
      height,
      sourceImage: repairedShiftedImage,
      width,
    });
  }
  const upscaleResolution = String(generationRequest?.upscale_resolution || "");
  if (upscaleResolution) {
    const stage = createSeedVrUpscaleStage({
      generationRequest: {
        upscaleWorkflowKey: generationRequest.upscale_workflow_key
          || IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
      },
      height: Number(generationRequest.upscale_height),
      image: finalImage,
      nodeIds: {
        dit: "SeedVR2-DiT",
        preprocess: "SeedVR2-Preprocess",
        upscaler: "SeedVR2-Upscaler",
        vae: "SeedVR2-VAE",
      },
      seed,
      width: Number(generationRequest.upscale_width),
    });
    Object.assign(nodes, stage.nodes);
    finalImage = stage.output;
    if (panoramaSeamRepair) {
      finalImage = addFinalPanoramaSeamPatchStage(nodes, {
        baseImage: finalImage,
        height: Number(generationRequest.upscale_height),
        repairedShiftedImage,
        sourceHeight: height,
        sourceWidth: width,
        width: Number(generationRequest.upscale_width),
      });
    }
  }
  if (panoramaSeamRepair && !upscaleResolution) {
    finalImage = addFinalPanoramaSeamPatchStage(nodes, {
      baseImage: finalImage,
      height,
      repairedShiftedImage,
      sourceHeight: height,
      sourceWidth: width,
      width,
    });
  }
  nodes[AI_TEXTURE_WORKFLOW.outputNodeId].inputs.images = finalImage;
  return nodes;
}

export function aiTextureWorkflowMetadata({
  actualOutputHeight,
  actualOutputWidth,
  artifactKey,
  executionDurationMs,
  generationRequest,
  height,
  negativePromptMode,
  outputFilename,
  outputSha256,
  promptId,
  queueDurationMs,
  resolution,
  seed,
  width,
}) {
  const upscaleResolution = String(generationRequest?.upscale_resolution || "") || null;
  const panoramaSeamRepair = generationRequest?.panorama_seam_repair === true;
  const bandWidth = panoramaSeamRepair
    ? Math.max(16, Math.round(width * PANORAMA_SEAM_BAND_RATIO))
    : null;
  return {
    artifactKey,
    engine: "comfyui",
    executionDurationMs,
    inferenceHeight: height,
    inferenceWidth: width,
    model: AI_TEXTURE_DEFAULTS.model,
    negativePromptMode,
    outputFilename,
    outputHeight: actualOutputHeight || Number(generationRequest?.upscale_height) || height,
    outputSha256,
    outputWidth: actualOutputWidth || Number(generationRequest?.upscale_width) || width,
    promptId,
    panoramaSeamRepair: panoramaSeamRepair
      ? {
          bandRatio: PANORAMA_SEAM_BAND_RATIO,
          bandWidth,
          featherRatio: PANORAMA_SEAM_FEATHER_RATIO,
          featherWidth: Math.max(
            1,
            Math.min(
              Math.round(width * PANORAMA_SEAM_FEATHER_RATIO),
              Math.floor(bandWidth / 2),
            ),
          ),
          mode: "single-prompt-three-stage",
          modelPasses: 2,
          referenceMode: "masked-original-reference",
          referenceStrength: PANORAMA_SEAM_REFERENCE_STRENGTH,
          candidateMode: "masked-latent-inpaint",
          enhancementInputMode: "original",
          finalSeamPatch: true,
          restoreBeforeUpscale: true,
          upscalePrompt: false,
        }
      : null,
    queueDurationMs,
    resolution,
    seed,
    steps: AI_TEXTURE_DEFAULTS.steps,
    upscaleResolution,
    upscaleWorkflowKey: upscaleResolution
      ? generationRequest?.upscale_workflow_key || IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY
      : null,
    workflowId: AI_TEXTURE_WORKFLOW.id,
    workflowVersion: AI_TEXTURE_WORKFLOW.version,
  };
}
