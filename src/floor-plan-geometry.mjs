/**
 * [INPUT]: 依赖独立几何识图资产、OneAPI视觉目录、图片准入和HouseSpec校验
 * [OUTPUT]: 提供可选识图模型、几何任务准备及一次视觉识别
 * [POS]: 平面布局的图像转结构步骤，家具编辑和3D渲染由浏览器执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto';
import { checkAgentModelAvailability } from './agent-model-config.mjs';
import { getPublishedPromptAgent } from './prompt-agent.mjs';
import { FLOOR_PLAN_PROMPT_CONFIG } from './floor-plan-prompt.mjs';
import { normalizeFloorPlanReferenceImage } from './floor-plan-service.mjs';
import { parseFloorPlanOutput } from './floor-plan-spec.mjs';

const code = 'floor-plan-geometry';
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, floorPlanSafe: true });
async function readAsset() {
  try {
    const record = await getPublishedPromptAgent(code, { config: FLOOR_PLAN_PROMPT_CONFIG, forceRefresh: true });
    const body = record.systemPrompt.trim();
    if (!body || !record.published || record.code !== code) throw fail('几何识图资产不可用');
    return { code, version: record.version, sha256: createHash('sha256').update(body).digest('hex'), body };
  } catch { throw fail('请检查几何识图资产和飞书连接'); }
}
export async function readGeometryConfig({ getModels, getAsset = readAsset }) {
  const [catalog, asset] = await Promise.all([getModels({ forceRefresh: true }), getAsset()]);
  const models = checkAgentModelAvailability(catalog).filter(model => model.selectable)
    .map(({ key, id, label }) => ({ key, id, label }));
  const { version, sha256 } = asset;
  return { models, defaultModel: models.find(model => model.key === 'gemini3pro')?.key || models[0]?.key,
    prompt: { code, version, sha256 } };
}
async function check(input, getModels, getAsset) {
  const [catalog, asset] = await Promise.all([getModels({ forceRefresh: true }), getAsset()]);
  const model = checkAgentModelAvailability(catalog).find(entry => entry.key === input.modelKey && entry.selectable);
  if (!model) throw fail('所选识图模型当前不可用，请刷新并重新选择');
  if (input.promptSha256 !== asset.sha256 || input.promptVersion !== asset.version) throw fail('几何识图配置已更新，请刷新');
  return { model: { id: model.id, key: model.key, label: model.label }, asset };
}
export async function prepareGeometry(input, { getModels, getAsset = readAsset }) {
  const allowed = ['action', 'referenceImage', 'modelKey', 'promptVersion', 'promptSha256', 'userRequirements'];
  if (input.action !== 'geometry' || Object.keys(input).some(key => !allowed.includes(key))) throw fail('几何识图请求字段无效', 400);
  const userRequirements = input.userRequirements ?? '';
  if (typeof userRequirements !== 'string' || userRequirements.length > 4000) throw fail('布置要求最多4000字', 400);
  const reference = await normalizeFloorPlanReferenceImage(input.referenceImage);
  const { model } = await check(input, getModels, getAsset);
  return { action: 'geometry', ...reference, modelKey: model.key, model, userRequirements,
    promptSha256: input.promptSha256, promptVersion: input.promptVersion };
}
export async function executeGeometry(input, { client, getModels, getAsset = readAsset, onProgress }) {
  const { model, asset } = await check(input, getModels, getAsset);
  onProgress({ message: '正在识别墙体、门窗和家具' });
  let response;
  try {
    response = await client.generatePrompt({ imageUrl: input.imageUrl, model: model.id, systemPrompt: asset.body,
      userPrompt: JSON.stringify(input.userRequirements.trim() ? { user_requirements: input.userRequirements } : {}) });
    const { spec, warnings, userRequirements } = parseFloorPlanOutput(response.text);
    if (userRequirements !== (input.userRequirements.trim() ? input.userRequirements : undefined)) throw fail('识图结果未保留布置要求');
    return { action: 'geometry', spec, warnings, model, source: input.source, prompt: { code, version: asset.version, sha256: asset.sha256 },
      requestId: response.requestId, usageCost: response.usageCost };
  } catch (error) {
    const safe = error.floorPlanSafe ? error : fail('几何识图未完成，请检查任务状态', 502);
    if (response) safe.floorPlanDiagnostic = { requestId: response.requestId, usageCost: response.usageCost };
    throw safe;
  }
}
