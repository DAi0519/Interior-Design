/**
 * [INPUT]: 依赖已解码的主图/可选遮罩或已验证的归一化矩形与多边形/参考图、模型真源、sharp、真实产物读取与注入的OneAPI同步/异步编辑客户端
 * [OUTPUT]: Sunburst三档五质量、矩形内侧或拒绝像素退化的多边形真实轮廓蓝色定位线及点/边界元数据、目标物体编辑/去标记指令，原生PNG直出及实际送模标记图归档副本
 * [POS]: src 的遮罩填充三方适配器，无mask走Responses后台任务、透明mask保留Images edits；返回后不裁切或回贴原图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { loadImageBytes } from "./image-artifact.mjs";
import { MASK_FILL_GPT_OUTPUT_LIMITS, MASK_FILL_SELECTION_COLOR, maskFillGptOutputSize } from "../public/image-mask-fill-geometry.js";

export const MASK_FILL_ONEAPI_VERSION = "2026-10-22.sunburst.10";
export const MASK_FILL_ONEAPI_MODEL = MODEL_CONFIGS.gptImage25Sunburst;
export const MASK_FILL_ONEAPI_LIMITS = Object.freeze({ ...MASK_FILL_GPT_OUTPUT_LIMITS, maxImageUrlCharacters: 20_971_520 });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const bytesOf = image => Buffer.from(image.imageUrl.split(",")[1], "base64");
const pngUrl = bytes => `data:image/png;base64,${bytes.toString("base64")}`;

export function sunburstMaskOutputSize(source, resolution = "1K") {
  try { return maskFillGptOutputSize(source, resolution, MASK_FILL_ONEAPI_MODEL.sizes); }
  catch (error) { throw fail(error.message); }
}
export function sunburstMaskQuality(value = MASK_FILL_ONEAPI_MODEL.defaultQuality) {
  if (!MASK_FILL_ONEAPI_MODEL.qualityOptions.includes(value)) throw fail(`GPT质量请选择${MASK_FILL_ONEAPI_MODEL.qualityOptions.join("、")}`);
  return value;
}

export function sunburstMaskPrompt({ prompt, mode, mask, editRegion }) {
  return [editRegion ? "Image 1 contains a selected region marked by a temporary blue outline of any shape. The outline is an annotation, not part of the scene. Use the selected region to identify the target object for the user instruction. Follow the requested action, including replacing, removing, adding or modifying the object. The selection identifies the target and is not a hard boundary for editing. Preserve the scene's composition, perspective and lighting, and keep unrelated objects and background unchanged. Remove all blue selection guide marks from the final image and restore the scene beneath them."
    : mask ? "Edit image 1 only in the transparent area of the supplied mask. Preserve its composition, perspective, lighting and all protected areas."
    : "Edit image 1 according to the user instruction. Preserve the scene composition, perspective, lighting and everything unrelated to the requested change.",
    ...(mode === "reference" ? [editRegion
      ? "Image 2 is an object reference. If the user instruction calls for using the reference object, use the requested object from image 2 for the selected target in image 1, matching the scene's scale, perspective and lighting. Do not copy image 2's background."
      : mask
      ? "Image 2 is an object reference. Use the requested object from image 2 inside the masked region of image 1, matching the original scene's scale and lighting. Do not copy image 2's background."
      : "Image 2 is an object reference. Use the requested object from image 2 in image 1 according to the user instruction, matching the scene's scale and lighting. Do not copy image 2's background."] : []),
    `User instruction: ${prompt}`, editRegion ? "Return one complete image without blue selection outlines, guide marks, labels or a collage."
      : "Return one complete image, without borders, labels or a collage."].join("\n");
}

export async function prepareSunburstMaskInput(validated) {
  const { source, mask, reference, maskExpand, editRegion } = validated;
  const target = sunburstMaskOutputSize(source, validated.outputResolution);
  const quality = sunburstMaskQuality(validated.quality);
  // -------- 源与mask同尺寸、同PNG；不把输出3840上限误用于输入 --------
  let sourceBytes = await sharp(bytesOf(source)).png().toBuffer();
  let editRegionPixels = null, regionAnnotation = null;
  if (editRegion) {
    const polygon = editRegion.type === "polygon";
    const points = polygon ? editRegion.points.map(point => ({
      x: Math.max(0, Math.min(source.width - 1, Math.round(point.x * source.width))),
      y: Math.max(0, Math.min(source.height - 1, Math.round(point.y * source.height))),
    })) : null;
    // -------- 归一化轮廓有面积，落到像素网格后仍可能合点或共线 --------
    if (polygon && points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) === 0) throw fail("圈选区域太小或轮廓无效，请重新圈选");
    const left = polygon ? Math.min(...points.map(point => point.x)) : Math.floor(editRegion.x * source.width);
    const top = polygon ? Math.min(...points.map(point => point.y)) : Math.floor(editRegion.y * source.height);
    const right = polygon ? Math.max(...points.map(point => point.x))
      : Math.min(source.width, Math.ceil((editRegion.x + editRegion.width) * source.width));
    const bottom = polygon ? Math.max(...points.map(point => point.y))
      : Math.min(source.height, Math.ceil((editRegion.y + editRegion.height) * source.height));
    // -------- 多边形边界包含端点像素；描边沿真实轮廓，不替换为外接框 --------
    const width = right - left + (polygon ? 1 : 0), height = bottom - top + (polygon ? 1 : 0);
    if (width < 3 || height < 3) throw fail("框选区域太小，请重新框选");
    const strokeWidth = Math.min(width - 1, height - 1, Math.max(2, Math.min(8, Math.round(Math.min(source.width, source.height) / 320))));
    editRegionPixels = polygon ? { type: "polygon", points, bounds: { left, top, width, height } } : { left, top, width, height };
    regionAnnotation = { color: MASK_FILL_SELECTION_COLOR, strokeWidth,
      placement: polygon ? "centered-on-contour" : "inside-selection", ...(polygon ? { shape: "polygon" } : {}) };
    const shape = polygon ? `<polygon points="${points.map(point => `${point.x},${point.y}`).join(" ")}" stroke-linejoin="round"`
      : `<rect x="${left + strokeWidth / 2}" y="${top + strokeWidth / 2}" width="${width - strokeWidth}" height="${height - strokeWidth}"`;
    const outline = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${source.width}" height="${source.height}">${shape} fill="none" stroke="${regionAnnotation.color}" stroke-width="${strokeWidth}"/></svg>`);
    sourceBytes = await sharp(sourceBytes).composite([{ input: outline }]).png().toBuffer();
  }
  let editMask = null, maskBytes = null;
  if (mask) {
    const drawnMask = await sharp(bytesOf(mask)).toColourspace("srgb").removeAlpha().extractChannel("red").raw().toBuffer();
    let maskPipeline = sharp(drawnMask, { raw: { width: source.width, height: source.height, channels: 1 } });
    // -------- libvips形态学以前景黑色定义；erode收缩黑区即扩展白色编辑区 --------
    if (maskExpand) maskPipeline = maskPipeline.erode(maskExpand);
    editMask = await maskPipeline.toColourspace("b-w").raw().toBuffer();
    const protection = Buffer.from(editMask.map(value => 255 - value));
    maskBytes = await sharp({ create: { width: source.width, height: source.height, channels: 3, background: "#ffffff" } })
      .joinChannel(protection, { raw: { width: source.width, height: source.height, channels: 1 } }).png().toBuffer();
  }
  const referenceBytes = reference ? await sharp(bytesOf(reference)).png().toBuffer() : null;
  const images = [sourceBytes, ...(referenceBytes ? [referenceBytes] : [])].map(bytes => ({ image_url: pngUrl(bytes) }));
  const maskUrl = maskBytes ? pngUrl(maskBytes) : null;
  if ([...images.map(image => image.image_url), ...(maskUrl ? [maskUrl] : [])].some(url => url.length > MASK_FILL_ONEAPI_LIMITS.maxImageUrlCharacters)) {
    throw fail("转换PNG后超过编辑接口单图20MiB的image_url字符限制，请减小图片文件");
  }
  return { sourceBytes, maskBytes, editMask, referenceBytes, target, editRegionPixels, regionAnnotation,
    request: { model: MASK_FILL_ONEAPI_MODEL.id, images, ...(maskUrl ? { mask: { image_url: maskUrl } } : {}),
      prompt: sunburstMaskPrompt(validated), size: `${target.width}x${target.height}`, quality,
      n: 1, output_format: "png", response_format: "b64_json" } };
}

export async function executeSunburstMaskFill(validated, { imageClient, onProgress = () => {} }) {
  const method = validated.mask ? "editImage" : "editImageAsync";
  if (typeof imageClient?.[method] !== "function") throw fail("Sunburst编辑客户端尚未配置", 409);
  const prepared = await prepareSunburstMaskInput(validated);
  const startedAt = Date.now();
  onProgress({ phase: "executing", message: validated.editRegion ? "GPT Image 2.5 Sunburst 正在编辑圈选物体" : validated.mask ? "GPT Image 2.5 Sunburst 正在编辑遮罩区域" : "GPT Image 2.5 Sunburst 正在按指令编辑图片" });
  const generated = await imageClient[method](prepared.request, {
    onSubmitted({ id, status }) {
      onProgress({ phase: "executing", message: "GPT 编辑任务已提交，正在后台生成", upstreamResponseId: id, upstreamStatus: status });
    },
  });
  if (generated.images?.length !== 1) throw fail("Sunburst没有返回唯一结果图片", 502);
  const nativeBytes = await loadImageBytes(generated.images[0].url);
  const native = await sharp(nativeBytes, { limitInputPixels: MASK_FILL_ONEAPI_LIMITS.maxOutputPixels }).metadata();
  if (native.format !== "png" || (native.pages || 1) !== 1) throw fail("Sunburst实际返回不是请求的单帧PNG图片", 502);
  if (native.width !== prepared.target.width || native.height !== prepared.target.height) {
    throw fail(`Sunburst实际返回${native.width}×${native.height}，与请求${prepared.request.size}不一致`, 502);
  }
  const { source } = validated;
  const delivery = prepared.target;
  // -------- 完整交付上游PNG原始字节；不按mask截取、不回贴、不重编码 --------
  const outputSha256 = digest(nativeBytes);
  const metadata = { provider: "oneapi", model: MASK_FILL_ONEAPI_MODEL.id, version: MASK_FILL_ONEAPI_VERSION,
    prompt: prepared.request.prompt, sourcePrompt: validated.prompt, mode: validated.mode, quality: prepared.request.quality,
    outputResolution: validated.outputResolution, protectedSourceResampled: false,
    sourceWidth: source.width, sourceHeight: source.height, sourceSha256: source.sha256,
    originalSourceWidth: validated.originalSource.width, originalSourceHeight: validated.originalSource.height,
    originalSourceSha256: source.originalSha256, sourceOriented: validated.sourceOriented,
    inputWidth: source.width, inputHeight: source.height, inputResized: false, inputFormat: "png",
    submittedSourceSha256: digest(prepared.sourceBytes), hasMask: Boolean(validated.mask),
    editRegion: validated.editRegion || null, editRegionPixels: prepared.editRegionPixels, regionAnnotation: prepared.regionAnnotation,
    submittedMaskSha256: prepared.maskBytes ? digest(prepared.maskBytes) : null,
    drawnMaskSha256: validated.mask?.sha256 || null, maskSha256: prepared.maskBytes ? digest(prepared.maskBytes) : null,
    maskConvention: prepared.maskBytes ? "alpha0-edit-alpha255-protect" : null,
    referenceWidth: validated.reference?.width || null, referenceHeight: validated.reference?.height || null,
    referenceSha256: prepared.referenceBytes ? digest(prepared.referenceBytes) : null,
    inferenceTier: validated.inferenceTier, inferenceSize: Math.max(native.width, native.height), inferenceWidth: native.width, inferenceHeight: native.height,
    requestedSize: prepared.request.size, nativeOutputWidth: native.width, nativeOutputHeight: native.height,
    nativeOutputSha256: outputSha256, outputWidth: delivery.width, outputHeight: delivery.height,
    actualOutputWidth: delivery.width, actualOutputHeight: delivery.height, outputSha256,
    outputResized: false, protectedAreaComposited: false, postUpscaled: false, maskExpand: validated.maskExpand,
    requestId: generated.requestId || null, upstreamAsync: !validated.mask, usageCost: generated.usageCost || null };
  return { durationMs: Date.now() - startedAt, images: [{ url: pngUrl(nativeBytes) }],
    request: { model: MASK_FILL_ONEAPI_MODEL.id, provider: "oneapi", quality: prepared.request.quality, outputFormat: "png",
      outputResolution: validated.outputResolution, resolution: validated.outputResolution,
      referenceImageCount: validated.reference ? 2 : 1, hasMask: Boolean(validated.mask), editRegion: validated.editRegion || null, maskFillMode: validated.mode, inferenceTier: validated.inferenceTier,
      inferenceSize: metadata.inferenceSize, inferenceWidth: native.width, inferenceHeight: native.height,
      maskExpand: validated.maskExpand, size: `${delivery.width}x${delivery.height}`, syncMode: "local-only" },
    sync: { generationId: null, status: "skipped" },
    upstream: { created: generated.created, outputFormat: "png", transport: generated.transport, metadata,
      requestId: generated.requestId, usageCost: generated.usageCost || null },
    workflow: { key: "sunburst-mask-fill", label: MASK_FILL_ONEAPI_MODEL.label, version: MASK_FILL_ONEAPI_VERSION, mode: validated.mode },
    archiveMaskImage: prepared.maskBytes ? { imageUrl: pngUrl(prepared.maskBytes), mimeType: "image/png", fileName: "submitted-alpha-mask.png", size: prepared.maskBytes.length } : null,
    archiveBoxedSourceImage: validated.editRegion ? { imageUrl: prepared.request.images[0].image_url, mimeType: "image/png",
      fileName: "submitted-boxed-source.png", size: prepared.sourceBytes.length } : null };
}
