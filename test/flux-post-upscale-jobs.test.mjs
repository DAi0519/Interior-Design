/**
 * [INPUT]: 依赖 node:test/assert/fs、sharp真实PNG、日常任务API、Beta队列/归档与Flux后置超分身份真源
 * [OUTPUT]: 验证新任务KS身份冻结、真实2K尺寸在Agent和建档前准入、Beta逐项惰性读图、旧批次3B恢复不重生及旧快照兼容、实际超分版本摘要与身份漂移阻断
 * [POS]: test 的Flux后置超分入队/恢复跨层合同，全部模型、飞书和任务执行使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { betaConfigSnapshot, betaResultVersion, buildBetaRunFields, createBetaBaseStore } from "../src/beta-base.mjs";
import { normalizeFluxPostUpscaleInput } from "../src/model-config.mjs";

const TIME = "2026-11-04 12:00:00";
const ks = normalizeFluxPostUpscaleInput({ modelKey: "aiTextureEnhancement", resolution: "4K" });
const legacy = normalizeFluxPostUpscaleInput({ modelKey: "aiTextureEnhancement", resolution: "4K" }, { legacy: true });
const turn = () => new Promise(resolve => setImmediate(resolve));
async function source(width = 640, height = 480) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#6f7d8a" } }).png().toBuffer();
  return { bytes, image: { name: "source.png", type: "image/png", size: bytes.length,
    width, height, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` } };
}
const normalSource = await source();
const wideSource = await source(4000, 250);

async function settle(jobs, id) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const job = jobs.get(id);
    if (job && job.status !== "running") return job;
    await turn();
  }
  assert.fail("内存任务未结算");
}

async function mainRequest({ reference = normalSource.image, featureMode = "whiteModel", input = {} } = {}) {
  const jobs = createGenerationJobRegistry(), generated = [];
  let response, verified = 0;
  const body = { jobId: "generation-fluxpostupscale001", featureMode,
    sharedInput: { referenceImages: [reference], prompt: "测试设计", ...input },
    items: ["4K", "6K"].map(resolution => ({ input: { modelKey: "aiTextureEnhancement", resolution } })) };
  const handler = createGenerationJobApiHandler({ generationJobs: jobs,
    generationService: { async executeForMode(mode, value) { generated.push({ mode, value }); return {}; } },
    readJson: async () => body, sendJson(_raw, status, value) { response = { status, value }; },
    verifySyncContract: async () => { verified += 1; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  if (response.status === 202) await settle(jobs, body.jobId);
  return { response, generated, verified, jobs, body };
}

test("日常白模/旧房/氛围转换的4K和6K在入队时冻结同一当前KS身份，sharedInput源图不丢失", async () => {
  for (const featureMode of ["whiteModel", "emptyRoom", "effectEnhancement"]) {
    const input = featureMode === "emptyRoom" ? { designScenario: "room-renovation" } : {};
    const { response, generated, verified } = await mainRequest({ featureMode, input });
    assert.equal(response.status, 202);
    assert.equal(verified, 1);
    assert.deepEqual(generated.map(({ value }) => value.resolution), ["4K", "6K"]);
    for (const { value } of generated) {
      assert.equal(value.postUpscaleWorkflowKey, ks.postUpscaleWorkflowKey);
      assert.equal(value.postUpscaleWorkflowVersion, ks.postUpscaleWorkflowVersion);
      assert.deepEqual(value.referenceImages, [normalSource.image]);
    }
  }
});

test("日常任务按真实Flux2K中间图预检KS尺寸，越界和版本漂移都在入队及Agent前拒绝", async () => {
  const invalidSize = await mainRequest({ reference: wideSource.image });
  assert.equal(invalidSize.response.status, 400);
  assert.match(invalidSize.response.value.error, /384.*3200/);
  assert.equal(invalidSize.generated.length + invalidSize.verified, 0);
  assert.equal(invalidSize.jobs.get(invalidSize.body.jobId), null);
  const invalidVersion = await mainRequest({ input: { postUpscaleWorkflowKey: ks.postUpscaleWorkflowKey,
    postUpscaleWorkflowVersion: "outdated-version" } });
  assert.equal(invalidVersion.response.status, 409);
  assert.equal(invalidVersion.generated.length + invalidVersion.verified, 0);
});

function betaBatch(input = {}) {
  return { jobId: "beta-flux-post-upscale001", batchId: "BETA-flux-post-upscale001", testTime: TIME,
    featureMode: "whiteModel", sampleSetId: "SET-fluxpostupscale", items: [{ caseId: "SAMPLE-1", sampleId: "SAMPLE-1",
      runId: "RUN-flux-post-upscale001", input: { modelKey: "aiTextureEnhancement", resolution: "4K", ...input } }] };
}
function betaFixture(image = normalSource.image) {
  const reads = [], archives = [], generated = [];
  let operation;
  const service = createBetaRunnerService({ maxAttempts: 1,
    jobs: { enqueue(_id, summary, execute) { operation = execute; return { ...summary, status: "running" }; } },
    baseStore: { async getSampleSet() { return { recordId: "rec-set", status: "可用", samples: [{
      sampleId: "SAMPLE-1", recordId: "rec-sample", image: { name: image.name, type: image.type, size: image.size },
    }] }; },
    async resolveSample() { reads.push("SAMPLE-1"); return { image }; },
    async beginRun(value) { archives.push(value); return { recordId: "rec-run" }; },
    async completeRun() { return { recordId: "rec-run" }; }, async failRun() {}, },
    generationService: { async executeForMode(_mode, input) { generated.push(input); return { images: [] }; } },
  });
  return { service, reads, archives, generated, run: () => operation(() => {}) };
}

test("Beta新批次先冻结KS身份，按执行项惰性读取原图且在beginRun前验证中间图尺寸", async () => {
  const fixture = betaFixture();
  await fixture.service.start(betaBatch());
  assert.deepEqual(fixture.reads, []);
  await fixture.run();
  assert.deepEqual(fixture.reads, ["SAMPLE-1"]);
  assert.equal(fixture.archives.length, 1);
  const frozen = betaConfigSnapshot(fixture.archives[0].item.input);
  assert.equal(frozen.postUpscaleWorkflowKey, ks.postUpscaleWorkflowKey);
  assert.equal(frozen.postUpscaleWorkflowVersion, ks.postUpscaleWorkflowVersion);
  assert.equal(fixture.generated[0].postUpscaleWorkflowKey, ks.postUpscaleWorkflowKey);

  const invalid = betaFixture(wideSource.image);
  await invalid.service.start(betaBatch());
  assert.deepEqual(invalid.reads, []);
  await assert.rejects(invalid.run(), /384.*3200/);
  assert.deepEqual(invalid.reads, ["SAMPLE-1"]);
  assert.equal(invalid.archives.length + invalid.generated.length, 0);
});

test("Beta冷恢复旧无身份批次沿用3B，已有成品只恢复归档，缺成品才按旧身份继续", async () => {
  for (const recovered of [true, false]) {
    const jobs = createGenerationJobRegistry(), batch = betaBatch({ referenceImages: [normalSource.image] });
    delete batch.sampleSetId;
    jobs.enqueue(batch.jobId, { featureMode: batch.featureMode, total: 1 }, async update => {
      update({ result: { batchId: batch.batchId, results: [] } });
      throw new Error("旧进程中断");
    });
    await settle(jobs, batch.jobId);
    const generated = [], recoveries = [], begins = [];
    const service = createBetaRunnerService({ jobs, maxAttempts: 1,
      baseStore: { async recoverRun({ item }) {
        recoveries.push(item.input);
        return recovered ? { recordId: "rec-existing", runId: item.runId, attempt: 1 } : null;
      }, async beginRun({ item }) { begins.push(item.input); return { recordId: "rec-new" }; },
      async completeRun() { return { recordId: "rec-new" }; }, async failRun() {}, },
      generationService: { async executeForMode(_mode, input) { generated.push(input); return { images: [] }; } },
    });
    const nextId = "beta-flux-post-upscale002";
    await service.start({ ...batch, jobId: nextId, retryOfJobId: batch.jobId });
    assert.equal((await settle(jobs, nextId)).status, "success");
    assert.equal(recoveries[0].postUpscaleWorkflowKey, legacy.postUpscaleWorkflowKey);
    assert.equal(recoveries[0].postUpscaleWorkflowVersion, legacy.postUpscaleWorkflowVersion);
    assert.equal(begins.length, recovered ? 0 : 1);
    assert.equal(generated.length, recovered ? 0 : 1);
    if (!recovered) assert.equal(generated[0].postUpscaleWorkflowKey, legacy.postUpscaleWorkflowKey);
  }
});

function envelope(fields) {
  return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)],
    record_id_list: ["rec-existing"], has_more: false } };
}
async function archiveFixture({ current = false, drift = false } = {}) {
  const output = await source(8, 8);
  const batch = betaBatch({ ...legacy, referenceImages: [normalSource.image] });
  const request = { batchId: batch.batchId, featureMode: batch.featureMode, item: batch.items[0], testTime: TIME };
  const original = { ...request.item.input };
  delete original.postUpscaleWorkflowKey;
  delete original.postUpscaleWorkflowVersion;
  const fields = { ...buildBetaRunFields({ ...request, item: { ...request.item, input: original } }),
    "状态": "失败", "错误信息": "连接中断", "最终 Prompt": "旧的冻结提示词", "尺寸": "8x8", "时延（ms）": 10,
    "结果图": [{ file_token: "result-token", name: "result.png", size: output.bytes.length }],
    "输入图": [{ file_token: "source-token", name: "source.png", size: normalSource.bytes.length }],
    "风格参考图": [], "Prompt / 工作流版本": "flux@v1",
    "生成参数": JSON.stringify({ workflow: { upscaleWorkflowKey: drift ? ks.postUpscaleWorkflowKey : legacy.postUpscaleWorkflowKey } }),
  };
  if (current) Object.assign(request.item.input, { postUpscaleWorkflowKey: ks.postUpscaleWorkflowKey,
    postUpscaleWorkflowVersion: ks.postUpscaleWorkflowVersion });
  const commands = [];
  const store = createBetaBaseStore({ async run(_config, args, options) {
    commands.push(args);
    if (args.includes("+record-list") || args.includes("+record-get")) return envelope(fields);
    if (args.includes("+record-download-attachment")) {
      await writeFile(join(options.cwd, args[args.indexOf("--output") + 1]), output.bytes);
      return { ok: true, data: {} };
    }
    if (args.includes("+record-upsert")) {
      Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1]));
      return { ok: true, data: {} };
    }
    assert.fail("恢复历史结果不得创建记录或重传图片");
  } });
  return { store, request, fields, commands };
}

test("旧3B归档缺新增快照字段仍可恢复，冻结快照保持原文；当前KS不得冒用旧结果", async () => {
  const fixture = await archiveFixture();
  const snapshot = fixture.fields["配置快照"];
  assert.equal((await fixture.store.recoverRun(fixture.request)).recordId, "rec-existing");
  assert.equal(fixture.fields["配置快照"], snapshot);
  assert.deepEqual(fixture.commands.filter(args => args.includes("+record-upsert"))
    .map(args => JSON.parse(args[args.indexOf("--json") + 1])), [{ "状态": "成功", "错误信息": "" }]);
  for (const variant of [{ current: true }, { drift: true }]) {
    const invalid = await archiveFixture(variant);
    await assert.rejects(invalid.store.recoverRun(invalid.request), error => error.statusCode === 409 && error.retryable === false);
    assert.equal(invalid.commands.filter(args => args.includes("+record-upsert")).length, 0);
  }
});

test("Beta版本摘要同时保留Flux与实际KS身份，不从历史默认3B推断", () => {
  const result = { upstream: { metadata: { workflowId: "flux-model", workflowVersion: "v1",
    upscaleWorkflowKey: legacy.postUpscaleWorkflowKey, upscaleWorkflowVersion: legacy.postUpscaleWorkflowVersion,
    postUpscale: { workflowId: ks.postUpscaleWorkflowKey, workflowVersion: ks.postUpscaleWorkflowVersion } } } };
  const version = betaResultVersion(result);
  assert.match(version, /flux-model@v1/);
  assert.ok(version.includes(`${ks.postUpscaleWorkflowKey}@${ks.postUpscaleWorkflowVersion}`));
  assert.equal(version.includes(legacy.postUpscaleWorkflowKey), false);
});
