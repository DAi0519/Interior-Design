/**
 * [INPUT]: 依赖扩图服务/真实工作流、图片工具 API、生成任务入口、通用客户端与 sharp 图片样本
 * [OUTPUT]: 对外提供真实源尺寸/32 与 8 对齐、参数拒绝、只读能力准入、服务预检/任务路由与真实尺寸结果合同测试
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
import { imageOutpaintPreparedDimensions as browserDimensions } from "../public/image-outpaint.js";

const bytes = await sharp({ create: { width: 1000, height: 751, channels: 3, background: "#ddd" } }).png().toBuffer();
const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "input.png", width: 9999, height: 9999 };
const input = { referenceImages: [source], expansion: { left: 100, top: 20, right: 100, bottom: 20 } };

function capabilityFixture() {
  const graph = createImageOutpaintWorkflow({ artifactKey: "fixture-check", generationRequest: input, height: 808, imageBase64: "", seed: 1, width: 1224 });
  const info = {};
  for (const node of Object.values(graph)) {
    info[node.class_type] ||= { input: { required: {} } };
    for (const [field, value] of Object.entries(node.inputs)) {
      info[node.class_type].input.required[field] = [Array.isArray(value) ? "LINK" : typeof value === "string" ? "STRING" : "NUMBER"];
    }
  }
  return info;
}

test("扩图用实际源尺寸并忠实预处理，忽略客户端伪造尺寸", async () => {
  const result = await normalizeImageOutpaintInput(input);
  assert.equal(result.width, 1224);
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
      expansion: { left: 8, top: 0, right: 0, bottom: 0 },
    };
    const normalized = await normalizeImageOutpaintInput(orientedInput);
    assert.equal(normalized.source.width, 751);
    assert.equal(normalized.source.height, 1000);
    assert.deepEqual(normalized.prepared, browserDimensions({ width: 751, height: 1000 }));
    assert.equal(normalized.width, 776);
    assert.equal(normalized.height, 1024);
    const payload = Buffer.from(normalized.source.imageUrl.split(",")[1], "base64");
    const metadata = await sharp(payload).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.width, normalized.source.width);
    assert.equal(metadata.height, normalized.source.height);
  }
});

test("扩图前后端几何在非对称与浮点边界保持一致", () => {
  for (const [width, height] of [[32, 32], [97, 149], [149, 97], [1000, 751], [2048, 2048]]) {
    const prepared = browserDimensions({ width, height });
    assert.deepEqual(prepared, imageOutpaintPreparedDimensions({ width, height }));
    assert.equal(prepared.width % 32, 0);
    assert.equal(prepared.height % 32, 0);
  }
});

test("扩图在图片解码与方向归一前拒绝超限尺寸", async () => {
  const header = Buffer.from(bytes.subarray(0, 24));
  header.writeUInt32BE(4096, 16);
  await assert.rejects(normalizeImageOutpaintInput({
    ...input, referenceImages: [{ dataUrl: `data:image/png;base64,${header.toString("base64")}` }],
  }), (error) => error.statusCode === 400 && /32–2048px/.test(error.message));
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
  assert.equal(JSON.stringify(await reader()).includes("safetensors"), false);
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

test("扩图执行使用专用客户端和真实尺寸，跳过 OneAPI 与飞书并传阶段", async () => {
  const phases = [];
  const client = { generateImage: async (request, options) => {
    assert.equal(request.width, 1224);
    assert.equal(request.preparedWidth, 1024);
    assert.equal(request.sourceWidth, 1000);
    assert.equal(options.queueTimeoutMs, 300000);
    options.onProgress({ phase: "executing", promptId: "outpaint-prompt" });
    return { images: [{ url: "data:image/png;base64,fixture" }], metadata: { outputWidth: 1224, outputHeight: 808, workflowVersion: "fixture" }, outputFormat: "png" };
  } };
  const service = createGenerationService({
    imageOutpaintClient: client,
    requireApiKey: () => assert.fail("扩图无需 Key"),
    scheduleGenerationSync: () => assert.fail("扩图不归档飞书"),
  });
  const result = await service.executeForMode("imageOutpaint", input, { onProgress: (phase) => phases.push(phase) });
  assert.equal(result.request.size, "1224x808");
  assert.equal(result.sync.status, "skipped");
  assert.equal(phases[0].promptId, "outpaint-prompt");
  await assert.rejects(executeImageOutpaint(input, { imageClient: { generateImage: async () => ({ metadata: { outputWidth: 1000, outputHeight: 751 } }) } }), /实际输出尺寸/);
});

test("能力未通过时 HTTP 在入队前拒绝，可用时允许专用任务且不查飞书", async () => {
  let response;
  let enqueued = false;
  let available = false;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue() { enqueued = true; return { id: "fixture" }; } },
    generationService: {},
    getImageOutpaintConfig: async () => publicImageOutpaintConfig({ available, reason: "节点缺失" }),
    readJson: async () => ({ featureMode: "imageOutpaint", jobId: "generation-123456789012", items: [{ input }] }),
    sendJson(_response, status, body) { response = { status, body }; },
    verifySyncContract: async () => assert.fail("本机图片工具无需飞书"),
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.equal(enqueued, false);
  available = true;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.equal(enqueued, true);
});

test("独立图片工具公开同一扩图配置，保留超分健康与目录", async () => {
  const responses = [];
  const handler = createImageToolsApiHandler({
    getImageOutpaintConfig: async () => publicImageOutpaintConfig({ available: true }),
    imageUpscaleClient: { checkHealth: async () => ({ available: true, version: "fixture" }) },
    sendJson(_response, status, body) { responses.push({ status, body }); },
  });
  await handler({ method: "GET" }, {}, "/api/image-outpaint/config");
  await handler({ method: "GET" }, {}, "/api/image-upscale/config");
  assert.equal(responses[0].body.available, true);
  assert.equal(responses[0].body.inputAlignment, 32);
  assert.equal(responses[1].body.comfyUi.available, true);
  assert.equal(responses[1].body.workflows.length, 3);
  assert.equal(await handler({ method: "POST" }, {}, "/api/image-outpaint/config"), false);
});
