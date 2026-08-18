/**
 * [INPUT]: 依赖 node:test/assert 与精模渲染可注入工作流边界
 * [OUTPUT]: 对外提供用户要求前置、预设 Prompt 后置、单张精模、原图比例、批次元数据、脱敏响应和同步调度回归保障
 * [POS]: test 的精模渲染工作流集成测试，所有外部 API 与飞书同步均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  composeRefinedModelPrompt,
  executeRefinedModelWorkflow,
} from "../src/refined-model-workflow.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

test("精模工作流将用户要求放在飞书预设 Prompt 前并独立归档", async () => {
  let generatedRequest;
  let syncedInput;
  const result = await executeRefinedModelWorkflow({
    batchCount: 4,
    batchId: "batch_refined_1",
    batchIndex: 2,
    modelKey: "gptImage2",
    outputFormat: "png",
    prompt: "增加一盏暖光落地灯",
    promptVersion: 1,
    ratio: "4:3",
    ratioMode: "auto",
    referenceImages: [{
      dataUrl: onePixelPng,
      name: "textured.png",
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
    loadPrompt: async (code, options) => ({
      code,
      name: "精模忠实渲染",
      prompt: "server fixed prompt",
      published: false,
      version: options.version,
    }),
    scheduleSync(value) {
      syncedInput = value;
      return { generationId: "generation-2", status: "pending" };
    },
  });

  assert.equal(
    generatedRequest.prompt,
    "增加一盏暖光落地灯\n\nserver fixed prompt",
  );
  assert.equal(generatedRequest.images.length, 1);
  assert.equal(syncedInput.sourcePrompt, "增加一盏暖光落地灯");
  assert.equal(syncedInput.finalPrompt, generatedRequest.prompt);
  assert.equal(syncedInput.workflow.batchCount, 4);
  assert.equal(syncedInput.workflow.batchIndex, 2);
  assert.equal(syncedInput.workflow.promptPublished, false);
  assert.equal(syncedInput.workflow.customPromptUsed, true);
  assert.deepEqual(result.prompt, {
    code: "refined-model-render",
    name: "精模忠实渲染",
    published: false,
    version: 1,
  });
  assert.equal(JSON.stringify(result).includes("server fixed prompt"), false);
  assert.equal(JSON.stringify(result).includes("增加一盏暖光落地灯"), false);
});

test("精模工作流没有用户要求时保持原预设 Prompt", () => {
  assert.equal(composeRefinedModelPrompt("  server fixed prompt  ", "  "), "server fixed prompt");
  assert.throws(
    () => composeRefinedModelPrompt("preset", "a".repeat(8001)),
    /不能超过 8000 个字符/,
  );
});

test("精模工作流拒绝缺图和多图", async () => {
  const dependencies = { imageClient: { generateImage() {} } };
  await assert.rejects(executeRefinedModelWorkflow({ referenceImages: [] }, dependencies), /需要且只允许 1 张/);
  await assert.rejects(executeRefinedModelWorkflow({
    referenceImages: [
      { dataUrl: onePixelPng, name: "a.png", size: 68, type: "image/png" },
      { dataUrl: onePixelPng, name: "b.png", size: 68, type: "image/png" },
    ],
  }, dependencies), /需要且只允许 1 张/);
});
