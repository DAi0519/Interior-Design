/**
 * [INPUT]: 依赖 node:test/assert、最终出图/Prompt Agent 模型目录与 src/lark-sync.mjs 的同步配置、Schema 准入、记录字段构造器、记录 ID 解析器
 * [OUTPUT]: 对外提供全部字段类型/单选值/附件 ID 的 409 阻断、Banana 2.1 独立模型归档、真实尺寸、风格转换平台/参考图风格与独立扩图功能 Schema、设计字段及完整工作流回归保障
 * [POS]: test 的飞书同步契约测试，不访问真实飞书或写入任何 Base 记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  actualImageSize,
  assertLarkSyncSchema,
  buildRecordFields,
  LARK_SYNC_CONFIG,
  recordIdFrom,
} from "../src/lark-sync.mjs";
import { publicAgentModelCatalog } from "../src/agent-model-config.mjs";
import { EMPTY_ROOM_TYPES } from "../src/empty-room-type.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";
import { IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS } from "../src/image-outpaint-archive.mjs";

function selectField(name, options) {
  return {
    name,
    options: options.map((option) => ({ name: option })),
    type: "select",
  };
}

function validSyncSchemaFields() {
  return [
    { id: LARK_SYNC_CONFIG.referenceFieldId, name: "参考图", type: "attachment" },
    { id: LARK_SYNC_CONFIG.resultFieldId, name: "结果图", type: "attachment" },
    { id: LARK_SYNC_CONFIG.styleReferenceFieldId, name: "风格参考图", type: "attachment" },
    selectField("Prompt融合", publicAgentModelCatalog()
      .filter((model) => model.imageInput)
      .map((model) => model.label)),
    selectField("功能", ["自由生图", "白模渲染", "空房设计", "风格转换", "精模渲染", "效果图氛围转换", "效果图美化", "全景图美化", "AI扩图", "多角度"]),
    selectField("状态", ["成功", "生成失败", "同步失败"]),
    selectField("生图模型", [...publicModelCatalog().map((model) => model.label), ...IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS, "Qwen 多角度"]),
    selectField("空间类型", EMPTY_ROOM_TYPES),
    selectField("设计方式", ["智能默认", "平台风格", "参考图风格"]),
    ...[
      "Agent 编码",
      "其他空间类型",
      "家具选择",
      "原始 Prompt",
      "尺寸",
      "标题",
      "生成参数",
      "最终 Prompt",
      "错误信息",
      "风格选择",
    ].map((name) => ({ name, type: "text" })),
    { name: "水平角度（°）", type: "number" },
    { name: "俯仰角度（°）", type: "number" },
    { name: "镜头指令版本", type: "text" },
    selectField("景别", ["特写", "标准", "远景"]),
    { name: "Agent 版本", type: "number" },
    { name: "耗时（秒）", type: "number" },
  ];
}

test("飞书尺寸从生成结果图片头读取", () => {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(1774, 16);
  bytes.writeUInt32BE(887, 20);

  assert.equal(actualImageSize(bytes), "1774x887");
});

test("生成记录将白模参考图与风格参考图归档到独立附件列", () => {
  assert.equal(LARK_SYNC_CONFIG.referenceFieldId, "fldhktY1vR");
  assert.equal(LARK_SYNC_CONFIG.styleReferenceFieldId, "fldFxH3Sxj");
  assert.notEqual(
    LARK_SYNC_CONFIG.referenceFieldId,
    LARK_SYNC_CONFIG.styleReferenceFieldId,
  );
});

test("生成记录 Schema 覆盖当前前台模型、全部可写字段和附件", () => {
  const fields = validSyncSchemaFields();
  const schema = assertLarkSyncSchema({ data: { fields } });
  assert.ok(schema.featureOptions.includes("效果图美化"));
  assert.ok(schema.featureOptions.includes("效果图氛围转换"));
  assert.ok(schema.featureOptions.includes("全景图美化"));
  assert.ok(schema.featureOptions.includes("AI扩图"));
  assert.ok(schema.featureOptions.includes("风格转换"));
  for (const label of IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS) assert.ok(schema.modelOptions.includes(label));
  assert.ok(schema.modelOptions.includes("Seedream 5.0 Pro"));

  const featureField = fields.find((field) => field.name === "功能");
  featureField.options = featureField.options.filter(
    (option) => option.name !== "全景图美化",
  );
  assert.throws(
    () => assertLarkSyncSchema({ data: { fields } }),
    (error) => error.statusCode === 409 && /“功能”字段缺少选项：全景图美化/.test(error.message),
  );
});

test("风格转换单选缺失时 Schema 在生成前阻断", () => {
  const fields = validSyncSchemaFields();
  const feature = fields.find((field) => field.name === "功能");
  feature.options = feature.options.filter((option) => option.name !== "风格转换");
  assert.throws(() => assertLarkSyncSchema({ fields }),
    (error) => error.statusCode === 409 && /功能.*风格转换/.test(error.message));
});

test("风格转换平台或参考图模式复用独立 Agent 与风格归档字段", () => {
  for (const renderMode of ["style-reference", "style-dna"]) {
    const workflow = {
      feature: "style-transfer",
      renderMode,
      agentCode: renderMode === "style-dna" ? "style-transfer-fusion" : "style-transfer-reference",
      agentVersion: 1,
      agentModelLabel: "Gemini 3.1 Pro",
      selectionName: "参考图风格",
      ...(renderMode === "style-dna" ? { styleName: "现代简约", styleVersion: 2 } : {}),
    };
    const fields = buildRecordFields({ actualSize: "1536x1024", durationMs: 1000,
      finalPrompt: "Final English style-transfer prompt", sourcePrompt: "保持沙发布局",
      modelLabel: "Flux2 Klein", preview: { outputFormat: "png", referenceImageCount: 1 }, workflow });
    assert.equal(fields["功能"], "风格转换");
    assert.equal(fields["设计方式"], renderMode === "style-dna" ? "平台风格" : "参考图风格");
    assert.equal(fields["Agent 编码"], workflow.agentCode);
    assert.equal(fields["Agent 版本"], 1);
    assert.equal(fields["Prompt融合"], "Gemini 3.1 Pro");
    assert.equal(fields["风格选择"], renderMode === "style-dna" ? "现代简约 · v2" : "参考图风格");
    assert.equal(fields["原始 Prompt"], "保持沙发布局");
    assert.equal(fields["空间类型"], undefined);
    assert.equal(fields["家具选择"], undefined);
    assert.deepEqual(JSON.parse(fields["生成参数"]).workflow, workflow);
  }
});

test("参考图风格单选缺失时 Schema 阻断且智能默认仍供白模空房使用", () => {
  const fields = validSyncSchemaFields();
  const mode = fields.find((field) => field.name === "设计方式");
  mode.options = mode.options.filter((option) => option.name !== "参考图风格");
  assert.ok(mode.options.some((option) => option.name === "智能默认"));
  assert.throws(() => assertLarkSyncSchema({ fields }),
    (error) => error.statusCode === 409 && /设计方式.*参考图风格/.test(error.message));
});

test("AI扩图或独立模型选项缺失时 Schema 阻断且保留既有生图目录", () => {
  const fields = validSyncSchemaFields();
  fields.find((field) => field.name === "功能").options = fields.find((field) => field.name === "功能").options.filter((option) => option.name !== "AI扩图");
  fields.find((field) => field.name === "生图模型").options = fields.find((field) => field.name === "生图模型").options.filter((option) => option.name !== "Qwen Image Edit 2511");
  assert.throws(() => assertLarkSyncSchema({ fields }), (error) => error.statusCode === 409
    && /功能.*AI扩图/.test(error.message) && /生图模型.*Qwen Image Edit 2511/.test(error.message));
  assert.equal(publicModelCatalog().some((model) => IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS.includes(model.label)), false);
});

test("Flux扩图最终Prompt未返回时留空且用功能名生成可读标题", () => {
  const fields = buildRecordFields({ actualSize: "1024x768", durationMs: 1000, finalPrompt: "",
    modelLabel: "Flux Fill Dev（原版）", preview: { outputFormat: "png", referenceImageCount: 1 },
    workflow: { feature: "image-outpaint", finalPromptCaptured: false, promptSource: "Janus 内部生成，正文未返回" },
  });
  assert.equal(fields["功能"], "AI扩图");
  assert.equal(fields["标题"], "AI扩图");
  assert.equal(fields["最终 Prompt"], "");
  assert.equal(JSON.parse(fields["生成参数"]).workflow.finalPromptCaptured, false);
});

test("后台新增模型但飞书单选未同步时在生成前阻断", () => {
  const fields = validSyncSchemaFields();
  const modelField = fields.find((field) => field.name === "生图模型");
  modelField.options = modelField.options.filter(
    (option) => option.name !== "Seedream 5.0 Pro",
  );
  assert.throws(
    () => assertLarkSyncSchema({ data: { fields } }),
    (error) => error.statusCode === 409 && /“生图模型”字段缺少选项：Seedream 5\.0 Pro/.test(error.message),
  );
});

test("Banana 2.1 单选缺失时阻断，旧 Banana 2 不能替代新模型选项", () => {
  const fields = validSyncSchemaFields();
  const modelField = fields.find((field) => field.name === "生图模型");
  modelField.options = modelField.options.filter((option) => option.name !== "Banana 2.1");
  assert.ok(modelField.options.some((option) => option.name === "Banana 2"));
  assert.throws(() => assertLarkSyncSchema({ data: { fields } }),
    (error) => error.statusCode === 409 && /生图模型.*Banana 2\.1/.test(error.message));
});

test("Banana 2.1 写入生图模型，Prompt融合仍记录提示词模型", () => {
  const schema = assertLarkSyncSchema({ data: { fields: validSyncSchemaFields() } });
  assert.ok(schema.modelOptions.includes("Banana 2.1"));
  const fields = buildRecordFields({
    actualSize: "1200x896", durationMs: 1000, finalPrompt: "保持室内结构并增强材质",
    modelLabel: "Banana 2.1", preview: { outputFormat: "png", referenceImageCount: 1,
      resolution: "1K", ratio: "4:3", transport: "responses" },
    workflow: { feature: "white-model", agentModelLabel: "Gemini 3.1 Pro" },
  });
  assert.equal(fields["生图模型"], "Banana 2.1");
  assert.equal(fields["Prompt融合"], "Gemini 3.1 Pro");
  assert.equal(fields["尺寸"], "1200x896");
  assert.equal(fields["模型"], undefined);
});

test("生成记录字段类型或附件 ID 漂移时一次汇总阻断", () => {
  const fields = validSyncSchemaFields();
  fields.find((field) => field.name === "耗时（秒）").type = "text";
  fields.splice(fields.findIndex((field) => field.name === "结果图"), 1);
  assert.throws(
    () => assertLarkSyncSchema({ data: { fields } }),
    (error) => error.statusCode === 409 && /“耗时（秒）”字段应为 number[\s\S]*“结果图”附件字段 ID .* 不存在/.test(error.message),
  );
});

test("生成结果映射为飞书可写字段且不写只读和附件字段", () => {
  const fields = buildRecordFields({
    actualSize: "1774x887",
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
  assert.equal(fields["尺寸"], "1774x887");
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
    actualSize: "2304x1728",
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
  const panoramaEnhancement = buildRecordFields({
    ...base,
    workflow: {
      effectTime: "preserve",
      effectWeather: "preserve",
      feature: "panorama-render-enhancement",
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
  assert.equal(enhancement["功能"], "效果图氛围转换");
  assert.equal(panoramaEnhancement["功能"], "全景图美化");
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
    actualSize: "2400x1792",
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


test("多角度字段保存零角度与实际版本，字段缺失或景别选项漂移阻断", () => {
  const fields = buildRecordFields({ actualSize: "1536x2048", durationMs: 1000,
    finalPrompt: "Actual submitted reverse-angle instruction", modelLabel: "Qwen 多角度",
    preview: { outputFormat: "png", referenceImageCount: 1 },
    workflow: { feature: "image-multi-angle", pose: { azimuth: 0, elevation: 0, distance: 50 }, promptVersion: "test-v2" } });
  assert.equal(fields["功能"], "多角度");
  assert.equal(fields["水平角度（°）"], 0);
  assert.equal(fields["俯仰角度（°）"], 0);
  assert.equal(fields["景别"], "标准");
  assert.equal(fields["镜头指令版本"], "test-v2");
  for (const name of ["水平角度（°）", "俯仰角度（°）", "景别", "镜头指令版本"]) {
    assert.throws(() => assertLarkSyncSchema({ fields: validSyncSchemaFields().filter(f => f.name !== name) }), /缺少/);
  }
  const schema = validSyncSchemaFields();
  schema.find(f => f.name === "景别").options.pop();
  assert.throws(() => assertLarkSyncSchema({ fields: schema }), /景别.*远景/);
});
