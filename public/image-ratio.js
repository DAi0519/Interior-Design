/**
 * [INPUT]: 依赖浏览器 Image 解码能力，接收图片 data URL、文件名与模型合法比例矩阵
 * [OUTPUT]: 对外提供 readImageDimensions、sourceAspectLabel 与 nearestSupportedRatio
 * [POS]: public 的无状态画幅适配工具，供生成控制器完成上传预览与最近合法比例选择
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function greatestCommonDivisor(left, right) {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function sourceAspectLabel(image) {
  if (!image?.width || !image?.height) return null;
  const divisor = greatestCommonDivisor(image.width, image.height);
  const width = image.width / divisor;
  const height = image.height / divisor;
  return width <= 100 && height <= 100
    ? `${width}:${height}`
    : `${(image.width / image.height).toFixed(2)}:1`;
}

function ratioNumber(value) {
  const [width, height] = String(value).split(":").map(Number);
  return width / height;
}

export function nearestSupportedRatio(model, image) {
  if (!image?.width || !image?.height) return model.defaultRatio;
  const sourceRatio = image.width / image.height;
  return Object.keys(model.sizes).reduce((nearest, candidate) =>
    Math.abs(Math.log(ratioNumber(candidate) / sourceRatio)) <
    Math.abs(Math.log(ratioNumber(nearest) / sourceRatio))
      ? candidate
      : nearest,
  model.defaultRatio);
}

export function readImageDimensions(dataUrl, fileName) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    });
    image.addEventListener("error", () => {
      reject(new Error(`无法读取 ${fileName} 的图片尺寸`));
    });
    image.src = dataUrl;
  });
}
