/**
 * [INPUT]: 依赖 model-capabilities.js 的按功能及精模单项光影模式合法尺寸推导、含风格转换/效果图氛围转换/美化及全景图美化的统一生成输入、使用 Flux 默认模型参数的模型目录与批量执行回调
 * [OUTPUT]: 对外提供含光影转换双图尺寸/PNG、质感增强固定PNG与旧房/空房的逐模型尺寸/质量适配、遗留工作流档位剥离和不设总项数上限、并发度受限、保序且允许部分失败的批量调度
 * [POS]: public 的多模型生成领域层，与 DOM、网络客户端和结果渲染分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { sizeControlState } from "./model-capabilities.js";

export function adaptGenerationInputForModel(
  input,
  model,
  { featureMode, sourceImage = null } = {},
) {
  const { workflowProfile: _legacyWorkflowProfile, ...baseInput } = input;
  const controls = sizeControlState({
    currentRatio: input.ratio,
    currentResolution: input.resolution,
    featureMode,
    refinedLighting: input.refinedLighting,
    model,
    preserveResolution: true,
    ratioMode: input.ratioMode,
    sourceImage,
  });
  const fixedPromptFlow = [
    "effectBeautification",
    "effectEnhancement",
    "textureEnhancement",
    "lightingTransfer",
    "emptyRoom",
    "roomRenovation",
    "styleTransfer",
    "panoramaEnhancement",
    "whiteModel",
    "refinedModel",
  ]
    .includes(featureMode);
  const formats = model.formats.filter(
    (format) => !fixedPromptFlow || format !== "webp",
  );
  const outputFormat = formats.includes(input.outputFormat)
    ? input.outputFormat
    : formats.includes(model.defaultFormat)
      ? model.defaultFormat
      : formats[0];
  const quality = model.qualityOptions.includes(input.quality)
    ? input.quality
    : model.defaultQuality || undefined;
  return {
    ...baseInput,
    modelKey: model.key,
    outputFormat,
    quality,
    ratio: controls.ratio,
    resolution: controls.resolution,
  };
}

export async function runGenerationBatch({
  concurrency = 2,
  execute,
  items,
  onProgress = () => {},
}) {
  if (!Array.isArray(items) || items.length < 1) {
    throw new RangeError("批量出图需要至少 1 个生成项");
  }
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      try {
        results[index] = {
          index,
          item,
          status: "fulfilled",
          value: await execute(item, index),
        };
      } catch (reason) {
        results[index] = { index, item, reason, status: "rejected" };
      } finally {
        completed += 1;
        onProgress({ completed, total: items.length });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker),
  );
  return results;
}
