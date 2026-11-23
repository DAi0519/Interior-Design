/**
 * [INPUT]: 依赖 node:test/assert、sharp、FastFlux2 附件语义归档及实时 MaaS 节点合同的脱敏快照
 * [OUTPUT]: 对外提供FastFlux2/LoRA/色彩匹配源图一致性、正负词/种子注入、付费前准入、单次提交、产物身份/尺寸与 SHA 回归保障
 * [POS]: test 的全景球面工作流合同测试，所有 HTTP 均由内存替身提供，不提交真实 GPU 任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { createPanoramaClient } from "../src/panorama-client.mjs";
import {
  PANORAMA_REQUIRED_NODES, PANORAMA_WORKFLOW, createPanoramaWorkflow,
  panoramaArtifactPrefix, panoramaWorkflowMetadata,
} from "../src/panorama-workflow.mjs";

// --- 2026-11-18 楚雄 MaaS object_info：仅保留真实输入类型/枚举与输出端口 ---
const NODE_SCHEMA = {
  "AIRenderFlowStateConvert": {"input":{"required":{"model":["MODEL"],"samples":["LATENT"],"direction":[["initial_noise","to_sampler","from_sampler"]],"sigma":["FLOAT"],"reference_coefficient":["FLOAT"]},"optional":{"reference":["LATENT"]}},"output":["LATENT"]},
  "AIRenderPanoramaPerspective": {"input":{"required":{"image":["IMAGE"],"geometry_json":["STRING"],"view_id":["INT"]},"optional":{"cpu_workers":["INT"],"banded_rays":["BOOLEAN"]}},"output":["IMAGE"]},
  "AIRenderPerspectivePanoramaMerge": {"input":{"required":{"images":["IMAGE"],"geometry_json":["STRING"],"base":["IMAGE"],"temperature":["FLOAT"]},"optional":{"cpu_workers":["INT"]}},"output":["IMAGE"]},
  "AIRenderSphereGather": {"input":{"required":{"state":["LATENT"],"geometry_json":["STRING"]}},"output":["LATENT","MASK"]},
  "AIRenderSphereScatterMean": {"input":{"required":{"base":["LATENT"],"views":["LATENT"],"weights":["MASK"],"geometry_json":["STRING"]}},"output":["LATENT"]},
  "AIRenderSphereSetup": {"input":{"required":{"noise":["NOISE"],"preset":[["cube14","custom"]],"view_width":["INT"],"view_height":["INT"],"fov":["FLOAT"],"candidate_points":["INT"],"temperature":["FLOAT"],"max_assignment_error":["FLOAT"],"custom_views":["STRING"],"state_dtype":[["bfloat16","float32"]]},"optional":{"cpu_workers":["INT"],"assignment_block_size":["INT"],"compact_candidates":["BOOLEAN"]}},"output":["LATENT","STRING","INT","INT"]},
  "CFGGuider": {"input":{"required":{"model":["MODEL"],"positive":["CONDITIONING"],"negative":["CONDITIONING"],"cfg":["FLOAT"]}},"output":["GUIDER"]},
  "CLIPLoader": {"input":{"required":{"clip_name":[["awq-int4-flux.1-t5xxl.safetensors","clip_l.safetensors","minimax-h3/qwen3vl_32b_minimax_h3_int8_convrot.safetensors","minimax-h3/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors","model.fp16.safetensors","qwen3vl_4b_int8_convrot.safetensors","qwen3vl_8b_int8_convrot.safetensors","qwen_2.5_vl_7b_fp8_scaled.safetensors","qwen_3_4b.safetensors","qwen_3_8b.safetensors","qwen_3_8b_fp4mixed.safetensors","qwen_3_8b_fp8mixed.safetensors","t5_base.safetensors","t5xxl_fp16.safetensors","t5xxl_fp8_e4m3fn.safetensors","umt5_xxl_fp8_e4m3fn_scaled.safetensors"]],"type":[["stable_diffusion","stable_cascade","sd3","stable_audio","mochi","ltxv","pixart","cosmos","lumina2","wan","hidream","chroma","ace","omnigen2","qwen_image","hunyuan_image","flux2","ovis","longcat_image","cogvideox","lens","pixeldit","ideogram4","boogu","krea2","joyimage","mage","minimax","yue2"]]},"optional":{"device":[["default","cpu"]]}},"output":["CLIP"]},
  "DisableNoise": {"input":{"required":{}},"output":["NOISE"]},
  "JHPixelProColorMatcher": {"input":{"required":{"image_target":["IMAGE"],"image_reference":["IMAGE"],"channels":[["ab","lab"]],"strength":["FLOAT"]},"optional":{"mask":["MASK"]}},"output":["IMAGE"]},
  "KSamplerSelect": {"input":{"required":{"sampler_name":["COMBO",{"multiselect":false,"options":["euler","euler_cfg_pp","euler_ancestral","euler_ancestral_cfg_pp","heun","heunpp2","exp_heun_2_x0","exp_heun_2_x0_sde","dpm_2","dpm_2_ancestral","lms","dpm_fast","dpm_adaptive","dpmpp_2s_ancestral","dpmpp_2s_ancestral_cfg_pp","dpmpp_sde","dpmpp_sde_gpu","dpmpp_2m","dpmpp_2m_cfg_pp","dpmpp_2m_sde","dpmpp_2m_sde_gpu","dpmpp_2m_sde_heun","dpmpp_2m_sde_heun_gpu","dpmpp_3m_sde","dpmpp_3m_sde_gpu","ddpm","lcm","ipndm","ipndm_v","deis","cfgpp_ud10_ab","res_multistep","res_multistep_cfg_pp","res_multistep_ancestral","res_multistep_ancestral_cfg_pp","gradient_estimation","gradient_estimation_cfg_pp","er_sde","seeds_2","seeds_3","sa_solver","sa_solver_pece","ddim","uni_pc","uni_pc_bh2","euler_panorama"]}]}},"output":["SAMPLER"]},
  "LatentMultiply": {"input":{"required":{"samples":["LATENT"],"multiplier":["FLOAT"]}},"output":["LATENT"]},
  "LoraLoaderModelOnly": {"input":{"required":{"model":["MODEL"],"lora_name":[["Front_to_ZhouCe.safetensors","Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors","Qwen-Image-Edit-2511-Lightning-4steps-V1.0-fp32.safetensors","Qwen-Image-In-Context-Control-Union.safetensors","Qwen-Image-Lightning-8steps-V1.1.safetensors","Qwen-Imagehands_plus_detailer.safetensors","Qwen_Edit_Lens_Transformation.safetensors","Qwen_Image_Lightning_8steps_V2.0.safetensors","WanAnimate_relight_lora_fp16.safetensors","color_guard_v8_checkpoint_newstep0250_cab6292344a8.safetensors","floor_plan/ChunSeGaoLiang.safetensors","floor_plan/HeiBaiHui.safetensors","floor_plan/MaKaLongSe.safetensors","floor_plan/MoLanDiNaiYou.safetensors","floor_plan/XianDaiFeng.safetensors","floor_plan/XiaoQingXin.safetensors","floor_plan/XinZhongShi.safetensors","flux/Hyper-FLUX.1-dev-8steps-lora.safetensors","flux/Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors","flux/adding_ornamant_flux2_klein9B_000007000.safetensors","flux/erase-step-8000.safetensors","flux/flux2-klein-base-9B-enh-i2p-0320-26-v4-ct8w-fix-yaw-sft-1e-4-256-30000.safetensors","flux/flux2-klein-base-9b-i2p-all-dataset-ct8w-consistence-main-latest-with-edit-image-dist-with-3k-angel-biased-wi-10-view-special-step-88000.safetensors","flux/flux2-klein-base-9b-i2p-opd-20-to-8-distill-step1-step-8000.safetensors","flux/flux2_datasetv2_step-7000.safetensors","flux/flux2_klein9B_zhiganEnhance_v1_000006000.safetensors","flux/flux2_klein9B_zhiganEnhance_v1_000008000.safetensors","flux/flux_klein_lora_filter_day_light_000008000.safetensors","flux/flux_klein_lora_filter_night_light_000008000.safetensors","flux/flux_kontext_lora_window_v2.safetensors","flux/flux_realism_lora.safetensors","flux/kontext-panorama-lora.safetensors","flux/ks_relight.safetensors","flux/midjourney_whisper_flux_lora_v01.safetensors","flux/panorama_adding_ornamant_flux2_klein9B_v3_000004000.safetensors","flux/pers_to_pano_flux2_klein9B_panorama_removing_wi_short_caption_v3_000006000.safetensors","flux2-klein-Enhancement-lora.safetensors","flux2-klein-base-9b-i2p-all-dataset-ct8w-consistence-main-latest-with-edit-image-dist-step-88000.safetensors","flux2-klein-base-9b-i2p-all-dataset-ct8w-one-edit-with-special-angle-biased/flux2-klein-base-9b-i2p-all-dataset-ct8w-one-edit-with-special-angle-biased-step-48000.safetensors","flux2_klein9B_zhiganEnhance_v2_000006000.safetensors","flux2_klein9B_zhiganEnhance_v2_000008000.safetensors","flux2_klein_user_v3_realism.safetensors","hypersd/Hyper-SD15-8steps-CFG-lora.safetensors","hypersd/Hyper-SD15-8steps-lora.safetensors","hypersd/Hyper-SDXL-8steps-CFG-lora.safetensors","hypersd/Hyper-SDXL-8steps-lora.safetensors","industry_simple_v2.0.safetensors","keepillum_klein_base9b_overfit_step4000_32f94a92.safetensors","keepillum_klein_base9b_pilot_v1.safetensors","kontext/flux_kontext_panorama_lighting_all_v1_000008000.safetensors","lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors","lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank128_bf16.safetensors","meijian/ht20-棚拍-家电-v1.safetensors","minimax-h3/MysticXXX_MMH3-V1.safetensors","minimax-h3/minimax_h3_dmad_full_dareties_v4_step600_comfy_fro.safetensors","minimax-h3/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy.safetensors","minimax-h3/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors","minimax-h3/minimax_h3_fl2v_lightx2v_turbo_4step_v1.0_768p_resized_avg_rank_31_bf16.safetensors","minimax-h3/minimax_h3_fl2v_lightx2v_turbo_8step_v1.0_resized_avg_rank_24_bf16.safetensors","minimax-h3/minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors","minimax-h3/minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16.safetensors","minimax-h3/minimax_h3_turbo_4step_ema_ckpt850_pruned_comfyui.safetensors","minimax-h3/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors","pers_to_pano_flux2_klein9B_panorama_removing_wi_short_caption_000002000.safetensors","qwen_edit/2025-12-11_mix_motion-000046.safetensors","qwen_edit/2025-12-17_合成_front_view-000039.safetensors","qwen_edit/2025-12-26-mix_motion_simple_prompt-000065.safetensors","qwen_edit/Qwen-Edit-2509-光线迁移.safetensors","qwen_edit/qwen扩图填充PS创成式填充_v1.safetensors","qwen_edit_溶图.safetensors","sd15/sd15_侘寂.safetensors","sd15/sd15_北欧.safetensors","sd15/sd15_原木.safetensors","sd15/sd15_台式.safetensors","sd15/sd15_地中海.safetensors","sd15/sd15_奶油.safetensors","sd15/sd15_工业风.safetensors","sd15/sd15_新中式.safetensors","sd15/sd15_日式.safetensors","sd15/sd15_极简.safetensors","sd15/sd15_欧式.safetensors","sd15/sd15_法式.safetensors","sd15/sd15_混搭.safetensors","sd15/sd15_现代.safetensors","sd15/sd15_简约.safetensors","sd15/sd15_美式.safetensors","sd15/sd15_轻奢.safetensors","sd15/sd15_高级灰.safetensors","sdxl/StickersRedmond.safetensors","sdxl/StudioGhibli.Redmond-StdGBRRedmAF-StudioGhibli.safetensors","sdxl/sdxl_侘寂.safetensors","sdxl/sdxl_北欧.safetensors","sdxl/sdxl_原木.safetensors","sdxl/sdxl_台式.safetensors","sdxl/sdxl_地中海.safetensors","sdxl/sdxl_奶油.safetensors","sdxl/sdxl_新中式.safetensors","sdxl/sdxl_日式.safetensors","sdxl/sdxl_极简.safetensors","sdxl/sdxl_欧式.safetensors","sdxl/sdxl_法式.safetensors","sdxl/sdxl_现代.safetensors","sdxl/sdxl_简约.safetensors","sdxl/sdxl_美式.safetensors","sdxl/sdxl_轻奢.safetensors","sdxl/sdxl_高级灰.safetensors","合成窗型训练接_20260915_step_10000.safetensors","镜头转换.safetensors"]],"strength_model":["FLOAT"]}},"output":["MODEL"]},
  "ManualSigmas": {"input":{"required":{"sigmas":["STRING"]}},"output":["SIGMAS"]},
  "ModelAttentionBackend": {"input":{"required":{"model":["MODEL"],"attention":["COMBO",{"display_name":"backend","tooltip":"The dense attention backend. Comfy Kitchen attention uses quantized INT8 attention and is available only on Nvidia and AMD GPUs.","default":"pytorch attention","multiselect":false,"options":["pytorch attention","comfy kitchen attention"]}]}},"output":["MODEL"]},
  "QunheFastFlux2Model": {"input":{"required":{"model":["MODEL"],"attention":[["q8","bf16"]]},"optional":{"kv_cache":[["auto","off"]]}},"output":["MODEL"]},
  "QunheFastFlux2TextEncode": {"input":{"required":{"text":["STRING"],"clip":["CLIP"]}},"output":["CONDITIONING"]},
  "QunheFastFlux2VAEDecode": {"input":{"required":{"samples":["LATENT"],"vae":["VAE"]}},"output":["IMAGE"]},
  "QunheFastFlux2VAEEncode": {"input":{"required":{"pixels":["IMAGE"],"vae":["VAE"]}},"output":["LATENT"]},
  "RandomNoise": {"input":{"required":{"noise_seed":["INT"]}},"output":["NOISE"]},
  "ReferenceLatent": {"input":{"required":{"conditioning":["CONDITIONING"]},"optional":{"latent":["LATENT"]}},"output":["CONDITIONING"]},
  "SamplerCustomAdvanced": {"input":{"required":{"noise":["NOISE"],"guider":["GUIDER"],"sampler":["SAMPLER"],"sigmas":["SIGMAS"],"latent_image":["LATENT"]}},"output":["LATENT","LATENT"]},
  "SaveImage": {"input":{"required":{"images":["IMAGE"],"filename_prefix":["STRING"]}},"output":["IMAGE"]},
  "UNETLoader": {"input":{"required":{"unet_name":[["Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors","flux-2-klein-4b-fp8.safetensors","flux-2-klein-9b-fp8.safetensors","flux-2-klein-9b-kv-fp8.safetensors","flux-2-klein-9b-nvfp4.safetensors","flux-2-klein-9b.safetensors","flux-2-klein-base-4b-fp8.safetensors","flux-2-klein-base-9b-fp8.safetensors","flux1-dev-fp8.safetensors","flux1-dev-kontext_fp8_scaled.safetensors","flux1-fill-dev-OneReward-fp8.safetensors","flux1-fill-dev.safetensors","flux1-kontext-dev-fp8-e4m3fn.safetensors","flux1-schnell-fp8-e4m3fn.safetensors","flux1-schnell.safetensors","hunyuan3d-dit-v2.0-fp16.safetensors","iclight_sd15_fbc.safetensors","iclight_sd15_fc.safetensors","kolors-unet.fp16.safetensors","minimax-h3/minimax_h3_fl2va_bf16.safetensors","minimax-h3/minimax_h3_fl2va_int8_convrot.safetensors","minimax-h3/minimax_h3_fl2va_pruned_fp8_scaled.safetensors","minimax-h3/minimax_h3_fl2va_pruned_int8_convrot.safetensors","minimax-h3/minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors","minimax-h3/minimax_h3_ref2va_int8_convrot.safetensors","minimax-h3/minimax_h3_ref2va_pruned_fp8_scaled.safetensors","minimax-h3/minimax_h3_ref2va_pruned_int8_convrot.safetensors","nunchaku-flux.1-kontext-dev/svdq-fp4_r32-flux.1-kontext-dev.safetensors","nunchaku-flux.1-kontext-dev/svdq-int4_r32-flux.1-kontext-dev.safetensors","qwen_image_edit/Qwen-Image-Edit-2509_fp8_e4m3fn.safetensors","qwen_image_edit/qwen_image_edit_2511_fp8mixed.safetensors","qwen_image_edit_2511_fp8mixed.safetensors","qwen_image_fp8_e4m3fn.safetensors","svdq-fp4-flux.1-dev/transformer_blocks.safetensors","svdq-fp4-flux.1-dev/unquantized_layers.safetensors","svdq-int4-flux.1-dev/transformer_blocks.safetensors","svdq-int4-flux.1-dev/unquantized_layers.safetensors","svdq-int4-flux.1-fill-dev/transformer_blocks.safetensors","svdq-int4-flux.1-fill-dev/unquantized_layers.safetensors","wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors","z_image_turbo_bf16.safetensors"]],"weight_dtype":[["default","fp8_e4m3fn","fp8_e4m3fn_fast","fp8_e5m2"]]}},"output":["MODEL"]},
  "VAELoader": {"input":{"required":{"vae_name":[["LOCO_vae.safetensors","ae.sft","ema_vae_fp16.safetensors","flux2-vae.safetensors","full_encoder_small_decoder.safetensors","hunyuan3d-vae-v2-1/model.fp16.ckpt","minimax-h3/minimax_h3_audio_vae_fp32.safetensors","minimax-h3/minimax_h3_video_vae_fp16.safetensors","minimax-h3/minimax_h3_video_vae_int8_convrot.safetensors","qwen_image_vae.safetensors","sdxl.vae.safetensors","vae-ft-mse-840000-ema-pruned.safetensors","wan2.1/Wan2_1_VAE_bf16.safetensors","wan2.1/wan_2.1_vae.safetensors","pixel_space"]]}},"output":["VAE"]},
  "VOIDWarpedNoiseSource": {"input":{"required":{"warped_noise":["LATENT"]}},"output":["NOISE"]},
  "easy loadImageBase64": {"input":{"required":{"base64_data":["STRING"],"image_output":[["Hide","Preview","Save","Hide/Save"]],"save_prefix":["STRING"]},"optional":{}},"output":["IMAGE","MASK"]},
};
const image = await sharp({ create: { width: 16, height: 8, channels: 3, background: "#ddd" } }).png().toBuffer();
const outputOtherSize = await sharp({ create: { width: 32, height: 16, channels: 3, background: "#ddd" } }).png().toBuffer();
const square = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ddd" } }).png().toBuffer();
const imageBase64 = image.toString("base64");
const request = () => ({ workflow_kind: PANORAMA_WORKFLOW.id, n: 1, width: 16, height: 8, resolution: "original",
  prompt: "保持房屋结构，将氛围转为温暖夜景", images: [{ image_url: `data:image/png;base64,${imageBase64}` }] });
const factoryInput = overrides => ({ artifactKey: "panorama-test-123", generationRequest: request(), imageBase64,
  prompt: request().prompt, seed: 42, width: 16, height: 8, ...overrides });

function fakeTransport({ catalog = structuredClone(NODE_SCHEMA), output = image, filename = null, promptStatus = 200 } = {}) {
  const calls = [];
  let submitted;
  const client = createPanoramaClient({
    baseUrl: "http://comfy.example/", randomId: () => "panorama-test-123", randomSeed: () => 42,
    pollIntervalMs: 0, waitImpl: async () => {}, webSocketFactory: null,
    async fetchImpl(url, options = {}) {
      const path = new URL(url).pathname;
      calls.push({ path, method: options.method || "GET" });
      if (path.startsWith("/object_info/")) {
        const type = decodeURIComponent(path.slice("/object_info/".length));
        return Response.json(catalog[type] ? { [type]: catalog[type] } : {});
      }
      if (path === "/prompt") {
        submitted = JSON.parse(options.body).prompt;
        return Response.json({ prompt_id: "pano-prompt-1" }, { status: promptStatus });
      }
      if (path === "/history/pano-prompt-1") return Response.json({ "pano-prompt-1": {
        outputs: { "46": { images: [{ filename: filename || "CanvasLab_PanoramaR54_panorama-test-123_00001_.png", type: "output" }] } },
        status: { completed: true, status_str: "success", messages: [] },
      } });
      if (path === "/view") return new Response(output, { headers: { "Content-Type": "image/png" } });
      throw new Error(`unexpected path: ${path}`);
    },
  });
  return { client, calls, graph: () => submitted };
}

test("FastFlux2 保留附件计算节点与全部球面采样连线，只适配工作台输入、正文、种子与PNG保存", async () => {
  const originalBytes = await readFile(new URL("../workflows/panorama-enhancement/FastFlux2_workflow.json", import.meta.url));
  assert.equal(createHash("sha256").update(originalBytes).digest("hex"), "4a87f4696770a14aff9a07a7be55c53e76d6b79692bcdb009bf11642060394bb");
  assert.equal(PANORAMA_WORKFLOW.sourceWorkflowSha256, "d6c0da647a93152bc3f1bd0af1537b2a9be178b7d5d82f42684be61a68e12151");
  const original = JSON.parse(originalBytes);
  const nodeIds = new Map(original.nodes.map(node => [node.id,
    node.type === "ModelAttentionBackend" ? "59" : node.type === "QunheFastFlux2Model" ? "60" : node.title]));
  const links = new Map(original.links.map(link => [link[0], link]));
  const nodes = new Map(original.nodes.map(node => [node.id, node]));
  const inputReference = linkId => {
    const [, sourceId, outputIndex] = links.get(linkId);
    const node = nodes.get(sourceId);
    if (["Reroute", "MaaSCheckImageSize", "MaaSUrlLoader"].includes(node.type)) return ["1", 0];
    return [nodeIds.get(sourceId), outputIndex];
  };
  const graph = createPanoramaWorkflow(factoryInput());
  assert.equal(Object.keys(graph).length, 50);
  for (const node of original.nodes) {
    const id = nodeIds.get(node.id);
    if (!graph[id]) continue;
    if (["1", "4", "5", "7", "46"].includes(id)) continue;
    const inputs = { ...node.widgets_values_named };
    for (const input of node.inputs || []) {
      if (input.link !== null && input.link !== undefined) inputs[input.name] = inputReference(input.link);
    }
    if (id === "8") inputs.custom_views = inputs.custom_views.trim();
    assert.deepEqual(graph[id], { class_type: node.type, inputs }, `附件节点 ${id} 不应改变`);
  }
  assert.equal(JSON.parse(graph["8"].inputs.custom_views).length, 20);
  assert.equal(graph["8"].inputs.view_width, 1536);
  assert.deepEqual(graph["45"].inputs.base, ["1", 0]);
  assert.equal(graph["1"].class_type, "easy loadImageBase64");
  assert.equal(graph["1"].inputs.base64_data, imageBase64);
  assert.equal(graph["4"].class_type, "QunheFastFlux2TextEncode");
  assert.equal(graph["5"].class_type, "QunheFastFlux2TextEncode");
  assert.equal(graph["4"].inputs.text, request().prompt);
  assert.equal(graph["5"].inputs.text, "");
  assert.equal(graph["7"].inputs.noise_seed, 42);
  assert.equal(graph["46"].inputs.filename_prefix, panoramaArtifactPrefix("panorama-test-123"));
  assert.deepEqual(graph["46"].inputs.images, ["58", 0]);
  assert.equal(graph["57"].inputs.strength_model, 0.5);
  assert.equal(graph["58"].inputs.strength, 0.45);
  assert.equal(Object.values(graph).some(node => node.class_type.startsWith("MaaS")), false);
});

test("请求相互隔离，自定义负向整段注入且不附加普通 Flux 默认词", () => {
  const first = createPanoramaWorkflow(factoryInput({ negativePrompt: "  不要新增家具  " }));
  const second = createPanoramaWorkflow(factoryInput({ prompt: "另一个氛围", seed: 7 }));
  assert.equal(first["5"].inputs.text, "不要新增家具");
  assert.equal(second["5"].inputs.text, "");
  assert.equal(first["4"].inputs.text, request().prompt);
  assert.equal(second["7"].inputs.noise_seed, 7);
  assert.throws(() => createPanoramaWorkflow(factoryInput({ artifactKey: "../../old" })), /产物键/);
});

test("伪造请求宽高不能绕过真实 2:1 原图检查", async () => {
  const transport = fakeTransport();
  await assert.rejects(transport.client.generateImage({ ...request(), images: [{ image_url: `data:image/png;base64,${square.toString("base64")}` }] }), /真实尺寸为 2:1/);
  await assert.rejects(transport.client.generateImage({ ...request(), width: 32, height: 16 }), /真实尺寸不一致/);
  assert.equal(transport.calls.length, 0);
});

test("缺少球面、FastFlux2或色彩匹配节点，或LoRA枚举不匹配时阻断付费提交", async () => {
  for (const type of ["AIRenderSphereGather", "QunheFastFlux2Model", "QunheFastFlux2TextEncode", "QunheFastFlux2VAEEncode", "QunheFastFlux2VAEDecode", "JHPixelProColorMatcher"]) {
    const missing = structuredClone(NODE_SCHEMA);
    delete missing[type];
    const first = fakeTransport({ catalog: missing });
    await assert.rejects(first.client.generateImage(request()), error => error.statusCode === 409 && error.message.includes(type));
    assert.equal(first.calls.some(call => call.method === "POST"), false);
  }
  const invalid = structuredClone(NODE_SCHEMA);
  invalid.LoraLoaderModelOnly.input.required.lora_name = [["different-model.safetensors"]];
  const second = fakeTransport({ catalog: invalid });
  await assert.rejects(second.client.generateImage(request()), /模型或枚举不可用/);
  assert.equal(second.calls.some(call => call.method === "POST"), false);
});

test("通过实时目录准入后只提交一次，返回原尺寸结果与完整产物身份", async () => {
  const transport = fakeTransport();
  const result = await transport.client.generateImage(request());
  assert.equal(transport.calls.filter(call => call.method === "POST").length, 1);
  assert.equal(transport.calls.filter(call => call.path.startsWith("/object_info/")).length, PANORAMA_REQUIRED_NODES.length);
  assert.equal(transport.graph()["46"].class_type, "SaveImage");
  assert.equal(result.metadata.workflowId, "panorama-r5-4");
  assert.equal(result.metadata.steps, 4);
  assert.equal(result.metadata.workflowVersion, "2026-11-18.1");
  assert.equal(result.metadata.lora, "flux2_klein9B_zhiganEnhance_v2_000006000.safetensors");
  assert.equal(result.metadata.loraStrength, 0.5);
  assert.equal(result.metadata.attention, "q8");
  assert.equal(result.metadata.kvCache, "auto");
  assert.equal(result.metadata.colorMatchChannels, "ab");
  assert.equal(result.metadata.colorMatchStrength, 0.45);
  assert.equal(result.metadata.viewCount, 20);
  assert.equal(result.metadata.outputWidth, 16);
  assert.equal(result.metadata.outputHeight, 8);
  assert.equal(result.metadata.postUpscaled, false);
  assert.equal(result.metadata.outputSha256, createHash("sha256").update(image).digest("hex"));
  assert.equal(result.images[0].url, `data:image/png;base64,${imageBase64}`);
});

test("MaaS 提交失败不自动重提，错误产物身份与尺寸不被接受", async () => {
  const failing = fakeTransport({ promptStatus: 502 });
  await assert.rejects(failing.client.generateImage(request()));
  assert.equal(failing.calls.filter(call => call.method === "POST").length, 1);
  const stale = fakeTransport({ filename: "old-panorama_00001_.png" });
  await assert.rejects(stale.client.generateImage(request()), /请求身份不一致/);
  assert.equal(stale.calls.some(call => call.path === "/view"), false);
  const wrongSize = fakeTransport({ output: outputOtherSize });
  await assert.rejects(wrongSize.client.generateImage(request()), /结果尺寸/);
  assert.throws(() => panoramaWorkflowMetadata({ generationRequest: request(), width: 16, height: 8,
    actualOutputWidth: 16, actualOutputHeight: 8 }), /SHA-256/);
});
