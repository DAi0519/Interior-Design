/**
 * [INPUT]: 原尺度 2:1 全景 RGB 像素、接缝列及半开行区间，支持首尾环绕和内部接缝
 * [OUTPUT]: measureSeam 返回跨缝亮度差、色度差、异常跳差行数与最大残差
 * [POS]: scripts 全景批处理的只读验收测量模块
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const rounded = value => Number(value.toFixed(3));
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function validate(rgb, width, height, seamX, top, bottom) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || height < 16 || width !== height * 2
      || !(rgb instanceof Uint8Array) || rgb.length !== width * height * 3) {
    throw new TypeError("需要原尺度 2:1 全景的完整 RGB 像素（高度至少 16）");
  }
  if (!Number.isSafeInteger(seamX) || seamX < 0 || seamX >= width) {
    throw new RangeError("seamX 必须是图内的整数列");
  }
  if (!Number.isSafeInteger(top) || !Number.isSafeInteger(bottom) || top < 0 || top >= bottom || bottom > height) {
    throw new RangeError("测量行范围需要使用图内的半开区间");
  }
}

export function measureSeam(rgb, width, height, seamX = 0, top = 0, bottom = height) {
  validate(rgb, width, height, seamX, top, bottom);
  const scale = Math.max(0.125, height / 1440);
  const sideSpan = Math.min(Math.floor(width / 4) - 2, Math.max(4, Math.ceil(12 * scale)));
  const index = (x, y) => (y * width + ((seamX + x + width) % width)) * 3;
  const intensity = i => luma(rgb[i], rgb[i + 1], rgb[i + 2]);
  let lumaSum = 0, chromaSum = 0, activeRows = 0, maxResidual = 0;

  for (let y = top; y < bottom; y++) {
    const left = index(-1, y), right = index(0, y);
    const sameSide = [];
    const gradients = [[], [], []];
    for (let d = 0; d < sideSpan; d++) {
      const l0 = index(-1 - d, y), l1 = index(-2 - d, y);
      const r0 = index(d, y), r1 = index(d + 1, y);
      sameSide.push(Math.abs(intensity(l0) - intensity(l1)), Math.abs(intensity(r1) - intensity(r0)));
      for (let c = 0; c < 3; c++) {
        gradients[c].push(rgb[l0 + c] - rgb[l1 + c], rgb[r1 + c] - rgb[r0 + c]);
      }
    }

    // -------- 把正常同侧梯度和纹理波动作为跨缝跳差的背景量 --------
    const difference = gradients.map((values, c) => rgb[right + c] - rgb[left + c] - median(values));
    const chroma = Math.max(...difference) - Math.min(...difference);
    const noise = median(sameSide) * 0.65 + sameSide.reduce((sum, value) => sum + value, 0) / sameSide.length * 0.35;
    const expectedNoise = 2.4 * noise + 2.5;
    const residual = Math.max(0, Math.abs(luma(...difference)) - expectedNoise, 0.45 * chroma - expectedNoise);

    lumaSum += Math.abs(intensity(right) - intensity(left));
    chromaSum += chroma;
    if (residual >= 6) activeRows++;
    maxResidual = Math.max(maxResidual, residual);
  }

  const count = bottom - top;
  return { lumaJump: rounded(lumaSum / count), chromaJump: rounded(chromaSum / count),
    activeRows, maxResidual: rounded(maxResidual) };
}
