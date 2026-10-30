/**
 * [INPUT]: 依赖用户 R5_4 原始执行图、原图真实尺寸、正负 Prompt、随机种子与请求级唯一产物键
 * [OUTPUT]: 对外提供四步 Euler/20 视角球面状态共享工作流、节点目录、原图尺寸复核与来源 SHA 元数据
 * [POS]: src 的全景专用执行图真源，与普通 Flux 单图工厂隔离；不负责 HTTP 提交或运营 Prompt 编译
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readImageDimensions } from "./image-dimensions.mjs";

export const PANORAMA_WORKFLOW = Object.freeze({
  id: "panorama-r5-4",
  label: "Flux2 Klein 全景 R5_4",
  version: "2026-10-28.1",
  sourceWorkflowSha256: "1390e507c446a82d45e9fec795358d4df7b29f52e6625cd988c53e6150e16b2a",
  model: "flux-2-klein-9b-fp8.safetensors",
  outputNodeId: "46",
  viewCount: 20,
  viewWidth: 1536,
  viewHeight: 1536,
  fov: 90,
  steps: 4,
});

// --- 原始执行图：仅将本地文件输入/保存名与运营正文替换为请求级输入 ---
const SOURCE_GRAPH = {
  "1": {"class_type": "easy loadImageBase64", "inputs": {"base64_data": "", "image_output": "Hide", "save_prefix": ""}},
  "2": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-9b-fp8.safetensors", "weight_dtype": "default"}},
  "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2", "device": "default"}},
  "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": ""}},
  "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": ""}},
  "6": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
  "7": {"class_type": "RandomNoise", "inputs": {"noise_seed": 42}},
  "8": {"class_type": "AIRenderSphereSetup", "inputs": {"noise": ["7", 0], "preset": "custom", "view_width": 1536, "view_height": 1536, "fov": 90.0, "candidate_points": 57906, "temperature": 0.1, "max_assignment_error": 8.0, "custom_views": "[{\"yaw\": -135.0, \"pitch\": -35.264389682754654}, {\"yaw\": -45.0, \"pitch\": -35.264389682754654}, {\"yaw\": -135.0, \"pitch\": 35.264389682754654}, {\"yaw\": -45.0, \"pitch\": 35.264389682754654}, {\"yaw\": 135.0, \"pitch\": -35.264389682754654}, {\"yaw\": 45.0, \"pitch\": -35.264389682754654}, {\"yaw\": 135.0, \"pitch\": 35.264389682754654}, {\"yaw\": 45.0, \"pitch\": 35.264389682754654}, {\"yaw\": 180.0, \"pitch\": -20.905157447889298}, {\"yaw\": -90.0, \"pitch\": -69.09484255211072}, {\"yaw\": -110.90515744788931, \"pitch\": 0.0}, {\"yaw\": 0.0, \"pitch\": -20.905157447889298}, {\"yaw\": -90.0, \"pitch\": 69.09484255211072}, {\"yaw\": 110.90515744788931, \"pitch\": 0.0}, {\"yaw\": 180.0, \"pitch\": 20.905157447889298}, {\"yaw\": 90.0, \"pitch\": -69.09484255211072}, {\"yaw\": -69.0948425521107, \"pitch\": 0.0}, {\"yaw\": 0.0, \"pitch\": 20.905157447889298}, {\"yaw\": 90.0, \"pitch\": 69.09484255211072}, {\"yaw\": 69.0948425521107, \"pitch\": 0.0}]", "state_dtype": "bfloat16"}},
  "9": {"class_type": "AIRenderPanoramaPerspective", "inputs": {"image": ["1", 0], "geometry_json": ["8", 1], "view_id": ["8", 2]}},
  "10": {"class_type": "VAEEncode", "inputs": {"pixels": ["9", 0], "vae": ["6", 0]}},
  "11": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["4", 0], "latent": ["10", 0]}},
  "12": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["5", 0], "latent": ["10", 0]}},
  "13": {"class_type": "CFGGuider", "inputs": {"model": ["2", 0], "positive": ["11", 0], "negative": ["12", 0], "cfg": 1.0}},
  "14": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
  "15": {"class_type": "DisableNoise", "inputs": {}},
  "16": {"class_type": "AIRenderSphereGather", "inputs": {"state": ["8", 0], "geometry_json": ["8", 1]}},
  "17": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["16", 0], "reference": ["10", 0], "direction": "initial_noise", "sigma": 0.9999999403953552, "reference_coefficient": 5.960464477539063e-08}},
  "18": {"class_type": "LatentMultiply", "inputs": {"samples": ["17", 0], "multiplier": 0.0}},
  "19": {"class_type": "VOIDWarpedNoiseSource", "inputs": {"warped_noise": ["17", 0]}},
  "20": {"class_type": "ManualSigmas", "inputs": {"sigmas": "0.9999999403953552, 0.9575182795524597"}},
  "21": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["19", 0], "guider": ["13", 0], "sampler": ["14", 0], "sigmas": ["20", 0], "latent_image": ["18", 0]}},
  "22": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["21", 0], "reference": ["10", 0], "direction": "from_sampler", "sigma": 0.9575182795524597, "reference_coefficient": -0.04248172044754028}},
  "23": {"class_type": "AIRenderSphereScatterMean", "inputs": {"base": ["8", 0], "views": ["22", 0], "weights": ["16", 1], "geometry_json": ["8", 1]}},
  "24": {"class_type": "AIRenderSphereGather", "inputs": {"state": ["23", 0], "geometry_json": ["8", 1]}},
  "25": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["24", 0], "reference": ["10", 0], "direction": "to_sampler", "sigma": 0.9575182795524597, "reference_coefficient": 0.04248172044754028}},
  "26": {"class_type": "ManualSigmas", "inputs": {"sigmas": "0.9575182795524597, 0.8825350403785706"}},
  "27": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["15", 0], "guider": ["13", 0], "sampler": ["14", 0], "sigmas": ["26", 0], "latent_image": ["25", 0]}},
  "28": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["27", 0], "reference": ["10", 0], "direction": "from_sampler", "sigma": 0.8825350403785706, "reference_coefficient": -0.11746495962142944}},
  "29": {"class_type": "AIRenderSphereScatterMean", "inputs": {"base": ["23", 0], "views": ["28", 0], "weights": ["24", 1], "geometry_json": ["8", 1]}},
  "30": {"class_type": "AIRenderSphereGather", "inputs": {"state": ["29", 0], "geometry_json": ["8", 1]}},
  "31": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["30", 0], "reference": ["10", 0], "direction": "to_sampler", "sigma": 0.8825350403785706, "reference_coefficient": 0.11746495962142944}},
  "32": {"class_type": "ManualSigmas", "inputs": {"sigmas": "0.8825350403785706, 0.7146439552307129"}},
  "33": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["15", 0], "guider": ["13", 0], "sampler": ["14", 0], "sigmas": ["32", 0], "latent_image": ["31", 0]}},
  "34": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["33", 0], "reference": ["10", 0], "direction": "from_sampler", "sigma": 0.7146439552307129, "reference_coefficient": -0.2853560447692871}},
  "35": {"class_type": "AIRenderSphereScatterMean", "inputs": {"base": ["29", 0], "views": ["34", 0], "weights": ["30", 1], "geometry_json": ["8", 1]}},
  "36": {"class_type": "AIRenderSphereGather", "inputs": {"state": ["35", 0], "geometry_json": ["8", 1]}},
  "37": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["36", 0], "reference": ["10", 0], "direction": "to_sampler", "sigma": 0.7146439552307129, "reference_coefficient": 0.2853560447692871}},
  "38": {"class_type": "ManualSigmas", "inputs": {"sigmas": "0.7146439552307129, 0.0000000000000000"}},
  "39": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["15", 0], "guider": ["13", 0], "sampler": ["14", 0], "sigmas": ["38", 0], "latent_image": ["37", 0]}},
  "40": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["39", 0], "reference": ["10", 0], "direction": "from_sampler", "sigma": 0.0, "reference_coefficient": -1.0}},
  "41": {"class_type": "AIRenderSphereScatterMean", "inputs": {"base": ["35", 0], "views": ["40", 0], "weights": ["36", 1], "geometry_json": ["8", 1]}},
  "42": {"class_type": "AIRenderSphereGather", "inputs": {"state": ["41", 0], "geometry_json": ["8", 1]}},
  "43": {"class_type": "AIRenderFlowStateConvert", "inputs": {"model": ["2", 0], "samples": ["42", 0], "reference": ["10", 0], "direction": "to_sampler", "sigma": 0.0, "reference_coefficient": 1.0}},
  "44": {"class_type": "VAEDecode", "inputs": {"samples": ["43", 0], "vae": ["6", 0]}},
  "45": {"class_type": "AIRenderPerspectivePanoramaMerge", "inputs": {"images": ["44", 0], "geometry_json": ["8", 1], "base": ["1", 0], "temperature": 0.1}},
  "46": {"class_type": "SaveImage", "inputs": {"images": ["45", 0], "filename_prefix": ""}},
};
export const PANORAMA_REQUIRED_NODES = Object.freeze([...new Set(Object.values(SOURCE_GRAPH).map(node => node.class_type))]);
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });

export function panoramaArtifactPrefix(key) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key || "")) throw fail("全景工作流产物键无效");
  return `CanvasLab_PanoramaR54_${key}`;
}

export function panoramaSourceDimensions(imageBase64) {
  const bytes = Buffer.from(String(imageBase64 || ""), "base64");
  const dimensions = readImageDimensions(bytes, "image/png")
    || readImageDimensions(bytes, "image/jpeg") || readImageDimensions(bytes, "image/webp");
  if (!dimensions || !Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height)
    || dimensions.width < 2 || dimensions.height < 1 || dimensions.width !== dimensions.height * 2) {
    throw fail("全景 R5_4 需要真实尺寸为 2:1 的 PNG、JPEG 或 WebP 图片");
  }
  return dimensions;
}

export function createPanoramaWorkflow({ artifactKey, generationRequest = {}, imageBase64, prompt, negativePrompt, seed, width, height }) {
  if (generationRequest.workflow_kind !== PANORAMA_WORKFLOW.id) throw fail("全景工作流身份不匹配");
  const source = panoramaSourceDimensions(imageBase64);
  if (width !== source.width || height !== source.height) throw fail("全景工作流尺寸必须与原图真实尺寸一致");
  if (!Number.isSafeInteger(seed) || seed < 0) throw fail("全景工作流随机种子无效");
  const negative = String(negativePrompt || "").trim();
  if (negative.length > 8000) throw fail("全景负向提示词不能超过 8000 个字符");
  const graph = structuredClone(SOURCE_GRAPH);
  graph["1"].inputs.base64_data = imageBase64;
  graph["1"].inputs.save_prefix = `CanvasLab_PanoramaInput_${artifactKey}`;
  graph["4"].inputs.text = String(prompt || "").trim();
  graph["5"].inputs.text = negative;
  graph["7"].inputs.noise_seed = seed;
  graph["46"].inputs.filename_prefix = panoramaArtifactPrefix(artifactKey);
  return graph;
}

export function panoramaWorkflowMetadata({ generationRequest, historyOutputs, actualOutputWidth, actualOutputHeight, width, height, ...actual }) {
  if (generationRequest?.workflow_kind !== PANORAMA_WORKFLOW.id
    || actualOutputWidth !== width || actualOutputHeight !== height || width !== height * 2) {
    throw fail("MaaS 全景结果尺寸与本次原图尺寸不一致", 502);
  }
  if (!/^[a-f0-9]{64}$/.test(actual.outputSha256 || "")) throw fail("MaaS 全景结果缺少有效 SHA-256", 502);
  return {
    ...actual,
    workflowId: PANORAMA_WORKFLOW.id,
    workflowVersion: PANORAMA_WORKFLOW.version,
    sourceWorkflowSha256: PANORAMA_WORKFLOW.sourceWorkflowSha256,
    model: PANORAMA_WORKFLOW.model,
    steps: PANORAMA_WORKFLOW.steps,
    sampler: "euler",
    cfg: 1,
    viewCount: PANORAMA_WORKFLOW.viewCount,
    viewWidth: PANORAMA_WORKFLOW.viewWidth,
    viewHeight: PANORAMA_WORKFLOW.viewHeight,
    fov: PANORAMA_WORKFLOW.fov,
    panoramaSphericalSampling: true,
    inferenceSize: `${PANORAMA_WORKFLOW.viewWidth}x${PANORAMA_WORKFLOW.viewHeight} × ${PANORAMA_WORKFLOW.viewCount}`,
    outputWidth: actualOutputWidth,
    outputHeight: actualOutputHeight,
    postUpscaled: false,
    outputSizing: "source-original",
  };
}
