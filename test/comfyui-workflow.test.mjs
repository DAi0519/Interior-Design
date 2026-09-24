/**
 * [INPUT]: 依赖 node:test/assert 与 Flux2 Klein 工作流工厂，所有输入均为内存样例
 * [OUTPUT]: 对外提供默认 9B FP8/7 steps、1K/2K、4K/6K 同图超分、全景普通链路与 Prompt 注入合同测试
 * [POS]: test 的 Flux 工作流图结构测试，不提交 ComfyUI 任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_TEXTURE_DEFAULTS,
  AI_TEXTURE_WORKFLOW,
  createAiTextureWorkflow,
  aiTextureWorkflowMetadata,
} from "../src/ai-texture-workflow.mjs";

test("工作流工厂原样写入正向 Prompt、保留默认负向 Prompt 与稳定节点", () => {
  const workflow = createAiTextureWorkflow({
    artifactKey: "request-123",
    height: 576,
    imageBase64: "example-base64",
    prompt: "保持奶油白配色",
    resolution: "1K",
    seed: 42,
    width: 1024,
  });

  assert.equal(workflow["71"].class_type, "easy loadImageBase64");
  assert.equal(workflow["71"].inputs.base64_data, "example-base64");
  assert.equal(workflow["71"].inputs.image_output, "Hide");
  assert.equal(
    workflow["RandomNoise-7db7dfd0e538b23df0bba2565100e976"].inputs.noise_seed,
    42,
  );
  assert.equal(
    workflow["CLIPTextEncode-acd7e32aef39aafe3f6c0abb0498e47a"].inputs.text,
    "保持奶油白配色",
  );
  assert.match(
    workflow["CLIPTextEncode-a5eb6fed8b48761592bb34a3f51a1e24"].inputs.text,
    /CG plastic feel/,
  );
  assert.equal(workflow[AI_TEXTURE_WORKFLOW.outputNodeId].class_type, "SaveImage");
  assert.equal(
    workflow[AI_TEXTURE_WORKFLOW.outputNodeId].inputs.filename_prefix,
    "CanvasLab_Flux2Klein_request-123",
  );
  assert.equal(
    workflow["UNETLoader-268b01374c2e0d44c2854c95c42a0a6e"].inputs.unet_name,
    AI_TEXTURE_DEFAULTS.model,
  );
  assert.equal(
    workflow["Flux2Scheduler-fd38d320ac98d809795611b9d91d1f52"].inputs.steps,
    7,
  );
  assert.equal(
    workflow["KSamplerSelect-ea15f99cba5b444c6edd8a1509542292"].inputs.sampler_name,
    "euler",
  );
  assert.equal(
    workflow["ImageResize+-a38908ad3622430bf340597ca425274c"].inputs.width,
    1024,
  );
  assert.equal(
    workflow["ImageResize+-6348ae83bed7de73d2de60a62eb38a93"].inputs.height,
    576,
  );
});
test("工作流固定使用 9B FP8、7 steps 并接受 2K 目标尺寸", () => {
  const workflow = createAiTextureWorkflow({
    artifactKey: "request-456",
    height: 1152,
    imageBase64: "example-base64",
    prompt: "保持空间结构",
    resolution: "2K",
    seed: 42,
    width: 2048,
  });

  assert.equal(
    workflow["UNETLoader-268b01374c2e0d44c2854c95c42a0a6e"].inputs.unet_name,
    AI_TEXTURE_DEFAULTS.model,
  );
  assert.equal(
    workflow["Flux2Scheduler-fd38d320ac98d809795611b9d91d1f52"].inputs.steps,
    7,
  );
  assert.equal(
    workflow["ImageResize+-a38908ad3622430bf340597ca425274c"].inputs.width,
    2048,
  );
  assert.equal(
    workflow["ImageResize+-a38908ad3622430bf340597ca425274c"].inputs.height,
    1152,
  );
});

test("Flux 4K/6K 把 2K 生成结果直接接入同一 Prompt 图的攸行 SeedVR2", () => {
  const workflow = createAiTextureWorkflow({
    artifactKey: "flux-upscale-4k",
    generationRequest: {
      upscale_height: 2304,
      upscale_resolution: "4K",
      upscale_width: 4096,
      upscale_workflow_key: "youxing_seedvr2_3b",
    },
    height: 1536,
    imageBase64: "example-base64",
    prompt: "保持空间结构",
    resolution: "4K",
    seed: 42,
    width: 2720,
  });

  assert.equal(
    workflow["ImageResize+-6348ae83bed7de73d2de60a62eb38a93"].inputs.width,
    2720,
  );
  assert.deepEqual(
    workflow["SeedVR2-Upscaler"].inputs.image,
    ["ImageResize+-6348ae83bed7de73d2de60a62eb38a93", 0],
  );
  assert.equal(workflow["SeedVR2-DiT"].inputs.model,
    "seedvr2_ema_3b_fp8_e4m3fn.safetensors");
  assert.equal(workflow["SeedVR2-DiT"].inputs.cache_model, true);
  assert.equal(workflow["SeedVR2-DiT"].inputs.offload_device, "cuda:0");
  assert.equal(workflow["SeedVR2-VAE"].inputs.cache_model, true);
  assert.equal(workflow["SeedVR2-Upscaler"].inputs.resolution, 2304);
  assert.equal(workflow["SeedVR2-Upscaler"].inputs.max_resolution, 4096);
  assert.deepEqual(
    workflow[AI_TEXTURE_WORKFLOW.outputNodeId].inputs.images,
    ["SeedVR2-Upscaler", 0],
  );
  assert.equal(
    "panoramaCircularSampling" in aiTextureWorkflowMetadata({
      artifactKey: "panorama-standard-workflow",
      height: 1440,
      negativePromptMode: "default",
      resolution: "4K",
      seed: 42,
      width: 2880,
    }),
    false,
  );
});

test("Flux 忽略废弃全景字段并保持普通工作流与无 Prompt 超分", () => {
  const workflow = createAiTextureWorkflow({
    artifactKey: "panorama-circular-sampling",
    generationRequest: {
      panorama_circular_sampling: true,
      upscale_height: 2048,
      upscale_resolution: "4K",
      upscale_width: 4096,
      upscale_workflow_key: "youxing_seedvr2_3b",
    },
    height: 1440,
    imageBase64: "example-base64",
    prompt: "整图质感增强并保持全景连续",
    resolution: "4K",
    seed: 42,
    width: 2880,
  });

  assert.equal(
    workflow["ImageResize+-a38908ad3622430bf340597ca425274c"].inputs.width,
    2880,
  );
  assert.equal(
    workflow["ImageResize+-a38908ad3622430bf340597ca425274c"].inputs.height,
    1440,
  );
  assert.deepEqual(
    workflow["VAEEncode-0f3be78d5b363beeed86c2ebc4015cab"].inputs.pixels,
    ["ImageResize+-a38908ad3622430bf340597ca425274c", 0],
  );
  assert.deepEqual(
    workflow["ReferenceLatent-ce99eb243bffaf440eb25cb1f2430377"].inputs.latent,
    ["VAEEncode-0f3be78d5b363beeed86c2ebc4015cab", 0],
  );
  assert.deepEqual(
    workflow["ReferenceLatent-95e27bbc3e3c05717782d7ef1003175d"].inputs.latent,
    ["VAEEncode-0f3be78d5b363beeed86c2ebc4015cab", 0],
  );
  assert.deepEqual(
    workflow["easy imageSize-913eae800a3359e3775764c823c3e7ea"].inputs.image,
    ["ImageResize+-a38908ad3622430bf340597ca425274c", 0],
  );
  assert.deepEqual(
    workflow["SamplerCustomAdvanced-2f28374236f5e23ae19921682535469c"].inputs.latent_image,
    ["EmptyFlux2LatentImage-7830d5afa1453245de64ed5470dfe7d2", 0],
  );
  assert.deepEqual(
    workflow["SamplerCustomAdvanced-2f28374236f5e23ae19921682535469c"].inputs.sigmas,
    ["Flux2Scheduler-fd38d320ac98d809795611b9d91d1f52", 0],
  );
  assert.equal(
    workflow["KSamplerSelect-ea15f99cba5b444c6edd8a1509542292"].inputs.sampler_name,
    "euler",
  );
  assert.equal(
    workflow["ImageResize+-6348ae83bed7de73d2de60a62eb38a93"].inputs.width,
    2880,
  );
  assert.equal(
    workflow["ImageResize+-6348ae83bed7de73d2de60a62eb38a93"].inputs.height,
    1440,
  );
  assert.equal(
    Object.keys(workflow).some((key) => key.startsWith("Panorama-Enhancement")),
    false,
  );
  assert.equal(
    Object.keys(workflow).some((key) => key.startsWith("Panorama-Wrap")),
    false,
  );
  assert.deepEqual(
    workflow["SeedVR2-Upscaler"].inputs.image,
    ["ImageResize+-6348ae83bed7de73d2de60a62eb38a93", 0],
  );
  assert.equal("prompt" in workflow["SeedVR2-Upscaler"].inputs, false);
  assert.equal("text" in workflow["SeedVR2-Upscaler"].inputs, false);
  assert.equal("positive" in workflow["SeedVR2-Upscaler"].inputs, false);
  assert.equal("negative" in workflow["SeedVR2-Upscaler"].inputs, false);
  assert.equal(
    Object.keys(workflow).some((key) => key.startsWith("Panorama-Repair")),
    false,
  );
  assert.equal(
    Object.keys(workflow).some((key) => key.startsWith("Panorama-Final")),
    false,
  );
  assert.deepEqual(
    workflow[AI_TEXTURE_WORKFLOW.outputNodeId].inputs.images,
    ["SeedVR2-Upscaler", 0],
  );
});

test("空输入不会回填工作流内置正向 Prompt", () => {
  const workflow = createAiTextureWorkflow({
    artifactKey: "request-789",
    imageBase64: "example-base64",
    prompt: "   ",
    seed: 42,
  });

  assert.equal(
    workflow["CLIPTextEncode-acd7e32aef39aafe3f6c0abb0498e47a"].inputs.text,
    "",
  );
  assert.match(
    workflow["CLIPTextEncode-a5eb6fed8b48761592bb34a3f51a1e24"].inputs.text,
    /alter material colors/,
  );
});
