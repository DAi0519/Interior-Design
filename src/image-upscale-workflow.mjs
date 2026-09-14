/**
 * [INPUT]: 依赖三个 SeedVR2 编辑器工作流的核心节点参数、单张图片 Base64、4K/6K/8K 目标宽高、运行时随机种子与请求级产物键
 * [OUTPUT]: 对外提供默认工作流键、图片超分公开目录、保持原图比例的目标尺寸计算、可嵌入其他执行图的 SeedVR2 阶段、三套 ComfyUI API 工作流工厂及可追溯元数据
 * [POS]: src 的图片超分工作流真源，把编辑器 JSON 收敛为可独立提交或嵌入 Flux 的最小执行图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const IMAGE_UPSCALE_OUTPUT_NODE_ID = "76";

export const IMAGE_UPSCALE_RESOLUTIONS = Object.freeze({
  "4K": 4096,
  "6K": 6144,
  "8K": 8192,
});

export const IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY = "youxing_seedvr2_3b";

export const IMAGE_UPSCALE_WORKFLOWS = Object.freeze({
  youxing_seedvr2_3b: Object.freeze({
    cacheModel: true,
    description: "对应 0907攸行超分，SeedVR2 3B 原图直入",
    ditOffloadDevice: "cuda:0",
    inputMegapixels: null,
    key: "youxing_seedvr2_3b",
    label: "攸行超分 · SeedVR2 3B",
    model: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    sourceSha256: "914316430fb444ee5ccf52a8d19c5ebfa9ad6b043be734431ea68e18b350696d",
    vaeOffloadDevice: "cuda:0",
    version: "2026-09-07.1",
  }),
  seedvr2_1mp: Object.freeze({
    cacheModel: false,
    description: "对应 SeedVR2无损高清放大-新2.0，输入预处理为 1MP",
    ditOffloadDevice: "cpu",
    inputMegapixels: 1,
    key: "seedvr2_1mp",
    label: "SeedVR2 · 1MP 预处理",
    model: "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    sourceSha256: "8960599da294cc48511340e5cfc5c53e4e4949caa69c1f6b362272f0285c6498",
    vaeOffloadDevice: "cpu",
    version: "2026-09-04.2",
  }),
  seedvr2_075mp: Object.freeze({
    cacheModel: false,
    description: "对应 Unsaved Workflow (3)，输入预处理为 0.75MP",
    ditOffloadDevice: "cpu",
    inputMegapixels: 0.75,
    key: "seedvr2_075mp",
    label: "SeedVR2 · 0.75MP 预处理",
    model: "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    sourceSha256: "4def56a508cfeb8083bc8da8b13b9bec91f764808bae306e19edc39d3ae0d1dc",
    vaeOffloadDevice: "cpu",
    version: "2026-09-04.2",
  }),
});

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function imageUpscaleWorkflow(workflowKey) {
  const workflow = IMAGE_UPSCALE_WORKFLOWS[String(workflowKey || "")];
  if (!workflow) throw validationError("请选择有效的超分工作流");
  return workflow;
}

export function imageUpscaleTargetDimensions(source, resolution) {
  const width = Number(source?.width);
  const height = Number(source?.height);
  const longEdge = IMAGE_UPSCALE_RESOLUTIONS[String(resolution || "")];
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw validationError("无法读取待超分图片尺寸");
  }
  if (!longEdge) throw validationError("图片超分只支持 4K、6K 或 8K");
  const scale = longEdge / Math.max(width, height);
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  return {
    height: height >= width ? longEdge : even(height * scale),
    longEdge,
    width: width >= height ? longEdge : even(width * scale),
  };
}

export function imageUpscaleArtifactPrefix(artifactKey) {
  const key = String(artifactKey || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new TypeError("图片超分产物键格式不正确");
  }
  return `CanvasLab_SeedVR2_${key}`;
}

export function publicImageUpscaleConfig() {
  return {
    defaultWorkflowKey: IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
    resolutions: Object.entries(IMAGE_UPSCALE_RESOLUTIONS).map(([key, longEdge]) => ({
      key,
      label: key,
      longEdge,
    })),
    workflows: Object.values(IMAGE_UPSCALE_WORKFLOWS).map((workflow) => ({
      description: workflow.description,
      key: workflow.key,
      label: workflow.label,
      version: workflow.version,
    })),
  };
}

export function createSeedVrUpscaleStage({
  generationRequest,
  height,
  image,
  nodeIds = {},
  seed,
  width,
}) {
  const workflow = imageUpscaleWorkflow(generationRequest?.upscaleWorkflowKey);
  const targetLongEdge = Math.max(width, height);
  const targetShortEdge = Math.min(width, height);
  if (!Object.values(IMAGE_UPSCALE_RESOLUTIONS).includes(targetLongEdge)) {
    throw validationError("图片超分目标长边必须是 4K、6K 或 8K");
  }
  const ids = {
    dit: nodeIds.dit || "73",
    preprocess: nodeIds.preprocess || "72",
    upscaler: nodeIds.upscaler || "75",
    vae: nodeIds.vae || "74",
  };
  const nodes = {
    [ids.dit]: {
      class_type: "SeedVR2LoadDiTModel",
      inputs: {
        attention_mode: "sdpa",
        blocks_to_swap: workflow.inputMegapixels === null ? 0 : 32,
        cache_model: workflow.cacheModel,
        device: "cuda:0",
        model: workflow.model,
        offload_device: workflow.ditOffloadDevice,
        swap_io_components: false,
      },
    },
    [ids.vae]: {
      class_type: "SeedVR2LoadVAEModel",
      inputs: {
        cache_model: workflow.cacheModel,
        decode_tile_overlap: 128,
        decode_tile_size: 1024,
        decode_tiled: true,
        device: "cuda:0",
        encode_tile_overlap: 128,
        encode_tile_size: 1024,
        encode_tiled: true,
        model: "ema_vae_fp16.safetensors",
        offload_device: workflow.vaeOffloadDevice,
        tile_debug: "false",
      },
    },
    [ids.upscaler]: {
      class_type: "SeedVR2VideoUpscaler",
      inputs: {
        batch_size: 1,
        color_correction: "lab",
        dit: [ids.dit, 0],
        enable_debug: false,
        image: workflow.inputMegapixels === null ? image : [ids.preprocess, 0],
        input_noise_scale: 0,
        latent_noise_scale: 0,
        max_resolution: targetLongEdge,
        offload_device: "cpu",
        prepend_frames: 0,
        resolution: targetShortEdge,
        seed,
        temporal_overlap: 0,
        uniform_batch_size: false,
        vae: [ids.vae, 0],
      },
    },
  };
  if (workflow.inputMegapixels !== null) {
    nodes[ids.preprocess] = {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image,
        megapixels: workflow.inputMegapixels,
        resolution_steps: 1,
        upscale_method: "lanczos",
      },
    };
  }
  return { nodes, output: [ids.upscaler, 0], workflow };
}

export function createImageUpscaleWorkflow({
  artifactKey,
  generationRequest,
  height,
  imageBase64,
  seed,
  width,
}) {
  const nodes = {
    "71": {
      class_type: "easy loadImageBase64",
      inputs: {
        base64_data: imageBase64,
        image_output: "Hide",
        save_prefix: `CanvasLab_Upscale_Input_${artifactKey}`,
      },
    },
  };
  const stage = createSeedVrUpscaleStage({
    generationRequest,
    height,
    image: ["71", 0],
    seed,
    width,
  });
  Object.assign(nodes, stage.nodes, {
    [IMAGE_UPSCALE_OUTPUT_NODE_ID]: {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: imageUpscaleArtifactPrefix(artifactKey),
        images: stage.output,
      },
    },
  });
  return nodes;
}

export function imageUpscaleWorkflowMetadata({
  actualOutputHeight,
  actualOutputWidth,
  artifactKey,
  executionDurationMs,
  generationRequest,
  height,
  outputFilename,
  outputSha256,
  promptId,
  queueDurationMs,
  resolution,
  seed,
  width,
}) {
  const workflow = imageUpscaleWorkflow(generationRequest?.upscaleWorkflowKey);
  return {
    artifactKey,
    engine: "comfyui",
    executionDurationMs,
    inputMegapixels: workflow.inputMegapixels,
    model: workflow.model,
    outputFilename,
    outputHeight: actualOutputHeight || height,
    outputSha256,
    outputWidth: actualOutputWidth || width,
    promptId,
    queueDurationMs,
    resolution,
    seed,
    seedVrMaxResolution: Math.max(width, height),
    seedVrResolution: Math.min(width, height),
    sourceSha256: workflow.sourceSha256,
    workflowId: workflow.key,
    workflowVersion: workflow.version,
  };
}
