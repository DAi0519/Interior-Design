/**
 * [INPUT]: 依赖 Benchmark 标识哈希、场景融合/出图模型目录与浏览器提交的实验草稿
 * [OUTPUT]: 对外提供任意质量配置作为唯一实验因子的草稿规范化、因子阶段推导、跨 Provider 智能分辨率、冻结配置生成、输出规格解析及稳定配置一致性校验
 * [POS]: src 的 Benchmark 实验配置领域层，隔离前端草稿、Runner 计划与 Base 配置记录格式
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { publicAgentModelCatalog } from "./agent-model-config.mjs";
import { sha256 } from "./benchmark-identifiers.mjs";
import { publicModelCatalog } from "./model-config.mjs";

export const EXPERIMENT_VARIABLE_KEYS = [
  "style-dna",
  "prompt-version",
  "fusion-model",
  "image-model",
  "ratio",
  "resolution",
  "output-format",
  "quality",
];

const PROMPT_STAGE_VARIABLES = new Set(["style-dna", "prompt-version", "fusion-model"]);
function configError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw configError(`${field} 不能为空`);
  return normalized;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw configError(`${field} 必须是正整数`);
  }
  return number;
}

function catalogEntry(catalog, key, field) {
  const entry = catalog.find((item) => item.key === key);
  if (!entry) throw configError(`${field} 不在本地模型目录：${key}`);
  return entry;
}

function promptAgentEntry(value) {
  const normalized = requiredText(value, "Prompt 版本");
  const match = normalized.match(/^(.+)@v(\d+)$/);
  if (!match) throw configError("Prompt 版本必须使用 code@vN");
  return { code: match[1], version: positiveInteger(match[2], "Prompt 版本") };
}

function resolutionForModel(model, draft) {
  if (draft.resolution !== "adaptive") return draft.resolution;
  return model.defaultResolution;
}

function outputSpec(model, draft) {
  const ratio = draft.ratioMode === "source"
    ? "跟随原图比例"
    : requiredText(draft.ratio, "输出比例");
  const quality = String(draft.quality || "medium").toLowerCase();
  const modelResolution = resolutionForModel(model, draft);
  const resolution = modelResolution === "source" ? "原图尺寸" : modelResolution;
  return `${ratio} · ${resolution} · ${draft.outputFormat.toUpperCase()} · 质量 ${quality}`;
}

function validateOutputForModel(model, draft) {
  if (!model.formats.includes(draft.outputFormat)) {
    throw configError(`${model.label} 不支持 ${draft.outputFormat.toUpperCase()} 格式`);
  }
  const ratios = draft.ratioMode === "source"
    ? Object.keys(model.sizes)
    : [draft.ratio];
  if (ratios.some((ratio) => !model.sizes[ratio])) {
    throw configError(`${model.label} 不支持 ${draft.ratio} 画幅`);
  }
  const resolution = resolutionForModel(model, draft);
  if (ratios.some((ratio) => !model.sizes[ratio][resolution])) {
    throw configError(`${model.label} 在当前画幅下不支持 ${resolution}`);
  }
  if (model.qualityOptions.length && !model.qualityOptions.includes(draft.quality)) {
    throw configError(`${model.label} 不支持 ${draft.quality} 质量档`);
  }
  if (!model.qualityOptions.length && draft.quality !== "medium") {
    throw configError(`${model.label} 不支持质量档变量`);
  }
}

export function parseBenchmarkOutputSpec(value) {
  const normalized = String(value || "").trim();
  const resolution = normalized.includes("原图尺寸")
    ? "source"
    : normalized.match(/\b(512|[1-4]K)\b/i)?.[1]?.toUpperCase();
  const format = normalized.match(/\b(PNG|JPE?G|WEBP)\b/i)?.[1]?.toLowerCase();
  const ratio = normalized.match(/\b(1:1|1:4|1:8|2:3|3:2|3:4|4:1|4:3|4:5|5:4|8:1|9:16|16:9|21:9)\b/)?.[1] || null;
  const quality = normalized.match(/质量\s*(auto|low|medium|high)/i)?.[1]?.toLowerCase() || "medium";
  if (!resolution || !format) {
    throw configError(`无法解析输出规格：${normalized || "空"}`);
  }
  return {
    outputFormat: format === "jpg" ? "jpeg" : format,
    quality,
    ratio,
    resolution,
    sourceNearest: normalized.includes("跟随原图比例"),
  };
}

export function compatibleBenchmarkGroupOutput(configs) {
  const policyKeys = new Set(configs.map((config) => JSON.stringify({
    outputFormat: config.output.outputFormat,
    quality: config.output.quality,
    ratio: config.output.ratio,
    sourceNearest: config.output.sourceNearest,
  })));
  if (policyKeys.size !== 1) {
    throw configError("同一横评组的输出策略必须完全一致");
  }
  const resolutions = new Set();
  for (const config of configs) {
    resolutions.add(config.output.resolution);
  }
  if (resolutions.size > 1) {
    throw configError("同一横评组的分辨率必须完全一致");
  }
  const output = JSON.parse([...policyKeys][0]);
  return {
    ...output,
    resolution: configs[0].output.resolution,
  };
}

export function benchmarkVariableStage(variableKey) {
  return PROMPT_STAGE_VARIABLES.has(variableKey) ? "prompt" : "image";
}

export function inferBenchmarkVariable(configs) {
  if (!configs.length) throw configError("实验至少需要一个候选配置");
  const outputFor = (config) => config.output || parseBenchmarkOutputSpec(config.outputSpec);
  const fields = {
    "style-dna": (config) => String(config.styleDna),
    "prompt-version": (config) => String(config.fusionAgent),
    "fusion-model": (config) => String(config.fusionModel),
    "image-model": (config) => String(config.imageModel),
    ratio: (config) => JSON.stringify({ ratio: outputFor(config).ratio, sourceNearest: outputFor(config).sourceNearest }),
    resolution: (config) => String(outputFor(config).resolution),
    "output-format": (config) => String(outputFor(config).outputFormat),
    quality: (config) => String(outputFor(config).quality),
  };
  let varying = Object.entries(fields)
    .filter(([, getter]) => new Set(configs.map(getter)).size > 1)
    .map(([key]) => key);
  if (varying.includes("image-model")) {
    varying = varying.filter((key) => key !== "resolution");
  }
  if (varying.length > 1) {
    throw configError(`同一实验只能改变一个配置项，当前同时变化：${varying.join("、")}`);
  }
  return varying[0] || "image-model";
}

export function normalizeExperimentDraft(input) {
  const raw = input?.draftConfig;
  if (!raw) return null;
  const groupId = requiredText(input.experimentId, "实验 ID");
  const legacyVariable = raw.variableType === "prompt-version" ? "prompt-version" : "image-model";
  const variableKey = EXPERIMENT_VARIABLE_KEYS.includes(raw.variableKey)
    ? raw.variableKey
    : legacyVariable;
  const legacyPromptAgent = raw.agentCode && raw.agentVersion
    ? `${raw.agentCode}@v${raw.agentVersion}`
    : "";
  const modelCatalog = publicModelCatalog();
  const agentCatalog = publicAgentModelCatalog();
  const fixedPromptAgent = raw.promptAgentKey || legacyPromptAgent || raw.promptAgentKeys?.[0];
  const fixedImageModel = raw.imageModelKey || raw.imageModelKeys?.[0];
  let variantValues = Array.isArray(raw.variantValues) ? raw.variantValues : [];
  if (!variantValues.length && variableKey === "prompt-version") variantValues = raw.promptAgentKeys || [];
  if (!variantValues.length && variableKey === "image-model") variantValues = raw.imageModelKeys || [];
  variantValues = [...new Set(variantValues.map((value) => String(value || "").trim()).filter(Boolean))];
  if (variableKey !== "image-model" && new Set(raw.imageModelKeys || []).size > 1) {
    throw configError("非出图模型实验必须固定一个出图模型");
  }
  const explicitGeneralVariable = Boolean(raw.variableKey || raw.variantValues);
  if (variantValues.length < 2 && (explicitGeneralVariable || variableKey === "prompt-version")) {
    throw configError("实验因子至少选择两个候选值");
  }
  if (!variantValues.length) throw configError("实验因子没有候选值");

  const base = {
    fusionModelKey: requiredText(raw.fusionModelKey, "融合基模"),
    imageModelKey: requiredText(fixedImageModel, "出图模型"),
    outputFormat: requiredText(raw.outputFormat, "输出格式").toLowerCase(),
    promptAgentKey: requiredText(fixedPromptAgent, "Prompt 版本"),
    quality: String(raw.quality || "medium").toLowerCase(),
    ratioValue: raw.ratioMode === "preset" ? requiredText(raw.ratio, "输出比例") : "source",
    resolution: requiredText(raw.resolution, "分辨率"),
    styleCode: requiredText(raw.styleCode, "Style DNA"),
  };
  const treatments = variantValues.map((value) => {
    const treatment = { ...base, [({
      "style-dna": "styleCode",
      "prompt-version": "promptAgentKey",
      "fusion-model": "fusionModelKey",
      "image-model": "imageModelKey",
      ratio: "ratioValue",
      resolution: "resolution",
      "output-format": "outputFormat",
      quality: "quality",
    })[variableKey]]: value };
    if (!/^.+@v\d+$/.test(treatment.styleCode)) throw configError("Style DNA 必须使用 code@vN");
    const agent = promptAgentEntry(treatment.promptAgentKey);
    const fusionModel = catalogEntry(agentCatalog, treatment.fusionModelKey, "融合基模");
    if (!fusionModel.imageInput) throw configError(`${fusionModel.label} 不支持白模图片输入`);
    const model = catalogEntry(modelCatalog, treatment.imageModelKey, "出图模型");
    const normalized = {
      agent,
      fusionModel,
      model,
      outputFormat: treatment.outputFormat.toLowerCase(),
      quality: treatment.quality.toLowerCase(),
      ratio: treatment.ratioValue === "source" ? "" : treatment.ratioValue,
      ratioMode: treatment.ratioValue === "source" ? "source" : "preset",
      resolution: ["adaptive", "source"].includes(treatment.resolution.toLowerCase())
        ? treatment.resolution.toLowerCase()
        : treatment.resolution.toUpperCase(),
      styleCode: treatment.styleCode,
      value,
    };
    validateOutputForModel(model, normalized);
    return normalized;
  });
  if (variableKey === "prompt-version" && new Set(treatments.map((item) => item.agent.code)).size !== 1) {
    throw configError("Prompt 版本实验只能比较同一个 Agent 的不同版本");
  }
  const perBatchImages = positiveInteger(raw.perBatchImages, "每候选每批出图数");
  const promptBatches = positiveInteger(raw.promptBatches, "提示词批次数");
  const first = treatments[0];
  const sharedFrozen = {
    fusionModelId: first.fusionModel.id,
    imageModelIds: treatments.map((item) => item.model.id).sort(),
    outputFormat: first.outputFormat,
    perBatchImages,
    promptBatches,
    quality: first.quality,
    ratio: first.ratioMode === "source" ? "source" : first.ratio,
    resolution: first.resolution,
    styleCode: first.styleCode,
  };
  const frozen = variableKey === "image-model"
    ? { agentCode: first.agent.code, agentVersion: first.agent.version, ...sharedFrozen }
    : {
        fixed: base,
        perBatchImages,
        promptBatches,
        variableKey,
        variantValues: [...variantValues].sort(),
      };
  const configHash = sha256(JSON.stringify(frozen));
  const configs = treatments.map((treatment) => ({
    configId: `CFG-${sha256(variableKey === "image-model"
      ? `${groupId}:${configHash}:${treatment.model.id}`
      : `${groupId}:${configHash}:${variableKey}:${treatment.value}`).slice(0, 12).toUpperCase()}`,
    enabled: true,
    fusionAgent: `白模渲染融合 Agent [${treatment.agent.code}@v${treatment.agent.version}]`,
    fusionModel: `${treatment.fusionModel.label} [${treatment.fusionModel.id}]`,
    groupId,
    imageModel: `${treatment.model.label} [${treatment.model.id}]`,
    imageModelLabel: treatment.model.label,
    outputSpec: outputSpec(treatment.model, treatment),
    perBatchImages,
    promptBatches,
    recordId: null,
    styleDna: `Style DNA [${treatment.styleCode}]`,
  }));
  return {
    configHash,
    configIds: configs.map((config) => config.configId),
    configs,
    frozen,
    groupId,
    variableKey,
    variableStage: benchmarkVariableStage(variableKey),
    variableType: variableKey,
  };
}

export function generationConfigsMatch(left, right) {
  const stableResource = (value) => {
    const text = String(value || "").trim();
    return text.match(/\[([^\]]+)\]\s*$/)?.[1] || text;
  };
  const stableOutput = (value) => {
    try {
      return JSON.stringify(parseBenchmarkOutputSpec(value));
    } catch {
      return String(value || "").trim();
    }
  };
  return String(left?.configId || "") === String(right?.configId || "")
    && String(left?.groupId || "") === String(right?.groupId || "")
    && stableResource(left?.fusionAgent) === stableResource(right?.fusionAgent)
    && stableResource(left?.fusionModel) === stableResource(right?.fusionModel)
    && stableResource(left?.imageModel) === stableResource(right?.imageModel)
    && stableResource(left?.styleDna) === stableResource(right?.styleDna)
    && stableOutput(left?.outputSpec) === stableOutput(right?.outputSpec)
    && Number(left?.perBatchImages) === Number(right?.perBatchImages)
    && Number(left?.promptBatches) === Number(right?.promptBatches);
}
