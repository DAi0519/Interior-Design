/**
 * [INPUT]: 依赖空间推理 Agent 的原始文本输出
 * [OUTPUT]: 提供机位可见画面摘要与独立生图提示词的 JSON 合同校验，阻断无法确认的机位
 * [POS]: src 的平面图摄影 Agent 输出边界，仅提取两项必需字段，不透传额外字段
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fail = message => Object.assign(new Error(message), { statusCode: 502, floorPlanSafe: true });
const unresolved = value => typeof value === 'string' && /^UNRESOLVABLE_VIEW\b/.test(value.trim());
const unresolvedError = () => fail('空间推理模型无法确认该机位的可见空间，请调整机位或补充空间说明后再试');

export function parseFloorPlanCameraOutput(text) {
  if (typeof text !== 'string' || !text.trim()) throw fail('空间推理模型未返回有效内容，未调用生图模型');
  const body = text.trim().replace(/^```(?:json|text)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
  if (unresolved(body)) throw unresolvedError();
  let value;
  try { value = JSON.parse(body); }
  catch { throw fail('空间推理输出不是有效 JSON，未调用生图模型'); }
  if (unresolved(value) || unresolved(value?.view_summary) || unresolved(value?.image_prompt)) throw unresolvedError();
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.view_summary !== 'string' || !value.view_summary.trim()
    || typeof value.image_prompt !== 'string' || !value.image_prompt.trim()) {
    throw fail('空间推理输出缺少有效的 view_summary 或 image_prompt，未调用生图模型');
  }
  const viewSummary = value.view_summary.trim();
  if (viewSummary.length > 4000) throw fail('机位画面摘要超过4000字符，未调用生图模型');
  return { viewSummary, scenePrompt: value.image_prompt.trim() };
}
