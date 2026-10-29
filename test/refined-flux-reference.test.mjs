/**
 * [INPUT]: 依赖精模Flux工厂/模型请求/共享尺寸规则、真实节点只读快照、独立导入画布及内存ComfyUI替身
 * [OUTPUT]: 验证双图顺序/4步采样/1K2K尺寸、普通Flux隔离、节点前置阻断/正式发送归档及画布控件连线一致
 * [POS]: test的精模Flux双图跨层合同，无网络或收费GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { MODEL_CONFIGS, createGenerationRequest, publicModelCatalog } from "../src/model-config.mjs";
import { createRefinedFluxClient, createRefinedFluxWorkflow, FLUX_REFERENCE_SOURCE_SHA256 } from "../src/refined-flux-reference.mjs";
import { executeRefinedModelWorkflow } from "../src/refined-model-workflow.mjs";
import { sizeControlState, sizeSummary } from "../public/model-capabilities.js";
import { betaSizeOptions } from "../public/beta-model-rules.js";
import { refinedFluxDimensions } from "../public/refined-flux-reference.js";
const { catalog } = JSON.parse(await readFile(new URL("./refined-flux-reference.schema.json", import.meta.url)));
const source = await sharp({ create: { width: 160, height: 90, channels: 3, background: "#405568" } }).png().toBuffer();
const atmosphere = await sharp({ create: { width: 80, height: 160, channels: 3, background: "#bb8a41" } }).png().toBuffer();
const image = (bytes, name) => ({ name, type: "image/png", dataUrl: `data:image/png;base64,${bytes.toString("base64")}` });
const base = { featureMode: "refinedModel", modelKey: "aiTextureEnhancement", resolution: "1K", referenceImages: [image(source, "source.png"), image(atmosphere, "atmosphere.png")], refinedLighting: { mode: "reference" } };

test("精模双图仅1K/2K长边跟随图1，普通Flux/纯词仍保留原单图和超分合同", () => {
  for (const [tier, edge] of [["1K", 1024], ["2K", 2048]]) {
    const { request, preview } = createGenerationRequest({ ...base, resolution: tier });
    assert.equal(Math.max(request.width, request.height), edge);
    assert.deepEqual([request.width, request.height], [edge, edge * 9 / 16]);
    assert.equal(request.images.length, 2);
    assert.equal(preview.referenceImageCount, 2);
    assert.equal(request.workflow_kind, "refined-flux-reference");
    assert.equal(request.upscale_resolution, undefined);
    assert.equal(request.negative_prompt, "");
  }
  for (const resolution of ["4K", "6K", "source"]) assert.throws(() => createGenerationRequest({ ...base, resolution }));
  assert.throws(() => createGenerationRequest({ ...base, featureMode: "whiteModel" }), /只允许 1 张/);
  const single = createGenerationRequest({ ...base, resolution: "4K", refinedLighting: { mode: "preset", execution: "prompt-only" }, referenceImages: base.referenceImages.slice(0, 1) });
  assert.equal(single.request.upscale_resolution, "4K");
  assert.equal(single.request.workflow_kind, undefined);
  assert.equal(MODEL_CONFIGS.aiTextureEnhancement.maxReferenceImages, 1);
  assert.deepEqual(refinedFluxDimensions({ width: 90, height: 160 }, "2K"), { width: 1152, height: 2048 });
});

test("Main/Beta精模参考来源仅显示1K2K，返回纯词保留4K6K，尺寸摘要按长边", () => {
  const model = publicModelCatalog().find(x => x.key === base.modelKey);
  const args = { model, featureMode: "refinedModel", currentResolution: "4K", currentRatio: "source", preserveResolution: true, refinedLighting: base.refinedLighting };
  assert.deepEqual(sizeControlState(args).resolutionOptions.map(x => x.value), ["1K", "2K"]);
  assert.equal(sizeControlState(args).resolution, "2K");
  assert.deepEqual(betaSizeOptions({ ...args, models: [model] }).resolutionOptions.map(x => x.value), ["1K", "2K"]);
  assert.equal(sizeSummary({ ...args, ratio: "source", resolution: "2K", sourceImage: { width: 160, height: 90 } }).exactSize, "2048 × 1152");
  assert.deepEqual(sizeControlState({ ...args, refinedLighting: { mode: "preset", execution: "prompt-only" } }).resolutionOptions.map(x => x.value), ["1K", "2K", "4K", "6K"]);
});

test("双图条件依次追加，参考图独立比例；空latent/4步/CFG1/Euler与唯一输出保持附件骨架", () => {
  const { request } = createGenerationRequest(base);
  const graph = createRefinedFluxWorkflow({ generationRequest: request, references: [{ base64: "SOURCE", width: 160, height: 90 }, { base64: "REF", width: 80, height: 160 }], artifactKey: "test-graph", seed: 42, width: request.width, height: request.height, prompt: "REFERENCE RULE" });
  assert.equal(graph.input0.inputs.base64_data, "SOURCE");
  assert.equal(graph.input1.inputs.base64_data, "REF");
  assert.deepEqual([graph.resize1.inputs.width, graph.resize1.inputs.height], [512, 1024]);
  assert.deepEqual(graph.positive1.inputs.conditioning, ["positive0", 0]);
  assert.deepEqual(graph.negative1.inputs.conditioning, ["negative0", 0]);
  assert.deepEqual(graph.sample.inputs.latent_image, ["latent", 0]);
  assert.equal(graph.schedule.inputs.steps, 4);
  assert.equal(graph.guider.inputs.cfg, 1);
  assert.equal(graph.sampler.inputs.sampler_name, "euler");
  assert.equal(graph.positive.inputs.text, "REFERENCE RULE");
  assert.equal(Object.values(graph).filter(x => x.class_type === "SaveImage").length, 1);
});

function transport(schema = catalog, wrongSize = false) {
  let posts = 0, sequence = 0, queued, prefix;
  const client = createRefinedFluxClient({ baseUrl: "http://comfy.test/", pollIntervalMs: 0,
    randomId: () => `refined-test-${++sequence}`, randomSeed: () => 42,
    webSocketFactory: () => ({ addEventListener() {}, close() {} }),
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname;
      if (path.startsWith("/object_info/")) { const type = decodeURIComponent(path.split("/").at(-1)); return Response.json({ [type]: schema[type] }); }
      if (path === "/prompt") { posts++; queued = JSON.parse(options.body).prompt; prefix = queued.result.inputs.filename_prefix; return Response.json({ prompt_id: "p1" }); }
      if (path === "/history/p1") return Response.json({ p1: { outputs: { result: { images: [{ filename: `${prefix}_00001_.png`, subfolder: "", type: "output" }] } }, status: { completed: true, status_str: "success", messages: [] } } });
      if (path === "/view") return new Response(await sharp({ create: { width: wrongSize ? 1008 : 1024, height: 576, channels: 3, background: "#777777" } }).png().toBuffer(), { headers: { "Content-Type": "image/png" } });
      throw new Error(`unexpected ${path}`);
    } });
  return { client, posts: () => posts, graph: () => queued };
}
test("实际ComfyUI替身双图单次提交/原字节顺序/尺寸/元数据；节点缺失零提交，错尺寸不重提", async () => {
  const { request } = createGenerationRequest(base);
  const t = transport();
  const result = await t.client.generateImage(request);
  assert.equal(t.posts(), 1);
  assert.equal(t.graph().input0.inputs.base64_data, source.toString("base64"));
  assert.equal(t.graph().input1.inputs.base64_data, atmosphere.toString("base64"));
  assert.equal(result.metadata.workflowId, "refined-flux-reference");
  assert.deepEqual(result.metadata.inputImages.map(x => x.role), ["source", "atmosphere"]);
  assert.equal(result.metadata.outputWidth, 1024);
  assert.equal(result.metadata.postUpscaled, false);
  const absent = transport({ ...catalog, ReferenceLatent: undefined });
  await assert.rejects(absent.client.generateImage(request), /缺少节点/);
  assert.equal(absent.posts(), 0);
  const wrong = transport(catalog, true);
  await assert.rejects(wrong.client.generateImage(request), /实际输出尺寸/);
  assert.equal(wrong.posts(), 1);
});

test("正式精模图文及上传均走Flux双图，参考Prompt/图序及送模与归档身份相同", async () => {
  const referenceRule = { id: "rec-rule", code: "lighting-reference-transfer", prompt: "Image 1 design. Image 2 lighting.", version: 4, sha256: "a".repeat(64) };
  const preset = { id: "rec-preset", code: "warm-night", name: "夜景", prompt: "MUST NOT COMPILE", version: 3, sha256: "b".repeat(64) };
  for (const mode of ["preset", "reference"]) {
    const t = transport(); let archived;
    await executeRefinedModelWorkflow({ ...base, referenceImages: base.referenceImages.slice(0, 1), prompt: "保留灯具", refinedLighting: { mode, ...(mode === "preset" ? { presetId: preset.id, execution: "prompt-and-reference" } : {}) }, ...(mode === "reference" ? { lightingReferenceImages: [image(atmosphere, "atmosphere.png")] } : {}) }, {
      imageClient: t.client, loadPrompt() { assert.fail("不得读取基础"); }, loadLightingAssets: async () => ({ referenceRule, presets: [preset] }),
      loadLightingReference: async () => image(atmosphere, "atmosphere.png"), scheduleSync(value) { archived = value; return { status: "mock" }; },
    });
    assert.equal(archived.finalPrompt, `${referenceRule.prompt}\n\n保留灯具`);
    assert.equal(archived.workflow.workflowId, "refined-flux-reference");
    assert.equal(archived.workflow.promptVersion, 4);
    assert.equal(archived.styleReferenceImages.length, 1);
    assert.equal(t.posts(), 1);
  }
});


test("独立1K/2K画布的命名及位置控件一致、尺寸由图1联动且没有旧门替换词或悬空链接", async () => {
  for (const [tier, edge] of [["1K", 1024], ["2K", 2048]]) {
    const w = JSON.parse(await readFile(new URL(`../workflows/Flux2-Klein-精模双图-${tier}.json`, import.meta.url)));
    const nodes = new Map(w.nodes.map(n => [n.id, n]));
    const links = new Map(w.links.map(l => [l[0], l]));
    assert.equal(w.extra.canvasLab.sourceSha256, FLUX_REFERENCE_SOURCE_SHA256);
    assert.equal(w.extra.canvasLab.promptVersion, 4);
    for (const n of w.nodes) {
      if (n.widgets_values_named) assert.deepEqual(n.widgets_values, Object.values(n.widgets_values_named));
      for (const port of n.inputs || []) if (port.link !== null && port.link !== undefined) {
        const link = links.get(port.link); assert.ok(link, `input ${n.id}.${port.name}`);
        assert.equal(link[3], n.id); assert.equal(nodes.get(link[1]).outputs[link[2]].type, port.type);
      }
      for (const [slot, port] of (n.outputs || []).entries()) for (const id of port.links || []) {
        const link = links.get(id); assert.ok(link, `output ${n.id}.${port.name}`);
        assert.equal(link[1], n.id); assert.equal(link[2], slot);
        assert.equal(nodes.get(link[3]).inputs[link[4]].link, id);
      }
    }
    for (const id of [186, 194]) {
      const values = nodes.get(id).widgets_values_named;
      assert.equal(values.scale_to_side, "longest"); assert.equal(values.scale_to_length, edge);
      assert.match(values.background_color, /^#[0-9a-f]{6}$/i);
    }
    for (const id of [184, 185]) for (const name of ["width", "height"]) {
      const input = nodes.get(id).inputs.find(x => x.name === name);
      assert.equal(links.get(input.link)[1], 186);
    }
    assert.equal(nodes.get(333).widgets_values[0], "source-model.png");
    assert.equal(nodes.get(334).widgets_values[0], "atmosphere-reference.png");
    assert.match(nodes.get(191).widgets_values[0], /Image 2 provides LIGHTING AND ATMOSPHERE only/);
    assert.doesNotMatch(JSON.stringify(w), /入户门|PlaySound|Image Comparer/);
  }
});
