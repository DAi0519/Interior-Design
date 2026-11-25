/**
 * [INPUT]: 依赖 sharp、原尺寸 2:1 RGB 或 RGBA 全景像素和居中接缝的遮罩宽度
 * [OUTPUT]: RGB 或 RGBA 半幅循环平移、整图透明窄罩、历史回贴试验的罩内合成和像素核验
 * [POS]: scripts 的全景接缝批处理像素模块，独立于 OneAPI 请求编排
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import sharp from "sharp";

const CHANNELS = 3;
const ALPHA_CHANNELS = 4;
const MAX_FEATHER_PIXELS = 24;

function validateSize(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || height <= 0 || width !== 2 * height) {
    throw new RangeError("全景图尺寸必须为 2:1");
  }
}

function validatePanorama(rgb, width, height) {
  validateSize(width, height);
  if (!Buffer.isBuffer(rgb) || rgb.length !== width * height * CHANNELS) {
    throw new RangeError("全景图像素必须为原尺寸的 RGB Buffer");
  }
}

/** 接缝经度移到图像中央，重复一次还原原始经度。 */
export function rollHalfPanorama(pixels, width, height, channels = CHANNELS) {
  validateSize(width, height);
  if (![CHANNELS, ALPHA_CHANNELS].includes(channels)
    || !Buffer.isBuffer(pixels) || pixels.length !== width * height * channels) {
    throw new RangeError("全景图像素必须为原尺寸的 RGB 或 RGBA Buffer");
  }
  const result = Buffer.alloc(pixels.length);
  const rowBytes = width * channels;
  const halfBytes = rowBytes / 2;
  for (let y = 0; y < height; y++) {
    const start = y * rowBytes;
    pixels.copy(result, start, start + halfBytes, start + rowBytes);
    pixels.copy(result, start + halfBytes, start, start + halfBytes);
  }
  return result;
}

/** 仅中央全高窄条 alpha=0，保护区 alpha=255。left/right 使用半开区间。 */
export async function prepareCenteredMask(width, height, bandWidth) {
  validateSize(width, height);
  if (!Number.isInteger(bandWidth) || bandWidth < 2 || bandWidth >= width) {
    throw new RangeError("遮罩宽度须为至少 2 像素且小于整图宽度的整数");
  }
  const left = Math.floor((width - bandWidth) / 2);
  const right = left + bandWidth;
  const featherPx = Math.min(MAX_FEATHER_PIXELS, Math.max(1, Math.floor(bandWidth / 4)));
  const mask = Buffer.alloc(width * height * ALPHA_CHANNELS, 255);
  for (let y = 0; y < height; y++) {
    const first = (y * width + left) * ALPHA_CHANNELS + 3;
    const end = (y * width + right) * ALPHA_CHANNELS;
    for (let i = first; i < end; i += ALPHA_CHANNELS) mask[i] = 0;
  }
  const maskPng = await sharp(mask, { raw: { width, height, channels: ALPHA_CHANNELS } }).png().toBuffer();
  return { maskPng, left, right, featherPx, editablePixels: bandWidth * height };
}

async function readNativePng(png, width, height, label, requireAlpha = false) {
  if (!Buffer.isBuffer(png)) throw new TypeError(`${label}须为 PNG Buffer`);
  const pipeline = sharp(png);
  const metadata = await pipeline.metadata();
  if (metadata.format !== "png" || metadata.width !== width || metadata.height !== height
    || (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1
    || (requireAlpha && !metadata.hasAlpha)) {
    throw new RangeError(`${label}须为 ${width}×${height} 的原尺度${requireAlpha ? "透明" : ""} PNG`);
  }
  const { data, info } = await pipeline.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height || info.channels !== ALPHA_CHANNELS
    || data.length !== width * height * ALPHA_CHANNELS) {
    throw new RangeError(`${label}的 RGBA 解码尺寸不符`);
  }
  return data;
}

async function validateMask(plan, width, height) {
  const { left, right, featherPx, editablePixels } = plan ?? {};
  const bandWidth = right - left;
  if (!Number.isInteger(left) || !Number.isInteger(right) || bandWidth < 2 || bandWidth >= width
    || left !== Math.floor((width - bandWidth) / 2)
    || !Number.isInteger(featherPx) || featherPx < 1 || featherPx > Math.floor(bandWidth / 2)
    || editablePixels !== bandWidth * height) {
    throw new RangeError("遮罩规划与整图中央窄条像素范围不一致");
  }
  const mask = await readNativePng(plan.maskPng, width, height, "送模遮罩", true);
  for (let y = 0; y < height; y++) {
    const row = y * width * ALPHA_CHANNELS;
    for (let x = 0; x < width; x++) {
      const expected = x >= left && x < right ? 0 : 255;
      if (mask[row + x * ALPHA_CHANNELS + 3] !== expected) {
        throw new RangeError("送模 PNG 的 alpha 像素与中央窄条规划不一致");
      }
    }
  }
}

function verifyOutside(before, after, width, height, left, right) {
  const rowBytes = width * CHANNELS;
  for (let y = 0; y < height; y++) {
    const start = y * rowBytes;
    const beforeBand = start + left * CHANNELS;
    const afterBand = start + right * CHANNELS;
    const end = start + rowBytes;
    if (!before.subarray(start, beforeBand).equals(after.subarray(start, beforeBand))
      || !before.subarray(afterBand, end).equals(after.subarray(afterBand, end))) return false;
  }
  return true;
}

/** 独立重新解码实际透明遮罩并核验罩外 RGB 像素。 */
export async function verifyCenteredMaskOutsideMask(before, after, width, height, plan) {
  validatePanorama(before, width, height);
  validatePanorama(after, width, height);
  await validateMask(plan, width, height);
  return verifyOutside(before, after, width, height, plan.left, plan.right);
}

/** 整图回包须同尺寸。罩内羽化与回包 alpha 相乘，透明回包沿用底图。 */
export async function applyCenteredMask(centeredRgb, width, height, plan, editedPng) {
  validatePanorama(centeredRgb, width, height);
  const [, edited] = await Promise.all([
    validateMask(plan, width, height),
    readNativePng(editedPng, width, height, "模型回包"),
  ]);
  const { left, right, featherPx } = plan;
  const weights = Array.from({ length: right - left }, (_, offset) => {
    const distance = Math.min(offset + 0.5, right - left - offset - 0.5);
    const t = Math.min(1, distance / featherPx);
    return t * t * (3 - 2 * t);
  });
  const pixels = Buffer.from(centeredRgb);
  let changedPixels = 0, transparentPixels = 0, partialPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = left; x < right; x++) {
      const base = y * width + x;
      const dest = base * CHANNELS;
      const donor = base * ALPHA_CHANNELS;
      const sourceAlpha = edited[donor + 3];
      if (sourceAlpha === 0) {
        transparentPixels++;
        continue;
      }
      if (sourceAlpha < 255) partialPixels++;
      const alpha = weights[x - left] * sourceAlpha / 255;
      for (let c = 0; c < CHANNELS; c++) {
        pixels[dest + c] = Math.round(centeredRgb[dest + c] * (1 - alpha) + edited[donor + c] * alpha);
      }
      if (pixels[dest] !== centeredRgb[dest] || pixels[dest + 1] !== centeredRgb[dest + 1]
        || pixels[dest + 2] !== centeredRgb[dest + 2]) changedPixels++;
    }
  }
  const outsideMaskPixelIdentical = verifyOutside(centeredRgb, pixels, width, height, left, right);
  return { pixels, changedPixels, outsideMaskPixelIdentical, transparentPixels, partialPixels };
}
