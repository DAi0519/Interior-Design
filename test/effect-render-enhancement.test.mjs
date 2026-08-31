/**
 * [INPUT]: 依赖 node:test/assert、工作台静态入口与配置状态/生成输入映射器、效果图美化 Prompt 模块解析器与可注入的工作流边界
 * [OUTPUT]: 对外提供当前上架版本回显、天气/时段 UI、受控枚举及请求字段、基础→时段→天气正向 Prompt 顺序、单图、原图比例、脱敏响应与归档元数据回归保障
 * [POS]: test 的效果图美化专项测试，所有外部 API 与飞书同步均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { effectEnhancementPromptStatus } from "../public/config-refresh.js";
import { buildGenerationInput } from "../public/generation-input.js";
import {
  composeEffectEnhancementPrompt,
  publicEffectEnhancementPromptConfig,
  splitEffectEnhancementPrompt,
} from "../src/effect-render-enhancement-prompt.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

const sourcePrompt = [
  "[Main Objective]\nBASE BODY",
  "TIME MODULE — DAYTIME.\nDAY BODY",
  "TIME MODULE — DUSK.\nDUSK BODY",
  "TIME MODULE — NIGHT.\nNIGHT BODY",
  "WEATHER MODULE — CLEAR SUNNY WEATHER.\nCLEAR BODY",
  "WEATHER MODULE — OVERCAST WEATHER.\nOVERCAST BODY",
  "WEATHER MODULE — EXTERIOR-ONLY RAINY WEATHER.\nRAIN BODY",
  "WEATHER MODULE — EXTERIOR-ONLY LIGHT-TO-MODERATE FOG.\nFOG BODY",
].join("\n");

const compactSourcePrompt = sourcePrompt.replace("[Main Objective]", "[BASE]");
const legacySourcePrompt = sourcePrompt.replace(
  "[Main Objective]",
  "HIGHEST PRIORITY — SOURCE-LOCKED, WEATHER-SAFE INTERIOR FURNITURE PRESENTATION.",
);

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

test("正向 Prompt 只拼基础与所选模块，时段始终在天气之前", () => {
  const modules = splitEffectEnhancementPrompt(sourcePrompt);
  assert.equal(Object.keys(modules).length, 8);

  const baseOnly = composeEffectEnhancementPrompt(sourcePrompt);
  assert.match(baseOnly, /BASE BODY$/);
  assert.doesNotMatch(baseOnly, /TIME MODULE|WEATHER MODULE|indoor rain/);

  const weatherOnly = composeEffectEnhancementPrompt(sourcePrompt, {
    weather: "rainy",
  });
  assert.ok(weatherOnly.indexOf("BASE BODY") < weatherOnly.indexOf("RAIN BODY"));
  assert.doesNotMatch(weatherOnly, /TIME MODULE/);

  const combined = composeEffectEnhancementPrompt(sourcePrompt, {
    time: "night",
    weather: "foggy",
  });
  assert.ok(combined.indexOf("BASE BODY") < combined.indexOf("NIGHT BODY"));
  assert.ok(combined.indexOf("NIGHT BODY") < combined.indexOf("FOG BODY"));
  assert.doesNotMatch(combined, /DAY BODY|DUSK BODY|RAIN BODY|indoor rain/);
  assert.throws(
    () => composeEffectEnhancementPrompt(sourcePrompt, { weather: "storm" }),
    /天气选项不合法/,
  );
});

test("基础模块使用 [Main Objective] 并兼容 [BASE] 与历史首句", () => {
  assert.match(composeEffectEnhancementPrompt(sourcePrompt), /^\[Main Objective\]/);
  assert.match(composeEffectEnhancementPrompt(compactSourcePrompt), /^\[BASE\]/);
  assert.match(
    composeEffectEnhancementPrompt(legacySourcePrompt),
    /^HIGHEST PRIORITY — SOURCE-LOCKED/,
  );
  assert.throws(
    () => splitEffectEnhancementPrompt(`${sourcePrompt}\n[BASE]`),
    /模块缺失、重复或顺序错误/,
  );
});

test("模块源文缺失、重复或乱序时拒绝生成", () => {
  assert.throws(
    () => splitEffectEnhancementPrompt(sourcePrompt.replace("TIME MODULE — DUSK.", "")),
    /模块缺失、重复或顺序错误/,
  );
  assert.throws(
    () => splitEffectEnhancementPrompt(`${sourcePrompt}\nTIME MODULE — DAYTIME.`),
    /模块缺失、重复或顺序错误/,
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
