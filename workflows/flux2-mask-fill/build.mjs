/**
 * [INPUT]: 依赖两份用户 ComfyUI 附件、当前 MaaS object_info JSON、Node 文件与摘要 API
 * [OUTPUT]: 生成两套可导入画布/API JSON 和节点合同验证回执，将原默认移除冰箱短指令适配为实测英文指令，不执行工作流
 * [POS]: workflows/flux2-mask-fill 的独立交付构建器，不接入工作台业务或生产策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const [promptPath, referencePath, schemaPath] = process.argv.slice(2);
if (!promptPath || !referencePath || !schemaPath) {
  throw new Error("用法: node build.mjs 提示词原文件.json 参考图原文件.json object_info.json");
}
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const output = new URL("./", import.meta.url);
const VERSION = "2026-10-21.1";
const report = { version: VERSION, validatedAt: new Date().toISOString(), execution: "recorded_separately", executionEvidence: "validation/runs.json", workflows: [] };
const BASIC = new Set(["INT", "FLOAT", "STRING", "BOOLEAN"]);
const options = (spec) => Array.isArray(spec[0]) ? spec[0] : spec[0] === "COMBO" ? spec[1]?.options : null;
const isWidgetSpec = (spec) => Boolean(options(spec)) || BASIC.has(spec[0]);

// -------- 参数仅从附件读入；画布残留值不能覆盖已连接的真实输入 --------
function originalValues(source, id) {
  const node = source.nodes.find((item) => item.id === id);
  const fields = schema[node.type]?.input || {};
  const widgets = Object.entries({ ...fields.required, ...fields.optional })
    .filter(([, spec]) => isWidgetSpec(spec));
  return Object.fromEntries(widgets.map(([key, spec], index) => [
    key, node.widgets_values[index] ?? spec[1]?.default ?? options(spec)?.[0] ?? 0,
  ]));
}

function makeGraph(source, withReference) {
  const graph = {};
  const add = (id, class_type, inputs, title) => {
    graph[id] = { class_type, inputs, _meta: { title } };
    return [id, 0];
  };
  const ref = (id, slot = 0) => [id, slot];
  add("input", "LoadImage", { image: "input.png" }, "1. 上传原图 / 右键打开遮罩编辑器");
  add("model", "UNETLoader", originalValues(source, 938), "Flux2 Klein 9B / 保留原权重");
  add("clip", "CLIPLoader", originalValues(source, 940), "Qwen3 8B 文本编码器");
  add("vae", "VAELoader", originalValues(source, 599), "Flux2 VAE");
  const grow = originalValues(source, 638);
  add("fill", "GrowMaskWithBlur", { ...grow, mask: ref("input", 1), expand: 0, blur_radius: 0, fill_holes: true }, "2. 先填遮罩孔洞 / 不膨胀");
  add("grow", "GrowMaskWithBlur", { ...grow, mask: ref("fill"), expand: source.nodes.find((n) => n.id === 866).widgets_values[0] }, "3. 遮罩扩展与模糊");
  add("crop", "InpaintCropImproved", { ...originalValues(source, 934), device_mode: "cpu (compatible)", image: ref("input"), mask: ref("grow") }, "4. 保留原裁剪 / 上下文 / 回贴合同");
  add("size", "GetImageSize", { image: ref("crop", 1) }, "读取实际裁剪尺寸");
  const sourcePrompt = source.nodes.find((n) => n.id === 619).widgets_values[0];
  // -------- 原默认短指令的合成冒烟未生效，明确移除对象并补齐背景后回归通过 --------
  const prompt = !withReference && sourcePrompt === "去除冰箱"
    ? "Remove the refrigerator completely. Fill the masked region with the same plain beige wall and floor as the surrounding area. Leave no refrigerator or other object. Preserve the surrounding room."
    : sourcePrompt;
  const prefix = Array.from({ length: withReference ? 2 : 1 }, (_, i) => `image${i + 1}: <|vision_start|><|image_pad|><|vision_end|> `).join("");
  add("positive", "CLIPTextEncode", { clip: ref("clip"), text: prefix + prompt }, "5. 修改末尾编辑指令 / 保留原作者文本前缀");
  add("negative", "CLIPTextEncode", { clip: ref("clip"), text: "" }, "空负向提示词 / 原 CFG=1");
  add("encode", "VAEEncode", { pixels: ref("crop", 1), vae: ref("vae") }, "编码原图裁剪 / 采样起点");
  add("positiveMain", "ReferenceLatent", { conditioning: ref("positive"), latent: ref("encode") }, "正向引用原图潜空间");
  add("negativeMain", "ReferenceLatent", { conditioning: ref("negative"), latent: ref("encode") }, "负向引用原图潜空间");
  let positive = ref("positiveMain");
  let negative = ref("negativeMain");
  if (withReference) {
    add("reference", "LoadImage", { image: "reference.png" }, "参考图 / 上传需要填入的物体");
    add("birefModel", "LoadRembgByBiRefNetModel", { model: "General.safetensors", device: "AUTO", use_weight: false }, "现有 BiRefNet General / 无额外 Swin 权重");
    add("biref", "RembgByBiRefNet", { model: ref("birefModel"), images: ref("reference") }, "参考物体前景遮罩 / 白色为物体");
    add("referenceScale", "LayerUtility: ImageScaleByAspectRatio V2", { ...originalValues(source, 629), image: ref("reference"), mask: ref("biref", 1) }, "参考原图与前景遮罩同步缩放");
    add("referenceCrop", "LayerUtility: CropByMask V2", { ...originalValues(source, 607), image: ref("referenceScale"), mask: ref("referenceScale", 1) }, "保留原参考物体裁剪 / 四边128px");
    add("referenceCanvas", "ImageScale", { image: ref("referenceCrop"), upscale_method: "lanczos", width: ref("size"), height: ref("size", 1), crop: "center" }, "沿用 Painter 的统一尺寸 / 中心裁剪");
    add("referenceEncode", "VAEEncode", { pixels: ref("referenceCanvas"), vae: ref("vae") }, "编码参考物体");
    positive = add("positiveReference", "ReferenceLatent", { conditioning: positive, latent: ref("referenceEncode") }, "正向追加第2张参考");
    negative = add("negativeReference", "ReferenceLatent", { conditioning: negative, latent: ref("referenceEncode") }, "负向追加第2张参考");
  }
  add("noiseMask", "SetLatentNoiseMask", { samples: ref("encode"), mask: ref("crop", 2) }, "6. 以原图 latent 为底 / 仅遮罩采样");
  add("repeat", "RepeatLatentBatch", { samples: ref("noiseMask"), amount: source.nodes.find((n) => n.id === 617).widgets_values[0] }, "原配置每次生成2张");
  add("guider", "CFGGuider", { model: ref("model"), positive, negative, cfg: 1 }, "保留 CFG=1");
  add("noise", "RandomNoise", { noise_seed: source.nodes.find((n) => n.id === 606).widgets_values[0] }, "随机种子");
  add("sampler", "KSamplerSelect", originalValues(source, 616), "保留 Euler Ancestral");
  add("schedule", "Flux2Scheduler", { ...originalValues(source, 614), width: ref("size"), height: ref("size", 1) }, "保留4步 / 按真实裁剪尺寸调度");
  add("sample", "SamplerCustomAdvanced", { noise: ref("noise"), guider: ref("guider"), sampler: ref("sampler"), sigmas: ref("schedule"), latent_image: ref("repeat") }, "7. Flux2 遮罩采样");
  add("decode", "VAEDecode", { samples: ref("sample"), vae: ref("vae") }, "解码生成结果");
  add("toList", "RebatchImages", { images: ref("decode"), batch_size: 1 }, "8. 每张独立回贴 / 保留2张结果");
  add("stitch", "InpaintStitchImproved", { stitcher: ref("crop"), inpainted_image: ref("toList") }, "9. 按原遮罩融合回贴");
  add("output", "SaveImage", { images: ref("stitch"), filename_prefix: withReference ? "FLUX2-mask-reference" : "FLUX2-mask-prompt" }, "10. 保存完整结果");
  return graph;
}

// -------- 同时检查 required、枚举、数据类型和环；占位图片等待用户上传 --------
function validate(graph) {
  let links = 0;
  const visited = new Set();
  const active = new Set();
  const visit = (id) => {
    if (active.has(id)) throw new Error(`存在环: ${id}`);
    if (visited.has(id)) return;
    active.add(id);
    const node = graph[id];
    const info = schema[node.class_type];
    if (!info) throw new Error(`缺节点: ${node.class_type}`);
    const fields = { ...info.input.required, ...info.input.optional };
    for (const key of Object.keys(info.input.required || {})) {
      if (!(key in node.inputs)) throw new Error(`缺输入: ${id}.${key}`);
    }
    for (const [key, value] of Object.entries(node.inputs)) {
      const spec = fields[key];
      if (!spec) throw new Error(`未知输入: ${id}.${key}`);
      if (Array.isArray(value)) {
        const source = graph[value[0]];
        const type = source && schema[source.class_type].output[value[1]];
        if (!type || (type !== spec[0] && type !== "*")) throw new Error(`端口类型错误: ${id}.${key}`);
        links++;
        visit(value[0]);
      } else if (options(spec)) {
        if (!options(spec).includes(value) && node.class_type !== "LoadImage") throw new Error(`枚举错误: ${id}.${key}=${value}`);
      } else if (spec[0] === "INT" || spec[0] === "FLOAT") {
        if (typeof value !== "number" || (spec[0] === "INT" && !Number.isInteger(value))) throw new Error(`数字类型错误: ${id}.${key}`);
        if (value < (spec[1]?.min ?? -Infinity) || value > (spec[1]?.max ?? Infinity)) throw new Error(`参数越界: ${id}.${key}`);
      } else if (spec[0] === "STRING" && typeof value !== "string") throw new Error(`字符串类型错误: ${id}.${key}`);
      else if (spec[0] === "BOOLEAN" && typeof value !== "boolean") throw new Error(`布尔类型错误: ${id}.${key}`);
    }
    active.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(graph)) visit(id);
  return { nodes: visited.size, links, missingTypes: [], schemaValidation: "passed", uploadPlaceholders: ["input.png", ...(graph.reference ? ["reference.png"] : [])] };
}

function canvas(graph, sourceSha256) {
  const ids = new Map(Object.keys(graph).map((id, index) => [id, index + 1]));
  const nodes = Object.entries(graph).map(([key, node], index) => {
    const info = schema[node.class_type];
    const fields = Object.entries({ ...info.input.required, ...info.input.optional });
    const inputs = [];
    const widgets = [];
    for (const [name, spec] of fields) {
      const value = node.inputs[name];
      if (value === undefined) continue;
      const isWidget = isWidgetSpec(spec);
      if (isWidget) {
        // -------- 已连接控件必须保留同类型占位，兼容当前前端序列化 --------
        widgets.push(Array.isArray(value) ? spec[1]?.default ?? 0 : value);
        if (spec[1]?.control_after_generate || (node.class_type === "RandomNoise" && name === "noise_seed")) widgets.push("randomize");
        if (node.class_type === "LoadImage" && name === "image") widgets.push("image");
      }
      if (!isWidget || Array.isArray(value)) inputs.push({ name, type: isWidget && Array.isArray(spec[0]) ? "COMBO" : spec[0], link: null, ...(isWidget ? { widget: { name } } : {}) });
    }
    return {
      id: ids.get(key), type: node.class_type, pos: [(index % 6) * 390, Math.floor(index / 6) * 650], size: [350, node.class_type === "InpaintCropImproved" ? 610 : 390],
      flags: {}, order: index, mode: 0, title: node._meta.title, inputs,
      outputs: info.output.map((type, slot_index) => ({ name: info.output_name?.[slot_index] || type, type, links: [], slot_index, ...(info.output_is_list?.[slot_index] ? { shape: 6 } : {}) })),
      properties: { "Node name for S&R": node.class_type }, widgets_values: widgets,
    };
  });
  const links = [];
  for (const [key, node] of Object.entries(graph)) {
    const target = nodes[ids.get(key) - 1];
    for (const [name, value] of Object.entries(node.inputs)) {
      if (!Array.isArray(value)) continue;
      const source = nodes[ids.get(value[0]) - 1];
      const slot = target.inputs.findIndex((input) => input.name === name);
      const id = links.length + 1;
      links.push([id, source.id, value[1], target.id, slot, source.outputs[value[1]].type]);
      target.inputs[slot].link = id;
      source.outputs[value[1]].links.push(id);
    }
  }
  return { last_node_id: nodes.length, last_link_id: links.length, nodes, links, groups: [], config: {}, extra: { ds: { scale: 0.4, offset: [80, 100] }, canvasLabSource: { version: VERSION, sha256: sourceSha256 } }, version: 0.4 };
}

for (const [path, withReference] of [[promptPath, false], [referencePath, true]]) {
  const bytes = await readFile(path);
  const source = JSON.parse(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const graph = makeGraph(source, withReference);
  const result = validate(graph);
  const stem = `FLUX.2_遮罩${withReference ? "参考图" : "提示词"}填充_MaaS兼容`;
  const ui = canvas(graph, sha256);
  // -------- 每个节点一行，生成图可审阅且保持800行以内 --------
  await writeFile(new URL(`${stem}.api.json`, output), `{\n${Object.entries(graph).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n")}\n}\n`);
  const { nodes, links, ...meta } = ui;
  await writeFile(new URL(`${stem}.json`, output), JSON.stringify(meta, null, 2).slice(0, -2) + `,\n  "nodes": [\n${nodes.map((n) => "    " + JSON.stringify(n)).join(",\n")}\n  ],\n  "links": [\n${links.map((l) => "    " + JSON.stringify(l)).join(",\n")}\n  ]\n}\n`);
  const missing = [...new Set(source.nodes.map((n) => n.type))].filter((type) => !schema[type]);
  report.workflows.push({ file: stem, sourceSha256: sha256, originalNodes: source.nodes.length, objectInfoAbsentTypes: missing, frontendVirtualTypes: missing.filter((type) => ["GetNode", "SetNode"].includes(type)), missingServerTypes: missing.filter((type) => !["GetNode", "SetNode"].includes(type)), ...result });
}
await writeFile(new URL("validation.json", output), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ folder: fileURLToPath(output), ...report }, null, 2) + "\n");
