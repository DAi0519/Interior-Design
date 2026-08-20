/**
 * [INPUT]: 依赖 node:test/assert、模型目录与 generation-task-request.js 的加载文案/批任务请求组装
 * [OUTPUT]: 对外提供分功能加载文案与多模型任务只传一份图片载荷的回归保障
 * [POS]: test 的生成任务请求测试，不发送真实生图请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGenerationJobRequest,
  generationLoadingCopy,
} from "../public/generation-task-request.js";
import { publicModelCatalog } from "../src/model-config.mjs";

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
