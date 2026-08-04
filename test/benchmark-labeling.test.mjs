/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-labeling.mjs 的标注解析及可注入客户端
 * [OUTPUT]: 对外提供白模样本空间类别与五个独立维度的 AI 标签 JSON 契约、人工准入隔离与单图调用回归保障
 * [POS]: test 的 Benchmark 样本标注领域测试，不调用真实模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BENCHMARK_SAMPLE_LABEL_SYSTEM_PROMPT,
  labelBenchmarkSample,
  parseBenchmarkSampleLabel,
} from "../src/benchmark-labeling.mjs";

test("AI 样本标签解析空间类别、五个独立维度和置信度", () => {
  const label = parseBenchmarkSampleLabel(`\`\`\`json
    {"category":"厨房","spatial_complexity":"高","lens_complexity":"中","styling_complexity":"低","material_complexity":"高","input_quality":"中","reason":"厨房结构转折较多，材质边界复杂","confidence":0.92}
  \`\`\``);

  assert.equal(label.category, "厨房");
  assert.equal(label.spatialComplexity, "高");
  assert.equal(label.lensComplexity, "中");
  assert.equal(label.stylingComplexity, "低");
  assert.equal(label.materialComplexity, "高");
  assert.equal(label.inputQuality, "中");
  assert.equal(label.confidence, 0.92);
  assert.throws(
    () => parseBenchmarkSampleLabel('{"category":"会议室","spatial_complexity":"中","lens_complexity":"中","styling_complexity":"中","material_complexity":"中","input_quality":"中","reason":"","confidence":0.5}'),
    /category/,
  );
});

test("五个维度必须独立使用低中高且协议不接管人工准入", () => {
  assert.throws(
    () => parseBenchmarkSampleLabel('{"category":"客厅","spatial_complexity":"复杂","lens_complexity":"中","styling_complexity":"中","material_complexity":"中","input_quality":"中","reason":"","confidence":0.5}'),
    /spatialComplexity/,
  );
  assert.equal(BENCHMARK_SAMPLE_LABEL_SYSTEM_PROMPT.includes("不要判断 sample_type 或 edge_type"), true);
});

test("AI 样本标注只提交当前一张参考图", async () => {
  let request;
  const result = await labelBenchmarkSample({
    client: {
      async analyzeImage(input) {
        request = input;
        return {
          requestId: "resp-label",
          text: '{"category":"卧室","spatial_complexity":"中","lens_complexity":"低","styling_complexity":"高","material_complexity":"中","input_quality":"高","reason":"卧室软装对象较多","confidence":0.9}',
        };
      },
    },
    imageUrl: "data:image/png;base64,AAA=",
    model: "gemini-3.5-flash",
  });

  assert.equal(request.imageUrl, "data:image/png;base64,AAA=");
  assert.equal(request.model, "gemini-3.5-flash");
  assert.equal(result.promptVersion, "sample-labeling@v2");
  assert.equal(result.requestId, "resp-label");
  assert.equal("sampleType" in result, false);
});
