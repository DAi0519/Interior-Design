/**
 * [INPUT]: 依赖 node:test/assert/fs、Flux 负向 Prompt 前端控制器/输入映射、模型请求构造器、ComfyUI 工作流工厂与结果摘要
 * [OUTPUT]: 对外提供普通默认不变、旧房/全景空默认及内存草稿独立和场景准入、自定义整段覆盖、实际节点/归档一致、仅 Flux 显示/消费、长度边界、同图攸行超分与结果标记回归保障
 * [POS]: test 的 Flux 负向 Prompt 端到端静态/纯函数合同测试，不提交真实生图任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

import { bindFluxNegativePrompt } from "../public/flux-negative-prompt.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { resultMetadata } from "../public/workbench-utils.js";
import {
  AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT,
  AI_TEXTURE_ROOM_RENOVATION_NEGATIVE_PROMPT,
  createAiTextureWorkflow,
} from "../src/ai-texture-workflow.mjs";
import { createGenerationRequest } from "../src/model-config.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

function fluxInput(negativePrompt = "") {
  return {
    modelKey: "aiTextureEnhancement",
    negativePrompt,
    outputFormat: "png",
    prompt: "保持空间结构",
    ratio: "source",
    referenceImages: [{
      dataUrl: onePixelPng,
      name: "source.png",
      size: Buffer.from(onePixelPng.split(",")[1], "base64").length,
      type: "image/png",
    }],
    resolution: "1K",
  };
}

test("Flux 负向输入仅随 Flux 选中显示并明确覆盖状态", () => {
  const listeners = {};
  const root = {
    hidden: null,
    classList: { toggle(_name, value) { root.hidden = value; } },
  };
  const textarea = {
    value: "",
    addEventListener(name, listener) { listeners[name] = listener; },
  };
  const count = { textContent: "" };
  const note = { textContent: "" };
  const control = bindFluxNegativePrompt({ count, note, root, textarea });

  control.render(["seedream5"]);
  assert.equal(root.hidden, true);
  control.render(["seedream5", "aiTextureEnhancement"]);
  assert.equal(root.hidden, false);
  assert.match(note.textContent, /系统默认/);

  textarea.value = "  blur, artifacts  ";
  listeners.input();
  assert.equal(count.textContent, "19 / 8000");
  assert.equal(control.value(), "blur, artifacts");
  assert.match(note.textContent, /整段覆盖/);
});

test("旧房负向内存草稿与普通功能隔离，切换恢复内容/计数且普通说明原文不变", () => {
  const listeners = {};
  const root = { hidden: null, classList: { toggle(_name, value) { root.hidden = value; } } };
  const textarea = { value: "", addEventListener(name, listener) { listeners[name] = listener; } };
  const count = { textContent: "" }, note = { textContent: "" };
  const control = bindFluxNegativePrompt({ count, note, root, textarea });
  const ordinaryNote = "当前使用系统默认；填写后整段覆盖，仅影响 Flux2 Klein。";
  const renovationNote = "当前使用旧房专属默认；允许重设计材质、配色、家具和装饰，仅保留真实结构与原视角。";
  control.render(["aiTextureEnhancement"], "emptyRoom");
  assert.equal(note.textContent, ordinaryNote);
  textarea.value = "  preserve empty-room colors  ";
  listeners.input();
  const ordinaryDraft = textarea.value;
  const ordinaryCustomNote = note.textContent;

  control.render(["aiTextureEnhancement"], "roomRenovation");
  assert.equal(control.value(), "");
  assert.equal(count.textContent, "0 / 8000");
  assert.equal(note.textContent, renovationNote);
  textarea.value = "  remove visual artifacts  ";
  listeners.input();
  const renovationDraft = textarea.value;
  assert.match(note.textContent, /整段覆盖旧房专属默认/);
  control.render(["seedream5"], "roomRenovation");
  assert.equal(root.hidden, true);
  assert.equal(textarea.value, renovationDraft);

  for (const featureMode of ["emptyRoom", "whiteModel", "free"]) {
    control.render(["aiTextureEnhancement"], featureMode);
    assert.equal(root.hidden, false);
    assert.equal(textarea.value, ordinaryDraft);
    assert.equal(count.textContent, `${ordinaryDraft.length} / 8000`);
    assert.equal(note.textContent, ordinaryCustomNote);
  }
  control.render(["aiTextureEnhancement"], "panoramaEnhancement");
  assert.equal(root.hidden, true);
  assert.equal(textarea.value, "");
  assert.equal(count.textContent, "0 / 8000");
  assert.match(note.textContent, /默认不使用负向提示词/);
  textarea.value = "panorama-only negative"; listeners.input();
  control.render(["aiTextureEnhancement"], "free");
  assert.equal(textarea.value, ordinaryDraft);
  control.render(["aiTextureEnhancement"], "panoramaEnhancement");
  assert.equal(control.value(), "panorama-only negative");
  control.render(["aiTextureEnhancement"], "roomRenovation");
  assert.equal(textarea.value, renovationDraft);
  assert.equal(count.textContent, `${renovationDraft.length} / 8000`);
  assert.equal(control.value(), renovationDraft.trim());
  textarea.value = "";
  listeners.input();
  assert.equal(note.textContent, renovationNote);
  control.render([], "imageUpscale");
  assert.equal(textarea.value, ordinaryDraft);
  textarea.value = "";
  listeners.input();
  assert.equal(note.textContent, ordinaryNote);
  control.render(["aiTextureEnhancement"], "roomRenovation");
  assert.equal(textarea.value, "");
  assert.equal(note.textContent, renovationNote);
});

test("页面输入映射保留自定义负向词", () => {
  const input = buildGenerationInput({
    emptyRoomFields: {},
    featureMode: "free",
    model: { key: "aiTextureEnhancement", qualityOptions: [] },
    negativePrompt: "  blur, artifacts  ",
    prompt: { free: "现代客厅", refined: "" },
    referenceImages: [],
    renderMode: { mode: "smart-default" },
    styleReferenceImages: [],
  });

  assert.equal(input.negativePrompt, "blur, artifacts");
});

test("Flux 空输入继续使用原默认，自定义值整段覆盖并归档", () => {
  const defaults = createGenerationRequest(
    fluxInput(),
    { sourceDimensions: { height: 900, width: 1600 } },
  );
  assert.equal(defaults.request.negative_prompt, AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT);
  assert.equal(defaults.request.negative_prompt_mode, "default");
  assert.equal(defaults.workflowMetadata.negativePrompt, AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT);

  const custom = createGenerationRequest(
    fluxInput("  blur, artifacts  "),
    { sourceDimensions: { height: 900, width: 1600 } },
  );
  assert.equal(custom.request.negative_prompt, "blur, artifacts");
  assert.equal(custom.request.negative_prompt_mode, "custom");
  assert.deepEqual(custom.workflowMetadata, {
    negativePrompt: "blur, artifacts",
    negativePromptMode: "custom",
  });

  const workflow = createAiTextureWorkflow({
    artifactKey: "negative-prompt-test",
    imageBase64: "example-base64",
    negativePrompt: custom.request.negative_prompt,
    prompt: "保持空间结构",
    seed: 42,
  });
  assert.equal(
    workflow["CLIPTextEncode-a5eb6fed8b48761592bb34a3f51a1e24"].inputs.text,
    "blur, artifacts",
  );
  assert.throws(
    () => createGenerationRequest(
      fluxInput("x".repeat(8001)),
      { sourceDimensions: { height: 900, width: 1600 } },
    ),
    /不能超过 8000 字符/,
  );
});

test("旧房采用结构保护默认，全景独立空负向且不继承普通默认", async () => {
  const renovationInput = { ...fluxInput(), featureMode: "emptyRoom", designScenario: "room-renovation" };
  const renovation = createGenerationRequest(renovationInput);
  assert.equal(renovation.request.negative_prompt, AI_TEXTURE_ROOM_RENOVATION_NEGATIVE_PROMPT);
  assert.equal(renovation.request.negative_prompt_mode, "default");
  assert.equal(renovation.workflowMetadata.negativePrompt, renovation.request.negative_prompt);
  assert.equal(renovation.preview.negativePromptMode, "default");
  assert.doesNotMatch(renovation.request.negative_prompt,
    /alter material colors|change material types|matte materials converted|add non-existent objects and structures|color distortion|unwanted color shifts/);
  for (const boundary of ["room-enclosing walls or partitions", "real beams or columns", "floor-slab levels",
    "structural floor-to-ceiling height", "door and window openings", "camera position or perspective", "framing"]) {
    assert.ok(renovation.request.negative_prompt.includes(boundary));
  }
  const workflow = createAiTextureWorkflow({ artifactKey: "renovation-negative", imageBase64: "example-base64",
    negativePrompt: renovation.request.negative_prompt, prompt: "彻底改造", seed: 42 });
  assert.equal(workflow["CLIPTextEncode-a5eb6fed8b48761592bb34a3f51a1e24"].inputs.text,
    renovation.workflowMetadata.negativePrompt);
  for (const featureMode of ["emptyRoom", "whiteModel", "styleTransfer", "free"]) {
    const ordinary = createGenerationRequest({ ...fluxInput(), featureMode });
    assert.equal(ordinary.request.negative_prompt, AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT);
  }

  const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#888888" } }).png().toBuffer();
  const panoramaInput = { ...fluxInput(), featureMode: "panoramaEnhancement", referenceImages: [{
    dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "panorama.png", size: bytes.length, type: "image/png",
  }] };
  assert.equal(createGenerationRequest(panoramaInput).request.negative_prompt, "");
  assert.equal(createGenerationRequest({ ...panoramaInput, negativePrompt: "  panorama artifacts  " }).request.negative_prompt, "panorama artifacts");
  const custom = createGenerationRequest({ ...renovationInput, negativePrompt: "  blur, artifacts  " });
  assert.equal(custom.request.negative_prompt, "blur, artifacts");
  assert.equal(custom.request.negative_prompt_mode, "custom");
  assert.equal(custom.workflowMetadata.negativePrompt, "blur, artifacts");
  assert.throws(() => createGenerationRequest({ ...renovationInput, negativePrompt: "x".repeat(8001) }),
    error => error.statusCode === 400 && /不能超过 8000 字符/.test(error.message));
});

test("其他功能与未知场景不能冒用旧房默认负向", () => {
  for (const input of [
    { ...fluxInput(), designScenario: "room-renovation" },
    ...["free", "whiteModel", "styleTransfer", "refinedModel", "effectEnhancement", "effectBeautification",
      "panoramaEnhancement", "roomRenovation"].map(featureMode =>
      ({ ...fluxInput(), featureMode, designScenario: "room-renovation" })),
    { ...fluxInput(), featureMode: "emptyRoom", designScenario: "unsupported" },
  ]) {
    assert.throws(() => createGenerationRequest(input), error => error.statusCode === 400);
  }
});

test("OneAPI 不接收 Flux 负向字段，结果摘要标记生效模式", () => {
  const oneApi = createGenerationRequest({
    modelKey: "seedream5",
    negativePrompt: "blur",
    outputFormat: "png",
    prompt: "现代客厅",
    ratio: "4:3",
    resolution: "2K",
  });
  assert.equal("negative_prompt" in oneApi.request, false);

  const summary = resultMetadata({
    request: {
      outputFormat: "png",
      referenceImageCount: 1,
      size: "1360x768",
    },
    upstream: { metadata: { engine: "comfyui", negativePromptMode: "custom" } },
  }, { status: "pending" });
  assert.match(summary, /自定义负向/);

  const upscaleSummary = resultMetadata({
    request: { outputFormat: "png", referenceImageCount: 1, size: "4096x2304" },
    upstream: {
      metadata: {
        engine: "comfyui",
        negativePromptMode: "default",
        upscaleResolution: "4K",
      },
    },
  }, { status: "pending" });
  assert.match(upscaleSummary, /2K→攸行 4K/);
});

test("工作台与 ComfyUI 客户端完成负向字段接线", async () => {
  const [html, app, client] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/comfyui-client.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="negativePromptInput"[\s\S]*?maxlength="8000"/);
  assert.match(html, /留空使用系统默认/);
  assert.match(app, /negativePrompt:\s*fluxNegativePrompt\.value\(\)/);
  assert.match(client, /negativePrompt:\s*generationRequest\.negative_prompt/);
});
