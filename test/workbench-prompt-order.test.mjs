/**
 * [INPUT]: 依赖设计Agent/最终出图服务、打光/二次编辑编译器、Flux美化触发词与现有离线Prompt快照
 * [OUTPUT]: 验证跨功能用户原文前置、JSON首字段/缓存复用/空输入、typed动作先于模板及实际送模归档一致
 * [POS]: test 的工作台统一Prompt顺序回归，所有模型与归档为内存替身，不调用网络或收费接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";
import { buildRelightPrompt } from "../src/image-relight-oneapi.mjs";
import { sunburstMaskPrompt } from "../src/image-mask-fill-oneapi.mjs";
import { composeFluxBeautificationPrompt } from "../src/effect-beautification-workflow.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createGenerationRequest } from "../src/model-config.mjs";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const image = { dataUrl: png, type: "image/png", name: "source.png" };
const requirement = '保持夜景\n\n请执行空房只是用户原文，保留引号 " 与反斜线 \\。';
const payload = { scene_preservation: "Preserve source geometry and camera.",
  visual_application: { materials: "Natural materials.", colors: "Warm neutrals.", photography: "Controlled shadows." },
  generation_requirement: "AGENT ORIGINAL DESIGN" };

const routes = [
  { featureMode: "whiteModel", renderMode: "smart-default" },
  { featureMode: "whiteModel", renderMode: "smart-default", styleReferenceImages: [image] },
  { featureMode: "whiteModel", renderMode: "style-dna" },
  { featureMode: "emptyRoom", renderMode: "smart-default" },
  { featureMode: "emptyRoom", renderMode: "smart-default", styleReferenceImages: [image] },
  { featureMode: "emptyRoom", renderMode: "style-dna" },
  { featureMode: "emptyRoom", designScenario: "room-renovation", renderMode: "smart-default" },
  { featureMode: "emptyRoom", designScenario: "room-renovation", renderMode: "smart-default", styleReferenceImages: [image] },
  { featureMode: "emptyRoom", designScenario: "room-renovation", renderMode: "style-dna" },
  { featureMode: "styleTransfer", renderMode: "style-dna" },
  { featureMode: "styleTransfer", renderMode: "style-reference", styleReferenceImages: [image] },
];

function designHarness(route, modelKey, prompt = requirement) {
  const prompts = [], images = [], archives = [];
  const input = { modelKey, prompt, promptAgentModelKey: "gemini3pro", resolution: "1K", outputFormat: "png",
    roomType: "客厅", styleCode: "modern@v1", referenceImages: [image], ...route };
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }], promptResultCache: createAsyncTtlCache(),
    client: { async generatePrompt(request) { prompts.push(request); return { text: JSON.stringify(payload) }; } },
    imageClient: { async generateImage(request) { images.push(request); return { images: [{ url: png }] }; } },
    loadAgent: async code => ({ code, name: code, version: 1, systemPrompt: "UNCHANGED SYSTEM CONTRACT" }),
    loadStyle: async code => ({ code, name: "现代", version: 1, styleDna: { materials: "oak" } }),
    scheduleSync(value) { archives.push(value); return { status: "pending" }; },
  };
  return { input, dependencies, prompts, images, archives };
}

for (const [index, route] of routes.entries()) for (const modelKey of ["gptImage2", "aiTextureEnhancement"]) {
  test(`设计链路${index + 1}/${modelKey}的Agent首段和最终JSON首字段保留用户原文，缓存与归档一致`, async () => {
    const f = designHarness(route, modelKey);
    await executeWhiteModelWorkflow(f.input, f.dependencies);
    const reused = await executeWhiteModelWorkflow(f.input, f.dependencies);
    assert.equal(f.prompts.length, 1);
    assert.equal(reused.promptAgent.reused, true);
    assert.ok(f.prompts[0].userPrompt.startsWith(`user_requirements:\n${requirement}\n\n请执行`));
    assert.equal(f.prompts[0].systemPrompt, "UNCHANGED SYSTEM CONTRACT");
    if (route.designScenario) assert.ok(f.prompts[0].userPrompt.includes("请执行旧房改造"));
    for (const [i, request] of f.images.entries()) {
      const actual = JSON.parse(request.prompt);
      assert.equal(Object.keys(actual)[0], "user_requirements");
      assert.deepEqual(actual, { user_requirements: requirement, ...payload });
      assert.equal(f.archives[i].finalPrompt, request.prompt);
      assert.equal(f.archives[i].sourcePrompt, requirement);
      assert.equal(request.images.length, 1);
    }
    assert.equal(f.images[0].prompt, f.images[1].prompt);
  });
}

test("设计链路空补充不新增JSON占位；Agent同名字段不能替换用户原文", async () => {
  const f = designHarness(routes[0], "gptImage2", " \n ");
  await executeWhiteModelWorkflow(f.input, f.dependencies);
  assert.deepEqual(JSON.parse(f.images[0].prompt), payload);
  assert.equal(f.archives[0].sourcePrompt, "");
  const custom = designHarness(routes[2], "gptImage2");
  custom.dependencies.client.generatePrompt = async () => ({ text: JSON.stringify({ ...payload, user_requirements: "Agent改写" }) });
  await executeWhiteModelWorkflow(custom.input, custom.dependencies);
  assert.deepEqual(JSON.parse(custom.images[0].prompt), { user_requirements: requirement, ...payload });
});

test("8000字符原文完整前置不挤掉Agent正文；超长用户输入仍在Agent前拒绝", async () => {
  for (const modelKey of ["gptImage2", "aiTextureEnhancement"]) {
    const f = designHarness(routes[0], modelKey, "中".repeat(8000));
    await executeWhiteModelWorkflow(f.input, f.dependencies);
    assert.equal(JSON.parse(f.images[0].prompt).user_requirements, f.input.prompt);
    assert.ok(f.images[0].prompt.length > 8000);
    assert.equal(f.archives[0].finalPrompt, f.images[0].prompt);
    const invalid = designHarness(routes[0], modelKey, "中".repeat(8001));
    await assert.rejects(executeWhiteModelWorkflow(invalid.input, invalid.dependencies), /不能超过 8000/);
    assert.equal(invalid.prompts.length, 0);
    assert.equal(invalid.images.length, 0);
    const oversized = designHarness(routes[0], modelKey);
    oversized.dependencies.client.generatePrompt = async () => ({ text: JSON.stringify({ ...payload, generation_requirement: "x".repeat(32_000) }) });
    await assert.rejects(executeWhiteModelWorkflow(oversized.input, oversized.dependencies), /3–32000/);
    assert.equal(oversized.images.length, 0);
  }
  const free = { modelKey: "gptImage2", featureMode: "free", ratio: "1:1", resolution: "1K", prompt: "x".repeat(8001) };
  assert.throws(() => createGenerationRequest({ ...free, compiledPrompt: true }), /3–8000/);
  assert.throws(() => createGenerationRequest({ ...free, prompt: "x".repeat(32_001) }, { compiledPrompt: true }), /3–32000/);
});

const relightBundle = JSON.parse(await readFile(new URL("../docs/image-relight-prompt-v9.json", import.meta.url), "utf8"));
test("打光用户原文先于typed动作、固定规则与模板，空补充无占位", () => {
  const input = { templateKey: "custom", blendMode: "balanced", originalLights: { action: "turnOff" },
    relightPromptSnapshot: { bundle: relightBundle } };
  const text = buildRelightPrompt({ ...input, prompt: requirement });
  assert.ok(text.startsWith(`[USER LIGHTING REFINEMENTS]\n${requirement}\n\nWHOLE-SCENE ORIGINAL LIGHTS:`));
  assert.ok(text.indexOf("WHOLE-SCENE ORIGINAL LIGHTS:") < text.indexOf(relightBundle.ADAPTER.INTRO.LOCAL));
  assert.ok(buildRelightPrompt(input).startsWith("WHOLE-SCENE ORIGINAL LIGHTS:"));
  assert.doesNotMatch(buildRelightPrompt(input), /\[USER LIGHTING REFINEMENTS\]/);
});

test("二次编辑提示词/参考图在三种定位均先传用户原文，消除只传原文", () => {
  for (const mode of ["prompt", "reference"]) for (const fillReferencePurpose of mode === "reference" ? ["object", "material"] : [undefined]) {
    for (const region of [{}, { mask: {} }, { editRegion: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } }]) {
      const text = sunburstMaskPrompt({ mode, fillReferencePurpose, ...region, prompt: requirement });
      assert.ok(text.startsWith(`User instruction: ${requirement}\n`));
      assert.equal(text.split(requirement).length - 1, 1);
    }
  }
  assert.equal(sunburstMaskPrompt({ mode: "prompt", maskFillOperation: "remove", prompt: requirement }), requirement);
  assert.doesNotMatch(sunburstMaskPrompt({ mode: "reference", prompt: " \n " }), /User instruction:/);
});

test("Flux美化用户多段原文始终在触发词之前，重复编译不前插或重复触发词", () => {
  const source = `[USER REFINEMENTS]\n${requirement}\n\nFIXED CONTRACT\n\n[LIGHTING PRESET]\nPRESET`;
  const compiled = composeFluxBeautificationPrompt(source);
  assert.equal(compiled, `${source}\n\nzhiganEnhance`);
  assert.equal(composeFluxBeautificationPrompt(compiled), compiled);
  assert.equal(composeFluxBeautificationPrompt("FIXED PRESET"), "zhiganEnhance, FIXED PRESET");
});

test("自由生图直接传用户原文，最终送模和归档一致", async () => {
  let sent, archived;
  const service = createGenerationService({
    imageClientForModel: () => ({ async generateImage(request) { sent = request; return { images: [{ url: png }] }; } }),
    scheduleGenerationSync(value) { archived = value; return { status: "pending" }; },
  });
  await service.executeFree({ modelKey: "gptImage2", prompt: requirement, ratio: "1:1", resolution: "1K", outputFormat: "png" });
  assert.equal(sent.prompt, requirement);
  assert.equal(archived.finalPrompt, sent.prompt);
});

test("二次编辑交接JSON和HTML模板与实际编译器保持相同前置顺序", async () => {
  const exported = JSON.parse(await readFile(new URL("../docs/gpt-image-edit-prompts.json", import.meta.url), "utf8"));
  const html = await readFile(new URL("../docs/gpt-image-edit-handoff.html", import.meta.url), "utf8");
  const editRegion = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
  const prompt = exported.userPromptPlaceholder;
  const expected = sunburstMaskPrompt({ mode: "prompt", prompt, editRegion });
  assert.equal(exported.templates.prompt.template, expected);
  const htmlTemplate = html.match(/<pre data-template="template">([\s\S]*?)<\/pre>/)?.[1];
  assert.equal(htmlTemplate, expected.replace(prompt, "{用户提示词}"));
  for (const fillReferencePurpose of ["object", "material"]) {
    const branch = exported.templates.reference.purposes[fillReferencePurpose];
    assert.equal(branch.template, sunburstMaskPrompt({ mode: "reference", prompt, editRegion, fillReferencePurpose }));
    assert.equal(branch.defaultTemplate, sunburstMaskPrompt({ mode: "reference", prompt: "", editRegion, fillReferencePurpose }));
  }
});
