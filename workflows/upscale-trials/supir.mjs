/**
 * [INPUT]: 依赖当前ComfyUI-SUPIR直接权重加载器/v2采样节点、已安装Q/SDXL权重、32对齐画布、原图Base64和请求级产物键
 * [OUTPUT]: 提供SUPIR实验常量与双分支执行图；一次编码、相同seed/参数、仅正向词不同的两张原生PNG
 * [POS]: workflows/upscale-trials的SUPIR实验真源，由run.mjs消费，不改变六套SeedVR2或主/Beta运行目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const SUPIR_TRIAL = Object.freeze({
  version: "2026-11-03.2",
  model: "SUPIR/SUPIR-v0Q_fp16.safetensors",
  sdxl: "SUPIR/Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
  seed: 20261103,
  steps: 45,
  outputNodeId: "result",
  variants: ["baseline", "interior"],
  prompts: Object.freeze({
    baseline: "high quality, detailed",
    interior: "Faithful interior image restoration, unchanged camera and perspective, original architecture and furniture layout, original material colors and texture patterns, original lighting and shadows, natural fabric weave, subtle wood grain and stone detail, clean edges, restrained sharpness, realistic fine detail consistent with the source image.",
  }),
  negative: "redesign, changed layout, added objects, replaced materials, altered lighting, invented patterns, excessive texture, oversharpening, halos, text, watermark, blurry",
});

export const supirArtifactPrefix = (key) => `CanvasLab_SUPIR_Trial_${key}`;

export function createSupirTrialWorkflow({ artifactKey, generationRequest, imageBase64, seed }) {
  const { width, height } = generationRequest;
  if (![width, height].every(value => Number.isInteger(value) && value >= 64 && value <= 2048 && value % 32 === 0)) {
    throw new Error("SUPIR首试推理画布须为32倍数且每轴不超过2048px");
  }
  const node = (class_type, inputs) => ({ class_type, inputs });
  const graph = {
    input: node("easy loadImageBase64", { base64_data: imageBase64, image_output: "Hide", save_prefix: "CanvasLab_SUPIR_Trial_Input" }),
    resize: node("ImageScale", { image: ["input", 0], upscale_method: "lanczos", width, height, crop: "disabled" }),
    // -------- 直接读取权重，避免旧v2加载器反向导出新版Comfy模型时失败 --------
    loader: node("SUPIR_model_loader", {
      sdxl_model: SUPIR_TRIAL.sdxl,
      supir_model: SUPIR_TRIAL.model, fp8_unet: false, diffusion_dtype: "auto",
    }),
    encode: node("SUPIR_encode", {
      SUPIR_VAE: ["loader", 1], image: ["resize", 0], use_tiled_vae: true,
      encoder_tile_size: 512, encoder_dtype: "auto",
    }),
  };
  // -------- 两支共用同一次随机VAE后验；采样器各自重置相同seed --------
  for (const variant of SUPIR_TRIAL.variants) {
    graph[`${variant}Condition`] = node("SUPIR_conditioner", {
      SUPIR_model: ["loader", 0], latents: ["encode", 0],
      positive_prompt: SUPIR_TRIAL.prompts[variant], negative_prompt: SUPIR_TRIAL.negative,
    });
    graph[`${variant}Sample`] = node("SUPIR_sample", {
      SUPIR_model: ["loader", 0], latents: ["encode", 0],
      positive: [`${variant}Condition`, 0], negative: [`${variant}Condition`, 1],
      seed, steps: SUPIR_TRIAL.steps, cfg_scale_start: 4, cfg_scale_end: 4,
      EDM_s_churn: 0, s_noise: 1.003, DPMPP_eta: 1,
      control_scale_start: 1, control_scale_end: 1, restore_cfg: 4,
      keep_model_loaded: false, sampler: "RestoreEDMSampler",
    });
    graph[`${variant}Decode`] = node("SUPIR_decode", {
      SUPIR_VAE: ["loader", 1], latents: [`${variant}Sample`, 0],
      use_tiled_vae: true, decoder_tile_size: 512,
    });
  }
  graph.batch = node("ImageBatch", { image1: ["baselineDecode", 0], image2: ["interiorDecode", 0] });
  graph.result = node("SaveImage", { images: ["batch", 0], filename_prefix: supirArtifactPrefix(artifactKey) });
  return graph;
}
