/**
 * [INPUT]: 依赖 Flux2 Klein 节点、共享工作流配置、默认 9B FP8/7 steps 与 1K/2K 推理尺寸、可选攸行 SeedVR2 3B、单一外部正负 Prompt、参考图 Base64、运行时种子与请求产物键
 * [OUTPUT]: 对外提供统一的普通 Flux 生成、可选无 Prompt 超分、唯一产物前缀和可归档阶段元数据
 * [POS]: src 的 Flux ComfyUI 工作流定义，以空 Latent、euler 采样、参考图条件、无 Prompt 超分旁路和单一最终 SaveImage 串联生成阶段，不负责网络提交、轮询或图片下载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
  createSeedVrUpscaleStage,
} from "./image-upscale-workflow.mjs";
import {
  AI_TEXTURE_DEFAULTS,
  AI_TEXTURE_WORKFLOW,
  buildAiTextureWorkflowMetadata,
} from "./ai-texture-workflow-config.mjs";

export {
  AI_TEXTURE_DEFAULTS,
  AI_TEXTURE_WORKFLOW,
} from "./ai-texture-workflow-config.mjs";

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
  let finalImage = ["ImageResize+-6348ae83bed7de73d2de60a62eb38a93", 0];
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
  return buildAiTextureWorkflowMetadata({
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
  });
}
