/**
 * [INPUT]: 依赖飞书已上架Agent版本、户型布局专表及共享自由设计正文校验
 * [OUTPUT]: 提供独立原文资产、多版本/SHA校验和纯文本/旧JSON兼容解析，展示字段不再阻断有效布局正文
 * [POS]: src 的户型平面布局Prompt合同，正文仅存飞书，不回退旧实验室
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto';
import { getPublishedPromptAgent, listPublishedPromptAgentVersions } from './prompt-agent.mjs';
import { normalizeDesignPromptOutput } from './design-prompt-output.mjs';
export const HOUSE_PLAN_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_HOUSE_PLAN_PROMPT_BASE_TOKEN || 'SALobKnnra17iSsGT2ccC52PnHd',
  tableId: process.env.LARK_HOUSE_PLAN_PROMPT_TABLE_ID || 'tblzPGZ7rKzKVqjE',
  cliPath: process.env.LARK_CLI_PATH || 'lark-cli', displayNameField: 'Agent 名称',
});
export const HOUSE_PLAN_CODE = 'house-plan-layout';
export const housePlanHash = value => createHash('sha256').update(value).digest('hex');
export const housePlanError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, floorPlanSafe: true });
export async function getHousePlanPrompt({ version, expectedSha256, getAgent = getPublishedPromptAgent,
  listVersions = listPublishedPromptAgentVersions } = {}) {
  try {
    const options = { config: HOUSE_PLAN_PROMPT_CONFIG, forceRefresh: true };
    const versions = await listVersions(HOUSE_PLAN_CODE, options);
    if (!versions.length || versions.some(item => !Number.isSafeInteger(item.version) || item.version < 1)
      || new Set(versions.map(item => item.version)).size !== versions.length) throw new Error('versions');
    const selected = version === undefined ? Math.max(...versions.map(item => item.version)) : version;
    if (!versions.some(item => item.version === selected)) throw housePlanError('所选Prompt版本已下架或不存在，请刷新后重新选择', 409);
    const record = await getAgent(HOUSE_PLAN_CODE, { ...options, version: selected });
    const prompt = record.systemPrompt?.trim();
    if (!prompt || prompt.length > 20000 || !record.published || record.code !== HOUSE_PLAN_CODE || record.version !== selected) throw new Error('asset');
    const sha256 = housePlanHash(prompt);
    if ((version !== undefined && version !== record.version) || (expectedSha256 !== undefined && expectedSha256 !== sha256)) {
      throw housePlanError('户型平面布局Prompt已变更，请刷新配置', 409);
    }
    return { code: HOUSE_PLAN_CODE, name: '户型平面布局 Prompt', version: record.version, sha256,
      source: `feishu:${HOUSE_PLAN_PROMPT_CONFIG.tableId}:${HOUSE_PLAN_CODE}@v${record.version}`,
      published: true, prompt, tableUrl: `https://lq9n5lvfn2i.feishu.cn/base/${HOUSE_PLAN_PROMPT_CONFIG.baseToken}?table=${HOUSE_PLAN_PROMPT_CONFIG.tableId}` };
  } catch (error) { throw error.floorPlanSafe ? error : housePlanError('户型平面布局Prompt未就绪，请检查飞书独立配置', 409); }
}
// --- 配置只暴露已上架版本身份；正文仍只在服务端读取 ---
export async function listHousePlanPrompts() {
  const versions = await listPublishedPromptAgentVersions(HOUSE_PLAN_CODE, { config: HOUSE_PLAN_PROMPT_CONFIG, forceRefresh: true });
  const assets = await Promise.all(versions.map(({ version }) => getHousePlanPrompt({ version, listVersions: async () => versions })));
  return assets.sort((a, b) => b.version - a.version);
}
export function parseHousePlanOutput(text) {
  let body;
  try { body = normalizeDesignPromptOutput(text); }
  catch (error) { throw housePlanError(`${error.message}，未调用生图模型`, 502); }
  let output;
  try { output = JSON.parse(body); } catch { output = body; }
  const hasText = value => typeof value === 'string' && Boolean(value.trim());
  // --- 元信息不是布局；字段名称和展示信息不作为生图方案的固定格式门槛。 ---
  const metadata = new Set(['summary', 'warnings', 'status', 'error', 'message', 'reason', 'refusal', 'name']);
  const hasLayout = value => typeof value === 'string' ? Boolean(value.trim())
    : value && typeof value === 'object' && Object.entries(value).some(([key, item]) => !metadata.has(key) && hasLayout(item));
  if (!hasLayout(output) || output?.error || output?.refusal
    || ['error', 'failed', 'unresolvable'].includes(output?.status)) {
    throw housePlanError('Agent未返回可用布局提示词，未调用生图模型', 502);
  }
  if (typeof output === 'string') body = output.trim();
  if (/^UNRESOLVABLE_LAYOUT\b/.test(body) || /^UNRESOLVABLE_LAYOUT\b/.test(output?.layout_prompt || output?.prompt || '')) {
    throw housePlanError('Agent无法识别有效户型，未调用生图模型；请核对原图和空间标注', 502);
  }
  // --- 完整正文进入生图；仅为旧版结果界面提取可选字段，不丢弃额外设计信息。 ---
  return { summary: hasText(output?.summary) ? output.summary : '',
    spaces: Array.isArray(output?.spaces) ? output.spaces.filter(space => hasText(space?.name) && hasText(space?.layout))
      .map(({ name, layout }) => ({ name, layout })) : [],
    layout_prompt: body, warnings: Array.isArray(output?.warnings) ? output.warnings.filter(hasText) : [] };
}
