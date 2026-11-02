/**
 * [INPUT]: 依赖日常任务HTTP适配器、白模纯词光影准备器及内存光影库与任务服务
 * [OUTPUT]: 对外提供白模自动兼容/预设入队冻结/版本漂移/跨功能与图文注入阻断/运行目录能力验证
 * [POS]: test 的白模光影HTTP准入合同测试，不调用真实飞书、Agent或收费图片模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  createGenerationJobApiHandler,
  supportedGenerationFeatureCapabilities,
} from "../src/generation-job-api.mjs";
import { prepareWhiteModelLightingInput } from "../src/white-model-lighting.mjs";

const preset = { id: "recWhiteLighting", code: "sunny", name: "晴窗树影",
  version: 5, sha256: "a".repeat(64), prompt: "DAYLIGHT TARGET" };
const selection = { presetId: preset.id, version: preset.version, sha256: preset.sha256 };

function requestBody({ featureMode = "whiteModel", sharedInput = {}, items = null } = {}) {
  return { jobId: "generation-white-lighting123456", featureMode,
    sharedInput: { modelKey: "seedream5", ...sharedInput },
    items: items || [{ key: "image-1", input: {} }] };
}

function harness(body, overrides = {}) {
  const received = [];
  let response, operation, reads = 0, enqueued = 0, verified = 0;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(_id, _metadata, run) {
      enqueued += 1; operation = run; return { id: body.jobId };
    } },
    generationService: { async executeForMode(mode, input) { received.push({ mode, input }); return {}; } },
    prepareWhiteModelLighting: input => prepareWhiteModelLightingInput(input, {
      loadAssets: async () => { reads += 1; return { presets: [preset] }; },
    }),
    readJson: async () => body,
    sendJson(_response, status, value) { response = { status, value }; },
    async verifySyncContract() { verified += 1; },
    ...overrides,
  });
  return { received,
    get response() { return response; }, get reads() { return reads; },
    get enqueued() { return enqueued; }, get verified() { return verified; },
    submit: () => handler({ method: "POST" }, {}, "/api/generation-jobs"),
    run: () => operation(() => {}),
  };
}

test("白模提示词光影能力由实际任务入口声明，目录与子项均冻结", () => {
  const capabilities = supportedGenerationFeatureCapabilities();
  assert.equal(capabilities.whiteModel.promptLighting, true);
  assert.ok(Object.isFrozen(capabilities));
  assert.ok(Object.isFrozen(capabilities.whiteModel));
  assert.equal(capabilities.panoramaEnhancement.multipleLightingSelections, true);
});

for (const value of [undefined, null]) test(`白模自动${value === null ? "显式空值" : "旧请求省略"}不读取光影库且正常入队`, async () => {
  const body = requestBody({ sharedInput: value === undefined ? {} : { whiteModelLighting: value } });
  const h = harness(body);
  await h.submit();
  assert.equal(h.response.status, 202);
  assert.equal(h.reads, 0);
  assert.equal(h.verified, 1);
  await h.run();
  assert.equal(h.received[0].input.whiteModelLighting, null);
  assert.equal(h.received[0].mode, "whiteModel");
});

test("白模同一预设跨模型入队只校验一次并深复制，排队期间原请求变动不改变卡片身份", async () => {
  const body = requestBody({ sharedInput: { whiteModelLighting: { ...selection } }, items: [
    { key: "seedream", input: { modelKey: "seedream5" } },
    { key: "gpt", input: { modelKey: "gptImage2" } },
  ] });
  const h = harness(body);
  await h.submit();
  assert.equal(h.response.status, 202);
  assert.equal(h.reads, 1);
  body.sharedInput.whiteModelLighting.version = 999;
  await h.run();
  assert.equal(h.received.length, 2);
  for (const { input } of h.received) assert.deepEqual(input.whiteModelLighting, selection);
  assert.notEqual(h.received[0].input.whiteModelLighting, h.received[1].input.whiteModelLighting);
});

test("单项显式自动覆盖共享预设，不读取卡片，也不被批次共享配置覆盖", async () => {
  const h = harness(requestBody({ sharedInput: { whiteModelLighting: selection },
    items: [{ input: { whiteModelLighting: null } }] }));
  await h.submit();
  assert.equal(h.response.status, 202);
  assert.equal(h.reads, 0);
  await h.run();
  assert.equal(h.received[0].input.whiteModelLighting, null);
});

for (const badSelection of [
  { ...selection, version: 4 },
  { ...selection, sha256: "b".repeat(64) },
  { ...selection, presetId: "recUnlisted" },
]) test(`白模卡片${JSON.stringify(badSelection)}失效时零任务入队`, async () => {
  const h = harness(requestBody({ sharedInput: { whiteModelLighting: badSelection } }));
  await h.submit();
  assert.equal(h.response.status, 409);
  assert.equal(h.enqueued, 0);
  assert.equal(h.verified, 0);
});

for (const badSelection of [
  [selection], { ...selection, prompt: "UNTRUSTED LIGHTING" },
  { ...selection, referenceImages: [{ dataUrl: "data:image/png;base64,AAAA" }] },
]) test("白模光影不接受多选、客户端正文或卡片图片注入", async () => {
  const h = harness(requestBody({ sharedInput: { whiteModelLighting: badSelection } }));
  await h.submit();
  assert.equal(h.response.status, 400);
  assert.equal(h.enqueued, 0);
  assert.equal(h.reads, 0);
});

for (const featureMode of ["emptyRoom", "free", "styleTransfer", "refinedModel", "panoramaEnhancement"])
  for (const location of ["shared", "item"]) test(`${featureMode}的${location}不能携带白模光影`, async () => {
    const h = harness(requestBody({ featureMode,
      ...(location === "shared" ? { sharedInput: { whiteModelLighting: selection } }
        : { items: [{ input: { whiteModelLighting: selection } }] }),
    }));
    await h.submit();
    assert.equal(h.response.status, 400);
    assert.match(h.response.value.error, /白模/);
    assert.equal(h.enqueued, 0);
    assert.equal(h.reads, 0);
  });

test("其他普通功能的显式空值兼容旧请求", async () => {
  const h = harness(requestBody({ featureMode: "free", sharedInput: { whiteModelLighting: null } }));
  await h.submit();
  assert.equal(h.response.status, 202);
  assert.equal(h.reads, 0);
});

test("白模第二项携带光影参考图时不能借相同卡片去重跳过准入", async () => {
  const h = harness(requestBody({ sharedInput: { whiteModelLighting: selection }, items: [
    { input: {} }, { input: { lightingReferenceImages: [{ dataUrl: "data:image/png;base64,AAAA" }] } },
  ] }));
  await h.submit();
  assert.equal(h.response.status, 400);
  assert.equal(h.enqueued, 0);
});

test("白模光影保持单模型每次至多四张的原限额，超限不读卡片", async () => {
  const h = harness(requestBody({ sharedInput: { whiteModelLighting: selection },
    items: Array.from({ length: 5 }, () => ({ input: {} })) }));
  await h.submit();
  assert.equal(h.response.status, 400);
  assert.equal(h.enqueued, 0);
  assert.equal(h.reads, 0);
});
