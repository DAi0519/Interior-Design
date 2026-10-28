/**
 * [INPUT]: 依赖服务端冻结的飞书Prompt资产、原图/可选几何标注、整体原灯与新增光源分离的typed安全合同、模型目录、sharp和OneAPI异步编辑客户端
 * [OUTPUT]: 对外提供v10显式飞书bundle编译、无标注整体原灯及无源不涂暗的安全指令、可选四色编号引导及单/双图请求、原生PNG/实际Prompt和资产版本SHA来源回执
 * [POS]: src 的 GPT 打光适配器，复用无 mask 后台编辑传输，不回贴、不调色、不缩放模型返回结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { loadImageBytes } from "./image-artifact.mjs";
import { relightSceneInstructions, relightRebuildsLighting, relightPhotographicInstructions } from "./image-relight-presets.mjs";
import { normalizeRelightSettings } from "../public/image-relight-presets.js";
import { MASK_FILL_GPT_OUTPUT_LIMITS } from "../public/image-mask-fill-geometry.js";
import { RELIGHT_MODEL_KEY, RELIGHT_ACTION_GUIDES, RELIGHT_LIMITS, relightOutputSize, relightCenter, normalizeRelightOriginalLights } from "../public/image-relight-geometry.js";

export const RELIGHT_ONEAPI_MODEL = MODEL_CONFIGS[RELIGHT_MODEL_KEY];
export const RELIGHT_WORKFLOW_VERSION = "2026-10-26.gpt-relight.10";
const MAX_IMAGE_URL_CHARACTERS = 20_971_520;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pngUrl = bytes => `data:image/png;base64,${bytes.toString("base64")}`;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const displayPoint = point => `(${(point.x * 100).toFixed(2)}%, ${(point.y * 100).toFixed(2)}%)`;

export function relightQuality(value = RELIGHT_ONEAPI_MODEL.defaultQuality) {
  if (!RELIGHT_ONEAPI_MODEL.qualityOptions.includes(value)) throw fail(`GPT质量请选择${RELIGHT_ONEAPI_MODEL.qualityOptions.join("、")}`);
  return value;
}

function markedGeometry(light) {
  const location = light.points.map(displayPoint).join(" → ");
  return `${light.type === "point" ? "the object or small region under the marked point" : light.type === "line" ? "the finite marked line only" : "the region inside the marked polygon"} ${location}`;
}

function markedEmitter(light) {
  const geometry = light.type === "point" ? "the marked point" : light.type === "line" ? "the finite marked line" : "the marked polygon";
  return `${geometry} ${light.points.map(displayPoint).join(" → ")}`;
}

// -------- 整体操作只处理原图人工灯源；不伪造标注，不压暗日光或本次新增补光 --------
function originalLightInstructions(originalLights) {
  if (!originalLights) return null;
  const intent = originalLights.action === "keep"
    ? "KEEP ORIGINAL LIGHTS: retain the original artificial emitters' on/off state, emitted color and brightness as their baseline. Explicit marked dim or off may override this baseline. This is not a pixel lock: new requested lighting may naturally illuminate their bodies and surrounding surfaces."
    : originalLights.action === "darken"
      ? `DIM ORIGINAL LIGHTS: reduce all identifiable original artificial emitters' emitted contribution and their attributable illumination, indirect bounce and reflections by approximately ${Math.round(originalLights.amount * 100)}% as a relative visual intent, not a calibrated luminance or pixel multiplier. Keep originally unlit emitters off; a marked dim amount replaces this overall amount for that emitter without compounding the reductions. Explicit marked off still switches its original source off.`
      : "TURN OFF ALL ORIGINAL LIGHTS: stop the visible emission and attributable illumination, indirect bounce and reflections of all identifiable original artificial emitters. Keep their physical bodies and materials; daylight or a new requested light may still illuminate those bodies. This whole-scene off takes precedence over a marked dim or brighten request that would relight an original emitter; do not leave the original emitter faintly glowing.";
  return `WHOLE-SCENE ORIGINAL LIGHTS: identify the original artificial light sources from image 1 without requiring user marks or an extra recognition pass. ${intent} Preserve all physical fixture bodies, scene geometry, material identities and object positions. Change the original source contributions rather than lowering whole-image or regional exposure, painting dark receiving surfaces, suppressing window/exterior daylight or darkening unlit objects. If no original artificial source is identifiable, leave the scene unchanged by this action instead of forcing a darker image or inventing a source. This handling does not dim, turn off or suppress any separately requested new illumination or newly added fixture; execute new lights independently. Marked PRESERVE content has the highest priority, including over this whole-scene instruction.`;
}

export function buildRelightPrompt({ lights = [], originalLights: requestedOriginalLights, prompt = "", templateKey, blendMode, relightPromptSnapshot }) {
  if (!relightPromptSnapshot?.bundle) throw fail("打光 Prompt 资产未加载，已阻止生成", 409);
  const bundle = relightPromptSnapshot.bundle;
  const settings = normalizeRelightSettings({ templateKey, blendMode });
  const originalLights = normalizeRelightOriginalLights(requestedOriginalLights);
  if (settings.templateKey !== "custom" && originalLights !== null) throw fail("光照模板按方案重建照明，请在自定义中设置原有灯光");
  const rebuildLighting = relightRebuildsLighting(settings);
  const contributionBaseline = rebuildLighting ? "the new lighting setup" : "the original scene";
  const missingEmitter = "If there is no identifiable existing emitter at the mark, leave the scene unchanged by this action; do not invent a source, darken a receiving surface or dim the marked region as a fallback.";
  const offScope = originalLights
    ? "This marked off action addresses only its identified emitter; independently apply the explicit whole-scene original-light instruction to other original emitters."
    : rebuildLighting
    ? "This off action must not change unrelated lights; the template may independently reset other sources outside protected regions."
    : "Do not turn off unrelated lights.";
  const dimScope = originalLights
    ? "This marked dim addresses only its identified emitter. Whole-scene off still keeps that original emitter off. If whole-scene dim is selected, this marked dim amount replaces its amount without compounding; whole-scene keep does not block this explicit single-source dim. Apply whole-scene original-light handling independently to other original emitters."
    : rebuildLighting
    ? "This dim action must not change unrelated lights; the template may independently redesign other sources and overall exposure."
    : "Do not change unrelated lights or dim the entire image.";
  const lightInstructions = lights.map((light, index) => {
    const action = light.action || "brighten";
    if (action === "preserve") return `Action ${index + 1} [green =, PRESERVE]: retain ${markedGeometry(light)} with its original appearance, object geometry, material, emitted light state and local brightness. Do not relight, dim, recolor, replace or remove it. This protection takes precedence over every other action, the lighting template and optional prose. Restrict conflicting nearby illumination to avoid changing this protected region; do not expand protection to other similar objects.`;
    if (action === "turnOff") return `Action ${index + 1} [red x, TURN OFF EXISTING LIGHT]: identify only an existing luminaire or finite emitting segment at ${markedEmitter(light)}. The mark selects an existing lamp, strip or luminous panel, not a new light or a receiving surface. Stop only this identified source's visible emission and its attributable illumination, bounce and reflections. Preserve the physical lamp body, strip, panel and surrounding scene. Other actual light sources may still illuminate its surface. Do not remove the fixture, create a new fixture or leave the selected emitter faintly glowing. ${offScope} ${missingEmitter} Preserve marks take precedence.`;
    if (action === "darken") return `Action ${index + 1} [purple -, DIM EXISTING LIGHT]: identify only an existing luminaire or finite emitting segment at ${markedEmitter(light)}. The mark selects an existing lamp, strip or luminous panel, not a new light or a receiving surface. Dim only this identified source and its attributable illumination, bounce and reflections by approximately ${Math.round((light.amount ?? 0.5) * 100)}% as a relative visual intent, not a calibrated luminance or pixel multiplier. Preserve the physical lamp body and its material identity, texture, color relationships and visible detail while retaining plausible shadow transitions. Dimming is not a request to turn this source off. Do not add or remove hardware, paint a black overlay, darken receiving surfaces or lower regional/global exposure as a substitute for dimming the source. ${dimScope} ${missingEmitter} Preserve and turn-off actions take precedence; this action overrides brighten and template contributions only for the identified source and its attributable lighting.`;
    const geometry = light.type === "point" ? "a point emitter at" : light.type === "line" ? "a finite continuous linear emitter following only" : "an area emitter confined to the polygon";
    const fixture = light.mode === "lightOnly"
      ? "LIGHT ONLY: create the illumination without adding any visible fixture, strip, panel, lamp body or other physical object. Preserve all existing fixture bodies; their emission follows explicit original-light instructions."
      : `ADD FIXTURE AND LIGHT: create one coherent, physically plausible ${light.type === "point" ? "lamp or spotlight" : light.type === "line" ? "linear luminaire or LED strip" : "area luminaire or luminous panel"} confined to the marked emitter geometry; integrate it with the scene perspective and materials.${light.fixture ? ` Fixture appearance requested by the user: ${JSON.stringify(light.fixture)}.` : ""} Its emitted light must visibly illuminate the specified target.`;
    const extent = light.type === "line" ? " Stop the emitter at its marked endpoints. Do not extend it along the wall edge, around corners or into the existing cove network." : light.type === "area" ? " Keep the emitting area inside the marked polygon; illumination may fall onto nearby surfaces with plausible falloff." : "";
    return `Light ${index + 1}: [blue +, BRIGHTEN] ADD NEW LIGHT: add a new illumination contribution from ${geometry} ${light.points.map(displayPoint).join(" → ")}.${extent} Aim toward the visible scene surface at ${displayPoint(light.target)} (the arrow endpoint). Correlated color temperature intent: ${light.kelvin} K; relative brightness: ${light.intensity} (1 is a moderate local contribution matched to ${contributionBaseline}, not a global exposure increase; lower values create a dimmer new light, not a request to dim an existing source); ${light.softness === "soft" ? "soft, broad light with gentle shadow transitions" : "focused light with crisp shadow transitions"}. ${fixture} Marked preserve, turn-off and darken actions constrain this contribution only where it would counteract the identified original emitter or protected appearance. Whole-scene original-light handling does not suppress this separate new contribution.`;
  });
  const mode = rebuildLighting ? "REBUILD" : "LOCAL";
  return [
    bundle.ADAPTER.INTRO[mode],
    bundle.ADAPTER.INPUT[lights.length ? "GUIDED" : "PLAIN"],
    ...(lights.length && rebuildLighting ? [bundle.ADAPTER.REBUILD_GUIDE] : []),
    ...(lights.length ? [bundle.ADAPTER.GUIDE_LEGEND] : []),
    relightSceneInstructions(settings, bundle),
    bundle.ADAPTER.SCENE_CONSTRAINT[mode],
    relightPhotographicInstructions(settings, bundle),
    ...(originalLights ? [originalLightInstructions(originalLights)] : []),
    ...lightInstructions,
    ...(prompt ? [`Additional user lighting instruction: ${JSON.stringify(prompt)}. Apply it within the typed action priority and scene-preservation constraints above.`] : []),
    bundle.ADAPTER.OUTPUT[lights.length ? "GUIDED" : "PLAIN"],
  ].join("\n\n");
}

function guideSvg(lights, width, height) {
  const stroke = Math.max(2, Math.min(8, Math.round(Math.min(width, height) / 280)));
  const radius = Math.max(8, Math.min(24, Math.round(Math.min(width, height) / 45)));
  const pixel = point => ({ x: Math.round(point.x * (width - 1)), y: Math.round(point.y * (height - 1)) });
  const plans = lights.map((light, index) => {
    const points = light.points.map(pixel), center = pixel(relightCenter(light));
    const action = light.action || "brighten", guide = RELIGHT_ACTION_GUIDES[action];
    const target = action === "brighten" ? pixel(light.target) : null;
    if (target && Math.hypot(target.x - center.x, target.y - center.y) < RELIGHT_LIMITS.minTargetPixels) throw fail("照射目标与光源在原图上过近，请拉开方向箭头");
    if (light.type === "line" && points.every(point => Math.hypot(point.x - points[0].x, point.y - points[0].y) < 1)) throw fail("线光源落到原图后太短，请重新绘制");
    if (light.type === "area" && Math.abs(points.reduce((sum, point, pointIndex) => {
      const next = points[(pointIndex + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
    }, 0)) < 2) throw fail("面光源落到原图后太小，请重新绘制");
    const coordinates = points.map(point => `${point.x},${point.y}`).join(" ");
    const shape = light.type === "point" ? `<circle cx="${center.x}" cy="${center.y}" r="${radius / 2}"/>`
      : light.type === "line" ? `<polyline points="${coordinates}"/>` : `<polygon points="${coordinates}"/>`;
    const angle = target ? Math.atan2(target.y - center.y, target.x - center.x) : 0, head = radius;
    const arrow = target ? `<path d="M ${center.x} ${center.y} L ${target.x} ${target.y} M ${target.x - head * Math.cos(angle - Math.PI / 6)} ${target.y - head * Math.sin(angle - Math.PI / 6)} L ${target.x} ${target.y} L ${target.x - head * Math.cos(angle + Math.PI / 6)} ${target.y - head * Math.sin(angle + Math.PI / 6)}"/>` : "";
    const labelX = Math.max(radius + stroke, Math.min(width - radius - stroke, center.x + radius));
    const labelY = Math.max(radius + stroke, Math.min(height - radius - stroke, center.y - radius));
    const label = `<circle cx="${labelX}" cy="${labelY}" r="${radius}" fill="white"/><text x="${labelX}" y="${labelY}" fill="${guide.color}" stroke="none" font-family="sans-serif" font-size="${Math.round(radius * 0.95)}" font-weight="700" text-anchor="middle" dominant-baseline="central">${index + 1}${guide.symbol}</text>`;
    return `<g fill="none" stroke="${guide.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${shape}${arrow}${label}</g>`;
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${plans.join("")}</svg>`);
}

export async function prepareRelightInput(validated) {
  const { source, lights, outputResolution, quality } = validated;
  const target = relightOutputSize(source, outputResolution, RELIGHT_ONEAPI_MODEL.sizes);
  const sourceBytes = await sharp(Buffer.from(source.imageUrl.split(",")[1], "base64")).png().toBuffer();
  const guideBytes = lights.length
    ? await sharp(sourceBytes).composite([{ input: guideSvg(lights, source.width, source.height) }]).png().toBuffer() : null;
  const images = [sourceBytes, ...(guideBytes ? [guideBytes] : [])].map(bytes => ({ image_url: pngUrl(bytes) }));
  if (images.some(image => image.image_url.length > MAX_IMAGE_URL_CHARACTERS)) throw fail("转换PNG后超过GPT单图20MiB的image_url字符限制，请减小原图");
  return { sourceBytes, guideBytes, target,
    guideImage: guideBytes ? { imageUrl: images[1].image_url, mimeType: "image/png", fileName: "submitted-relight-guide.png", size: guideBytes.length } : null,
    request: { model: RELIGHT_ONEAPI_MODEL.id, images, prompt: buildRelightPrompt(validated), size: `${target.width}x${target.height}`,
      quality: relightQuality(quality), n: 1, output_format: "png", response_format: "b64_json" } };
}

export async function executeRelightOneApi(validated, { imageClient, onProgress = () => {} }) {
  if (typeof imageClient?.editImageAsync !== "function") throw fail("GPT打光客户端尚未配置", 409);
  const originalLights = normalizeRelightOriginalLights(validated.originalLights);
  const prepared = await prepareRelightInput({ ...validated, originalLights });
  const startedAt = Date.now();
  onProgress({ phase: "executing", message: validated.lights.length ? "GPT 正在协调照明方案与标注动作" : originalLights ? "GPT 正在整体调整原有灯光" : "GPT 正在适配原图风格与亮暗" });
  const generated = await imageClient.editImageAsync(prepared.request, {
    onSubmitted({ id, status }) { onProgress({ phase: "executing", message: "GPT打光已提交，正在后台生成", upstreamResponseId: id, upstreamStatus: status }); },
  });
  if (generated.images?.length !== 1) throw fail("GPT打光没有返回唯一结果图片", 502);
  const outputBytes = await loadImageBytes(generated.images[0].url);
  let native;
  try {
    const image = sharp(outputBytes, { failOn: "error", limitInputPixels: MASK_FILL_GPT_OUTPUT_LIMITS.maxOutputPixels });
    native = await image.metadata();
    if (native.format !== "png" || (native.pages || 1) !== 1) throw new Error("format");
    await image.stats();
  } catch { throw fail("GPT打光实际返回不是有效的单帧PNG图片", 502); }
  if (native.width !== prepared.target.width || native.height !== prepared.target.height) throw fail(`GPT打光实际返回${native.width}×${native.height}，与请求${prepared.request.size}不一致`, 502);
  const { source } = validated, outputSha256 = digest(outputBytes);
  const metadata = { provider: "oneapi", modelKey: RELIGHT_MODEL_KEY, model: RELIGHT_ONEAPI_MODEL.id,
    version: RELIGHT_WORKFLOW_VERSION, workflowVersion: RELIGHT_WORKFLOW_VERSION, prompt: prepared.request.prompt, sourcePrompt: validated.prompt,
    templateKey: validated.templateKey, blendMode: validated.blendMode, originalLights: structuredClone(originalLights), templateSource: validated.relightPromptSnapshot.source,
    relightPromptCode: validated.relightPromptSnapshot.code, relightPromptVersion: validated.relightPromptSnapshot.version,
    relightPromptSha256: validated.relightPromptSnapshot.sha256, relightPromptSource: validated.relightPromptSnapshot.source,
    lights: structuredClone(validated.lights), lightCount: validated.lights.length, referenceImageCount: prepared.request.images.length, sourceSha256: source.originalSha256,
    normalizedSourceSha256: source.sha256, submittedSourceSha256: digest(prepared.sourceBytes), guideSha256: prepared.guideBytes ? digest(prepared.guideBytes) : null,
    sourceWidth: source.width, sourceHeight: source.height, originalSourceWidth: source.originalSize.width, originalSourceHeight: source.originalSize.height,
    sourceOriented: source.oriented, inputWidth: source.width, inputHeight: source.height, inputFormat: "png", inputResized: false,
    outputResolution: validated.outputResolution, quality: prepared.request.quality, requestedSize: prepared.request.size,
    outputWidth: native.width, outputHeight: native.height, actualOutputWidth: native.width, actualOutputHeight: native.height,
    nativeOutputWidth: native.width, nativeOutputHeight: native.height, nativeOutputSha256: outputSha256, outputSha256,
    outputResized: false, protectedAreaComposited: false, postUpscaled: false, hasMask: false,
    calibratedLighting: false, requestId: generated.requestId || null, upstreamAsync: true, usageCost: generated.usageCost || null };
  return { durationMs: Date.now() - startedAt, images: [{ url: pngUrl(outputBytes) }],
    request: { model: RELIGHT_ONEAPI_MODEL.id, modelKey: RELIGHT_MODEL_KEY, provider: "oneapi", quality: prepared.request.quality,
      outputFormat: "png", outputResolution: validated.outputResolution, resolution: validated.outputResolution,
      referenceImageCount: prepared.request.images.length, lightCount: validated.lights.length, templateKey: validated.templateKey,
      blendMode: validated.blendMode, originalLights: structuredClone(originalLights), size: prepared.request.size, syncMode: "local-only" },
    sync: { generationId: null, status: "skipped" },
    upstream: { created: generated.created, outputFormat: "png", transport: generated.transport, requestId: generated.requestId || null,
      usageCost: generated.usageCost || null, metadata },
    workflow: { key: "gpt-image-relight", label: "GPT 打光", version: RELIGHT_WORKFLOW_VERSION }, archiveGuideImage: prepared.guideImage };
}
