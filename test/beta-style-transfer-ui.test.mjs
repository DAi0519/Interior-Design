/**
 * [INPUT]: 依赖 node:test/assert、Beta 设计配置控制器、八功能目录、轻量页面状态及共享参考图资产打包器
 * [OUTPUT]: 对外提供 Beta 风格转换明确目标/两路独立版本、真实下拉切换与参考图互斥/删除重选、八功能恢复和多样本共享参考图去重回归保障
 * [POS]: test 的 Beta 风格转换浏览器合同测试，使用内存 DOM/配置替身，不调用模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { packBatchAssets } from "../public/beta-assets.js";
import { betaStyleTransferSettings, createBetaDesignConfiguration } from "../public/beta-design-config.js";
import { BETA_FEATURE_COPY } from "../public/beta-model-rules.js";
import { readBetaPageState, saveBetaPageState } from "../public/beta-page-state.js";

const style = { code: "minimal-v2", name: "现代简约", familyCode: "minimal", version: 2, published: true, validDna: true };
const reference = { dataUrl: "data:image/png;base64,AA==", name: "style.png", type: "image/png", size: 1 };
const config = {
  styles: [style], smartDefault: { available: true, version: 6 },
  promptAgent: { defaultVersion: 5, versions: [{ name: "白模融合", version: 5 }] },
  styleTransfer: {
    reference: { available: true, version: 3 },
    promptAgent: { defaultVersion: 7, versions: [{ name: "风格转换融合", version: 7 }] },
  },
};

function fixture(restoredPageState = { featureMode: "whiteModel", controls: {} }) {
  const elements = Object.fromEntries(["renderModeSelect", "styleSelect", "promptAgentVersionSelect",
    "styleField", "promptAgentVersionField", "styleReferenceField", "configStatus", "promptAgentModelSelect"]
    .map((id) => [id, { value: "", options: [], hidden: false, classList: { toggle() {} } }]));
  elements.promptAgentModelSelect.value = "gemini3pro";
  const state = { featureMode: restoredPageState.featureMode, stylesConfig: config, styleReference: null,
    agentAccess: new Map([["gemini3pro", { selectable: true }]]), agentAccessChecked: true };
  const fillSelect = (select, options, current = "") => {
    select.options = options;
    select.value = String((options.find((option) => String(option.value) === String(current) && !option.disabled)
      || options.find((option) => !option.disabled))?.value ?? "");
  };
  const controller = createBetaDesignConfiguration({ elements, fillSelect, getState: () => state, restoredPageState });
  return { controller, elements, state };
}

test("Beta 第八功能提供空间图和补充要求，缺目标及旧智能默认均不可入队", () => {
  assert.equal(Object.keys(BETA_FEATURE_COPY).length, 8);
  assert.equal(BETA_FEATURE_COPY.styleTransfer.source, "待转换空间图");
  assert.equal(BETA_FEATURE_COPY.styleTransfer.prompt, "补充要求（可选）");
  for (const renderMode of ["", "smart-default", "style-dna"]) {
    assert.throws(() => betaStyleTransferSettings({ config, renderMode, promptAgentVersion: 7 }), /请选择平台风格/);
  }
  assert.throws(() => betaStyleTransferSettings({ config, renderMode: "style-reference", promptAgentVersion: 7 }), /请上传风格参考图/);
});

test("Beta 两路风格转换冻结各自 Agent 版本，缺失或失效版本阻断", () => {
  const platform = betaStyleTransferSettings({ config, renderMode: "style-dna", styleCode: style.code,
    promptAgentModelKey: "gemini3pro", promptAgentVersion: 7 });
  assert.equal(platform.styleTransferPromptAgentVersion, 7);
  assert.equal(platform.styleCode, style.code);
  assert.deepEqual(platform.styleReferenceImages, []);
  assert.equal("styleTransferReferenceVersion" in platform, false);
  const image = betaStyleTransferSettings({ config, renderMode: "style-reference", reference,
    promptAgentModelKey: "gemini3pro", promptAgentVersion: 7 });
  assert.equal(image.styleTransferReferenceVersion, 3);
  assert.equal(image.styleCode, undefined);
  assert.equal("styleTransferPromptAgentVersion" in image, false);
  assert.equal("smartDefaultAgentVersion" in image, false);
  assert.throws(() => betaStyleTransferSettings({ config, renderMode: "style-dna", styleCode: style.code,
    promptAgentVersion: 5 }), /风格转换融合 Agent 版本不可用/);
  assert.throws(() => betaStyleTransferSettings({ config: { ...config, styleTransfer: {
    ...config.styleTransfer, reference: { available: true, version: null },
  } }, renderMode: "style-reference", reference }), /参考图 Agent 版本不可用/);
});

test("Beta 下拉不继承白模风格或自动首项，参考图上传锁平台并在删除后清空目标", () => {
  const { controller, elements, state } = fixture({ featureMode: "whiteModel", controls: {
    renderMode: "style-dna", styleCode: style.code, promptAgentVersion: "5",
  } });
  controller.render();
  assert.equal(elements.styleSelect.value, style.code);
  state.featureMode = "styleTransfer";
  controller.render();
  assert.equal(elements.renderModeSelect.value, "");
  assert.equal(elements.styleSelect.value, "");
  assert.equal(elements.renderModeSelect.options.some((option) => option.value === "smart-default"), false);
  assert.equal(controller.ready(), false);
  assert.match(elements.configStatus.textContent, /请选择平台风格/);
  elements.renderModeSelect.value = "style-dna";
  controller.render();
  assert.equal(elements.styleSelect.value, "");
  elements.styleSelect.value = style.code;
  assert.equal(controller.ready(), true);
  state.styleReference = reference;
  controller.referenceChanged();
  assert.equal(elements.renderModeSelect.value, "style-reference");
  assert.equal(elements.renderModeSelect.options.find((option) => option.value === "style-dna").disabled, true);
  assert.equal(elements.styleSelect.disabled, true);
  assert.equal(controller.settings().styleTransferReferenceVersion, 3);
  state.styleReference = null;
  controller.referenceChanged();
  assert.equal(elements.renderModeSelect.value, "");
  assert.equal(elements.styleSelect.value, "");
  assert.equal(controller.ready(), false);
  state.featureMode = "whiteModel";
  controller.render();
  assert.equal(elements.renderModeSelect.value, "style-dna");
  assert.equal(elements.styleSelect.value, style.code);
});

test("Beta 恢复参考图模式但不保存图片，重新上传前阻断，八功能样本选择完整往返", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const sampleSetIds = Object.fromEntries(Object.keys(BETA_FEATURE_COPY).map((feature) => [feature, `SET-${feature}`]));
  const previous = fixture({ featureMode: "styleTransfer", controls: {} });
  previous.state.styleReference = reference;
  previous.controller.referenceChanged();
  saveBetaPageState(storage, { featureMode: "styleTransfer", sampleSetIds, controls: {
    renderMode: previous.elements.renderModeSelect.value, ...previous.controller.snapshot(),
  } });
  const restored = readBetaPageState(storage);
  assert.equal(restored.featureMode, "styleTransfer");
  assert.deepEqual(restored.sampleSetIds, sampleSetIds);
  assert.equal(restored.controls.renderMode, "style-reference");
  assert.equal(restored.controls.styleTransferReferenceVersion, "3");
  assert.equal(restored.controls.styleTransferPromptAgentVersion, "7");
  const { controller, elements, state } = fixture(restored);
  controller.render();
  assert.equal(elements.renderModeSelect.value, "style-reference");
  assert.equal(controller.ready(), false);
  assert.throws(() => controller.settings(), /请上传风格参考图/);
  assert.equal(controller.snapshot().styleTransferRenderMode, "style-reference");
  state.styleReference = reference;
  controller.referenceChanged();
  assert.equal(controller.ready(), true);
});

test("多个风格转换样本和模型只共享一份参考图，主图按样本 ID 留给服务端读取", () => {
  const input = betaStyleTransferSettings({ config, renderMode: "style-reference", reference });
  const items = ["SAMPLE-1", "SAMPLE-2"].flatMap((sampleId) => ["banana2", "seedream5"].map((modelKey) => ({
    sampleId, modelKey, input: { ...input, featureMode: "styleTransfer", referenceImages: [] },
  })));
  const packed = packBatchAssets(items, "styleTransfer");
  assert.deepEqual(packed.assets, { "shared-style": [reference] });
  assert.equal(packed.items.length, 4);
  for (const item of packed.items) {
    assert.equal(item.styleReferenceAssetKey, "shared-style");
    assert.equal(item.referenceAssetKey, undefined);
    assert.equal(item.input.styleTransferReferenceVersion, 3);
    assert.equal("styleReferenceImages" in item.input, false);
    assert.equal("referenceImages" in item.input, false);
  }
});
