/**
 * [INPUT]: 依赖用户双图编辑骨架、共享ComfyUI传输/节点准入、1K/2K纯规则与实际双图字节
 * [OUTPUT]: 对外提供精模及效果图光影转换共用4步/CFG1/Euler双参考执行图、单/双图路由和独立产物元数据
 * [POS]: src的光影双图Flux适配器，普通Flux仍用原单图工作流，不持有运营Prompt
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { createComfyUiClient } from "./comfyui-client.mjs";
import { verifyMultiAngleCapabilities } from "./image-multi-angle-workflow.mjs";
import { REFINED_FLUX_REFERENCE, refinedFluxDimensions } from "../public/refined-flux-reference.js";

export const FLUX_REFERENCE_SOURCE_SHA256 = "3b425d6e90486a6ba3422c2c14cf4fd4479941d0201bbd3c69a8417a9411aeca";
export const FLUX_REFERENCE_MODEL = "flux-2-klein-9b-fp8.safetensors";
export const FLUX_REFERENCE_ENCODER = "qwen_3_8b_fp8mixed.safetensors";
export function refinedFluxArtifactPrefix(key) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key || "")) throw new TypeError("精模双图产物键无效");
  return `CanvasLab_RefinedFlux_${key}`;
}
const node = (class_type, inputs) => ({ class_type, inputs });
export function createRefinedFluxWorkflow({ artifactKey, generationRequest: request, references, prompt, seed, width, height }) {
  if (request?.workflow_kind !== REFINED_FLUX_REFERENCE.id || request.upscale_resolution
    || !REFINED_FLUX_REFERENCE.longEdges[request.resolution] || references?.length !== 2
    || Math.max(width, height) !== REFINED_FLUX_REFERENCE.longEdges[request.resolution]
    || ![width, height].every(n => Number.isInteger(n) && n >= 16 && n % 16 === 0)) throw new TypeError("精模Flux双图请求或尺寸无效");
  const graph = {
    model: node("UNETLoader", { unet_name: FLUX_REFERENCE_MODEL, weight_dtype: "default" }),
    clip: node("CLIPLoader", { clip_name: FLUX_REFERENCE_ENCODER, type: "flux2", device: "default" }),
    vae: node("VAELoader", { vae_name: "flux2-vae.safetensors" }),
    positive: node("CLIPTextEncode", { clip: ["clip", 0], text: String(prompt || "") }),
    negative: node("ConditioningZeroOut", { conditioning: ["positive", 0] }),
    latent: node("EmptyFlux2LatentImage", { width, height, batch_size: 1 }),
    schedule: node("Flux2Scheduler", { width, height, steps: 4 }),
    noise: node("RandomNoise", { noise_seed: seed }),
    sampler: node("KSamplerSelect", { sampler_name: "euler" }),
  };
  references.forEach((image, i) => {
    const dimensions = i === 0 ? { width, height } : refinedFluxDimensions(image, request.resolution);
    graph[`input${i}`] = node("easy loadImageBase64", { base64_data: image.base64, image_output: "Hide", save_prefix: `RefinedInput_${artifactKey}_${i}` });
    graph[`resize${i}`] = node("ImageResize+", { image: [`input${i}`, 0], ...dimensions,
      interpolation: "lanczos", method: "stretch", condition: "always", multiple_of: 0 });
    graph[`encode${i}`] = node("VAEEncode", { pixels: [`resize${i}`, 0], vae: ["vae", 0] });
    for (const branch of ["positive", "negative"]) graph[`${branch}${i}`] = node("ReferenceLatent", {
      conditioning: [i ? `${branch}0` : branch, 0], latent: [`encode${i}`, 0],
    });
  });
  graph.guider = node("CFGGuider", { model: ["model", 0], positive: ["positive1", 0], negative: ["negative1", 0], cfg: 1 });
  graph.sample = node("SamplerCustomAdvanced", { noise: ["noise", 0], guider: ["guider", 0], sampler: ["sampler", 0], sigmas: ["schedule", 0], latent_image: ["latent", 0] });
  graph.decode = node("VAEDecode", { samples: ["sample", 0], vae: ["vae", 0] });
  graph.result = node("SaveImage", { images: ["decode", 0], filename_prefix: refinedFluxArtifactPrefix(artifactKey) });
  return graph;
}
export function refinedFluxMetadata({ generationRequest, actualOutputWidth, actualOutputHeight, ...actual }) {
  if (actualOutputWidth !== generationRequest.width || actualOutputHeight !== generationRequest.height) throw new Error("精模Flux双图实际输出尺寸与计划不一致");
  return { ...actual, workflowId: REFINED_FLUX_REFERENCE.id, workflowVersion: REFINED_FLUX_REFERENCE.version,
    sourceWorkflowSha256: FLUX_REFERENCE_SOURCE_SHA256, model: FLUX_REFERENCE_MODEL, steps: 4, cfg: 1, sampler: "euler", batchSize: 1,
    outputWidth: actualOutputWidth, outputHeight: actualOutputHeight, postUpscaled: false,
    inputImages: generationRequest.images.map((x, i) => ({ role: i === 0 ? "source" : "atmosphere",
      sha256: createHash("sha256").update(Buffer.from(x.image_url.split(",")[1], "base64")).digest("hex") })) };
}
export function createRefinedFluxClient(options = {}) {
  const single = createComfyUiClient(options);
  const dual = createComfyUiClient({ ...options, referenceImageCount: 2,
    artifactPrefix: refinedFluxArtifactPrefix, outputNodeId: "result",
    workflowFactory: createRefinedFluxWorkflow, workflowMetadataFactory: refinedFluxMetadata });
  return { ...single, async generateImage(request, runOptions) {
    if (request.workflow_kind !== REFINED_FLUX_REFERENCE.id) return single.generateImage(request, runOptions);
    // --- 收费提交前核验节点端口、模型枚举和连线，不自动重提生成 ---
    const graph = createRefinedFluxWorkflow({ artifactKey: "capability-check", generationRequest: request,
      references: request.images.map(() => ({ base64: "", width: request.width, height: request.height })),
      width: request.width, height: request.height, prompt: request.prompt, seed: 1 });
    verifyMultiAngleCapabilities(graph, await dual.getObjectInfo([...new Set(Object.values(graph).map(n => n.class_type))]));
    return dual.generateImage(request, runOptions);
  } };
}
