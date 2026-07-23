/**
 * [INPUT]: 依赖 node:test/assert 与 src/lark-sync.mjs 的记录字段构造器、记录 ID 解析器
 * [OUTPUT]: 对外提供字段映射和飞书 CLI 返回体兼容性的纯函数回归保障
 * [POS]: test 的飞书同步契约测试，不访问真实飞书或写入任何 Base 记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildRecordFields, recordIdFrom } from "../src/lark-sync.mjs";

test("生成结果映射为飞书可写字段且不写只读和附件字段", () => {
  const fields = buildRecordFields({
    durationMs: 12345,
    finalPrompt: "结构化最终 Prompt",
    modelLabel: "GPT Image 2",
    preview: {
      outputFormat: "webp",
      quality: "high",
      ratio: "16:9",
      referenceImageCount: 2,
      resolution: "4K",
      size: "3840x2160",
      transport: "responses",
    },
    sourcePrompt: "现代简约客厅，柔和自然光",
    workflow: { feature: "white-model-rendering", styleCode: "cream-french@v1" },
  });

  assert.equal(fields["模型"], "GPT Image 2");
  assert.equal(fields["原始 Prompt"], "现代简约客厅，柔和自然光");
  assert.equal(fields["最终 Prompt"], "结构化最终 Prompt");
  assert.equal("模型修订 Prompt" in fields, false);
  assert.equal(fields["尺寸"], "3840x2160");
  assert.equal(fields["耗时（秒）"], 12.35);
  assert.equal(JSON.stringify(fields).includes("syncDurationMs"), false);
  assert.equal(JSON.stringify(fields).includes("endToEndDurationMs"), false);
  assert.equal("结果图" in fields, false);
  assert.equal("创建时间" in fields, false);
  assert.deepEqual(JSON.parse(fields["生成参数"]), {
    outputFormat: "webp",
    quality: "high",
    ratio: "16:9",
    referenceImageCount: 2,
    resolution: "4K",
    transport: "responses",
    workflow: { feature: "white-model-rendering", styleCode: "cream-french@v1" },
  });
});

test("长 Prompt 只截断标题，不截断最终内容且允许原始输入为空", () => {
  const prompt = "这是一个需要完整保留的非常长的室内设计提示词".repeat(5);
  const fields = buildRecordFields({
    durationMs: 1000,
    finalPrompt: prompt,
    modelLabel: "Banana Pro",
    preview: {
      outputFormat: "png",
      quality: null,
      ratio: "4:3",
      referenceImageCount: 0,
      resolution: "2K",
      size: "2400x1792",
      transport: "images-generations",
    },
  });

  assert.equal(fields["原始 Prompt"], "");
  assert.equal(fields["最终 Prompt"], prompt);
  assert.match(fields["标题"], /…$/);
});

test("从批量创建返回体提取首个飞书记录 ID", () => {
  assert.equal(
    recordIdFrom({ data: { record_id_list: ["recGenerated"] } }),
    "recGenerated",
  );
  assert.equal(
    recordIdFrom({ data: { record: { record_id: "recLegacy" } } }),
    "recLegacy",
  );
});
