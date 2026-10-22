/**
 * [INPUT]: 依赖 MaaS prod_test 参数 1082 的真实执行图、共享 Janus 节点及 History Prompt 读取、可选 Flux Fill 模型键、单图 Base64、四边扩展、随机种子与唯一产物键
 * [OUTPUT]: 对外提供两款 Flux Fill 模型目录与严格解析、支持 32–4096px 输入的扩图图、来源身份、能力需求、几何规则及真实模型/产物/已捕获 Prompt 元数据
 * [POS]: src 的 Flux 扩图工作流真源，适配本机传输、4K 准入与图文输出，保留原 Janus/采样链路并为飞书归档输出实际提示词
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { JANUS_OUTPAINT_SETTINGS, capturedOutpaintPrompt, createOutpaintJanusNodes } from "./image-outpaint-janus.mjs";

export const IMAGE_OUTPAINT_OUTPUT_NODE_ID = "output";
export const IMAGE_OUTPAINT_WORKFLOW = Object.freeze({
  key: "image-outpaint",
  label: "AI 扩图",
  version: "2026-10-19.1",
  sourceStage: "prod_test",
  sourceUpdatedAt: "2026-09-10",
  maasParameterId: 1082,
  maasStrategyHint: 643,
  sourceSha256: "64684baf682a0a744a03c788928507859bc14160954751a6f3d78c626be47ce1",
  sourcePromptSha256: "2a68c653f0074da5a68324d0dbbdd2801b2b5792d955dca27765fedbd420d37f",
});
export const IMAGE_OUTPAINT_GEOMETRY = Object.freeze({
  maxInputEdge: 4096,
  minInputEdge: 32,
  sourceMultiple: 32,
  targetMultiple: 8,
});
export const IMAGE_OUTPAINT_DEFAULT_MODEL_KEY = "oneRewardFp8";
export const IMAGE_OUTPAINT_MODELS = Object.freeze([
  { key: IMAGE_OUTPAINT_DEFAULT_MODEL_KEY, label: "Flux Fill OneReward（FP8）", fileName: "flux1-fill-dev-OneReward-fp8.safetensors", weightDtype: "fp8_e4m3fn" },
  { key: "fluxFillDev", label: "Flux Fill Dev（原版）", fileName: "flux1-fill-dev.safetensors", weightDtype: "default" },
].map(Object.freeze));

export function resolveImageOutpaintModel(key = IMAGE_OUTPAINT_DEFAULT_MODEL_KEY) {
  const model = IMAGE_OUTPAINT_MODELS.find((candidate) => candidate.key === key);
  if (!model) throw inputError("不支持的 Flux Fill 扩图模型");
  return model;
}

// -------- 原执行图常量：保留来源，生成执行图时覆盖传输、尺寸准入与报告 --------
const SOURCE_GRAPH = {
  "vae": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "ae.sft"
    }
  },
  "clip": {
    "class_type": "DualCLIPLoader",
    "inputs": {
      "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
      "clip_name2": "clip_l.safetensors",
      "type": "flux",
      "device": "default"
    }
  },
  ...createOutpaintJanusNodes(),
  "model": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "flux1-fill-dev-OneReward-fp8.safetensors",
      "weight_dtype": "fp8_e4m3fn"
    }
  },
  "negative-encode": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "text, watermark, logo, blurry, ugly, bad quality, artifacts, noise, deformed, mutilated",
      "clip": [
        "clip",
        0
      ]
    }
  },
  "differential": {
    "class_type": "DifferentialDiffusion",
    "inputs": {
      "strength": 1,
      "model": [
        "model",
        0
      ]
    }
  },
  "negative": {
    "class_type": "ConditioningZeroOut",
    "inputs": {
      "conditioning": [
        "negative-encode",
        0
      ]
    }
  },
  "check-size": {
    "class_type": "MaaSCheckImageSize",
    "inputs": {
      "min_width": 32,
      "max_width": 2048,
      "min_height": 32,
      "max_height": 2048,
      "image": [
        "input",
        0
      ]
    }
  },
  "prepare": {
    "class_type": "LayerUtility: ImageScaleByAspectRatio V2",
    "inputs": {
      "aspect_ratio": "original",
      "proportional_width": 1,
      "proportional_height": 1,
      "fit": "crop",
      "method": "lanczos",
      "round_to_multiple": "32",
      "scale_to_side": "None",
      "scale_to_length": 1024,
      "background_color": "#000000",
      "image": [
        "check-size",
        0
      ]
    }
  },
  "expand": {
    "class_type": "ImagePadForOutpaintMasked",
    "inputs": {
      "left": 0,
      "top": 0,
      "right": 0,
      "bottom": 0,
      "feathering": 30,
      "image": [
        "prepare",
        0
      ],
      "mask": [
        "prepare",
        1
      ]
    }
  },
  "positive-encode": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": [
        "prompt-output",
        0
      ],
      "clip": [
        "clip",
        0
      ]
    }
  },
  "guidance": {
    "class_type": "FluxGuidance",
    "inputs": {
      "guidance": 30,
      "conditioning": [
        "positive-encode",
        0
      ]
    }
  },
  "conditioning": {
    "class_type": "InpaintModelConditioning",
    "inputs": {
      "noise_mask": false,
      "positive": [
        "guidance",
        0
      ],
      "negative": [
        "negative",
        0
      ],
      "vae": [
        "vae",
        0
      ],
      "pixels": [
        "expand",
        0
      ],
      "mask": [
        "expand",
        1
      ]
    }
  },
  "sample": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 4,
      "steps": 20,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": [
        "differential",
        0
      ],
      "positive": [
        "conditioning",
        0
      ],
      "negative": [
        "conditioning",
        1
      ],
      "latent_image": [
        "conditioning",
        2
      ]
    }
  },
  "decode": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": [
        "sample",
        0
      ],
      "vae": [
        "vae",
        0
      ]
    }
  },
  "output": {
    "class_type": "SaveImage",
    "inputs": {
      "filename_prefix": "",
      "images": [
        "decode",
        0
      ]
    }
  },
  "prompt-output": {
    "class_type": "SaveText",
    "inputs": {
      "text": ["describe", 0],
      "filename_prefix": "",
      "format": "txt"
    }
  },
  "input": {
    "class_type": "easy loadImageBase64",
    "inputs": {
      "base64_data": "",
      "image_output": "Hide",
      "save_prefix": ""
    }
  }
};

export const IMAGE_OUTPAINT_REQUIRED_NODES = Object.freeze(
  [...new Set(Object.values(SOURCE_GRAPH).map((node) => node.class_type))],
);
export const IMAGE_OUTPAINT_REQUIRED_MODELS = Object.freeze([
  { classType: "VAELoader", inputName: "vae_name", value: SOURCE_GRAPH.vae.inputs.vae_name },
  { classType: "DualCLIPLoader", inputName: "clip_name1", value: SOURCE_GRAPH.clip.inputs.clip_name1 },
  { classType: "DualCLIPLoader", inputName: "clip_name2", value: SOURCE_GRAPH.clip.inputs.clip_name2 },
  { classType: "UNETLoader", inputName: "unet_name", value: SOURCE_GRAPH.model.inputs.unet_name },
  { classType: "JanusModelLoader", inputName: "model_name", value: SOURCE_GRAPH["janus-model"].inputs.model_name },
].map(Object.freeze));

function inputError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// -------- 与 LayerStyle 原节点一致：短轴 int 截断，然后向上对齐 32 --------
// 原算法来源：chflame163/ComfyUI_LayerStyle@a3459a7638c4c2839878089c105c73af0eb2edd2。
export function imageOutpaintPreparedDimensions(source) {
  const width = Number(source?.width);
  const height = Number(source?.height);
  const { minInputEdge, maxInputEdge, sourceMultiple } = IMAGE_OUTPAINT_GEOMETRY;
  if (![width, height].every((value) => Number.isSafeInteger(value) && value >= minInputEdge && value <= maxInputEdge)) {
    throw inputError(`AI 扩图输入宽高必须在 ${minInputEdge}–${maxInputEdge}px 之间`);
  }
  const ratio = width / height;
  const rawWidth = ratio > 1 ? width : Math.trunc(height * ratio);
  const rawHeight = ratio > 1 ? Math.trunc(width / ratio) : height;
  return {
    width: Math.ceil(rawWidth / sourceMultiple) * sourceMultiple,
    height: Math.ceil(rawHeight / sourceMultiple) * sourceMultiple,
  };
}

export function assertImageOutpaintAlignedTarget(target) {
  const { width, height } = target || {};
  const multiple = IMAGE_OUTPAINT_GEOMETRY.targetMultiple;
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0 && value % multiple === 0)) {
    throw inputError(`扩图目标宽高必须为 ${multiple}px 的整数倍，请调整左右或上下扩展总量`);
  }
  return { width, height };
}

export function imageOutpaintArtifactPrefix(artifactKey) {
  const key = String(artifactKey || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new TypeError("AI 扩图产物键格式不正确");
  return `CanvasLab_Outpaint_${key}`;
}

export function createImageOutpaintWorkflow({ artifactKey, generationRequest, imageBase64, seed, width, height }) {
  const model = resolveImageOutpaintModel(generationRequest?.outpaintModel);
  const prefix = imageOutpaintArtifactPrefix(artifactKey);
  assertImageOutpaintAlignedTarget({ width, height });
  if (!Number.isSafeInteger(seed) || seed < 0) throw inputError("AI 扩图随机种子无效");
  const expansion = generationRequest?.expansion;
  const sides = ["left", "top", "right", "bottom"];
  for (const side of sides) {
    if (!Number.isSafeInteger(expansion?.[side]) || expansion[side] < 0 || expansion[side] > 16384) {
      throw inputError("AI 扩图四边扩展必须为 0–16384px 的整数");
    }
  }
  if (!sides.some((side) => expansion[side] > 0)) throw inputError("请至少扩展一边");
  const graph = structuredClone(SOURCE_GRAPH);
  Object.assign(graph.model.inputs, { unet_name: model.fileName, weight_dtype: model.weightDtype });
  Object.assign(graph["check-size"].inputs, {
    min_width: IMAGE_OUTPAINT_GEOMETRY.minInputEdge,
    max_width: IMAGE_OUTPAINT_GEOMETRY.maxInputEdge,
    min_height: IMAGE_OUTPAINT_GEOMETRY.minInputEdge,
    max_height: IMAGE_OUTPAINT_GEOMETRY.maxInputEdge,
  });
  graph.input.inputs.base64_data = imageBase64;
  graph.input.inputs.save_prefix = `CanvasLab_Outpaint_Input_${artifactKey}`;
  Object.assign(graph.expand.inputs, Object.fromEntries(sides.map((side) => [side, expansion[side]])));
  graph.sample.inputs.seed = seed;
  graph.output.inputs.filename_prefix = prefix;
  graph["prompt-output"].inputs.filename_prefix = `${prefix}_prompt`;
  return graph;
}

export function imageOutpaintWorkflowMetadata({
  actualOutputHeight, actualOutputWidth, artifactKey, executionDurationMs,
  generationRequest, height, historyOutputs, outputFilename, outputSha256, promptId,
  queueDurationMs, seed, width,
}) {
  const model = resolveImageOutpaintModel(generationRequest?.outpaintModel);
  return {
    artifactKey,
    engine: "comfyui",
    executionDurationMs,
    expansion: { ...generationRequest?.expansion },
    inputHeight: generationRequest?.sourceHeight ?? null,
    inputWidth: generationRequest?.sourceWidth ?? null,
    model: model.fileName,
    outpaintModel: model.key,
    weightDtype: model.weightDtype,
    outputFilename,
    outputHeight: actualOutputHeight,
    outputSha256,
    outputWidth: actualOutputWidth,
    preparedHeight: generationRequest?.preparedHeight ?? null,
    preparedWidth: generationRequest?.preparedWidth ?? null,
    promptGenerator: { ...JANUS_OUTPAINT_SETTINGS, imageSource: "original-before-padding" },
    promptSource: "Janus-Pro-1B",
    ...capturedOutpaintPrompt(historyOutputs),
    promptId,
    queueDurationMs,
    seed,
    sourceMultiple: IMAGE_OUTPAINT_GEOMETRY.sourceMultiple,
    targetHeight: height,
    targetMultiple: IMAGE_OUTPAINT_GEOMETRY.targetMultiple,
    targetWidth: width,
    workflowId: IMAGE_OUTPAINT_WORKFLOW.key,
    workflowVersion: IMAGE_OUTPAINT_WORKFLOW.version,
    maasParameterId: IMAGE_OUTPAINT_WORKFLOW.maasParameterId,
    maasStrategyHint: IMAGE_OUTPAINT_WORKFLOW.maasStrategyHint,
    sourceStage: IMAGE_OUTPAINT_WORKFLOW.sourceStage,
    sourceUpdatedAt: IMAGE_OUTPAINT_WORKFLOW.sourceUpdatedAt,
    sourceSha256: IMAGE_OUTPAINT_WORKFLOW.sourceSha256,
    sourcePromptSha256: IMAGE_OUTPAINT_WORKFLOW.sourcePromptSha256,
  };
}

export const IMAGE_OUTPAINT_CLIENT_OPTIONS = Object.freeze({
  artifactPrefix: imageOutpaintArtifactPrefix,
  outputNodeId: IMAGE_OUTPAINT_OUTPUT_NODE_ID,
  workflowFactory: createImageOutpaintWorkflow,
  workflowMetadataFactory: imageOutpaintWorkflowMetadata,
});

