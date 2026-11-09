/**
 * [INPUT]: 依赖独立飞书布局资产、视觉Agent目录、原图准入及共享单张图片执行原语
 * [OUTPUT]: 提供户型平面布局配置及飞书多版本身份目录、主卧/空间标注校验、16384-token完整Agent到一次生图、结构化方案及两阶段费用回执，服务端onCompiledPrompt回调供Beta归档
 * [POS]: src 的独立户型平面布局编排，默认GPT2.5，不改变实验室四动作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import sharp from 'sharp';
import { checkAgentModelAvailability } from './agent-model-config.mjs';
import { readFloorPlanConfig, normalizeFloorPlanReferenceImage, generateFloorPlanImage, FLOOR_PLAN_GPT_MODEL_KEYS, FLOOR_PLAN_MODEL_KEY } from './floor-plan-service.mjs';
import { decodeImageDataUrl, fitImageDataUrlForRequest } from './image-artifact.mjs';
import { getHousePlanPrompt, listHousePlanPrompts, housePlanHash, housePlanError as fail, parseHousePlanOutput } from './house-plan-prompt.mjs';
export const HOUSE_PLAN_WORKFLOW = '2026-11-06.house-plan.1';
const HOUSE_PLAN_AGENT_MAX_OUTPUT_TOKENS = 16_384;
const identity = ({ code, name, version, sha256, source, tableUrl }) => ({ code, name, version, sha256, source, tableUrl });
const receipt = response => ({ requestId: typeof response?.requestId === 'string' ? response.requestId.slice(0, 160) : null,
  usageCost: Object.fromEntries(Object.entries(response?.usageCost || {}).filter(([key, value]) =>
    ['cost', 'costUsd', 'nativeAmount', 'exchangeRate'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0)) });
export function validateHousePlanAnnotations(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw fail('请框选主卧，可选标注最多19个其他空间');
  const result = value.map((item, index) => {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join() !== 'height,label,width,x,y'
      || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 40
      || ['x','y','width','height'].some(key => typeof item[key] !== 'number' || !Number.isFinite(item[key]))
      || item.x < 0 || item.y < 0 || item.width < .005 || item.height < .005
      || item.x + item.width > 1.000001 || item.y + item.height > 1.000001) throw fail('空间标注范围或名称无效');
    if (index === 0 && item.label !== '主卧') throw fail('第一个标注必须是主卧');
    return { label: item.label, x: item.x, y: item.y, width: item.width, height: item.height };
  });
  if (result.slice(1).some(item => item.label === '主卧')) throw fail('只能指定一个主卧');
  return result;
}
export async function readHousePlanConfig({ getModels, getPrompt = getHousePlanPrompt } = {}) {
  const [base, assets, agents] = await Promise.allSettled([
    readFloorPlanConfig({ getModels, readPromptConfig: async () => ({ available: true, published: true }) }),
    getPrompt === getHousePlanPrompt ? listHousePlanPrompts() : getPrompt().then(asset => [asset]), getModels({ forceRefresh: true })]);
  const models = base.status === 'fulfilled' ? base.value.layoutModels : [];
  const agentModels = agents.status === 'fulfilled' ? checkAgentModelAvailability(agents.value).filter(model => model.selectable)
    .map(({ key, id, label }) => ({ key, id, label })) : [];
  const reason = assets.status === 'rejected' ? assets.reason.message : !models.some(model => model.available)
    ? '当前Key没有可用生图模型' : !agentModels.length ? '当前Key没有可用视觉Agent模型' : null;
  return { featureMode: 'housePlanLayout', workflowVersion: HOUSE_PLAN_WORKFLOW, available: !reason, reason,
    layoutModels: models, defaultModel: FLOOR_PLAN_MODEL_KEY, agentModels,
    defaultAgentModel: agentModels.find(model => model.key === 'gemini3pro')?.key || agentModels[0]?.key || null,
    promptVersionSelection: true,
    promptVersions: assets.status === 'fulfilled' ? assets.value.map(identity) : [],
    prompt: assets.status === 'fulfilled' ? identity(assets.value[0]) : null };
}
async function checkModels(input, getModels) {
  const config = await readHousePlanConfig({ getModels, getPrompt: async () => input.prompt });
  const model = config.layoutModels.find(model => model.key === input.modelKey && model.available);
  const agent = config.agentModels.find(model => model.key === input.agentModelKey);
  if (!model || !agent) throw fail('所选生图或Agent模型不可用，请刷新后重新选择', 409);
  return { model, agent };
}
export async function prepareHousePlanInput(input, { getModels, getPrompt = getHousePlanPrompt } = {}) {
  const allowed = ['action','referenceImage','annotations','userRequirements','modelKey','agentModelKey','promptVersion','promptSha256'];
  if (!input || input.action !== 'layout' || Object.keys(input).some(key => !allowed.includes(key))) throw fail('户型平面布局请求字段无效');
  const annotations = validateHousePlanAnnotations(input.annotations);
  const userRequirements = input.userRequirements ?? '';
  if (typeof userRequirements !== 'string' || userRequirements.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(userRequirements)) throw fail('特殊需求最多4000字');
  if (!Number.isSafeInteger(input.promptVersion) || input.promptVersion < 1 || !/^[a-f0-9]{64}$/.test(input.promptSha256 || '')) throw fail('请刷新Prompt配置');
  const prompt = await getPrompt({ version: input.promptVersion, expectedSha256: input.promptSha256 });
  const fields = { action: 'layout', modelKey: input.modelKey || FLOOR_PLAN_MODEL_KEY, agentModelKey: input.agentModelKey,
    annotations, userRequirements, prompt };
  const { model, agent } = await checkModels(fields, getModels);
  const reference = await normalizeFloorPlanReferenceImage(input.referenceImage);
  if (!FLOOR_PLAN_GPT_MODEL_KEYS.includes(fields.modelKey)) {
    reference.imageUrl = await fitImageDataUrlForRequest(reference.imageUrl);
  }
  const bytes = decodeImageDataUrl(reference.imageUrl), metadata = await sharp(bytes).metadata();
  reference.source = { ...reference.source, submittedSha256: housePlanHash(bytes), submittedFormat: metadata.format,
    submittedWidth: metadata.width, submittedHeight: metadata.height };
  return { ...fields, ...reference, model, agent, defaults: model.defaults };
}
export async function executeHousePlan(input, { client, getModels, getPrompt = getHousePlanPrompt, onProgress = () => {}, onCompiledPrompt = () => {} } = {}) {
  const asset = await getPrompt({ version: input.prompt.version, expectedSha256: input.prompt.sha256 });
  if (asset.source !== input.prompt.source) throw fail('布局资产来源已变化，请刷新', 409);
  const { model, agent } = await checkModels(input, getModels);
  if (model.id !== input.model.id || agent.id !== input.agent.id) throw fail('模型身份已变更，请刷新', 409);
  const imageMethod = FLOOR_PLAN_GPT_MODEL_KEYS.includes(input.modelKey) ? "editImageAsync" : "generateImage";
  if (typeof client?.generatePrompt !== "function" || typeof client?.[imageMethod] !== "function") throw fail("布局模型连接未就绪", 409);
  const startedAt = Date.now();
  let agentResponse;
  try {
    onProgress({ message: 'Prompt Agent 正在分析户型、主卧和功能分配…' });
    agentResponse = await client.generatePrompt({ maxOutputTokens: HOUSE_PLAN_AGENT_MAX_OUTPUT_TOKENS, requireCompleteOutput: true, model: agent.id, imageUrl: input.imageUrl, systemPrompt: asset.prompt,
      userPrompt: JSON.stringify({ ...(input.userRequirements.trim() ? { user_requirements: input.userRequirements } : {}),
        annotations: input.annotations, coordinate_system: 'normalized_0_1_top_left_origin',
        ...(!input.userRequirements.trim() ? { default_requirements: '普通家庭默认布局，按系统提示词中的默认规则执行' } : {}),
        output_contract: {
          stage: '当前仅进行文字布局分析，尚未生图；系统随后会调用图像模型。',
          format: '仅输出完整JSON，不含Markdown围栏。无法识别有效户型时spaces留空，warnings说明原因，不编造户型。',
          summary: '简短说明房间功能、卧室/卫生间数量、需求落实情况与采用的理解，最多2000字',
          spaces: [{ name: '空间名称，最多80字', layout: '该空间家具和相对位置，最多2000字' }],
          layout_prompt: '交给生图模型的完整布局方案，保留系统提示词全部约束，最多16000字',
          warnings: ['待核对尺寸/功能及未满足需求，每项最多500字，最多30项']
        } }) });
    const plan = parseHousePlanOutput(agentResponse.text);
    // --- 用户原文置前；Agent结构化布局与固定出图规则同次交给图像模型 ---
    const finalPrompt = [input.userRequirements.trim() ? input.userRequirements : null,
      JSON.stringify({ annotations: input.annotations, ...plan }), asset.prompt].filter(Boolean).join('\n\n');
    onCompiledPrompt(finalPrompt);
    await checkModels(input, getModels);
    await getPrompt({ version: input.prompt.version, expectedSha256: input.prompt.sha256 });
    onProgress({ message: '布局方案已整理，正在生成平面布局图…' });
    const result = await generateFloorPlanImage(input, { client, prompt: finalPrompt, onProgress });
    const bytes = decodeImageDataUrl(result.url), metadata = await sharp(bytes).metadata();
    const image = { url: result.url, width: metadata.width, height: metadata.height, type: 'image/png', sha256: housePlanHash(bytes) };
    return { action: 'layout', featureMode: 'housePlanLayout', workflowVersion: HOUSE_PLAN_WORKFLOW, image,
      model: { key: model.key, id: model.id, label: model.label }, agent, source: input.source,
      annotations: input.annotations, userRequirements: input.userRequirements, plan, prompt: identity(asset),
      compiledPromptSha256: housePlanHash(finalPrompt), receipts: { agent: receipt(agentResponse), image: receipt(result.response) },
      actual: result.actual, durationMs: Date.now() - startedAt };
  } catch (error) {
    const safe = error.floorPlanSafe ? error : error.code === 'incomplete_prompt'
      ? fail('布局Agent输出被截断，未调用生图模型；请手动重试或更换分析模型', 502)
      : fail('户型布局任务未完成，请检查原任务；不会自动重试', 502);
    safe.floorPlanDiagnostic = { agent: receipt(agentResponse || error), ...(error.floorPlanDiagnostic ? { image: error.floorPlanDiagnostic } : {}) };
    throw safe;
  }
}
