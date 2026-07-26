/**
 * [INPUT]: 依赖 node:test/assert 与白模渲染编排器的可注入服务边界
 * [OUTPUT]: 对外提供版本化 Style DNA 编码、Prompt Agent、图片生成、模型缓存与后台同步调度回归保障
 * [POS]: test 的白模工作流集成测试，所有外部 API 与后台任务均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  executeWhiteModelWorkflow,
  parsePromptAgentOutput,
} from "../src/white-model-workflow.mjs";

const agentJson = {
  generation_requirement: "按白模材质化",
  scene_preservation: "保持空间与机位",
  visual_application: {
    colors: "奶油白 70%",
    materials: "墙面哑光涂料",
    photography: "自然透视",
  },
};

function input() {
  return {
    modelKey: "gptImage2",
    outputFormat: "png",
    prompt: "稍微增强自然光",
    promptAgentModelKey: "gemini3pro",
    ratio: "1:1",
    referenceImages: [
      {
        dataUrl: "data:image/png;base64,aA==",
        name: "white.png",
        size: 1,
        type: "image/png",
      },
    ],
    resolution: "1K",
    styleCode: "cream-french@v1",
  };
}

test("Prompt Agent 输出支持纯 JSON 与代码围栏并验证字段", () => {
  assert.deepEqual(parsePromptAgentOutput(JSON.stringify(agentJson)), agentJson);
  assert.deepEqual(
    parsePromptAgentOutput(`\`\`\`json\n${JSON.stringify(agentJson)}\n\`\`\``),
    agentJson,
  );
  assert.throws(() => parsePromptAgentOutput("{}"), /缺少必需字段/);
});

test("白模链路复用模型目录并在出图后调度飞书同步", async () => {
  let generatedRequest;
  let styleLookup;
  let syncedInput;
  const client = {
    generateImage: async (request) => {
      generatedRequest = request;
      return {
        created: 1,
        images: [{ url: "data:image/png;base64,aQ==" }],
        outputFormat: "png",
        quality: null,
        transport: "responses",
      };
    },
    generatePrompt: async ({ imageUrl, model, systemPrompt, userPrompt }) => {
      assert.equal(model, "gemini-3.1-pro-preview");
      assert.equal(systemPrompt, "system");
      assert.match(imageUrl, /^data:image\/png;base64,/);
      assert.match(userPrompt, /cream/);
      assert.doesNotMatch(userPrompt, /photography_profile|Canon EOS R5/);
      return { text: JSON.stringify(agentJson) };
    },
  };
  const result = await executeWhiteModelWorkflow(input(), {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client,
    loadAgent: async () => ({
      code: "white-model-fusion",
      name: "白模渲染融合 Agent",
      systemPrompt: "system",
      version: 1,
    }),
    loadStyle: async (code) => {
      styleLookup = code;
      return {
        code: "cream-french@v1",
        familyCode: "cream-french",
        name: "奶油法式",
        styleDna: { style_dna: { overall_style: "cream" } },
        version: 1,
      };
    },
    scheduleSync: (value) => {
      syncedInput = value;
      return { generationId: "gen1", status: "pending" };
    },
  });

  assert.deepEqual(JSON.parse(generatedRequest.prompt), agentJson);
  assert.equal(generatedRequest.images.length, 1);
  assert.equal(generatedRequest.quality, "medium");
  assert.equal(styleLookup, "cream-french@v1");
  assert.equal(syncedInput.sourcePrompt, "稍微增强自然光");
  assert.deepEqual(JSON.parse(syncedInput.finalPrompt), agentJson);
  assert.equal("sourceRequirements" in syncedInput.workflow, false);
  assert.equal(syncedInput.workflow.styleCode, "cream-french@v1");
  assert.equal(result.promptAgent.model, "gemini-3.1-pro-preview");
  assert.equal(result.request.transport, "responses");
  assert.equal(result.request.quality, "medium");
  assert.equal(result.sync.generationId, "gen1");
  assert.equal(result.sync.status, "pending");
});
