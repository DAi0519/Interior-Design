/**
 * [INPUT]: 依赖 node:test/assert、设计工作流、请求构造器与进程内提示词缓存的公开及可注入边界
 * [OUTPUT]: 验证空房/旧房自由输出、原文前置与缓存/长度边界，及白模/风格转换原合同和请求体不能开启内部额度的发布隔离
 * [POS]: test 的空房/旧房 Agent 输出兼容回归，模型与归档使用内存替身，不访问网络或收费接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationRequest } from "../src/model-config.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";
import { executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const image = { dataUrl: png, type: "image/png", name: "source.png" };
const requirement = '保留机位\n\n暖木色，保留引号 " 与反斜线 \\。';
const prose = "Preserve the source camera.\n\nCreate a warm oak interior with layered lighting.";
const customDesign = {
  design: { concept: "Warm oak", finishes: ["limewash", { position: "floor", material: "oak" }] },
  furniture: [{ type: "sofa", position: [1, 2], optional: false }],
  metadata: { count: 2, optional: null },
};
const legacyDesign = {
  scene_preservation: "Preserve the source camera and geometry.",
  visual_application: { materials: "Oak", colors: "Warm neutrals", photography: "Daylight" },
};
const scenarios = [
  { name: "空房", route: {} },
  { name: "旧房", route: { designScenario: "room-renovation" } },
];
const modes = [
  { name: "智能默认", route: { renderMode: "smart-default" } },
  { name: "平台风格", route: { renderMode: "style-dna" } },
  { name: "参考图智能默认", route: { renderMode: "smart-default", styleReferenceImages: [image] } },
];
const modelKeys = ["gptImage2", "aiTextureEnhancement"];

function harness(text, overrides = {}) {
  const calls = { prompts: [], images: [], archives: [] };
  const input = {
    featureMode: "emptyRoom", renderMode: "smart-default", roomType: "客厅",
    promptAgentModelKey: "gemini3pro", modelKey: "gptImage2", resolution: "1K",
    outputFormat: "png", referenceImages: [image], styleCode: "modern@v1", prompt: requirement,
    ...overrides,
  };
  let agentText = text;
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: { async generatePrompt(request) { calls.prompts.push(request); return { text: agentText }; } },
    imageClient: { async generateImage(request) { calls.images.push(request); return { images: [{ url: png }], outputFormat: "png" }; } },
    loadAgent: async code => ({ code, name: code, version: 1, systemPrompt: "Independent published Agent prompt" }),
    loadStyle: async code => ({ code, name: "现代", version: 1, styleDna: { materials: "oak" } }),
    scheduleSync(archive) { calls.archives.push(archive); return { status: "pending" }; },
  };
  return { input, dependencies, calls, setText(value) { agentText = value; } };
}

function assertArchiveMatches(f, sourcePrompt = requirement) {
  assert.equal(f.calls.images.length, f.calls.archives.length);
  for (const [index, request] of f.calls.images.entries()) {
    assert.equal(request.images.length, 1);
    assert.equal(request.images[0].image_url, png);
    assert.equal(f.calls.archives[index].finalPrompt, request.prompt);
    assert.equal(f.calls.archives[index].sourcePrompt, sourcePrompt);
  }
}

test("空房和旧房各风格输入及双Provider接受自定义JSON，保留任意层级与数组", async () => {
  for (const scenario of scenarios) for (const mode of modes) for (const modelKey of modelKeys) {
    const f = harness(JSON.stringify({ ...customDesign, user_requirements: "Agent改写" }), {
      ...scenario.route, ...mode.route, modelKey,
    });
    const result = await executeWhiteModelWorkflow(f.input, f.dependencies);
    const actual = JSON.parse(f.calls.images[0].prompt);
    assert.equal(Object.keys(actual)[0], "user_requirements", `${scenario.name}/${mode.name}/${modelKey}`);
    assert.deepEqual(actual, { user_requirements: requirement, ...customDesign });
    assert.equal(f.calls.prompts[0].systemPrompt, "Independent published Agent prompt");
    assert.ok(f.calls.prompts[0].userPrompt.startsWith(`user_requirements:\n${requirement}\n\n`));
    assert.equal(result.promptAgent.inputImageCount, mode.route.styleReferenceImages ? 2 : 1);
    assert.equal(f.calls.images.length, 1);
    assertArchiveMatches(f);
  }
});

test("空房和旧房各风格输入及双Provider接受纯文本，用户原文在Agent正文前", async () => {
  for (const scenario of scenarios) for (const mode of modes) for (const modelKey of modelKeys) {
    const f = harness(prose, { ...scenario.route, ...mode.route, modelKey });
    await executeWhiteModelWorkflow(f.input, f.dependencies);
    assert.equal(f.calls.images[0].prompt, `user_requirements:\n${requirement}\n\n${prose}`);
    assertArchiveMatches(f);
  }
});

test("代码围栏的JSON及text正文兼容，数组保留数组并在正文前放用户原文", async () => {
  const array = ["Warm oak interior", { lighting: ["daylight", "soft fill"] }];
  for (const scenario of scenarios) {
    const cases = [
      { text: `\`\`\`json\n${JSON.stringify(customDesign)}\n\`\`\``, json: customDesign },
      { text: `\`\`\`text\n${prose}\n\`\`\``, body: prose },
      { text: `\`\`\`\n${prose}\n\`\`\``, body: prose },
      { text: JSON.stringify(array), array },
    ];
    for (const entry of cases) {
      const f = harness(entry.text, scenario.route);
      await executeWhiteModelWorkflow(f.input, f.dependencies);
      const actual = f.calls.images[0].prompt;
      if (entry.json) assert.deepEqual(JSON.parse(actual), { user_requirements: requirement, ...entry.json });
      else {
        const prefix = `user_requirements:\n${requirement}\n\n`;
        assert.ok(actual.startsWith(prefix));
        const body = actual.slice(prefix.length);
        if (entry.array) assert.deepEqual(JSON.parse(body), entry.array);
        else assert.equal(body, entry.body);
      }
      assertArchiveMatches(f);
    }
  }
});

test("未闭合的json及text围栏有效正文可用，空内容和损坏JSON不进入出图", async () => {
  for (const scenario of scenarios) {
    const valid = [
      { text: `\`\`\`json\n${JSON.stringify(customDesign)}`, json: customDesign },
      { text: `\`\`\`text\n${prose}`, body: prose },
    ];
    for (const entry of valid) {
      const f = harness(entry.text, scenario.route);
      await executeWhiteModelWorkflow(f.input, f.dependencies);
      if (entry.json) assert.deepEqual(JSON.parse(f.calls.images[0].prompt), { user_requirements: requirement, ...entry.json });
      else assert.equal(f.calls.images[0].prompt, `user_requirements:\n${requirement}\n\n${entry.body}`);
      assertArchiveMatches(f);
    }
    for (const text of ["```json", "```json\n \n", "```text\n", '```json\n{"design":"oak"', '```text\n["warm oak",']) {
      const f = harness(text, scenario.route);
      await assert.rejects(executeWhiteModelWorkflow(f.input, f.dependencies), error => error.statusCode === 502);
      assert.equal(f.calls.images.length, 0);
      assert.equal(f.calls.archives.length, 0);
    }
  }
});

test("常见方括号段落标题作为纯文本保留，不误判成JSON数组", async () => {
  const texts = [
    `[SCENE]\n${prose}\n\n[USER REQUIREMENTS]\nKeep the source viewpoint.`,
    `[USER REQUIREMENTS]\nKeep the source viewpoint.\n\n[SCENE]\n${prose}`,
  ];
  for (const scenario of scenarios) for (const text of texts) for (const prompt of [requirement, ""]) {
    const f = harness(text, { ...scenario.route, prompt });
    await executeWhiteModelWorkflow(f.input, f.dependencies);
    assert.equal(f.calls.images[0].prompt, prompt ? `user_requirements:\n${prompt}\n\n${text}` : text);
    assertArchiveMatches(f, prompt);
  }
});

test("编码JSON字符串只解包一次，其JSON形正文不被重组或删除内部字段", async () => {
  const bodies = [
    '{"user_requirements":"keep this literal","design":{"material":"oak"}}',
    '["warm oak",{"lighting":"soft daylight"}]',
    '"Keep the source camera and material character."',
  ];
  for (const scenario of scenarios) for (const body of bodies) for (const prompt of [requirement, ""]) {
    const f = harness(JSON.stringify(body), { ...scenario.route, prompt });
    await executeWhiteModelWorkflow(f.input, f.dependencies);
    assert.equal(f.calls.images[0].prompt, prompt ? `user_requirements:\n${prompt}\n\n${body}` : body);
    assertArchiveMatches(f, prompt);
  }
});

test("无用户补充不新增占位，JSON对象、数组及纯文本均保留Agent正文", async () => {
  for (const scenario of scenarios) for (const modelKey of modelKeys) {
    for (const value of [customDesign, ["Warm oak", { lighting: "Daylight" }], prose]) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      const f = harness(text, { ...scenario.route, modelKey, prompt: " \n " });
      await executeWhiteModelWorkflow(f.input, f.dependencies);
      if (typeof value === "string") assert.equal(f.calls.images[0].prompt, prose);
      else assert.deepEqual(JSON.parse(f.calls.images[0].prompt), value);
      assertArchiveMatches(f, "");
    }
  }
});

test("纯文本Prompt缓存可复用、隔离空房旧房场景，并支持主动重算", async () => {
  const f = harness(prose);
  f.dependencies.promptResultCache = createAsyncTtlCache();
  f.dependencies.loadAgent = async () => ({ code: "same-test-agent", name: "Same Agent", version: 1, systemPrompt: "same" });
  const first = await executeWhiteModelWorkflow(f.input, f.dependencies);
  const reused = await executeWhiteModelWorkflow(f.input, f.dependencies);
  const renovationInput = { ...f.input, designScenario: "room-renovation" };
  const renovation = await executeWhiteModelWorkflow(renovationInput, f.dependencies);
  const renovationReused = await executeWhiteModelWorkflow(renovationInput, f.dependencies);
  f.setText("Create a new warm oak concept.");
  const forced = await executeWhiteModelWorkflow({ ...f.input, forcePromptRegeneration: true }, f.dependencies);
  assert.deepEqual([first, reused, renovation, renovationReused, forced].map(result => result.promptAgent.reused),
    [false, true, false, true, false]);
  assert.equal(f.calls.prompts.length, 3);
  assert.equal(f.calls.images[0].prompt, f.calls.images[1].prompt);
  assert.equal(f.calls.images[2].prompt, f.calls.images[3].prompt);
  assert.match(f.calls.images[4].prompt, /Create a new warm oak concept/);
  assertArchiveMatches(f);
});

test("空回复、空JSON、无文字内容的JSON和损坏JSON均在出图及归档前阻断", async () => {
  const invalid = [
    "", " \n ", "```json\n\n```", "```text\n\n```", "{}", "[]", "null", "true", "false", "0", "123",
    '{"design":{"layout":[null,false,12," "]}}', '{"design":[]}', '[null,{},[]," "]',
    '{"design":', '["warm oak",', '```json\n{"design":"warm oak"\n```',
  ];
  for (const scenario of scenarios) for (const text of invalid) {
    const f = harness(text, scenario.route);
    await assert.rejects(executeWhiteModelWorkflow(f.input, f.dependencies),
      error => error.statusCode === 502, `${scenario.name}: ${JSON.stringify(text)}`);
    assert.equal(f.calls.images.length, 0);
    assert.equal(f.calls.archives.length, 0);
  }
});

test("空房旧房无补充的服务端Agent正文使用32000额度，双Provider均不截断", async () => {
  for (const scenario of scenarios) for (const modelKey of modelKeys) {
    for (const length of [9000, 32000]) {
      const text = "x".repeat(length);
      const f = harness(text, { ...scenario.route, modelKey, prompt: "" });
      await executeWhiteModelWorkflow(f.input, f.dependencies);
      assert.equal(f.calls.images[0].prompt, text);
      assertArchiveMatches(f, "");
    }
    const oversized = harness("x".repeat(32001), { ...scenario.route, modelKey, prompt: "" });
    await assert.rejects(executeWhiteModelWorkflow(oversized.input, oversized.dependencies), /3–32000/);
    assert.equal(oversized.calls.images.length, 0);
    assert.equal(oversized.calls.archives.length, 0);
  }
});

test("白模智能默认和风格转换仍拒绝缺少既有字段、额外字段及纯文本", async () => {
  const routes = [
    { featureMode: "whiteModel", renderMode: "smart-default" },
    { featureMode: "styleTransfer", renderMode: "style-dna", styleTransferPromptAgentVersion: 1 },
    { featureMode: "styleTransfer", renderMode: "style-reference", styleReferenceImages: [image], styleTransferReferenceVersion: 1 },
  ];
  for (const route of routes) for (const text of [JSON.stringify(customDesign), JSON.stringify({ ...legacyDesign, analysis: "extra" }), prose]) {
    const f = harness(text, route);
    await assert.rejects(executeWhiteModelWorkflow(f.input, f.dependencies), error => error.statusCode === 502);
    assert.equal(f.calls.images.length, 0);
    assert.equal(f.calls.archives.length, 0);
  }
});

test("发布隔离保持白模和风格转换的合法最终JSON及Agent消息顺序", async () => {
  const payload = { ...legacyDesign, generation_requirement: "Create a photorealistic interior." };
  const routes = [
    { featureMode: "whiteModel", renderMode: "smart-default", instruction: "请执行白模智能默认材质化任务。", beforeRequirements: "render_mode:" },
    { featureMode: "whiteModel", renderMode: "style-dna", instruction: "请执行设计模型渲染 Prompt 整合任务。", beforeRequirements: "style_dna:" },
    { featureMode: "styleTransfer", renderMode: "style-dna", styleTransferPromptAgentVersion: 1,
      instruction: "请执行空间图风格转换任务。", beforeRequirements: "input_image_roles:" },
    { featureMode: "styleTransfer", renderMode: "style-reference", styleReferenceImages: [image], styleTransferReferenceVersion: 1,
      instruction: "请执行空间图风格转换任务。", beforeRequirements: "input_image_roles:" },
  ];
  for (const { instruction, beforeRequirements, ...route } of routes) for (const modelKey of modelKeys) {
    const f = harness(JSON.stringify(payload), { ...route, modelKey });
    await executeWhiteModelWorkflow(f.input, f.dependencies);
    const actual = JSON.parse(f.calls.images[0].prompt);
    assert.deepEqual(actual, payload);
    assert.equal(Object.hasOwn(actual, "user_requirements"), false);
    const agentMessage = f.calls.prompts[0].userPrompt;
    assert.ok(agentMessage.startsWith(`${instruction}\n\n`));
    const requirementsAt = agentMessage.indexOf("user_requirements:\n");
    const contextAt = agentMessage.indexOf(beforeRequirements);
    assert.ok(contextAt >= 0 && requirementsAt > contextAt);
    assert.ok(agentMessage.includes(`user_requirements:\n${requirement}`));
    assertArchiveMatches(f);
  }
});

test("空房和旧房用户补充超过8000字符时在Agent及出图前拒绝", async () => {
  for (const scenario of scenarios) for (const modelKey of modelKeys) {
    const f = harness(prose, { ...scenario.route, modelKey, prompt: "中".repeat(8001) });
    f.dependencies.loadAgent = async () => { throw new Error("超长用户补充不应读取Agent资产"); };
    await assert.rejects(executeWhiteModelWorkflow(f.input, f.dependencies), /不能超过 8000/);
    assert.equal(f.calls.prompts.length, 0);
    assert.equal(f.calls.images.length, 0);
    assert.equal(f.calls.archives.length, 0);
  }
});

test("请求体compiledPrompt字段不能提升自由生图额度，只有内部参数可启用32000", () => {
  const input = { featureMode: "free", modelKey: "gptImage2", resolution: "1K", ratio: "1:1",
    outputFormat: "png", prompt: "x".repeat(8001), compiledPrompt: true };
  assert.throws(() => createGenerationRequest(input), /3–8000/);
  const compiled = createGenerationRequest(input, { compiledPrompt: true });
  assert.equal(compiled.request.prompt, input.prompt);
  const atLimit = createGenerationRequest({ ...input, prompt: "x".repeat(32000) }, { compiledPrompt: true });
  assert.equal(atLimit.request.prompt.length, 32000);
  assert.throws(() => createGenerationRequest({ ...input, prompt: "x".repeat(32001) }, { compiledPrompt: true }), /3–32000/);
});
