/**
 * [INPUT]: 依赖 node:test/assert、工作台静态入口与配置状态/生成输入映射器、效果图美化 Prompt 模块解析器与可注入的工作流边界
 * [OUTPUT]: 对外提供当前上架版本回显、效果图天气/时段 UI、全景图入口及默认 Prompt 后置连续性约束、受控请求字段、单图、原图比例、脱敏响应与归档元数据回归保障
 * [POS]: test 的效果图/全景图美化专项测试，所有外部 API 与飞书同步均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { effectEnhancementPromptStatus } from "../public/config-refresh.js";
import { buildGenerationInput } from "../public/generation-input.js";
import {
  composeEffectEnhancementPrompt,
  composePanoramaEnhancementPrompt,
  PANORAMA_CONTINUITY_PROMPT,
  parseEffectEnhancementPrompt,
  publicEffectEnhancementPromptConfig,
} from "../src/effect-render-enhancement-prompt.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

const sourcePromptObject = {
  BASE: {
    "Main Objective": "BASE INTRO",
    "Source Lock": "SOURCE LOCK BODY",
    "Global Lighting Optimization": "BASE BODY",
  },
  DEFAULT: [
    "This is same-condition restoration, never relighting or time conversion.",
    "Night stays night, dusk stays dusk, day stays day.",
    "For night sources, keep the sky and exterior deep dark to near-black at the source luminance; never reinterpret them as daylight, overcast gray, or dusk. Preserve lamp dominance and recover detail only locally, never by brightening the sky, exterior, windows, or whole frame.",
    "Match source sky and exterior luminance, global exposure and black level, indoor–outdoor brightness ratio, lamp dominance, and shadow structure.",
  ].join("\n"),
  CONTRACT: "CONTRACT BODY",
  TIME: {
    DAYTIME: "DAY BODY",
    DUSK: "DUSK BODY",
    NIGHT: "NIGHT BODY",
  },
  WEATHER: {
    CLEAR: "CLEAR BODY",
    OVERCAST: "OVERCAST BODY",
    RAINY: "RAIN BODY",
    FOGGY: "FOG BODY",
  },
};
const sourcePrompt = JSON.stringify(sourcePromptObject, null, 2);

test("工作台提供效果图美化与完整天气时段选项", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-feature-mode="effectEnhancement"[^>]*>[\s\S]*?效果图美化/);
  assert.match(html, /id="effectPromptAvailability"[^>]*>读取中/);
  assert.match(html, /id="refreshEffectPromptButton"[\s\S]*?刷新效果图美化 Prompt 版本/);
  assert.match(html, /id="effectPromptNote"/);
  assert.match(html, /id="effectTimeSelect"[\s\S]*?value="preserve"[\s\S]*?value="daytime"[\s\S]*?value="dusk"[\s\S]*?value="night"/);
  assert.match(html, /id="effectWeatherSelect"[\s\S]*?value="preserve"[\s\S]*?value="clear"[\s\S]*?value="overcast"[\s\S]*?value="rainy"[\s\S]*?value="foggy"/);
  assert.match(app, /effectTime:\s*elements\.effectTimeSelect\.value/);
  assert.match(app, /effectWeather:\s*elements\.effectWeatherSelect\.value/);
});

test("工作台提供独立全景图美化入口且不暴露环境覆盖控件", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-feature-mode="panoramaEnhancement"[^>]*>[\s\S]*?全景图美化/);
  assert.match(app, /isPanoramaEnhancement = featureMode === "panoramaEnhancement"/);
  assert.match(app, /effectEnhancementSection\.classList\.toggle\("hidden", !isEffectEnhancement\)/);
});

test("效果图美化只回显实际生效的最高已上架版本且不泄露正文", async () => {
  const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
  const config = await publicEffectEnhancementPromptConfig({
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run: async () => ({
      data: {
        data: [
          ["效果图美化完整模块 Prompt", "effect-render-enhancement", 2, ["下架"], sourcePrompt, "测试中"],
          ["效果图美化完整模块 Prompt", "effect-render-enhancement", 1, ["上架"], sourcePrompt, "当前发布"],
        ],
        fields,
        has_more: false,
      },
      ok: true,
    }),
  });
  assert.deepEqual(config, {
    available: true,
    code: "effect-render-enhancement",
    name: "效果图美化完整模块 Prompt",
    published: true,
    version: 1,
  });
  assert.equal(JSON.stringify(config).includes("BASE BODY"), false);
  assert.deepEqual(effectEnhancementPromptStatus(config), {
    availability: "Prompt v1 · 已上架",
    note: "当前使用「效果图美化完整模块 Prompt」v1（已上架）；环境效果可单选或组合，组合时时段优先。",
    ready: true,
  });
});

test("效果图美化 Prompt 不可用时给出明确恢复信息", async () => {
  const config = await publicEffectEnhancementPromptConfig({
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run: async () => ({ data: { data: [], fields: [], has_more: false }, ok: true }),
  });
  const status = effectEnhancementPromptStatus(config);
  assert.equal(config.available, false);
  assert.equal(status.availability, "Prompt 未配置");
  assert.match(status.note, /未读取到可用的上架 Prompt/);
  assert.equal(status.ready, false);
});

test("效果图美化输入只提交受控选项与单图，不提交页面 Prompt", () => {
  const image = { dataUrl: onePixelPng, name: "render.png", size: 68, type: "image/png" };
  const input = buildGenerationInput({
    effectTime: "night",
    effectWeather: "rainy",
    emptyRoomFields: {},
    featureMode: "effectEnhancement",
    model: { key: "gptImage2", qualityOptions: [] },
    prompt: { free: "页面自由 Prompt", refined: "精模要求" },
    promptAgentModelKey: "gemini3pro",
    promptAgentVersion: 2,
    promptVersion: 3,
    quality: "",
    ratio: "4:3",
    ratioMode: "auto",
    referenceImages: [image],
    renderMode: { mode: "smart-default" },
    resolution: "1K",
    styleReferenceImages: [],
  });

  assert.equal(input.prompt, "");
  assert.equal(input.effectTime, "night");
  assert.equal(input.effectWeather, "rainy");
  assert.deepEqual(input.referenceImages, [image]);
  assert.equal("styleReferenceImages" in input, false);
});

test("全景图美化只提交单图与固定功能模式，不提交页面或环境 Prompt", () => {
  const image = { dataUrl: onePixelPng, name: "panorama.png", size: 68, type: "image/png" };
  const input = buildGenerationInput({
    effectTime: "night",
    effectWeather: "rainy",
    emptyRoomFields: {},
    featureMode: "panoramaEnhancement",
    model: { key: "gptImage2", qualityOptions: [] },
    prompt: { free: "页面自由 Prompt", refined: "精模要求" },
    promptAgentModelKey: "gemini3pro",
    promptAgentVersion: 2,
    promptVersion: 3,
    quality: "",
    ratio: "2:1",
    ratioMode: "auto",
    referenceImages: [image],
    renderMode: { mode: "smart-default" },
    resolution: "2K",
    styleReferenceImages: [],
  });

  assert.equal(input.featureMode, "panoramaEnhancement");
  assert.equal(input.prompt, "");
  assert.equal("effectTime" in input, false);
  assert.equal("effectWeather" in input, false);
  assert.deepEqual(input.referenceImages, [image]);
});

test("JSON 模块中默认光照与环境契约互斥，时段始终在天气之前", () => {
  const modules = parseEffectEnhancementPrompt(sourcePrompt);
  assert.equal(Object.keys(modules).length, 10);

  const baseOnly = composeEffectEnhancementPrompt(sourcePrompt);
  assert.match(baseOnly, /BASE BODY[\s\S]*same-condition restoration/);
  assert.match(baseOnly, /Night stays night, dusk stays dusk, day stays day/);
  assert.match(baseOnly, /deep dark to near-black at the source luminance/);
  assert.match(baseOnly, /global exposure and black level/);
  assert.doesNotMatch(baseOnly, /\[CONTRACT\]|CONTRACT BODY|\[TIME:|\[WEATHER:|indoor rain/);

  const weatherOnly = composeEffectEnhancementPrompt(sourcePrompt, {
    weather: "rainy",
  });
  assert.ok(weatherOnly.indexOf("BASE BODY") < weatherOnly.indexOf("CONTRACT BODY"));
  assert.ok(weatherOnly.indexOf("CONTRACT BODY") < weatherOnly.indexOf("RAIN BODY"));
  assert.doesNotMatch(weatherOnly, /same-condition restoration|Night stays night|deep dark to near-black|\[TIME:/);

  const timeOnly = composeEffectEnhancementPrompt(sourcePrompt, {
    time: "night",
  });
  assert.match(timeOnly, /CONTRACT BODY[\s\S]*NIGHT BODY$/);
  assert.doesNotMatch(timeOnly, /same-condition restoration|Night stays night|deep dark to near-black|\[WEATHER:/);

  const combined = composeEffectEnhancementPrompt(sourcePrompt, {
    time: "night",
    weather: "foggy",
  });
  assert.ok(combined.indexOf("BASE BODY") < combined.indexOf("NIGHT BODY"));
  assert.ok(combined.indexOf("CONTRACT BODY") < combined.indexOf("NIGHT BODY"));
  assert.ok(combined.indexOf("NIGHT BODY") < combined.indexOf("FOG BODY"));
  assert.doesNotMatch(combined, /same-condition restoration|Night stays night|deep dark to near-black|DAY BODY|DUSK BODY|RAIN BODY|indoor rain/);
  assert.throws(
    () => composeEffectEnhancementPrompt(sourcePrompt, { weather: "storm" }),
    /天气选项不合法/,
  );
});

test("Prompt 只接受固定 JSON Schema 并保留基础模块旧标题", () => {
  assert.match(composeEffectEnhancementPrompt(sourcePrompt), /^\[BASE\]/);
  assert.match(
    composeEffectEnhancementPrompt(sourcePrompt),
    /\[Main Objective\][\s\S]*\[Source Lock\][\s\S]*\[Global Lighting Optimization\]/,
  );
  assert.throws(
    () => parseEffectEnhancementPrompt("[BASE]\nnot json"),
    /JSON 结构错误/,
  );
  assert.throws(
    () => parseEffectEnhancementPrompt(JSON.stringify({
      ...sourcePromptObject,
      EXTRA: "unexpected",
    })),
    /JSON 结构错误/,
  );
});

test("全景图美化严格复用效果图默认 Prompt 并在末尾追加连续性约束", () => {
  const defaultPrompt = composeEffectEnhancementPrompt(sourcePrompt);
  const panoramaPrompt = composePanoramaEnhancementPrompt(sourcePrompt);
  assert.equal(
    panoramaPrompt,
    `${defaultPrompt}\n\n${PANORAMA_CONTINUITY_PROMPT}`,
  );
  assert.match(panoramaPrompt, /same-condition restoration/);
  assert.match(panoramaPrompt, /left and right edges as physically adjacent/);
  assert.match(panoramaPrompt, /seamless horizontal wrap-around/);
  assert.doesNotMatch(panoramaPrompt, /\[CONTRACT\]|\[TIME:|\[WEATHER:/);
});

test("JSON 模块缺失、错型或乱序时拒绝生成", () => {
  assert.throws(
    () => parseEffectEnhancementPrompt(JSON.stringify({
      ...sourcePromptObject,
      TIME: { DAYTIME: "DAY BODY", NIGHT: "NIGHT BODY" },
    })),
    /JSON 结构错误/,
  );
  assert.throws(
    () => parseEffectEnhancementPrompt(JSON.stringify({
      ...sourcePromptObject,
      WEATHER: { ...sourcePromptObject.WEATHER, RAINY: [] },
    })),
    /JSON 结构错误/,
  );
  assert.throws(
    () => parseEffectEnhancementPrompt(JSON.stringify({
      DEFAULT: sourcePromptObject.DEFAULT,
      BASE: sourcePromptObject.BASE,
      CONTRACT: sourcePromptObject.CONTRACT,
      TIME: sourcePromptObject.TIME,
      WEATHER: sourcePromptObject.WEATHER,
    })),
    /JSON 结构错误/,
  );
});

test("美化工作流使用单图、最新上架 Prompt 与天气时段元数据", async () => {
  let generatedRequest;
  let syncedInput;
  const result = await executeEffectRenderEnhancementWorkflow({
    batchCount: 2,
    batchId: "batch_effect_1",
    batchIndex: 1,
    effectTime: "dusk",
    effectWeather: "overcast",
    modelKey: "gptImage2",
    outputFormat: "png",
    ratio: "4:3",
    ratioMode: "auto",
    referenceImages: [{
      dataUrl: onePixelPng,
      name: "render.png",
      size: Buffer.from(onePixelPng.split(",")[1], "base64").length,
      type: "image/png",
    }],
    resolution: "1K",
  }, {
    imageClient: {
      async generateImage(request) {
        generatedRequest = request;
        return {
          created: 1,
          images: [{ url: "data:image/png;base64,aQ==" }],
          outputFormat: "png",
          transport: "responses",
        };
      },
    },
    loadPrompt: async () => ({
      code: "effect-render-enhancement",
      name: "效果图美化完整模块 Prompt",
      prompt: sourcePrompt,
      published: true,
      version: 1,
    }),
    scheduleSync(value) {
      syncedInput = value;
      return { generationId: "generation-effect-1", status: "pending" };
    },
  });

  assert.match(generatedRequest.prompt, /BASE BODY[\s\S]*DUSK BODY[\s\S]*OVERCAST BODY$/);
  assert.doesNotMatch(generatedRequest.prompt, /DAY BODY|NIGHT BODY|RAIN BODY|indoor rain/);
  assert.equal(generatedRequest.images.length, 1);
  assert.equal(syncedInput.sourcePrompt, "");
  assert.equal(syncedInput.workflow.effectTime, "dusk");
  assert.equal(syncedInput.workflow.effectWeather, "overcast");
  assert.equal(syncedInput.workflow.feature, "effect-render-enhancement");
  assert.equal(syncedInput.workflow.promptVersion, 1);
  assert.deepEqual(result.prompt, {
    code: "effect-render-enhancement",
    name: "效果图美化完整模块 Prompt",
    published: true,
    version: 1,
  });
  assert.equal(JSON.stringify(result).includes("BASE BODY"), false);
});

test("美化工作流拒绝缺图和多图", async () => {
  const dependencies = { imageClient: { generateImage() {} } };
  await assert.rejects(
    executeEffectRenderEnhancementWorkflow({ referenceImages: [] }, dependencies),
    /需要且只允许 1 张/,
  );
  const image = { dataUrl: onePixelPng, name: "a.png", size: 68, type: "image/png" };
  await assert.rejects(
    executeEffectRenderEnhancementWorkflow(
      { referenceImages: [image, image] },
      dependencies,
    ),
    /需要且只允许 1 张/,
  );
});

test("全景图美化工作流追加连续性 Prompt 并独立归档功能", async () => {
  let generatedRequest;
  let syncedInput;
  await executeEffectRenderEnhancementWorkflow({
    featureMode: "panoramaEnhancement",
    modelKey: "gptImage2",
    outputFormat: "png",
    ratio: "2:1",
    ratioMode: "auto",
    referenceImages: [{
      dataUrl: onePixelPng,
      name: "panorama.png",
      size: Buffer.from(onePixelPng.split(",")[1], "base64").length,
      type: "image/png",
    }],
    resolution: "2K",
  }, {
    imageClient: {
      async generateImage(request) {
        generatedRequest = request;
        return {
          created: 1,
          images: [{ url: "data:image/png;base64,aQ==" }],
          outputFormat: "png",
          transport: "responses",
        };
      },
    },
    loadPrompt: async () => ({
      code: "effect-render-enhancement",
      name: "效果图美化完整模块 Prompt",
      prompt: sourcePrompt,
      published: true,
      version: 1,
    }),
    scheduleSync(value) {
      syncedInput = value;
      return { generationId: "generation-panorama-1", status: "pending" };
    },
  });

  assert.match(generatedRequest.prompt, /same-condition restoration/);
  assert.match(generatedRequest.prompt, /seamless horizontal wrap-around/);
  assert.equal(syncedInput.workflow.effectTime, "preserve");
  assert.equal(syncedInput.workflow.effectWeather, "preserve");
  assert.equal(syncedInput.workflow.feature, "panorama-render-enhancement");
});
