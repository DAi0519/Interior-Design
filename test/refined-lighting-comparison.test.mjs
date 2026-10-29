/**
 * [INPUT]: 依赖精模多选投影、逐模型请求适配、真实任务准入/冻结/编译与内存任务注册表；模型和飞书均为替身
 * [OUTPUT]: 验证光影乘三模式乘模型展开、共享一次底图、逐卡提示词/图序/标签与版本隔离，以及每光影每模式限额和防重复绕过
 * [POS]: test 的精模多光影/多模式对比跨层合同，不调用网络或收费生成
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildGenerationJobRequest, generationItemsForSelection } from "../public/generation-task-request.js";
import { refinedLightingSelections } from "../public/refined-lighting-controls.js";
import { publicModelCatalog } from "../src/model-config.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { prepareRefinedLightingInput } from "../src/refined-lighting.mjs";
import { prepareRefinedRenderInput } from "../src/refined-render-prompt.mjs";
import { executeRefinedModelWorkflow } from "../src/refined-model-workflow.mjs";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const hash = text => createHash("sha256").update(text).digest("hex");
const rule = { id: "rec-rule", code: "lighting-prompt-render", prompt: "TEXT RULE", version: 3, sha256: hash("text") };
const referenceRule = { id: "rec-ref", code: "lighting-reference-transfer", prompt: "TRANSFER RULE", version: 4, sha256: hash("ref") };
const hybridRule = { id: "rec-hybrid", code: "lighting-prompt-reference", prompt: "IMAGE ROLE PREFIX", version: 1, sha256: hash("hybrid") };
const preset = { id: "rec-night", code: "night", name: "夜景", version: 3, prompt: "NIGHT LIGHTING", sha256: hash("night") };
const selection = { mode: "preset", presetId: preset.id, version: preset.version, sha256: preset.sha256,
  execution: "prompt-only", ruleVersion: rule.version, ruleSha256: rule.sha256,
  executions: ["prompt-only", "prompt-and-reference", "prompt-with-reference"] };
const config = { ruleVersion: rule.version, ruleSha256: rule.sha256,
  referenceRuleVersion: referenceRule.version, referenceRuleSha256: referenceRule.sha256,
  hybridRuleVersion: hybridRule.version, hybridRuleSha256: hybridRule.sha256 };
const selections = refinedLightingSelections(selection, config);
const models = publicModelCatalog().filter(x => ["gptImage2", "banana21"].includes(x.key));
const base = { featureMode: "refinedModel", referenceImages: [{ name: "source.png", type: "image/png", dataUrl: png }],
  refinedLighting: selection, promptVersion: 2, prompt: "USER", outputFormat: "png", ratio: "1:1", ratioMode: "auto", resolution: "1K" };
const lightingDeps = { loadAssets: async () => ({ rule, referenceRule, hybridRule, presets: [preset] }),
  loadReference: async () => ({ name: "card.png", type: "image/png", dataUrl: png }) };
const compileDeps = { loadPrompt: async code => ({ code, version: 2, published: true, prompt: "BASE QUALITY" }),
  loadLightingAssets: lightingDeps.loadAssets, loadLightingReference: lightingDeps.loadReference };
function request(modelSelection = models) {
  return buildGenerationJobRequest({ baseInput: base, batchId: "batch-comparison-1234", featureMode: "refinedModel",
    models: generationItemsForSelection(modelSelection, 1, selections), jobId: "generation-comparison-1234" });
}

test("三模式×两模型生成六个独立项，底图只共享一次且迁移版本不覆盖基础", () => {
  const body = request();
  assert.equal(body.items.length, 6);
  assert.equal(body.sharedInput.referenceImages.length, 1);
  assert.equal(body.sharedInput.refinedLighting.executions, undefined);
  assert.deepEqual(body.items.map(x => x.input.promptVersion), [2, 4, 1, 2, 4, 1]);
  assert.ok(body.items.every(x => !x.input.referenceImages && !x.input.refinedLighting.executions));
  assert.equal(new Set(body.items.map(x => x.label)).size, 6);
  assert.equal(generationItemsForSelection(models.slice(0, 1), 4, selections).length, 12);
});

for (const count of [1, 2]) test(`${count}模型的三模式对比通过真实准入、冻结、执行并保留模式标签`, async () => {
  const registry = createGenerationJobRegistry(), sent = [], archived = [];
  let response;
  const body = request(models.slice(0, count));
  const handler = createGenerationJobApiHandler({ generationJobs: registry,
    readJson: async () => body, sendJson(_response, status, value) { response = { status, ...value }; },
    prepareRefinedLighting: input => prepareRefinedLightingInput(input, lightingDeps),
    prepareRefinedInput: input => prepareRefinedRenderInput(input, compileDeps),
    generationService: { executeForMode: async (_mode, input) => executeRefinedModelWorkflow(input, { ...compileDeps,
      imageClient: { async generateImage(value) { sent.push({ execution: input.refinedLighting.execution, request: value }); return { images: [{ url: png }] }; } },
      scheduleSync(value) { archived.push(value); return { status: "skipped" }; },
    }) },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  for (let i = 0; registry.get(body.jobId)?.status === "running" && i < 50; i++) await new Promise(resolve => setImmediate(resolve));
  const job = registry.get(body.jobId);
  assert.equal(job.status, "success");
  assert.equal(job.completed, count * 3);
  assert.equal(sent.length, count * 3);
  for (const { execution, request: value } of sent) {
    assert.equal(value.images.length, execution === "prompt-only" ? 1 : 2);
    assert.equal(value.prompt, execution === "prompt-and-reference" ? "TRANSFER RULE\n\nUSER"
      : execution === "prompt-with-reference" ? "IMAGE ROLE PREFIX\n\nNIGHT LIGHTING\n\nUSER"
      : "BASE QUALITY\n\nTEXT RULE\n\nNIGHT LIGHTING\n\nUSER");
  }
  assert.ok(archived.every(x => x.workflow.batchCount === count * 3));
  assert.equal(new Set(job.result.outcomes.map(x => x.item.label)).size, count * 3);
  assert.ok(job.result.outcomes.every(x => x.status === "fulfilled"));
});

test("同一模式不能绕过单模型四张或多模型单张限制", async () => {
  for (const modelCount of [1, 2]) {
    const body = request(models.slice(0, modelCount));
    body.items.push(...Array.from({ length: modelCount === 1 ? 4 : 1 }, () => structuredClone(body.items[0])));
    let status, queued = 0;
    const handler = createGenerationJobApiHandler({ generationJobs: { enqueue() { queued++; } }, generationService: {},
      readJson: async () => body, sendJson(_response, code) { status = code; } });
    await handler({ method: "POST" }, {}, "/api/generation-jobs");
    assert.equal(status, 400); assert.equal(queued, 0);
  }
});

const dayPreset = { id: "rec-day", code: "day", name: "日光", version: 3, prompt: "DAY LIGHTING", sha256: hash("day") };
const presetIdentity = value => ({ presetId: value.id, version: value.version, sha256: value.sha256 });
const multiple = { ...selection, presets: [presetIdentity(preset), presetIdentity(dayPreset)] };
const multipleConfig = { ...config, multiplePresetSelections: true, presets: [preset, dayPreset] };
const multiLightingDeps = { loadAssets: async () => ({ rule, referenceRule, hybridRule, presets: [preset, dayPreset] }),
  loadReference: async value => ({ name: `${value.code}.png`, type: "image/png", dataUrl: png }) };
const multiCompileDeps = { ...compileDeps, loadLightingAssets: multiLightingDeps.loadAssets,
  loadLightingReference: multiLightingDeps.loadReference };

function multiRequest(modelSelection = models, count = 1, value = multiple) {
  return buildGenerationJobRequest({ baseInput: { ...base, refinedLighting: value },
    batchId: "batch-multi-lighting-1234", featureMode: "refinedModel",
    models: generationItemsForSelection(modelSelection, count, refinedLightingSelections(value, multipleConfig)),
    jobId: "generation-multi-lighting-1234" });
}

async function executeRequest(body) {
  const registry = createGenerationJobRegistry(), sent = [], archived = [];
  let response;
  const handler = createGenerationJobApiHandler({ generationJobs: registry,
    readJson: async () => body, sendJson(_response, status, value) { response = { status, ...value }; },
    prepareRefinedLighting: input => prepareRefinedLightingInput(input, multiLightingDeps),
    prepareRefinedInput: input => prepareRefinedRenderInput(input, multiCompileDeps),
    generationService: { executeForMode: async (_mode, input) => executeRefinedModelWorkflow(input, { ...multiCompileDeps,
      imageClient: { async generateImage(value) {
        sent.push({ presetId: input.refinedLighting.presetId, execution: input.refinedLighting.execution, request: value });
        return { images: [{ url: png }] };
      } },
      scheduleSync(value) { archived.push(value); return { status: "skipped" }; },
    }) },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  for (let i = 0; registry.get(body.jobId)?.status === "running" && i < 100; i++) await new Promise(resolve => setImmediate(resolve));
  return { response, job: registry.get(body.jobId), sent, archived };
}

test("两光影×三方式×两模型逐卡冻结与实际编译，12项不合并或丢参考图", async () => {
  const body = multiRequest();
  assert.equal(body.items.length, 12);
  assert.equal(body.sharedInput.referenceImages.length, 1);
  assert.equal(new Set(body.items.map(item => item.label)).size, 12);
  for (const item of body.items) {
    const target = item.input.refinedLighting.presetId === preset.id ? preset : dayPreset;
    assert.ok(item.label.includes(target.name));
    assert.equal(item.input.refinedLighting.version, target.version);
    assert.equal(item.input.refinedLighting.sha256, target.sha256);
    for (const field of ["presets", "presetName", "executions"]) assert.equal(field in item.input.refinedLighting, false);
    assert.equal("referenceImages" in item.input, false);
  }
  for (const field of ["presets", "presetName", "executions"]) assert.equal(field in body.sharedInput.refinedLighting, false);
  const { response, job, sent, archived } = await executeRequest(body);
  assert.equal(response.status, 202);
  assert.equal(job.status, "success");
  assert.equal(job.completed, 12);
  assert.equal(sent.length, 12);
  for (const entry of sent) {
    const target = entry.presetId === preset.id ? preset : dayPreset;
    assert.equal(entry.request.images.length, entry.execution === "prompt-only" ? 1 : 2);
    assert.equal(entry.request.prompt, entry.execution === "prompt-and-reference" ? "TRANSFER RULE\n\nUSER"
      : entry.execution === "prompt-with-reference" ? `IMAGE ROLE PREFIX\n\n${target.prompt}\n\nUSER`
      : `BASE QUALITY\n\nTEXT RULE\n\n${target.prompt}\n\nUSER`);
    assert.equal(entry.request.images[0].fileName, "source.png");
    if (entry.execution !== "prompt-only") assert.equal(entry.request.images[1].fileName, `${target.code}.png`);
  }
  assert.ok(archived.every(value => value.workflow.batchCount === 12));
  assert.deepEqual(archived.map(value => value.workflow.refinedLighting.preset.id).sort(),
    Array(6).fill(preset.id).concat(Array(6).fill(dayPreset.id)).sort());
});

test("单模型四张按每光影每模式计数，两光影同方式可提交八项", async () => {
  const body = multiRequest(models.slice(0, 1), 4, { ...multiple, executions: ["prompt-only"] });
  assert.equal(body.items.length, 8);
  const { response, job, sent } = await executeRequest(body);
  assert.equal(response.status, 202);
  assert.equal(job.status, "success");
  assert.equal(sent.length, 8);
});

test("不能靠改变同一卡片版本、SHA或ID空白绕过每组合限额", async () => {
  for (const modelCount of [1, 2]) for (const variation of ["version", "whitespace"]) {
    const body = multiRequest(models.slice(0, modelCount), modelCount === 1 ? 4 : 1,
      { ...multiple, executions: ["prompt-only"] });
    const forged = structuredClone(body.items[0]);
    if (variation === "version") {
      forged.input.refinedLighting.version += 1;
      forged.input.refinedLighting.sha256 = "f".repeat(64);
    } else forged.input.refinedLighting.presetId = ` ${forged.input.refinedLighting.presetId} `;
    body.items.push(forged);
    let response, queued = 0, prepared = 0;
    const handler = createGenerationJobApiHandler({ generationJobs: { enqueue() { queued++; } }, generationService: {},
      prepareRefinedLighting() { prepared++; }, readJson: async () => body,
      sendJson(_response, status, value) { response = { status, ...value }; } });
    await handler({ method: "POST" }, {}, "/api/generation-jobs");
    assert.equal(response.status, 400);
    assert.equal(queued, 0);
    assert.equal(prepared, 0, "限额错误在读取资产或生成前阻断");
  }
});

test("只剩一张非首光影时仍显式投影该项，不回退旧primary", () => {
  const last = { ...selection, ...presetIdentity(dayPreset), executions: undefined,
    presetName: dayPreset.name, presets: [presetIdentity(preset), presetIdentity(dayPreset)] };
  const body = buildGenerationJobRequest({ baseInput: { ...base, refinedLighting: multiple },
    featureMode: "refinedModel", models: generationItemsForSelection(models.slice(0, 1), 1, [last]) });
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].input.refinedLighting.presetId, dayPreset.id);
  assert.equal(body.sharedInput.refinedLighting.presetId, dayPreset.id);
  assert.ok(body.items[0].label.includes(dayPreset.name));
  for (const field of ["presets", "presetName", "executions"]) assert.equal(field in body.items[0].input.refinedLighting, false);
});
