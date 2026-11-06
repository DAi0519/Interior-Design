/**
 * [INPUT]: 依赖ComfyUI原生SDXL/Tile节点、已安装TTPlanet v2、32对齐画布及共享SUPIR实验提示词
 * [OUTPUT]: 提供Tile图生图超分双支实验图，单次VAE编码/同种子/同控制强度与低去噪，仅正向不同
 * [POS]: workflows/upscale-trials的原生Tile备选路径，供run.mjs消费，不改主工作台或SeedVR2目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { SUPIR_TRIAL } from "./supir.mjs";

export const TILE_TRIAL = Object.freeze({
  ...SUPIR_TRIAL, version: "2026-11-03.tile.1", steps: 20,
  model: "sdxl/TTPLANET_Controlnet_Tile_realistic_v2_fp16.safetensors",
});
export const tileArtifactPrefix = key => `CanvasLab_Tile_Trial_${key}`;

export function createTileTrialWorkflow({ artifactKey, generationRequest, imageBase64, seed }) {
  const { width, height } = generationRequest;
  if (![width, height].every(value => Number.isInteger(value) && value >= 64 && value <= 2048 && value % 32 === 0)) {
    throw new Error("Tile首试推理画布须为32倍数且每轴不超过2048px");
  }
  const node = (class_type, inputs) => ({ class_type, inputs });
  const graph = {
    input: node("easy loadImageBase64", { base64_data: imageBase64, image_output: "Hide", save_prefix: "CanvasLab_Tile_Trial_Input" }),
    resize: node("ImageScale", { image: ["input", 0], upscale_method: "lanczos", width, height, crop: "disabled" }),
    checkpoint: node("CheckpointLoaderSimple", { ckpt_name: TILE_TRIAL.sdxl }),
    tile: node("ControlNetLoader", { control_net_name: TILE_TRIAL.model }),
    encode: node("VAEEncode", { pixels: ["resize", 0], vae: ["checkpoint", 2] }),
    negative: node("CLIPTextEncode", { text: TILE_TRIAL.negative, clip: ["checkpoint", 1] }),
  };
  for (const variant of TILE_TRIAL.variants) {
    graph[`${variant}Text`] = node("CLIPTextEncode", { text: TILE_TRIAL.prompts[variant], clip: ["checkpoint", 1] });
    graph[`${variant}Control`] = node("ControlNetApplyAdvanced", {
      positive: [`${variant}Text`, 0], negative: ["negative", 0], control_net: ["tile", 0],
      image: ["resize", 0], strength: 0.9, start_percent: 0, end_percent: 1,
    });
    graph[`${variant}Sample`] = node("KSampler", {
      model: ["checkpoint", 0], positive: [`${variant}Control`, 0], negative: [`${variant}Control`, 1],
      latent_image: ["encode", 0], seed, steps: TILE_TRIAL.steps, cfg: 4,
      sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 0.3,
    });
    graph[`${variant}Decode`] = node("VAEDecode", { samples: [`${variant}Sample`, 0], vae: ["checkpoint", 2] });
  }
  graph.batch = node("ImageBatch", { image1: ["baselineDecode", 0], image2: ["interiorDecode", 0] });
  graph.result = node("SaveImage", { images: ["batch", 0], filename_prefix: tileArtifactPrefix(artifactKey) });
  return graph;
}
