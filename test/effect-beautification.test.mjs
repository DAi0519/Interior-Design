/**
 * [INPUT]: 依赖 node:test/assert、独立六预设 Prompt 读取器、共享效果图工作流、含全景及风格转换脱敏目录的配置聚合、飞书同步/Beta 投影与 generation-job-api
 * [OUTPUT]: 对外提供去除 LoRA 触发词后的六预设正文原样投递、默认值/非法值/单图校验、独立版本来源与脱敏、双 Provider 负向行为、功能标签和完整元信息穿透回归保障
 * [POS]: test 的效果图美化服务端合同测试，模型与飞书只用内存替身，不生成或写入真实数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  composeEffectBeautificationPrompt,
  EFFECT_BEAUTIFICATION_PROMPT_CONFIG,
  getEffectBeautificationPrompt,
  normalizeEffectBeautification,
  parseEffectBeautificationPrompt,
  publicEffectBeautificationPromptConfig,
} from "../src/effect-beautification-prompt.mjs";
import { EFFECT_ENHANCEMENT_PROMPT_CONFIG, PANORAMA_ENHANCEMENT_PROMPT_CONFIG } from "../src/effect-render-enhancement-prompt.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";
import { betaConfigSnapshot, betaSceneParameters, buildBetaRunFields } from "../src/beta-base.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { readGenerationConfig } from "../src/generation-config.mjs";

const PRESETS = {
  LOW: {
    NATURAL: "keep all material colors and textures in the picture unchanged, uniform diffuse light, eliminate overexposure of window shadows",
    WARM: "keep all material colors and textures in the picture unchanged, color temperature 4800k, uniform diffuse light, eliminate overexposure of window shadows",
    COOL: "keep all material colors and textures in the picture unchanged, white balance 5000K, suppress blown‑out highlights, keep original scene brightness, preserve shadow depth, uniform diffuse light, eliminate overexposure of window shadows",
  },
  HIGH: {
    NATURAL: "realistic and natural lighting, enhance the spatial depth of the image,  keep all material colors and textures in the picture unchanged, keep realistic contrast, preserve shadow depth, soft natural light and shadow, eliminate overexposure of window shadows",
    WARM: "realistic and natural lighting, enhance the spatial depth of the image,  keep all material colors and textures in the picture unchanged, color temperature 4000k,  no harsh exposure, keep realistic contrast, preserve shadow depth, soft natural light and shadow, no grayish white look,eliminate overexposure of window shadows",
    COOL: "realistic and natural lighting, white balance 5000K, enhance the spatial depth of the image, keep all material colors and textures in the picture unchanged, no harsh exposure, avoid whitening, keep realistic contrast, preserve shadow depth, soft natural light and shadow, no grayish white look, eliminate overexposure of window shadows",
  },
};
const source = JSON.stringify(PRESETS);
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const image = { dataUrl: png, name: "render.png", size: Buffer.from(png.split(",")[1], "base64").length, type: "image/png" };
const promptAsset = { code: "effect-render-beautification", name: "效果图美化 Prompt", prompt: source, published: true, version: 3 };
const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const envelope = (rows) => ({ ok: true, data: { data: rows, fields, has_more: false } });
const row = (version, status = "上架", code = promptAsset.code, text = source) => [promptAsset.name, code, version, [status], text, "测试版本"];
const input = {
  featureMode: "effectBeautification", modelKey: "gptImage2", outputFormat: "png", ratio: "4:3", ratioMode: "auto",
  referenceImages: [image], resolution: "1K", effectBeautificationPromptVersion: 3,
};

test("去除 LoRA 触发词后的六个固定正向预设保留大小写、双空格与 Unicode 标点，默认低强度自然调", () => {
  assert.deepEqual(parseEffectBeautificationPrompt(source), PRESETS);
  assert.equal(composeEffectBeautificationPrompt(source), PRESETS.LOW.NATURAL);
  for (const intensity of ["low", "high"]) {
    for (const tone of ["natural", "warm", "cool"]) {
      assert.equal(composeEffectBeautificationPrompt(source, { intensity, tone }), PRESETS[intensity.toUpperCase()][tone.toUpperCase()]);
    }
  }
  assert.deepEqual(normalizeEffectBeautification(), { intensity: "low", tone: "natural" });
});

test("非法预设、空值/错型/缺失或额外 Prompt 字段立即拒绝", () => {
  for (const selection of [null, [], "high", { intensity: "medium" }, { tone: "blue" }, { tone: "" }, { weather: "clear" }]) {
    assert.throws(() => normalizeEffectBeautification(selection), (error) => error.statusCode === 400);
  }
  for (const value of ["not JSON", JSON.stringify({ LOW: PRESETS.LOW }), JSON.stringify({ ...PRESETS, EXTRA: "no" }),
    JSON.stringify({ ...PRESETS, HIGH: { ...PRESETS.HIGH, WARM: " " } }), JSON.stringify({ ...PRESETS, LOW: { ...PRESETS.LOW, COOL: [] } })]) {
    assert.throws(() => parseEffectBeautificationPrompt(value), (error) => error.statusCode === 409);
  }
});

test("独立飞书来源只读取美化编码且按版本准入，浏览器只有已上架目录", async () => {
  assert.notEqual(EFFECT_BEAUTIFICATION_PROMPT_CONFIG.tableId, EFFECT_ENHANCEMENT_PROMPT_CONFIG.tableId);
  assert.notEqual(EFFECT_BEAUTIFICATION_PROMPT_CONFIG.tableId, PANORAMA_ENHANCEMENT_PROMPT_CONFIG.tableId);
  let queriedTable;
  const options = {
    config: { baseToken: "base", cliPath: "cli", tableId: "beautification-table" },
    run: async (_config, args) => {
      queriedTable = args[args.indexOf("--table-id") + 1];
      return envelope([row(9, "下架"), row(3), row(2), row(8, "上架", "effect-render-enhancement")]);
    },
  };
  assert.equal((await getEffectBeautificationPrompt(options)).version, 3);
  assert.equal((await getEffectBeautificationPrompt({ ...options, version: 2 })).version, 2);
  assert.equal(queriedTable, "beautification-table");
  await assert.rejects(() => getEffectBeautificationPrompt({ ...options, allowDraft: true, version: 9 }), /尚未上架/);
  await assert.rejects(() => getEffectBeautificationPrompt({ ...options, version: 0 }), /必须是正整数/);
  const config = await publicEffectBeautificationPromptConfig(options);
  assert.equal(config.version, 3);
  assert.deepEqual(config.versions.map((entry) => entry.version), [3, 2]);
  assert.doesNotMatch(JSON.stringify(config), /keep all material colors and textures|Prompt 正文/);
  const unavailable = await publicEffectBeautificationPromptConfig({ ...options, run: async () => envelope([row(8, "上架", "effect-render-enhancement")]) });
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.versions, []);
});

test("六预设分别经 OneAPI/Flux 单图链路原样出图，不追加天气、时段或 Agent Prompt", async () => {
  for (const modelKey of ["gptImage2", "aiTextureEnhancement"]) {
    for (const intensity of ["low", "high"]) {
      for (const tone of ["natural", "warm", "cool"]) {
        let request;
        let archived;
        let loadedVersion;
        const result = await executeEffectRenderEnhancementWorkflow({
          ...input, modelKey, effectBeautification: { intensity, tone }, effectTime: "night", effectWeather: "rainy", negativePrompt: "CUSTOM NEGATIVE",
        }, {
          loadBeautificationPrompt: async (options) => { loadedVersion = options.version; return promptAsset; },
          loadEffectPrompt: () => { throw new Error("不应读取氛围 Prompt"); },
          loadPanoramaPrompt: () => { throw new Error("不应读取全景 Prompt"); },
          imageClient: { generateImage: async (value) => { request = value; return { images: [{ url: png }], transport: modelKey === "gptImage2" ? "responses" : "comfyui" }; } },
          scheduleSync: (value) => { archived = value; return { generationId: "generated", status: "pending" }; },
        });
        const expected = PRESETS[intensity.toUpperCase()][tone.toUpperCase()];
        assert.equal(request.prompt, expected);
        assert.equal(request.images.length, 1);
        assert.equal(loadedVersion, 3);
        if (modelKey === "aiTextureEnhancement") assert.equal(request.negative_prompt, "CUSTOM NEGATIVE");
        else assert.equal("negative_prompt" in request, false);
        assert.equal(archived.finalPrompt, expected);
        assert.equal(archived.workflow.feature, "effect-render-beautification");
        assert.equal(archived.workflow.promptVersion, 3);
        assert.deepEqual(archived.workflow.effectBeautification, { intensity, tone });
        assert.equal("effectTime" in archived.workflow, false);
        assert.equal("effectWeather" in archived.workflow, false);
        assert.deepEqual(result.request.effectBeautification, { intensity, tone });
        assert.doesNotMatch(JSON.stringify(result), /keep all material colors and textures|CUSTOM NEGATIVE/);
      }
    }
  }
});

test("单图与非法选择在调用模型/Prompt 前失败", async () => {
  let loaded = false;
  const dependencies = {
    loadBeautificationPrompt: async () => { loaded = true; return promptAsset; },
    imageClient: { generateImage: async () => { throw new Error("不应出图"); } },
  };
  await assert.rejects(() => executeEffectRenderEnhancementWorkflow({ ...input, referenceImages: [image, image] }, dependencies), /效果图美化需要且只允许 1 张/);
  await assert.rejects(() => executeEffectRenderEnhancementWorkflow({ ...input, effectBeautification: { intensity: "medium" } }, dependencies), /强度选项不合法/);
  assert.equal(loaded, false);
});

test("新旧功能标签与预设进入完整工作流和 Beta 快照，沿用已有 JSON 列", () => {
  const selection = { intensity: "high", tone: "cool" };
  const beautificationInput = { ...input, effectBeautification: selection };
  const workflow = { feature: "effect-render-beautification", effectBeautification: selection, promptVersion: 3 };
  const fields = buildRecordFields({ actualSize: "1x1", durationMs: 1, finalPrompt: PRESETS.HIGH.COOL, modelLabel: "GPT Image 2", preview: { outputFormat: "png" }, workflow });
  assert.equal(fields["功能"], "效果图美化");
  assert.deepEqual(JSON.parse(fields["生成参数"]).workflow, workflow);
  assert.deepEqual(betaSceneParameters(beautificationInput).effectBeautification, selection);
  assert.equal(betaConfigSnapshot(beautificationInput).effectBeautificationPromptVersion, 3);
  assert.equal(buildBetaRunFields({ batchId: "BETA-TEST", featureMode: "effectBeautification", item: { input: beautificationInput } })["功能"], "效果图美化");
  assert.equal(buildBetaRunFields({ batchId: "BETA-TEST", featureMode: "effectEnhancement", item: { input: { modelKey: "gptImage2" } } })["功能"], "效果图氛围转换");
});

test("新效果图美化在日常后台任务目录准入并把预设传到指定功能路由", async () => {
  const registry = createGenerationJobRegistry();
  let routed;
  const handler = createGenerationJobApiHandler({
    generationJobs: registry,
    generationService: { executeForMode: async (mode, value) => { routed = { mode, input: value }; return { images: [{ url: png }] }; } },
    readJson: async () => ({ featureMode: "effectBeautification", jobId: "generation-123456789012", sharedInput: { effectBeautification: { intensity: "high", tone: "warm" } }, items: [{ input }] }),
    sendJson() {},
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(routed.mode, "effectBeautification");
  assert.deepEqual(routed.input.effectBeautification, { intensity: "high", tone: "warm" });
  assert.equal(registry.get("generation-123456789012").status, "success");
});

test("配置目录与刷新共用独立读取器，刷新穿透各来源且保持正文隔离", async () => {
  const calls = [];
  const readers = Object.fromEntries(["styles", "promptAgents", "refinedPrompt", "effectEnhancementPrompt", "effectBeautificationPrompt", "panoramaEnhancementPrompt", "smartDefault", "emptyRoom", "styleTransfer", "styleDna"].map((key) => [key, async (options) => {
    calls.push({ key, forceRefresh: options.forceRefresh });
    return key === "styles" || key === "promptAgents" ? [] : { version: key === "effectBeautificationPrompt" ? 1 : 13 };
  }]));
  const config = await readGenerationConfig({ readers });
  assert.equal(config.effectBeautificationPrompt.version, 1);
  assert.equal(config.effectEnhancementPrompt.version, 13);
  assert.equal(config.panoramaEnhancementPrompt.version, 13);
  assert.equal(config.styleTransfer.version, 13);
  assert.equal(calls.some((call) => call.key === "styleDna"), false);
  calls.length = 0;
  await readGenerationConfig({ readers, forceRefresh: true });
  assert.equal(calls.length, 10);
  assert.equal(calls.every((call) => call.forceRefresh === true), true);
});
