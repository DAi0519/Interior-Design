/**
 * [INPUT]: 接收原图真实宽高，不依赖DOM或图片解码
 * [OUTPUT]: 多角度上传策略及长边最高2K、8像素对齐的输入/推理/输出计划
 * [POS]: public 与 src 共用的多角度尺寸真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const MULTI_ANGLE_IMAGE_POLICY = Object.freeze({
  maxInputBytes: 20 * 1024 * 1024,
  maxInputPixels: 64_000_000,
  maxInputEdge: 16_384,
  maxInferenceEdge: 2048,
});
const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });

export function planMultiAngleImage(sourceWidth, sourceHeight) {
  const policy = MULTI_ANGLE_IMAGE_POLICY;
  if (![sourceWidth, sourceHeight].every(value => Number.isInteger(value) && value >= 32)) throw invalid("原图每边至少需要32像素");
  if (sourceWidth * sourceHeight > policy.maxInputPixels || Math.max(sourceWidth, sourceHeight) > policy.maxInputEdge) throw invalid("原图超过6400万像素或单边16384像素，请先缩小图片");
  const scale = Math.min(1, policy.maxInferenceEdge / Math.max(sourceWidth, sourceHeight));
  const inferenceWidth = Math.floor(sourceWidth * scale / 8) * 8;
  const inferenceHeight = Math.floor(sourceHeight * scale / 8) * 8;
  if (Math.min(inferenceWidth, inferenceHeight) < 32) throw invalid("图片比例过窄，缩放后短边需要至少32像素");
  return {
    sourceWidth, sourceHeight, inferenceWidth, inferenceHeight,
    outputWidth: inferenceWidth,
    outputHeight: inferenceHeight,
    inputResized: inferenceWidth !== sourceWidth || inferenceHeight !== sourceHeight,
    outputResizeMethod: "none",
  };
}

