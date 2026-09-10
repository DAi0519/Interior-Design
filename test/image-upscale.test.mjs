/**
 * [INPUT]: 依赖 node:test/assert、图片超分前后端目录/尺寸/工作流/服务、ComfyUI 客户端适配器与内存图片客户端
 * [OUTPUT]: 对外提供三份源工作流映射与攸行 3B 默认项、4K/6K/8K 保持比例、SeedVR2 短边/长边节点参数、独立排队/执行时限、Prompt ID、真实输出尺寸、本机结果及无 OneAPI/飞书依赖的回归保障
 * [POS]: test 的图片超分专项测试，不提交真实 ComfyUI 任务、不消耗 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { targetDimensions } from "../public/image-upscale.js";
import { createComfyUiClient } from "../src/comfyui-client.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import {
  IMAGE_UPSCALE_8K_TIMEOUT_MS,
  IMAGE_UPSCALE_QUEUE_TIMEOUT_MS,
  executeImageUpscale,
  imageUpscaleExecutionTimeoutMs,
} from "../src/image-upscale-service.mjs";
import {
  IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
  IMAGE_UPSCALE_OUTPUT_NODE_ID,
  IMAGE_UPSCALE_WORKFLOWS,
  createImageUpscaleWorkflow,
  imageUpscaleArtifactPrefix,
  imageUpscaleTargetDimensions,
  imageUpscaleWorkflowMetadata,
  publicImageUpscaleConfig,
} from "../src/image-upscale-workflow.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

test("图片超分公开三份 SeedVR2 工作流、攸行默认项与 4K/6K/8K 长边", () => {
  const config = publicImageUpscaleConfig();
  assert.deepEqual(config.resolutions.map((entry) => [entry.key, entry.longEdge]), [
    ["4K", 4096],
    ["6K", 6144],
    ["8K", 8192],
  ]);
  assert.deepEqual(config.workflows.map((entry) => entry.key), [
    "youxing_seedvr2_3b",
    "seedvr2_1mp",
    "seedvr2_075mp",
  ]);
  assert.equal(config.defaultWorkflowKey, "youxing_seedvr2_3b");
  assert.equal(config.defaultWorkflowKey, IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY);
  assert.equal(
    IMAGE_UPSCALE_WORKFLOWS.youxing_seedvr2_3b.sourceSha256,
    "914316430fb444ee5ccf52a8d19c5ebfa9ad6b043be734431ea68e18b350696d",
  );
  assert.match(config.workflows[0].description, /0907攸行超分/);
  assert.match(config.workflows[1].description, /SeedVR2无损高清放大-新2\.0/);
  assert.match(config.workflows[2].description, /Unsaved Workflow \(3\)/);
});

test("4K/6K/8K 以长边为上限并在前后端保持原图比例", () => {
  assert.deepEqual(imageUpscaleTargetDimensions({ width: 1600, height: 900 }, "4K"), {
    height: 2304,
    longEdge: 4096,
    width: 4096,
  });
  assert.deepEqual(imageUpscaleTargetDimensions({ width: 900, height: 1600 }, "6K"), {
    height: 6144,
    longEdge: 6144,
    width: 3456,
  });
  assert.deepEqual(targetDimensions({ width: 1600, height: 900 }, 4096), {
    height: 2304,
    width: 4096,
  });
  assert.deepEqual(imageUpscaleTargetDimensions({ width: 2048, height: 1024 }, "8K"), {
    height: 4096,
    longEdge: 8192,
    width: 8192,
  });
  assert.throws(
    () => imageUpscaleTargetDimensions({ width: 1600, height: 900 }, "10K"),
    /只支持 4K、6K 或 8K/,
  );
});

test("两套 7B 工作流只改变预处理像素并以目标短边/长边驱动 SeedVR2", () => {
  const common = {
    artifactKey: "upscale-request-1",
    height: 2304,
    imageBase64: "example-base64",
    seed: 42,
    width: 4096,
  };
  const oneMegapixel = createImageUpscaleWorkflow({
    ...common,
    generationRequest: { upscaleWorkflowKey: "seedvr2_1mp" },
  });
  const pointSevenFive = createImageUpscaleWorkflow({
    ...common,
    generationRequest: { upscaleWorkflowKey: "seedvr2_075mp" },
  });
  const eightK = createImageUpscaleWorkflow({
    ...common,
    generationRequest: { upscaleWorkflowKey: "seedvr2_1mp" },
    height: 4096,
    width: 8192,
  });
  assert.equal(oneMegapixel["72"].inputs.megapixels, 1);
  assert.equal(pointSevenFive["72"].inputs.megapixels, 0.75);
  assert.equal(oneMegapixel["75"].inputs.resolution, 2304);
  assert.equal(oneMegapixel["75"].inputs.max_resolution, 4096);
  assert.equal(eightK["75"].inputs.resolution, 4096);
  assert.equal(eightK["75"].inputs.max_resolution, 8192);
  assert.equal(oneMegapixel["73"].inputs.model,
    "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors");
  assert.equal(oneMegapixel[IMAGE_UPSCALE_OUTPUT_NODE_ID].inputs.filename_prefix,
    "CanvasLab_SeedVR2_upscale-request-1");
});

test("攸行工作流保留 3B 原图直入、GPU 缓存与 6K 尺寸合同", () => {
  const workflow = createImageUpscaleWorkflow({
    artifactKey: "youxing-upscale-1",
    generationRequest: { upscaleWorkflowKey: "youxing_seedvr2_3b" },
    height: 3358,
    imageBase64: "example-base64",
    seed: 42,
    width: 6144,
  });
  assert.equal(workflow["72"], undefined);
  assert.deepEqual(workflow["75"].inputs.image, ["71", 0]);
  assert.equal(workflow["73"].inputs.model, "seedvr2_ema_3b_fp8_e4m3fn.safetensors");
  assert.equal(workflow["73"].inputs.blocks_to_swap, 0);
  assert.equal(workflow["73"].inputs.offload_device, "cuda:0");
  assert.equal(workflow["73"].inputs.swap_io_components, false);
  assert.equal(workflow["73"].inputs.cache_model, true);
  assert.equal(workflow["74"].inputs.offload_device, "cuda:0");
  assert.equal(workflow["74"].inputs.cache_model, true);
  assert.equal(workflow["75"].inputs.resolution, 3358);
  assert.equal(workflow["75"].inputs.max_resolution, 6144);
});

test("图片超分服务只调用专用图片客户端并返回实际输出尺寸", async () => {
  let request = null;
  let requestOptions = null;
  const progress = [];
  const result = await executeImageUpscale({
    referenceImages: [{
      dataUrl: onePixelPng,
      name: "source.png",
      size: Buffer.from(onePixelPng.split(",")[1], "base64").length,
      type: "image/png",
    }],
    resolution: "8K",
    upscaleWorkflowKey: "seedvr2_075mp",
  }, {
    imageClient: {
      async generateImage(input, options) {
        request = input;
        requestOptions = options;
        options.onProgress({ phase: "queued", promptId: "upscale-8k" });
        options.onProgress({ phase: "executing", promptId: "upscale-8k" });
        return {
          created: 1,
          images: [{ url: onePixelPng }],
          metadata: { engine: "comfyui", outputHeight: 4096, outputWidth: 8192 },
          outputFormat: "png",
          transport: "comfyui-workflow",
        };
      },
    },
    onProgress: (event) => progress.push(event),
  });
  assert.equal(request.upscaleWorkflowKey, "seedvr2_075mp");
  assert.equal(request.resolution, "8K");
  assert.equal(request.width, 8192);
  assert.equal(request.height, 8192);
  assert.equal(result.request.size, "8192x4096");
  assert.equal(result.request.syncMode, "local-only");
  assert.equal(result.sync.status, "skipped");
  assert.equal(requestOptions.executionTimeoutMs, IMAGE_UPSCALE_8K_TIMEOUT_MS);
  assert.equal(requestOptions.queueTimeoutMs, IMAGE_UPSCALE_QUEUE_TIMEOUT_MS);
  assert.equal(imageUpscaleExecutionTimeoutMs("6K"), undefined);
  assert.deepEqual(progress.map(({ message, phase }) => ({ message, phase })), [
    { message: "正在提交 8K 超分任务", phase: "submitting" },
    { message: "8K 超分已提交 ComfyUI，正在排队（Prompt ID：upscale-8k）", phase: "queued" },
    { message: "ComfyUI 正在执行 8K 超分（Prompt ID：upscale-8k）", phase: "executing" },
  ]);
});

test("通用 ComfyUI 传输层接受图片超分工作流适配器并读取真实像素", async () => {
  let queuedWorkflow = null;
  const pngBytes = Buffer.from(onePixelPng.split(",")[1], "base64");
  const client = createComfyUiClient({
    artifactPrefix: imageUpscaleArtifactPrefix,
    baseUrl: "http://comfy.example/",
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname;
      if (path === "/prompt") {
        queuedWorkflow = JSON.parse(options.body).prompt;
        return Response.json({ node_errors: {}, prompt_id: "upscale-1" });
      }
      if (path === "/history/upscale-1") {
        return Response.json({
          "upscale-1": {
            outputs: {
              [IMAGE_UPSCALE_OUTPUT_NODE_ID]: {
                images: [{
                  filename: "CanvasLab_SeedVR2_upscale-request-1_00001_.png",
                  subfolder: "",
                  type: "output",
                }],
              },
            },
            status: { completed: true, messages: [], status_str: "success" },
          },
        });
      }
      if (path === "/view") {
        return new Response(pngBytes, { headers: { "Content-Type": "image/png" } });
      }
      throw new Error(`unexpected request: ${path}`);
    },
    outputNodeId: IMAGE_UPSCALE_OUTPUT_NODE_ID,
    pollIntervalMs: 0,
    randomId: () => "upscale-request-1",
    randomSeed: () => 42,
    waitImpl: async () => {},
    workflowFactory: createImageUpscaleWorkflow,
    workflowMetadataFactory: imageUpscaleWorkflowMetadata,
  });
  const result = await client.generateImage({
    height: 2304,
    images: [{ image_url: onePixelPng }],
    resolution: "4K",
    upscaleWorkflowKey: "seedvr2_1mp",
    width: 4096,
  });
  assert.equal(queuedWorkflow["75"].inputs.max_resolution, 4096);
  assert.equal(result.metadata.outputWidth, 1);
  assert.equal(result.metadata.outputHeight, 1);
  assert.match(result.metadata.outputSha256, /^[a-f0-9]{64}$/);
});

test("生图页公开图片超分入口且不把它绑定到 OneAPI 或飞书准入", async () => {
  const [html, app, jobApi] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/generation-job-api.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-feature-mode="imageUpscale"[\s\S]*图片超分/);
  assert.match(html, /id="imageUpscaleWorkflowList"/);
  assert.match(app, /!state\.larkReady && !imageUpscaleRequest/);
  assert.match(jobApi, /featureMode !== "imageUpscale"/);
  assert.doesNotMatch(html, /图片超分[\s\S]{0,160}OneAPI/);
});

test("图片超分任务绕过飞书合同并直接进入纯 ComfyUI 执行", async () => {
  const registry = createGenerationJobRegistry();
  let response = null;
  let syncChecks = 0;
  const handler = createGenerationJobApiHandler({
    generationJobs: registry,
    generationService: {
      async executeForMode(featureMode, _input, { onProgress }) {
        assert.equal(featureMode, "imageUpscale");
        onProgress({
          message: "ComfyUI 正在执行 8K 超分",
          phase: "executing",
          promptId: "prompt-upscale-8k",
        });
        return { images: [{ url: onePixelPng }] };
      },
    },
    readJson: async () => ({
      featureMode: "imageUpscale",
      items: [{ input: { resolution: "4K" }, key: "seedvr2_1mp", label: "A" }],
      jobId: "generation-upscale-123456",
      sharedInput: { referenceImages: [] },
    }),
    sendJson(_response, statusCode, body) {
      response = { body, statusCode };
    },
    verifySyncContract: async () => {
      syncChecks += 1;
      throw new Error("不应检查飞书");
    },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 202);
  assert.equal(syncChecks, 0);
  await new Promise((resolve) => setImmediate(resolve));
  const completed = registry.get("generation-upscale-123456");
  assert.equal(completed.status, "success");
  assert.deepEqual(completed.stages, {
    comfyUi: "executing",
    promptId: "prompt-upscale-8k",
  });
});
