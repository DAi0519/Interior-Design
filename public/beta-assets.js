/**
 * [INPUT]: 依赖 Beta Run 输入中的主图/风格图/精模光影图数组、样本 ID 与当前功能
 * [OUTPUT]: 对外提供 packBatchAssets，分别去重共享主图、风格图和活动光影参考图，已有飞书样本只保留样本 ID
 * [POS]: public 的 Beta 批次传输边界，防止样本原图随整批请求重复提交
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function packBatchAssets(items, featureMode) {
  const assets = {};
  const packedItems = items.map((item) => {
    const input = { ...item.input };
    const referenceAssetKey = featureMode === "free" && input.referenceImages?.length
      ? "shared-source"
      : null;
    const styleReferenceAssetKey = input.styleReferenceImages?.length
      ? "shared-style"
      : null;
    const lightingReferenceAssetKey = featureMode === "refinedModel" && input.refinedLighting?.mode === "reference"
      && input.lightingReferenceImages?.length ? "shared-lighting" : null;
    if (referenceAssetKey && !assets[referenceAssetKey]) {
      assets[referenceAssetKey] = input.referenceImages;
    }
    if (styleReferenceAssetKey && !assets[styleReferenceAssetKey]) {
      assets[styleReferenceAssetKey] = input.styleReferenceImages;
    }
    if (lightingReferenceAssetKey && !assets[lightingReferenceAssetKey]) {
      assets[lightingReferenceAssetKey] = input.lightingReferenceImages;
    }
    delete input.referenceImages;
    delete input.styleReferenceImages;
    delete input.lightingReferenceImages;
    return {
      ...item,
      input,
      ...(referenceAssetKey ? { referenceAssetKey } : {}),
      ...(styleReferenceAssetKey ? { styleReferenceAssetKey } : {}),
      ...(lightingReferenceAssetKey ? { lightingReferenceAssetKey } : {}),
    };
  });
  return { assets, items: packedItems };
}
