/**
 * [INPUT]: 依赖Node测试、sharp、多角度三方服务、统一生成任务及结果摘要
 * [OUTPUT]: 三方权限隔离/Sunburst五档质量透传与归档/非法档位零调用/真实字节2K/模型冻结/无重试/尺寸证据/机位指令的回归
 * [POS]: test 的三方多角度合同测试，内存客户端，不调用收费接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { executeImageMultiAngle, readMultiAngleConfig, resolveMultiAngleModel } from "../src/image-multi-angle-service.mjs";
import { multiAngleApiPrompt } from "../src/image-multi-angle-oneapi.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { resultMetadata } from "../public/workbench-utils.js";

const pose = { azimuth: 180, elevation: 0, distance: 50 };
const png = (width, height) => sharp({ create: { width, height, channels: 3, background: "#958070" } }).png().toBuffer();
const url = bytes => `data:image/png;base64,${bytes.toString("base64")}`;
const fail = () => { throw new Error("不得访问其他模型或飞书"); };

test("三方目录独立于ComfyUI，仅当前Key授权模型可选，断开后失效", async () => {
  const config = await readMultiAngleConfig(null, { getOneApiModels: async () => [{ id: resolveMultiAngleModel("banana21").id }] });
  assert.equal(config.available, true);
  assert.deepEqual(config.models.map(model => model.available), [false, true, false]);
  const disconnected = await readMultiAngleConfig(null, { getOneApiModels: async () => { throw Error("secret"); } });
  assert.equal(disconnected.available, false);
  assert.doesNotMatch(JSON.stringify(disconnected), /secret/);
  const sunburst = config.models.find(model => model.key === "gptImage25Sunburst");
  assert.deepEqual(sunburst.qualityOptions, ["low", "medium", "high", "xhigh", "max"]);
  assert.equal(sunburst.defaultQuality, "medium");
  assert.throws(() => resolveMultiAngleModel("arbitrary-model"), /不支持/);
});

for (const key of ["banana21", "gptImage25Sunburst"]) {
  test(`${key}通过统一路由发送2K真实原图/机位，输出只缩小并保留原生尺寸`, async () => {
    const model = resolveMultiAngleModel(key);
    const original = await png(4000, 3000);
    let calls = 0, archive, submittedPrompt;
    const execute = async request => {
      calls++; submittedPrompt = request.prompt;
      assert.equal(request.model, model.id);
      assert.equal(request.n, 1);
      assert.equal(request.quality, key === "gptImage25Sunburst" ? "medium" : undefined);
      assert.match(request.prompt, /REVERSE-ANGLE COUNTER-SHOT.*C toward B toward A/);
      assert.match(request.prompt, /eye-level/);
      const actual = await sharp(Buffer.from(request.images[0].image_url.split(",")[1], "base64")).metadata();
      assert.deepEqual([actual.width, actual.height], [2048, 1536]);
      assert.equal(request.response_format, "b64_json");
      return { images: [{ url: url(await png(3072, 2048)) }], transport: "fixture", usageCost: { total: 0.01 } };
    };
    const client = { generateImage: key === "banana21" ? execute : fail, editImage: key === "banana21" ? fail : execute };
    const service = createGenerationService({
      imageClientForModel: selected => { assert.equal(selected, key); return client; },
      getSessionModelCatalog: async (selected, options) => { assert.equal(selected, client); assert.equal(options.force, true); return [{ id: model.id }]; },
      imageMultiAngleClient: { generateImage: fail }, scheduleGenerationSync: value => { archive = value; return { status: "pending", generationId: "test-sync" }; }, requireApiKey: fail,
    });
    const result = await service.executeForMode("imageMultiAngle", {
      multiAngleModel: key, cameraPose: pose, referenceImages: [{ dataUrl: url(original) }],
    });
    assert.equal(calls, 1);
    assert.equal(result.workflow.key, key);
    assert.equal(result.request.size, "2048x1365");
    assert.equal(result.sync.status, "pending");
    assert.equal(archive.finalPrompt, submittedPrompt);
    assert.equal(archive.modelLabel, model.label);
    assert.equal(archive.workflow.pose.azimuth, 180);
    assert.equal(archive.workflow.promptVersion, result.workflow.promptVersion);
    assert.equal(archive.referenceImages[0].imageUrl, url(original));
    assert.equal(result.upstream.metadata.nativeOutputWidth, 3072);
    assert.equal(result.upstream.metadata.outputResized, true);
    assert.equal(result.upstream.metadata.postUpscaled, false);
    assert.equal(result.upstream.metadata.exactCameraGeometry, false);
    assert.equal(result.upstream.metadata.outputSha256.length, 64);
    assert.deepEqual(result.upstream.metadata.pose, pose);
    assert.doesNotMatch(JSON.stringify(result), /photorealistic|safetensors/);
    assert.match(resultMetadata(result), /飞书同步中/);
    assert.doesNotMatch(resultMetadata(result), /ComfyUI/);
  });
}

test("Sunburst五档质量原样提交并写入结果/费用对应的归档，默认保持medium", async () => {
  const model = resolveMultiAngleModel("gptImage25Sunburst");
  const source = { dataUrl: url(await png(960, 1200)) };
  const usageCost = { currency: "USD", nativeAmount: 0.01, costUsd: 0.01 };
  for (const quality of [undefined, ...model.qualityOptions]) {
    const expected = quality || "medium";
    let archive, calls = 0;
    const result = await executeImageMultiAngle({
      multiAngleModel: model.key, cameraPose: pose, referenceImages: [source],
      ...(quality === undefined ? {} : { quality }),
    }, {
      getOneApiModels: async () => [{ id: model.id }],
      imageClient: { editImage: async request => {
        calls++;
        assert.equal(request.quality, expected);
        return { images: [{ url: source.dataUrl }], usageCost, transport: "fixture" };
      } },
      scheduleSync: value => { archive = value; return { status: "pending" }; },
    });
    assert.equal(calls, 1);
    assert.equal(result.request.quality, expected);
    assert.equal(result.upstream.metadata.quality, expected);
    assert.equal(archive.preview.quality, expected);
    assert.equal(archive.workflow.quality, expected);
    assert.deepEqual(archive.workflow.usageCost, usageCost);
  }
});

test("非法质量或不支持档位的模型在权限读取及收费调用前拒绝", async () => {
  const source = { dataUrl: url(await png(128, 128)) };
  for (const [multiAngleModel, quality] of [
    ...["auto", "ultra", "", null].map(quality => ["gptImage25Sunburst", quality]),
    ["banana21", "low"], ["qwenMultiAngle", "low"],
  ]) {
    await assert.rejects(executeImageMultiAngle({
      multiAngleModel, quality, cameraPose: pose, referenceImages: [source],
    }, { imageClient: { editImage: fail, generateImage: fail }, getOneApiModels: fail }),
    error => error.statusCode === 400 && /质量档位/.test(error.message));
  }
});

test("失效权限/非法模型在收费前拒绝，收费错误不重试，小图结果不放大", async () => {
  const source = { dataUrl: url(await png(256, 256)) };
  const input = { multiAngleModel: "banana21", cameraPose: pose, referenceImages: [source] };
  const model = resolveMultiAngleModel("banana21");
  let calls = 0;
  const client = { generateImage: async () => { calls++; throw Error("upstream failed"); } };
  await assert.rejects(executeImageMultiAngle(input, { imageClient: client, getOneApiModels: async () => [] }), /未开放/);
  assert.equal(calls, 0);
  const options = { imageClient: client, getOneApiModels: async () => [{ id: model.id }] };
  await assert.rejects(executeImageMultiAngle(input, options), /upstream failed/);
  assert.equal(calls, 1);
  client.generateImage = async () => ({ images: [{ url: source.dataUrl }] });
  const small = await executeImageMultiAngle(input, options);
  assert.equal(small.request.size, "256x256");
  assert.equal(small.upstream.metadata.outputResized, false);
  client.generateImage = async () => ({ images: [] });
  await assert.rejects(executeImageMultiAngle(input, options), /唯一图片/);
});

test("统一任务准入冻结服务端模型身份和imageEdit阶段，禁止伪造身份和失效模型", async () => {
  const model = resolveMultiAngleModel("banana21");
  const body = { jobId: "generation-third-party-12345", featureMode: "imageMultiAngle",
    sharedInput: { referenceImages: [{ dataUrl: url(await png(128, 128)) }] },
    items: [{ key: "spoofed", label: "Qwen", provider: "comfyui", input: { multiAngleModel: "banana21", cameraPose: pose } }] };
  let available = false, response, submitted;
  const jobs = createGenerationJobRegistry();
  const handler = createGenerationJobApiHandler({
    generationJobs: jobs, generationService: { executeForMode: async (_, input) => { submitted = input; return { ok: true }; } },
    getImageMultiAngleConfig: async () => ({ models: [{ ...model, available, reason: "无权限" }] }),
    readJson: async () => body, sendJson: (_, status, value) => { response = { status, ...value }; }, verifySyncContract: async () => {},
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.equal(jobs.get(body.jobId), null);
  available = true;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.ok(Object.hasOwn(response.job.stages, "imageEdit"));
  for (let i = 0; i < 100 && jobs.get(body.jobId).status === "running"; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(submitted.multiAngleModel, "banana21");
  const outcome = jobs.get(body.jobId).result.outcomes[0];
  assert.equal(outcome.item.key, "banana21");
  assert.equal(outcome.item.label, model.label);
});

test("三方机位以原视角为基准，360归零、270左侧及俯仰/远近明确", () => {
  assert.match(multiAngleApiPrompt({ ...pose, azimuth: 360 }), /original horizontal viewing/);
  const left = multiAngleApiPrompt({ azimuth: 270, elevation: -30, distance: 100 });
  assert.match(left, /90 degrees to the left/);
  assert.match(left, /30-degree upward/);
  assert.match(left, /substantially farther/);
  assert.match(multiAngleApiPrompt({ azimuth: 90, elevation: 60, distance: 0 }), /60-degree downward.*close-up/);
});


test("反打指令约束视线和背景，不再使用物体背面语义", () => {
  const reverse = multiAngleApiPrompt({ azimuth: 204, elevation: 0, distance: 50 });
  assert.match(reverse, /24 degrees further clockwise.*204-degree/);
  assert.match(reverse, /behind the ORIGINAL camera/);
  assert.match(reverse, /back toward the windows and photograph INTO the room/);
  assert.doesNotMatch(reverse, /rear-left side of the subject/);
});
