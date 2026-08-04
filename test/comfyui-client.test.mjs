/**
 * [INPUT]: 依赖 node:test/assert、ComfyUI 客户端与 Flux2 Klein 工作流工厂，所有 HTTP 响应由内存 fetch 替身提供
 * [OUTPUT]: 对外提供健康检查、正向 Prompt 原样注入/固定负向 Prompt、单图上传、排队轮询、输出归一化和参考图边界回归保障
 * [POS]: test 的 ComfyUI Provider 契约测试，不提交真实工作流、不消耗 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_TEXTURE_WORKFLOW,
  createAiTextureWorkflow,
} from "../src/ai-texture-workflow.mjs";
import { createComfyUiClient } from "../src/comfyui-client.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

test("工作流工厂原样写入正向 Prompt、保留固定负向 Prompt 与稳定节点", () => {
  const workflow = createAiTextureWorkflow({
    imageName: "input/example.png",
    prompt: "保持奶油白配色",
    seed: 42,
  });

  assert.equal(workflow["71"].inputs.image, "input/example.png");
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
});

test("空输入不会回填工作流内置正向 Prompt", () => {
  const workflow = createAiTextureWorkflow({
    imageName: "input/example.png",
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

test("ComfyUI 客户端上传单图、执行工作流并返回统一 data URL", async () => {
  let queuedWorkflow;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/system_stats") {
      return Response.json({ system: { comfyui_version: "0.11.1" } });
    }
    if (parsed.pathname === "/upload/image") {
      assert.equal(options.method, "POST");
      assert.ok(options.body instanceof FormData);
      return Response.json({ name: "uploaded.png", subfolder: "canvas", type: "input" });
    }
    if (parsed.pathname === "/prompt") {
      const body = JSON.parse(options.body);
      queuedWorkflow = body.prompt;
      return Response.json({ number: 7, prompt_id: "prompt-1", node_errors: {} });
    }
    if (parsed.pathname === "/history/prompt-1") {
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
      assert.equal(parsed.searchParams.get("filename"), "result.png");
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
  });

  assert.equal(queuedWorkflow["71"].inputs.image, "canvas/uploaded.png");
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
  assert.equal(result.metadata.workflowVersion, "2026-08-04.1");
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

test("ComfyUI 已完成但没有输出图片时立即失败", async () => {
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/upload/image") {
      return Response.json({ name: "uploaded.png", subfolder: "", type: "input" });
    }
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
