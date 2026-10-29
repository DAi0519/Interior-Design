/**
 * [INPUT]: 依赖 node:test/assert/crypto、sharp、光影转换编译/执行、统一任务服务与飞书字段投影；Prompt/库图/模型均注入内存替身
 * [OUTPUT]: 验证单张效果图加库卡片准入、独立迁移规则、原图/卡图字节顺序、版本与资产漂移阻断、独立功能归档和实际任务路由
 * [POS]: test 的光影转换跨层合同，不调用真实模型、GPU或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { executeLightingTransferWorkflow, prepareLightingTransferInput } from "../src/lighting-transfer-workflow.mjs";
import { createGenerationJobApiHandler, supportedGenerationFeatureModes } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";
import { getLightingTransferPrompt, publicLightingTransferPromptConfig } from "../src/lighting-transfer-prompt.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
async function image(name, color) {
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: color } }).png().toBuffer();
  return { name, type: "image/png", size: bytes.length, width: 32, height: 24,
    dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
}
const source = await image("existing-render.png", "#a37841");
const card = await image("library-original.png", "#355a72");
const preset = { id: "rec-night", code: "night", name: "暖灯静夜", version: 3,
  prompt: "此卡片词不应拼入双图迁移", sha256: hash("preset-night") };
const transferPrompt = { code: "lighting-render-transfer", name: "光影转换 Prompt", version: 1, published: true,
  prompt: "IMAGE 1 is an existing finished render. Preserve its camera, architecture, furniture, material identity and base color. IMAGE 2 provides lighting and atmosphere only." };
transferPrompt.sha256 = hash(transferPrompt.prompt);
const selection = { mode: "preset", presetId: preset.id, execution: "prompt-and-reference" };
const input = { featureMode: "lightingTransfer", modelKey: "gptImage2", outputFormat: "png", resolution: "1K",
  ratio: "4:3", ratioMode: "auto", referenceImages: [source], refinedLighting: selection, prompt: "降低窗边高光" };
const dependencies = {
  loadPrompt: async () => transferPrompt,
  loadLightingAssets: async () => ({ rule: null, referenceRule: null, hybridRule: null, presets: [preset] }),
  loadLightingReference: async entry => { assert.equal(entry.id, preset.id); return card; },
};
const rejected = statusCode => error => error.statusCode === statusCode;

test("光影转换仅读取独立Prompt表和上架编码，公开配置不含正文", async () => {
  const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
  const config = { baseToken: "transfer-base", tableId: "transfer-table", cliPath: "test-cli" };
  const row = (version, code = transferPrompt.code, state = "上架") =>
    ["光影转换 Prompt", code, version, [state], `PRIVATE TRANSFER v${version}`, "独立效果图保护"];
  const run = async (_options, args) => {
    assert.equal(args[args.indexOf("--table-id") + 1], config.tableId);
    return { ok: true, data: { fields, data: [row(1), row(2), row(3, transferPrompt.code, "下架"),
      row(99, "lighting-reference-transfer")], has_more: false } };
  };
  const latest = await getLightingTransferPrompt({ config, run });
  assert.equal(latest.version, 2);
  assert.equal(latest.prompt, "PRIVATE TRANSFER v2");
  assert.equal(latest.sha256, hash(latest.prompt));
  const publicConfig = await publicLightingTransferPromptConfig({ config, run });
  assert.equal(publicConfig.available, true);
  assert.equal(publicConfig.version, 2);
  assert.equal(publicConfig.sha256, hash(latest.prompt));
  assert.doesNotMatch(JSON.stringify(publicConfig), /PRIVATE TRANSFER|lighting-reference-transfer/);
  await assert.rejects(getLightingTransferPrompt({ config, run, version: 3 }), rejected(409));
  const missing = await publicLightingTransferPromptConfig({ config: { ...config, tableId: "" }, run });
  assert.equal(missing.available, false);
  assert.deepEqual(missing.versions, []);
});

test("光影转换公开独立运行能力且目录不可由调用方修改", () => {
  const modes = supportedGenerationFeatureModes();
  assert.ok(modes.includes("lightingTransfer"));
  assert.ok(Object.isFrozen(modes));
  assert.equal(new Set(modes).size, modes.length);
});

test("未选卡片、用户上传参考、其他执行方式及错误主图数量在读资产/调用模型前拒绝", async () => {
  let read = 0, submitted = 0;
  const blocked = { loadPrompt() { read++; throw new Error("非法请求不应读Prompt"); },
    loadLightingAssets() { read++; throw new Error("非法请求不应读库"); },
    imageClient: { generateImage() { submitted++; throw new Error("不可调用模型"); } } };
  const cases = [
    { refinedLighting: null },
    { refinedLighting: { mode: "unselected" } },
    { refinedLighting: { mode: "reference" }, lightingReferenceImages: [card] },
    { refinedLighting: { ...selection, execution: "prompt-only" } },
    { refinedLighting: { ...selection, execution: "prompt-with-reference" } },
    { lightingReferenceImages: [card] },
    { styleReferenceImages: [card] },
    { referenceImages: [] },
    { referenceImages: [source, source] },
  ];
  for (const override of cases) {
    await assert.rejects(executeLightingTransferWorkflow({ ...input, ...override }, blocked), rejected(400));
  }
  assert.equal(read, 0);
  assert.equal(submitted, 0);
});

test("光影转换冻独立规则和原卡图身份，不把卡图或正文复制入队", async () => {
  const frozen = await prepareLightingTransferInput(input, dependencies);
  assert.equal(frozen.refinedLighting.ruleVersion, transferPrompt.version);
  assert.equal(frozen.refinedLighting.ruleSha256, transferPrompt.sha256);
  assert.equal(frozen.refinedLighting.version, preset.version);
  assert.equal(frozen.refinedLighting.sha256, preset.sha256);
  assert.equal(frozen.refinedLighting.referenceSha256, hash(Buffer.from(card.dataUrl.split(",")[1], "base64")));
  assert.doesNotMatch(JSON.stringify(frozen), new RegExp(transferPrompt.prompt));
  assert.equal(JSON.stringify(frozen).includes(card.dataUrl), false);
});

test("独立迁移只发送原效果图和卡片原图，零精模基础或卡片词，并独立归档", async () => {
  for (const modelKey of ["gptImage2", "aiTextureEnhancement"]) {
    let sent, archived;
    const result = await executeLightingTransferWorkflow({ ...input, modelKey }, { ...dependencies,
      imageClient: { async generateImage(request) { sent = request; return { images: [{ url: source.dataUrl }] }; } },
      scheduleSync(value) { archived = value; return { status: "pending", generationId: "lighting-transfer-sync" }; },
    });
    assert.equal(sent.prompt, `${transferPrompt.prompt}\n\n[USER LIGHTING REFINEMENTS]\n${input.prompt}`);
    assert.doesNotMatch(sent.prompt, /卡片词不应拼入/);
    assert.equal(sent.images.length, 2);
    assert.equal(sent.images[0].image_url, source.dataUrl);
    assert.equal(sent.images[1].image_url, card.dataUrl);
    assert.equal(sent.n, 1);
    if (modelKey === "aiTextureEnhancement") assert.equal(sent.workflow_kind, "refined-flux-reference");
    assert.equal(archived.workflow.feature, "lighting-transfer");
    assert.equal(archived.workflow.promptCode, transferPrompt.code);
    assert.equal(archived.workflow.promptVersion, transferPrompt.version);
    assert.equal(archived.finalPrompt, sent.prompt);
    assert.equal(archived.sourcePrompt, input.prompt);
    assert.equal(archived.referenceImages.length, 1);
    assert.equal(archived.styleReferenceImages.length, 1);
    const fields = buildRecordFields({ ...archived, actualSize: "32x24" });
    assert.equal(fields["功能"], "光影转换");
    assert.equal(fields["最终 Prompt"], sent.prompt);
    assert.equal("Prompt融合" in fields, false);
    assert.doesNotMatch(JSON.stringify(result), /existing finished render|降低窗边高光|此卡片词不应拼入/);
  }
});

test("Prompt版本/正文、卡片身份与实际原附件变化均在付费前409，不回退精模", async () => {
  const frozen = await prepareLightingTransferInput(input, dependencies);
  let submitted = 0, archived = 0;
  const execute = overrides => executeLightingTransferWorkflow(frozen, { ...dependencies, ...overrides,
    imageClient: { generateImage() { submitted++; throw new Error("漂移不可出图"); } },
    scheduleSync() { archived++; },
  });
  for (const loadPrompt of [
    async () => ({ ...transferPrompt, version: 2 }),
    async () => ({ ...transferPrompt, prompt: `${transferPrompt.prompt} CHANGED`, sha256: hash("CHANGED") }),
    async () => ({ ...transferPrompt, code: "lighting-reference-transfer" }),
    async () => { throw Object.assign(new Error("独立Prompt已下架"), { statusCode: 409 }); },
  ]) await assert.rejects(execute({ loadPrompt }), rejected(409));
  await assert.rejects(execute({ loadLightingAssets: async () => ({ presets: [] }) }), rejected(409));
  await assert.rejects(execute({ loadLightingAssets: async () => ({ presets: [{ ...preset, sha256: hash("changed-card") }] }) }), rejected(409));
  await assert.rejects(execute({ loadLightingReference: async () => source }), rejected(409));
  assert.equal(submitted, 0);
  assert.equal(archived, 0);
});

test("光影转换通过真实后台任务与生成服务路由，入队冻结与执行复核保持同一身份", async () => {
  const registry = createGenerationJobRegistry();
  let sent, archived, response, verified = 0;
  const service = createGenerationService({ requireApiKey: () => "test-only-key",
    getLightingTransferPrompt: dependencies.loadPrompt,
    loadLightingTransferAssets: dependencies.loadLightingAssets,
    loadLightingTransferReference: dependencies.loadLightingReference,
    imageClientForModel() { return { async generateImage(request) { sent = request; return { images: [{ url: source.dataUrl }] }; } }; },
    scheduleGenerationSync(value) { archived = value; return { status: "pending" }; },
  });
  const jobId = "generation-lighting-transfer-route";
  const handler = createGenerationJobApiHandler({ generationJobs: registry, generationService: service,
    prepareLightingTransfer: value => prepareLightingTransferInput(value, dependencies),
    verifySyncContract: async () => { verified++; },
    readJson: async () => ({ featureMode: "lightingTransfer", jobId, sharedInput: input,
      items: [{ key: "gptImage2", input: { modelKey: "gptImage2" } }] }),
    sendJson(_response, status, body) { response = { status, ...body }; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  for (let turn = 0; turn < 50 && registry.get(jobId)?.status === "running"; turn++) await new Promise(resolve => setImmediate(resolve));
  const job = registry.get(jobId);
  assert.equal(job.status, "success", JSON.stringify(job));
  assert.ok(verified >= 1);
  assert.equal(sent.images.length, 2);
  assert.equal(archived.workflow.feature, "lighting-transfer");
  assert.equal(archived.workflow.promptCode, transferPrompt.code);
});
