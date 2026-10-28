/**
 * [INPUT]: 依赖六份效果图美化源工作流的参数、SHA-256、MaaS 来源编号、已解析正负 Prompt、原图尺寸与工作台输出档；仅使用 ComfyUI 节点数据，不依赖网络或普通 Flux 工厂
 * [OUTPUT]: 对外提供六预设真源、幂等 LoRA 触发词拼接、1920 长边/右下补边/裁剪恢复的共享执行阶段、真实推理元信息与只读节点能力校验
 * [POS]: src 的效果图美化 Flux 专属执行边界，由普通 Flux 工厂挂接并复用既有 SaveImage 与 SeedVR2 收口；OneAPI 不消费本阶段
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const EFFECT_BEAUTIFICATION_WORKFLOW = Object.freeze({
  id: "effect-render-beautification",
  version: "2026-10-23.1",
  model: "flux-2-klein-9b-fp8.safetensors",
  lora: "flux/flux2_klein9B_zhiganEnhance_v1_000006000.safetensors",
  trigger: "zhiganEnhance",
  maxInferenceEdge: 1920,
});

// -- 六份原始画布的实际执行参数；mode=4 的节点以 null 表示旁路 ----------------
const PRESETS = Object.freeze({
  "low-natural": Object.freeze({
    steps: 2, loraStrength: 0.45, colorMatchStrength: 1,
    brightnessContrast: null, temperature: null,
    sourceFileName: "低增强-自然调.json",
    sourceSha256: "c04af0e4be2792b0d7193bb22fe8eb107caff0b1d03798a58a21858b0e6ef252",
    maasParameterId: 1114, maasStrategyId: 678,
  }),
  "low-warm": Object.freeze({
    steps: 2, loraStrength: 0.45, colorMatchStrength: 0.7,
    brightnessContrast: Object.freeze({ brightness: 0.97, contrast: 1.05, saturation: 1 }),
    temperature: -4,
    sourceFileName: "低增强-暖调.json",
    sourceSha256: "7b5d12986ea804f3864c47275ba26ea3c2d7d6b0e471feb9c3893f287a5c7f37",
    maasParameterId: 1115, maasStrategyId: 679,
  }),
  "low-cool": Object.freeze({
    steps: 2, loraStrength: 0.45, colorMatchStrength: 0.6,
    brightnessContrast: Object.freeze({ brightness: 0.92, contrast: 1.03, saturation: 1 }),
    temperature: 2,
    sourceFileName: "低增强-冷调.json",
    sourceSha256: "ce31b19955cf2da8ac430d85e12947cc5efea9ef3b28ee67dc5a340308234780",
    maasParameterId: 1116, maasStrategyId: 680,
  }),
  "high-natural": Object.freeze({
    steps: 4, loraStrength: 0.7, colorMatchStrength: 1,
    brightnessContrast: null, temperature: null,
    sourceFileName: "高增强-自然调.json",
    sourceSha256: "c890fb067cb9c71351cef9eb10bb6c331dc90be2fc4985b20de624bfbd281b74",
    maasParameterId: 1117, maasStrategyId: 681,
  }),
  "high-warm": Object.freeze({
    steps: 4, loraStrength: 0.7, colorMatchStrength: 0.5,
    brightnessContrast: null, temperature: -2,
    sourceFileName: "高增强-暖调.json",
    sourceSha256: "c25e1f503a4fedb1a0b506ca863c09dc013d4fdf21fd3750125ede68cb27d585",
    maasParameterId: 1118, maasStrategyId: 682,
  }),
  "high-cool": Object.freeze({
    steps: 4, loraStrength: 0.7, colorMatchStrength: 0.5,
    brightnessContrast: Object.freeze({ brightness: 0.97, contrast: 1.03, saturation: 1 }),
    temperature: 2,
    sourceFileName: "高增强-冷调.json",
    sourceSha256: "bb003074c6cf501f9f7612d8785d7b800593cc3f8b45a496f3c92433d2a7ae0d",
    maasParameterId: 1119, maasStrategyId: 683,
  }),
});

function inputError(message) {
  return Object.assign(new TypeError(message), { statusCode: 400 });
}

export function effectBeautificationPreset(selection = {}) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)
    || Object.keys(selection).some((key) => !["intensity", "tone"].includes(key))) {
    throw inputError("效果图美化预设参数不合法");
  }
  const intensity = selection.intensity ?? "low";
  const tone = selection.tone ?? "natural";
  if (!["low", "high"].includes(intensity)) throw inputError("效果图美化强度选项不合法");
  if (!["natural", "warm", "cool"].includes(tone)) throw inputError("效果图美化色调选项不合法");
  const key = `${intensity}-${tone}`;
  return { intensity, tone, key, ...PRESETS[key] };
}

export function composeFluxBeautificationPrompt(text) {
  const prompt = String(text || "").trim();
  if (/^zhiganEnhance(?:\s*,|\s*$)/i.test(prompt)) return prompt;
  return `${EFFECT_BEAUTIFICATION_WORKFLOW.trigger},${prompt ? ` ${prompt}` : ""}`;
}

// -- 源画布使用 Python round；保留恰好半像素时的偶数舍入 ---------------------
function roundImageDimension(value) {
  const integer = Math.floor(value);
  return value - integer === 0.5 ? integer + (integer % 2) : Math.round(value);
}

function inferenceDimensions(source = {}) {
  const { width, height } = source;
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw inputError("效果图美化缺少可信原图尺寸");
  }
  const ratio = EFFECT_BEAUTIFICATION_WORKFLOW.maxInferenceEdge / Math.max(width, height);
  const resizedWidth = roundImageDimension(width * ratio);
  const resizedHeight = roundImageDimension(height * ratio);
  if (!resizedWidth || !resizedHeight) throw inputError("效果图美化原图比例过于狭长");
  return {
    sourceWidth: width, sourceHeight: height,
    resizedWidth, resizedHeight,
    inferenceWidth: Math.ceil(resizedWidth / 16) * 16,
    inferenceHeight: Math.ceil(resizedHeight / 16) * 16,
    padRight: (16 - (resizedWidth % 16)) % 16,
    padBottom: (16 - (resizedHeight % 16)) % 16,
  };
}

export function effectBeautificationMetadata(generationRequest = {}) {
  if (!generationRequest.effect_beautification) return {};
  const preset = effectBeautificationPreset(generationRequest.effect_beautification);
  const dimensions = inferenceDimensions(generationRequest.effect_beautification_source);
  return {
    ...dimensions,
    inferenceResolution: "1920-long-edge",
    inferenceSize: `${dimensions.inferenceWidth}x${dimensions.inferenceHeight}`,
    workflowId: EFFECT_BEAUTIFICATION_WORKFLOW.id,
    workflowVersion: EFFECT_BEAUTIFICATION_WORKFLOW.version,
    model: EFFECT_BEAUTIFICATION_WORKFLOW.model,
    effectBeautification: { intensity: preset.intensity, tone: preset.tone },
    effectBeautificationPresetKey: preset.key,
    steps: preset.steps, sampler: "euler", cfg: 1,
    lora: EFFECT_BEAUTIFICATION_WORKFLOW.lora,
    loraStrength: preset.loraStrength,
    trigger: EFFECT_BEAUTIFICATION_WORKFLOW.trigger,
    colorMatchChannels: "ab", colorMatchStrength: preset.colorMatchStrength,
    brightnessContrast: preset.brightnessContrast, temperature: preset.temperature,
    maxInferenceEdge: EFFECT_BEAUTIFICATION_WORKFLOW.maxInferenceEdge,
    sourceFileName: preset.sourceFileName, sourceSha256: preset.sourceSha256,
    maasParameterId: preset.maasParameterId, maasStrategyId: preset.maasStrategyId,
    sourceWorkflowOutput: "restore-source-size",
    outputAdaptation: "workbench-resolution-tier",
  };
}

export function createEffectBeautificationStage({
  artifactKey, generationRequest, imageBase64, prompt, negativePrompt = "", seed, height, width,
}) {
  const preset = effectBeautificationPreset(generationRequest?.effect_beautification);
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw inputError("效果图美化输出尺寸不正确");
  }
  const nodes = {};
  const ref = (name, slot = 0) => [`EffectBeautification-${name}`, slot];
  const add = (name, class_type, inputs) => { nodes[ref(name)[0]] = { class_type, inputs }; };
  add("Input", "easy loadImageBase64", {
    base64_data: imageBase64, image_output: "Hide", save_prefix: `CanvasLab_Input_${artifactKey}`,
  });
  add("ResizeInference", "ImageResize+", {
    image: ref("Input"),
    width: EFFECT_BEAUTIFICATION_WORKFLOW.maxInferenceEdge,
    height: EFFECT_BEAUTIFICATION_WORKFLOW.maxInferenceEdge,
    interpolation: "bicubic", method: "keep proportion", condition: "always", multiple_of: 0,
  });
  add("PadRight", "SimpleMath+", { value: "(16 - (a % 16)) % 16", a: ref("ResizeInference", 1) });
  add("PadBottom", "SimpleMath+", { value: "(16 - (a % 16)) % 16", a: ref("ResizeInference", 2) });
  add("Pad", "ImagePadForOutpaint", {
    image: ref("ResizeInference"), left: 0, top: 0,
    right: ref("PadRight"), bottom: ref("PadBottom"), feathering: 0,
  });
  add("InferenceSize", "easy imageSize", { image: ref("Pad") });
  add("Model", "UNETLoader", {
    unet_name: EFFECT_BEAUTIFICATION_WORKFLOW.model, weight_dtype: "fp8_e4m3fn_fast",
  });
  add("Lora", "LoraLoaderModelOnly", {
    model: ref("Model"), lora_name: EFFECT_BEAUTIFICATION_WORKFLOW.lora, strength_model: preset.loraStrength,
  });
  add("Clip", "CLIPLoader", {
    clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2", device: "default",
  });
  add("Vae", "VAELoader", { vae_name: "flux2-vae.safetensors" });
  add("Encode", "VAEEncode", { pixels: ref("Pad"), vae: ref("Vae") });
  add("Positive", "CLIPTextEncode", { clip: ref("Clip"), text: composeFluxBeautificationPrompt(prompt) });
  add("Negative", "CLIPTextEncode", { clip: ref("Clip"), text: negativePrompt });
  add("PositiveReference", "ReferenceLatent", { conditioning: ref("Positive"), latent: ref("Encode") });
  add("NegativeReference", "ReferenceLatent", { conditioning: ref("Negative"), latent: ref("Encode") });
  add("Latent", "EmptyFlux2LatentImage", {
    width: ref("InferenceSize"), height: ref("InferenceSize", 1), batch_size: 1,
  });
  add("Guider", "CFGGuider", {
    model: ref("Lora"), positive: ref("PositiveReference"), negative: ref("NegativeReference"), cfg: 1,
  });
  add("Schedule", "Flux2Scheduler", {
    steps: preset.steps, width: ref("InferenceSize"), height: ref("InferenceSize", 1),
  });
  add("Noise", "RandomNoise", { noise_seed: seed });
  add("Sampler", "KSamplerSelect", { sampler_name: "euler" });
  add("Sample", "SamplerCustomAdvanced", {
    noise: ref("Noise"), guider: ref("Guider"), sampler: ref("Sampler"),
    sigmas: ref("Schedule"), latent_image: ref("Latent"),
  });
  add("Decode", "VAEDecode", { samples: ref("Sample"), vae: ref("Vae") });
  add("ColorMatch", "JHPixelProColorMatcher", {
    image_target: ref("Decode"), image_reference: ref("Pad"),
    channels: "ab", strength: preset.colorMatchStrength,
  });
  let corrected = ref("ColorMatch");
  if (preset.brightnessContrast) {
    add("BrightnessContrast", "LayerColor: Brightness & Contrast", {
      image: corrected, ...preset.brightnessContrast,
    });
    corrected = ref("BrightnessContrast");
  }
  if (preset.temperature !== null) {
    add("Temperature", "LayerColor: ColorTemperature", { image: corrected, temperature: preset.temperature });
    corrected = ref("Temperature");
  }
  add("Crop", "ImageCrop", {
    image: corrected, width: ref("ResizeInference", 1), height: ref("ResizeInference", 2), x: 0, y: 0,
  });
  add("ResizeOutput", "ImageResize+", {
    image: ref("Crop"), width, height,
    interpolation: "bicubic", method: "stretch", condition: "always", multiple_of: 0,
  });
  return { nodes, output: ref("ResizeOutput") };
}

export const EFFECT_BEAUTIFICATION_REQUIRED_NODES = Object.freeze([
  "easy loadImageBase64", "ImageResize+", "SimpleMath+", "ImagePadForOutpaint", "easy imageSize",
  "UNETLoader", "LoraLoaderModelOnly", "CLIPLoader", "VAELoader", "VAEEncode", "CLIPTextEncode",
  "ReferenceLatent", "EmptyFlux2LatentImage", "CFGGuider", "Flux2Scheduler", "RandomNoise",
  "KSamplerSelect", "SamplerCustomAdvanced", "VAEDecode", "JHPixelProColorMatcher",
  "LayerColor: Brightness & Contrast", "LayerColor: ColorTemperature", "ImageCrop",
]);

// -- 只读准入：按实际启用预设核对节点接口及底模/LoRA/采样器枚举 ---------------
export function verifyEffectBeautificationCapabilities(objectInfo = {}, selection = {}) {
  const { nodes } = createEffectBeautificationStage({
    artifactKey: "capability-check", generationRequest: { effect_beautification: selection },
    imageBase64: "", prompt: "capability check", negativePrompt: "", seed: 4, width: 1920, height: 1080,
  });
  const fail = (message) => {
    throw Object.assign(new Error(message), { statusCode: 409, code: "beautification_capability" });
  };
  for (const node of Object.values(nodes)) {
    const schema = objectInfo?.[node.class_type]?.input;
    if (!schema) fail(`缺少效果图美化节点：${node.class_type}`);
    for (const field of Object.keys(schema.required || {})) {
      if (!(field in node.inputs)) fail(`效果图美化节点接口不兼容：${node.class_type}.${field}`);
    }
    for (const [field, value] of Object.entries(node.inputs)) {
      const specification = schema.required?.[field] || schema.optional?.[field];
      if (!specification) fail(`效果图美化节点接口不兼容：${node.class_type}.${field}`);
      if (Array.isArray(value)) continue;
      const choices = Array.isArray(specification[0]) ? specification[0]
        : specification[0] === "COMBO" ? specification[1]?.options : null;
      if (choices && !choices.includes(value)) {
        fail(`效果图美化节点缺少配置项：${node.class_type}.${field} = ${value}`);
      }
    }
  }
}
