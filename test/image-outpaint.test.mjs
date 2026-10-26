/**
 * [INPUT]: 依赖扩图服务/真实工作流、图片工具 API、生成任务入口、通用客户端与 sharp 图片样本
 * [OUTPUT]: 对外提供真实4K源尺寸/字节合同、双UNET候选能力准入、HTTP前置400/409、扩图固定2K与旧四边兼容，图片工具六套超分目录/尺寸及主Beta缺节点目录同因阻断测试
 * [POS]: test 的扩图应用与 HTTP 合同验证，使用内存客户端，不提交 GPU 任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  createImageOutpaintConfigReader, executeImageOutpaint, normalizeImageOutpaintInput,
  publicImageOutpaintConfig, verifyImageOutpaintCapabilities,
} from "../src/image-outpaint-service.mjs";
import { createImageOutpaintWorkflow, imageOutpaintPreparedDimensions } from "../src/image-outpaint-workflow.mjs";
import { createImageToolsApiHandler } from "../src/image-tools-api.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createComfyUiClient } from "../src/comfyui-client.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { readBetaUpscaleConfig } from "../src/beta-upscale.mjs";
import { createImageUpscaleWorkflow, IMAGE_UPSCALE_WORKFLOWS } from "../src/image-upscale-workflow.mjs";
import { imageOutpaintPreparedDimensions as browserDimensions } from "../public/image-outpaint.js";

const bytes = await sharp({ create: { width: 1000, height: 751, channels: 3, background: "#ddd" } }).png().toBuffer();
const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "input.png", width: 9999, height: 9999 };
const input = { referenceImages: [source], expansion: { left: 512, top: 20, right: 512, bottom: 20 } };

function capabilityFixture() {
  const graph = createImageOutpaintWorkflow({ artifactKey: "fixture-check", generationRequest: input, height: 808, imageBase64: "", seed: 1, width: 2048 });
  const info = {};
  for (const node of Object.values(graph)) {
    info[node.class_type] ||= { input: { required: {} } };
    for (const [field, value] of Object.entries(node.inputs)) {
      info[node.class_type].input.required[field] = [Array.isArray(value) ? "LINK" : typeof value === "string" ? "STRING" : "NUMBER"];
    }
  }
  return info;
}

test("Flux提示词保存仅接受运行环境支持的文本格式，兼容新旧枚举Schema", () => {
  for (const modern of [true, false]) {
    const info = capabilityFixture();
    info.SaveText.input.required.format = modern ? ["COMBO", { options: ["txt", "md"] }] : [["txt", "md"]];
    assert.doesNotThrow(() => verifyImageOutpaintCapabilities(info));
    info.SaveText.input.required.format = modern ? ["COMBO", { options: ["json"] }] : [["json"]];
    assert.throws(() => verifyImageOutpaintCapabilities(info), /SaveText.format/);
  }
});

test("扩图用实际源尺寸并忠实预处理，忽略客户端伪造尺寸", async () => {
  const result = await normalizeImageOutpaintInput(input);
  assert.equal(result.width, 2048);
  assert.equal(result.height, 808);
  assert.deepEqual(result.prepared, { width: 1024, height: 768 });
  assert.deepEqual(result.expansion, input.expansion);
  assert.equal(result.source.width, 1000);
});

test("旋转 JPEG 按浏览器显示方向归一 PNG，尺寸与提交字节一致", async () => {
  for (const orientation of [6, 8]) {
    const jpeg = await sharp(bytes).jpeg().withMetadata({ orientation }).toBuffer();
    const orientedInput = {
      referenceImages: [{ dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, name: "phone.jpg" }],
      expansion: { left: 8, top: 512, right: 0, bottom: 512 },
    };
    const normalized = await normalizeImageOutpaintInput(orientedInput);
    assert.equal(normalized.source.width, 751);
    assert.equal(normalized.source.height, 1000);
    assert.deepEqual(normalized.prepared, browserDimensions({ width: 751, height: 1000 }));
    assert.equal(normalized.width, 776);
    assert.equal(normalized.height, 2048);
    const payload = Buffer.from(normalized.source.imageUrl.split(",")[1], "base64");
    const metadata = await sharp(payload).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.width, normalized.source.width);
    assert.equal(metadata.height, normalized.source.height);
  }
});

test("扩图前后端几何在非对称与浮点边界保持一致", () => {
  for (const [width, height] of [[32, 32], [97, 149], [149, 97], [1000, 751], [2048, 2048], [3840, 2160], [4096, 4096]]) {
    const prepared = browserDimensions({ width, height });
    assert.deepEqual(prepared, imageOutpaintPreparedDimensions({ width, height }));
    assert.equal(prepared.width % 32, 0);
    assert.equal(prepared.height % 32, 0);
  }
});

test("扩图在图片解码与方向归一前拒绝超限尺寸", async () => {
  const header = Buffer.from(bytes.subarray(0, 24));
  header.writeUInt32BE(4097, 16);
  await assert.rejects(normalizeImageOutpaintInput({
    ...input, referenceImages: [{ dataUrl: `data:image/png;base64,${header.toString("base64")}` }],
  }), (error) => error.statusCode === 400 && /32–4096px/.test(error.message));
});

test("Flux接受真实4K输入并重采样至2K构图，原始尺寸与提交字节事实分别保留", async () => {
  const largeBytes = await sharp({ create: { width: 4096, height: 3072, channels: 3, background: "#ddd" } }).png().toBuffer();
  const largeInput = {
    referenceImages: [{ dataUrl: `data:image/png;base64,${largeBytes.toString("base64")}`, name: "4k.png", width: 2048, height: 1536 }],
    outpaintCanvas: { ratio: "4:3", scale: 2 / 3 },
  };
  let submitted = false;
  const result = await executeImageOutpaint(largeInput, { imageClient: { generateImage: async (request) => {
    submitted = true;
    assert.deepEqual([request.width, request.height], [2048, 1536]);
    assert.ok(request.sourceWidth < 4096 && request.sourceHeight < 3072);
    const submittedBytes = Buffer.from(request.images[0].image_url.split(",")[1], "base64");
    const actual = await sharp(submittedBytes).metadata();
    assert.deepEqual([actual.width, actual.height], [request.sourceWidth, request.sourceHeight]);
    assert.notDeepEqual(submittedBytes, largeBytes);
    return { images: [{ url: "data:image/png;base64,fixture" }], metadata: { outputWidth: request.width, outputHeight: request.height }, outputFormat: "png" };
  } } });
  assert.equal(submitted, true);
  assert.equal(result.request.size, "2048x1536");
  assert.equal(result.upstream.metadata.sourceResized, true);
  assert.deepEqual([result.upstream.metadata.originalSourceWidth, result.upstream.metadata.originalSourceHeight], [4096, 3072]);
  const config = publicImageOutpaintConfig();
  assert.deepEqual([config.maxInputEdge, config.inputAlignment, config.outputAlignment], [4096, 32, 8]);
  assert.equal(config.resolution, "2K");
  await assert.rejects(normalizeImageOutpaintInput({ ...largeInput, outpaintCanvas: undefined,
    expansion: { left: 8, top: 0, right: 0, bottom: 0 } }), (error) => error.statusCode === 400);
  const oversized = await sharp({ create: { width: 4097, height: 32, channels: 3, background: "#ddd" } }).png().toBuffer();
  await assert.rejects(normalizeImageOutpaintInput({
    ...largeInput, referenceImages: [{ dataUrl: `data:image/png;base64,${oversized.toString("base64")}` }],
  }), (error) => error.statusCode === 400 && /32–4096px/.test(error.message));
});

test("扩图拒绝非法边值、零扩展、不对齐画布和请求保护上限", async () => {
  for (const value of [-1, 0.5, "10", null, undefined, NaN, 8193]) {
    await assert.rejects(() => normalizeImageOutpaintInput({ ...input, expansion: { ...input.expansion, left: value } }), /整数像素/);
  }
  await assert.rejects(() => normalizeImageOutpaintInput({ ...input, expansion: { left: 0, top: 0, right: 0, bottom: 0 } }), /至少扩展一边/);
  await assert.rejects(() => normalizeImageOutpaintInput({ ...input, expansion: { ...input.expansion, left: 3 } }), /8px/);
  await assert.rejects(() => normalizeImageOutpaintInput({ ...input, referenceImages: [] }), /需要 1 张/);
  await assert.rejects(() => normalizeImageOutpaintInput({ ...input, referenceImages: [source, source] }), /最多上传 1 张/);
  await assert.rejects(() => normalizeImageOutpaintInput({ ...input, expansion: { left: 8192, right: 8192, top: 0, bottom: 0 } }), /保护上限/);
  await assert.rejects(() => normalizeImageOutpaintInput({ ...input, expansion: { left: 6000, right: 0, top: 6000, bottom: 0 } }), /保护上限/);
});

test("三引擎旧四边仅接受2K目标，1K和4K均在模型与归档调用前拒绝", async () => {
  let generated = 0, archived = 0;
  const imageClient = {
    getObjectInfo() { generated += 1; },
    generateImage() { generated += 1; },
    editImage() { generated += 1; },
  };
  const targets = [
    { outpaintEngine: "comfyui", prepared: { width: 1024, height: 768 }, sizes: [[1024, 1024], [4096, 2304]] },
    { outpaintEngine: "qwenImageEdit2511", prepared: { width: 1000, height: 751 }, sizes: [[1024, 768], [4096, 2304]] },
    { outpaintEngine: "gptImage25Sunburst", prepared: { width: 1000, height: 751 }, sizes: [[1024, 768], [3840, 2160]] },
  ];
  for (const { outpaintEngine, prepared, sizes } of targets) {
    for (const [width, height] of sizes) {
      const expansion = { left: 0, top: 0, right: width - prepared.width, bottom: height - prepared.height };
      await assert.rejects(executeImageOutpaint({ ...input, outpaintEngine, expansion }, {
        imageClient, scheduleSync() { archived += 1; },
      }), (error) => error.statusCode === 400 && /2K/.test(error.message));
    }
  }
  assert.equal(generated, 0);
  assert.equal(archived, 0);
});

test("扩图节点或模型缺失时只读准入拒绝执行，失败不缓存成可用", async () => {
  const valid = capabilityFixture();
  verifyImageOutpaintCapabilities(valid);
  const missingNode = structuredClone(valid);
  delete missingNode.JanusModelLoader;
  assert.throws(() => verifyImageOutpaintCapabilities(missingNode), /缺少扩图节点/);
  const missingModel = structuredClone(valid);
  missingModel.UNETLoader.input.required.unet_name = [["other.safetensors"]];
  assert.throws(() => verifyImageOutpaintCapabilities(missingModel), /缺少配置项/);
  let reads = 0;
  const reader = createImageOutpaintConfigReader({ getObjectInfo: async () => { reads += 1; return reads === 1 ? missingModel : valid; } });
  assert.equal((await reader()).available, false);
  assert.equal((await reader()).available, true);
  assert.equal((await reader()).available, true);
  assert.equal(reads, 2);
  const config = await reader();
  assert.deepEqual(config.models.map((model) => model.fileName), ["flux1-fill-dev-OneReward-fp8.safetensors", "flux1-fill-dev.safetensors"]);
  assert.doesNotMatch(JSON.stringify(config), /deepseek-ai\/Janus-Pro-1B|ae\.safetensors/);
});

test("两候选独立探测，默认缺失时原版仍可用，公共节点失配不误报可用", async () => {
  const info = capabilityFixture();
  info.UNETLoader.input.required.unet_name = [["flux1-fill-dev.safetensors"]];
  info.UNETLoader.input.required.weight_dtype = [["default", "fp8_e4m3fn"]];
  assert.throws(() => verifyImageOutpaintCapabilities(info, "oneRewardFp8"), /缺少配置项/);
  verifyImageOutpaintCapabilities(info, "fluxFillDev");
  const config = await createImageOutpaintConfigReader({ getObjectInfo: async () => info })();
  assert.equal(config.available, true);
  assert.equal(config.defaultModelKey, "fluxFillDev");
  assert.deepEqual(config.models.map(({ key, available }) => ({ key, available })), [
    { key: "oneRewardFp8", available: false }, { key: "fluxFillDev", available: true },
  ]);
  assert.match(config.models[0].reason, /缺少配置项/);
  assert.equal(config.models[1].weightDtype, "default");
  const wrongDtype = structuredClone(info);
  wrongDtype.UNETLoader.input.required.weight_dtype = [["fp8_e4m3fn"]];
  const dtypeUnavailable = await createImageOutpaintConfigReader({ getObjectInfo: async () => wrongDtype })();
  assert.equal(dtypeUnavailable.models.find((model) => model.key === "fluxFillDev").available, false);
  assert.match(dtypeUnavailable.models.find((model) => model.key === "fluxFillDev").reason, /weight_dtype/);
  const missingCommonNode = structuredClone(info);
  delete missingCommonNode.JanusModelLoader;
  const unavailable = await createImageOutpaintConfigReader({ getObjectInfo: async () => missingCommonNode })();
  assert.equal(unavailable.available, false);
  assert.ok(unavailable.models.every((model) => !model.available));
});

test("执行前复核已选模型，未知或目录失效时零生成，合法请求和结果保留真实模型身份", async () => {
  const info = capabilityFixture();
  info.UNETLoader.input.required.unet_name = [["flux1-fill-dev.safetensors"]];
  info.UNETLoader.input.required.weight_dtype = [["default", "fp8_e4m3fn"]];
  let generated = 0;
  const imageClient = {
    getObjectInfo: async () => info,
    generateImage: async (request) => {
      generated += 1;
      assert.equal(request.outpaintModel, "fluxFillDev");
      return { images: [{ url: "data:image/png;base64,fixture" }], metadata: { outputWidth: request.width, outputHeight: request.height }, outputFormat: "png" };
    },
  };
  await assert.rejects(executeImageOutpaint({ ...input, outpaintModel: "unknown" }, { imageClient }), (error) => error.statusCode === 400);
  await assert.rejects(executeImageOutpaint({ ...input, outpaintModel: "oneRewardFp8" }, { imageClient }), (error) => error.statusCode === 409);
  assert.equal(generated, 0);
  const result = await executeImageOutpaint({ ...input, outpaintModel: "fluxFillDev" }, { imageClient });
  assert.equal(generated, 1);
  for (const identity of [result.request, result.upstream.metadata]) {
    assert.equal(identity.outpaintModel, "fluxFillDev");
    assert.equal(identity.model, "flux1-fill-dev.safetensors");
    assert.equal(identity.weightDtype, "default");
  }
  const legacy = await executeImageOutpaint(input, { imageClient: { generateImage: async (request) => {
    assert.equal(request.outpaintModel, "oneRewardFp8");
    return { metadata: { outputWidth: request.width, outputHeight: request.height } };
  } } });
  assert.equal(legacy.request.outpaintModel, "oneRewardFp8");
});

test("ComfyUI 能力目录只读 GET，不提交 prompt", async () => {
  const client = createComfyUiClient({ baseUrl: "http://fixture.local/", fetchImpl: async (url, options) => {
    assert.equal(new URL(url).pathname, "/object_info");
    assert.equal(options.method, "GET");
    return Response.json({ JanusModelLoader: {} });
  } });
  assert.deepEqual(await client.getObjectInfo(), { JanusModelLoader: {} });
});

test("ComfyUI 仅取所需节点的小目录，损坏响应不会误报缺模型", async () => {
  const paths = [];
  const client = createComfyUiClient({ baseUrl: "http://fixture.local/", fetchImpl: async (url) => {
    const pathname = new URL(url).pathname;
    paths.push(pathname);
    const node = decodeURIComponent(pathname.slice("/object_info/".length));
    return Response.json({ [node]: { input: {} } });
  } });
  const info = await client.getObjectInfo(["VAELoader", "easy loadImageBase64"]);
  assert.deepEqual(Object.keys(info), ["VAELoader", "easy loadImageBase64"]);
  assert.ok(paths.every((path) => path.startsWith("/object_info/")));
  const invalid = createComfyUiClient({ fetchImpl: async () => new Response("broken-json") });
  await assert.rejects(invalid.getObjectInfo(["VAELoader"]), /目录响应无效或读取超时/);
});

test("缺少扩图客户端时应用服务拒绝执行", async () => {
  assert.equal(publicImageOutpaintConfig().available, false);
  await assert.rejects(executeImageOutpaint(input), (error) => error.statusCode === 409);
});

test("扩图执行使用专用客户端和真实尺寸，透传阶段并调度飞书归档", async () => {
  const phases = [];
  const client = { generateImage: async (request, options) => {
    assert.equal(request.width, 2048);
    assert.equal(request.preparedWidth, 1024);
    assert.equal(request.sourceWidth, 1000);
    assert.equal(options.queueTimeoutMs, 300000);
    options.onProgress({ phase: "executing", promptId: "outpaint-prompt" });
    return { images: [{ url: "data:image/png;base64,fixture" }], metadata: { outputWidth: 2048, outputHeight: 808, workflowVersion: "fixture" }, outputFormat: "png" };
  } };
  const service = createGenerationService({
    imageOutpaintClient: client,
    requireApiKey: () => assert.fail("扩图无需 Key"),
    scheduleGenerationSync: (archive) => {
      assert.equal(archive.workflow.feature, "image-outpaint");
      assert.equal(archive.modelLabel, "Flux Fill OneReward（FP8）");
      return { generationId: "outpaint-sync", status: "pending" };
    },
  });
  const result = await service.executeForMode("imageOutpaint", input, { onProgress: (phase) => phases.push(phase) });
  assert.equal(result.request.size, "2048x808");
  assert.equal(result.sync.status, "pending");
  assert.equal(phases[0].promptId, "outpaint-prompt");
  await assert.rejects(executeImageOutpaint(input, { imageClient: { generateImage: async () => ({ metadata: { outputWidth: 1000, outputHeight: 751 } }) } }), /实际输出尺寸/);
});

test("扩图仅在引擎能力与飞书合同都通过后入队，合同失败不执行GPU", async () => {
  let response;
  let enqueued = false;
  let available = false;
  let syncReady = false;
  let syncChecks = 0;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue() { enqueued = true; return { id: "fixture" }; } },
    generationService: {},
    getImageOutpaintConfig: async () => publicImageOutpaintConfig({ available, reason: "节点缺失" }),
    readJson: async () => ({ featureMode: "imageOutpaint", jobId: "generation-123456789012", items: [{ input }] }),
    sendJson(_response, status, body) { response = { status, body }; },
    verifySyncContract: async () => {
      syncChecks += 1;
      if (!syncReady) throw new Error("功能字段缺少 AI扩图");
    },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.equal(enqueued, false);
  assert.equal(syncChecks, 0);
  available = true;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.match(response.body.error, /功能字段缺少 AI扩图/);
  assert.equal(enqueued, false);
  syncReady = true;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.equal(enqueued, true);
  assert.equal(syncChecks, 2);
});

test("HTTP按实际选项入队前阻断未知400/不可用409，单项模型覆盖共享值且API引擎不接受Flux模型", async () => {
  let response;
  const enqueued = [];
  const executed = [];
  const comfy = publicImageOutpaintConfig({ available: true });
  const config = { ...comfy, defaultModelKey: "fluxFillDev", models: comfy.models.map((model) => ({ ...model, available: model.key === "fluxFillDev", reason: model.key === "oneRewardFp8" ? "OneReward模型文件缺失" : null })) };
  config.engines = [{ ...config, key: "comfyui" }, { key: "gptImage25Sunburst", available: true }];
  let body = { featureMode: "imageOutpaint", jobId: "generation-model-123456789012", sharedInput: { referenceImages: [source], outpaintModel: "oneRewardFp8" }, items: [{ input: { outpaintModel: "unknown" } }] };
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(id, details, run) { enqueued.push({ id, details, run }); return { id }; } },
    generationService: { async executeForMode(mode, request) { executed.push({ mode, request }); return {}; } },
    getImageOutpaintConfig: async () => config,
    readJson: async () => body,
    sendJson(_response, status, result) { response = { status, result }; },
    verifySyncContract: async () => {},
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 400);
  assert.equal(enqueued.length, 0);
  body.items[0].input.outpaintModel = "oneRewardFp8";
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.match(response.result.error, /OneReward模型文件缺失/);
  assert.equal(enqueued.length, 0);
  body.items[0].input.outpaintModel = "fluxFillDev";
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  await enqueued[0].run(() => {});
  assert.equal(executed[0].request.outpaintModel, "fluxFillDev");
  assert.deepEqual(enqueued[0].details.stages, { comfyUi: "submitting" });
  body = { ...body, sharedInput: { referenceImages: [source] }, items: [{ input: { outpaintEngine: "gptImage25Sunburst", outpaintModel: "fluxFillDev" } }] };
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 400);
  assert.equal(enqueued.length, 1);
  delete body.items[0].input.outpaintModel;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.deepEqual(enqueued[1].details.stages, { imageEdit: "submitting" });
});

test("HTTP三引擎从共享或单项传入1K/4K/null均在目录读取和入队前400", async () => {
  let response, body;
  let configured = 0, queued = 0, executed = 0, syncChecks = 0;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue() { queued += 1; } },
    generationService: { executeForMode() { executed += 1; } },
    getImageOutpaintConfig() { configured += 1; return publicImageOutpaintConfig({ available: true }); },
    readJson: async () => body,
    sendJson(_response, status, result) { response = { status, result }; },
    verifySyncContract: async () => { syncChecks += 1; },
  });
  for (const outpaintEngine of ["comfyui", "qwenImageEdit2511", "gptImage25Sunburst"]) {
    for (const resolution of ["1K", "4K", null]) {
      for (const field of ["resolution", "outpaintCanvas"]) {
        for (const shared of [true, false]) {
          const invalid = field === "resolution" ? { resolution } : { outpaintCanvas: { ratio: "4:3", resolution } };
          body = { featureMode: "imageOutpaint", jobId: "generation-fixed2k-123456789012",
            sharedInput: { referenceImages: [source], ...(shared ? invalid : {}) },
            items: [{ input: { outpaintEngine, ...(!shared ? invalid : {}) } }],
          };
          await handler({ method: "POST" }, {}, "/api/generation-jobs");
          assert.equal(response.status, 400, `${outpaintEngine} ${field} ${resolution} shared=${shared}`);
          assert.match(response.result.error, /2K/);
        }
      }
    }
  }
  assert.deepEqual({ configured, queued, executed, syncChecks }, { configured: 0, queued: 0, executed: 0, syncChecks: 0 });
});

function upscaleCapabilityFixture() {
  const info = {};
  for (const workflow of Object.values(IMAGE_UPSCALE_WORKFLOWS)) {
    for (const large of workflow.key.startsWith("ks_") ? [false, true] : [false]) {
      const resolution = large ? "6K" : workflow.resolutions[0].key;
      const width = large ? 6144 : resolution === "2X" ? 1024 : 4096;
      const graph = createImageUpscaleWorkflow({ artifactKey: "image-tools-test", seed: 1, imageBase64: "",
        generationRequest: { upscaleWorkflowKey: workflow.key, resolution }, width, height: large ? 6144 : width / 2 });
      for (const node of Object.values(graph)) {
        const required = (info[node.class_type] ||= { input: { required: {} } }).input.required;
        for (const field of Object.keys(node.inputs)) required[field] = ["ANY"];
      }
    }
  }
  return info;
}

test("独立图片工具公开同一扩图配置，超分按健康和完整节点目录准入", async () => {
  const responses = [];
  const objectInfo = upscaleCapabilityFixture();
  const handler = createImageToolsApiHandler({
    getImageOutpaintConfig: async () => publicImageOutpaintConfig({ available: true }),
    imageUpscaleClient: { checkHealth: async () => ({ available: true, version: "fixture" }),
      async getObjectInfo([type]) { return objectInfo[type] ? { [type]: objectInfo[type] } : {}; } },
    sendJson(_response, status, body) { responses.push({ status, body }); },
  });
  await handler({ method: "GET" }, {}, "/api/image-outpaint/config");
  await handler({ method: "GET" }, {}, "/api/image-upscale/config");
  assert.equal(responses[0].body.available, true);
  assert.equal(responses[0].body.inputAlignment, 32);
  assert.equal(responses[1].body.comfyUi.available, true);
  assert.ok(responses[1].body.workflows.every(workflow => workflow.available === true && workflow.reason === null));
  assert.deepEqual(responses[1].body.workflows.map(({ key }) => key), [
    "youxing_seedvr2_3b", "seedvr2_1mp", "seedvr2_075mp", "seedvr2_7b_direct", "ks_seedvr2_2x", "ks_seedvr2_2x_direct",
  ]);
  assert.equal(responses[1].body.defaultWorkflowKey, "youxing_seedvr2_3b");
  const direct = responses[1].body.workflows.find(({ key }) => key === "seedvr2_7b_direct");
  const ksWorkflows = responses[1].body.workflows.filter(({ key }) => key === "ks_seedvr2_2x" || key === "ks_seedvr2_2x_direct");
  assert.deepEqual(direct.resolutions.map(({ key }) => key), ["4K", "6K", "8K"]);
  for (const ks of ksWorkflows) assert.deepEqual(ks.resolutions, [
    { key: "2X", label: "原图2倍", scale: 2 },
    { key: "4K", label: "4K", longEdge: 4096 },
    { key: "6K", label: "6K", longEdge: 6144 },
  ]);
  assert.equal(await handler({ method: "POST" }, {}, "/api/image-outpaint/config"), false);
});

test("只有健康接口而缺节点目录时主工作台与Beta均不可用且原因一致", async () => {
  let response, healthReads = 0;
  const imageUpscaleClient = { async checkHealth() { healthReads += 1; return { available: true }; } };
  const handler = createImageToolsApiHandler({ imageUpscaleClient,
    sendJson(_response, status, body) { response = { status, body }; } });
  await handler({ method: "GET" }, {}, "/api/image-upscale/config");
  const beta = await readBetaUpscaleConfig(imageUpscaleClient);
  assert.equal(response.status, 200);
  assert.equal(response.body.comfyUi.available, false);
  assert.ok(response.body.workflows.every(workflow => workflow.available === false));
  assert.deepEqual(response.body.workflows.map(({ available, reason }) => ({ available, reason })),
    beta.workflows.map(({ available, reason }) => ({ available, reason })));
  assert.equal(response.body.comfyUi.reason, beta.workflows[0].reason);
  assert.equal(healthReads, 0, "缺节点读取能力时健康回执不能代替能力准入");
});
