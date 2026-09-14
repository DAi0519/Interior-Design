/**
 * [INPUT]: 依赖 node:test/assert、node:fs、工作台入口/状态编排器/连接中心飞书同步合同状态/生成输入映射器、模型目录与 generation-task-request.js 的加载文案/批任务请求组装
 * [OUTPUT]: 对外提供需归档生图的前台飞书同步合同阻断及图片超分豁免、空白默认正向提示词、Flux2 Klein 默认选择、固定 PNG 且无格式选择 UI、单模型 1–4 张展开、含全景图美化的分功能加载文案与批任务只传一份图片载荷的回归保障
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

test("前台需归档生图只在飞书实时 Schema 就绪后提交，图片超分除外", async () => {
  const [app, connectionCenter] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/connection-center.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /larkReady:\s*false/);
  assert.match(app, /if \(!state\.larkReady && !imageUpscaleRequest\)[\s\S]*飞书同步合同未通过，已阻止生成/);
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

test("多模型后台任务只在共享输入传递一份图片", () => {
  const models = publicModelCatalog().slice(0, 2);
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
  assert.equal(request.items.length, 2);
  assert.equal("referenceImages" in request.items[0].input, false);
  assert.equal("referenceImages" in request.items[1].input, false);
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

test("效果图美化显示天气时段专用加载文案", () => {
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
