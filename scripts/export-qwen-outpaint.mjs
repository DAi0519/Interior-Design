/**
 * [INPUT]: 依赖 Qwen Janus动态提示词原文直通/遮罩采样/整图恢复执行图真源、当前独立导入环境的2511 Lightning FP32文件、原生节点端口/控件描述与 Node 文件写入
 * [OUTPUT]: 生成支持文件打开或实体文件拖入的 ComfyUI 画布 JSON 及 LoadImage API JSON，独立图使用同版FP32 LoRA并兼容当前采样控件/图片输出，动态尺寸链接转为 INT 控件端口，不含地址、密钥或内嵌图片
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
  // -------- 独立导入环境已安装同版 FP32；工作台运行图继续使用自己的 BF16 合同 --------
  graph.lightning.inputs.lora_name = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-fp32.safetensors";
  graph.shift.inputs.sampling = "flow";
  return graph;
}

// -------- 只描述画布端口与控件顺序；采样/模型/Prompt 数值全部来自执行图 --------
const INTERFACES = {
  LoadImage: { inputs: {}, outputs: ["IMAGE", "MASK"], widgets: ["image", () => "image"] },
  ImageScaleToTotalPixels: { inputs: { image: "IMAGE" }, outputs: ["IMAGE"], widgets: ["upscale_method", "megapixels", "resolution_steps"] },
  GetImageSize: { inputs: { image: "IMAGE" }, outputs: ["INT", "INT", "INT"], outputNames: ["width", "height", "batch_size"], widgets: [] },
  MaskToImage: { inputs: { mask: "MASK" }, outputs: ["IMAGE"], widgets: [] },
  ImageScale: { inputs: { image: "IMAGE" }, outputs: ["IMAGE"], widgets: ["upscale_method", "width", "height", "crop"], widgetInputs: { width: "INT", height: "INT" } },
  ImageToMask: { inputs: { image: "IMAGE" }, outputs: ["MASK"], widgets: ["channel"] },
  JanusModelLoader: { inputs: {}, outputs: ["JANUS_MODEL", "JANUS_PROCESSOR"], outputNames: ["model", "processor"], widgets: ["model_name"] },
  JanusImageUnderstanding: { inputs: { model: "JANUS_MODEL", processor: "JANUS_PROCESSOR", image: "IMAGE" }, outputs: ["STRING"], outputNames: ["text"], widgets: ["question", "seed", () => "fixed", "temperature", "top_p", "max_new_tokens"] },
  SaveText: { inputs: { text: "STRING" }, outputs: ["STRING"], outputNames: ["text"], widgets: ["filename_prefix", "format"] },
  UNETLoader: { inputs: {}, outputs: ["MODEL"], widgets: ["unet_name", "weight_dtype"] },
  CLIPLoader: { inputs: {}, outputs: ["CLIP"], widgets: ["clip_name", "type", "device"] },
  VAELoader: { inputs: {}, outputs: ["VAE"], widgets: ["vae_name"] },
  ModelSamplingAuraFlow: { inputs: { model: "MODEL" }, outputs: ["MODEL"], widgets: ["shift", "sampling"] },
  CFGNorm: { inputs: { model: "MODEL" }, outputs: ["MODEL"], widgets: ["strength", "pre_cfg"] },
  LoraLoaderModelOnly: { inputs: { model: "MODEL" }, outputs: ["MODEL"], widgets: ["lora_name", "strength_model"] },
  ImagePadForOutpaint: { inputs: { image: "IMAGE" }, outputs: ["IMAGE", "MASK"], widgets: ["left", "top", "right", "bottom", "feathering"] },
  TextEncodeQwenImageEditPlus: { inputs: { clip: "CLIP", vae: "VAE", image1: "IMAGE", image2: "IMAGE", image3: "IMAGE" }, outputs: ["CONDITIONING"], widgets: ["prompt"], widgetInputs: { prompt: "STRING" } },
  VAEEncode: { inputs: { pixels: "IMAGE", vae: "VAE" }, outputs: ["LATENT"], widgets: [] },
  SetLatentNoiseMask: { inputs: { samples: "LATENT", mask: "MASK" }, outputs: ["LATENT"], widgets: [] },
  KSampler: { inputs: { model: "MODEL", positive: "CONDITIONING", negative: "CONDITIONING", latent_image: "LATENT" }, outputs: ["LATENT"], widgets: ["seed", () => "randomize", "steps", "cfg", "sampler_name", "scheduler", "denoise"] },
  VAEDecode: { inputs: { samples: "LATENT", vae: "VAE" }, outputs: ["IMAGE"], widgets: [] },
  SaveImage: { inputs: { images: "IMAGE" }, outputs: ["IMAGE"], outputNames: ["images"], widgets: ["filename_prefix"] },
};

const POSITIONS = {
  input: [0, 300], prepare: [350, 300], model: [0, -200], clip: [350, 900], vae: [350, 1200],
  shift: [350, -200], norm: [700, -200], lightning: [1050, -200], pad: [700, 300],
  inference: [1050, 300], inferenceSize: [1400, 650], maskImage: [1050, 1100],
  inferenceMaskImage: [1400, 950], inferenceMask: [1750, 950],
  positive: [1750, 230], negative: [1750, 600], encode: [1750, 1200], mask: [2100, 1000],
  sample: [2450, 230], decode: [2800, 230], outputSize: [2800, 600], restore: [3150, 230],
  output: [3500, 230],
  "janus-model": [0, 1500], describe: [350, 1500], "prompt-output": [700, 1500],
};
const TITLES = {
  input: "1. 上传原图", prepare: "2. 等比适配 / 16 像素对齐", pad: "3. 扩展画布 / 接缝融合",
  inference: "4. 统一到约 1MP 推理画布", inferenceSize: "读取推理画布尺寸", maskImage: "扩边遮罩转图像",
  inferenceMaskImage: "遮罩同步到推理尺寸", inferenceMask: "恢复推理遮罩", positive: "5. 扩图要求",
  negative: "负向条件（Lightning CFG=1）", mask: "仅扩展区与接缝参与采样", sample: "6. Qwen 2511 / Lightning 4 步",
  outputSize: "读取原始扩图目标尺寸", restore: "7. 整图恢复目标尺寸（Lanczos）", output: "8. 保存整图（不回贴原图）",
  "janus-model": "Janus-Pro-1B / 自动生成场景提示词", describe: "分析未扩边原图 / 英文扩图提示词",
  "prompt-output": "保存Janus实际提示词原文 / 回传归档",
};

export function qwenOutpaintCanvas(graph) {
  const entries = Object.entries(graph);
  const ids = new Map(entries.map(([key], index) => [key, index + 1]));
  const nodes = entries.map(([key, node], order) => {
    const spec = INTERFACES[node.class_type];
    if (!spec || !POSITIONS[key]) throw new Error(`导出节点缺少画布描述：${key} (${node.class_type})`);
    const widgetInputs = Object.entries(spec.widgetInputs || {}).filter(([field]) => Array.isArray(node.inputs[field]));
    return {
      id: ids.get(key), type: node.class_type, pos: POSITIONS[key], size: [320, ["describe", "positive", "negative"].includes(key) ? 360 : key === "sample" ? 460 : 240],
      flags: {}, order, mode: 0, title: TITLES[key] || node.class_type,
      inputs: [
        ...Object.entries(spec.inputs).map(([name, type]) => ({ name, type, link: null })),
        ...widgetInputs.map(([name, type]) => ({ name, type, link: null, widget: { name } })),
      ],
      outputs: spec.outputs.map((type, slot_index) => ({ name: spec.outputNames?.[slot_index] || type, type, links: [], slot_index })),
      properties: { "Node name for S&R": node.class_type },
      // -------- 已链接控件保留同类型占位，实际尺寸或正文由对应端口提供 --------
      widgets_values: spec.widgets.map((field) => typeof field === "function" ? field() : Array.isArray(node.inputs[field]) ? spec.widgetInputs?.[field] === "STRING" ? "" : 0 : node.inputs[field]),
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
