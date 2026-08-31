/**
 * [INPUT]: 依赖 node:test/assert/fs、Flux 负向 Prompt 前端控制器/输入映射、模型请求构造器、ComfyUI 工作流工厂与结果摘要
 * [OUTPUT]: 对外提供默认负向不变、自定义整段覆盖、仅 Flux 显示/消费、长度边界、追溯元数据与结果标记回归保障
 * [POS]: test 的 Flux 负向 Prompt 端到端静态/纯函数合同测试，不提交真实生图任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { bindFluxNegativePrompt } from "../public/flux-negative-prompt.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { resultMetadata } from "../public/workbench-utils.js";
import {
  AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT,
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
