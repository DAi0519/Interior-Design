/**
 * [INPUT]: 依赖 node:test/assert、空房家具真源、浏览器请求映射、共享工作流与飞书字段投影
 * [OUTPUT]: 对外提供线上目录推荐合法性、其他入口剥离、仅已选需求传递、未选及空条件省略、明确排除原文保留、输入校验、双路由、缓存隔离及归档合同测试
 * [POS]: test 的空房家具跨层回归测试，外部模型和归档用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_ROOM_TYPES } from "../src/empty-room-type.mjs";
import { EMPTY_ROOM_FURNITURE, normalizeFurnitureSelection } from "../src/empty-room-furniture.mjs";
import { executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildRecordFields } from "../src/lark-sync.mjs";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const output = { scene_preservation: "Preserve original architecture and camera.",
  visual_application: { materials: "Sofa with no TV.", colors: "Blue and walnut.", photography: "Natural light." },
  generation_requirement: "Furnish this room." };
function input(selection, mode = "smart-default", requirements = "") {
  return buildGenerationInput({ featureMode: "emptyRoom", model: { key: "gptImage2", qualityOptions: [] },
    emptyRoomFields: { roomType: "客厅", ...(selection === undefined ? {} : { furnitureSelection: selection }) },
    prompt: { free: requirements }, promptAgentModelKey: "gemini3pro", renderMode: { mode, styleCode: "nordic@v2" },
    ratio: "1:1", resolution: "1K", referenceImages: [{ dataUrl: png, name: "empty.png", type: "image/png" }],
    styleReferenceImages: [],
  });
}
function dependencies() {
  const prompts = [], records = [], images = [], agents = [];
  const deps = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: {
      generatePrompt: async (request) => { prompts.push(request); return { text: JSON.stringify(output) }; },
      generateImage: async (request) => { images.push(request); return { images: [{ url: png }], outputFormat: "png" }; },
    },
    loadAgent: async (code) => { agents.push(code); return { code, version: 24, name: code, systemPrompt: "system" }; },
    loadStyle: async () => ({ code: "nordic@v2", version: 2, name: "北欧风", styleDna: { materials: "walnut" } }),
    scheduleSync: (record) => { records.push(record); return { status: "pending" }; },
    promptResultCache: createAsyncTtlCache(),
  };
  return { deps, prompts, records, images, agents };
}

test("房型目录一致，显式空清单不会回填默认，其他家具与选择来源受到校验", () => {
  assert.deepEqual(Object.keys(EMPTY_ROOM_FURNITURE), EMPTY_ROOM_TYPES);
  for (const catalog of Object.values(EMPTY_ROOM_FURNITURE)) {
    assert.equal(catalog.options.at(-1), catalog.customOption);
    assert.equal(new Set(catalog.options).size, catalog.options.length);
    assert.ok(catalog.defaults.every((item) => catalog.options.includes(item) && item !== catalog.customOption));
  }
  assert.deepEqual(normalizeFurnitureSelection({ items: ["其他"], other: "钢琴" }, "客厅"), { source: "user", items: [], other: "钢琴" });
  assert.deepEqual(normalizeFurnitureSelection({ items: ["其他"] }, "客厅"), { source: "user", items: [], other: "" });
  assert.throws(() => normalizeFurnitureSelection({ items: ["边几"] }, "客厅"), { statusCode: 400 });
  assert.deepEqual(normalizeFurnitureSelection(undefined, "客厅"), { source: "room-default", items: [], other: "" });
  assert.deepEqual(normalizeFurnitureSelection({ items: [], other: "" }, "客厅"), { source: "user", items: [], other: "" });
  assert.deepEqual(normalizeFurnitureSelection({ source: "room-default", items: ["沙发", "沙发"], other: "  钢琴  " }, "客厅"),
    { source: "user", items: ["沙发"], other: "钢琴" });
  for (const value of [null, [], { items: "沙发" }, { items: ["床"] }, { items: [], other: {} }, { items: [], other: "字".repeat(201) }]) {
    assert.throws(() => normalizeFurnitureSelection(value, "客厅"), { statusCode: 400 });
  }
});

for (const mode of ["smart-default", "style-dna"]) test(`${mode} 最终清单从浏览器映射进入 Agent、响应和可读归档`, async () => {
  const { deps, prompts, records, images, agents } = dependencies();
  const result = await executeWhiteModelWorkflow(input({ items: ["沙发", "挂画"], other: "钢琴" }, mode), deps);
  assert.equal(agents[0], mode === "smart-default" ? "empty-room-smart-default" : "empty-room-fusion");
  const selection = { source: "user", items: ["沙发", "挂画"], other: "钢琴" };
  assert.ok(prompts[0].userPrompt.includes(JSON.stringify({ items: selection.items, other: selection.other })));
  for (const item of EMPTY_ROOM_FURNITURE["客厅"].options.filter((item) => !selection.items.includes(item))) {
    assert.ok(!prompts[0].userPrompt.includes(item), `未选的 ${item} 不应传入 Agent`);
  }
  assert.doesNotMatch(prompts[0].userPrompt, /unselected_catalog_items|"source"/);
  assert.deepEqual(result.furnitureSelection, selection);
  assert.deepEqual(records[0].workflow.furnitureSelection, selection);
  assert.equal(images[0].images.length, 1);
  const fields = buildRecordFields({ ...records[0], actualSize: "1x1" });
  assert.equal(fields["家具选择"], "用户确认；沙发、挂画；其他：钢琴");
  assert.deepEqual(JSON.parse(fields["生成参数"]).workflow.furnitureSelection, selection);
});

for (const mode of ["smart-default", "style-dna"]) test(`${mode} 空条件省略、自定义需求独立传递，只有明确排除原文进入 Agent`, async () => {
  const { deps, prompts, records } = dependencies();
  for (const selection of [{ items: [] }, undefined]) {
    await executeWhiteModelWorkflow(input(selection, mode), deps);
    assert.doesNotMatch(prompts.at(-1).userPrompt, /furniture_selection|unselected_catalog_items|沙发|地毯|绿植/);
    assert.equal(buildRecordFields({ ...records.at(-1), actualSize: "1x1" })["家具选择"], "未指定家具；Agent 按房型与风格搭配");
  }
  await executeWhiteModelWorkflow(input({ items: [], other: "钢琴" }, mode), deps);
  assert.match(prompts.at(-1).userPrompt, /furniture_selection:\n\{"other":"钢琴"\}/);
  const requirements = "不要地毯和绿植，窗帘按风格搭配";
  await executeWhiteModelWorkflow(input({ items: ["沙发"] }, mode, requirements), deps);
  assert.ok(prompts.at(-1).userPrompt.includes(requirements));
  assert.doesNotMatch(prompts.at(-1).userPrompt, /unselected_catalog_items/);
});

test("取消、全取消、自定义修改和旧客户端未指定分别隔离缓存；同一选择顺序不影响命中", async () => {
  const { deps, prompts } = dependencies();
  await executeWhiteModelWorkflow(input({ items: ["沙发", "茶几"] }), deps);
  await executeWhiteModelWorkflow(input({ items: ["茶几", "沙发"] }), deps);
  assert.equal(prompts.length, 1);
  await executeWhiteModelWorkflow(input({ items: ["沙发"] }), deps);
  await executeWhiteModelWorkflow(input({ items: [] }), deps);
  assert.doesNotMatch(prompts.at(-1).userPrompt, /furniture_selection/);
  await executeWhiteModelWorkflow(input({ items: [], other: "钢琴" }), deps);
  await executeWhiteModelWorkflow(input(undefined), deps);
  assert.equal(prompts.length, 5);
  assert.doesNotMatch(prompts.at(-1).userPrompt, /furniture_selection/);
});

test("非法家具在调用模型前阻断", async () => {
  const { deps, prompts } = dependencies();
  await assert.rejects(executeWhiteModelWorkflow(input({ items: ["不存在的选项"] }), deps), { statusCode: 400 });
  assert.equal(prompts.length, 0);
});
