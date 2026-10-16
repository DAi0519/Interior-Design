/**
 * [INPUT]: 依赖 node:test/assert、精模渲染可注入工作流边界与固定 Prompt 版本读取
 * [OUTPUT]: 对外提供下架版本零出图、用户要求前置、预设 Prompt 后置、单张精模、原图比例、批次元数据、脱敏响应和同步调度回归保障
 * [POS]: test 的精模渲染工作流集成测试，所有外部 API 与飞书同步均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { getRefinedModelPrompt } from "../src/refined-model-prompt.mjs";

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
    loadPrompt: async (code, options) => {
      assert.equal(options.allowDraft, false);
      return {
        code,
        name: "精模忠实渲染",
        prompt: "server fixed prompt",
        published: true,
        version: options.version,
      };
    },
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
  assert.equal(syncedInput.workflow.promptPublished, true);
  assert.equal(syncedInput.workflow.customPromptUsed, true);
  assert.deepEqual(result.prompt, {
    code: "refined-model-render",
    name: "精模忠实渲染",
    published: true,
    version: 1,
  });
  assert.equal(JSON.stringify(result).includes("server fixed prompt"), false);
  assert.equal(JSON.stringify(result).includes("增加一盏暖光落地灯"), false);
});

test("旧页面提交已下架版本在调用出图模型和归档前返回 409", async () => {
  let generated = false;
  let synced = false;
  await assert.rejects(executeRefinedModelWorkflow({
    promptVersion: 3,
    referenceImages: [{ dataUrl: onePixelPng, name: "model.png", type: "image/png" }],
  }, {
    imageClient: { generateImage() { generated = true; } },
    loadPrompt: (code, options) => getRefinedModelPrompt(code, {
      ...options,
      run: async () => ({
        ok: true,
        data: {
          fields: ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"],
          data: [["精模忠实渲染", "refined-model-render", 3, ["下架"], "retired prompt", "停用"]],
          has_more: false,
        },
      }),
    }),
    scheduleSync() { synced = true; },
  }), (error) => error.statusCode === 409 && /尚未上架/.test(error.message));
  assert.equal(generated, false);
  assert.equal(synced, false);
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
