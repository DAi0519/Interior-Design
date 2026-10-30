/**
 * [INPUT]: 依赖 Node 测试/断言、sharp 真实2:1图片、全景光影编译器与可注入共享美化服务
 * [OUTPUT]: 对外提供卡片版本SHA冻结/下架阻断、无冲突光影目标、纯词及自定义路由、实际Prompt脱敏归档与真实2:1准入测试
 * [POS]: test 的全景光影服务合同测试，使用内存光影库和模型，不调用GPU或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import {
  normalizePanoramaLighting, PANORAMA_LIGHTING_CONTRACT, PANORAMA_LIGHTING_IDENTITY,
  preparePanoramaLightingInput, resolvePanoramaLightingInput,
} from "../src/panorama-lighting.mjs";

const sha256 = "a".repeat(64);
const preset = { id: "recLightingOne", code: "night-warm", name: "夜景暖光", version: 3, sha256,
  prompt: "Target a dark night atmosphere with warm 3000K existing lamps, low daylight, and gentle contrast." };
const selection = { presetId: preset.id, version: preset.version, sha256 };
const library = { presets: [preset] };
const imageBytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#999999" } }).png().toBuffer();
const image = { dataUrl: `data:image/png;base64,${imageBytes.toString("base64")}`,
  name: "panorama.png", type: "image/png", size: imageBytes.length };
const input = { featureMode: "panoramaEnhancement", modelKey: "gptImage2", resolution: "1K",
  ratio: "2:1", ratioMode: "original", outputFormat: "png", referenceImages: [image] };

test("未选模板且无自定义光影要求时保留独立全景Prompt，不读取光影库", async () => {
  assert.deepEqual(await resolvePanoramaLightingInput({}, {
    loadAssets: () => { throw new Error("不应读库"); },
  }), { selection: null, prompt: null, metadata: { mode: "preserve", execution: "prompt-only", imageRoles: { source: 1 } } });
  assert.equal(normalizePanoramaLighting(undefined), null);
  let request;
  const result = await executeEffectRenderEnhancementWorkflow(input, {
    loadPanoramaPrompt: async () => ({ code: "panorama-render-enhancement", name: "原光照美化",
      prompt: "Retain original illumination and improve panorama materials.", published: true, version: 7 }),
    imageClient: { generateImage: async value => { request = value; return { images: [{ url: image.dataUrl }] }; } },
  });
  assert.equal(request.prompt, "Retain original illumination and improve panorama materials.");
  assert.equal(result.prompt.version, 7);
  assert.equal(result.request.panoramaLighting.mode, "preserve");
});

test("卡片与自定义词使用独立光影合同，强制读回并冻结卡片身份，正文不进入元数据", async () => {
  let options;
  const value = await resolvePanoramaLightingInput({ panoramaLighting: selection, prompt: "稍微压暗窗外" }, {
    loadAssets: async received => { options = received; return library; },
  });
  assert.deepEqual(options, { forceRefresh: true });
  assert.deepEqual(value.selection, selection);
  assert.match(value.prompt, /Change the time-of-day appearance/);
  assert.match(value.prompt, /Suppress source illumination that conflicts/);
  assert.match(value.prompt, /left and right image edges are adjacent/);
  assert.ok(value.prompt.includes(preset.prompt));
  assert.ok(value.prompt.endsWith("稍微压暗窗外"));
  assert.doesNotMatch(value.prompt, /Use only existing illumination|same-condition restoration/);
  assert.equal(value.metadata.mode, "preset");
  assert.equal(value.metadata.preset.version, 3);
  assert.equal(value.metadata.preset.sha256, sha256);
  assert.equal(value.metadata.promptSha256, createHash("sha256").update(value.prompt).digest("hex"));
  assert.doesNotMatch(JSON.stringify(value.metadata), /Target a dark|稍微压暗/);
  const prepared = await preparePanoramaLightingInput({ panoramaLighting: selection, prompt: "test" }, { loadAssets: async () => library });
  assert.deepEqual(prepared.panoramaLighting, selection);
  assert.notEqual(prepared.panoramaLighting, selection);
  assert.equal(prepared.prompt, "test");
});

test("缺失/非法卡片身份、漂移或下架模板在提交模型前拒绝", async () => {
  for (const value of [{}, [], "recLightingOne", { ...selection, version: 0 },
    { ...selection, sha256: "bad" }, { ...selection, execution: "prompt-and-reference" }]) {
    assert.throws(() => normalizePanoramaLighting(value), error => error.statusCode === 400);
  }
  for (const presets of [[], [{ ...preset, version: 4 }], [{ ...preset, sha256: "b".repeat(64) }]]) {
    let submitted = false;
    await assert.rejects(() => executeEffectRenderEnhancementWorkflow({ ...input, panoramaLighting: selection }, {
      loadPanoramaLightingAssets: async () => ({ presets }),
      imageClient: { generateImage: async () => { submitted = true; } },
    }), error => error.statusCode === 409);
    assert.equal(submitted, false);
  }
});

test("自定义光影可独立执行，不读取全景旧词和卡片库，用户词长度及格式前置准入", async () => {
  const result = await resolvePanoramaLightingInput({ prompt: "Convert to blue hour with warm interior lights." }, {
    loadAssets: () => { throw new Error("无需卡片"); },
  });
  assert.equal(result.metadata.mode, "custom");
  assert.ok(result.prompt.startsWith(PANORAMA_LIGHTING_CONTRACT));
  assert.equal("preset" in result.metadata, false);
  for (const prompt of [[], 5, "x".repeat(8001)]) {
    await assert.rejects(() => resolvePanoramaLightingInput({ prompt }), error => error.statusCode === 400);
  }
  await assert.rejects(() => resolvePanoramaLightingInput({ lightingReferenceImages: [image] }), /仅上传待处理全景图/);
  await assert.rejects(() => resolvePanoramaLightingInput({ styleReferenceImages: [image] }), /仅上传待处理全景图/);
});

test("OneAPI光影目标只通过Prompt发送，最终正文/用户词/卡片SHA进入服务端归档", async () => {
  let request, archived;
  const result = await executeEffectRenderEnhancementWorkflow({ ...input, panoramaLighting: selection, prompt: "Keep the lamps slightly dimmer." }, {
    loadPanoramaLightingAssets: async () => library,
    loadPanoramaPrompt: () => { throw new Error("不能读取旧的保原光照词"); },
    imageClient: { generateImage: async value => { request = value; return { images: [{ url: image.dataUrl }], metadata: { tokenUsage: 1 } }; } },
    scheduleSync: value => { archived = value; return { status: "pending" }; },
  });
  assert.equal("workflow_kind" in request, false);
  assert.equal("panoramaLighting" in request, false);
  assert.equal(request.images.length, 1);
  assert.ok(request.prompt.includes(preset.prompt));
  assert.equal(archived.finalPrompt, request.prompt);
  assert.equal(archived.sourcePrompt, "Keep the lamps slightly dimmer.");
  assert.equal(archived.workflow.promptCode, PANORAMA_LIGHTING_IDENTITY.code);
  assert.equal(archived.workflow.panoramaLighting.preset.sha256, sha256);
  assert.equal("effectTime" in archived.workflow, false);
  assert.equal("effectWeather" in archived.workflow, false);
  assert.equal(result.request.panoramaLighting.contract.version, 1);
  assert.doesNotMatch(JSON.stringify(result), /Target a dark|Keep the lamps/);
});

test("伪造2:1声明不能绕过全景真实图片尺寸准入，失败不读词/调用模型", async () => {
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#aaa" } }).png().toBuffer();
  const square = { ...image, dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, size: bytes.length, width: 64, height: 32 };
  await assert.rejects(() => executeEffectRenderEnhancementWorkflow({ ...input, referenceImages: [square] }, {
    loadPanoramaPrompt: () => { throw new Error("不应读词"); },
    imageClient: { generateImage: () => { throw new Error("不应调用模型"); } },
  }), /真实尺寸为 2:1/);
});

test("全景长任务将进度与取消信号传递给实际图片客户端", async () => {
  const controller = new AbortController();
  const progress = [];
  await executeEffectRenderEnhancementWorkflow({ ...input, prompt: "Change to dusk." }, {
    signal: controller.signal, onProgress: value => progress.push(value),
    imageClient: { async generateImage(_request, options) {
      assert.equal(options.signal, controller.signal);
      options.onProgress({ phase: "executing" });
      return { images: [{ url: image.dataUrl }] };
    } },
  });
  assert.deepEqual(progress, [{ phase: "executing" }]);
});
