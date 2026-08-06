/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与 benchmark-sample-ui.js/benchmark.html 的累加文件和空间类型来源契约
 * [OUTPUT]: 对外提供分次累加去重、草稿初始化、已有分类保护、未分类 AI 分类、五维回填状态、分类来源优先级和单层输入焦点反馈的回归保障
 * [POS]: test 的 Benchmark 样本双路径交互护栏，不调用模型、不上传图片、不写入 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AI_DIMENSION_FIELDS,
  applyAiSampleLabel,
  createSampleDraft,
  sampleDraftStatusCopy,
  sampleLabelScopeCopy,
  uniqueSampleFiles,
} from "../public/benchmark-sample-ui.js";

const aiLabel = {
  category: "客厅",
  confidence: 0.91,
  inputQuality: "高",
  lensComplexity: "低",
  materialComplexity: "中",
  modelKey: "gemini35flash",
  promptVersion: "sample-labeling@v2",
  reason: "空间开敞且主体清晰",
  spatialComplexity: "高",
  stylingComplexity: "中",
};

test("分次选择会累加新文件并跳过待保存清单中的重复项", () => {
  const first = { lastModified: 1, name: "first.png", size: 100 };
  const second = { lastModified: 2, name: "second.png", size: 200 };

  assert.deepEqual(uniqueSampleFiles([first], [first, second, second]), [second]);
});

test("新增文件初始化为独立等待草稿且保留临时缩略图", () => {
  const file = { lastModified: 1, name: "bedroom.png", size: 100 };
  const draft = createSampleDraft(file, {
    category: "卧室", categoryMode: "fixed", previewUrl: "blob:preview", sampleType: "有效白模",
  });

  assert.equal(draft.file, file);
  assert.equal(draft.category, "卧室");
  assert.equal(draft.previewUrl, "blob:preview");
  assert.equal(draft.status, "waiting");
});

test("已有空间分类只接受 AI 五维，不被模型类别覆盖", () => {
  const result = applyAiSampleLabel({ category: "卧室", categoryMode: "fixed" }, aiLabel);

  assert.equal(result.category, "卧室");
  assert.equal(result.categorySource, "human");
  assert.equal(result.aiCategory, "客厅");
  assert.equal(result.spatialComplexity, "高");
  assert.equal(result.inputQuality, "高");
  assert.match(result.reason, /空间类型沿用“卧室”/);
  assert.equal(sampleDraftStatusCopy({ ...result, categoryMode: "fixed" }), "AI 五维 91%");
});

test("未分类样本显式接受 AI 空间类型和五维", () => {
  const result = applyAiSampleLabel({ category: "卧室", categoryMode: "ai" }, aiLabel);

  assert.equal(result.category, "客厅");
  assert.equal(result.categorySource, "ai");
  assert.equal(result.reason, aiLabel.reason);
  assert.equal(sampleDraftStatusCopy({ ...result, categoryMode: "ai" }), "AI 分类 + 五维 91%");
});

test("类别不属于 AI 五维人工修改清空范围", () => {
  assert.equal(AI_DIMENSION_FIELDS.has("category"), false);
  assert.deepEqual(
    [...AI_DIMENSION_FIELDS].sort(),
    ["inputQuality", "lensComplexity", "materialComplexity", "spatialComplexity", "stylingComplexity"],
  );
});

test("添加样本先选择分类来源且默认沿用本批空间类型", async () => {
  const html = await readFile(new URL("../public/benchmark.html", import.meta.url), "utf8");

  assert.ok(html.indexOf("categoryModeInput") < html.indexOf("labelModelSelect"));
  assert.match(html, /option value="fixed" selected>已分好类，沿用本批设置/);
  assert.match(html, /option value="ai">未分类，由 AI 识别/);
  assert.match(html, /id="categoryInputField"[\s\S]*id="sampleLabelScopeHint"/);
  assert.match(html, /选择 PNG \/ JPEG \/ WebP，可分次添加/);
  assert.equal(sampleLabelScopeCopy("fixed", "厨房"), "空间类型固定为“厨房”；AI 只补空间结构、镜头、软装、材质和输入质量。");
});

test("Benchmark 文本输入只保留与生图工作台一致的单层焦点反馈", async () => {
  const css = await readFile(new URL("../public/benchmark.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /input:focus-visible|select:focus-visible/);
  assert.match(css, /input:focus,\s*select:focus\s*\{[\s\S]*box-shadow:\s*0 0 0 3px rgb\(25 26 28 \/ 8%\)/);
});
