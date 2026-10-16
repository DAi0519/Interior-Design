/**
 * [INPUT]: 依赖 Qwen 扩图执行图真源、原生节点端口/控件描述与 Node 文件写入
 * [OUTPUT]: 生成可拖入 ComfyUI 的画布 JSON 及 LoadImage API JSON，不含服务地址、密钥或内嵌图片
 * [POS]: scripts 的独立工作流导出器，将运行真源投影为 workflows/ 中的人工可编辑交付物
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createQwenOutpaintWorkflow, QWEN_OUTPAINT_WORKFLOW } from "../src/image-outpaint-qwen.mjs";

// -------- 导出图用原生上传及等比 16 对齐预处理，运行图由服务端适配实际源图 --------
export function standaloneQwenOutpaintGraph() {
  const graph = createQwenOutpaintWorkflow({
    artifactKey: "standalone-export", imageBase64: "", seed: 20261015, width: 1024, height: 768,
    generationRequest: { sourceWidth: 768, sourceHeight: 512, expansion: { left: 128, top: 128, right: 128, bottom: 128 } },
  });
  graph.input = { class_type: "LoadImage", inputs: { image: "input.png" } };
  graph.prepare = { class_type: "ImageScaleToTotalPixels", inputs: { image: ["input", 0], upscale_method: "lanczos", megapixels: 0.39, resolution_steps: 16 } };
  graph.pad.inputs.image = ["prepare", 0];
  return graph;
}

// -------- 只描述画布端口与控件顺序；采样/模型/Prompt 数值全部来自执行图 --------
const INTERFACES = {
  LoadImage: { inputs: {}, outputs: ["IMAGE", "MASK"], widgets: ["image", () => "image"] },
  ImageScaleToTotalPixels: { inputs: { image: "IMAGE" }, outputs: ["IMAGE"], widgets: ["upscale_method", "megapixels", "resolution_steps"] },
  UNETLoader: { inputs: {}, outputs: ["MODEL"], widgets: ["unet_name", "weight_dtype"] },
  CLIPLoader: { inputs: {}, outputs: ["CLIP"], widgets: ["clip_name", "type", "device"] },
  VAELoader: { inputs: {}, outputs: ["VAE"], widgets: ["vae_name"] },
  ModelSamplingAuraFlow: { inputs: { model: "MODEL" }, outputs: ["MODEL"], widgets: ["shift"] },
  CFGNorm: { inputs: { model: "MODEL" }, outputs: ["MODEL"], widgets: ["strength", "pre_cfg"] },
  LoraLoaderModelOnly: { inputs: { model: "MODEL" }, outputs: ["MODEL"], widgets: ["lora_name", "strength_model"] },
  ImagePadForOutpaint: { inputs: { image: "IMAGE" }, outputs: ["IMAGE", "MASK"], widgets: ["left", "top", "right", "bottom", "feathering"] },
  TextEncodeQwenImageEditPlus: { inputs: { clip: "CLIP", vae: "VAE", image1: "IMAGE", image2: "IMAGE", image3: "IMAGE" }, outputs: ["CONDITIONING"], widgets: ["prompt"] },
  VAEEncode: { inputs: { pixels: "IMAGE", vae: "VAE" }, outputs: ["LATENT"], widgets: [] },
  SetLatentNoiseMask: { inputs: { samples: "LATENT", mask: "MASK" }, outputs: ["LATENT"], widgets: [] },
  KSampler: { inputs: { model: "MODEL", positive: "CONDITIONING", negative: "CONDITIONING", latent_image: "LATENT" }, outputs: ["LATENT"], widgets: ["seed", () => "randomize", "steps", "cfg", "sampler_name", "scheduler", "denoise"] },
  VAEDecode: { inputs: { samples: "LATENT", vae: "VAE" }, outputs: ["IMAGE"], widgets: [] },
  ImageCompositeMasked: { inputs: { destination: "IMAGE", source: "IMAGE", mask: "MASK" }, outputs: ["IMAGE"], widgets: ["x", "y", "resize_source"] },
  SaveImage: { inputs: { images: "IMAGE" }, outputs: ["IMAGE"], widgets: ["filename_prefix"] },
};

const POSITIONS = {
  input: [0, 300], prepare: [350, 300], model: [0, -200], clip: [350, 900], vae: [350, 1150],
  shift: [350, -200], norm: [700, -200], lightning: [1050, -200], pad: [700, 300],
  positive: [1080, 230], negative: [1080, 600], encode: [1080, 1030], mask: [1460, 1000],
  sample: [1510, 230], decode: [1880, 230], composite: [2240, 230], output: [2600, 230],
};
const TITLES = {
  input: "1. 上传原图", prepare: "2. 等比适配 / 16 像素对齐", pad: "3. 扩展画布 / 接缝融合",
  positive: "4. 扩图要求", negative: "负向条件（Lightning CFG=1）", mask: "仅扩展区与接缝参与采样",
  sample: "5. Qwen 2511 / Lightning 4 步", composite: "6. 合成 / 保留原图中心", output: "7. 保存结果",
};

export function qwenOutpaintCanvas(graph) {
  const entries = Object.entries(graph);
  const ids = new Map(entries.map(([key], index) => [key, index + 1]));
  const nodes = entries.map(([key, node], order) => {
    const spec = INTERFACES[node.class_type];
    return {
      id: ids.get(key), type: node.class_type, pos: POSITIONS[key], size: [320, key === "positive" || key === "negative" ? 300 : key === "sample" ? 460 : 240],
      flags: {}, order, mode: 0, title: TITLES[key] || node.class_type,
      inputs: Object.entries(spec.inputs).map(([name, type]) => ({ name, type, link: null })),
      outputs: spec.outputs.map((type, slot_index) => ({ name: type, type, links: [], slot_index })),
      properties: { "Node name for S&R": node.class_type },
      widgets_values: spec.widgets.map((field) => typeof field === "function" ? field() : node.inputs[field]),
    };
  });
  const links = [];
  for (const [key, node] of entries) {
    const target = nodes.find((candidate) => candidate.id === ids.get(key));
    for (const [field, value] of Object.entries(node.inputs)) {
      if (!Array.isArray(value)) continue;
      const source = nodes.find((candidate) => candidate.id === ids.get(value[0]));
      const slot = target.inputs.findIndex((input) => input.name === field);
      const output = source?.outputs[value[1]];
      if (!output || slot < 0 || output.type !== target.inputs[slot].type) throw new Error(`导出连接无效：${key}.${field}`);
      const id = links.length + 1;
      links.push([id, source.id, value[1], target.id, slot, output.type]);
      output.links.push(id);
      target.inputs[slot].link = id;
    }
  }
  return {
    last_node_id: nodes.length, last_link_id: links.length, nodes, links, groups: [], config: {},
    extra: { ds: { scale: 0.65, offset: [50, 280] }, canvasLab: { workflow: QWEN_OUTPAINT_WORKFLOW.key, version: QWEN_OUTPAINT_WORKFLOW.version } }, version: 0.4,
  };
}

export async function exportQwenOutpaint() {
  const folder = new URL("../workflows/", import.meta.url);
  await mkdir(folder, { recursive: true });
  const graph = standaloneQwenOutpaintGraph();
  for (const [file, value] of [
    ["Qwen-Image-Edit-2511-Outpaint.api.json", graph],
    ["Qwen-Image-Edit-2511-Outpaint.json", qwenOutpaintCanvas(graph)],
  ]) {
    // -------- 画布节点按行存储，连线可检视且生成文件保持在 800 行内 --------
    let json = JSON.stringify(value, null, 2);
    if (value.nodes) {
      const { nodes, links, ...metadata } = value;
      json = JSON.stringify(metadata, null, 2).slice(0, -2)
        + `,\n  "nodes": [\n    ${nodes.map((node) => JSON.stringify(node)).join(",\n    ")}\n  ],`
        + `\n  "links": [\n    ${links.map((link) => JSON.stringify(link)).join(",\n    ")}\n  ]\n}`;
    }
    await writeFile(new URL(file, folder), json + "\n");
  }
  return { folder: fileURLToPath(folder), nodes: Object.keys(graph).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await exportQwenOutpaint()));
