/**
 * [INPUT]: 依赖 node:test/assert、质感Prompt夹具与独立读取器、共享工作流/Flux节点工厂、任务API/生成服务和飞书字段投影
 * [OUTPUT]: 验证运行功能目录只读、飞书正文逐字直投与版本SHA、客户端覆盖隔离、最终空负向节点、单图准入、全模型任务路由与归档，不调用外部服务
 * [POS]: test 的质感增强执行与归档合同测试，模型和飞书全部使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createAiTextureWorkflow, AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT } from "../src/ai-texture-workflow.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { createGenerationJobApiHandler, supportedGenerationFeatureModes } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";
const TEXTURE_ENHANCEMENT_PROMPT = Object.freeze({
  code: "texture-render-enhancement",
  name: "质感增强 Prompt",
  prompt: "在保持原有空间结构、光影氛围不变的基础上，增强整体材质真实感与光影表现。木纹、石材、金属、玻璃、布艺等材质纹理清晰自然，表面粗糙度、反射率、光泽度表现准确，细节丰富，接缝、收口与边缘处理真实自然，体现高级材质质感。整体采用高真实度室内空间渲染，光线通透自然，环境光反弹真实，明暗层次清晰，阴影柔和准确，局部高光细腻不过曝，增强空间纵深感与氛围感。画面真实、干净、高级，3D写实渲染，超真实材质，电影级光影，商业级效果图质感。避免塑料材质感，避免材质模糊，避免纹理重复，避免过度锐化，避免过曝，避免死黑阴影，避免光影僵硬，避免反射错误，避免金属廉价感，避免石材假纹理，避免木纹失真，避免画面发灰，避免低质渲染感，避免卡通感，避免过度饱和，避免不真实的灯光，避免表面过于光滑，避免空间失真",
  published: true,
  version: 1,
});

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const image = { dataUrl: png, name: "render.png", type: "image/png" };
const input = { featureMode: "textureEnhancement", modelKey: "gptImage2", outputFormat: "png",
  ratio: "4:3", ratioMode: "auto", referenceImages: [image], resolution: "1K" };
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const rejectPromptRead = () => { throw new Error("质感增强不可读取其他功能Prompt"); };

test("运行进程功能目录公开质感增强且不能被调用方修改", () => {
  const modes = supportedGenerationFeatureModes();
  assert.ok(modes.includes("textureEnhancement"));
  assert.equal(new Set(modes).size, modes.length);
  assert.ok(Object.isFrozen(modes));
  assert.throws(() => modes.push("client-injected-feature"), TypeError);
  assert.equal(supportedGenerationFeatureModes().includes("client-injected-feature"), false);
});

test("质感增强逐字使用指定正文，忽略页面词/环境/六预设及其他版本，归档和返回身份独立", async () => {
  assert.ok(Object.isFrozen(TEXTURE_ENHANCEMENT_PROMPT));
  assert.equal(createHash("sha256").update(TEXTURE_ENHANCEMENT_PROMPT.prompt).digest("hex"),
    "a964b78cdbf5bb75f9670a59ab2c9924b3363a9527c644bc43b7100385ce4f8a");
  for (const model of publicModelCatalog()) {
    let requested, archived;
    const result = await executeEffectRenderEnhancementWorkflow({ ...input,
      modelKey: model.key, resolution: model.defaultResolution,
      prompt: "客户端试图覆盖固定正向", negativePrompt: "客户端其他功能负向".repeat(1000),
      effectTime: "night", effectWeather: "rainy", effectBeautification: { intensity: "invalid" },
      panoramaPromptVersion: 999, effectBeautificationPromptVersion: 999,
    }, {
      loadEffectPrompt: rejectPromptRead, loadBeautificationPrompt: rejectPromptRead, loadPanoramaPrompt: rejectPromptRead,
      loadTexturePrompt: async () => TEXTURE_ENHANCEMENT_PROMPT,
      imageClient: { async generateImage(value) { requested = value; return { images: [{ url: png }],
        transport: model.provider === "comfyui" ? "comfyui-workflow" : "responses" }; } },
      scheduleSync(value) { archived = value; return { generationId: "texture-sync", status: "pending" }; },
    });
    assert.equal(requested.prompt, TEXTURE_ENHANCEMENT_PROMPT.prompt);
    assert.equal(requested.images.length, 1);
    assert.equal(requested.n, 1);
    assert.equal("effect_beautification" in requested, false);
    if (model.provider === "comfyui") {
      assert.equal(requested.negative_prompt, "");
      assert.equal(requested.negative_prompt_mode, "disabled-fixed-prompt");
      assert.equal(archived.workflow.negativePrompt, "");
      assert.equal(archived.workflow.negativePromptMode, "disabled-fixed-prompt");
      const graph = createAiTextureWorkflow({ artifactKey: "texture-test-contract", generationRequest: requested,
        imageBase64: png.split(",")[1], negativePrompt: requested.negative_prompt,
        prompt: requested.prompt, seed: 1, width: requested.width, height: requested.height });
      const encoders = Object.values(graph).filter((node) => node.class_type === "CLIPTextEncode");
      assert.deepEqual(encoders.map((node) => node.inputs.text).sort(), ["", TEXTURE_ENHANCEMENT_PROMPT.prompt].sort());
      assert.equal(Object.values(graph).some((node) => node.class_type.toLowerCase().includes("lora")), false);
    }
    assert.equal(archived.finalPrompt, TEXTURE_ENHANCEMENT_PROMPT.prompt);
    assert.equal(archived.sourcePrompt, "");
    assert.equal(archived.workflow.feature, "texture-render-enhancement");
    assert.equal(archived.workflow.promptCode, TEXTURE_ENHANCEMENT_PROMPT.code);
    assert.equal(archived.workflow.promptVersion, 1);
    assert.equal(archived.workflow.promptSha256, "a964b78cdbf5bb75f9670a59ab2c9924b3363a9527c644bc43b7100385ce4f8a");
    for (const key of ["effectTime", "effectWeather", "effectBeautification", "agentModelLabel"]) {
      assert.equal(key in archived.workflow, false);
    }
    const fields = buildRecordFields({ ...archived, actualSize: "1x1" });
    assert.equal(fields["功能"], "质感增强");
    assert.equal(fields["最终 Prompt"], TEXTURE_ENHANCEMENT_PROMPT.prompt);
    assert.equal(fields["原始 Prompt"], "");
    assert.equal("Prompt融合" in fields, false);
    assert.equal(result.prompt.code, "texture-render-enhancement");
    assert.doesNotMatch(JSON.stringify(result), /在保持原有空间结构|客户端/);
  }
});

test("普通Flux默认负向保持原合同，固定词模式才清空最终负向节点", () => {
  const graph = createAiTextureWorkflow({ artifactKey: "ordinary-flux-contract", imageBase64: png.split(",")[1],
    negativePrompt: "", prompt: "ordinary prompt", seed: 1, width: 1024, height: 1024 });
  assert.ok(Object.values(graph).some((node) => node.class_type === "CLIPTextEncode"
    && node.inputs.text === AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT));
});

test("质感增强缺图或多图在任何Prompt读取和模型提交前拒绝", async () => {
  for (const referenceImages of [[], [image, image]]) {
    await assert.rejects(executeEffectRenderEnhancementWorkflow({ ...input, referenceImages }, {
      imageClient: { generateImage: () => { throw new Error("不可提交模型"); } },
      loadEffectPrompt: rejectPromptRead, loadBeautificationPrompt: rejectPromptRead, loadPanoramaPrompt: rejectPromptRead,
      loadTexturePrompt: rejectPromptRead,
    }), /质感增强需要且只允许 1 张/);
  }
});

test("质感增强经后台任务和真实生成服务路由全模型，一次出图一次独立归档", async () => {
  const models = publicModelCatalog();
  const registry = createGenerationJobRegistry();
  const requested = [], archived = [];
  let verified = false, response;
  const service = createGenerationService({
    getTextureEnhancementPrompt: async () => TEXTURE_ENHANCEMENT_PROMPT,
    requireApiKey: () => "test-key",
    imageClientForModel(modelKey) { return { async generateImage(request) {
      assert.equal(verified, true);
      assert.equal(request.prompt, TEXTURE_ENHANCEMENT_PROMPT.prompt);
      requested.push(modelKey);
      return { images: [{ url: png }] };
    } }; },
    scheduleGenerationSync(value) { archived.push(value); return { status: "pending" }; },
  });
  const body = { featureMode: "textureEnhancement", jobId: "generation-texture-all-models",
    batchId: "texture-all-models", sharedInput: { ...input, featureMode: "whiteModel" },
    items: models.map((model) => ({ key: model.key, label: model.label,
      input: { modelKey: model.key, resolution: model.defaultResolution } })) };
  const handler = createGenerationJobApiHandler({ generationJobs: registry, generationService: service,
    readJson: async () => body, sendJson: (_response, statusCode, value) => { response = { statusCode, ...value }; },
    verifySyncContract: async () => { verified = true; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 202);
  for (let turn = 0; turn < 50 && registry.get(body.jobId).status === "running"; turn += 1) await nextTurn();
  const completed = registry.get(body.jobId);
  assert.equal(completed.status, "success");
  assert.ok(completed.result.outcomes.every((outcome) => outcome.status === "fulfilled"));
  assert.deepEqual(requested, models.map((model) => model.key));
  assert.equal(archived.length, models.length);
  assert.ok(archived.every((value) => value.workflow.feature === "texture-render-enhancement"
    && value.workflow.batchId === body.batchId && value.workflow.batchCount === models.length));
});

test("质感增强使用读取器实际发布的版本与正文，配置失效时零模型调用", async () => {
  let requested, archived, submitted = 0, selectedVersion;
  const runtimePrompt = { ...TEXTURE_ENHANCEMENT_PROMPT, prompt: "飞书质感增强修改后的完整正文", version: 7 };
  const result = await executeEffectRenderEnhancementWorkflow({ ...input, textureEnhancementPromptVersion: 7 }, {
    loadTexturePrompt: async ({ version }) => { selectedVersion = version; return runtimePrompt; },
    imageClient: { generateImage: async value => { requested = value; submitted += 1; return { images: [{ url: png }] }; } },
    scheduleSync(value) { archived = value; return { status: "pending" }; },
  });
  assert.equal(selectedVersion, 7);
  assert.equal(requested.prompt, runtimePrompt.prompt);
  assert.equal(archived.finalPrompt, runtimePrompt.prompt);
  assert.equal(result.prompt.version, 7);
  assert.equal(archived.workflow.promptVersion, 7);
  assert.equal(result.prompt.sha256, createHash("sha256").update(runtimePrompt.prompt).digest("hex"));
  await assert.rejects(executeEffectRenderEnhancementWorkflow(input, {
    loadTexturePrompt: async () => { throw Object.assign(new Error("飞书质感增强配置已下架"), { statusCode: 409 }); },
    imageClient: { generateImage() { submitted += 1; throw new Error("不可提交"); } },
  }), error => error.statusCode === 409 && /已下架/.test(error.message));
  assert.equal(submitted, 1);
});

test("质感增强实时归档合同不通过时零入队、零付费调用", async () => {
  const registry = createGenerationJobRegistry();
  let response;
  const jobId = "generation-texture-blocked";
  const handler = createGenerationJobApiHandler({ generationJobs: registry,
    generationService: { executeForMode: () => { throw new Error("不可提交模型"); } },
    readJson: async () => ({ featureMode: "textureEnhancement", jobId,
      items: [{ key: "gptImage2", input: { modelKey: "gptImage2" } }] }),
    sendJson: (_response, statusCode, value) => { response = { statusCode, ...value }; },
    verifySyncContract: async () => { throw new Error("功能字段缺少质感增强"); },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 409);
  assert.match(response.error, /缺少质感增强/);
  assert.equal(registry.get(jobId), null);
});
