/**
 * [INPUT]: 依赖共享image-multi-angle-geometry、sharp、reference-image 与 image-artifact 的图片字节校验和解码
 * [OUTPUT]: 多角度输入策略、原图/长边不超过2048推理与输出尺寸计划及EXIF归一化压缩输入
 * [POS]: src 的多角度图片边界，被独立试跑入口与执行图共同消费，分离上传尺寸和GPU工作尺寸
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import sharp from "sharp";
import { normalizeReferenceImage } from "./reference-image.mjs";
import { decodeImageDataUrl } from "./image-artifact.mjs";

import { MULTI_ANGLE_IMAGE_POLICY, planMultiAngleImage } from "../public/image-multi-angle-geometry.js";
export { MULTI_ANGLE_IMAGE_POLICY, planMultiAngleImage } from "../public/image-multi-angle-geometry.js";
const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });

export async function prepareMultiAngleImage(input) {
  const reference = normalizeReferenceImage(input, { maxBytesPerImage: MULTI_ANGLE_IMAGE_POLICY.maxInputBytes });
  if (!reference) throw invalid("请选择原图");
  // -------- 先用文件头准入，避免把超大原图完整解码到内存 --------
  planMultiAngleImage(reference.width, reference.height);
  const sourceBytes = decodeImageDataUrl(reference.imageUrl);
  try {
    const image = sharp(sourceBytes, { limitInputPixels: MULTI_ANGLE_IMAGE_POLICY.maxInputPixels });
    const metadata = await image.metadata();
    const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
    const plan = planMultiAngleImage(swapsAxes ? metadata.height : metadata.width, swapsAxes ? metadata.width : metadata.height);
    const inferenceBytes = await image.rotate().resize(plan.inferenceWidth, plan.inferenceHeight, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
    return { reference, sourceBytes, inferenceBytes, plan };
  } catch (error) {
    if (error.statusCode) throw error;
    throw invalid(`原图读取失败：${error.message}`);
  }
}
