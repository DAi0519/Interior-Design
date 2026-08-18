/**
 * [INPUT]: 依赖 node:test/assert、ComfyUI 客户端与 Flux2 Klein 工作流工厂，所有 HTTP 响应由内存 fetch 替身提供
 * [OUTPUT]: 对外提供健康检查、主动取消、质量优先/快速档、正向 Prompt 原样注入/固定负向 Prompt、Base64 图片原子提交、网关抖动恢复、节点错误诊断、多实例输出读取恢复、排队轮询、输出归一化和参考图边界回归保障
 * [POS]: test 的 ComfyUI Provider 契约测试，不提交真实工作流、不消耗 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_TEXTURE_PROFILES,
  AI_TEXTURE_WORKFLOW,
  createAiTextureWorkflow,
} from "../src/ai-texture-workflow.mjs";
import { createComfyUiClient } from "../src/comfyui-client.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

test("工作流工厂原样写入正向 Prompt、保留固定负向 Prompt 与稳定节点", () => {
  const workflow = createAiTextureWorkflow({
    imageBase64: "example-base64",
    prompt: "保持奶油白配色",
    seed: 42,
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
    workflow["UNETLoader-268b01374c2e0d44c2854c95c42a0a6e"].inputs.unet_name,
    AI_TEXTURE_PROFILES.quality.model,
  );
  assert.equal(
    workflow["Flux2Scheduler-fd38d320ac98d809795611b9d91d1f52"].inputs.steps,
    7,
  );
  assert.equal(
    workflow["ImageResize+-a38908ad3622430bf340597ca425274c"].inputs.width,
    1920,
  );
});

test("快速档使用 9B KV、保留 7 steps 并保持 1920 推理长边", () => {
  const workflow = createAiTextureWorkflow({
    imageBase64: "example-base64",
    prompt: "保持空间结构",
    seed: 42,
    workflowProfile: "fast",
  });

  assert.equal(
    workflow["UNETLoader-268b01374c2e0d44c2854c95c42a0a6e"].inputs.unet_name,
    AI_TEXTURE_PROFILES.fast.model,
  );
  assert.notEqual(AI_TEXTURE_PROFILES.fast.model, AI_TEXTURE_PROFILES.quality.model);
  assert.equal(
    workflow["Flux2Scheduler-fd38d320ac98d809795611b9d91d1f52"].inputs.steps,
    7,
  );
  assert.equal(
    workflow["ImageResize+-a38908ad3622430bf340597ca425274c"].inputs.width,
    1920,
  );
});

test("空输入不会回填工作流内置正向 Prompt", () => {
  const workflow = createAiTextureWorkflow({
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
              images: [{ filename: "result.png", subfolder: "", type: "output" }],
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
      assert.equal(parsed.searchParams.get("filename"), "result.png");
      if (outputRequests === 1) return new Response("missing", { status: 404 });
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
    randomSeed: () => 123,
    waitImpl: async () => {},
  });

  assert.deepEqual(await client.checkHealth(), {
    available: true,
    version: "0.11.1",
  });
  const result = await client.generateImage({
    images: [{ fileName: "source.png", image_url: onePixelPng }],
    prompt: "保持空间结构",
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
  assert.match(result.images[0].url, /^data:image\/png;base64,/);
  assert.equal(result.transport, "comfyui-workflow");
  assert.equal(result.metadata.promptId, "prompt-1");
  assert.equal(result.metadata.seed, 123);
  assert.equal(result.metadata.executionDurationMs, 1_500);
  assert.equal(result.metadata.workflowVersion, "2026-08-13.2");
  assert.equal(result.metadata.workflowProfile, "fast");
  assert.equal(result.metadata.model, AI_TEXTURE_PROFILES.fast.model);
  assert.equal(result.metadata.steps, 7);
  assert.equal(result.metadata.inferenceWidth, 1920);
  assert.equal(historyRequests, 2);
  assert.equal(outputRequests, 2);
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
