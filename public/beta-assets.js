/**
 * [INPUT]: 依赖 Beta Run 输入中的参考图数组、样本 ID 与当前功能
 * [OUTPUT]: 对外提供 packBatchAssets，去重自由生图共享主图和含风格转换的共享风格图，已有飞书样本只保留样本 ID
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
    if (referenceAssetKey && !assets[referenceAssetKey]) {
      assets[referenceAssetKey] = input.referenceImages;
    }
    if (styleReferenceAssetKey && !assets[styleReferenceAssetKey]) {
      assets[styleReferenceAssetKey] = input.styleReferenceImages;
    }
    delete input.referenceImages;
    delete input.styleReferenceImages;
    return {
      ...item,
      input,
      ...(referenceAssetKey ? { referenceAssetKey } : {}),
      ...(styleReferenceAssetKey ? { styleReferenceAssetKey } : {}),
    };
  });
  return { assets, items: packedItems };
}
