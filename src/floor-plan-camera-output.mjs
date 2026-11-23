/**
 * [INPUT]: 依赖空间推理 Agent 的原始文本输出和已冻结的 Prompt 版本
 * [OUTPUT]: 提供历史双字段与v9双语取景编译、v10画面方位清理和旧结构兼容，以及不含原始输出的失败分类
 * [POS]: src 的平面图摄影 Agent 输出边界，用取景说明生成可读摘要和成图正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fail = (message, code = 'camera_agent_output_invalid') => Object.assign(new Error(message), { statusCode: 502, floorPlanSafe: true, code });
const unresolved = value => typeof value === 'string' && /^UNRESOLVABLE_VIEW\b/.test(value.trim());
const unresolvedError = () => fail('空间推理模型无法确认该机位的可见空间，请调整机位或补充空间说明后再试', 'camera_view_unresolved');
const invalidJsonError = () => fail('空间推理输出不是有效 JSON，未调用生图模型');
export const STRUCTURED_FRAME_PROMPT_MIN_VERSION = 9;
export const FREEFORM_FRAME_PROMPT_MIN_VERSION = 10;
const VIEW_SUMMARY_MAX_LENGTH = 4000;
const FRAME_FIELDS = [
  ['composition', '构图'],
  ['foreground', '近景遮挡'],
  ['midground', '中景主体'],
  ['background', '远景与开口'],
  ['crop', '关键裁切'],
  ['excluded', '画外排除'],
];
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;

// --- 图纸方位只用于推理；有明确成片方位时才清理双重标注 ---
const ZH_DRAWING = '(?:平面图|户型图|图纸|图面|原图|图)';
const ZH_SIDE = '(?:[左右](?:[前后上下])?(?:侧|方|边缘?|角|端|部|面)?|(?:正?[前后]|[上下])(?:[左右])?(?:方|侧|边缘?|角|端|部|面)|[上下][左右](?:角|侧|方)?|中[央心间])';
const ZH_DRAWING_SIDE = `${ZH_DRAWING}(?:上的?|中的?|里的?|的)?\\s*(?:${ZH_SIDE}|[东西南北]{1,2}(?:侧|边|面|墙|向|部)?)`;
const EN_DRAWING = '(?:floor[ -]plan|plan view|plan|drawing|diagram|layout)';
const EN_COMPASS = '(?:north|south)(?:[ -]?(?:east|west))?|east|west';
const EN_FRAME_SIDE = '(?:left|right|top|bottom|upper|lower|front|back|center)(?:[ -](?:left|right|side|edge|corner))?';
const EN_SIDE = `(?:${EN_FRAME_SIDE}|(?:${EN_COMPASS})(?:[ -](?:side|edge|corner|wall))?)`;
const EN_DRAWING_SIDE = `(?:\\b(?:the\\s+)?${EN_DRAWING}(?:['’]s)?[ -]+${EN_SIDE}\\b|\\b${EN_SIDE}\\s+(?:of|on|in)\\s+(?:the\\s+)?${EN_DRAWING}\\b)`;
const DRAWING_SIDE = `(?:${ZH_DRAWING_SIDE}|${EN_DRAWING_SIDE})`;
const DRAWING_ALIAS = `(?:${DRAWING_SIDE}|${ZH_DRAWING}(?:[上下]|(?:区域|编号|标注)[\\s\\d①-⑳A-Za-z]+))`;
const FRAME_SIDE = `(?:(?:画面|照片|成片|镜头)(?:中的?|里的?|的)?\\s*(?:${ZH_SIDE}|正前|[近中远]景)|(?:the\\s+)?(?:frame|image|photo|view)[ -]+${EN_FRAME_SIDE}|${EN_FRAME_SIDE}\\s+(?:of|in)\\s+(?:the\\s+)?(?:frame|image|photo|view))`;
const DRAWING_THEN_FRAME = new RegExp(`${DRAWING_ALIAS}[ \\t]*[（(][ \\t]*(${FRAME_SIDE})[ \\t]*[）)]`, 'giu');
const DRAWING_PARENTHETICAL = new RegExp(`[ \\t]*[（(][ \\t]*${DRAWING_ALIAS}[ \\t]*[）)]`, 'giu');
const REMAINING_DRAWING_SIDE = new RegExp(DRAWING_SIDE, 'iu');
const ZH_COMPASS_SIDE = /(?:[东西南北]{1,2}(?:侧|边|端|墙|面|向)|(?:面向|朝向?|向)[东西南北]{1,2}(?=拍摄|望|看|转|[，。；、,\s]|$))/u;
const EN_COMPASS_SIDE = new RegExp(`\\b(?:facing|faces|looking|looks|towards?)\\s+(?:due\\s+)?(?:${EN_COMPASS})\\b|\\b(?:${EN_COMPASS})[ -](?:wall|side|edge|corner|end|facing)\\b`, 'iu');

function cameraFrameDirections(text) {
  const scene = text.replace(DRAWING_THEN_FRAME, '$1').replace(DRAWING_PARENTHETICAL, '');
  if (REMAINING_DRAWING_SIDE.test(scene) || ZH_COMPASS_SIDE.test(scene) || EN_COMPASS_SIDE.test(scene)) {
    throw Object.assign(fail('空间推理仍包含无法确认的图纸方位，请改用画面方位后再试'), { retryable: false });
  }
  return scene;
}

// --- 仅移除完整对象外的说明和围栏，保留字段原文 ---
function parseAgentJson(body, allowWrapper) {
  try { return JSON.parse(body); }
  catch {
    if (!allowWrapper) throw invalidJsonError();
  }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end < start) throw invalidJsonError();
  const wrapper = start < 0 ? body : `${body.slice(0, start)}\n${body.slice(end + 1)}`;
  if (/\bUNRESOLVABLE_VIEW\b/.test(wrapper)) throw unresolvedError();
  if (start < 0 || /[{}\[\]]/.test(wrapper)) throw invalidJsonError();
  try { return JSON.parse(body.slice(start, end + 1)); }
  catch { throw invalidJsonError(); }
}

function parseStructuredFrame(value = {}) {
  const { image_prompt: appearance, uncertainty } = value;
  // --- 部分 Agent 会把完整的六项取景直接写在顶层 ---
  const frame = value.frame === undefined && FRAME_FIELDS.every(([key]) => Object.hasOwn(value, key))
    ? value : value.frame;
  if (!isRecord(frame) || !hasText(appearance)) {
    throw fail('空间推理输出缺少有效的 frame 或 image_prompt，未调用生图模型');
  }
  const summary = [];
  const scene = [];
  for (const [key, label] of FRAME_FIELDS) {
    const entry = frame[key];
    if (entry === null) continue;
    if (unresolved(entry?.zh) || unresolved(entry?.en)) throw unresolvedError();
    if (!isRecord(entry) || !hasText(entry.zh) || !hasText(entry.en)) {
      throw fail(`空间推理输出的 ${key} 缺少中英文取景内容，未调用生图模型`);
    }
    summary.push(`${label}：${entry.zh.trim()}`);
    scene.push(entry.en.trim());
  }
  if (!frame.composition || !(frame.foreground || frame.midground || frame.background)) {
    throw fail('空间推理输出缺少构图或可见景物，未调用生图模型');
  }
  if (uncertainty != null) {
    const note = isRecord(uncertainty) ? uncertainty.zh : uncertainty;
    if (!hasText(note)) throw fail('空间推理输出的不确定项格式无效，未调用生图模型');
    summary.push(`不确定项：${note.trim()}`);
  }
  const viewSummary = summary.join('\n');
  if (viewSummary.length > VIEW_SUMMARY_MAX_LENGTH) throw fail('机位画面摘要超过4000字符，未调用生图模型');
  return { viewSummary, scenePrompt: `${scene.join('\n')}\n\n${appearance.trim()}` };
}

function assertResolvedAgentResponse(body, value) {
  if (unresolved(body)) throw unresolvedError();
  if (unresolved(value) || unresolved(value?.view_summary) || unresolved(value?.image_prompt)) throw unresolvedError();
}

function parseFreeformFrame(body) {
  let structured;
  try {
    const value = parseAgentJson(body, true);
    assertResolvedAgentResponse(body, value);
    structured = parseStructuredFrame(isRecord(value) ? value : undefined);
  } catch (error) {
    if (error.code !== 'camera_agent_output_invalid') throw error;
  }
  const scenePrompt = cameraFrameDirections(structured?.scenePrompt ?? body);
  const viewSummary = structured ? cameraFrameDirections(structured.viewSummary) : scenePrompt.slice(0, VIEW_SUMMARY_MAX_LENGTH);
  return { viewSummary, scenePrompt };
}

export function parseFloorPlanCameraOutput(text, { version } = {}) {
  const body = typeof text === 'string'
    ? text.trim().replace(/^```(?:json|text|markdown|md)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim()
    : '';
  if (!body) throw fail('空间推理模型未返回有效内容，未调用生图模型');
  assertResolvedAgentResponse(body);
  if (version >= FREEFORM_FRAME_PROMPT_MIN_VERSION) return parseFreeformFrame(body);
  const value = parseAgentJson(body, version >= STRUCTURED_FRAME_PROMPT_MIN_VERSION);
  assertResolvedAgentResponse(body, value);
  if (version >= STRUCTURED_FRAME_PROMPT_MIN_VERSION) return parseStructuredFrame(isRecord(value) ? value : undefined);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.view_summary !== 'string' || !value.view_summary.trim()
    || typeof value.image_prompt !== 'string' || !value.image_prompt.trim()) {
    throw fail('空间推理输出缺少有效的 view_summary 或 image_prompt，未调用生图模型');
  }
  const viewSummary = value.view_summary.trim();
  if (viewSummary.length > VIEW_SUMMARY_MAX_LENGTH) throw fail('机位画面摘要超过4000字符，未调用生图模型');
  return { viewSummary, scenePrompt: value.image_prompt.trim() };
}
