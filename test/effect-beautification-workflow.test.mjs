/**
 * [INPUT]: 依赖 node:test/assert、六份归档 ComfyUI 源画布、美化阶段工厂与统一 Flux 工作流工厂
 * [OUTPUT]: 对外提供六预设源参数与 SHA、旁路、双参考、16 对齐裁剪、独立触发词、归档元数据、节点能力及输出超分合同测试
 * [POS]: test 的效果图美化执行图离线回归，以原始画布和固定期望交叉核验，不提交 GPU 任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EFFECT_BEAUTIFICATION_WORKFLOW,
  composeFluxBeautificationPrompt,
  createEffectBeautificationStage,
  effectBeautificationMetadata,
  effectBeautificationPreset,
  verifyEffectBeautificationCapabilities,
} from "../src/effect-beautification-workflow.mjs";
import { aiTextureWorkflowMetadata, createAiTextureWorkflow } from "../src/ai-texture-workflow.mjs";

const LORA = "flux/flux2_klein9B_zhiganEnhance_v1_000006000.safetensors";
const CASES = [
  { intensity: "low", tone: "natural", file: "低增强-自然调.json", steps: 2, lora: 0.45, color: 1, brightness: null, temperature: null },
  { intensity: "low", tone: "warm", file: "低增强-暖调.json", steps: 2, lora: 0.45, color: 0.7, brightness: { brightness: 0.97, contrast: 1.05, saturation: 1 }, temperature: -4 },
  { intensity: "low", tone: "cool", file: "低增强-冷调.json", steps: 2, lora: 0.45, color: 0.6, brightness: { brightness: 0.92, contrast: 1.03, saturation: 1 }, temperature: 2 },
  { intensity: "high", tone: "natural", file: "高增强-自然调.json", steps: 4, lora: 0.7, color: 1, brightness: null, temperature: null },
  { intensity: "high", tone: "warm", file: "高增强-暖调.json", steps: 4, lora: 0.7, color: 0.5, brightness: null, temperature: -2 },
  { intensity: "high", tone: "cool", file: "高增强-冷调.json", steps: 4, lora: 0.7, color: 0.5, brightness: { brightness: 0.97, contrast: 1.03, saturation: 1 }, temperature: 2 },
];

function entriesOfType(nodes, type) {
  return Object.entries(nodes).filter(([, node]) => node.class_type === type);
}

function onlyNode(nodes, type) {
  const entries = entriesOfType(nodes, type);
  assert.equal(entries.length, 1, `${type} 应当只有一个节点`);
  return entries[0];
}

function assertGraphReferences(nodes, output) {
  for (const [id, node] of Object.entries(nodes)) {
    for (const [input, value] of Object.entries(node.inputs)) {
      if (!Array.isArray(value)) continue;
      assert.equal(value.length, 2, `${id}.${input} 必须是单个端口引用`);
      assert.ok(Object.hasOwn(nodes, value[0]), `${id}.${input} 引用缺失节点 ${value[0]}`);
      assert.ok(Number.isInteger(value[1]) && value[1] >= 0, `${id}.${input} 端口非法`);
    }
  }
  assert.ok(Object.hasOwn(nodes, output[0]), "输出节点必须存在于同一执行图");
  const visited = new Set();
  const pending = new Set();
  const visit = (id) => {
    assert.ok(!pending.has(id), `执行图出现循环依赖 ${id}`);
    if (visited.has(id)) return;
    pending.add(id);
    for (const value of Object.values(nodes[id].inputs)) {
      if (Array.isArray(value)) visit(value[0]);
    }
    pending.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(nodes)) visit(id);
}

function stage(selection, options = {}) {
  return createEffectBeautificationStage({
    artifactKey: "beautify-test-123",
    generationRequest: { effect_beautification: selection, ...options.generationRequest },
    height: 576,
    imageBase64: "test-base64-image",
    negativePrompt: "用户自定义负向",
    prompt: "preserve material colors",
    seed: 42,
    width: 1024,
    ...options,
  });
}

test("六预设固定参数对应独立源文件，低强度 2 步 0.45、高强度 4 步 0.7", () => {
  assert.equal(EFFECT_BEAUTIFICATION_WORKFLOW.lora, LORA);
  assert.equal(EFFECT_BEAUTIFICATION_WORKFLOW.trigger, "zhiganEnhance");
  assert.equal(EFFECT_BEAUTIFICATION_WORKFLOW.maxInferenceEdge, 1920);
  assert.equal(effectBeautificationPreset().key, "low-natural");
  for (const expected of CASES) {
    const preset = effectBeautificationPreset({ intensity: expected.intensity, tone: expected.tone });
    assert.equal(preset.key, `${expected.intensity}-${expected.tone}`);
    assert.equal(preset.steps, expected.steps);
    assert.equal(preset.loraStrength, expected.lora);
    assert.equal(preset.colorMatchStrength, expected.color);
    assert.deepEqual(preset.brightnessContrast, expected.brightness);
    assert.equal(preset.temperature, expected.temperature);
    assert.equal(preset.sourceFileName, expected.file);
    assert.match(preset.sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(preset.maasParameterId);
    assert.ok(preset.maasStrategyId);
  }
});

test("预设指纹与归档原件一致，旁路模式不误当作启用节点", async () => {
  for (const expected of CASES) {
    const bytes = await readFile(new URL(`../workflows/effect-beautification/${expected.file}`, import.meta.url));
    const source = JSON.parse(bytes.toString("utf8"));
    const preset = effectBeautificationPreset({ intensity: expected.intensity, tone: expected.tone });
    assert.equal(preset.sourceSha256, createHash("sha256").update(bytes).digest("hex"));
    const sourceNode = (type) => {
      const matches = source.nodes.filter((node) => node.type === type);
      assert.equal(matches.length, 1);
      return matches[0];
    };
    assert.deepEqual(sourceNode("LoraLoaderModelOnly").widgets_values, [LORA, expected.lora]);
    assert.equal(sourceNode("Flux2Scheduler").widgets_values[0], expected.steps);
    assert.deepEqual(sourceNode("JHPixelProColorMatcher").widgets_values, ["ab", expected.color]);
    const brightness = sourceNode("LayerColor: Brightness & Contrast");
    assert.equal(brightness.mode, expected.brightness ? 0 : 4);
    if (expected.brightness) assert.deepEqual(brightness.widgets_values, Object.values(expected.brightness));
    const temperature = sourceNode("LayerColor: ColorTemperature");
    assert.equal(temperature.mode, expected.temperature === null ? 4 : 0);
    if (expected.temperature !== null) assert.equal(temperature.widgets_values[0], expected.temperature);
  }
});

test("Flux 触发词只追加一次，原提示词正文及其他模型的预设正文可独立保留", () => {
  assert.equal(composeFluxBeautificationPrompt("preserve colors"), "zhiganEnhance, preserve colors");
  assert.equal(composeFluxBeautificationPrompt("zhiganEnhance, preserve colors"), "zhiganEnhance, preserve colors");
  assert.equal(composeFluxBeautificationPrompt(composeFluxBeautificationPrompt("preserve colors")), "zhiganEnhance, preserve colors");
});

test("六套图保持有效连边，采样同时依赖 LoRA 模型与正负双参考条件", () => {
  for (const expected of CASES) {
    const { nodes, output } = stage({ intensity: expected.intensity, tone: expected.tone });
    assertGraphReferences(nodes, output);
    assert.equal(entriesOfType(nodes, "SaveImage").length, 0, "阶段必须交给工厂统一保存");
    const [loraId, lora] = onlyNode(nodes, "LoraLoaderModelOnly");
    assert.equal(lora.inputs.lora_name, LORA);
    assert.equal(lora.inputs.strength_model, expected.lora);
    const [, scheduler] = onlyNode(nodes, "Flux2Scheduler");
    assert.equal(scheduler.inputs.steps, expected.steps);
    const [, guider] = onlyNode(nodes, "CFGGuider");
    assert.deepEqual(guider.inputs.model, [loraId, 0]);
    assert.equal(guider.inputs.cfg, 1);
    const references = entriesOfType(nodes, "ReferenceLatent");
    assert.equal(references.length, 2);
    assert.equal(nodes[guider.inputs.positive[0]].class_type, "ReferenceLatent");
    assert.equal(nodes[guider.inputs.negative[0]].class_type, "ReferenceLatent");
    assert.notDeepEqual(guider.inputs.positive, guider.inputs.negative);
    assert.deepEqual(references[0][1].inputs.latent, references[1][1].inputs.latent);
    assert.equal(nodes[references[0][1].inputs.latent[0]].class_type, "VAEEncode");
    const [matcherId, matcher] = onlyNode(nodes, "JHPixelProColorMatcher");
    assert.equal(matcher.inputs.channels, "ab");
    assert.equal(matcher.inputs.strength, expected.color);
    assert.deepEqual(matcher.inputs.image_reference, [onlyNode(nodes, "ImagePadForOutpaint")[0], 0]);
    assert.equal(nodes[matcher.inputs.image_target[0]].class_type, "VAEDecode");
    let corrected = [matcherId, 0];
    const brightness = entriesOfType(nodes, "LayerColor: Brightness & Contrast");
    assert.equal(brightness.length, expected.brightness ? 1 : 0);
    if (expected.brightness) {
      for (const [name, value] of Object.entries(expected.brightness)) assert.equal(brightness[0][1].inputs[name], value);
      assert.deepEqual(brightness[0][1].inputs.image, corrected);
      corrected = [brightness[0][0], 0];
    }
    const temperature = entriesOfType(nodes, "LayerColor: ColorTemperature");
    assert.equal(temperature.length, expected.temperature === null ? 0 : 1);
    if (expected.temperature !== null) {
      assert.equal(temperature[0][1].inputs.temperature, expected.temperature);
      assert.deepEqual(temperature[0][1].inputs.image, corrected);
      corrected = [temperature[0][0], 0];
    }
    assert.deepEqual(onlyNode(nodes, "ImageCrop")[1].inputs.image, corrected);
  }
});

test("归档推理尺寸按可信原图和源画布舍入计算，补边尺寸与交付档位分开记录", () => {
  assert.deepEqual(effectBeautificationMetadata(), {});
  for (const [width, height, resizedWidth, resizedHeight, inferenceWidth, inferenceHeight] of [
    [4000, 2250, 1920, 1080, 1920, 1088],
    [720, 1080, 1280, 1920, 1280, 1920],
    [3840, 2041, 1920, 1020, 1920, 1024],
    [3840, 2043, 1920, 1022, 1920, 1024],
  ]) {
    const metadata = effectBeautificationMetadata({
      effect_beautification: { intensity: "high", tone: "warm" },
      effect_beautification_source: { width, height },
      width: 6144, height: 3456,
    });
    assert.equal(metadata.sourceWidth, width);
    assert.equal(metadata.sourceHeight, height);
    assert.equal(metadata.resizedWidth, resizedWidth);
    assert.equal(metadata.resizedHeight, resizedHeight);
    assert.equal(metadata.inferenceWidth, inferenceWidth);
    assert.equal(metadata.inferenceHeight, inferenceHeight);
    assert.equal(metadata.padRight, inferenceWidth - resizedWidth);
    assert.equal(metadata.padBottom, inferenceHeight - resizedHeight);
    assert.equal(metadata.effectBeautificationPresetKey, "high-warm");
    assert.equal(metadata.steps, 4);
    assert.equal(metadata.loraStrength, 0.7);
    assert.equal(metadata.brightnessContrast, null);
    assert.equal(metadata.temperature, -2);
  }
  for (const source of [undefined, { width: 0, height: 1080 }, { width: 1920.5, height: 1080 }]) {
    assert.throws(() => effectBeautificationMetadata({ effect_beautification: {}, effect_beautification_source: source }), (error) => error.statusCode === 400);
  }
});

test("推理保留 1920 上限和原比例，动态补齐 16 倍数后裁去补边，交付尺寸服从工作台档位", () => {
  for (const { width, height } of [{ width: 1024, height: 576 }, { width: 2048, height: 1152 }]) {
    const { nodes, output } = stage({ intensity: "low", tone: "natural" }, { width, height });
    const resizes = entriesOfType(nodes, "ImageResize+");
    const [resizeId, resize] = resizes.find(([, node]) => node.inputs.method === "keep proportion");
    assert.equal(resize.inputs.width, 1920);
    assert.equal(resize.inputs.height, 1920);
    assert.equal(resize.inputs.interpolation, "bicubic");
    const [padId, pad] = onlyNode(nodes, "ImagePadForOutpaint");
    assert.deepEqual(pad.inputs.image, [resizeId, 0]);
    assert.equal(pad.inputs.left, 0);
    assert.equal(pad.inputs.top, 0);
    assert.equal(pad.inputs.feathering, 0);
    for (const [side, slot] of [["right", 1], ["bottom", 2]]) {
      const math = nodes[pad.inputs[side][0]];
      assert.equal(math.class_type, "SimpleMath+");
      assert.deepEqual(math.inputs.a, [resizeId, slot]);
      assert.equal(math.inputs.value.replaceAll(" ", ""), "(16-(a%16))%16");
    }
    const [, encode] = onlyNode(nodes, "VAEEncode");
    assert.deepEqual(encode.inputs.pixels, [padId, 0]);
    const [cropId, crop] = onlyNode(nodes, "ImageCrop");
    assert.deepEqual(crop.inputs.width, [resizeId, 1]);
    assert.deepEqual(crop.inputs.height, [resizeId, 2]);
    assert.equal(crop.inputs.x, 0);
    assert.equal(crop.inputs.y, 0);
    const outputNode = nodes[output[0]];
    assert.equal(outputNode.class_type, "ImageResize+");
    assert.deepEqual(outputNode.inputs.image, [cropId, 0]);
    assert.equal(outputNode.inputs.width, width);
    assert.equal(outputNode.inputs.height, height);
    assert.equal(outputNode.inputs.method, "stretch");
  }
});

test("美化阶段原样接收空负向及显式自定义负向，均保留双参考链路", () => {
  for (const custom of [false, true]) {
    const { nodes } = stage({ intensity: "high", tone: "warm" }, { negativePrompt: custom ? "用户自定义负向" : "" });
    const [, guider] = onlyNode(nodes, "CFGGuider");
    const negativeReference = nodes[guider.inputs.negative[0]];
    const negative = nodes[negativeReference.inputs.conditioning[0]];
    assert.equal(negative.inputs.text, custom ? "用户自定义负向" : "");
    const positiveReference = nodes[guider.inputs.positive[0]];
    assert.equal(nodes[positiveReference.inputs.conditioning[0]].inputs.text, "zhiganEnhance, preserve material colors");
  }
});

test("统一归档覆盖美化真实 LoRA/后处理/源指纹，4K/6K 输出尺寸继续记录交付结果", () => {
  for (const expected of CASES) {
    for (const [resolution, width, height] of [["4K", 4096, 2304], ["6K", 6144, 3456]]) {
      const preset = effectBeautificationPreset({ intensity: expected.intensity, tone: expected.tone });
      const metadata = aiTextureWorkflowMetadata({
        artifactKey: "metadata-beautify-123", height: 1152, width: 2048, resolution, seed: 42,
        generationRequest: {
          effect_beautification: { intensity: expected.intensity, tone: expected.tone },
          effect_beautification_source: { width: 4000, height: 2250 },
          upscale_resolution: resolution, upscale_width: width, upscale_height: height,
        },
      });
      assert.equal(metadata.workflowId, EFFECT_BEAUTIFICATION_WORKFLOW.id);
      assert.equal(metadata.workflowVersion, EFFECT_BEAUTIFICATION_WORKFLOW.version);
      assert.equal(metadata.sourceFileName, expected.file);
      assert.equal(metadata.sourceSha256, preset.sourceSha256);
      assert.equal(metadata.maasParameterId, preset.maasParameterId);
      assert.equal(metadata.maasStrategyId, preset.maasStrategyId);
      assert.deepEqual(metadata.effectBeautification, { intensity: expected.intensity, tone: expected.tone });
      assert.equal(metadata.effectBeautificationPresetKey, `${expected.intensity}-${expected.tone}`);
      assert.equal(metadata.steps, expected.steps);
      assert.equal(metadata.lora, LORA);
      assert.equal(metadata.loraStrength, expected.lora);
      assert.equal(metadata.colorMatchChannels, "ab");
      assert.equal(metadata.colorMatchStrength, expected.color);
      assert.deepEqual(metadata.brightnessContrast, expected.brightness);
      assert.equal(metadata.temperature, expected.temperature);
      assert.equal(metadata.inferenceWidth, 1920);
      assert.equal(metadata.inferenceHeight, 1088);
      assert.equal(metadata.inferenceSize, "1920x1088");
      assert.equal(metadata.inferenceResolution, "1920-long-edge");
      assert.equal(metadata.padRight, 0);
      assert.equal(metadata.padBottom, 8);
      assert.equal(metadata.outputWidth, width);
      assert.equal(metadata.outputHeight, height);
      assert.equal(metadata.upscaleResolution, resolution);
    }
  }
  const ordinary = aiTextureWorkflowMetadata({ artifactKey: "metadata-normal-123", height: 576, width: 1024, resolution: "1K", seed: 42 });
  assert.equal(ordinary.workflowId, "ai-texture-enhancement");
  assert.equal(ordinary.steps, 7);
  assert.equal(ordinary.inferenceWidth, 1024);
  assert.equal(ordinary.inferenceHeight, 576);
  assert.equal(ordinary.outputWidth, 1024);
  assert.equal(ordinary.outputHeight, 576);
  for (const name of ["lora", "loraStrength", "colorMatchStrength", "sourceSha256", "effectBeautification", "padRight", "padBottom"]) {
    assert.ok(!Object.hasOwn(ordinary, name), `普通元信息不得混入 ${name}`);
  }
});

test("节点能力准入拒绝缺失 LoRA、枚举缺档与不兼容接口，旁路节点不阻断自然调", () => {
  const { nodes } = stage({ intensity: "high", tone: "cool" });
  const schema = {};
  for (const node of Object.values(nodes)) {
    const required = schema[node.class_type]?.input.required || {};
    for (const name of Object.keys(node.inputs)) required[name] = ["ANY"];
    schema[node.class_type] = { input: { required } };
  }
  schema.LoraLoaderModelOnly.input.required.lora_name = [[LORA]];
  assert.doesNotThrow(() => verifyEffectBeautificationCapabilities(schema, { intensity: "high", tone: "cool" }));
  const missingLora = structuredClone(schema);
  delete missingLora.LoraLoaderModelOnly;
  assert.throws(() => verifyEffectBeautificationCapabilities(missingLora), (error) => error.statusCode === 409 && error.code === "beautification_capability");
  const missingModel = structuredClone(schema);
  missingModel.LoraLoaderModelOnly.input.required.lora_name = [["other-lora.safetensors"]];
  assert.throws(() => verifyEffectBeautificationCapabilities(missingModel), /缺少配置项.*lora_name/);
  const changedInterface = structuredClone(schema);
  changedInterface.JHPixelProColorMatcher.input.required.new_required_input = ["IMAGE"];
  assert.throws(() => verifyEffectBeautificationCapabilities(changedInterface), /接口不兼容.*new_required_input/);
  const missingPort = structuredClone(schema);
  delete missingPort.JHPixelProColorMatcher.input.required.image_reference;
  assert.throws(() => verifyEffectBeautificationCapabilities(missingPort), /接口不兼容.*image_reference/);
  const naturalOnly = structuredClone(schema);
  delete naturalOnly["LayerColor: Brightness & Contrast"];
  delete naturalOnly["LayerColor: ColorTemperature"];
  assert.doesNotThrow(() => verifyEffectBeautificationCapabilities(naturalOnly, { intensity: "low", tone: "natural" }));
  assert.throws(() => verifyEffectBeautificationCapabilities(naturalOnly, { intensity: "low", tone: "warm" }), /缺少效果图美化节点/);
});

test("普通 Flux 与全景保持 7 步原链路，不引入美化 LoRA、调色或触发词", () => {
  for (const generationRequest of [undefined, { feature_mode: "panoramaEnhancement" }]) {
    const nodes = createAiTextureWorkflow({ artifactKey: "ordinary-flux-123", generationRequest, height: 576, imageBase64: "ordinary-image", prompt: "preserve original scene", seed: 42, width: 1024 });
    assert.equal(entriesOfType(nodes, "LoraLoaderModelOnly").length, 0);
    assert.equal(entriesOfType(nodes, "JHPixelProColorMatcher").length, 0);
    assert.equal(onlyNode(nodes, "Flux2Scheduler")[1].inputs.steps, 7);
    assert.equal(entriesOfType(nodes, "SaveImage").length, 1);
    assert.ok(!JSON.stringify(nodes).includes("zhiganEnhance"));
  }
});

test("美化 1K/2K 及 4K/6K 共享唯一 72 产物节点，高分辨率继续接现有攸行超分", () => {
  for (const [resolution, outputWidth, outputHeight] of [["1K", 1024, 576], ["2K", 2048, 1152], ["4K", 4096, 2304], ["6K", 6144, 3456]]) {
    const upscale = resolution === "4K" || resolution === "6K";
    const nodes = createAiTextureWorkflow({
      artifactKey: `beautify-${resolution}-123`,
      generationRequest: {
        effect_beautification: { intensity: "high", tone: "warm" },
        ...(upscale ? { upscale_resolution: resolution, upscale_width: outputWidth, upscale_height: outputHeight } : {}),
      },
      height: upscale ? 1152 : outputHeight,
      imageBase64: "test-image",
      prompt: "preserve scene",
      seed: 42,
      width: upscale ? 2048 : outputWidth,
    });
    assertGraphReferences(nodes, ["72", 0]);
    assert.deepEqual(entriesOfType(nodes, "SaveImage").map(([id]) => id), ["72"]);
    assert.equal(nodes["72"].inputs.filename_prefix, `CanvasLab_Flux2Klein_beautify-${resolution}-123`);
    assert.equal(entriesOfType(nodes, "LoraLoaderModelOnly").length, 1);
    assert.equal(Boolean(nodes["SeedVR2-Upscaler"]), upscale);
    if (upscale) assert.equal(nodes["72"].inputs.images[0], "SeedVR2-Upscaler");
    else assert.equal(nodes[nodes["72"].inputs.images[0]].class_type, "ImageResize+");
  }
});
