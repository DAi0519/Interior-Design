/**
 * [INPUT]: 依赖浏览器解码后的主图/参考图尺寸、指针与画布边界、遮罩PNG/归一化矩形或圈选轮廓和用户编辑参数
 * [OUTPUT]: 模型/遮罩/矩形/多边形准入、局部消除独立操作与版本合同、GPT参考模式可空指令与物品/材质用途归一化、共享蓝线与点数上限、圈选坐标归一化及互斥请求；GPT尺寸由服务端目录注入
 * [POS]: public 的二次编辑纯规则层，由画布与功能控制器共同消费，不访问DOM或网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const MASK_FILL_SELECTION_COLOR = "#3b82f6";
export const MASK_FILL_REMOVAL_PROMPT_VERSION = "2026-10-29.removal.1";
export function normalizeMaskFillOperation(value, mode) {
  if (value === undefined) return undefined;
  if (value !== "remove" || mode !== "prompt") throw new TypeError("局部消除操作仅支持提示词模式");
  return value;
}
export const MASK_FILL_MAX_SELECTION_POINTS = 2048;
export const MASK_FILL_IMAGE_POLICY = Object.freeze({
  accept: ["image/png", "image/jpeg", "image/webp"],
  maxBytesPerImage: 6 * 1024 * 1024,
  maxTotalBytes: 6 * 1024 * 1024,
  maxInputEdge: 4096,
});
export const MASK_FILL_MODES = Object.freeze({
  prompt: { key: "flux2MaskPrompt", label: "Flux2 提示词编辑", expand: 10 },
  reference: { key: "flux2MaskReference", label: "Flux2 参考图编辑", expand: 80 },
});
export const MASK_FILL_MODELS = Object.freeze([
  Object.freeze({ key: "flux2Klein", label: "Flux2 Klein 9B", provider: "comfyui" }),
  Object.freeze({ key: "gptImage25Sunburst", label: "GPT Image 2.5 Sunburst", provider: "oneapi" }),
  Object.freeze({ key: "qwenImageEdit2511", label: "Qwen Image Edit 2511", provider: "comfyui" }),
]);
export function maskFillModel(key = "flux2Klein") {
  const model = MASK_FILL_MODELS.find(entry => entry.key === key);
  if (!model) throw new TypeError("不支持的二次编辑模型");
  return model;
}
export const DEFAULT_MASK_FILL_PROMPT = "Remove the refrigerator completely. Fill the masked region with the same plain beige wall and floor as the surrounding area. Leave no refrigerator or other object. Preserve the surrounding room.";
export const MASK_FILL_INFERENCE_TIERS = Object.freeze([
  Object.freeze({ key: "2k", label: "2K", maxEdge: 2048 }),
  Object.freeze({ key: "4k", label: "4K", maxEdge: 4096 }),
  Object.freeze({ key: "original", label: "原图", maxEdge: null }),
]);
export const MASK_FILL_MAX_OUTPUT_EDGE = 2048;
export const MASK_FILL_GPT_RESOLUTIONS = Object.freeze(["1K", "2K", "4K"]);
export const MASK_FILL_GPT_OUTPUT_LIMITS = Object.freeze({ alignment: 16, maxOutputEdge: 3840,
  minOutputPixels: 655360, maxOutputPixels: 8294400, maxAspect: 3 });
export function maskFillGptResolution(value, legacyTier) {
  const resolution = value ?? legacyTier?.toUpperCase() ?? "1K";
  if (!MASK_FILL_GPT_RESOLUTIONS.includes(resolution)) throw new TypeError("GPT输出档位请选择1K、2K或4K");
  if (value !== undefined && legacyTier !== undefined && value !== legacyTier.toUpperCase()) throw new TypeError("GPT输出档位与旧推理参数冲突");
  return resolution;
}

export function maskFillGptOutputSize({ width, height }, resolution = "1K", sizes) {
  maskFillGptResolution(resolution);
  if (!(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0)) throw new TypeError("无法读取GPT原图尺寸");
  const aspect = width / height;
  if (Math.max(aspect, 1 / aspect) > MASK_FILL_GPT_OUTPUT_LIMITS.maxAspect) throw new TypeError("Sunburst局部重绘仅支持1:3至3:1的原图比例");
  const candidates = Object.entries(sizes || {});
  if (!candidates.length) throw new TypeError("GPT尺寸目录未更新，请重启当前工作台");
  const ratioOf = key => { const [w, h] = key.split(":").map(Number); return w / h; };
  const [ratio, mapping] = candidates.reduce((best, next) => Math.abs(Math.log(ratioOf(next[0]) / aspect))
    < Math.abs(Math.log(ratioOf(best[0]) / aspect)) ? next : best);
  const [presetWidth, presetHeight] = String(mapping[resolution]).split("x").map(Number);
  if (!presetWidth || !presetHeight) throw new TypeError("GPT尺寸目录缺少所选输出档位");
  if (Math.abs(Math.log(ratioOf(ratio) / aspect)) < 1e-8) return { width: presetWidth, height: presetHeight };
  // -------- 非预设比例沿最近比例的档位像素预算，保持原比例并适配16px网格 --------
  const { alignment, maxOutputEdge, minOutputPixels, maxOutputPixels, maxAspect } = MASK_FILL_GPT_OUTPUT_LIMITS;
  const scale = Math.min(Math.sqrt(presetWidth * presetHeight / (width * height)), maxOutputEdge / Math.max(width, height));
  let w = Math.max(alignment, Math.round(width * scale / alignment) * alignment);
  let h = Math.max(alignment, Math.round(height * scale / alignment) * alignment);
  if (w > h * maxAspect) h = Math.ceil(w / maxAspect / alignment) * alignment;
  if (h > w * maxAspect) w = Math.ceil(h / maxAspect / alignment) * alignment;
  while (w * h > maxOutputPixels) { if (w >= h) w -= alignment; else h -= alignment; }
  if (w * h < minOutputPixels || Math.max(w, h) > maxOutputEdge) throw new TypeError("GPT输出尺寸超出像素或边长限制");
  return { width: w, height: h };
}
export const QWEN_MASK_FILL_INFERENCE_TIERS = Object.freeze([Object.freeze({ key: "1mp", label: "约1MP · 4步", maxEdge: null })]);
export function maskFillInferenceTier(value, modelKey = "flux2Klein") {
  if (modelKey === "gptImage25Sunburst") {
    const resolution = maskFillGptResolution(undefined, value);
    return { key: resolution.toLowerCase(), label: resolution, maxEdge: null };
  }
  if (modelKey === "qwenImageEdit2511") {
    if (value !== undefined && value !== "1mp") throw new TypeError("Qwen二次编辑当前固定约1MP推理");
    return QWEN_MASK_FILL_INFERENCE_TIERS[0];
  }
  const tier = MASK_FILL_INFERENCE_TIERS.find(entry => entry.key === (value === undefined ? "2k" : value));
  if (!tier) throw new TypeError("推理档位请选择2K、4K或原图");
  return tier;
}

export function maskFillOutputSize({ width, height }) {
  const scale = Math.min(1, MASK_FILL_MAX_OUTPUT_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function maskFillInferenceSize({ width, height }, tierValue = "2k") {
  const tier = maskFillInferenceTier(tierValue);
  const maxEdge = tier.maxEdge ?? Math.max(width, height);
  const scale = maxEdge / Math.max(width, height);
  // -------- 模型裁剪按32对齐；最终回贴及输出仍沿用原图比例 --------
  const aligned = value => Math.max(64, Math.round(value * scale / 32) * 32);
  return { width: aligned(width), height: aligned(height), maxEdge, resize: tier.key !== "original" };
}
export const maskFillMode = value => value === "reference" ? "reference" : "prompt";
export const maskFillPromptOptional = (modelKey, mode) => modelKey === "gptImage25Sunburst" && mode === "reference";
export const MASK_FILL_REFERENCE_PURPOSES = Object.freeze([
  Object.freeze({ key: "object", label: "换物品" }),
  Object.freeze({ key: "material", label: "换材质" }),
]);
export function maskFillReferencePurpose(value, modelKey, mode) {
  if (!maskFillPromptOptional(modelKey, mode)) {
    if (value !== undefined) throw new TypeError("参考用途仅支持GPT参考图编辑模式");
    return null;
  }
  const purpose = value === undefined ? "object" : value;
  if (!MASK_FILL_REFERENCE_PURPOSES.some(entry => entry.key === purpose)) throw new TypeError("参考用途请选择换物品或换材质");
  return purpose;
}
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function maskCanvasPoint(event, bounds, width, height) {
  if (!(bounds.width > 0 && bounds.height > 0 && width > 0 && height > 0)) return null;
  return { x: clamp((event.clientX - bounds.left) * width / bounds.width, 0, width),
    y: clamp((event.clientY - bounds.top) * height / bounds.height, 0, height) };
}

export function normalizeMaskFillEditRegion(value) {
  if (value === null || value === undefined) return null;
  if (value.type === "polygon") {
    if (!Array.isArray(value.points) || value.points.length < 3 || value.points.length > MASK_FILL_MAX_SELECTION_POINTS) {
      throw new Error(`圈选区域需要3–${MASK_FILL_MAX_SELECTION_POINTS}个有效轮廓点`);
    }
    const points = [];
    for (const point of value.points) {
      if (!point || ![point.x, point.y].every(number => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 1)) {
        throw new Error("圈选轮廓点应为原图内0–1的归一化坐标");
      }
      const previous = points.at(-1);
      if (!previous || previous.x !== point.x || previous.y !== point.y) points.push({ x: point.x, y: point.y });
    }
    if (points.length > 1 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y) points.pop();
    const twiceArea = points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0);
    if (points.length < 3 || Math.abs(twiceArea) <= 1e-10) throw new Error("圈选区域需要形成有效的闭合轮廓");
    return { type: "polygon", points };
  }
  if (value.type !== undefined) throw new Error("编辑区域类型不支持");
  const { x, y, width, height } = value;
  const epsilon = 1e-9;
  if (![x, y, width, height].every(number => typeof number === "number" && Number.isFinite(number))
    || x < 0 || y < 0 || width <= 0 || height <= 0 || x >= 1 || y >= 1
    || x + width > 1 + epsilon || y + height > 1 + epsilon) {
    throw new Error("框选区域应为原图内的有效矩形");
  }
  return { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) };
}

export function maskBoxRegion(from, to, width, height) {
  if (!(width > 0 && height > 0) || !from || !to) return null;
  const x = clamp(Math.min(from.x, to.x), 0, width);
  const y = clamp(Math.min(from.y, to.y), 0, height);
  const right = clamp(Math.max(from.x, to.x), 0, width);
  const bottom = clamp(Math.max(from.y, to.y), 0, height);
  if (right <= x || bottom <= y) return null;
  return normalizeMaskFillEditRegion({ x: x / width, y: y / height,
    width: (right - x) / width, height: (bottom - y) / height });
}

export function maskLassoRegion(points, width, height) {
  if (!(width > 0 && height > 0) || !Array.isArray(points)) return null;
  try {
    return normalizeMaskFillEditRegion({ type: "polygon", points: points.map(point => ({
      x: clamp(point.x / width, 0, 1), y: clamp(point.y / height, 0, 1),
    })) });
  } catch { return null; }
}

export function maskFillImageIssue(image, subject = "原图") {
  if (!image?.dataUrl) return `请先上传1张${subject}`;
  if (image.size > MASK_FILL_IMAGE_POLICY.maxBytesPerImage) return `${subject}不能超过6MB`;
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1) return `${subject}尺寸读取失败，请重新上传`;
  if (Math.max(image.width, image.height) > MASK_FILL_IMAGE_POLICY.maxInputEdge) return `${subject}单边不能超过4096px`;
  return "";
}

const descriptor = ({ dataUrl, name, size, type }) => ({ dataUrl, name, size, type });

export function buildMaskFillJobRequest({ image, maskImage, editRegion, fillReferenceImage, fillReferencePurpose, mode, prompt, maskFillOperation,
  inferenceTier, outputResolution, quality = "medium", maskExpand, jobId, maskFillModel: modelKey = "flux2Klein" }) {
  const model = maskFillModel(modelKey);
  if (model.provider === "oneapi") outputResolution = maskFillGptResolution(outputResolution, inferenceTier);
  else inferenceTier = maskFillInferenceTier(inferenceTier, model.key).key;
  const selectedMode = maskFillMode(mode);
  const operation = normalizeMaskFillOperation(maskFillOperation, selectedMode);
  const referencePurpose = maskFillReferencePurpose(fillReferencePurpose, model.key, selectedMode);
  const issue = maskFillImageIssue(image) || (selectedMode === "reference"
    ? maskFillImageIssue(fillReferenceImage, "编辑参考图") : "");
  if (issue) throw new Error(issue);
  const region = normalizeMaskFillEditRegion(editRegion);
  const hasMask = Boolean(maskImage?.dataUrl);
  if (region && model.key !== "gptImage25Sunburst") throw new Error("当前模型不支持框选，请使用画笔涂抹编辑区域");
  if (region && hasMask) throw new Error("框选区域与遮罩不能同时提交");
  if (operation === "remove" && !region && !hasMask) throw new Error("请先框选、圈选或涂抹需要消除的物品");
  if (!hasMask && model.key !== "gptImage25Sunburst") throw new Error("请先在原图上涂抹需要编辑的区域");
  if (prompt !== undefined && typeof prompt !== "string") throw new Error("编辑指令必须是文本");
  const instruction = (prompt ?? "").trim();
  if (!instruction && !maskFillPromptOptional(model.key, selectedMode)) throw new Error("请填写明确的编辑指令");
  if (instruction.length > 8000) throw new Error("编辑指令不能超过8000字");
  const expand = maskExpand ?? MASK_FILL_MODES[selectedMode].expand;
  if (hasMask && (!Number.isInteger(Number(expand)) || Number(expand) < 0 || Number(expand) > 256)) throw new Error("遮罩扩展应为0–256的整数");
  return { jobId, featureMode: "imageMaskFill", batchId: null,
    sharedInput: { referenceImages: [descriptor(image)], ...(hasMask ? { maskImage: descriptor(maskImage) } : {}),
      ...(selectedMode === "reference" ? { fillReferenceImage: descriptor(fillReferenceImage) } : {}) },
    items: [{ key: model.key === "flux2Klein" ? MASK_FILL_MODES[selectedMode].key : `${model.key}-${selectedMode}`,
      label: model.key === "flux2Klein" ? MASK_FILL_MODES[selectedMode].label : `${model.label} · ${selectedMode === "prompt" ? "提示词编辑" : "参考图编辑"}`, provider: model.provider,
      input: { ...(model.key !== "flux2Klein" ? { maskFillModel: model.key } : {}),
        maskFillMode: selectedMode, prompt: instruction, ...(model.provider === "oneapi" ? { outputResolution, quality } : { inferenceTier }),
        ...(operation ? { maskFillOperation: operation } : {}),
        ...(referencePurpose ? { fillReferencePurpose: referencePurpose } : {}),
        ...(region ? { editRegion: region } : {}),
        ...(hasMask ? { maskExpand: Number(expand) } : {}) } }],
  };
}
