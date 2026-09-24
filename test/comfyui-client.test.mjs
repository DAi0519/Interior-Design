/**
 * [INPUT]: 依赖 node:test/assert、ComfyUI 客户端与 Flux2 Klein 工作流工厂，所有 HTTP/WebSocket 响应由内存替身提供
 * [OUTPUT]: 对外提供健康检查、主动取消、默认 9B FP8/7 steps、1K/2K 原生输出、全景复用普通 Flux 链路、无 Prompt 超分、Prompt 注入、原子提交、阶段/超时/OOM 诊断、长延迟产物读取恢复、产物身份及参考图边界回归保障
 * [POS]: test 的 ComfyUI Provider 契约测试，不提交真实工作流、不消耗 GPU
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
import { createComfyUiClient } from "../src/comfyui-client.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

function fakeWebSocket() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    close() {},
    emit(type, event) {
      for (const handler of listeners.get(type) || []) handler(event);
    },
  };
}

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

test("ComfyUI 客户端原子提交 Base64 单图、执行工作流并返回统一 data URL", async () => {
  let queuedWorkflow;
  let historyRequests = 0;
  let outputRequests = 0;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/system_stats") {
      return Response.json({ system: { comfyui_version: "0.11.1" } });
    }
    if (parsed.pathname === "/prompt") {
      const body = JSON.parse(options.body);
      queuedWorkflow = body.prompt;
      return Response.json({ number: 7, prompt_id: "prompt-1", node_errors: {} });
    }
    if (parsed.pathname === "/history/prompt-1") {
      historyRequests += 1;
      if (historyRequests === 1) {
        return new Response("Bad Gateway", { status: 502 });
      }
      return Response.json({
        "prompt-1": {
          outputs: {
            "72": {
              images: [{
                filename: "CanvasLab_Flux2Klein_request-abc_00001_.png",
                subfolder: "",
                type: "output",
              }],
            },
          },
          status: {
            completed: true,
            messages: [
              ["execution_start", { timestamp: 1_000 }],
              ["execution_success", { timestamp: 2_500 }],
            ],
            status_str: "success",
          },
        },
      });
    }
    if (parsed.pathname === "/view") {
      outputRequests += 1;
      assert.equal(
        parsed.searchParams.get("filename"),
        "CanvasLab_Flux2Klein_request-abc_00001_.png",
      );
      if (outputRequests <= 25) return new Response("missing", { status: 404 });
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      });
    }
    throw new Error(`unexpected request: ${parsed.pathname}`);
  };
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl,
    pollIntervalMs: 0,
    randomId: () => "request-abc",
    randomSeed: () => 123,
    waitImpl: async () => {},
  });

  assert.deepEqual(await client.checkHealth(), {
    available: true,
    version: "0.11.1",
  });
  const result = await client.generateImage({
    height: 576,
    images: [{ fileName: "source.png", image_url: onePixelPng }],
    prompt: "保持空间结构",
    resolution: "1K",
    width: 1024,
    workflow_profile: "fast",
  });

  assert.equal(queuedWorkflow["71"].class_type, "easy loadImageBase64");
  assert.equal(
    queuedWorkflow["71"].inputs.base64_data,
    onePixelPng.split(",", 2)[1],
  );
  assert.equal(
    queuedWorkflow["RandomNoise-7db7dfd0e538b23df0bba2565100e976"].inputs.noise_seed,
    123,
  );
  assert.match(
    queuedWorkflow["CLIPTextEncode-acd7e32aef39aafe3f6c0abb0498e47a"].inputs.text,
    /保持空间结构/,
  );
  assert.equal(
    queuedWorkflow[AI_TEXTURE_WORKFLOW.outputNodeId].inputs.filename_prefix,
    "CanvasLab_Flux2Klein_request-abc",
  );
  assert.match(result.images[0].url, /^data:image\/png;base64,/);
  assert.equal(result.transport, "comfyui-workflow");
  assert.equal(result.metadata.promptId, "prompt-1");
  assert.equal(result.metadata.artifactKey, "request-abc");
  assert.equal(
    result.metadata.outputFilename,
    "CanvasLab_Flux2Klein_request-abc_00001_.png",
  );
  assert.match(result.metadata.outputSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.metadata.seed, 123);
  assert.equal(result.metadata.executionDurationMs, 1_500);
  assert.equal(result.metadata.workflowVersion, AI_TEXTURE_WORKFLOW.version);
  assert.equal("workflowProfile" in result.metadata, false);
  assert.equal("workflowProfileLabel" in result.metadata, false);
  assert.equal(result.metadata.model, AI_TEXTURE_DEFAULTS.model);
  assert.equal(result.metadata.steps, 7);
  assert.equal(result.metadata.resolution, "1K");
  assert.equal(result.metadata.inferenceWidth, 1024);
  assert.equal(result.metadata.inferenceHeight, 576);
  assert.equal(historyRequests, 2);
  assert.equal(outputRequests, 26);
});

test("ComfyUI WebSocket 准确回传排队与执行阶段", async () => {
  const progress = [];
  const socket = fakeWebSocket();
  let historyRequests = 0;
  let webSocketUrl = null;
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/prompt") {
        return Response.json({ prompt_id: "prompt-progress", node_errors: {} });
      }
      if (pathname === "/history/prompt-progress") {
        historyRequests += 1;
        if (historyRequests === 1) {
          socket.emit("message", {
            data: JSON.stringify({
              data: { node: "71", prompt_id: "prompt-progress" },
              type: "executing",
            }),
          });
          return Response.json({});
        }
        return Response.json({
          "prompt-progress": {
            outputs: {
              "72": {
                images: [{
                  filename: "CanvasLab_Flux2Klein_progress-id_00001_.png",
                  subfolder: "",
                  type: "output",
                }],
              },
            },
            status: { completed: true, messages: [], status_str: "success" },
          },
        });
      }
      if (pathname === "/view") {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        });
      }
      throw new Error(`unexpected request: ${pathname}`);
    },
    pollIntervalMs: 0,
    randomId: () => "progress-id",
    waitImpl: async () => {},
    webSocketFactory(url) {
      webSocketUrl = String(url);
      queueMicrotask(() => socket.emit("open", {}));
      return socket;
    },
  });

  await client.generateImage({
    images: [{ fileName: "source.png", image_url: onePixelPng }],
    prompt: "保持空间结构",
  }, {
    executionTimeoutMs: 15 * 60 * 1000,
    onProgress: (event) => progress.push(event),
  });

  assert.match(webSocketUrl, /^ws:\/\/comfy\.example\/ws\?clientId=progress-id$/);
  assert.deepEqual(progress, [
    { phase: "queued", promptId: "prompt-progress" },
    { phase: "executing", promptId: "prompt-progress" },
  ]);
});

test("ComfyUI 排队超时与节点执行超时分开报错并保留 Prompt ID", async () => {
  const clientFor = (promptId, history) => createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/prompt") {
        return Response.json({ prompt_id: promptId, node_errors: {} });
      }
      if (pathname === `/history/${promptId}`) return Response.json(history);
      if (pathname === "/queue") {
        return Response.json({
          queue_pending: [[1, promptId]],
          queue_running: [],
        });
      }
      throw new Error(`unexpected request: ${pathname}`);
    },
    pollIntervalMs: 0,
    waitImpl: async () => {},
  });

  await assert.rejects(
    clientFor("prompt-queued", {}).generateImage({
      images: [{ image_url: onePixelPng }],
      prompt: "",
    }, { queueTimeoutMs: -1 }),
    (error) => {
      assert.equal(error.code, "queue_timeout");
      assert.deepEqual(error.details, { promptId: "prompt-queued" });
      assert.match(error.message, /排队超时.*prompt-queued/);
      return true;
    },
  );

  const executionStarted = Date.now() - 1_000;
  await assert.rejects(
    clientFor("prompt-executing", {
      "prompt-executing": {
        outputs: {},
        status: {
          completed: false,
          messages: [["execution_start", {
            prompt_id: "prompt-executing",
            timestamp: executionStarted,
          }]],
          status_str: "running",
        },
      },
    }).generateImage({
      images: [{ image_url: onePixelPng }],
      prompt: "",
    }, {
      executionTimeoutMs: 0,
      queueTimeoutMs: 60_000,
    }),
    (error) => {
      assert.equal(error.code, "execution_timeout");
      assert.deepEqual(error.details, { promptId: "prompt-executing" });
      assert.match(error.message, /节点执行超时.*prompt-executing/);
      return true;
    },
  );
});

test("ComfyUI WebSocket 丢失执行事件时由实时队列恢复执行阶段", async () => {
  const progress = [];
  const socket = fakeWebSocket();
  const pngBytes = Buffer.from(onePixelPng.split(",")[1], "base64");
  let historyRequests = 0;
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/prompt") {
        return Response.json({ prompt_id: "prompt-queue-fallback", node_errors: {} });
      }
      if (pathname === "/history/prompt-queue-fallback") {
        historyRequests += 1;
        if (historyRequests === 1) return Response.json({});
        return Response.json({
          "prompt-queue-fallback": {
            outputs: {
              "72": { images: [{
                filename: "CanvasLab_Flux2Klein_queue-fallback_00001_.png",
                subfolder: "",
                type: "output",
              }] },
            },
            status: {
              completed: true,
              messages: [["execution_start", {
                prompt_id: "prompt-queue-fallback",
                timestamp: Date.now(),
              }]],
              status_str: "success",
            },
          },
        });
      }
      if (pathname === "/queue") {
        return Response.json({
          queue_pending: [],
          queue_running: [[1, "prompt-queue-fallback"]],
        });
      }
      if (pathname === "/view") {
        return new Response(pngBytes, { headers: { "Content-Type": "image/png" } });
      }
      throw new Error(`unexpected request: ${pathname}`);
    },
    pollIntervalMs: 0,
    randomId: () => "queue-fallback",
    waitImpl: async () => {},
    webSocketFactory() {
      queueMicrotask(() => socket.emit("open", {}));
      return socket;
    },
  });

  await client.generateImage({
    images: [{ image_url: onePixelPng }],
    prompt: "",
  }, {
    onProgress: (event) => progress.push(event),
    queueTimeoutMs: 60_000,
  });

  assert.deepEqual(progress, [
    { phase: "queued", promptId: "prompt-queue-fallback" },
    { phase: "executing", promptId: "prompt-queue-fallback" },
  ]);
});

test("ComfyUI History 返回旧请求文件名时拒绝下载和假成功", async () => {
  let outputRequests = 0;
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/prompt") {
        return Response.json({ prompt_id: "prompt-current", node_errors: {} });
      }
      if (pathname === "/history/prompt-current") {
        return Response.json({
          "prompt-current": {
            outputs: {
              "72": {
                images: [{
                  filename: "CanvasLab_Flux2Klein_request-old_00001_.png",
                  subfolder: "",
                  type: "output",
                }],
              },
            },
            status: { completed: true, messages: [], status_str: "success" },
          },
        });
      }
      if (pathname === "/view") outputRequests += 1;
      throw new Error(`unexpected request: ${pathname}`);
    },
    pollIntervalMs: 0,
    randomId: () => "request-current",
    waitImpl: async () => {},
  });

  await assert.rejects(
    client.generateImage({
      images: [{ fileName: "source.png", image_url: onePixelPng }],
      prompt: "保持空间结构",
    }),
    (error) => {
      assert.equal(error.code, "output_identity");
      assert.match(error.message, /输出与本次请求身份不一致/);
      return true;
    },
  );
  assert.equal(outputRequests, 0);
});

test("持续网关 502 返回明确服务不可用且健康检查只重试安全读取", async () => {
  let requests = 0;
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async () => {
      requests += 1;
      return new Response("<h1>502 Bad Gateway</h1>", { status: 502 });
    },
    pollIntervalMs: 0,
    waitImpl: async () => {},
  });

  await assert.rejects(
    client.checkHealth(),
    (error) => {
      assert.equal(error.code, "service_unavailable");
      assert.equal(error.statusCode, 502);
      assert.match(error.message, /远端 ComfyUI 服务暂不可用（网关 502）/);
      return true;
    },
  );
  assert.equal(requests, 3);
});

test("节点校验失败保留具体详情且不重复提交", async () => {
  let promptRequests = 0;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/prompt") {
      promptRequests += 1;
      assert.ok(JSON.parse(options.body).prompt["71"].inputs.base64_data);
      return Response.json({
        error: { message: "Prompt outputs failed validation" },
        node_errors: {
          "71": {
            class_type: "easy loadImageBase64",
            errors: [{
              details: "base64_data - malformed payload",
              extra_info: { input_name: "base64_data" },
              message: "Custom validation failed for node",
              type: "custom_validation_failed",
            }],
          },
        },
      }, { status: 400 });
    }
    throw new Error(`unexpected request: ${parsed.pathname}`);
  };
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl,
    pollIntervalMs: 0,
    randomSeed: () => 123,
    waitImpl: async () => {},
  });

  await assert.rejects(
    client.generateImage({
      images: [{ fileName: "source.png", image_url: onePixelPng }],
      prompt: "保持空间结构",
    }),
    /easy loadImageBase64\.base64_data：Custom validation failed for node（base64_data - malformed payload）/,
  );
  assert.equal(promptRequests, 1);
});

test("非图片节点校验失败时返回具体节点且不重试", async () => {
  let promptRequests = 0;
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/prompt") {
        promptRequests += 1;
        return Response.json({
          error: { message: "Prompt outputs failed validation" },
          node_errors: {
            model: {
              class_type: "UNETLoader",
              errors: [{
                extra_info: { input_name: "unet_name" },
                message: "Value not in list",
                type: "value_not_in_list",
              }],
            },
          },
        }, { status: 400 });
      }
      throw new Error(`unexpected request: ${parsed.pathname}`);
    },
  });

  await assert.rejects(
    client.generateImage({
      images: [{ fileName: "source.png", image_url: onePixelPng }],
      prompt: "保持空间结构",
    }),
    /UNETLoader\.unet_name：Value not in list/,
  );
  assert.equal(promptRequests, 1);
});

test("ComfyUI 客户端在网络调用前拒绝缺图和多图", async () => {
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async () => {
      throw new Error("不应调用网络");
    },
  });

  await assert.rejects(
    client.generateImage({ images: [], prompt: "" }),
    /需要且只允许 1 张参考图/,
  );
  await assert.rejects(
    client.generateImage({
      images: [
        { image_url: onePixelPng },
        { image_url: onePixelPng },
      ],
      prompt: "",
    }),
    /需要且只允许 1 张参考图/,
  );
});

test("ComfyUI 客户端响应批量任务的主动取消信号", async () => {
  const controller = new AbortController();
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }),
  });
  const request = client.generateImage({
    images: [{ fileName: "source.png", image_url: onePixelPng }],
    prompt: "保持空间结构",
  }, { signal: controller.signal });
  const reason = new Error("用户已停止任务");
  reason.name = "AbortError";
  controller.abort(reason);

  await assert.rejects(request, (error) => error === reason);
});

test("ComfyUI completed=false 的节点 OOM 立即失败而不误报执行超时", async () => {
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/prompt") {
        return Response.json({ prompt_id: "prompt-oom", node_errors: {} });
      }
      if (pathname === "/history/prompt-oom") {
        return Response.json({
          "prompt-oom": {
            outputs: {},
            status: {
              completed: false,
              messages: [["execution_error", {
                exception_message: "This error means you ran out of memory on your GPU.",
                exception_type: "torch.OutOfMemoryError",
                node_id: "75",
                node_type: "SeedVR2VideoUpscaler",
                prompt_id: "prompt-oom",
              }]],
              status_str: "error",
            },
          },
        });
      }
      throw new Error(`unexpected request: ${pathname}`);
    },
  });

  await assert.rejects(
    client.generateImage({
      images: [{ image_url: onePixelPng }],
      prompt: "",
    }),
    (error) => {
      assert.equal(error.code, "execution_failed");
      assert.deepEqual(error.details, { promptId: "prompt-oom" });
      assert.match(error.message, /SeedVR2VideoUpscaler GPU 显存不足/);
      assert.match(error.message, /prompt-oom/);
      return true;
    },
  );
});

test("ComfyUI 已完成但没有输出图片时立即失败", async () => {
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/prompt") {
      return Response.json({ prompt_id: "empty-1", node_errors: {} });
    }
    if (pathname === "/history/empty-1") {
      return Response.json({
        "empty-1": {
          outputs: {},
          status: { completed: true, messages: [], status_str: "success" },
        },
      });
    }
    throw new Error(`unexpected request: ${pathname}`);
  };
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/",
    fetchImpl,
    pollIntervalMs: 0,
    waitImpl: async () => {},
  });

  await assert.rejects(
    client.generateImage({
      images: [{ fileName: "source.png", image_url: onePixelPng }],
      prompt: "",
    }),
    /已完成，但没有返回图片/,
  );
});
