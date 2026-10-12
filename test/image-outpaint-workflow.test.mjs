/**
 * [INPUT]: 依赖真实 MaaS 扩图工作流适配器、来源身份、几何规则与通用 ComfyUI 客户端选项
 * [OUTPUT]: 对外提供原图预处理取整、模型/采样链路保真、MaaS 传输替换、请求隔离与真实产物追溯测试
 * [POS]: test 的 AI 扩图执行图契约验证，不访问远端或提交 GPU 任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_OUTPAINT_CLIENT_OPTIONS,
  IMAGE_OUTPAINT_GEOMETRY,
  IMAGE_OUTPAINT_OUTPUT_NODE_ID,
  IMAGE_OUTPAINT_REQUIRED_MODELS,
  IMAGE_OUTPAINT_REQUIRED_NODES,
  IMAGE_OUTPAINT_WORKFLOW,
  assertImageOutpaintAlignedTarget,
  createImageOutpaintWorkflow,
  imageOutpaintArtifactPrefix,
  imageOutpaintPreparedDimensions,
  imageOutpaintWorkflowMetadata,
} from "../src/image-outpaint-workflow.mjs";

const expansion = { left: 16, top: 0, right: 16, bottom: 0 };
const options = {
  artifactKey: "outpaint-request-123",
  generationRequest: { expansion },
  height: 160,
  imageBase64: "aW1hZ2U=",
  seed: 42,
  width: 128,
};

test("扩图来源保持 prod_test 参数身份，策略 ID 仅作为截图线索", () => {
  assert.equal(IMAGE_OUTPAINT_WORKFLOW.maasParameterId, 1082);
  assert.equal(IMAGE_OUTPAINT_WORKFLOW.maasStrategyHint, 643);
  assert.equal(IMAGE_OUTPAINT_WORKFLOW.sourceStage, "prod_test");
  assert.equal(IMAGE_OUTPAINT_WORKFLOW.sourceSha256, "64684baf682a0a744a03c788928507859bc14160954751a6f3d78c626be47ce1");
  assert.equal(IMAGE_OUTPAINT_WORKFLOW.sourcePromptSha256, "2a68c653f0074da5a68324d0dbbdd2801b2b5792d955dca27765fedbd420d37f");
  assert.equal(IMAGE_OUTPAINT_CLIENT_OPTIONS.outputNodeId, IMAGE_OUTPAINT_OUTPUT_NODE_ID);
  assert.equal(IMAGE_OUTPAINT_CLIENT_OPTIONS.workflowFactory, createImageOutpaintWorkflow);
});

test("扩图预处理忠于短轴 int 截断后 32 对齐，包括浮点边界", () => {
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 1000, height: 751 }), { width: 1024, height: 768 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 97, height: 149 }), { width: 96, height: 160 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 149, height: 97 }), { width: 160, height: 128 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 32, height: 32 }), { width: 32, height: 32 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 2048, height: 2048 }), { width: 2048, height: 2048 });
  for (const value of [0, 31, 2049, 32.5, NaN, undefined]) {
    assert.throws(() => imageOutpaintPreparedDimensions({ width: value, height: 256 }), /32–2048/);
  }
});

test("扩图画布只接受 8 对齐，防止 VAE 内部裁切", () => {
  assert.equal(IMAGE_OUTPAINT_GEOMETRY.targetMultiple, 8);
  assert.deepEqual(assertImageOutpaintAlignedTarget({ width: 128, height: 160 }), { width: 128, height: 160 });
  for (const width of [0, -8, 129, 128.5, "128", NaN]) {
    assert.throws(() => assertImageOutpaintAlignedTarget({ width, height: 160 }), /8px/);
  }
  assert.throws(() => createImageOutpaintWorkflow({ ...options, height: 161 }), /8px/);
});

test("真实扩图图保留尺寸校验、32 像素 Lanczos crop 与 mask 连线", () => {
  const graph = createImageOutpaintWorkflow(options);
  assert.deepEqual(graph["check-size"], {
    class_type: "MaaSCheckImageSize",
    inputs: { min_width: 32, max_width: 2048, min_height: 32, max_height: 2048, image: ["input", 0] },
  });
  assert.deepEqual(graph.prepare.inputs, {
    aspect_ratio: "original", proportional_width: 1, proportional_height: 1,
    fit: "crop", method: "lanczos", round_to_multiple: "32",
    scale_to_side: "None", scale_to_length: 1024, background_color: "#000000",
    image: ["check-size", 0],
  });
  assert.deepEqual(graph.expand.inputs, {
    ...expansion, feathering: 30, image: ["prepare", 0], mask: ["prepare", 1],
  });
});

test("扩图保留 Janus 自动描述、Flux Fill OneReward 与原采样参数", () => {
  const graph = createImageOutpaintWorkflow({ ...options, generationRequest: { expansion, prompt: "不得覆盖原图", negative_prompt: "不得覆盖" } });
  assert.equal(graph["janus-model"].inputs.model_name, "deepseek-ai/Janus-Pro-1B");
  assert.deepEqual(graph.describe.inputs.image, ["prepare", 0]);
  assert.equal(graph.describe.inputs.seed, 298596445848600);
  assert.equal(graph.describe.inputs.temperature, 0.1);
  assert.equal(graph.describe.inputs.top_p, 0.95);
  assert.equal(graph.describe.inputs.max_new_tokens, 999);
  assert.match(graph.describe.inputs.question, /用于AI扩图（Outpainting）/);
  assert.deepEqual(graph["positive-encode"].inputs.text, ["describe", 0]);
  assert.equal(graph.model.inputs.unet_name, "flux1-fill-dev-OneReward-fp8.safetensors");
  assert.equal(graph.model.inputs.weight_dtype, "fp8_e4m3fn");
  assert.equal(graph.differential.inputs.strength, 1);
  assert.equal(graph.guidance.inputs.guidance, 30);
  assert.equal(graph.conditioning.inputs.noise_mask, false);
  assert.deepEqual(graph.conditioning.inputs.negative, ["negative", 0]);
  assert.equal(graph.sample.inputs.steps, 20);
  assert.equal(graph.sample.inputs.cfg, 1);
  assert.equal(graph.sample.inputs.sampler_name, "euler");
  assert.equal(graph.sample.inputs.scheduler, "normal");
  assert.equal(graph.sample.inputs.denoise, 1);
  assert.equal(graph.sample.inputs.seed, options.seed);
});

test("扩图适配只替换 MaaS 输入与报告，所有结果依赖闭合且逐请求隔离", () => {
  const graph = createImageOutpaintWorkflow(options);
  assert.equal(Object.keys(graph).length, 18);
  assert.deepEqual(graph.input, {
    class_type: "easy loadImageBase64",
    inputs: { base64_data: options.imageBase64, image_output: "Hide", save_prefix: "CanvasLab_Outpaint_Input_outpaint-request-123" },
  });
  assert.deepEqual(graph.output, {
    class_type: "SaveImage",
    inputs: { filename_prefix: imageOutpaintArtifactPrefix(options.artifactKey), images: ["decode", 0] },
  });
  for (const node of Object.values(graph)) {
    assert.ok(!["MaaSInputInt", "MaaSInputString", "MaaSUrlLoader", "MaaSReportImage", "easy showAnything"].includes(node.class_type));
    for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value)) assert.ok(graph[value[0]], `节点依赖 ${value[0]} 必须存在`);
    }
  }
  assert.ok(IMAGE_OUTPAINT_REQUIRED_NODES.includes("JanusImageUnderstanding"));
  assert.ok(IMAGE_OUTPAINT_REQUIRED_NODES.includes("LayerUtility: ImageScaleByAspectRatio V2"));
  assert.ok(IMAGE_OUTPAINT_REQUIRED_MODELS.some((model) => model.inputName === "unet_name" && model.value === graph.model.inputs.unet_name));
  graph.model.inputs.unet_name = "不得污染下一请求";
  const next = createImageOutpaintWorkflow({ ...options, artifactKey: "outpaint-request-456", seed: 456 });
  assert.equal(next.model.inputs.unet_name, "flux1-fill-dev-OneReward-fp8.safetensors");
  assert.equal(next.sample.inputs.seed, 456);
  assert.equal(next.output.inputs.filename_prefix, "CanvasLab_Outpaint_outpaint-request-456");
});

test("扩图工作流拒绝非法输入身份、边值与随机种子", () => {
  assert.throws(() => imageOutpaintArtifactPrefix("../wrong"), /产物键/);
  assert.throws(() => createImageOutpaintWorkflow({ ...options, seed: -1 }), /种子/);
  for (const left of [-1, 0.5, "16", 16385, undefined]) {
    assert.throws(() => createImageOutpaintWorkflow({ ...options, generationRequest: { expansion: { ...expansion, left } } }), /整数/);
  }
  assert.throws(() => createImageOutpaintWorkflow({ ...options, generationRequest: { expansion: { left: 0, top: 0, right: 0, bottom: 0 } } }), /至少扩展一边/);
  assert.throws(() => createImageOutpaintWorkflow({ ...options, generationRequest: { expansion: { left: 0, top: 0, right: 0, bottom: 0, extra: 1 } } }), /至少扩展一边/);
});

test("扩图元数据保留实际尺寸、请求目标与来源指纹，禁止尺寸兜底", () => {
  const metadata = imageOutpaintWorkflowMetadata({
    ...options,
    actualOutputHeight: 152,
    actualOutputWidth: 120,
    generationRequest: { expansion, sourceWidth: 97, sourceHeight: 149, preparedWidth: 96, preparedHeight: 160 },
    outputFilename: "CanvasLab_Outpaint_outpaint-request-123_00001_.png",
    outputSha256: "abc123",
    promptId: "prompt-123",
  });
  assert.equal(metadata.outputWidth, 120);
  assert.equal(metadata.outputHeight, 152);
  assert.equal(metadata.targetWidth, 128);
  assert.equal(metadata.targetHeight, 160);
  assert.equal(metadata.inputWidth, 97);
  assert.equal(metadata.preparedWidth, 96);
  assert.equal(metadata.outputSha256, "abc123");
  assert.equal(metadata.promptId, "prompt-123");
  assert.equal(metadata.sourceSha256, IMAGE_OUTPAINT_WORKFLOW.sourceSha256);
  const unknown = imageOutpaintWorkflowMetadata(options);
  assert.equal(unknown.outputWidth, undefined);
  assert.equal(unknown.outputHeight, undefined);
});
