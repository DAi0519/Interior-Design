/**
 * [INPUT]: 依赖可注入 OneAPI 单图分析客户端，接收单张白模参考图与视觉模型
 * [OUTPUT]: 对外提供版本化样本标注协议、空间类别与五个独立维度的严格 JSON 解析及单图 AI 标注
 * [POS]: src 的 Benchmark 样本标注领域层，只判断可观察图像标签，不判断人工负责的样本准入类型与边缘类型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const BENCHMARK_SAMPLE_CATEGORIES = Object.freeze([
  "客厅",
  "客餐厅一体",
  "独立餐厅",
  "卧室",
  "厨房",
  "卫生间",
  "玄关",
  "走廊",
  "书房",
  "阳台",
  "儿童房",
]);

export const BENCHMARK_EDGE_TYPES = Object.freeze([
  "CAD/线稿",
  "草模/概念图",
  "已完成材质",
  "输入不可判断",
  "内容不相关",
]);

export const BENCHMARK_COMPLEXITY_LEVELS = Object.freeze(["低", "中", "高"]);

export const BENCHMARK_SAMPLE_LABEL_PROMPT_VERSION = "sample-labeling@v2";

export const BENCHMARK_SAMPLE_LABEL_SYSTEM_PROMPT = `你是室内设计白模 Benchmark 样本标注员。只判断输入参考图，不生成图片。必须只返回 JSON：
{"category":"客厅","spatial_complexity":"中","lens_complexity":"低","styling_complexity":"高","material_complexity":"中","input_quality":"高","reason":"不超过80字","confidence":0.0}
category 只能从：${BENCHMARK_SAMPLE_CATEGORIES.join("、")} 中选择；无法判断空间时仍选择最接近类别，并降低 confidence。
spatial_complexity 判断空间层级、转折、开口与结构关系；lens_complexity 判断视角、透视、广角和遮挡；styling_complexity 判断家具与软装对象的数量、密度和细节；material_complexity 判断透明、反射、纹理连续性与材质边界的处理复杂度；input_quality 判断清晰度、分辨率、水印、遮挡与可辨识度。
五个维度必须分别独立判断，只能取：${BENCHMARK_COMPLEXITY_LEVELS.join("、")}。禁止输出综合难度，也不要判断 sample_type 或 edge_type；这两个准入字段由人工负责。confidence 必须是 0-1 数字。`;

function labelError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function parseBenchmarkSampleLabel(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw labelError("标注模型没有返回合法 JSON");
  }
  if (!BENCHMARK_SAMPLE_CATEGORIES.includes(value.category)) {
    throw labelError("category 不在允许列表中");
  }
  const dimensions = {
    inputQuality: value.input_quality,
    lensComplexity: value.lens_complexity,
    materialComplexity: value.material_complexity,
    spatialComplexity: value.spatial_complexity,
    stylingComplexity: value.styling_complexity,
  };
  for (const [field, level] of Object.entries(dimensions)) {
    if (!BENCHMARK_COMPLEXITY_LEVELS.includes(level)) {
      throw labelError(`${field} 不在允许列表中`);
    }
  }
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw labelError("confidence 必须在 0-1 之间");
  }
  return {
    category: value.category,
    confidence,
    ...dimensions,
    reason: String(value.reason || "").trim().slice(0, 80),
  };
}

export async function labelBenchmarkSample({ client, imageUrl, model }) {
  const response = await client.analyzeImage({
    imageUrl,
    model,
    systemPrompt: BENCHMARK_SAMPLE_LABEL_SYSTEM_PROMPT,
    userPrompt: "识别这张参考图的空间类别，并独立判断空间结构、镜头、软装、材质复杂度和输入质量，按协议返回 JSON。",
  });
  return {
    ...parseBenchmarkSampleLabel(response.text),
    promptVersion: BENCHMARK_SAMPLE_LABEL_PROMPT_VERSION,
    requestId: response.requestId || null,
  };
}
