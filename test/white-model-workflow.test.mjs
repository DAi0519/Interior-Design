/**
 * [INPUT]: 依赖 node:test/assert 与白模智能默认/固定风格渲染编排器的可注入服务边界
 * [OUTPUT]: 对外提供双 Prompt 路由、智能默认可省略重复生成要求的严格合同、提示词复用/重算、独立 Prompt/图像 Provider、版本化 Style DNA、比例及同步调度回归保障
 * [POS]: test 的白模工作流集成测试，所有外部 API 与后台任务均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmartDefaultPromptAgentInput,
  executeWhiteModelWorkflow,
  parsePromptAgentOutput,
} from "../src/white-model-workflow.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";

const agentJson = {
  generation_requirement: "按白模材质化",
  scene_preservation: "保持空间与机位",
  visual_application: {
    colors: "奶油白 70%",
    materials: "墙面哑光涂料",
    photography: "自然透视",
  },
};

const smartDefaultAgentJson = {
  scene_preservation: agentJson.scene_preservation,
  visual_application: agentJson.visual_application,
};

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";

function input() {
  return {
    modelKey: "gptImage2",
    outputFormat: "png",
    prompt: "稍微增强自然光",
    promptAgentModelKey: "gemini3pro",
    promptAgentVersion: 1,
    ratio: "4:3",
    ratioMode: "manual",
    referenceImages: [
      {
        dataUrl: onePixelPng,
        name: "white.png",
        size: Buffer.from(onePixelPng.split(",")[1], "base64").length,
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
  const relaxedAgentJson = { ...agentJson };
  delete relaxedAgentJson.scene_preservation;
  assert.deepEqual(
    parsePromptAgentOutput(JSON.stringify(relaxedAgentJson)),
    relaxedAgentJson,
  );
  assert.throws(() => parsePromptAgentOutput("{}"), /缺少必需字段/);
  assert.deepEqual(
    parsePromptAgentOutput(JSON.stringify(smartDefaultAgentJson), {
      strict: true,
    }),
    smartDefaultAgentJson,
  );
  assert.throws(
    () => parsePromptAgentOutput(
      JSON.stringify({
        ...smartDefaultAgentJson,
        generation_requirement: "",
      }),
      { strict: true },
    ),
    /缺少必需字段/,
  );
  assert.throws(
    () => parsePromptAgentOutput(
      JSON.stringify({ ...agentJson, analysis: "不应输出" }),
      { strict: true },
    ),
    /合同外字段/,
  );
});

test("智能默认直接读取独立 Agent 且不读取 Style DNA", async () => {
  let agentLookup;
  let promptRequest;
  let syncedInput;
  const client = {
    generateImage: async () => ({
      created: 1,
      images: [{ url: "data:image/png;base64,aQ==" }],
      outputFormat: "png",
      quality: null,
      transport: "responses",
    }),
    generatePrompt: async (request) => {
      promptRequest = request;
      return { text: JSON.stringify(smartDefaultAgentJson) };
    },
  };
  const result = await executeWhiteModelWorkflow(
    {
      ...input(),
      promptAgentModelKey: "doubaoVision",
      renderMode: "smart-default",
      smartDefaultAgentVersion: 1,
      styleCode: undefined,
    },
    {
      availableModels: [{ id: "doubao-seed-1.8" }],
      client,
      loadAgent: async (code, options) => {
        agentLookup = { code, options };
        return {
          code: "white-model-smart-default",
          name: "白模智能默认 Agent",
          systemPrompt: "smart system",
          version: 1,
        };
      },
      loadStyle: async () => {
        throw new Error("智能默认不应读取 Style DNA");
      },
      scheduleSync(value) {
        syncedInput = value;
        return { generationId: "smart-gen", status: "pending" };
      },
    },
  );

  assert.deepEqual(agentLookup, {
    code: "white-model-smart-default",
    options: { version: 1 },
  });
  assert.equal(promptRequest.systemPrompt, "smart system");
  assert.equal(promptRequest.model, "doubao-seed-1.8");
  assert.match(promptRequest.userPrompt, /render_mode:\nsmart-default/);
  assert.match(promptRequest.userPrompt, /稍微增强自然光/);
  assert.match(promptRequest.userPrompt, /photography_profile:/);
  assert.doesNotMatch(promptRequest.userPrompt, /style_dna:/);
  assert.equal(result.renderMode, "smart-default");
  assert.equal(result.style, null);
  assert.equal(result.promptAgent.name, "白模智能默认 Agent");
  assert.equal(syncedInput.workflow.renderMode, "smart-default");
  assert.equal(syncedInput.workflow.selectionName, "智能默认");
  assert.equal("styleCode" in syncedInput.workflow, false);
});

test("智能默认输入包含固定摄影底座且允许空补充要求", () => {
  const prompt = buildSmartDefaultPromptAgentInput({ userRequirements: "" });
  assert.match(prompt, /无补充要求/);
  assert.match(prompt, /中性白平衡/);
  assert.match(prompt, /不得使用油腻 HDR/);
});

test("白模链路复用模型目录并在出图后调度飞书同步", async () => {
  let generatedRequest;
  let agentLookup;
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
    loadAgent: async (code, options) => {
      agentLookup = { code, options };
      return {
        code: "white-model-fusion",
        name: "白模渲染融合 Agent",
        systemPrompt: "system",
        version: 1,
      };
    },
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
  assert.equal(generatedRequest.size, "1024x768");
  assert.deepEqual(agentLookup, {
    code: "white-model-fusion",
    options: { version: 1 },
  });
  assert.equal(styleLookup, "cream-french@v1");
  assert.equal(syncedInput.sourcePrompt, "稍微增强自然光");
  assert.deepEqual(JSON.parse(syncedInput.finalPrompt), agentJson);
  assert.equal("sourceRequirements" in syncedInput.workflow, false);
  assert.equal(syncedInput.workflow.agentModelLabel, "Gemini 3.1 Pro");
  assert.equal(syncedInput.workflow.promptReused, false);
  assert.equal(syncedInput.workflow.styleCode, "cream-french@v1");
  assert.equal(result.promptAgent.model, "gemini-3.1-pro-preview");
  assert.equal(result.request.transport, "responses");
  assert.equal(result.request.quality, "medium");
  assert.equal(result.sync.generationId, "gen1");
  assert.equal(result.sync.status, "pending");
});

test("白模链路允许 Prompt Agent 与最终出图使用不同客户端", async () => {
  let imageCalls = 0;
  const promptClient = {
    generatePrompt: async () => ({ text: JSON.stringify(agentJson) }),
  };
  const imageClient = {
    generateImage: async () => {
      imageCalls += 1;
      return {
        created: 1,
        images: [{ url: "data:image/png;base64,aQ==" }],
        metadata: { engine: "comfyui", workflowVersion: "2026-08-04" },
        outputFormat: "png",
        quality: null,
        transport: "comfyui-workflow",
      };
    },
  };
  const result = await executeWhiteModelWorkflow(input(), {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: promptClient,
    imageClient,
    loadAgent: async () => ({
      code: "white-model-fusion",
      name: "白模渲染融合 Agent",
      systemPrompt: "system",
      version: 1,
    }),
    loadStyle: async () => ({
      code: "cream-french@v1",
      familyCode: "cream-french",
      name: "奶油法式",
      styleDna: { style_dna: { overall_style: "cream" } },
      version: 1,
    }),
  });

  assert.equal(imageCalls, 1);
  assert.equal(result.request.transport, "comfyui-workflow");
  assert.equal(result.upstream.metadata.engine, "comfyui");
});

test("白模由服务端真实图片宽高驱动最近合法比例", async () => {
  let generatedRequest;
  const sourceBytes = Buffer.from(onePixelPng.split(",")[1], "base64").length;
  const sourceInput = {
    ...input(),
    modelKey: "banana2",
    ratio: "4:3",
    ratioMode: "auto",
    referenceImages: [{
      dataUrl: onePixelPng,
      name: "white.png",
      size: sourceBytes,
      type: "image/png",
    }],
    resolution: "2K",
  };
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
    generatePrompt: async () => ({ text: JSON.stringify(agentJson) }),
  };

  const result = await executeWhiteModelWorkflow(sourceInput, {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client,
    loadAgent: async () => ({
      code: "white-model-fusion",
      name: "白模渲染融合 Agent",
      systemPrompt: "system",
      version: 1,
    }),
    loadStyle: async () => ({
      code: "cream-french@v1",
      familyCode: "cream-french",
      name: "奶油法式",
      styleDna: { style_dna: { overall_style: "cream" } },
      version: 1,
    }),
  });

  assert.equal(generatedRequest.size, "2048x2048");
  assert.equal("quality" in generatedRequest, false);
  assert.equal(result.request.ratio, "1:1");
  assert.equal(result.request.sizeMode, "source-nearest");
});

test("出图失败重试复用提示词，并支持显式重算与条件变化失效", async () => {
  const promptResultCache = createAsyncTtlCache({ ttlMs: 60_000 });
  let imageCalls = 0;
  let promptCalls = 0;
  const client = {
    generateImage: async () => {
      imageCalls += 1;
      if (imageCalls === 1) throw new Error("image failed");
      return {
        created: imageCalls,
        images: [{ url: "data:image/png;base64,aQ==" }],
        outputFormat: "png",
        quality: null,
        transport: "responses",
      };
    },
    generatePrompt: async () => {
      promptCalls += 1;
      return { text: JSON.stringify(agentJson) };
    },
  };
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client,
    loadAgent: async () => ({
      code: "white-model-fusion",
      name: "白模渲染融合 Agent",
      systemPrompt: "system",
      version: 1,
    }),
    loadStyle: async () => ({
      code: "cream-french@v1",
      familyCode: "cream-french",
      name: "奶油法式",
      styleDna: { style_dna: { overall_style: "cream" } },
      version: 1,
    }),
    promptResultCache,
  };

  await assert.rejects(
    executeWhiteModelWorkflow(input(), dependencies),
    /image failed/,
  );
  const retried = await executeWhiteModelWorkflow(input(), dependencies);
  const forced = await executeWhiteModelWorkflow(
    { ...input(), forcePromptRegeneration: true },
    dependencies,
  );
  const changed = await executeWhiteModelWorkflow(
    { ...input(), prompt: "改成傍晚暖光" },
    dependencies,
  );

  assert.equal(promptCalls, 3);
  assert.equal(imageCalls, 4);
  assert.equal(retried.promptAgent.reused, true);
  assert.equal(forced.promptAgent.reused, false);
  assert.equal(changed.promptAgent.reused, false);
});
