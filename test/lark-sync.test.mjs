/**
 * [INPUT]: 依赖 node:test/assert 与 src/lark-sync.mjs 的同步配置、Schema 准入、记录字段构造器、记录 ID 解析器
 * [OUTPUT]: 对外提供附件分列、含效果图美化的产品链路 Schema/空间类型/其他空间类型/设计方式/Agent/风格、模型与 Prompt融合字段映射和 CLI 返回体兼容性回归保障
 * [POS]: test 的飞书同步契约测试，不访问真实飞书或写入任何 Base 记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLarkSyncSchema,
  buildRecordFields,
  LARK_SYNC_CONFIG,
  recordIdFrom,
} from "../src/lark-sync.mjs";

test("生成记录将白模参考图与风格参考图归档到独立附件列", () => {
  assert.equal(LARK_SYNC_CONFIG.referenceFieldId, "fldhktY1vR");
  assert.equal(LARK_SYNC_CONFIG.styleReferenceFieldId, "fldFxH3Sxj");
  assert.notEqual(
    LARK_SYNC_CONFIG.referenceFieldId,
    LARK_SYNC_CONFIG.styleReferenceFieldId,
  );
});

test("生成记录 Schema 必须包含效果图美化等全部功能选项", () => {
  const fields = [{
    name: "功能",
    options: ["自由生图", "白模渲染", "空房设计", "精模渲染", "效果图美化"]
      .map((name) => ({ name })),
    type: "select",
  }];
  assert.deepEqual(assertLarkSyncSchema({ data: { fields } }), {
    featureOptions: ["自由生图", "白模渲染", "空房设计", "精模渲染", "效果图美化"],
  });
  fields[0].options.pop();
  assert.throws(
    () => assertLarkSyncSchema({ data: { fields } }),
    /缺少选项：效果图美化/,
  );
});

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
    workflow: {
      agentCode: "white-model-fusion",
      agentModelLabel: "Gemini 3.1 Pro",
      agentVersion: 7,
      feature: "white-model-rendering",
      renderMode: "style-dna",
      selectionName: "奶油法式",
      styleCode: "cream-french@v1",
      styleName: "奶油法式",
      styleVersion: 4,
    },
  });

  assert.equal(fields["功能"], "白模渲染");
  assert.equal(fields["设计方式"], "平台风格");
  assert.equal(fields["Agent 编码"], "white-model-fusion");
  assert.equal(fields["Agent 版本"], 7);
  assert.equal(fields["风格选择"], "奶油法式 · v4");
  assert.equal(fields["生图模型"], "GPT Image 2");
  assert.equal(fields["Prompt融合"], "Gemini 3.1 Pro");
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
    sizeMode: "preset",
    transport: "responses",
    workflow: {
      agentCode: "white-model-fusion",
      agentModelLabel: "Gemini 3.1 Pro",
      agentVersion: 7,
      feature: "white-model-rendering",
      renderMode: "style-dna",
      selectionName: "奶油法式",
      styleCode: "cream-french@v1",
      styleName: "奶油法式",
      styleVersion: 4,
    },
  });
});

test("空房双模式与非 Agent 链路投影为可筛选业务字段", () => {
  const base = {
    durationMs: 2000,
    finalPrompt: "完整空房设计 Prompt",
    modelLabel: "Banana 2",
    preview: {
      outputFormat: "png",
      ratio: "4:3",
      referenceImageCount: 1,
      resolution: "2K",
      size: "2400x1792",
    },
  };
  const smart = buildRecordFields({
    ...base,
    workflow: {
      agentCode: "empty-room-smart-default",
      agentVersion: 1,
      feature: "empty-room-design",
      renderMode: "smart-default",
      roomType: "其他",
      roomTypeDetail: "衣帽间",
      selectionName: "智能默认",
    },
  });
  const fusion = buildRecordFields({
    ...base,
    workflow: {
      agentCode: "empty-room-fusion",
      agentVersion: 1,
      feature: "empty-room-design",
      renderMode: "style-dna",
      roomType: "儿童房",
      selectionName: "现代简约",
      styleName: "现代简约",
      styleVersion: 3,
    },
  });
  const refined = buildRecordFields({
    ...base,
    workflow: { feature: "refined-model-rendering", promptVersion: 2 },
  });
  const enhancement = buildRecordFields({
    ...base,
    workflow: {
      effectTime: "night",
      effectWeather: "rainy",
      feature: "effect-render-enhancement",
      promptVersion: 1,
    },
  });

  assert.deepEqual(
    [smart["功能"], smart["空间类型"], smart["其他空间类型"], smart["设计方式"], smart["Agent 编码"], smart["Agent 版本"], smart["风格选择"]],
    ["空房设计", "其他", "衣帽间", "智能默认", "empty-room-smart-default", 1, "智能默认"],
  );
  assert.deepEqual(
    [fusion["功能"], fusion["空间类型"], fusion["设计方式"], fusion["Agent 编码"], fusion["Agent 版本"], fusion["风格选择"]],
    ["空房设计", "儿童房", "平台风格", "empty-room-fusion", 1, "现代简约 · v3"],
  );
  assert.equal(refined["功能"], "精模渲染");
  assert.equal(enhancement["功能"], "效果图美化");
  assert.deepEqual(
    JSON.parse(enhancement["生成参数"]).workflow,
    {
      effectTime: "night",
      effectWeather: "rainy",
      feature: "effect-render-enhancement",
      promptVersion: 1,
    },
  );
  assert.equal("其他空间类型" in fusion, false);
  assert.equal("设计方式" in refined, false);
  assert.equal("Agent 编码" in refined, false);
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
  assert.equal("Prompt融合" in fields, false);
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
