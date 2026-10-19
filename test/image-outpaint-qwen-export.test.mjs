/**
 * [INPUT]: 依赖 Qwen 运行图/独立导出工厂、已保存画布/API JSON 与 Node 文件读取
 * [OUTPUT]: 对外提供真源一致、统一推理/恢复目标/原遮罩回贴、双向端口/类型/槽位/无环、控件顺序及无图片/凭据/服务地址的离线交付验证
 * [POS]: test 的独立 ComfyUI 导出交付测试，不重写导出文件、不访问网络或 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { qwenOutpaintCanvas, standaloneQwenOutpaintGraph } from "../scripts/export-qwen-outpaint.mjs";
import { createQwenOutpaintWorkflow, QWEN_OUTPAINT_WORKFLOW } from "../src/image-outpaint-qwen.mjs";

const folder = new URL("../workflows/", import.meta.url);
const apiText = await readFile(new URL("Qwen-Image-Edit-2511-Outpaint.api.json", folder), "utf8");
const canvasText = await readFile(new URL("Qwen-Image-Edit-2511-Outpaint.json", folder), "utf8");
const api = JSON.parse(apiText);
const canvas = JSON.parse(canvasText);

// -------- ComfyUI 原生控件顺序：KSampler 随机策略和 LoadImage 上传项不进入 API --------
const widgetFields = {
  LoadImage: ["image", null],
  ImageScaleToTotalPixels: ["upscale_method", "megapixels", "resolution_steps"],
  UNETLoader: ["unet_name", "weight_dtype"],
  CLIPLoader: ["clip_name", "type", "device"],
  VAELoader: ["vae_name"],
  ModelSamplingAuraFlow: ["shift"],
  CFGNorm: ["strength", "pre_cfg"],
  LoraLoaderModelOnly: ["lora_name", "strength_model"],
  ImagePadForOutpaint: ["left", "top", "right", "bottom", "feathering"],
  TextEncodeQwenImageEditPlus: ["prompt"],
  ImageScale: ["upscale_method", "width", "height", "crop"],
  GetImageSize: [],
  MaskToImage: [],
  ImageToMask: ["channel"],
  VAEEncode: [],
  SetLatentNoiseMask: [],
  KSampler: ["seed", null, "steps", "cfg", "sampler_name", "scheduler", "denoise"],
  VAEDecode: [],
  ImageCompositeMasked: ["x", "y", "resize_source"],
  SaveImage: ["filename_prefix"],
};

function keyedCanvas() {
  const graph = standaloneQwenOutpaintGraph();
  const apiEntries = Object.entries(graph);
  return new Map(canvas.nodes.map((node) => {
    const entry = apiEntries[node.id - 1];
    assert.ok(entry, `画布节点 ${node.id} 必须映射 API 节点`);
    assert.equal(node.type, entry[1].class_type);
    return [entry[0], node];
  }));
}

test("两份保存产物与当前导出工厂完全一致，文件均保持可解析且少于 800 行", () => {
  const graph = standaloneQwenOutpaintGraph();
  assert.deepEqual(api, graph);
  assert.deepEqual(canvas, qwenOutpaintCanvas(graph));
  for (const text of [apiText, canvasText]) assert.ok(text.split("\n").length <= 800);
  assert.equal(canvas.extra.canvasLab.workflow, QWEN_OUTPAINT_WORKFLOW.key);
  assert.equal(canvas.extra.canvasLab.version, QWEN_OUTPAINT_WORKFLOW.version);
});

test("独立图仅增加原生上传和等比 16 对齐预处理，其余模型/采样/遮罩/合成沿用运行图", () => {
  const runtime = createQwenOutpaintWorkflow({
    artifactKey: "standalone-export", imageBase64: "", seed: 20261015, width: 1024, height: 768,
    generationRequest: { sourceWidth: 768, sourceHeight: 512, expansion: { left: 128, top: 128, right: 128, bottom: 128 } },
  });
  assert.equal(runtime.input.class_type, "easy loadImageBase64");
  assert.deepEqual(api.input, { class_type: "LoadImage", inputs: { image: "input.png" } });
  assert.equal(api.prepare.class_type, "ImageScaleToTotalPixels");
  assert.deepEqual(api.prepare.inputs, { image: ["input", 0], upscale_method: "lanczos", megapixels: 0.39, resolution_steps: 16 });
  assert.deepEqual(api.pad.inputs.image, ["prepare", 0]);
  assert.deepEqual(api.inference.inputs, { image: ["pad", 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 8 });
  assert.deepEqual(api.inferenceSize.inputs.image, ["inference", 0]);
  assert.deepEqual(api.inferenceMaskImage.inputs.width, ["inferenceSize", 0]);
  assert.deepEqual(api.inferenceMaskImage.inputs.height, ["inferenceSize", 1]);
  assert.deepEqual(api.outputSize.inputs.image, ["pad", 0]);
  assert.deepEqual(api.restore.inputs.width, ["outputSize", 0]);
  assert.deepEqual(api.restore.inputs.height, ["outputSize", 1]);
  const projected = structuredClone(api);
  projected.input = runtime.input;
  delete projected.prepare;
  projected.pad.inputs.image = ["input", 0];
  assert.deepEqual(projected, runtime);
  assert.ok(Object.values(api).every((node) => node.class_type !== "easy loadImageBase64"));
});

test("每条画布连线在源输出和目标输入双向登记且类型/槽位一致，无悬空引用", () => {
  const nodes = new Map(canvas.nodes.map((node) => [node.id, node]));
  const links = new Map(canvas.links.map((link) => [link[0], link]));
  assert.equal(nodes.size, canvas.nodes.length);
  assert.equal(links.size, canvas.links.length);
  assert.equal(canvas.last_node_id, Math.max(...nodes.keys()));
  assert.equal(canvas.last_link_id, Math.max(...links.keys()));
  for (const [id, sourceId, outputSlot, targetId, inputSlot, type] of canvas.links) {
    const source = nodes.get(sourceId);
    const target = nodes.get(targetId);
    assert.ok(source && target, `连线 ${id} 节点必须存在`);
    const output = source.outputs[outputSlot];
    const input = target.inputs[inputSlot];
    assert.ok(output && input, `连线 ${id} 端口必须存在`);
    assert.equal(output.slot_index, outputSlot);
    assert.equal(output.type, type);
    assert.equal(input.type, type);
    assert.equal(output.links.filter((value) => value === id).length, 1);
    assert.equal(input.link, id);
  }
  for (const node of canvas.nodes) {
    for (const [slot, input] of node.inputs.entries()) {
      if (input.link == null) continue;
      const link = links.get(input.link);
      assert.ok(link, `输入 ${node.id}.${slot} 不得引用缺失连线`);
      assert.deepEqual([link[3], link[4], link[5]], [node.id, slot, input.type]);
    }
    for (const [slot, output] of node.outputs.entries()) {
      for (const id of output.links || []) {
        const link = links.get(id);
        assert.ok(link, `输出 ${node.id}.${slot} 不得引用缺失连线`);
        assert.deepEqual([link[1], link[2], link[5]], [node.id, slot, output.type]);
      }
    }
  }
});

test("画布与 API 依赖一一映射并形成有向无环图，结果必须经过 mask 合成", () => {
  const keyed = keyedCanvas();
  const byId = new Map([...keyed].map(([key, node]) => [node.id, key]));
  const visited = new Set();
  const stack = new Set();
  function visit(key) {
    assert.equal(stack.has(key), false, `不得存在循环依赖：${key}`);
    if (visited.has(key)) return;
    stack.add(key);
    const node = keyed.get(key);
    for (const [name, value] of Object.entries(api[key].inputs)) {
      if (!Array.isArray(value)) continue;
      const targetSlot = node.inputs.findIndex((input) => input.name === name);
      assert.ok(targetSlot >= 0, `API 连线 ${key}.${name} 必须有画布输入端口`);
      const link = canvas.links.find((candidate) => candidate[0] === node.inputs[targetSlot].link);
      assert.ok(link, `API 连线 ${key}.${name} 不得在导出时丢失`);
      assert.deepEqual([byId.get(link[1]), link[2]], value);
      visit(value[0]);
    }
    stack.delete(key);
    visited.add(key);
  }
  for (const key of Object.keys(api)) visit(key);
  assert.equal(visited.size, Object.keys(api).length);
  assert.deepEqual(api.sample.inputs.latent_image, ["mask", 0]);
  assert.deepEqual(api.output.inputs.images, ["composite", 0]);
  assert.deepEqual(api.positive.inputs.image1, ["inference", 0]);
  assert.deepEqual(api.negative.inputs.image1, ["inference", 0]);
  assert.deepEqual(api.encode.inputs.pixels, ["inference", 0]);
  assert.deepEqual(api.mask.inputs.mask, ["inferenceMask", 0]);
  assert.deepEqual(api.composite.inputs.mask, ["pad", 1]);
  assert.deepEqual(api.composite.inputs.source, ["restore", 0]);
  assert.deepEqual(api.composite.inputs.destination, ["pad", 0]);
});

test("所有实际控件逐项匹配 API 标量，KSampler 随机策略不会错位覆盖步数", () => {
  for (const [key, node] of keyedCanvas()) {
    const fields = widgetFields[node.type];
    assert.ok(fields, `新增节点 ${node.type} 必须核对原生控件顺序`);
    assert.equal(node.widgets_values.length, fields.length, `${key} 控件数量必须匹配`);
    const covered = new Set();
    fields.forEach((field, index) => {
      if (field == null) return;
      if (Array.isArray(api[key].inputs[field])) {
        assert.equal(node.widgets_values[index], 0, `${key}.${field} 连线控件应保留数值占位`);
        const input = node.inputs.find((value) => value.name === field);
        assert.deepEqual(input.widget, { name: field }, `${key}.${field} 必须注册已转输入的控件`);
        assert.equal(input.type, "INT");
        assert.ok(input.link != null);
      } else assert.deepEqual(node.widgets_values[index], api[key].inputs[field], `${key}.${field} 控件值漂移`);
      covered.add(field);
    });
    for (const [field, value] of Object.entries(api[key].inputs)) {
      if (!Array.isArray(value)) assert.ok(covered.has(field), `${key}.${field} 标量不得丢失控件`);
    }
  }
  const sampler = keyedCanvas().get("sample");
  assert.deepEqual(sampler.widgets_values, [api.sample.inputs.seed, "randomize", 4, 1, "euler", "simple", 1]);
  assert.equal("control_after_generate" in api.sample.inputs, false);
  assert.deepEqual(keyedCanvas().get("input").widgets_values, ["input.png", "image"]);
});

test("交付 JSON 不含内嵌图片、密钥、服务地址或来源工作流私有信息", () => {
  for (const text of [apiText, canvasText]) {
    assert.doesNotMatch(text, /base64_data|data:image\/|https?:\/\/|Bearer\s|api[_-]?key|access[_-]?token|\.env|maasParameter|maasStrategy/i);
  }
  assert.equal(api.input.inputs.image, "input.png");
  assert.equal(api.output.inputs.filename_prefix, "CanvasLab_QwenOutpaint_standalone-export");
});
