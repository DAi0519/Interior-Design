/**
 * [INPUT]: 依赖 node:test/assert、图片超分前后端目录/尺寸/工作流/服务、ComfyUI 客户端适配器与内存图片客户端
 * [OUTPUT]: 对外提供六份源工作流映射与攸行 3B 默认项、KS两版2X/4K/6K20MP以下整图及预处理差异及尺寸准入/模式元数据、可独立或嵌入 Flux 的 SeedVR2 阶段、保持比例、时限、Prompt ID、真实输出尺寸及新增图片工具后仍无 OneAPI/飞书依赖的回归保障
 * [POS]: test 的图片超分专项测试，不提交真实 ComfyUI 任务、不消耗 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

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
const KS_WORKFLOWS = [
  { key: "ks_seedvr2_2x", inputMegapixels: 0.75, version: "2026-10-26.3" },
  { key: "ks_seedvr2_2x_direct", inputMegapixels: null, version: "2026-10-26.3" },
];

test("图片超分公开六份 SeedVR2 工作流、逐工作流尺寸合同与攸行默认项", () => {
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
    "seedvr2_7b_direct",
    "ks_seedvr2_2x",
    "ks_seedvr2_2x_direct",
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
  assert.deepEqual(config.workflows[3].resolutions, config.resolutions);
  for (const workflow of config.workflows.slice(4)) {
    assert.deepEqual(workflow.resolutions, [{ key: "2X", label: "原图2倍", scale: 2 }, ...config.resolutions.slice(0, 2)]);
    assert.equal(workflow.outputScale, undefined, "倍率由当前档位决定，不能把整套工作流标为固定2X");
    assert.deepEqual(workflow.inputSize, {
      minWidth: 384, maxWidth: 3200, minHeight: 384, maxHeight: 3200,
    });
    assert.equal(workflow.model, undefined);
  }
  assert.equal(config.workflows[5].label, IMAGE_UPSCALE_WORKFLOWS.ks_seedvr2_2x_direct.displayLabel);
  assert.equal(IMAGE_UPSCALE_WORKFLOWS.ks_seedvr2_2x_direct.label, "KS版 · 原图直入2倍", "归档标签保留历史身份");
  assert.equal(IMAGE_UPSCALE_WORKFLOWS.ks_seedvr2_2x.label, "KS版 · 原图2倍");
  assert.equal(config.workflows[5].version, "2026-10-26.3");
  assert.equal(config.workflows[4].version, "2026-10-26.3");
});

test("新增工作流来源哈希与核心参数保持对应 JSON，不带全景补边和裁剪", async () => {
  for (const [fileName, workflowKey] of [
    ["SeedVR2-7B-独立超分.json", "seedvr2_7b_direct"],
    ["KS-超分.json", "ks_seedvr2_2x"],
    ["KS-原图直入2倍.json", "ks_seedvr2_2x_direct"],
  ]) {
    const bytes = await readFile(new URL(`../workflows/${fileName}`, import.meta.url));
    const source = JSON.parse(bytes);
    const definition = IMAGE_UPSCALE_WORKFLOWS[workflowKey];
    assert.equal(source.extra?.canvasLabSource?.sha256 || createHash("sha256").update(bytes).digest("hex"), definition.sourceSha256);
    const nodes = createImageUpscaleWorkflow({
      artifactKey: "source-upscale-1",
      generationRequest: { resolution: definition.resolutions[0].key, upscaleWorkflowKey: workflowKey },
      height: 2304,
      imageBase64: "example-base64",
      seed: 42,
      width: 4096,
    });
    for (const [type, id] of [["SeedVR2LoadDiTModel", "73"], ["SeedVR2LoadVAEModel", "74"]]) {
      const original = source.nodes.find((node) => node.type === type).widgets_values_named;
      assert.deepEqual(nodes[id].inputs, { ...original, ...(definition.areaCap && id === "73"
        ? { blocks_to_swap: 36, swap_io_components: true } : {}) });
    }
    const originalUpscaler = source.nodes.find((node) => node.type === "SeedVR2VideoUpscaler").widgets_values_named;
    for (const [key, value] of Object.entries(originalUpscaler)) {
      if (["seed", "control_after_generate", "resolution", "max_resolution"].includes(key)) continue;
      assert.deepEqual(nodes["75"].inputs[key], value);
    }
    assert.deepEqual(new Set(Object.values(nodes).map((node) => node.class_type)), new Set([
      "easy loadImageBase64", "SeedVR2LoadDiTModel", "SeedVR2LoadVAEModel", "SeedVR2VideoUpscaler", "SaveImage",
      ...(definition.inputMegapixels === null ? [] : ["ImageScaleToTotalPixels"]),
      ...(definition.areaCap ? ["ImageScale"] : []),
    ]));
  }
});

for (const resolution of ["2X", "4K", "6K"]) test(`KS ${resolution}直入版仅移除预处理节点并改变 IMAGE 接线，推理与输出参数保持一致`, () => {
  const dimensions = imageUpscaleTargetDimensions({ width: 716, height: 1294 }, resolution, KS_WORKFLOWS[0].key);
  const common = {
    artifactKey: "ks-same-input-1", height: dimensions.height, imageBase64: "same-original-base64", seed: 42, width: dimensions.width,
  };
  const [preprocessed, direct] = KS_WORKFLOWS.map(({ key }) => createImageUpscaleWorkflow({
    ...common,
    generationRequest: { resolution, sourceHeight: 1294, sourceWidth: 716, upscaleWorkflowKey: key },
  }));
  assert.equal(preprocessed["72"].class_type, "ImageScaleToTotalPixels");
  assert.deepEqual(preprocessed["77"].inputs.image, ["72", 0]);
  assert.equal(direct["72"], undefined);
  assert.deepEqual(direct["77"].inputs.image, ["71", 0]);
  assert.equal(Object.values(direct).some((node) => node.class_type === "ImageScaleToTotalPixels"), false);
  const expectedDirect = structuredClone(preprocessed);
  delete expectedDirect["72"];
  expectedDirect["77"].inputs.image = ["71", 0];
  assert.deepEqual(direct, expectedDirect);
  assert.equal(IMAGE_UPSCALE_WORKFLOWS.ks_seedvr2_2x_direct.sourceSha256,
    IMAGE_UPSCALE_WORKFLOWS.ks_seedvr2_2x.sourceSha256);
});

for (const { key, inputMegapixels, version } of KS_WORKFLOWS) {
  test(`${key} 依原图尺寸放大两倍，保持每轴输入范围与预处理/版本元数据`, () => {
    assert.deepEqual(imageUpscaleTargetDimensions({ width: 716, height: 1294 }, "2X", key), {
      height: 2588, longEdge: 2588, width: 1432,
    });
    assert.deepEqual(imageUpscaleTargetDimensions({ width: 3200, height: 384 }, "2X", key), {
      height: 768, longEdge: 6400, width: 6400,
    });
    assert.deepEqual(imageUpscaleTargetDimensions({ width: 384, height: 3200 }, "2X", key), {
      height: 6400, longEdge: 6400, width: 768,
    });
    for (const dimensions of [
      { width: 383, height: 1000 }, { width: 3201, height: 1000 },
      { width: 1000, height: 383 }, { width: 1000, height: 3201 },
    ]) {
      assert.throws(() => imageUpscaleTargetDimensions(dimensions, "2X", key), /384–3200px/);
    }
    assert.throws(() => imageUpscaleTargetDimensions({ width: 1000, height: 1000 }, "8K", key), /不支持|只支持/);
    assert.throws(() => imageUpscaleTargetDimensions({ width: 1000, height: 1000 }, "2X", "seedvr2_7b_direct"), /只支持 4K、6K 或 8K/);
    const nodes = createImageUpscaleWorkflow({
      artifactKey: "ks-upscale-request-1",
      generationRequest: { resolution: "2X", upscaleWorkflowKey: key },
      height: 2588,
      imageBase64: "example-base64",
      seed: 42,
      width: 1432,
    });
    if (inputMegapixels === null) {
      assert.equal(nodes["72"], undefined);
      assert.deepEqual(nodes["77"].inputs.image, ["71", 0]);
    } else {
      assert.equal(nodes["72"].inputs.megapixels, inputMegapixels);
      assert.equal(nodes["72"].inputs.resolution_steps, 1);
      assert.equal(nodes["72"].inputs.upscale_method, "lanczos");
    }
    assert.equal(nodes["75"].inputs.resolution, 1432);
    assert.equal(nodes["75"].inputs.max_resolution, 2588);
    const metadata = imageUpscaleWorkflowMetadata({
      generationRequest: { sourceHeight: 1294, sourceWidth: 716, upscaleWorkflowKey: key },
      height: 2588, resolution: "2X", width: 1432,
    });
    assert.equal(metadata.seedVrResolution, 1432);
    assert.equal(metadata.seedVrMaxResolution, 2588);
    assert.equal(metadata.sourceWidth, 716);
    assert.equal(metadata.sourceHeight, 1294);
    assert.equal(metadata.outputScale, 2);
    assert.equal(metadata.inputMegapixels, inputMegapixels);
    assert.equal(metadata.workflowId, key);
    assert.equal(metadata.workflowVersion, version);
    assert.equal(metadata.requestedOutputWidth, 1432);
    assert.equal(metadata.requestedOutputHeight, 2588);
  });
}

for (const { key, inputMegapixels } of KS_WORKFLOWS) {
  test(`${key} 4K/6K按长边保持原比例，节点与元数据不冒称2倍且输入边界不放宽`, () => {
    for (const [resolution, longEdge, shortEdge] of [["4K", 4096, 2304], ["6K", 6144, 3456]]) {
      for (const portrait of [false, true]) {
        const source = portrait ? { width: 900, height: 1600 } : { width: 1600, height: 900 };
        const expected = portrait ? { width: shortEdge, height: longEdge, longEdge } : { width: longEdge, height: shortEdge, longEdge };
        const dimensions = imageUpscaleTargetDimensions(source, resolution, key);
        assert.deepEqual(dimensions, expected);
        const generationRequest = { resolution, upscaleWorkflowKey: key, sourceWidth: source.width, sourceHeight: source.height };
        const graph = createImageUpscaleWorkflow({ artifactKey: "ks-long-edge", generationRequest,
          imageBase64: "same-source", seed: 42, ...dimensions });
        assert.equal(graph["75"].inputs.resolution, resolution === "4K" ? 2304 : 3348);
        assert.equal(graph["75"].inputs.max_resolution, resolution === "4K" ? 4096 : 5952);
        assert.equal(graph["72"]?.inputs.megapixels ?? null, inputMegapixels);
        assert.deepEqual(graph["77"].inputs.image, [inputMegapixels === null ? "71" : "72", 0]);
        const metadata = imageUpscaleWorkflowMetadata({ generationRequest, resolution, ...dimensions });
        assert.equal(metadata.resolution, resolution);
        assert.equal(metadata.outputScale, undefined);
        assert.equal(Object.hasOwn(metadata, "outputScale"), false);
        assert.equal(metadata.seedVrResolution, resolution === "4K" ? 2304 : 3348);
        assert.equal(metadata.seedVrMaxResolution, resolution === "4K" ? 4096 : 5952);
        assert.equal(metadata.inputMegapixels, inputMegapixels);
        assert.equal(metadata.requestedOutputWidth, expected.width);
        assert.equal(metadata.requestedOutputHeight, expected.height);
        assert.equal(metadata.workflowId, key);
      }
      for (const source of [{ width: 383, height: 900 }, { width: 900, height: 3201 }]) {
        assert.throws(() => imageUpscaleTargetDimensions(source, resolution, key), /384–3200px/);
      }
    }
    assert.throws(() => createImageUpscaleWorkflow({ artifactKey: "wrong-size", imageBase64: "source", seed: 1,
      generationRequest: { resolution: "4K", upscaleWorkflowKey: key }, width: 6144, height: 3456 }), /4K.*4096/);
    assert.throws(() => imageUpscaleWorkflowMetadata({
      generationRequest: { resolution: "4K", upscaleWorkflowKey: key }, resolution: "6K", width: 6144, height: 3456,
    }), /档位不一致/);
  });
}

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

for (const { key } of KS_WORKFLOWS) for (const [resolution, width, height] of [
  ["2X", 1432, 2588], ["4K", 2266, 4096], ["6K", 3400, 6144],
]) {
  test(`${key} 服务按真实上传尺寸准入并传递${resolution}目标与原始字节`, async () => {
    const bytes = await sharp({ create: { width: 716, height: 1294, channels: 3, background: "#888" } })
      .composite([{ input: Buffer.from('<svg width="137" height="53"><rect width="137" height="53" fill="#fa8230"/></svg>'), top: 19, left: 37 }])
      .png().toBuffer();
    const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "source.png", size: bytes.length, type: "image/png" };
    let request = null;
    let workflow = null;
    const imageClient = {
      async generateImage(input) {
        request = input;
        workflow = createImageUpscaleWorkflow({
          artifactKey: "ks-service-source-1", generationRequest: input,
          height: input.height, imageBase64: input.images[0].image_url.split(",")[1], seed: 42, width: input.width,
        });
        return {
          images: [{ url: onePixelPng }],
          metadata: { outputHeight: height, outputWidth: width },
          outputFormat: "png",
        };
      },
    };
    const result = await executeImageUpscale({
      referenceImages: [{ ...source, width: 3000, height: 3000 }],
      resolution,
      upscaleWorkflowKey: key,
    }, { imageClient });
    assert.equal(request.width, width);
    assert.equal(request.height, height);
    assert.equal(request.sourceWidth, 716);
    assert.equal(request.sourceHeight, 1294);
    assert.equal(request.resolution, resolution);
    assert.equal(workflow["75"].inputs.resolution, resolution === "2X" ? 1432 : resolution === "4K" ? 2266 : 3320);
    assert.equal(workflow["75"].inputs.max_resolution, resolution === "2X" ? 2588 : resolution === "4K" ? 4096 : 6000);
    assert.equal(request.upscaleWorkflowKey, key);
    assert.equal(request.images[0].image_url, source.dataUrl);
    const graphInputBytes = Buffer.from(workflow["71"].inputs.base64_data, "base64");
    assert.deepEqual(graphInputBytes, bytes);
    assert.equal(createHash("sha256").update(graphInputBytes).digest("hex"), createHash("sha256").update(bytes).digest("hex"));
    if (key === "ks_seedvr2_2x_direct") {
      assert.deepEqual(workflow["77"].inputs.image, ["71", 0]);
      assert.equal(workflow["72"], undefined);
    }
    assert.equal(result.request.size, `${width}x${height}`);
    request = null;
    await assert.rejects(() => executeImageUpscale({
      referenceImages: [{ dataUrl: onePixelPng, height: 1000, width: 1000 }],
      resolution,
      upscaleWorkflowKey: key,
    }, { imageClient }), /384–3200px/);
    assert.equal(request, null);
  });
}

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
  assert.match(app, /!state\.larkReady && featureMode !== "imageUpscale"/);
  assert.match(jobApi, /const localImageRequest = \[[^\]]*"imageUpscale"[^\]]*\]\.includes\(featureMode\)/);
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
