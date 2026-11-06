/**
 * [INPUT]: 依赖独立渲染台Prompt/归档Schema、共享氛围卡片、打光原图与typed几何、单次Sunburst及异步归档
 * [OUTPUT]: 含GPT2.6 Sunburst/Flare独立模型身份； 对外提供真实卡片目录/正文冻结重验、用户原文和typed控光前置的四风格单次编译、私有回执及已有结果归档工厂
 * [POS]: src 的AI渲染台应用服务，不串行调用精模；生成失败不自动重试，归档失败保留原生结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { MODEL_CONFIGS } from "./model-config.mjs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readImageRelightConfig, validateRelightInput } from "./image-relight-service.mjs";
import { executeRelightOneApi, buildRelightActionInstructions } from "./image-relight-oneapi.mjs";
import { RELIGHT_BLEND_MODES } from "../public/image-relight-presets.js";
import { getAiRenderStudioPrompt, publicAiRenderStudioPromptConfig, parseAiRenderStudioPrompt,
  AI_RENDER_STUDIO_PROMPT_CODE, AI_RENDER_STUDIO_PROMPT_CONFIG } from "./ai-render-studio-prompt.mjs";
import { AI_RENDER_STUDIO_WORKFLOW_VERSION, AI_RENDER_STUDIO_MATERIAL_MODES, AI_RENDER_STUDIO_RENDER_STYLES,
  AI_RENDER_STUDIO_IMAGE_POLICY } from "./ai-render-studio-definitions.mjs";
export { AI_RENDER_STUDIO_WORKFLOW_VERSION, AI_RENDER_STUDIO_MATERIAL_MODES, AI_RENDER_STUDIO_RENDER_STYLES,
  AI_RENDER_STUDIO_IMAGE_POLICY } from "./ai-render-studio-definitions.mjs";
import { verifyAiRenderStudioSyncSchema, buildAiRenderStudioArchive } from "./ai-render-studio-archive.mjs";
import { AI_RENDER_STUDIO_ORIGINAL_LIGHTING_LABEL, readAiRenderStudioLightingConfig, prepareAiRenderStudioLightingPreset,
  assertAiRenderStudioLightingPresetCurrent, aiRenderStudioLightingPresetIdentity, aiRenderStudioLightingPlan } from "./ai-render-studio-lighting.mjs";
const privatePrepared = new WeakSet();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const INPUT_FIELDS = new Set(["referenceImages", "templateKey", "blendMode", "originalLights", "lights", "prompt", "materialMode",
  "modelKey", "provider", "quality", "outputResolution", "studioPromptVersion", "studioPromptSha256", "renderStyle", "lightingPreset"]);
const verifyStudioSyncContract = (options = {}) => verifyAiRenderStudioSyncSchema(undefined, options);

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function promptSelection(input) {
  const version = input.studioPromptVersion;
  const expectedSha256 = input.studioPromptSha256;
  if (version !== undefined && (!["number", "string"].includes(typeof version) || !Number.isInteger(Number(version)) || Number(version) < 1)) {
    throw fail("AI渲染台Prompt版本必须是正整数");
  }
  if (expectedSha256 !== undefined && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(expectedSha256))) {
    throw fail("AI渲染台Prompt摘要必须是SHA-256");
  }
  return { ...(version !== undefined ? { version: Number(version) } : {}),
    ...(expectedSha256 !== undefined ? { expectedSha256: expectedSha256.toLowerCase() } : {}) };
}

function checkedSnapshot(snapshot, selection) {
  let bundle;
  try { bundle = parseAiRenderStudioPrompt(snapshot?.prompt); }
  catch { throw fail("AI渲染台Prompt资产结构无效，已阻止生成", 409); }
  const source = `feishu:${AI_RENDER_STUDIO_PROMPT_CONFIG.tableId}:${AI_RENDER_STUDIO_PROMPT_CODE}@v${snapshot?.version}`;
  if (snapshot?.code !== AI_RENDER_STUDIO_PROMPT_CODE || snapshot.published !== true
    || !Number.isInteger(snapshot.version) || snapshot.version < 1 || snapshot.source !== source
    || snapshot.sha256 !== digest(snapshot.prompt) || !isDeepStrictEqual(bundle, snapshot.bundle)
    || selection.version !== undefined && selection.version !== snapshot.version
    || selection.expectedSha256 !== undefined && selection.expectedSha256 !== snapshot.sha256) {
    throw fail("AI渲染台Prompt快照与冻结身份不一致，请刷新配置", 409);
  }
  return structuredClone(snapshot);
}

async function assertModelAccess(getOneApiModels, modelKey) {
  let models;
  try { models = getOneApiModels ? await getOneApiModels() : []; }
  catch { throw fail("无法确认当前OneAPI Key的所选GPT图像模型权限，请检查连接", 409); }
  if (!Array.isArray(models) || !models.some((entry) => entry.id === MODEL_CONFIGS[modelKey]?.id)) {
    throw fail("当前OneAPI Key没有所选GPT图像模型权限，请重新连接", 409);
  }
}

export async function readAiRenderStudioConfig({ getOneApiModels, forceRefresh = false,
  readPromptConfig = publicAiRenderStudioPromptConfig, verifySyncContract = verifyStudioSyncContract, loadLightingAssets } = {}) {
  const safeModels = getOneApiModels ? async () => {
    try { return await getOneApiModels(); }
    catch { throw new Error("无法读取当前模型权限"); }
  } : undefined;
  const safePromptConfig = async (options) => {
    try { return await readPromptConfig(options); }
    catch { return { available: false, reason: "AI渲染台Prompt读取失败，请检查连接" }; }
  };
  const { legacyTemplates, ...config } = await readImageRelightConfig({ getOneApiModels: safeModels, forceRefresh, readPromptConfig: safePromptConfig });
  const lighting = await readAiRenderStudioLightingConfig({ loadAssets: loadLightingAssets, forceRefresh });
  let syncAvailable = true, syncReason = null;
  try { await verifySyncContract({ lightingPresetNames: lighting.lightingPresets.map((preset) => preset.name) }); }
  catch (error) { syncAvailable = false; syncReason = error.statusCode === 409 ? error.message : "AI渲染台飞书同步连接不可用"; }
  return { ...config, available: config.available && syncAvailable, reason: config.reason || syncReason,
    syncAvailable, syncReason, ...lighting, featureMode: "aiRenderStudio", feature: "ai-render-studio", syncMode: "lark", imagePolicy: AI_RENDER_STUDIO_IMAGE_POLICY,
    templates: [{ key: "custom", label: AI_RENDER_STUDIO_ORIGINAL_LIGHTING_LABEL, description: "沿用原光影，或选择光影氛围卡并按需手动控光" }],
    version: AI_RENDER_STUDIO_WORKFLOW_VERSION, defaultTemplateKey: "custom", defaultBlendMode: "balanced",
    defaultOriginalLights: { action: "keep" }, materialModes: AI_RENDER_STUDIO_MATERIAL_MODES,
    defaultMaterialMode: "faithful", renderStyles: AI_RENDER_STUDIO_RENDER_STYLES, defaultRenderStyle: "photoreal", maxCount: 1 };
}

export async function prepareAiRenderStudioInput(input = {}, { getPrompt = getAiRenderStudioPrompt, getOneApiModels,
  verifySyncContract = verifyStudioSyncContract, loadLightingAssets } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("AI渲染台请求必须是有效对象");
  if (Object.keys(input).some((key) => !INPUT_FIELDS.has(key))) throw fail("AI渲染台请求包含不支持的字段或客户端Prompt正文");
  const materialMode = input.materialMode === undefined ? "faithful" : input.materialMode;
  if (!AI_RENDER_STUDIO_MATERIAL_MODES.some((entry) => entry.key === materialMode)) throw fail("请选择有效的材质表现档位");
  const renderStyle = input.renderStyle === undefined ? "photoreal" : input.renderStyle;
  if (!AI_RENDER_STUDIO_RENDER_STYLES.some((entry) => entry.key === renderStyle)) throw fail("请选择有效的渲染风格");
  const templateKey = input.templateKey === undefined ? "custom" : input.templateKey;
  if (templateKey !== "custom") throw fail("AI渲染台请使用现有光影氛围库，旧打光模板不再适用");
  const selection = promptSelection(input);
  const { studioPromptVersion, studioPromptSha256, materialMode: unusedMaterialMode, renderStyle: unusedRenderStyle,
    lightingPreset: requestedLightingPreset, ...relightInput } = input;
  const validated = await validateRelightInput({ ...relightInput, templateKey,
    ...(templateKey === "custom" && input.originalLights === undefined ? { originalLights: { action: "keep" } } : {}) },
  { allowMaterialRender: true, imagePolicy: AI_RENDER_STUDIO_IMAGE_POLICY });
  const lightingPreset = await prepareAiRenderStudioLightingPreset(requestedLightingPreset, { loadAssets: loadLightingAssets });
  const snapshot = checkedSnapshot(await getPrompt({ ...selection, forceRefresh: true }), selection);
  await assertModelAccess(getOneApiModels, validated.modelKey);
  await verifySyncContract({ modelKey: validated.modelKey, lightingPresetNames: lightingPreset ? [lightingPreset.name] : [] });
  const preparedValidated = { ...validated, materialMode, renderStyle, lightingPreset, relightPromptSnapshot: snapshot };
  const prepared = freeze({ validated: preparedValidated, snapshot, materialMode, renderStyle,
    compiledPrompt: buildAiRenderStudioPrompt(preparedValidated) });
  privatePrepared.add(prepared);
  return prepared;
}

export function buildAiRenderStudioPrompt(validated) {
  const snapshot = validated.relightPromptSnapshot;
  if (snapshot?.code !== AI_RENDER_STUDIO_PROMPT_CODE) throw fail("AI渲染台Prompt资产未冻结", 409);
  const bundle = snapshot.bundle;
  const blend = RELIGHT_BLEND_MODES.find((entry) => entry.key === validated.blendMode);
  if (!bundle?.materialModes?.[validated.materialMode] || !bundle?.renderStyles?.[validated.renderStyle] || validated.templateKey !== "custom" || !blend) throw fail("AI渲染台编译参数不完整", 409);
  const inputRoles = validated.lights.length
    ? "INPUT ROLES: image 1 is the clean source scene. Image 2 repeats that same scene with numbered editing guides only; execute their typed light actions. Blue + adds illumination, purple - dims an identified existing emitter, red x switches one off, and green = protects marked content. Marks and arrows are not design objects and must not appear in the output."
    : "INPUT ROLES: image 1 is the only source scene. No guide image or invented marked light location is supplied.";
  const frozenPlan = aiRenderStudioLightingPlan(validated);
  const plan = { ...frozenPlan, lightingPreset: aiRenderStudioLightingPresetIdentity(frozenPlan.lightingPreset),
    templateIntent: frozenPlan.lightingPreset ? "适配所选光影氛围卡；明确的整体原灯处理及标注动作高于卡片默认"
      : "沿用原图照明基线，仅执行明确的原灯处理与标注动作；材质真实感增强不自动重建布光" };
  const priority = "LIGHTING PRIORITY: confirmed source-scene facts and scene-preservation boundaries come first, then explicit user requirements, then typed original-light and marked-light controls, then the atmosphere card defaults. Resolve conflicting card instructions within the confirmed scene and explicit controls; never add an opening or invent a visible emitter to satisfy a card.";
  return [validated.prompt,
    `TYPED LIGHTING PLAN: ${JSON.stringify(plan)}`,
    ...buildRelightActionInstructions(validated), bundle.renderBoundary, bundle.lightingBoundary, priority, inputRoles,
    frozenPlan.lightingPreset ? `[LIGHTING ATMOSPHERE]\n${frozenPlan.lightingPreset.prompt}` : null,
    bundle.materialModes[validated.materialMode], bundle.renderStyles[validated.renderStyle],
    bundle.output].filter(Boolean).join("\n\n");
}

export async function executeAiRenderStudio(prepared, { imageClient, getOneApiModels, onProgress = () => {}, onReceipt = null,
  jobId = null, scheduleSync = null, verifySyncContract = verifyStudioSyncContract, loadLightingAssets } = {}) {
  if (!privatePrepared.has(prepared)) throw fail("AI渲染台任务缺少服务端准备状态", 409);
  await assertModelAccess(getOneApiModels, prepared.validated.modelKey);
  await assertAiRenderStudioLightingPresetCurrent(prepared.validated.lightingPreset, { loadAssets: loadLightingAssets });
  await verifySyncContract({ modelKey: prepared.validated.modelKey, lightingPresetNames: prepared.validated.lightingPreset ? [prepared.validated.lightingPreset.name] : [] });
  let completed;
  try {
    completed = await executeRelightOneApi(prepared.validated, { imageClient, buildPrompt: buildAiRenderStudioPrompt, onProgress });
  } catch (error) {
    // --- 上游异常不携带请求正文进入浏览器，也不触发第二次收费请求 ---
    throw fail(error.statusCode === 400 ? "AI渲染台输入在送模前校验失败，请检查图片与光源标注"
      : "AI渲染台生成未完成，请检查连接或稍后查看任务状态", error.statusCode === 400 ? 400 : error.statusCode === 409 ? 409 : 502);
  }
  const { prompt, sourcePrompt, relightPromptCode, relightPromptVersion, relightPromptSha256, relightPromptSource,
    templateSource, ...publicMetadata } = completed.upstream.metadata;
  const { archiveGuideImage, ...result } = completed;
  const { snapshot, validated, materialMode, renderStyle } = prepared;
  const lightingPlan = aiRenderStudioLightingPlan(validated);
  const lightingPreset = aiRenderStudioLightingPresetIdentity(validated.lightingPreset);
  const identity = { code: snapshot.code, version: snapshot.version, sha256: snapshot.sha256, source: snapshot.source };
  const receipt = freeze({ feature: "ai-render-studio", workflowVersion: AI_RENDER_STUDIO_WORKFLOW_VERSION,
    prompt, sourcePrompt, promptAsset: identity, materialMode, renderStyle, lightingPlan: structuredClone(lightingPlan),
    lightingPreset: structuredClone(validated.lightingPreset),
    sourceSha256: publicMetadata.sourceSha256, guideSha256: publicMetadata.guideSha256,
    outputSha256: publicMetadata.outputSha256, requestId: completed.upstream.requestId });
  if (onReceipt) {
    try { await onReceipt(receipt); }
    catch { /* 私有回执写入失败不丢弃已完成且已收费的原生图片。 */ }
  }
  const syncMode = scheduleSync ? "lark" : "local-only";
  const metadata = { ...publicMetadata, feature: "ai-render-studio", materialMode, renderStyle, lightingPreset,
    version: AI_RENDER_STUDIO_WORKFLOW_VERSION, workflowVersion: AI_RENDER_STUDIO_WORKFLOW_VERSION,
    promptCode: identity.code, promptVersion: identity.version, promptSha256: identity.sha256, promptSource: identity.source,
    submittedPromptSha256: digest(prompt), lightingPlanSha256: digest(JSON.stringify(lightingPlan)), syncMode };
  const publicResult = { ...result, request: { ...result.request, feature: "ai-render-studio", materialMode, renderStyle, lightingPreset, syncMode },
    upstream: { ...result.upstream, metadata },
    workflow: { key: "ai-render-studio", label: "AI渲染台", version: AI_RENDER_STUDIO_WORKFLOW_VERSION } };
  if (!scheduleSync) return publicResult;
  const privateCompleted = { ...publicResult, upstream: { ...publicResult.upstream,
    metadata: { ...metadata, prompt, sourcePrompt, lightingPreset: structuredClone(validated.lightingPreset) } } };
  const sync = scheduleSync(() => buildAiRenderStudioArchive({ jobId, prepared, result: privateCompleted, guideImage: archiveGuideImage }));
  return { ...publicResult, sync };
}
