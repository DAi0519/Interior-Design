/**
 * [INPUT]: 依赖 Beta Run 输入中的参考图数组、样本 ID 与当前功能
 * [OUTPUT]: 对外提供 packBatchAssets，去重批次图片并把 Run 输入改为资产引用
 * [POS]: public 的 Beta 批次传输边界，避免相同图片随每个模型重复提交
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function packBatchAssets(items, featureMode) {
  const assets = {};
  const packedItems = items.map((item) => {
    const input = { ...item.input };
    const referenceAssetKey = input.referenceImages?.length
      ? featureMode === "free" ? "shared-source" : `source-${item.caseId}`
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
