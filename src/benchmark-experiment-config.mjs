/**
 * [INPUT]: 依赖 Benchmark 标识哈希、场景融合/出图模型目录与浏览器提交的实验草稿
 * [OUTPUT]: 对外提供仅接纳 OneAPI 出图模型的实验草稿规范化、冻结配置生成、输出规格解析及基于稳定编码的配置一致性校验
 * [POS]: src 的 Benchmark 实验配置领域层，隔离前端草稿、Runner 计划与 Base 配置记录格式
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { publicAgentModelCatalog } from "./agent-model-config.mjs";
import { sha256 } from "./benchmark-identifiers.mjs";
import { publicModelCatalog } from "./model-config.mjs";

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

function outputSpec(draft) {
  const ratio = draft.ratioMode === "source"
    ? "跟随原图比例"
    : requiredText(draft.ratio, "输出比例");
  const quality = String(draft.quality || "medium").toLowerCase();
  return `${ratio} · ${draft.resolution} · ${draft.outputFormat.toUpperCase()} · 质量 ${quality}`;
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
  if (ratios.some((ratio) => !model.sizes[ratio][draft.resolution])) {
    throw configError(`${model.label} 在当前画幅下不支持 ${draft.resolution}`);
  }
  if (model.qualityOptions.length && !model.qualityOptions.includes(draft.quality)) {
    throw configError(`${model.label} 不支持 ${draft.quality} 质量档`);
  }
}

export function parseBenchmarkOutputSpec(value) {
  const normalized = String(value || "").trim();
  const resolution = normalized.match(/\b(512|[1-4]K)\b/i)?.[1]?.toUpperCase();
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

export function normalizeExperimentDraft(input) {
  const raw = input?.draftConfig;
  if (!raw) return null;
  const groupId = requiredText(input.experimentId, "实验 ID");
  const styleCode = requiredText(raw.styleCode, "Style DNA");
  if (!/^.+@v\d+$/.test(styleCode)) throw configError("Style DNA 必须使用 code@vN");
  const agentCode = requiredText(raw.agentCode, "融合 Agent");
  const agentVersion = positiveInteger(raw.agentVersion, "融合 Agent 版本");
  const imageModelKeys = [...new Set(
    (Array.isArray(raw.imageModelKeys) ? raw.imageModelKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean),
  )];
  if (!imageModelKeys.length) throw configError("至少选择一个出图模型");

  const modelCatalog = publicModelCatalog();
  const agentCatalog = publicAgentModelCatalog();
  const fusionModel = catalogEntry(
    agentCatalog,
    requiredText(raw.fusionModelKey, "融合基模"),
    "融合基模",
  );
  if (!fusionModel.imageInput) throw configError(`${fusionModel.label} 不支持白模图片输入`);
  const imageModels = imageModelKeys.map((key) =>
    catalogEntry(modelCatalog, key, "出图模型"));
  const unsupportedProviders = imageModels.filter(
    (model) => model.provider !== "oneapi",
  );
  if (unsupportedProviders.length) {
    throw configError(
      `${unsupportedProviders.map((model) => model.label).join("、")} 当前不支持 Benchmark 批量横评`,
    );
  }
  const draft = {
    agentCode,
    agentVersion,
    fusionModel,
    imageModels,
    outputFormat: requiredText(raw.outputFormat, "输出格式").toLowerCase(),
    perBatchImages: positiveInteger(raw.perBatchImages, "每批次每模型出图数"),
    promptBatches: positiveInteger(raw.promptBatches, "提示词批次数"),
    quality: String(raw.quality || "medium").toLowerCase(),
    ratio: String(raw.ratio || "").trim(),
    ratioMode: raw.ratioMode === "preset" ? "preset" : "source",
    resolution: requiredText(raw.resolution, "分辨率").toUpperCase(),
    styleCode,
  };
  if (draft.ratioMode === "preset" && !draft.ratio) {
    throw configError("固定画幅模式必须选择输出比例");
  }
  for (const model of draft.imageModels) validateOutputForModel(model, draft);

  const frozen = {
    agentCode: draft.agentCode,
    agentVersion: draft.agentVersion,
    fusionModelId: draft.fusionModel.id,
    imageModelIds: draft.imageModels.map((model) => model.id).sort(),
    outputFormat: draft.outputFormat,
    perBatchImages: draft.perBatchImages,
    promptBatches: draft.promptBatches,
    quality: draft.quality,
    ratio: draft.ratioMode === "source" ? "source" : draft.ratio,
    resolution: draft.resolution,
    styleCode: draft.styleCode,
  };
  const configHash = sha256(JSON.stringify(frozen));
  const spec = outputSpec(draft);
  const configs = draft.imageModels.map((model) => ({
    configId: `CFG-${sha256(`${groupId}:${configHash}:${model.id}`).slice(0, 12).toUpperCase()}`,
    enabled: true,
    fusionAgent: `白模渲染融合 Agent [${draft.agentCode}@v${draft.agentVersion}]`,
    fusionModel: `${draft.fusionModel.label} [${draft.fusionModel.id}]`,
    groupId,
    imageModel: `${model.label} [${model.id}]`,
    imageModelLabel: model.label,
    outputSpec: spec,
    perBatchImages: draft.perBatchImages,
    promptBatches: draft.promptBatches,
    recordId: null,
    styleDna: `Style DNA [${draft.styleCode}]`,
  }));
  return {
    configHash,
    configIds: configs.map((config) => config.configId),
    configs,
    frozen,
    groupId,
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
