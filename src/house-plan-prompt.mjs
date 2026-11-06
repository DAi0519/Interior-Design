/**
 * [INPUT]: 依赖飞书已上架Agent版本读取与户型布局专用Prompt表位置
 * [OUTPUT]: 提供户型平面布局独立原文资产、已上架多版本目录/精确选择与SHA校验与输出解析
 * [POS]: src 的户型平面布局Prompt合同，正文仅存飞书，不回退旧实验室
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto';
import { getPublishedPromptAgent, listPublishedPromptAgentVersions } from './prompt-agent.mjs';
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
  let output;
  try { output = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw housePlanError('Agent未返回完整布局JSON，未调用生图模型', 502); }
  if (!output || typeof output !== 'object' || Array.isArray(output)
    || typeof output.summary !== 'string' || !output.summary.trim() || output.summary.length > 2000
    || typeof output.layout_prompt !== 'string' || !output.layout_prompt.trim() || output.layout_prompt.length > 16000
    || !Array.isArray(output.spaces) || !output.spaces.length || output.spaces.length > 30
    || output.spaces.some(space => !space || typeof space.name !== 'string' || !space.name.trim() || space.name.length > 80
      || typeof space.layout !== 'string' || !space.layout.trim() || space.layout.length > 2000)
    || !Array.isArray(output.warnings) || output.warnings.length > 30
    || output.warnings.some(item => typeof item !== 'string' || item.length > 500)) {
    throw housePlanError('Agent布局方案不完整，未调用生图模型', 502);
  }
  return { summary: output.summary, spaces: output.spaces.map(({ name, layout }) => ({ name, layout })), layout_prompt: output.layout_prompt, warnings: output.warnings };
}
