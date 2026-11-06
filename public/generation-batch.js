/**
 * [INPUT]: 依赖model-capabilities的功能尺寸规则/后置KS身份与输入预检、统一生成输入、模型目录与批量执行回调
 * [OUTPUT]: 对外提供Main/Beta逐模型尺寸质量适配、Flux后置KS身份冻结/跨模型剥离与超限阻断、双图/全景隔离及保序并发批量调度
 * [POS]: public 的多模型生成领域层，与 DOM、网络客户端和结果渲染分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { fluxPostUpscaleState, sizeControlState } from "./model-capabilities.js";

export function adaptGenerationInputForModel(
  input,
  model,
  { featureMode, sourceImage = null } = {},
) {
  const { workflowProfile: _legacyWorkflowProfile, postUpscaleWorkflowKey: _postKey,
    postUpscaleWorkflowVersion: _postVersion, ...baseInput } = input;
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
  const postUpscale = fluxPostUpscaleState({ featureMode, refinedLighting: input.refinedLighting,
    model, resolution: controls.resolution, sourceImage });
  if (postUpscale.reason) throw new Error(postUpscale.reason);
  return {
    ...baseInput,
    ...postUpscale.requestFields,
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
