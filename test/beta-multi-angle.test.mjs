/**
 * [INPUT]: 依赖Beta跑图应用服务、多角度模型与镜头指令版本、真实图片夹具和内存归档替身
 * [OUTPUT]: 验证含Seedream 5.5的目录模型与样本逐张绑定、90°批量机位、模型与质量冻结、失权与非法输入前置拒绝、重复任务及生成/同步失败恢复
 * [POS]: test 的Beta多角度批量回归，不调用收费模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { MULTI_ANGLE_API_MODELS } from "../src/image-multi-angle-oneapi.mjs";
import { MULTI_ANGLE_PROMPT_VERSION } from "../src/image-multi-angle-prompt.mjs";
import { resolveMultiAngleModel } from "../src/image-multi-angle-service.mjs";

const featureMode = "imageMultiAngle";
const modelKeys = ["qwenMultiAngle", ...MULTI_ANGLE_API_MODELS.map(model => model.key)];
const pose = { azimuth: 120, elevation: 90, distance: 50 };
const sampleIds = ["sample-a", "sample-b"];

function batch({ keys = modelKeys, samples = sampleIds } = {}) {
  return {
    featureMode, jobId: "beta-multi-angle-test-001", batchId: "BETA-multi-angle-test-001",
    sampleSetId: "SET-multi-angle", testTime: "2026-11-10 14:00:00",
    items: samples.flatMap(sampleId => keys.map(modelKey => ({
      runId: `RUN-${sampleId}-${modelKey}`, caseId: sampleId, sampleId, modelLabel: "客户端标签",
      input: { modelKey, multiAngleModel: modelKey, cameraPose: pose, multiAnglePromptVersion: MULTI_ANGLE_PROMPT_VERSION },
    }))),
  };
}

async function fixture({ unavailable = [], failGeneration, failSync, width = 128 } = {}) {
  const images = new Map(await Promise.all(sampleIds.map(async (sampleId, index) => {
    const bytes = await sharp({ create: { width, height: 96, channels: 3, background: index ? "blue" : "green" } }).png().toBuffer();
    return [sampleId, { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      type: "image/png", name: `${sampleId}.png`, size: bytes.length }];
  })));
  const events = { schema: [], reads: [], begin: [], generate: [], sync: [], failed: [], slept: 0 };
  const baseStore = {
    config: { baseUrl: "https://example.test/beta", tableId: "runs" },
    verifySchema(options) { events.schema.push(options); },
    async getSampleSet() {
      return { status: "可用", featureMode: "imageOutpaint", recordId: "source-set",
        samples: [...images].map(([sampleId, image]) => ({ sampleId, recordId: `record-${sampleId}`,
          image: { type: image.type, size: image.size } })) };
    },
    async resolveSample(setId, sampleId, options) {
      assert.equal(setId, "SET-multi-angle");
      assert.deepEqual(options, { recordId: `record-${sampleId}`, sampleSetRecordId: "source-set", targetFeatureMode: featureMode });
      events.reads.push(sampleId);
      return { image: images.get(sampleId) };
    },
    async beginRun(value) {
      events.begin.push(value);
      return { recordId: value.item.runId, recordUrl: `https://example.test/${value.item.runId}` };
    },
    async completeRun(recordId, result) {
      events.sync.push({ recordId, result });
      failSync?.(recordId);
      return { recordId, recordUrl: `https://example.test/${recordId}` };
    },
    async failRun(recordId, error, options) { events.failed.push({ recordId, error, options }); },
  };
  const service = createBetaRunnerService({
    baseStore,
    getMultiAngleConfig: async () => ({ internal: "never-expose", models: modelKeys.map(key => ({
      key, available: !unavailable.includes(key), label: "被替换的目录标签", ...(unavailable.includes(key) ? { reason: "失权" } : {}),
    })) }),
    generationService: {
      async executeForMode(mode, input) {
        events.generate.push({ mode, input });
        failGeneration?.(input);
        return { images: [{ url: input.referenceImages[0].dataUrl }] };
      },
    },
    sleep: async () => { events.slept++; },
  });
  return { service, events, images };
}

async function waitJob(service, jobId) {
  for (let turn = 0; turn < 200; turn++) {
    const job = service.getJob(jobId);
    if (job && job.status !== "running") return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("内存Beta任务未完成");
}

test("含Seedream 5.5的多角度目录与样本逐一配对，正俯视均冻结模型、机位和原图", async () => {
  const { service, events, images } = await fixture();
  const config = await service.config();
  assert.ok(config.features.includes(featureMode));
  assert.deepEqual(config.multiAngle.models.map(model => model.key), modelKeys);
  assert.equal(config.multiAngle.promptVersion, MULTI_ANGLE_PROMPT_VERSION);
  assert.equal(config.multiAngle.imagePolicy.maxInputBytes, 8 * 1024 * 1024);
  assert.doesNotMatch(JSON.stringify(config.multiAngle), /never-expose|被替换的目录标签|gpt-image-2\.6/);
  const request = batch();
  assert.ok(modelKeys.includes("seedream55"));
  await Promise.all([service.start(request), service.start(request)]);
  const job = await waitJob(service, request.jobId);
  assert.equal(job.status, "success");
  assert.equal(job.result.results.length, request.items.length);
  assert.deepEqual(events.schema, [{ featureMode }, { featureMode }]);
  assert.equal(events.generate.length, request.items.length);
  for (const { item } of events.begin) {
    const expectedModel = resolveMultiAngleModel(item.input.modelKey);
    assert.equal(item.modelLabel, expectedModel.label);
    assert.deepEqual(item.input.cameraPose, pose);
    assert.equal(item.input.multiAnglePromptVersion, MULTI_ANGLE_PROMPT_VERSION);
    assert.equal(item.input.quality, expectedModel.defaultQuality || undefined);
    assert.equal(item.input.referenceImages[0].dataUrl, images.get(item.sampleId).dataUrl);
    const executed = events.generate.find(entry => entry.input.multiAngleModel === expectedModel.key
      && entry.input.referenceImages[0].name === images.get(item.sampleId).name);
    assert.equal(executed.mode, featureMode);
    assert.deepEqual(executed.input, item.input);
  }
});

test("非法机位、模型档位和重传零入队，失权和真实尺寸越界零建档", async () => {
  const { service, events } = await fixture({ unavailable: ["gptImage26Flare"], width: 16 });
  for (const patch of [
    { cameraPose: { ...pose, elevation: 91 } }, { multiAngleModel: "banana21" }, { quality: "high" },
    { referenceImages: [{ dataUrl: "anything" }] }, { multiAnglePromptVersion: "2026-10-26.en.1" },
  ]) {
    const request = batch({ keys: ["qwenMultiAngle"], samples: [sampleIds[0]] });
    Object.assign(request.items[0].input, patch);
    assert.throws(() => service.start(request), { statusCode: patch.multiAnglePromptVersion ? 409 : 400 });
  }
  assert.deepEqual(events.schema, []);
  await assert.rejects(service.start(batch({ keys: ["gptImage26Flare"] })), { statusCode: 409 });
  assert.deepEqual(events.reads, []);
  const request = batch({ keys: ["qwenMultiAngle"], samples: [sampleIds[0]] });
  await service.start(request);
  assert.equal((await waitJob(service, request.jobId)).status, "failed");
  assert.deepEqual(events.begin, []);
  assert.deepEqual(events.generate, []);
});

test("多角度未知生成状态不二次提交，手动重试只复用原结果继续同步", async () => {
  let syncFailures = 1;
  const { service, events } = await fixture({
    failGeneration(input) { if (input.referenceImages[0].name === "sample-a.png") throw new Error("响应超时"); },
    failSync() { if (syncFailures-- > 0) throw new Error("归档连接中断"); },
  });
  const request = batch({ keys: ["qwenMultiAngle"] });
  await service.start(request);
  const original = await waitJob(service, request.jobId);
  assert.equal(original.status, "failed");
  assert.equal(events.slept, 0);
  assert.equal(events.generate.length, 2);
  assert.deepEqual(original.result.warnings.map(warning => warning.retryable), [false, true]);
  const retryId = "beta-multi-angle-retry-002";
  await service.retry(request.jobId, { jobId: retryId });
  const retry = await waitJob(service, retryId);
  assert.equal(retry.status, "failed");
  assert.equal(retry.result.results.length, 1);
  assert.match(retry.result.warnings[0].message, /原多角度请求已尝试执行/);
  assert.equal(events.begin.length, 2);
  assert.equal(events.generate.length, 2);
  assert.equal(events.sync.length, 2);
  assert.strictEqual(events.sync[0].result, events.sync[1].result);
  assert.equal(events.sync[0].recordId, events.sync[1].recordId);
});
