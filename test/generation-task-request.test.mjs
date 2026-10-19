/**
 * [INPUT]: 依赖 node:test/assert、node:fs、工作台入口/状态编排器/连接中心飞书同步合同状态/生成输入映射器、模型目录与 generation-task-request.js 的加载文案/批任务请求组装
 * [OUTPUT]: 对外提供生图及扩图的前台飞书同步合同阻断与仅超分豁免、空白默认正向提示词、Flux2 Klein 默认选择、固定 PNG 且无格式选择 UI、单模型 1–4 张展开、效果图美化六组合/非法值缺省/Prompt隔离、分功能加载文案与批任务只传一份图片载荷的回归保障
 * [POS]: test 的生成任务请求测试，不发送真实生图请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildGenerationJobRequest,
  generationItemsForSelection,
  generationLoadingCopy,
} from "../public/generation-task-request.js";
import { publicModelCatalog } from "../src/model-config.mjs";
import { buildGenerationInput } from "../public/generation-input.js";

test("工作台默认使用空白提示词与 Flux2 Klein", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<textarea\s+id="promptInput"[\s\S]*?>\s*<\/textarea>/);
  assert.doesNotMatch(html, /描述空间、材质、光线和镜头|现代住宅客厅/);
  assert.match(app, /modelKeys:\s*\["aiTextureEnhancement"\]/);
  assert.doesNotMatch(app, /modelKeys:\s*\["seedream5"\]/);
});

test("前台生图及扩图只在飞书实时 Schema 就绪后提交，仅超分除外", async () => {
  const [app, connectionCenter] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/connection-center.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /larkReady:\s*false/);
  assert.match(app, /if \(!state\.larkReady && featureMode !== "imageUpscale"\)[\s\S]*飞书同步合同未通过，已阻止生成/);
  assert.match(app, /onLarkStateChange\(setup\)[\s\S]*state\.larkReady = Boolean\(setup\?\.ready\)/);
  assert.match(connectionCenter, /onLarkStateChange\(setup\)/);
});

test("日常生图移除输出格式 UI 并固定提交 PNG", async () => {
  const [html, app, generationInput] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/generation-input.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(html, /id="formatSelect"|>输出格式</);
  assert.match(html, /id="generationCountField" class="field"/);
  assert.match(generationInput, /outputFormat:\s*"png"/);
  assert.doesNotMatch(app, /formatSelect/);
});

test("超过四个模型的后台任务只在共享输入传递一份图片", () => {
  const models = publicModelCatalog();
  assert.ok(models.length > 4);
  assert.equal(generationItemsForSelection(models, 4), models);
  const request = buildGenerationJobRequest({
    baseInput: {
      featureMode: "free",
      outputFormat: "png",
      prompt: "现代客厅",
      ratio: "4:3",
      referenceImages: [{ dataUrl: "data:image/png;base64,AA==" }],
      resolution: "2K",
    },
    batchId: "batch-1",
    featureMode: "free",
    forcePromptRegeneration: false,
    jobId: "generation-request-123456",
    models,
    sourceImage: null,
  });
  assert.equal(request.sharedInput.referenceImages.length, 1);
  assert.equal(request.items.length, models.length);
  assert.deepEqual(request.items.map((item) => item.key), models.map((model) => model.key));
  assert.ok(request.items.every((item) => !("referenceImages" in item.input)));
  assert.throws(() => generationItemsForSelection([], 1), /至少选择 1 个/);
});

test("单模型生成张数展开为最多四个独立生成项", () => {
  const [model] = publicModelCatalog();
  const items = generationItemsForSelection([model], 4);
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((item) => item.key), Array(4).fill(model.key));
  assert.deepEqual(items.map((item) => item.label), [
    `${model.label} · 1/4`,
    `${model.label} · 2/4`,
    `${model.label} · 3/4`,
    `${model.label} · 4/4`,
  ]);
  assert.equal(generationItemsForSelection([model], 1)[0], model);
  assert.throws(() => generationItemsForSelection([model], 5), /1–4 张/);
});

test("多模型保持每模型一张且单模型多张加载文案准确", () => {
  const models = publicModelCatalog().slice(0, 2);
  assert.equal(generationItemsForSelection(models, 4), models);
  assert.match(generationLoadingCopy({
    designPromptRequest: false,
    emptyRoomRequest: false,
    forcePromptRegeneration: false,
    generationCount: 4,
    models: [models[0]],
    refinedModelRequest: false,
    refinedPrompt: "",
    renderMode: "smart-default",
    styleReferenceCount: 0,
  }), /4 张生成请求/);
});

test("白模风格参考与精模自定义要求显示对应加载文案", () => {
  const base = {
    forcePromptRegeneration: false,
    models: [{ label: "Seedream 5.0" }],
    refinedModelRequest: false,
  };
  assert.match(generationLoadingCopy({
    ...base,
    designPromptRequest: true,
    emptyRoomRequest: false,
    refinedPrompt: "",
    renderMode: "smart-default",
    styleReferenceCount: 1,
  }), /风格参考图/);
  assert.match(generationLoadingCopy({
    ...base,
    designPromptRequest: false,
    emptyRoomRequest: false,
    refinedModelRequest: true,
    refinedPrompt: "保留原材质",
    renderMode: "smart-default",
    styleReferenceCount: 0,
  }), /自定义要求/);
});

test("效果图氛围转换显示天气时段专用加载文案", () => {
  assert.match(generationLoadingCopy({
    designPromptRequest: false,
    effectEnhancementRequest: true,
    emptyRoomRequest: false,
    forcePromptRegeneration: false,
    generationCount: 1,
    models: [{ label: "Seedream 5.0" }],
    refinedModelRequest: false,
    refinedPrompt: "",
    renderMode: "smart-default",
    styleReferenceCount: 0,
  }), /时段与天气规则/);
});

test("效果图美化六组合在后台任务中完整穿透，主图只共享一次", () => {
  const models = publicModelCatalog().slice(0, 2);
  const image = { dataUrl: "data:image/png;base64,AA==", name: "render.png", size: 1, type: "image/png" };
  for (const intensity of ["low", "high"]) {
    for (const tone of ["natural", "warm", "cool"]) {
      const baseInput = buildGenerationInput({
        effectBeautification: { intensity, tone },
        effectBeautificationPromptVersion: 1,
        effectTime: "night",
        effectWeather: "rainy",
        featureMode: "effectBeautification",
        model: models[0],
        prompt: { free: "其他功能的旧输入", refined: "精模要求" },
        ratio: "4:3",
        ratioMode: "auto",
        referenceImages: [image],
        renderMode: { mode: "smart-default" },
        resolution: "2K",
        styleReferenceImages: [image],
      });
      const request = buildGenerationJobRequest({
        baseInput,
        featureMode: "effectBeautification",
        models,
        sourceImage: { height: 900, width: 1200 },
      });
      assert.deepEqual(baseInput.effectBeautification, { intensity, tone });
      assert.equal(baseInput.effectBeautificationPromptVersion, 1);
      assert.equal(baseInput.prompt, "");
      assert.equal("effectTime" in baseInput, false);
      assert.equal("effectWeather" in baseInput, false);
      assert.equal("styleReferenceImages" in baseInput, false);
      assert.deepEqual(request.sharedInput.referenceImages, [image]);
      for (const item of request.items) {
        assert.deepEqual(item.input.effectBeautification, { intensity, tone });
        assert.equal(item.input.effectBeautificationPromptVersion, 1);
        assert.equal("referenceImages" in item.input, false);
      }
    }
  }
});

test("效果图美化旧客户端与失效选择回退低强度自然调，其他功能不携带选项", () => {
  const defaults = {
    model: publicModelCatalog()[0],
    prompt: { free: "自由提示词", refined: "" },
    referenceImages: [],
    renderMode: { mode: "smart-default" },
    styleReferenceImages: [],
  };
  for (const effectBeautification of [undefined, null, { intensity: "medium", tone: "pink" }]) {
    const input = buildGenerationInput({ ...defaults, effectBeautification, featureMode: "effectBeautification" });
    assert.deepEqual(input.effectBeautification, { intensity: "low", tone: "natural" });
  }
  const free = buildGenerationInput({ ...defaults, effectBeautification: { intensity: "high", tone: "cool" }, featureMode: "free" });
  assert.equal(free.prompt, "自由提示词");
  assert.equal("effectBeautification" in free, false);
  assert.match(generationLoadingCopy({ effectBeautificationRequest: true }), /所选强度与色调美化效果图/);
});

test("全景图美化显示连续性专用加载文案", () => {
  assert.match(generationLoadingCopy({
    designPromptRequest: false,
    effectEnhancementRequest: false,
    panoramaEnhancementRequest: true,
    emptyRoomRequest: false,
    forcePromptRegeneration: false,
    generationCount: 1,
    models: [{ label: "Seedream 5.0" }],
    refinedModelRequest: false,
    refinedPrompt: "",
    renderMode: "smart-default",
    styleReferenceCount: 0,
  }), /全景连续性规则/);
});
