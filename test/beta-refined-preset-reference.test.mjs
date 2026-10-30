/**
 * [INPUT]: 依赖Beta归档、精模实际工作流、原卡图解析与sharp；飞书和模型均使用替身
 * [OUTPUT]: 提供迁移/氛围词双图预设原附件归档及版本区分、客户端零卡图载荷及原件漂移建档前阻断保障
 * [POS]: test 的精模图文对比Beta持久化合同，不访问网络或调用收费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { betaResultVersion, captureBetaGenerationArchive, createBetaBaseStore } from "../src/beta-base.mjs";
import { prepareRefinedLightingInput, resolveRefinedLightingInput } from "../src/refined-lighting.mjs";
import { executeRefinedModelWorkflow } from "../src/refined-model-workflow.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const image = (bytes, name) => ({ name, type: "image/png", dataUrl: `data:image/png;base64,${bytes.toString("base64")}` });

test("上传专用Prompt和光影规则身份相同时版本摘要只显示一次", () => {
  const rule = { code: "lighting-reference-transfer", version: 3 };
  assert.equal(betaResultVersion({ prompt: rule, refinedLighting: { mode: "reference", rule } }), "lighting-reference-transfer@v3");
  assert.equal(betaResultVersion({ prompt: { code: "refined-lighting-base", version: 1 },
    refinedLighting: { rule: { code: "lighting-prompt-render", version: 2 }, preset: { code: "warm-wall-wash", version: 2 } } }),
  "refined-lighting-base@v1 · lighting-prompt-render@v2 · warm-wall-wash@v2");
});

async function fixture(execution = "prompt-and-reference") {
  const sourceBytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  const cardBytes = await sharp({ create: { width: 17, height: 9, channels: 3, background: "#a76a32" } }).png().toBuffer();
  let original = image(cardBytes, "card-original.png");
  const rule = { id: "rec-rule", code: "lighting-prompt-render", version: 1, prompt: "LIGHTING RULE" };
  rule.sha256 = sha(rule.prompt);
  const referenceRule = { id: "rec-reference-rule", code: "lighting-reference-transfer", version: 3, prompt: "IMAGE 1 DESIGN; IMAGE 2 LIGHTING" };
  referenceRule.sha256 = sha(referenceRule.prompt);
  const hybridRule = { id: "rec-hybrid-rule", code: "lighting-prompt-reference", version: 1, prompt: "IMAGE ROLE PREFIX" };
  hybridRule.sha256 = sha(hybridRule.prompt);
  const preset = { id: "rec-card", code: "warm-wall-wash", version: 2, name: "暗调洗墙", prompt: "LIGHTING PLAN" };
  preset.sha256 = sha(preset.prompt);
  const lighting = { loadAssets: async () => ({ rule, referenceRule, hybridRule, presets: [preset] }), loadReference: async () => original };
  const input = { featureMode: "refinedModel", modelKey: "gptImage2", outputFormat: "png", resolution: "1K", ratio: "4:3",
    referenceImages: [image(sourceBytes, "source.png")], promptVersion: execution === "prompt-with-reference" ? 1 : 3,
    refinedLighting: { mode: "preset", execution, presetId: preset.id } };
  const prepared = await prepareRefinedLightingInput(input, lighting);
  return { sourceBytes, cardBytes, prepared, lighting, changeOriginal: value => { original = value; } };
}

for (const execution of ["prompt-and-reference", "prompt-with-reference"]) test(`Beta ${execution} 从服务器卡图建档原附件，执行和归档身份一致`, async () => {
  const { sourceBytes, cardBytes, prepared, lighting } = await fixture(execution);
  assert.deepEqual(prepared.lightingReferenceImages, []);
  const written = {}, uploaded = {};
  const store = createBetaBaseStore({ resolveLighting: value => resolveRefinedLightingInput(value, lighting),
    async run(_config, args, options) {
      const flag = name => args[args.indexOf(name) + 1];
      if (args.includes("+record-batch-create")) {
        const body = JSON.parse(flag("--json"));
        Object.assign(written, Object.fromEntries(body.fields.map((field, i) => [field, body.rows[0][i]])));
        return { ok: true, data: { record_id_list: ["rec-paired"] } };
      }
      if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(flag("--json")));
      if (args.includes("+record-upload-attachment")) {
        const bytes = await readFile(join(options.cwd, flag("--file")));
        uploaded[flag("--field-id")] = bytes;
      }
      if (args.includes("+record-get")) {
        const fields = { ...written, "输入图": [{ file_token: "source-token", size: sourceBytes.length }],
          "风格参考图": [{ file_token: "card-token", size: cardBytes.length }],
          "结果图": [{ file_token: "result-token", size: sourceBytes.length }] };
        return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: ["rec-paired"] } };
      }
      return { ok: true, data: {} };
    } });
  await store.beginRun({ batchId: "BETA-paired", featureMode: "refinedModel", testTime: "2026-10-27 17:00:00",
    item: { caseId: "CASE-paired", runId: "RUN-paired", input: prepared } });
  assert.deepEqual(uploaded["fldqe5gRKY"], cardBytes);
  const snapshot = JSON.parse(written["配置快照"]);
  assert.equal(snapshot.refinedLighting.execution, execution);
  assert.equal(snapshot.refinedLighting.referenceSha256, sha(cardBytes));
  const result = await executeRefinedModelWorkflow(prepared, {
    loadPrompt() { assert.fail("两种双图模式均不能读取旧基础Prompt"); },
    loadLightingAssets: lighting.loadAssets, loadLightingReference: lighting.loadReference,
    imageClient: { async generateImage(request) {
      assert.equal(request.images.length, 2);
      assert.equal(request.images[1].image_url, image(cardBytes, "card-original.png").dataUrl);
      assert.equal(request.prompt, execution === "prompt-with-reference"
        ? "IMAGE ROLE PREFIX\n\nLIGHTING PLAN" : "IMAGE 1 DESIGN; IMAGE 2 LIGHTING");
      return { images: [{ url: image(sourceBytes, "result.png").dataUrl }] };
    } }, scheduleSync: captureBetaGenerationArchive,
  });
  await store.completeRun("rec-paired", result);
  assert.ok(written["Prompt / 工作流版本"].includes(execution));
  assert.equal(JSON.parse(written["生成参数"]).referenceImageCount, 2);
});

test("Beta图文预设原件漂移在创建归档前拒绝，不留下运行中记录", async () => {
  const fixtureData = await fixture();
  fixtureData.changeOriginal(image(fixtureData.sourceBytes, "changed.png"));
  let cliCalls = 0;
  const store = createBetaBaseStore({ resolveLighting: value => resolveRefinedLightingInput(value, fixtureData.lighting),
    async run() { cliCalls += 1; assert.fail("原件漂移不能创建记录或上传附件"); } });
  await assert.rejects(store.beginRun({ batchId: "BETA-drift", featureMode: "refinedModel", testTime: "2026-10-27 17:00:00",
    item: { caseId: "CASE-drift", runId: "RUN-drift", input: fixtureData.prepared } }), error => error.statusCode === 409);
  assert.equal(cliCalls, 0);
});
