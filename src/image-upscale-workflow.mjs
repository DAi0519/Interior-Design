/**
 * [INPUT]: 依赖六套SeedVR2参数、整图面积预算与精确缩放节点合同、单张Base64、目标宽高、冻结版本与请求级产物键
 * [OUTPUT]: 对外提供目录/比例尺寸、KS全部档位严格20MP以下整图推理计划、可嵌入执行图及区分模型推理与插值交付的版本化元数据
 * [POS]: src 的图片超分工作流真源，把编辑器 JSON 收敛为可独立提交或嵌入 Flux 的最小执行图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const IMAGE_UPSCALE_OUTPUT_NODE_ID = "76";
export const KS_UPSCALE_AREA_POLICY = Object.freeze({
  version: "ks-whole-area-cap-v3", pixelLimit: 20_000_000, paddingMultiple: 16,
});

export const IMAGE_UPSCALE_RESOLUTIONS = Object.freeze({
  "4K": 4096,
  "6K": 6144,
  "8K": 8192,
});

const LONG_EDGE_RESOLUTIONS = Object.freeze(
  Object.entries(IMAGE_UPSCALE_RESOLUTIONS).map(([key, longEdge]) => Object.freeze({
    key, label: key, longEdge,
  })),
);
const KS_RESOLUTIONS = Object.freeze([
  Object.freeze({ key: "2X", label: "原图2倍", scale: 2 }),
  ...LONG_EDGE_RESOLUTIONS.filter((resolution) => resolution.key !== "8K"),
]);

export const IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY = "youxing_seedvr2_3b";

export const IMAGE_UPSCALE_WORKFLOWS = Object.freeze({
  youxing_seedvr2_3b: Object.freeze({
    blocksToSwap: 0,
    cacheModel: true,
    description: "对应 0907攸行超分，SeedVR2 3B 原图直入",
    ditOffloadDevice: "cuda:0",
    helpText: "3B 原图直接超分，保持原图比例。",
    inputMegapixels: null,
    key: "youxing_seedvr2_3b",
    label: "攸行超分 · SeedVR2 3B",
    model: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    resolutions: LONG_EDGE_RESOLUTIONS,
    shortLabel: "攸行 3B",
    sourceSha256: "914316430fb444ee5ccf52a8d19c5ebfa9ad6b043be734431ea68e18b350696d",
    vaeOffloadDevice: "cuda:0",
    version: "2026-09-07.1",
  }),
  seedvr2_1mp: Object.freeze({
    blocksToSwap: 32,
    cacheModel: false,
    description: "对应 SeedVR2无损高清放大-新2.0，输入预处理为 1MP",
    ditOffloadDevice: "cpu",
    helpText: "先以 1MP 预处理，再超分至所选长边，保持原图比例。",
    inputMegapixels: 1,
    key: "seedvr2_1mp",
    label: "SeedVR2 · 1MP 预处理",
    model: "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    resolutions: LONG_EDGE_RESOLUTIONS,
    shortLabel: "7B · 1MP",
    sourceSha256: "8960599da294cc48511340e5cfc5c53e4e4949caa69c1f6b362272f0285c6498",
    vaeOffloadDevice: "cpu",
    version: "2026-09-04.2",
  }),
  seedvr2_075mp: Object.freeze({
    blocksToSwap: 32,
    cacheModel: false,
    description: "对应 Unsaved Workflow (3)，输入预处理为 0.75MP",
    ditOffloadDevice: "cpu",
    helpText: "先以 0.75MP 预处理，再超分至所选长边，保持原图比例。",
    inputMegapixels: 0.75,
    key: "seedvr2_075mp",
    label: "SeedVR2 · 0.75MP 预处理",
    model: "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    resolutions: LONG_EDGE_RESOLUTIONS,
    shortLabel: "7B · 0.75MP",
    sourceSha256: "4def56a508cfeb8083bc8da8b13b9bec91f764808bae306e19edc39d3ae0d1dc",
    vaeOffloadDevice: "cpu",
    version: "2026-09-04.2",
  }),
  seedvr2_7b_direct: Object.freeze({
    blocksToSwap: 32,
    cacheModel: false,
    description: "对应拆分的 SeedVR2 7B 普通图片独立超分，原图直入",
    ditOffloadDevice: "cpu",
    helpText: "7B 原图直接超分，保持原图比例。",
    inputMegapixels: null,
    key: "seedvr2_7b_direct",
    label: "拆分版 · 7B原图超分",
    model: "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    resolutions: LONG_EDGE_RESOLUTIONS,
    shortLabel: "拆分版 · 7B",
    sourceSha256: "275f8f8afbe62f8d7b443777ede5ff8003559fa660e2ab4afa0ccf2072cef6b6",
    vaeOffloadDevice: "cpu",
    version: "2026-10-16.1",
  }),
  ks_seedvr2_2x: Object.freeze({
    areaCap: true,
    blocksToSwap: 36,
    cacheModel: false,
    description: "对应KS-超分，0.75MP预处理后整图推理，面积严格低于20MP，保持2倍或4K/6K交付",
    displayLabel: "KS版 · 7B",
    ditOffloadDevice: "cpu",
    helpText: "全图先以0.75MP预处理，整图推理面积严格低于20MP；超限时缩小推理，再等比插值恢复所选2倍或4K/6K尺寸。输入每边需为384–3200px。",
    inputMegapixels: 0.75,
    inputSize: Object.freeze({ minWidth: 384, maxWidth: 3200, minHeight: 384, maxHeight: 3200 }),
    key: "ks_seedvr2_2x",
    label: "KS版 · 原图2倍",
    model: "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    resolutions: KS_RESOLUTIONS,
    shortLabel: "KS版 · 7B",
    sourceSha256: "8db4d3de7194d117756e19fdd5d64b50e9c0664146dde82312bb4071a44458c4",
    vaeOffloadDevice: "cpu",
    version: "2026-10-26.3",
  }),
  ks_seedvr2_2x_direct: Object.freeze({
    areaCap: true,
    blocksToSwap: 36,
    cacheModel: false,
    description: "KS原图直入整图推理，面积严格低于20MP，保持2倍或4K/6K交付",
    displayLabel: "KS直入 · 7B",
    ditOffloadDevice: "cpu",
    helpText: "不做0.75MP预缩放，整图推理面积严格低于20MP；超限时缩小推理，再等比插值恢复所选2倍或4K/6K尺寸。输入每边需为384–3200px。",
    inputMegapixels: null,
    inputSize: Object.freeze({ minWidth: 384, maxWidth: 3200, minHeight: 384, maxHeight: 3200 }),
    key: "ks_seedvr2_2x_direct",
    label: "KS版 · 原图直入2倍",
    model: "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    resolutions: KS_RESOLUTIONS,
    shortLabel: "KS直入 · 7B",
    sourceSha256: "8db4d3de7194d117756e19fdd5d64b50e9c0664146dde82312bb4071a44458c4",
    vaeOffloadDevice: "cpu",
    version: "2026-10-26.3",
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

function resolutionForWorkflow(workflow, resolution) {
  const selected = workflow.resolutions.find((entry) => entry.key === String(resolution || ""));
  if (!selected) throw validationError(workflow.resolutions.some((entry) => entry.scale)
    ? "KS 超分只支持原图2倍、4K 或 6K"
    : "图片超分只支持 4K、6K 或 8K");
  return selected;
}

// -------- 模型补齐后的整图面积预算；整数尺寸保留比例到最近偶数 --------
function paddedInferencePixels(width, height) {
  const unit = KS_UPSCALE_AREA_POLICY.paddingMultiple;
  return Math.ceil(width / unit) * unit * Math.ceil(height / unit) * unit;
}

function cappedInferenceDimensions(width, height) {
  const limit = KS_UPSCALE_AREA_POLICY.pixelLimit;
  if (paddedInferencePixels(width, height) < limit) return { width, height };
  const portrait = height > width, long = Math.max(width, height), short = Math.min(width, height);
  let low = 1, high = Math.floor(long / 2), best = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2), longEdge = middle * 2;
    const shortEdge = Math.max(2, Math.round(short * longEdge / long / 2) * 2);
    if (paddedInferencePixels(longEdge, shortEdge) < limit) {
      best = portrait ? { width: shortEdge, height: longEdge } : { width: longEdge, height: shortEdge };
      low = middle + 1;
    } else high = middle - 1;
  }
  if (!best) throw validationError("无法规划20MP以下的整图推理尺寸");
  return best;
}

export function imageUpscaleExecutionPlan({ width, height, resolution, workflowKey }) {
  const workflow = imageUpscaleWorkflow(workflowKey);
  const selected = resolutionForWorkflow(workflow, resolution);
  if (![width, height].every(value => Number.isInteger(value) && value > 0)) {
    throw validationError("图片超分目标尺寸必须是正整数");
  }
  if (selected.longEdge && Math.max(width, height) !== selected.longEdge) {
    throw validationError(`图片超分所选${selected.key}目标长边必须为${selected.longEdge}px`);
  }
  const controlled = workflow.areaCap === true;
  if (controlled && [width, height].some(value => value % 2 !== 0)) {
    throw validationError("KS超分目标宽高必须是偶数");
  }
  const inference = controlled ? cappedInferenceDimensions(width, height) : { width, height };
  return {
    strategy: "whole",
    ...(controlled ? { policyVersion: KS_UPSCALE_AREA_POLICY.version,
      inferenceWidth: inference.width, inferenceHeight: inference.height,
      paddedInferencePixels: paddedInferencePixels(inference.width, inference.height),
      inferencePixelLimit: KS_UPSCALE_AREA_POLICY.pixelLimit,
      deliveryPostResize: inference.width !== width || inference.height !== height } : {}),
    seedVrResolution: Math.min(inference.width, inference.height),
    seedVrMaxResolution: controlled ? Math.max(inference.width, inference.height) : selected.scale ? 0 : selected.longEdge,
    blocksToSwap: workflow.blocksToSwap,
    swapIoComponents: controlled,
  };
}

export function imageUpscaleTargetDimensions(source, resolution, workflowKey = IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY) {
  const width = Number(source?.width);
  const height = Number(source?.height);
  const workflow = imageUpscaleWorkflow(workflowKey);
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw validationError("无法读取待超分图片尺寸");
  }
  const selectedResolution = resolutionForWorkflow(workflow, resolution);
  if (workflow.inputSize) {
    const { minWidth, maxWidth, minHeight, maxHeight } = workflow.inputSize;
    if (width < minWidth || width > maxWidth || height < minHeight || height > maxHeight) {
      throw validationError(`KS 超分输入图片的宽和高均需为 ${minWidth}–${maxWidth}px`);
    }
  }
  if (selectedResolution.scale) {
    return {
      height: height * selectedResolution.scale,
      longEdge: Math.max(width, height) * selectedResolution.scale,
      width: width * selectedResolution.scale,
    };
  }
  const { longEdge } = selectedResolution;
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
    resolutions: LONG_EDGE_RESOLUTIONS.map((resolution) => ({ ...resolution })),
    workflows: Object.values(IMAGE_UPSCALE_WORKFLOWS).map((workflow) => ({
      description: workflow.description,
      helpText: workflow.helpText || workflow.description,
      ...(workflow.inputSize ? { inputSize: { ...workflow.inputSize } } : {}),
      key: workflow.key,
      label: workflow.displayLabel || workflow.label,
      resolutions: workflow.resolutions.map((resolution) => ({ ...resolution })),
      shortLabel: workflow.shortLabel,
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
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw validationError("图片超分目标尺寸必须是正整数");
  }
  // 普通Flux嵌入阶段的旧调用没有resolution，继续按目标长边识别；KS三档必须显式选择。
  const resolution = generationRequest?.resolution ?? (workflow.resolutions.some((entry) => entry.scale)
    ? undefined : workflow.resolutions.find((entry) => entry.longEdge === targetLongEdge)?.key);
  const selectedResolution = resolutionForWorkflow(workflow, resolution);
  if (selectedResolution.longEdge && targetLongEdge !== selectedResolution.longEdge) {
    throw validationError(`图片超分所选${selectedResolution.key}目标长边必须为${selectedResolution.longEdge}px`);
  }
  if (generationRequest?.upscaleWorkflowVersion && generationRequest.upscaleWorkflowVersion !== workflow.version) {
    const error = validationError("超分工作流版本已变化，请刷新配置后重新运行");
    error.statusCode = 409;
    throw error;
  }
  const plan = imageUpscaleExecutionPlan({ width, height, resolution, workflowKey: workflow.key });
  const ids = {
    dit: nodeIds.dit || "73",
    preprocess: nodeIds.preprocess || "72",
    upscaler: nodeIds.upscaler || "75",
    vae: nodeIds.vae || "74",
    canvas: nodeIds.canvas || (nodeIds.upscaler ? `${nodeIds.upscaler}-Canvas` : "77"),
    restore: nodeIds.restore || (nodeIds.upscaler ? `${nodeIds.upscaler}-Restore` : "78"),
  };
  const nodes = {
    [ids.dit]: {
      class_type: "SeedVR2LoadDiTModel",
      inputs: {
        attention_mode: "sdpa",
        blocks_to_swap: plan.blocksToSwap,
        cache_model: workflow.cacheModel,
        device: "cuda:0",
        model: workflow.model,
        offload_device: workflow.ditOffloadDevice,
        swap_io_components: plan.swapIoComponents,
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
        image: workflow.areaCap ? [ids.canvas, 0]
          : workflow.inputMegapixels === null ? image : [ids.preprocess, 0],
        input_noise_scale: 0,
        latent_noise_scale: 0,
        max_resolution: plan.seedVrMaxResolution,
        offload_device: "cpu",
        prepend_frames: 0,
        resolution: plan.seedVrResolution,
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
  if (workflow.areaCap) {
    // 只建立受限推理画布；Seed以1x处理整图，不把原目标再次带入模型。
    nodes[ids.canvas] = { class_type: "ImageScale", inputs: {
      image: workflow.inputMegapixels === null ? image : [ids.preprocess, 0],
      upscale_method: "lanczos", width: plan.inferenceWidth, height: plan.inferenceHeight, crop: "disabled",
    } };
    if (plan.deliveryPostResize) nodes[ids.restore] = { class_type: "ImageScale", inputs: {
      image: [ids.upscaler, 0], upscale_method: "lanczos", width, height, crop: "disabled",
    } };
  }
  return { nodes, output: [plan.deliveryPostResize ? ids.restore : ids.upscaler, 0], workflow };
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
  if (generationRequest?.resolution && resolution && generationRequest.resolution !== resolution) {
    throw validationError("图片超分请求与产物档位不一致");
  }
  const selectedResolution = resolutionForWorkflow(workflow, resolution ?? generationRequest?.resolution);
  if (selectedResolution.longEdge && Math.max(width, height) !== selectedResolution.longEdge) {
    throw validationError(`图片超分所选${selectedResolution.key}目标长边必须为${selectedResolution.longEdge}px`);
  }
  const plan = imageUpscaleExecutionPlan({ width, height, resolution: selectedResolution.key, workflowKey: workflow.key });
  return {
    artifactKey,
    engine: "comfyui",
    executionDurationMs,
    inputMegapixels: workflow.inputMegapixels,
    model: workflow.model,
    outputFilename,
    outputHeight: actualOutputHeight || height,
    ...(selectedResolution.scale ? { outputScale: selectedResolution.scale } : {}),
    outputSha256,
    outputWidth: actualOutputWidth || width,
    promptId,
    queueDurationMs,
    requestedOutputHeight: height,
    requestedOutputWidth: width,
    resolution: selectedResolution.key,
    seed,
    seedVrMaxResolution: plan.seedVrMaxResolution,
    seedVrResolution: plan.seedVrResolution,
    ...(workflow.areaCap ? {
      executionStrategy: plan.strategy,
      executionPolicyVersion: plan.policyVersion,
      blocksToSwap: plan.blocksToSwap,
      swapIoComponents: plan.swapIoComponents,
      inferenceWidth: plan.inferenceWidth,
      inferenceHeight: plan.inferenceHeight,
      paddedInferencePixels: plan.paddedInferencePixels,
      inferencePixelLimit: plan.inferencePixelLimit,
      deliveryPostResize: plan.deliveryPostResize,
    } : {}),
    sourceSha256: workflow.sourceSha256,
    sourceHeight: generationRequest?.sourceHeight || null,
    sourceWidth: generationRequest?.sourceWidth || null,
    workflowId: workflow.key,
    workflowVersion: workflow.version,
  };
}
