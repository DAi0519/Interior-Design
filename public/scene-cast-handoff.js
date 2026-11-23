/**
 * [INPUT]: 依赖工作台已完成的各类渲染结果、参数白名单与同源嵌入消息
 * [OUTPUT]: 提供图像交接描述、只读原渲染参数快照、嵌入和独立入口的发送逻辑
 * [POS]: public 的渲染结果到添加人物/宠物的传递边界，不读取私有提示词与令牌
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const SCENE_CAST_MODE = "sceneCast";
export const SCENE_CAST_PAGE = "/scene-cast.html?embedded=1";
export const SCENE_CAST_LABEL = "添加人物/宠物";
export const SCENE_CAST_OPEN = "canvas-lab:scene-cast:open";
export const SCENE_CAST_IMPORT = "canvas-lab:scene-cast:import";

const FEATURE_LABELS = {
  aiRenderStudio: "AI渲染台",
  floorPlanCamera: "平面图机位渲染",
  whiteModel: "白模渲染",
  refinedModel: "精模渲染",
  effectBeautification: "效果图美化",
  effectEnhancement: "效果图氛围转换",
  textureEnhancement: "质感增强",
  lightingTransfer: "光影转换",
};
export const canSendRenderResultToSceneCast = featureMode => Object.hasOwn(FEATURE_LABELS, featureMode);

const present = entries => Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== null && value !== ""));
const pick = (value, keys) => present(Object.fromEntries(keys.map(key => [key, value?.[key]])));
const nonempty = value => Object.keys(value).length ? value : undefined;
const labelForStyle = { photoreal: "写实摄影", soft: "柔和表现", cinematic: "电影质感", film: "胶片质感" };
const LIGHTING_FIELDS = ["id", "presetId", "name", "presetName", "code", "mode", "execution", "version", "sha256", "promptSha256", "ruleVersion", "ruleSha256", "atmosphere", "intensity", "tone", "time", "weather"];
const REQUEST_FIELDS = ["ratio", "sizeMode", "outputFormat", "provider", "transport", "negativePromptMode", "referenceImageCount",
  "lightCount", "templateKey", "blendMode", "originalLights", "effectBeautification"];
const METADATA_FIELDS = ["engine", "provider", "seed", "steps", "cfg", "sampler", "scheduler", "denoise", "upscaleResolution",
  "upscaleWorkflowKey", "upscaleWorkflowLabel", "nativeOutputWidth", "nativeOutputHeight", "lightingPlanSha256", "originalLights",
  "lights", "fullFrameEquivalentFocalLengthMm", "visibilityMode", "generationMode", "referenceImageRole", "referenceImageSha256", "aspectRatio"];

export function sourceRenderDraft(input) {
  const fields = ["prompt", "negativePrompt", "ratioMode"];
  if (input.featureMode === "whiteModel") fields.push("renderMode", "promptAgentModelKey", "promptAgentVersion", "styleCode");
  if (input.featureMode === "effectEnhancement") fields.push("effectTime", "effectWeather");
  return pick(input, fields);
}

export function renderResultSceneCastPayload({ featureMode, jobId, index, modelKey, modelLabel, result, draft = {} }) {
  if (!canSendRenderResultToSceneCast(featureMode)) return null;
  const request = result?.request || {};
  const metadata = result?.upstream?.metadata || {};
  const actual = result?.actual || {};
  const image = result?.image || result?.images?.[0];
  if (!image?.url) return null;
  const featureLabel = FEATURE_LABELS[featureMode];
  const outputFormat = (request.outputFormat || image.type?.slice(6) || result.upstream?.outputFormat || "png").toLowerCase();
  const size = request.size || actual.size || (image.width && image.height ? `${image.width}x${image.height}` : undefined);
  const dimensions = typeof size === "string" ? size.match(/^(\d+)x(\d+)$/i) : null;
  const lighting = request.lightingPreset || result.refinedLighting || request.effectBeautificationLighting
    || result.whiteModelLighting || result.refinedRender || request.effectBeautification;
  const lightingPreset = nonempty(pick(lighting, LIGHTING_FIELDS))
    || (featureMode === "aiRenderStudio" && Object.hasOwn(request, "lightingPreset") ? { name: "原光影" } : undefined);
  const style = request.renderStyle || metadata.renderStyle || result.style?.name;
  const parameters = nonempty(present({
    ...pick(request, REQUEST_FIELDS),
    ...pick(metadata, METADATA_FIELDS),
    ...pick(actual, METADATA_FIELDS),
    ...pick(draft, ["negativePrompt", "ratioMode", "effectTime", "effectWeather", "promptAgentModelKey", "promptAgentVersion", "styleCode"]),
    renderMode: result.renderMode || result.generationMode || draft.renderMode,
    style: nonempty(pick(result.style, ["code", "name", "version"])),
    promptAgent: nonempty(pick(result.promptAgent || result.agent, ["key", "id", "model", "label", "name", "version"])),
    camera: nonempty(pick(result.camera || actual.camera, ["x", "y", "heading", "fov", "height", "guideDepth", "showFrame"])),
    requestedComplexity: result.requestedComplexity,
    actualPromptSha256: result.compiledPromptSha256 || metadata.submittedPromptSha256,
  }));
  const workflow = nonempty(present({
    ...pick(result.workflow, ["key", "label", "version"]),
    version: result.workflow?.version || result.workflowVersion || metadata.workflowVersion,
    promptCode: result.prompt?.code || result.promptAgent?.code || metadata.promptCode,
  }));
  const sourceRender = present({
    featureMode, featureLabel, jobId,
    modelKey: request.modelKey || result.model?.key || metadata.modelKey || modelKey,
    model: modelLabel || result.model?.label || request.model || metadata.model,
    resolution: request.resolution || request.outputResolution || result.resolution || metadata.outputResolution,
    quality: request.quality ?? actual.quality ?? metadata.quality,
    size,
    width: image.width || actual.actualOutputWidth || metadata.actualOutputWidth || (dimensions ? Number(dimensions[1]) : undefined),
    height: image.height || actual.actualOutputHeight || metadata.actualOutputHeight || (dimensions ? Number(dimensions[2]) : undefined),
    renderStyle: labelForStyle[style] || style,
    materialMode: request.materialMode || metadata.materialMode,
    lightingPreset,
    sourcePrompt: result.userRequirements ?? metadata.sourcePrompt ?? draft.prompt,
    actualPrompt: result.compiledPrompt || result.finalPrompt || metadata.prompt,
    promptVersion: result.prompt?.version || result.promptAgent?.version || metadata.promptVersion,
    promptSha256: result.prompt?.sha256 || metadata.promptSha256 || result.compiledPromptSha256,
    outputSha256: image.sha256 || actual.outputSha256 || metadata.outputSha256,
    requestId: result.requestId || result.upstream?.requestId || metadata.requestId,
    parameters, workflow, origin: present({ kind: "render-result", index, outputFormat, modelId: request.model || result.model?.id || metadata.model }),
  });
  return { imageUrl: image.url, modelLabel: sourceRender.model || featureLabel, outputFormat, sourceRender };
}

export function sendResultToSceneCast(payload, win = window) {
  if (!payload) return;
  const origin = win.location.origin;
  if (win.parent !== win && new URLSearchParams(win.location.search).get("embedded") === "1") {
    win.parent.postMessage({ type: SCENE_CAST_OPEN, payload }, origin);
    return;
  }

  // --- 直接访问独立渲染页时，在同一页打开合成工具。 ---
  const doc = win.document;
  let dialog = doc.querySelector("#sceneCastHandoffDialog");
  if (!dialog) {
    dialog = doc.createElement("dialog");
    dialog.id = "sceneCastHandoffDialog";
    dialog.className = "scene-cast-handoff-dialog";
    dialog.setAttribute("aria-label", SCENE_CAST_LABEL);
    const close = doc.createElement("button");
    close.type = "button"; close.textContent = "关闭";
    close.addEventListener("click", () => dialog.close());
    const frame = doc.createElement("iframe");
    frame.title = SCENE_CAST_LABEL; frame.src = SCENE_CAST_PAGE;
    frame.addEventListener("load", () => { frame.dataset.ready = "true"; });
    dialog.append(close, frame);
    doc.body.append(dialog);
  }
  const frame = dialog.querySelector("iframe");
  const send = () => frame.contentWindow?.postMessage({ type: SCENE_CAST_IMPORT, payload }, origin);
  if (frame.dataset.ready === "true") send();
  else frame.addEventListener("load", send, { once: true });
  if (!dialog.open) dialog.showModal();
}
