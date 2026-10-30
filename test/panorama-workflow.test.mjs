/**
 * [INPUT]: 依赖 node:test/assert、sharp、原始 R5_4 附件归档及实时 MaaS 节点合同的脱敏快照
 * [OUTPUT]: 对外提供源图语义一致性、正负词/种子注入、付费前准入、单次提交、产物身份/尺寸与 SHA 回归保障
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

// --- 2026-10-28 MaaS object_info：保留真实输入类型/枚举与输出端口，不保留服务地址 ---
const NODE_SCHEMA = {
  "UNETLoader": {"input": {"required": {"unet_name": [["DINOv2/dinov2-giant/pytorch_model.bin", "DINOv2/dinov2_vitl14_reg4_pretrain.pth", "FLLUX.1-Kontext-dev/ae.safetensors", "FLLUX.1-Kontext-dev/flux1-kontext-dev.safetensors", "FLLUX.1-Kontext-dev/text_encoder/model.safetensors", "FLLUX.1-Kontext-dev/text_encoder_2/model-00001-of-00002.safetensors", "FLLUX.1-Kontext-dev/text_encoder_2/model-00002-of-00002.safetensors", "FLLUX.1-Kontext-dev/transformer/diffusion_pytorch_model-00001-of-00003.safetensors", "FLLUX.1-Kontext-dev/transformer/diffusion_pytorch_model-00002-of-00003.safetensors", "FLLUX.1-Kontext-dev/transformer/diffusion_pytorch_model-00003-of-00003.safetensors", "FLLUX.1-Kontext-dev/vae/diffusion_pytorch_model.safetensors", "FLUX.1-Fill-dev/ae.safetensors", "FLUX.1-Fill-dev/text_encoder/model.safetensors", "FLUX.1-Fill-dev/text_encoder_2/model-00001-of-00002.safetensors", "FLUX.1-Fill-dev/text_encoder_2/model-00002-of-00002.safetensors", "FLUX.1-Fill-dev/transformer/diffusion_pytorch_model-00001-of-00003.safetensors", "FLUX.1-Fill-dev/transformer/diffusion_pytorch_model-00002-of-00003.safetensors", "FLUX.1-Fill-dev/transformer/diffusion_pytorch_model-00003-of-00003.safetensors", "FLUX.1-Fill-dev/vae/diffusion_pytorch_model.safetensors", "Hunyuan3D-2.1/hunyuan3d-dit-v2-1/model.fp16.ckpt", "Hunyuan3D-2.1/hunyuan3d-paintpbr-v2-1/image_encoder/model.safetensors", "Hunyuan3D-2.1/hunyuan3d-paintpbr-v2-1/text_encoder/pytorch_model.bin", "Hunyuan3D-2.1/hunyuan3d-paintpbr-v2-1/unet/diffusion_pytorch_model.bin", "Hunyuan3D-2.1/hunyuan3d-paintpbr-v2-1/vae/diffusion_pytorch_model.bin", "Hunyuan3D-2.1/hunyuan3d-vae-v2-1/model.fp16.ckpt", "Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors", "flux-2-klein-4b-fp8.safetensors", "flux-2-klein-9b-fp8.safetensors", "flux-2-klein-9b-kv-fp8.safetensors", "flux-2-klein-9b-nvfp4.safetensors", "flux-2-klein-9b.safetensors", "flux-2-klein-base-4b-fp8.safetensors", "flux-2-klein-base-9b-fp8.safetensors", "flux-tools/redux/flux1-redux-dev.safetensors", "flux-tools/redux/image_embedder/diffusion_pytorch_model.safetensors", "flux-tools/redux/image_encoder/model.safetensors", "flux1-dev-fp8.safetensors", "flux1-dev-kontext_fp8_scaled.safetensors", "flux1-fill-dev-OneReward-fp8.safetensors", "flux1-fill-dev.safetensors", "flux1-kontext-dev-fp8-e4m3fn.safetensors", "flux1-schnell-fp8-e4m3fn.safetensors", "flux1-schnell.safetensors", "flux3-image-klein-int8-convrot.safetensors", "hunyuan3d-dit-v2-1/model.fp16.ckpt", "hunyuan3d-dit-v2.0-fp16.safetensors", "iclight_sd15_fbc.safetensors", "iclight_sd15_fc.safetensors", "kolors-unet.fp16.safetensors", "minimax-h3/minimax_h3_fl2va_bf16.safetensors", "minimax-h3/minimax_h3_fl2va_int8_convrot.safetensors", "minimax-h3/minimax_h3_fl2va_pruned_fp8_scaled.safetensors", "minimax-h3/minimax_h3_fl2va_pruned_int8_convrot.safetensors", "minimax-h3/minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors", "minimax-h3/minimax_h3_ref2va_int8_convrot.safetensors", "minimax-h3/minimax_h3_ref2va_pruned_fp8_scaled.safetensors", "minimax-h3/minimax_h3_ref2va_pruned_int8_convrot.safetensors", "nunchaku-flux.1-kontext-dev/svdq-fp4_r32-flux.1-kontext-dev.safetensors", "nunchaku-flux.1-kontext-dev/svdq-int4_r32-flux.1-kontext-dev.safetensors", "qwen_image_edit/Qwen-Image-Edit-2509_fp8_e4m3fn.safetensors", "qwen_image_edit/qwen_image_edit_2511_fp8mixed.safetensors", "qwen_image_edit_2511_fp8mixed.safetensors", "qwen_image_fp8_e4m3fn.safetensors", "svdq-fp4-flux.1-dev/transformer_blocks.safetensors", "svdq-fp4-flux.1-dev/unquantized_layers.safetensors", "svdq-fp4_r32-FLUX.2-klein-9B-Nunchaku.safetensors", "svdq-fp4_r32-flux.1-dev.safetensors", "svdq-fp4_r32-flux.1-kontext-dev.safetensors", "svdq-int4-flux.1-dev/transformer_blocks.safetensors", "svdq-int4-flux.1-dev/unquantized_layers.safetensors", "svdq-int4-flux.1-fill-dev/transformer_blocks.safetensors", "svdq-int4-flux.1-fill-dev/unquantized_layers.safetensors", "wan2.1/Wan2.1-14B-T2V-FusionX-VACE-FP8_e4m3fn.safetensors", "wan2.1/Wan2_1-T2V-14B_fp8_e4m3fn.safetensors", "wan2.1/Wan2_1-VACE_module_14B_bf16.safetensors", "wan2.2_kj/Wan2_2-I2V-A14B-HIGH_fp8_e4m3fn_scaled_KJ.safetensors", "wan2.2_kj/Wan2_2-I2V-A14B-LOW_fp8_e4m3fn_scaled_KJ.safetensors", "wan2.2_kj/Wan2_2-T2V-A14B-LOW_fp8_e4m3fn_scaled_KJ.safetensors", "wan2.2_kj/Wan2_2-T2V-A14B_HIGH_fp8_e4m3fn_scaled_KJ.safetensors", "wan2.2_kj/Wan2_2_Fun_VACE_module_A14B_HIGH_bf16.safetensors", "wan2.2_kj/Wan2_2_Fun_VACE_module_A14B_LOW_bf16.safetensors", "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors", "z_image_turbo_bf16.safetensors"]], "weight_dtype": [["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]]}}, "output": ["MODEL"]},
  "CLIPLoader": {"input": {"required": {"clip_name": [["awq-int4-flux.1-t5xxl.safetensors", "clip_l.safetensors", "minimax-h3/qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax-h3/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "model.fp16.safetensors", "qwen3vl_4b_int8_convrot.safetensors", "qwen_2.5_vl_7b_fp8_scaled.safetensors", "qwen_3_4b.safetensors", "qwen_3_8b.safetensors", "qwen_3_8b_fp4mixed.safetensors", "qwen_3_8b_fp8mixed.safetensors", "siglip-so400m-patch14-384/model.safetensors", "t5_base.safetensors", "t5xxl_fp16.safetensors", "t5xxl_fp8_e4m3fn.safetensors", "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "wan2.1/umt5-xxl-enc-bf16.safetensors"]], "type": [["stable_diffusion", "stable_cascade", "sd3", "stable_audio", "mochi", "ltxv", "pixart", "cosmos", "lumina2", "wan", "hidream", "chroma", "ace", "omnigen2", "qwen_image", "hunyuan_image", "flux2", "ovis", "longcat_image", "cogvideox", "lens", "pixeldit", "ideogram4", "boogu", "krea2", "joyimage", "mage", "minimax", "yue2"]]}, "optional": {"device": [["default", "cpu"]]}}, "output": ["CLIP"]},
  "CLIPTextEncode": {"input": {"required": {"text": ["STRING"], "clip": ["CLIP"]}}, "output": ["CONDITIONING"]},
  "VAELoader": {"input": {"required": {"vae_name": [["ae.sft", "ema_vae_fp16.safetensors", "flux2-vae.safetensors", "flux2-vae_d64f3a68e1cc.safetensors", "full_encoder_small_decoder.safetensors", "hunyuan3d-vae-v2-1/model.fp16.ckpt", "hyperVAEKrea2Minimax_v20MinimaxX2Upscale.safetensors", "minimax-h3/minimax_h3_audio_vae_fp32.safetensors", "minimax-h3/minimax_h3_video_vae_fp16.safetensors", "minimax-h3/minimax_h3_video_vae_int8_convrot.safetensors", "qwen_image_vae.safetensors", "sdxl.vae.safetensors", "vae-ft-mse-840000-ema-pruned.safetensors", "wan2.1/Wan2_1_VAE_bf16.safetensors", "wan2.1/wan_2.1_vae.safetensors", "taeh3.safetensors", "pixel_space"]]}}, "output": ["VAE"]},
  "RandomNoise": {"input": {"required": {"noise_seed": ["INT"]}}, "output": ["NOISE"]},
  "AIRenderSphereSetup": {"input": {"required": {"noise": ["NOISE"], "preset": [["cube14", "custom"]], "view_width": ["INT"], "view_height": ["INT"], "fov": ["FLOAT"], "candidate_points": ["INT"], "temperature": ["FLOAT"], "max_assignment_error": ["FLOAT"], "custom_views": ["STRING"], "state_dtype": [["bfloat16", "float32"]]}}, "output": ["LATENT", "STRING", "INT", "INT"]},
  "AIRenderPanoramaPerspective": {"input": {"required": {"image": ["IMAGE"], "geometry_json": ["STRING"], "view_id": ["INT"]}}, "output": ["IMAGE"]},
  "VAEEncode": {"input": {"required": {"pixels": ["IMAGE"], "vae": ["VAE"]}}, "output": ["LATENT"]},
  "ReferenceLatent": {"input": {"required": {"conditioning": ["CONDITIONING"]}, "optional": {"latent": ["LATENT"]}}, "output": ["CONDITIONING"]},
  "CFGGuider": {"input": {"required": {"model": ["MODEL"], "positive": ["CONDITIONING"], "negative": ["CONDITIONING"], "cfg": ["FLOAT"]}}, "output": ["GUIDER"]},
  "KSamplerSelect": {"input": {"required": {"sampler_name": ["COMBO"]}}, "output": ["SAMPLER"]},
  "DisableNoise": {"input": {"required": {}}, "output": ["NOISE"]},
  "AIRenderSphereGather": {"input": {"required": {"state": ["LATENT"], "geometry_json": ["STRING"]}}, "output": ["LATENT", "MASK"]},
  "AIRenderFlowStateConvert": {"input": {"required": {"model": ["MODEL"], "samples": ["LATENT"], "direction": [["initial_noise", "to_sampler", "from_sampler"]], "sigma": ["FLOAT"], "reference_coefficient": ["FLOAT"]}, "optional": {"reference": ["LATENT"]}}, "output": ["LATENT"]},
  "LatentMultiply": {"input": {"required": {"samples": ["LATENT"], "multiplier": ["FLOAT"]}}, "output": ["LATENT"]},
  "VOIDWarpedNoiseSource": {"input": {"required": {"warped_noise": ["LATENT"]}}, "output": ["NOISE"]},
  "ManualSigmas": {"input": {"required": {"sigmas": ["STRING"]}}, "output": ["SIGMAS"]},
  "SamplerCustomAdvanced": {"input": {"required": {"noise": ["NOISE"], "guider": ["GUIDER"], "sampler": ["SAMPLER"], "sigmas": ["SIGMAS"], "latent_image": ["LATENT"]}}, "output": ["LATENT", "LATENT"]},
  "AIRenderSphereScatterMean": {"input": {"required": {"base": ["LATENT"], "views": ["LATENT"], "weights": ["MASK"], "geometry_json": ["STRING"]}}, "output": ["LATENT"]},
  "VAEDecode": {"input": {"required": {"samples": ["LATENT"], "vae": ["VAE"]}}, "output": ["IMAGE"]},
  "AIRenderPerspectivePanoramaMerge": {"input": {"required": {"images": ["IMAGE"], "geometry_json": ["STRING"], "base": ["IMAGE"], "temperature": ["FLOAT"]}}, "output": ["IMAGE"]},
  "SaveImage": {"input": {"required": {"images": ["IMAGE"], "filename_prefix": ["STRING"]}}, "output": ["IMAGE"]},
  "easy loadImageBase64": {"input": {"required": {"base64_data": ["STRING"], "image_output": [["Hide", "Preview", "Save", "Hide/Save"]], "save_prefix": ["STRING"]}, "optional": {}}, "output": ["IMAGE", "MASK"]},
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

test("R5_4 仅适配输入、正文、种子与保存名，保留全部球面采样连线和参数", async () => {
  const originalBytes = await readFile(new URL("../workflows/panorama-enhancement/R5_4_workflow.api.json", import.meta.url));
  assert.equal(createHash("sha256").update(originalBytes).digest("hex"), PANORAMA_WORKFLOW.sourceWorkflowSha256);
  const original = JSON.parse(originalBytes);
  const graph = createPanoramaWorkflow(factoryInput());
  assert.equal(Object.keys(graph).length, 46);
  for (const [id, node] of Object.entries(original)) {
    if (["1", "4", "5", "7", "46"].includes(id)) continue;
    assert.deepEqual(graph[id], { class_type: node.class_type, inputs: node.inputs }, `源节点 ${id} 不应改变`);
  }
  assert.equal(JSON.parse(graph["8"].inputs.custom_views).length, 20);
  assert.equal(graph["8"].inputs.view_width, 1536);
  assert.deepEqual(graph["45"].inputs.base, ["1", 0]);
  assert.equal(graph["1"].class_type, "easy loadImageBase64");
  assert.equal(graph["1"].inputs.base64_data, imageBase64);
  assert.equal(graph["4"].inputs.text, request().prompt);
  assert.equal(graph["5"].inputs.text, "");
  assert.equal(graph["7"].inputs.noise_seed, 42);
  assert.equal(graph["46"].inputs.filename_prefix, panoramaArtifactPrefix("panorama-test-123"));
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

test("缺少球面节点或模型枚举不匹配时阻断付费提交", async () => {
  const missing = structuredClone(NODE_SCHEMA);
  delete missing.AIRenderSphereGather;
  const first = fakeTransport({ catalog: missing });
  await assert.rejects(first.client.generateImage(request()), error => error.statusCode === 409 && /AIRenderSphereGather/.test(error.message));
  assert.equal(first.calls.some(call => call.method === "POST"), false);
  const invalid = structuredClone(NODE_SCHEMA);
  invalid.UNETLoader.input.required.unet_name = [["different-model.safetensors"]];
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
